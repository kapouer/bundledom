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
		names: ['common', 'c'],
		type: 'string',
		help: 'html file with common resources'
	},
	{
		names: ['ignore'],
		type: 'arrayOfString',
		help: 'files to ignore from glob'
	},
	{
		names: ['suffix', 's'],
		type: 'string',
		help: 'suffix to append to bundles names (typically, a version number)'
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
	}
]});

var opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

var globPattern = opts._args && opts._args.pop();

if (opts.help || !globPattern) {
	var help = parser.help({includeEnv: true}).trimRight();
	console.log(`usage: bundle --ignore google-*.html --common common.html **/*.html\n${help}`);
	process.exit(0);
}

var suffix = opts.suffix;
if (suffix) suffix = '-' + suffix;
else suffix = '';

var common = {
	js: `${opts.bundles}/common${suffix}.js`,
	css: `${opts.bundles}/common${suffix}.css`
};
var exclude = [];
var prepend = [common.css, common.js];
var ignore = [common.css, common.js];

var p = Promise.resolve();

if (opts.common) p = p.then(function() {
	return bundledom(Path.join(opts.public, opts.common), common).then(function(data) {
		exclude = exclude.concat(data.scripts).concat(data.stylesheets);
	});
});

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
			exclude: exclude,
			prepend: prepend,
			ignore: ignore,
			js: Path.join(dir, base + suffix + '.js'),
			css: Path.join(dir, base + suffix + '.css'),
			html: Path.join(dir, base + '.html')
		};
		if (dir != opts.bundles) bdOpts.root = opts.public;
		return bundledom(file, bdOpts);
	}));
}).then(function(all) {
	console.log(`Processed ${all.length} files`);
}).catch(function(err) {
	console.error(err);
});
