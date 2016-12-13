var should = require('should');
var jsdom = require('jsdom');
var Path = require('path');

var bundledom = require('..');

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
		console.log(data);
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		return new Promise(function(resolve, reject) {
			jsdom.jsdom(data.html, {
				virtualConsole: jsdom.createVirtualConsole().sendTo(console),
				url: 'file://' + Path.resolve(filepath),
				features: {
					FetchExternalResources: ['script'],
					ProcessExternalResources: ['script']
				},
				created: function(err, win) {
					if (err) return reject(err);
					win.onload = function() {
						win.eval(data.js);
						should.exist(win.document.querySelector('head > style'));
						should.exist(win.document.querySelector('body > .element'));
						resolve();
					};
				}
			});
		});
	});
});
