var should = require('should');
var jsdom = require('jsdom');
var Path = require('path');
var fs = require('fs');

var bundledom = require('..');

function runDom(htmlPath, data) {
	return new Promise(function(resolve, reject) {
		var virtualConsole = jsdom.createVirtualConsole();
		virtualConsole.on('jsdomError', function(err) {
			reject(err);
		});
		jsdom.jsdom(data.html, {
			virtualConsole: virtualConsole,
			url: 'file://' + Path.resolve(htmlPath),
			features: {
				FetchExternalResources: ['script'],
				ProcessExternalResources: ['script']
			},
			created: function(err, win) {
				if (err) return reject(err);
				win.onload = function() {
					win.eval(data.js);
					resolve(win.document);
				};
			}
		});
	});
}

it('should do the most simplest basic test', function() {
	return bundledom('test/fixtures/basic.html', {
		exclude: []
	}).then(function(data) {
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
	});
});

it('should work without anything to do', function() {
	return bundledom('test/fixtures/none.html', {
		exclude: []
	}).then(function(data) {
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
	});
});

it('should ignore a script', function() {
	return bundledom('test/fixtures/exclude.html', {
		ignore: ['b.js']
	}).then(function(data) {
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		data.html.indexOf('<script src="b.js"></script>').should.be.greaterThan(0);
	});
});

it('should bundle html import and run it', function() {
	var filepath = 'test/fixtures/import.html';
	return bundledom(filepath).then(function(data) {
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		return runDom(filepath, data).then(function(doc) {
			should.exist(doc.querySelector('head > style'));
			should.exist(doc.querySelector('body > .element'));
		});
	});
});

it('should bundle html import in html import and run it', function() {
	var filepath = 'test/fixtures/import-in-import.html';
	return bundledom(filepath).then(function(data) {
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		return runDom(filepath, data).then(function(doc) {
			should.exist(doc.querySelector('head > style'));
			should.exist(doc.querySelector('body > .element'));
		});
	});
});

it('should bundle imported element with inner imported element and run it', function() {
	var filepath = 'test/fixtures/element-in-element.html';
	return bundledom(filepath).then(function(data) {
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		return runDom(filepath, data).then(function(doc) {
			should.exist(doc.querySelector('head > style'));
			should.exist(doc.querySelector('body > .superelement'));
			should.exist(doc.querySelector('body > .element'));
			doc.querySelector('body > .element').innerHTML.should.match(/test1\n\s+test2/);
		});
	});
});

it('should not bundle remotes', function() {
	return bundledom('test/fixtures/remote.html', {
		root: 'test/bundles',
		html: 'remote.html',
		css: 'remote.css'
	}).then(function(data) {
		data.should.have.property('css');
		return new Promise(function(resolve, reject) {
			fs.readFile('test/bundles/remote.css', function(err, data) {
				if (err) return reject(err);
				data.toString().should.not.containEql("font-family");
				return resolve();
			});
		});
	});
});

it('should bundle remote stylesheet', function() {
	return bundledom('test/fixtures/remote.html', {
		root: 'test/bundles',
		html: 'remote.html',
		css: 'remote.css',
		remotes: ['fonts.googleapis.com'],
		concatenate: true
	}).then(function(data) {
		data.should.have.property('css');
		return new Promise(function(resolve, reject) {
			fs.readFile('test/bundles/remote.css', function(err, data) {
				if (err) return reject(err);
				data.toString().should.containEql("font-family");
				return resolve();
			});
		});
	});
});


it('should bundle remote script', function() {
	return bundledom('test/fixtures/remote.html', {
		root: 'test/bundles',
		html: 'remote.html',
		js: 'remote.js',
		remotes: ['maps.googleapis.com'],
		concatenate: true
	}).then(function(data) {
		data.should.have.property('js');
		return new Promise(function(resolve, reject) {
			fs.readFile('test/bundles/remote.js', function(err, data) {
				if (err) return reject(err);
				data.toString().should.containEql("google");
				return resolve();
			});
		});
	});
});
