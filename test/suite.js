var should = require('should');

var bundledom = require('..');

it('should do the most simplest basic test', function() {
	return bundledom('test/fixtures/exclude.html', {
		exclude: []
	}).then(function(data) {
		data.should.have.property('js');
		data.should.have.property('css');
	});
});
