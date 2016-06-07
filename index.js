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

function bundledom(path) {
	var output;
	return loadDom(path).then(function(doc) {
		return processScripts(doc).then(function(js) {
			output = js;
			return doc;
		});
	}).then(function(doc) {
		return processStylesheets(doc).then(function(css) {
			output += '\n(' + function() {
				var sheet = document.createElement('style');
				sheet.type = 'text/css';
				sheet.textContent = CSS;
				document.head.appendChild(sheet);
			}.toString().replace('CSS', JSON.stringify(css)) + ')();';
			return doc;
		});
	}).then(function(doc) {
		return processImports(doc).then(function(imports) {
			output += imports;
			return doc;
		});
	}).then(function() {
		return output;
	});
}

function processImports(doc) {
	var path = URL.parse(doc.baseURI).pathname;
	var docRoot = Path.dirname(path);
	var astRoot = [];
	return Promise.all(doc.queryAll('head > link[href][rel="import"]').map(function(node) {
		var src = Path.join(docRoot, node.getAttribute('href'));
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
				autoprefixer(),
				csswring({preserveHacks: true})
			];
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
					}.toString() + '(' + JSON.stringify(textStyle) + ')';
				}

				var html = idoc.body.innerHTML;
				var importScript = '(' +
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
				+ ')(' + JSON.stringify(html.replace(/[\t\n]*/g, '')) + ', ' + JSON.stringify(textStyle) + ')';

				var astJs = uglify.parse(importScript, {filename: src});
				astJs.figure_out_scope();
				astJs.transform(uglify.Compressor());
				astJs.compute_char_frequency();
				astJs.mangle_names();
				astRoot.push(astJs.print_to_string());
			});
		});
	})).then(function() {
		return astRoot.join('\n');
	});
}

function processScripts(doc) {
	var docRoot = Path.dirname(URL.parse(doc.baseURI).pathname);
	var astRoot;
	return Promise.all(doc.queryAll('head > script[src]').map(function(node) {
		var src = Path.join(docRoot, node.getAttribute('src'));
		return readFile(src).then(function(data) {
			var ast = uglify.parse(data.toString(), {filename: src, toplevel: astRoot});
			if (!astRoot) astRoot = ast;
		});
	})).then(function() {
		astRoot.figure_out_scope();
		astRoot.transform(uglify.Compressor());
		astRoot.compute_char_frequency();
		astRoot.mangle_names();
		var source_map = uglify.SourceMap();
		return astRoot.print_to_string({source_map: source_map});
	});
}

function processStylesheets(doc) {
	var path = URL.parse(doc.baseURI).pathname;
	var docRoot = Path.dirname(path);
	var astRoot;
	return Promise.all(doc.queryAll('head > link[href][rel="stylesheet"]').map(function(node) {
		var src = Path.join(docRoot, node.getAttribute('href'));
		return readFile(src).then(function(data) {
			var ast = postcss.parse(data.toString(), {
				from: src,
				//safe: true
			});
			if (!astRoot) astRoot = ast;
			else astRoot.push(ast);
		});
	})).then(function() {
		var plugins = [
			postcssUrl({url: "rebase"}),
			autoprefixer(),
			csswring({preserveHacks: true})
		];
		return postcss(plugins).process(astRoot, {to: path + '.css'}).then(function(result) {
			return result.css;
		});
	});
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

