var should = require('should');
var jsdom = require('jsdom');
var Path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');

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

it('should ignore a script using a wildcard', function() {
	return bundledom('test/fixtures/exclude.html', {
		ignore: ['*.js']
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

it('should bundle html import with sub import from another dir', function() {
	return Promise.all([
		copyOver('test/fixtures/sub/sub.html', 'test/bundles/sub/sub.html'),
		copyOver('test/fixtures/sub/sub.js', 'test/bundles/sub/sub.js'),
		copyOver('test/fixtures/sub/sub.css', 'test/bundles/sub.css')
	]).then(function() {
		return bundledom('test/fixtures/import-sub.html', {
			root: 'test/bundles',
			html: 'import-sub.html',
			js: 'import-sub.js'
		}).then(function(data) {
			data.should.have.property('js');
			return new Promise(function(resolve, reject) {
				fs.readFile('test/bundles/import-sub.js', function(err, data) {
					if (err) return reject(err);
					data.toString().should.match(/.*window\.test=23.*/);
					data.toString().should.match(/.*mysubselector.*/);
					return resolve();
				});
			});
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
	this.timeout(10000);
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
	this.timeout(10000);
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

function copyOver(from, to) {
	return new Promise(function(resolve, reject) {
		fs.unlink(to, function(err) {
			fs.readFile(from, function(err, data) {
				if (err) return reject(err);
				mkdirp(Path.dirname(to), function(err) {
					if (err) return reject(err);
					fs.writeFile(to, data, function(err) {
						if (err) return reject(err);
						resolve();
					});
				});
			});
		});
	});
}
