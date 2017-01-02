#!/usr/bin/node

var glob = require('glob');
var Path = require('path');

var bundledom = require('..');

var dash = require('dashdash');

var parser = dash.createParser({options: [
	{
		names: ['help', 'h'],
		type: 'bool',
		help: 'Print this help and exit.'
	},
	{
		names: ['common'],
		type: 'string',
		help: 'html file with common resources'
	},
	{
		names: ['ignore'],
		type: 'arrayOfString',
		help: 'files to ignore from glob'
	},
	{
		names: ['public'],
		type: 'string',
		help: 'root public dir',
		default: 'public'
	},
	{
		names: ['bundles'],
		type: 'string',
		help: 'bundle dir relative to root dir',
		default: 'bundles'
	},
	{
		names: ['concatenate', 'c'],
		type: 'bool',
		help: 'do not minify'
	},
	{
		names: ['custom'],
		type: 'string',
		help: 'custom module for dom modifications'
	}
]});

var opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

var customPlugin = opts.custom && require(opts.custom);

var globPattern = opts._args && opts._args.pop();

if (opts.help || !globPattern) {
	var help = parser.help({includeEnv: true}).trimRight();
	console.log(`usage: bundle --ignore google-*.html --common common.html **/*.html\n${help}`);
	process.exit(0);
}

var exclude = [];
var prepend = [];
var ignore = [];

var p = Promise.resolve();

if (opts.common) {
	var commonBase = Path.basename(opts.common, Path.extname(opts.common));
	var commonOpts = {
		js: `${opts.bundles}/${commonBase}.js`,
		css: `${opts.bundles}/${commonBase}.css`,
		root: opts.public,
		concatenate: opts.concatenate,
		cli: true
	};
	prepend.push(commonOpts.css, commonOpts.js);
	ignore.push(commonOpts.css, commonOpts.js);
	p = p.then(function() {
		return bundledom(Path.join(opts.public, opts.common), commonOpts).then(function(data) {
			exclude = exclude.concat(data.scripts).concat(data.stylesheets).concat(data.imports);
		});
	});
}

p = p.then(function() {
	return new Promise(function(resolve, reject) {
		var globIgnores = opts.ignore || [];
		globIgnores.push(Path.join(opts.bundles, '**'));
		if (opts.common) globIgnores.push(opts.common);
		glob(Path.join(opts.public, globPattern), {
			ignore: globIgnores.map(function(ign) {
				return Path.join(opts.public, ign);
			})
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
		var dir = Path.join(opts.bundles, Path.relative(opts.public, Path.dirname(file)));
		var base = Path.basename(file, '.html');
		var bdOpts = {
			custom: customPlugin,
			concatenate: opts.concatenate,
			exclude: exclude,
			prepend: prepend,
			ignore: ignore,
			js: Path.join(dir, base + '.js'),
			css: Path.join(dir, base + '.css'),
			html: Path.join(dir, base + '.html'),
			cli: true
		};
		if (dir != opts.bundles) bdOpts.root = opts.public;
		return bundledom(file, bdOpts);
	}));
}).then(function(all) {
	console.log(`Processed ${all.length} files`);
}).catch(function(err) {
	console.error(err);
});
