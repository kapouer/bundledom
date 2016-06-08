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
	var jsBundle = "", cssBundle = "";
	return loadDom(path).then(function(doc) {
		processScripts(doc, opts).then(function(str) {
			jsBundle += str;
		}).then(function() {
			return processImports(doc, opts);
		}).then(function(results) {
			jsBundle += results.js;
			cssBundle += results.css;
		}).then(function() {
			return processStylesheets(doc, opts);
		}).then(function(str) {
			cssBundle += str;
		}).then(function() {
			if (!opts.css) {
				jsBundle += '\n(' + function() {
					var sheet = document.createElement('style');
					sheet.type = 'text/css';
					sheet.textContent = CSS;
					document.head.appendChild(sheet);
				}.toString().replace('CSS', JSON.stringify(cssBundle)) + ')();';
			} else {
				var cssPath = getRelativePath(doc, opts.css);
				return writeFile(cssPath, cssBundle).then(function() {
					if (opts.cli) console.warn("css saved to", cssPath);
				});
			}
		}).then(function() {
			var p = Promise.resolve();
			if (opts.html) {
				p = p.then(function() {
					var htmlPath = getRelativePath(doc, opts.html);
					return writeFile(htmlPath, doc.documentElement.outerHTML).then(function() {
						if (opts.cli) console.warn("html saved to", htmlPath);
					});
				});
			}
			if (opts.js) {
				p = p.then(function() {
					var jsPath = getRelativePath(doc, opts.js);
					return writeFile(jsPath, jsBundle).then(function() {
						if (opts.cli) console.warn("js saved to", jsPath)
					});
				});
			} else {
				p = p.then(function() {
					return jsBundle;
				});
			}
			return p;
		});
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
	var jsResults = [];
	var cssResults = [];
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
					url: postcssRebase
				}),
				autoprefixer()
			];
			if (!opts.concatenate) plugins.push(csswring({preserveHacks: true}));
			return postcss(plugins).process(astCss, {to: path + '.css'}).then(function(result) {
				cssResults.push(result.css);
			}).then(function() {
				var textScript = idoc.queryAll('script')
					.filter(node => !node.type || node.type == "text/javascript")
					.map(function(node) {
						node.remove();
						return node.textContent;
					}).join('\n');

				var html = idoc.body.innerHTML;
				var importScript = '\n(' +
				function(html) {
					var ownDoc = document.implementation && document.implementation.createHTMLDocument
						? document.implementation.createHTMLDocument('')
						: document.createElement('iframe').contentWindow.document;
					ownDoc.body.innerHTML = html;
					document._currentScript = {
						ownerDocument: ownDoc
					};
					SCRIPT
				}.toString().replace('SCRIPT', textScript)
				+ ')(' + JSON.stringify(html.replace(/[\t\n]*/g, '')) + ');';
				if (!opts.concatenate) {
					jsResults.push(compressAst(uglify.parse(importScript, {
						filename: src
					})));
				} else {
					jsResults.push(importScript);
				}
			});
		});
	})).then(function() {
		return {
			js: jsResults.join('\n'),
			css: cssResults.join('\n')
		};
	});
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

function processScripts(doc, opts) {
	var docRoot = getRelativePath(doc);
	var astRoot;
	if (opts.js) {
		opts.append.unshift(opts.js);
		opts.exclude.unshift(opts.js);
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
		return compressAst(astRoot, opts);
	});
}

function processStylesheets(doc, opts) {
	var path = URL.parse(doc.baseURI).pathname;
	var docRoot = Path.dirname(path);
	var astRoot;
	if (opts.css) {
		opts.append.unshift(opts.css);
		opts.exclude.unshift(opts.css);
	}
	var allLinks = doc.queryAll('head > link[href][rel="stylesheet"]');
	prependToPivot(allLinks, opts.prepend, 'link', 'href', 'css', {rel: "stylesheet"});
	appendToPivot(allLinks, opts.append, 'link', 'href', 'css', {rel: "stylesheet"});

	var p = Promise.resolve();
	allLinks.forEach(function(node) {
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
			postcssUrl({url: postcssRebase}),
			autoprefixer()
		];
		if (!opts.concatenate) plugins.push(csswring({preserveHacks: true}));
		return postcss(plugins).process(astRoot, {to: path + '.css'}).then(function(result) {
			return result.css;
		});
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

function prependToPivot(scripts, list, tag, att, ext, attrs) {
	var pivot = scripts[0];
	if (!pivot) {
		console.error("Cannot prepend before no node", tag, att, ext);
		return;
	}
	var textNode = spaceBefore(pivot);
	filterByExt(list, ext).forEach(function(src) {
		var node = pivot.ownerDocument.createElement(tag);
		node[att] = src;
		if (attrs) for (var name in attrs) node.setAttribute(name, attrs[name]);
		pivot.before(node);
		pivot.before(textNode.cloneNode());
		scripts.unshift(node);
		debug("prepended", tag, att, src);
	});
}

function appendToPivot(scripts, list, tag, att, ext, attrs) {
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
		if (attrs) for (var name in attrs) node.setAttribute(name, attrs[name]);
		pivot.after(node);
		pivot.after(textNode.cloneNode());
		scripts.push(node);
		debug("appended", tag, att, src);
	}
}

function loadDom(path) {
	return readFile(path).then(function(data) {
		return new Promise(function(resolve, reject) {
			jsdom(data, {
				url: 'file://' + Path.resolve(path),
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
			else resolve(data);
		});
	});
}

function writeFile(path, data) {
	return new Promise(function(resolve, reject) {
		fs.writeFile(path, data, function(err) {
			if (err) reject(err);
			else resolve();
		});
	});
}

