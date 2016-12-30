var debug = require('debug')('bundledom');

var postcss = require('postcss');
var postcssUrl = require("postcss-url");
var postcssImport = require('postcss-easy-import');
var uglify = require('uglify-js');
var autoprefixer = require('autoprefixer');
var csswring = require('csswring');
var jsdom = require('jsdom');
var mkdirp = require('mkdirp');

var fs = require('fs');
var Path = require('path');
var URL = require('url');
var got = require('got');

module.exports = bundledom;

function bundledom(path, opts, cb) {
	opts = Object.assign({
		prepend: [],
		append: [],
		exclude: [],
		ignore: []
	}, opts);
	var p = loadDom(path, opts.root).then(function(doc) {
		var data = {};
		return processDocument(doc, opts, data).then(function() {
			if (!opts.css) {
				data.js += '\n(' + function() {
					var sheet = document.createElement('style');
					sheet.type = 'text/css';
					sheet.textContent = CSS;
					document.head.appendChild(sheet);
				}.toString().replace('CSS', function() {
					return JSON.stringify(data.css);
				}) + ')();';
				return data;
			} else {
				var cssPath = getRelativePath(doc, opts.css);
				return writeFile(cssPath, data.css).then(function() {
					if (opts.cli) console.warn("css saved to", cssPath);
					return data;
				});
			}
		}).then(function(data) {
			var html = jsdom.serializeDocument(doc);
			var p = Promise.resolve();
			if (opts.html) {
				p = p.then(function() {
					var htmlPath = getRelativePath(doc, opts.html);
					return writeFile(htmlPath, html).then(function() {
						if (opts.cli) console.warn("html saved to", htmlPath);
					});
				});
			} else {
				data.html = html;
			}
			if (opts.js) {
				p = p.then(function() {
					var jsPath = getRelativePath(doc, opts.js);
					return writeFile(jsPath, data.js).then(function() {
						if (opts.cli) console.warn("js saved to", jsPath)
					});
				});
			}
			return p.then(function() {
				if (cb) cb(null, data);
				return data;
			});
		});
	});
	if (cb) p = p.catch(cb);
	else return p;
}

function processDocument(doc, opts, data) {
	Object.assign(data, {
		imports: [],
		scripts: [],
		stylesheets: [],
		js: "",
		css: ""
	});
	return prepareImports(doc, opts, data).then(function() {
		return processScripts(doc, opts, data).then(function(str) {
			if (str) data.js += str;
		});
	}).then(function() {
		return processStylesheets(doc, opts, data).then(function(str) {
			if (str) data.css += str;
		});
	}).then(function() {
		return data;
	});
}

function prepareImports(doc, opts, data) {
	var path = URL.parse(doc.baseURI).pathname;
	var docRoot = Path.dirname(path);

	var allLinks = doc.queryAll('link[href][rel="import"]');

	prependToPivot(allLinks, opts.prepend, 'link', 'href', 'html', {rel: "import"});
	appendToPivot(allLinks, opts.append, 'link', 'href', 'html', {rel: "import"});

	// the order is not important
	return Promise.all(allLinks.map(function(node) {
		var src = node.getAttribute('href');
		if (filterByName(src, opts.ignore)) {
			return;
		}
		if (filterByName(src, opts.exclude)) {
			node.remove();
			return;
		}
		data.imports.push(src);
		src = Path.join(docRoot, src);
		return loadDom(src, opts.root).then(function(idoc) {
			var iopts = Object.assign({}, opts, {
				append: [],
				prepend: [],
				exclude: [],
				ignore: [],
				css: null,
				js: null
			});
			return processDocument(idoc, iopts, {}).then(function(data) {
				// make sure no variable can leak to SCRIPT
				var iscript = function(html) {
					if (!document._currentScript) document._currentScript = {
						parentOwner: document.currentScript && document.currentScript.ownerDocument
					};
					else document._currentScript.parentOwner = document._currentScript.ownerDocument;
					document._currentScript.ownerDocument =
						document.implementation && document.implementation.createHTMLDocument
						? document.implementation.createHTMLDocument('')
						: document.createElement('iframe').contentWindow.document;
					document._currentScript.ownerDocument.documentElement.innerHTML = html;
					SCRIPT
					document._currentScript.ownerDocument = document._currentScript.parentOwner;
					delete document._currentScript.parentOwner;
				}.toString().replace("SCRIPT", function() {
					return data.js;
				});
				iscript = '\n(' + iscript + ')(' +
					JSON.stringify(idoc.documentElement.innerHTML.replace(/[\t\n]*/g, ''))
					+ ');';
				createSibling(node, 'before', 'script').textContent = iscript;
				if (data.css) {
					createSibling(node, 'before', 'style').textContent = data.css;
				}
				removeNodeSpace(node);
			});
		});
	}));
}

function processScripts(doc, opts, data) {
	var docRoot = getRelativePath(doc);
	var astRoot;
	if (opts.js) {
		opts.append.unshift(opts.js);
		opts.ignore.unshift(opts.js);
	}
	var allScripts = doc.queryAll('script').filter(function(node) {
		return !node.type || node.type == "text/javascript";
	});
	prependToPivot(allScripts, opts.prepend, 'script', 'src', 'js');
	appendToPivot(allScripts, opts.append, 'script', 'src', 'js');

	var p = Promise.resolve();
	allScripts.forEach(function(node, i) {
		var src = node.getAttribute('src');
		if (src) {
			if (filterRemotes(src)) return;
			if (filterByName(src, opts.ignore)) {
				return;
			}
			if (filterByName(src, opts.exclude)) {
				node.remove();
				return;
			}
			data.scripts.push(src);
			src = Path.join(docRoot, src);
			p = p.then(function() {
				return readFile(src);
			});
		} else if (node.textContent) {
			if (~opts.ignore.indexOf('.')) {
				return;
			}
			if (~opts.exclude.indexOf('.')) {
				node.remove();
				return;
			}
			src = doc.baseURI;
			p = p.then(function() {
				return node.textContent;
			});
		} else {
			return;
		}
		removeNodeSpace(node);
		p = p.then(function(data) {
			var ast = uglify.parse(data, {filename: src, toplevel: astRoot});
			if (!astRoot) astRoot = ast;
		});
	});
	return p.then(function() {
		return astRoot ? compressAst(astRoot, opts) : "";
	});
}

function processStylesheets(doc, opts, data) {
	var path = URL.parse(doc.baseURI).pathname;
	var docRoot = Path.dirname(path);
	var astRoot;
	if (opts.css) {
		opts.append.unshift(opts.css);
		opts.ignore.unshift(opts.css);
	}

	var allLinks = doc.queryAll('link[href][rel="stylesheet"],style');

	prependToPivot(allLinks, opts.prepend, 'link', 'href', 'css', {rel: "stylesheet"});
	appendToPivot(allLinks, opts.append, 'link', 'href', 'css', {rel: "stylesheet"});

	return Promise.all(allLinks.map(function(node) {
		var src = node.getAttribute('href');
		var p = Promise.resolve("");
		if (src) {
			if (filterByName(src, opts.ignore)) {
				return p;
			}
			if (filterByName(src, opts.exclude)) {
				node.remove();
				return p;
			}

			data.stylesheets.push(src);
			if (filterRemotes(src)) {
				if (src.startsWith('//')) src = "https:" + src;
				p = p.then(function() {
					return got(src).then(function(response) {
						return response.body.toString();
					});
				});
			} else {
				src = Path.join(docRoot, src);
				p = p.then(function() {
					return readFile(src);
				});
			}
		} else if (node.textContent) {
			if (~opts.ignore.indexOf('.')) {
				return;
			}
			if (~opts.exclude.indexOf('.')) {
				node.remove();
				return;
			}
			src = doc.baseURI;
			p = p.then(function() {
				return node.textContent;
			});
		} else {
			return p;
		}
		removeNodeSpace(node);

		var plugins = [
			postcssUrl({url: postcssRebase}),
			postcssImport,
			autoprefixer()
		];
		if (!opts.concatenate) plugins.push(csswring({preserveHacks: true}));

		return p.then(function(data) {
			try {
				return postcss(plugins).process(data, {
					from: src,
					to: path + '.css'
				}).then(function(result) {
					return result.css;
				});
			} catch(ex) {
				return Promise.reject(ex);
			}
		});
	})).then(function(results) {
		return results.join('\n');
	});
}

function postcssRebase(oldUrl, decl, from, dirname, to, options, result) {
	var urlObj = URL.parse(oldUrl);
	if (urlObj.protocol) return oldUrl;
	var newPath = oldUrl;
	if (dirname !== from) {
		newPath = Path.relative(from, Path.join(dirname, newPath));
	}
	newPath = Path.resolve(from, newPath);
	newPath = Path.relative(to, newPath);
	return '/' + newPath;
}

function compressAst(ast, opts) {
	ast.figure_out_scope();
	if (opts && !opts.concatenate) {
		ast.transform(uglify.Compressor());
		ast.compute_char_frequency();
		ast.mangle_names();
	}
	return ast.print_to_string({
//			source_map: uglify.SourceMap()
	}).replace(/^"use strict"/, "");
}

function getRelativePath(doc, path) {
	var dir = Path.dirname(URL.parse(doc.baseURI).pathname);
	if (path) return Path.join(dir, path);
	else return dir;
}

function filterRemotes(src) {
	return /^(https?:)?\/\//.test(src);
}

function filterByName(src, list) {
	if (!list) return;
	var found = list.some(function(str) {
		if (str == ".") return false;
		return ~src.indexOf(str);
	});
	if (found) debug("excluded", src);
	return found;
}

function filterByExt(list, ext) {
	if (!list) return [];
	ext = '.' + ext;
	return list.filter(function(src) {
		return Path.extname(URL.parse(src).pathname) == ext;
	});
}

function removeNodeSpace(node) {
	var cur = node.previousSibling;
	while (cur && cur.nodeType == 3) {
		cur.remove();
		cur = node.previousSibling;
	}
	node.remove();
}

function spaceBefore(node) {
	var str = "";
	var cur = node.previousSibling, val;
	while (cur && cur.nodeType == 3) {
		val = cur.nodeValue;
		var nl = /([\n\r]*[\s]*)/.exec(val);
		if (nl && nl.length == 2) {
			val = nl[1];
			nl = true;
		} else {
			nl = false;
		}
		str = val + str;
		if (nl) break;
		cur = cur.previousSibling;
	}
	return node.ownerDocument.createTextNode(str);
}

function createSibling(refnode, direction, tag, attrs) {
	var node = refnode.ownerDocument.createElement(tag);
	if (attrs) for (var name in attrs) node.setAttribute(name, attrs[name]);
	refnode[direction](node);
	refnode[direction](spaceBefore(refnode));
	return node;
}

function prependToPivot(scripts, list, tag, att, ext, attrs) {
	list = filterByExt(list, ext);
	if (!list.length) return;
	var pivot = scripts[0];
	if (!pivot) {
		console.error("Missing node to prepend to", list);
		return;
	}
	attrs = Object.assign({}, attrs);
	list.forEach(function(src) {
		attrs[att] = src;
		scripts.unshift(createSibling(pivot, 'before', tag, attrs));
		debug("prepended", tag, att, src);
	});
}

function appendToPivot(scripts, list, tag, att, ext, attrs) {
	list = filterByExt(list, ext);
	if (!list.length) return;
	var pivot = scripts.slice(-1)[0];
	if (!pivot) {
		console.error("Missing node to append to", list);
		return;
	}
	attrs = Object.assign({}, attrs);
	while (list.length) {
		var src = list.pop();
		attrs[att] = src;
		scripts.push(createSibling(pivot, 'after', tag, attrs));
		debug("appended", tag, att, src);
	}
}

function loadDom(path, basepath) {
	if (!basepath) basepath = path;
	else basepath = Path.join(basepath, Path.basename(path));
	return readFile(path).then(function(data) {
		return new Promise(function(resolve, reject) {
			jsdom.jsdom(data, {
				url: 'file://' + Path.resolve(basepath),
				features: {
					FetchExternalResources: [],
					ProcessExternalResources: []
				},
				created: function(err, win) {
					if (err) return reject(err);
					var doc = win.document;
					doc.query = function(sel) {
						return doc.querySelector(sel);
					};
					doc.queryAll = function(sel) {
						return Array.from(doc.querySelectorAll(sel));
					};
					win.Node.prototype.before = function(node) {
						this.parentNode.insertBefore(node, this);
					};
					win.Node.prototype.after = function(node) {
						if (this.nextSibling) this.parentNode.insertBefore(node, this.nextSibling);
						else this.parentNode.appendChild(node);
					};
					resolve(doc);
				}
			});
		});
	});
}

function readFile(path) {
	return new Promise(function(resolve, reject) {
		fs.readFile(path, function(err, data) {
			if (err) reject(err);
			else resolve(data.toString());
		});
	});
}

function writeFile(path, data) {
	return new Promise(function(resolve, reject) {
		mkdirp(Path.dirname(path), function(err) {
			if (err) return reject(err);
			fs.writeFile(path, data, function(err) {
				if (err) reject(err);
				else resolve();
			});
		});
	});
}

