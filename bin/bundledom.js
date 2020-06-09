#!/usr/bin/node

var Path = require('path');
var dash = require('dashdash');

var parser = dash.createParser({options: [
	{
		names: ['help', 'h'],
		type: 'bool',
		help: 'Print this help and exit.'
	},
	{
		names: ['html'],
		type: 'string',
		help: 'modified html file name'
	},
	{
		names: ['prepend', 'p'],
		type: 'arrayOfString',
		help: 'prepend scripts'
	},
	{
		names: ['append', 'a'],
		type: 'arrayOfString',
		help: 'append scripts'
	},
	{
		names: ['exclude', 'x'],
		type: 'arrayOfString',
		help: 'exclude scripts, links, imports'
	},
	{
		names: ['ignore', 'i'],
		type: 'arrayOfString',
		help: 'ignore scripts, links, imports'
	},
	{
		names: ['js'],
		type: 'string',
		help: 'js bundle file name'
	},
	{
		names: ['css'],
		type: 'string',
		help: 'css bundle file name'
	},
	{
		names: ['remotes'],
		type: 'arrayOfString',
		help: 'domains from which styles or scripts can be downloaded'
	},
	{
		names: ['concatenate'],
		type: 'bool',
		help: 'do not minify'
	},
	{
		names: ['minify'],
		type: 'bool',
		help: 'minify, overrides concatenate'
	},
	{
		names: ['root'],
		type: 'string',
		help: 'root directory instead of dirname(html file path)'
	}
]});

var opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

var htmlInputPath = opts._args && opts._args.pop();

if (opts.help || !htmlInputPath || !require('fs').existsSync(htmlInputPath)) {
	var help = parser.help({includeEnv: true}).trimRight();
	console.log(`usage: bundledom [opts] <html file path>\n${help}`);
	process.exit(0);
}

var bundledom = require('..');

opts.cli = true;

bundledom(htmlInputPath, opts).then(function(data) {
	if (!opts.js) console.log(data.js);
}).catch(function(err) {
	console.error(err);
	process.exit(1);
});

