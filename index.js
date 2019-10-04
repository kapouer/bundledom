var debug = require('debug')('bundledom');

var postcss = require('postcss');
var postcssUrl = require("postcss-url");
var postcssImport = require('postcss-import');
var postcssFlexBugs = require('postcss-flexbugs-fixes');
var babel = require("@babel/core");
var presetEnv = require.resolve('@babel/preset-env');
var presetMinify = require.resolve('babel-preset-minify');
var pluginRuntime = require.resolve('@babel/plugin-transform-runtime');
var autoprefixer = require('autoprefixer');
var cssnano = require('cssnano');
var reporter = require('postcss-reporter');
var jsdom = require('jsdom');
var mkdirp = require('mkdirp');

var fs = require('fs');
var Path = require('path');
var URL = require('url');
var got = require('got');
var minimatch = require("minimatch");

module.exports = bundledom;

function bundledom(path, opts, cb) {
	opts = Object.assign({
		remotes: [],
		prepend: [],
		append: [],
		exclude: [],
		ignore: []
	}, opts);

	var babelOpts = {
		presets: [
			[presetEnv, {
				modules: false
			}]
		],
		plugins: [[pluginRuntime, { corejs: false, helpers: false, regenerator: false}]],
		sourceMaps: false,
		compact: false
	};

	if (opts.minify !== false || !opts.concatenate) {
		babelOpts.presets.push([presetMinify, {
			builtIns: false // https://github.com/babel/minify/issues/904
		}]);
		babelOpts.comments = false;
	}
	opts.babel = babelOpts;

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
			} else {
				var cssPath = getRelativePath(doc, opts.css);
				return writeFile(cssPath, data.css).then(function() {
					if (opts.cli) console.warn(opts.css);
					if (data.cssmap) {
						var cssMapPath = cssPath + '.map';
						return writeFile(cssMapPath, data.cssmap).then(function() {
							if (opts.cli) console.warn(opts.css + ".map");
						});
					}
				});
			}
		}).then(function() {
			var html = jsdom.serializeDocument(doc);
			var p = Promise.resolve();
			if (opts.html) {
				p = p.then(function() {
					var htmlPath = getRelativePath(doc, opts.html);
					return writeFile(htmlPath, html).then(function() {
						if (opts.cli) console.warn(opts.html);
					});
				});
			} else {
				data.html = html;
			}
			if (opts.js) {
				p = p.then(function() {
					var jsPath = getRelativePath(doc, opts.js);
					return writeFile(jsPath, data.js).then(function() {
						if (opts.cli) console.warn(opts.js);
						if (data.jsmap) {
							var jsMapPath = jsPath + '.map';
							return writeFile(jsMapPath, data.jsmap).then(function() {
								if (opts.cli) console.warn(opts.js + ".map");
							});
						}
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
		jsmap: "",
		cssmap: ""
	});
	if (!data.js) data.js = "";
	if (!data.css) data.css = "";
	var p = Promise.resolve();
	return p.then(function() {
		return processCustom(doc, opts, data);
	}).then(function() {
		return prepareImports(doc, opts, data);
	}).then(function() {
		return processScripts(doc, opts, data).then(function(obj) {
			if (obj.str) data.js += obj.str;
			if (obj.map) data.jsmap += obj.map;
		});
	}).then(function() {
		return processStylesheets(doc, opts, data).then(function(obj) {
			if (obj.css) data.css += obj.css;
			if (obj.map) data.cssmap += obj.map;
		});
	}).then(function() {
		return data;
	});
}

function processCustom(doc, opts, data) {
	if (opts.custom) return opts.custom(doc, opts, data);
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

		if (opts.root && src.startsWith('/')) {
			src = Path.join(opts.root, src);
		} else {
			src = Path.join(docRoot, src);
		}

		return loadDom(src, Path.dirname(src)).then(function(idoc) {
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
					if (!document._currentScript) document._currentScript = {};
					document._currentScript.parentOwner = (document.currentScript || document._currentScript).ownerDocument;
					document._currentScript.ownerDocument = document.implementation.createHTMLDocument("");
					try {
						document._currentScript.ownerDocument.documentElement.innerHTML = html;
					} catch(ex) {
						// IE < 10 fallback
						document._currentScript.ownerDocument.body.innerHTML = html;
					}
					SCRIPT
					document._currentScript.ownerDocument = document._currentScript.parentOwner;
					delete document._currentScript.parentOwner;
				}.toString().replace("SCRIPT", function() {
					return data.js;
				});
				iscript = '\n(' + iscript + ')(' +
					JSON.stringify(idoc.documentElement.innerHTML)
					+ ');';
				createSibling(node, 'before', 'script').textContent = iscript;
				if (data.css) {
					createSibling(node, 'before', 'style').textContent = data.css;
				}
				removeNodeAndSpaceBefore(node);
			});
		});
	}));
}

function processScripts(doc, opts, data) {
	var docRoot = getRelativePath(doc);
	if (opts.js) {
		opts.append.unshift(opts.js);
		opts.ignore.unshift(opts.js);
	}
	var allScripts = doc.queryAll('script').filter(function(node) {
		var src = node.getAttribute('src');
		if (src && filterRemotes(src, opts.remotes) == 0) return false;
		return !node.type || node.type == "text/javascript";
	});
	prependToPivot(allScripts, opts.prepend, 'script', 'src', 'js');
	appendToPivot(allScripts, opts.append, 'script', 'src', 'js');

	return Promise.all(allScripts.map(function(node) {
		var p = Promise.resolve();
		var src = node.getAttribute('src');
		if (src) {
			if (filterByName(src, opts.ignore)) {
				return;
			}
			if (filterByName(src, opts.exclude)) {
				removeNodeAndSpaceBefore(node);
				return;
			}
			data.scripts.push(src);

			if (filterRemotes(src, opts.remotes) == 1) {
				if (src.startsWith('//')) src = "https:" + src;
				p = p.then(function() {
					return got(src).then(function(response) {
						return response.body.toString();
					});
				});
			} else {
				if (opts.root && src.startsWith('/')) {
					src = Path.join(opts.root, src);
				} else {
					src = Path.join(docRoot, src);
				}
				p = p.then(function() {
					return readFile(src);
				});
			}
		} else if (node.textContent) {
			if (~opts.ignore.indexOf('.')) {
				return;
			}
			if (~opts.exclude.indexOf('.')) {
				removeNodeAndSpaceBefore(node);
				return;
			}
			src = doc.baseURI;
			p = p.then(function() {
				return node.textContent;
			});
		} else {
			return;
		}
		removeNodeAndSpaceBefore(node);
		return p.then(function(data) {
			var code = data.replace(/# sourceMappingURL=.+$/gm, "");
			var str = babel.transform(code, opts.babel).code;
			if (opts.iife) str = '(function() {\n' + str + '\n})();\n';
			return str;
		});
	})).then(function(list) {
		return {
			str: list.filter(function(str) {
				return !!str;
			}).join('')
		};
	});
}

function processStylesheets(doc, opts, data) {
	var path = URL.parse(doc.baseURI).pathname;
	var pathExt = Path.extname(path);
	var docRoot = Path.dirname(path);
	path = Path.join(docRoot, Path.basename(path, pathExt));
	if (opts.css) {
		opts.append.unshift(opts.css);
		opts.ignore.unshift(opts.css);
	}

	var allLinks = doc.queryAll('link[href][rel="stylesheet"],style').filter(function(node) {
		var src = node.getAttribute('href');
		if (src && filterRemotes(src, opts.remotes) == 0) return false;
		return true;
	});

	prependToPivot(allLinks, opts.prepend, 'link', 'href', 'css', {rel: "stylesheet"});
	appendToPivot(allLinks, opts.append, 'link', 'href', 'css', {rel: "stylesheet"});

	return Promise.all(allLinks.map(function(node) {
		var src = node.getAttribute('href');
		if (src) {
			if (filterByName(src, opts.ignore)) {
				return "";
			}
			removeNodeAndSpaceBefore(node);
			if (filterByName(src, opts.exclude)) {
				return "";
			}
			data.stylesheets.push(src);
			if (filterRemotes(src, opts.remotes) == 1) {
				if (src.startsWith('//')) src = "https:" + src;
				return got(src).then(function(response) {
					return response.body.toString();
				});
			} else {
				if (opts.root && src.startsWith('/')) {
					src = Path.relative(docRoot, Path.join(opts.root, src));
				}
				return `@import url("${src}");`;
			}
		} else if (node.textContent) {
			if (~opts.ignore.indexOf('.')) {
				return "";
			}
			removeNodeAndSpaceBefore(node);
			if (~opts.exclude.indexOf('.')) {
				return "";
			}
			return node.textContent;
		}
	})).then(function(all) {
		var data = all.filter(function(str) {
			return !!str;
		}).join("\n");

		var plugins = [
			postcssImport({
				plugins: [postcssUrl({url: postcssRebase})]
			}),
			postcssUrl({url: postcssRebase}),
			postcssFlexBugs,
			autoprefixer()
		];
		if (opts.minify !== false || !opts.concatenate) {
			plugins.push(cssnano({
				preset: ['default', {
					discardComments: {
						removeAll: true
					}
				}]
			}));
		}
		plugins.push(reporter);
		return postcss(plugins).process(data, {
			from: path,
			to: path + '.css',
			map: {
				inline: false
			}
		});
	});
}

function postcssRebase(asset) {
	if (!asset.pathname) return;
	return asset.relativePath;
}

function getRelativePath(doc, path) {
	var dir = Path.dirname(URL.parse(doc.baseURI).pathname);
	if (path) return Path.join(dir, path);
	else return dir;
}

function filterRemotes(src, remotes) {
	// return -1 for not remote
	// return 0 for undownloadable remote
	// return 1 for downloadable remote
	if (src.startsWith('//')) src = 'https:' + src;
	var host = URL.parse(src).host;
	if (!host) return -1;
	if (!remotes) return 0;
	if (remotes.some(function(rem) {
		if (host.indexOf(rem) >= 0) return true;
	})) return 1;
	else return 0;
}

function filterByName(src, list) {
	if (!list) return;
	var found = list.some(function(str) {
		if (str == ".") return false;
		if (str.indexOf('*') >= 0) return minimatch(src, str);
		else return ~src.indexOf(str);
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

function removeNodeAndSpaceBefore(node) {
	var cur = node.previousSibling;
	while (cur && cur.nodeType == 3 && /^\s*$/.test(cur.nodeValue)) {
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

