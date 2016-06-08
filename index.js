var postcss = require('postcss');
var postcssUrl = require("postcss-url");
var uglify = require('uglify-js');
var autoprefixer = require('autoprefixer');
var csswring = require('csswring');
var jsdom = require('jsdom').jsdom;
var debug = require('debug')('bundledom');

var fs = require('fs');
var Path = require('path');
var URL = require('url');

module.exports = bundledom;

function bundledom(path, opts) {
	opts = Object.assign({
		prepend: [],
		append: [],
		exclude: []
	}, opts);
	var output;
	return loadDom(path).then(function(doc) {
		return processScripts(doc, opts).then(function(js) {
			output = js;
			return doc;
		});
	}).then(function(doc) {
		return processStylesheets(doc, opts).then(function(css) {
			output += '\n(' + function() {
				var sheet = document.createElement('style');
				sheet.type = 'text/css';
				sheet.textContent = CSS;
				document.head.appendChild(sheet);
			}.toString().replace('CSS', JSON.stringify(css)) + ')();';
			return doc;
		});
	}).then(function(doc) {
		return processImports(doc, opts).then(function(imports) {
			output += imports;
			return doc;
		});
	}).then(function(doc) {
		var p = Promise.resolve(output);
		if (opts.serialize) {
			p = p.then(function() {
				var serializePath = getRelativePath(doc, opts.serialize);
				return new Promise(function(resolve, reject) {
					fs.writeFile(serializePath, doc.documentElement.outerHTML, function(err) {
						if (err) reject(err);
						else {
							if (opts.cli) console.warn("Serialize", serializePath);
							resolve();
						}
					});
				});
			});
		}
		if (opts.output) {
			p = p.then(function() {
				return new Promise(function(resolve, reject) {
					var outputPath = getRelativePath(doc, opts.output);
					fs.writeFile(outputPath, output, function(err) {
						if (err) reject(err);
						else {
							if (opts.cli) console.warn("Output", outputPath);
							resolve();
						}
					});
				});
			});
		}
		return p;
	});
}

function getRelativePath(doc, path) {
	var dir = Path.dirname(URL.parse(doc.baseURI).pathname);
	if (path) return Path.join(dir, path);
	else return dir;
}

function processImports(doc, opts) {
	var path = URL.parse(doc.baseURI).pathname;
	var docRoot = Path.dirname(path);
	var astRoot = [];
	return Promise.all(doc.queryAll('head > link[href][rel="import"]').map(function(node) {
		var src = node.getAttribute('href');
		if (exclude(src, opts.exclude)) return;
		removeNodeSpace(node);
		src = Path.join(docRoot, src);
		return loadDom(src).then(function(idoc) {
			// limited Link rel=import support: only inline <script> and <style> are supported
			var textStyle = idoc.queryAll('style').map(function(node) {
				node.remove();
				return node.textContent;
			}).join('\n');
			var astCss = postcss.parse(textStyle, {
				from: src,
				//safe: true
			});
			var plugins = [
				postcssUrl({
					url: "rebase"
				}),
				autoprefixer()
			];
			if (!opts.concatenate) plugins.push(csswring({preserveHacks: true}));
			return postcss(plugins).process(astCss, {to: path + '.css'}).then(function(result) {
				return result.css;
			}).then(function(textStyle) {
				var textScript = idoc.queryAll('script')
					.filter(node => !node.type || node.type == "text/javascript")
					.map(function(node) {
						node.remove();
						return node.textContent;
					}).join('\n');
				if (textStyle) {
					textScript += '\n(' + function(css) {
						var sheet = document.createElement('style');
						sheet.type = 'text/css';
						sheet.textContent = css;
						document.head.appendChild(sheet);
					}.toString() + ')(' + JSON.stringify(textStyle) + ');';
				}

				var html = idoc.body.innerHTML;
				var importScript = '\n(' +
				function(html, style) {
					var ownDoc = document.implementation && document.implementation.createHTMLDocument
						? document.implementation.createHTMLDocument('')
						: document.createElement('iframe').contentWindow.document;
					ownDoc.body.innerHTML = html;
					document._currentScript = {
						ownerDocument: ownDoc
					};
					SCRIPT
				}.toString().replace('SCRIPT', textScript)
				+ ')(' + JSON.stringify(html.replace(/[\t\n]*/g, '')) + ', ' + JSON.stringify(textStyle) + ');';
				if (!opts.concatenate) {
					var astJs = uglify.parse(importScript, {filename: src});
					astJs.figure_out_scope();
					astJs.transform(uglify.Compressor());
					astJs.compute_char_frequency();
					astJs.mangle_names();
					astRoot.push(astJs.print_to_string());
				} else {
					astRoot.push(importScript);
				}
			});
		});
	})).then(function() {
		return astRoot.join('\n');
	});
}

function processScripts(doc, opts) {
	var docRoot = getRelativePath(doc);
	var astRoot;
	if (opts.output) {
		opts.append.unshift(opts.output);
		opts.exclude.unshift(opts.output);
	}
	var allScripts = doc.queryAll('head > script[src]');
	prependToPivot(allScripts, opts.prepend, 'script', 'src', 'js');
	appendToPivot(allScripts, opts.append, 'script', 'src', 'js');

	var p = Promise.resolve();
	allScripts.forEach(function(node) {
		var src = node.getAttribute('src');
		if (exclude(src, opts.exclude)) return;
		removeNodeSpace(node);
		src = Path.join(docRoot, src);
		p = p.then(function() {
			return readFile(src);
		}).then(function(data) {
			var ast = uglify.parse(data.toString(), {filename: src, toplevel: astRoot});
			if (!astRoot) astRoot = ast;
		});
	});
	return p.then(function() {
		astRoot.figure_out_scope();
		if (!opts.concatenate) {
			astRoot.transform(uglify.Compressor());
			astRoot.compute_char_frequency();
			astRoot.mangle_names();
		}
		var source_map = uglify.SourceMap();
		return astRoot.print_to_string({source_map: source_map});
	});
}

function processStylesheets(doc, opts) {
	var path = URL.parse(doc.baseURI).pathname;
	var docRoot = Path.dirname(path);
	var astRoot;
	var p = Promise.resolve();
	doc.queryAll('head > link[href][rel="stylesheet"]').forEach(function(node) {
		var src = node.getAttribute('href');
		if (exclude(src, opts.exclude)) return;
		removeNodeSpace(node);
		src = Path.join(docRoot, src);
		p = p.then(function() {
			return readFile(src);
		}).then(function(data) {
			var ast = postcss.parse(data.toString(), {
				from: src,
				//safe: true
			});
			if (!astRoot) astRoot = ast;
			else astRoot.push(ast);
		});
	});
	return p.then(function() {
		var plugins = [
			postcssUrl({url: "rebase"}),
			autoprefixer()
		];
		if (!opts.concatenate) plugins.push(csswring({preserveHacks: true}));
		return postcss(plugins).process(astRoot, {to: path + '.css'}).then(function(result) {
			return result.css;
		});
	});
}

function exclude(src, list) {
	if (!list) return;
	var found = list.some(function(str) {
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
	var cur = node.previousSibling;
	while (cur && cur.nodeType == 3) {
		str = cur.nodeValue + str;
		cur = cur.previousSibling;
	}
	return node.ownerDocument.createTextNode(str);
}

function prependToPivot(scripts, list, tag, att, ext) {
	var pivot = scripts[0];
	if (!pivot) {
		console.error("Cannot prepend before no node", tag, att, ext);
		return;
	}
	var textNode = spaceBefore(pivot);
	filterByExt(list, ext).forEach(function(src) {
		var node = pivot.ownerDocument.createElement(tag);
		node[att] = src;
		pivot.before(node);
		pivot.before(textNode.cloneNode());
		scripts.unshift(node);
		debug("prepended", tag, att, src);
	});
}

function appendToPivot(scripts, list, tag, att, ext) {
	var pivot = scripts.slice(-1)[0];
	if (!pivot) {
		console.error("Cannot append after no node", tag, att, ext);
		return;
	}
	var textNode = spaceBefore(pivot);
	list = filterByExt(list, ext);
	while (list.length) {
		var src = list.pop();
		var node = pivot.ownerDocument.createElement(tag);
		node[att] = src;
		pivot.after(node);
		pivot.after(textNode.cloneNode());
		scripts.push(node);
		debug("appended", tag, att, src);
	}
}

function loadDom(path) {
	return readFile(path).then(function(data) {
		var doc = jsdom(data, {
			url: 'file://' + Path.resolve(path),
			features: {
				FetchExternalResources: [],
				ProcessExternalResources: []
			}
		});
		var win = doc.defaultView;
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
		return doc;
	});
}

function readFile(path) {
	return new Promise(function(resolve, reject) {
		fs.readFile(path, function(err, data) {
			if (err) reject(err);
			resolve(data);
		});
	});
}

