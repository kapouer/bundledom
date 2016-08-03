#!/usr/bin/node

console.log("TODO take a list of files that go in common libs and build all html from that");

var glob = require('glob');
var Path = require('path');

var bd = require('bundledom');
var version = require('../package.json').version;

var common = {
	js: `bundles/common-${version}.js`,
	css: `bundles/common-${version}.css`
};
var exclude = [];
var prepend = [common.css, common.js];
var ignore = [common.css, common.js];

var p = bd('public/common.html', common);

p = p.then(function(data) {
	exclude = exclude.concat(data.scripts).concat(data.stylesheets);
});

p = p.then(function() {
	return new Promise(function(resolve, reject) {
		glob("public/**/*.html", {
			ignore: ["public/bundles/**", "public/admin.html", "public/common.html"]
		}, function(err, files) {
			if (err) reject(err);
			else resolve(files);
		});
	});
}).then(function(files) {
	return Promise.all(files.filter(function(file) {
		console.log(file);
		// useful for debugging
		// return file == "public/index.html" || file == "public/header.html";
		return true;
	}).map(function(file) {
		var dir = Path.join('bundles', Path.relative('public', Path.dirname(file)));
		var base = Path.basename(file, '.html');
		var opts = {
			exclude: exclude,
			prepend: prepend,
			ignore: ignore,
			js: Path.join(dir, base + '-' + version + '.js'),
			css: Path.join(dir, base + '-' + version + '.css'),
			html: Path.join(dir, base + '.html')
		};
		if (dir != 'bundles') opts.root = "public";
		return bd(file, opts);
	}));
}).then(function(all) {
	console.log(`Processed ${all.length} files`);
}).catch(function(err) {
	console.error(err);
});
