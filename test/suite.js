var should = require('should');

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
