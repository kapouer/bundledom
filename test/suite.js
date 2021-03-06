const should = require('should');
const jsdom = require('jsdom');
const Path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const bundledom = require('..');

function runDom(htmlPath, data) {
	return new Promise(function (resolve, reject) {
		const virtualConsole = new jsdom.VirtualConsole();
		virtualConsole.on('jsdomError', function (err) {
			reject(err);
		});
		const dom = new jsdom.JSDOM(data.html, {
			virtualConsole: virtualConsole,
			url: 'file://' + Path.resolve(htmlPath),
			runScripts: "dangerously",
			resources: "usable"
		});
		dom.window.eval(data.js);
		resolve(dom.window.document);
	});
}

describe("test suite", function () {
	this.timeout(10000);

	it('should do the most simplest basic js test', function () {
		process.env.BROWSERSLIST = "ie >= 8";
		return bundledom('test/fixtures/basic.html', {
			exclude: [],
			concatenate: true
		}).then(function (data) {
			data.should.have.property('js');
			data.js.should.containEql("Array.from([12, 34]).map(function");
			data.should.have.property('css');
			data.css.should.containEql("-ms-transform: opacity");
			data.should.have.property('html');
		}).finally(() => {
			delete process.env.BROWSERSLIST;
		})
	});

	it('should concat js for legacy scripts', function () {
		return bundledom('test/fixtures/concat.html', {
			exclude: [],
			concatenate: true
		}).then(function (data) {
			data.should.have.property('js');
			data.js.should.containEql("window.towin = true;");
			data.should.have.property('html');
		});
	});

	it('should work without anything to do', function () {
		return bundledom('test/fixtures/none.html', {
			exclude: []
		}).then(function (data) {
			data.should.have.property('js');
			data.should.have.property('css');
			data.should.have.property('html');
		});
	});

	it('should support es modules', function () {
		return bundledom('test/fixtures/esm.html', {
			exclude: [],
			concatenate: true
		}).then(function (data) {
			data.scripts.should.eql(['mod.js', 'depmod.js']);
			data.should.have.property('js');
			data.js.trim().should.startWith('(function (');
			data.js.includes('emptyObject').should.be.true();
			data.should.have.property('html');
		});
	});

	it('should support es modules with browser prefix resolver', function () {
		return bundledom('test/fixtures/esm-browser.html', {
			modules: '/modules',
			exclude: [],
			concatenate: true
		}).then(function (data) {
			data.scripts.should.eql(['mod-browser.js', '../../node_modules/@ungap/promise-all-settled/esm/index.js']);
			data.should.have.property('js');
			data.js.trim().should.startWith('(function (');
			data.js.includes('Promise.allSettled').should.be.true();
			data.should.have.property('html');
		});
	});

	it('should support legacy-resolved modules', function () {
		return bundledom('test/fixtures/legacy.html', {
			root: "test/fixtures",
			modules: '/modules',
			exclude: [],
			concatenate: true
		}).then(function (data) {
			data.scripts.should.eql(['mod.js', '../../node_modules/@ungap/promise-all-settled/esm/index.js', 'depmod.js']);
			data.should.have.property('js');
		});
	});

	it('should ignore a script', function () {
		return bundledom('test/fixtures/exclude.html', {
			ignore: ['b.js']
		}).then(function (data) {
			data.should.have.property('js');
			data.should.have.property('css');
			data.should.have.property('html');
			data.html.indexOf('<script src="b.js"></script>').should.be.greaterThan(0);
		});
	});

	it('should ignore a script using a wildcard', function () {
		return bundledom('test/fixtures/exclude.html', {
			ignore: ['*.js']
		}).then(function (data) {
			data.should.have.property('js');
			data.should.have.property('css');
			data.should.have.property('html');
			data.html.indexOf('<script src="b.js"></script>').should.be.greaterThan(0);
		});
	});

	it('should bundle html import and run it', function () {
		const filepath = 'test/fixtures/import.html';
		return bundledom(filepath).then(function (data) {
			data.should.have.property('js');
			data.should.have.property('css');
			data.should.have.property('html');
			return runDom(filepath, data).then(function (doc) {
				should.exist(doc.querySelector('head > style'));
				should.exist(doc.querySelector('body > .element'));
			});
		});
	});

	it('should bundle html import in html import and run it', function () {
		const filepath = 'test/fixtures/import-in-import.html';
		return bundledom(filepath).then(function (data) {
			data.should.have.property('js');
			data.should.have.property('css');
			data.should.have.property('html');
			return runDom(filepath, data).then(function (doc) {
				should.exist(doc.querySelector('head > style'));
				should.exist(doc.querySelector('body > .element'));
			});
		});
	});

	it('should bundle imported element with inner imported element and run it', function () {
		const filepath = 'test/fixtures/element-in-element.html';
		return bundledom(filepath).then(function (data) {
			data.should.have.property('js');
			data.should.have.property('css');
			data.should.have.property('html');
			return runDom(filepath, data).then(function (doc) {
				should.exist(doc.querySelector('head > style'));
				should.exist(doc.querySelector('body > .superelement'));
				should.exist(doc.querySelector('body > .element'));
				doc.querySelector('body > .element').innerHTML.should.match(/test1\n\s+test2/);
			});
		});
	});

	it('should bundle html import with sub import from another dir', function () {
		return Promise.all([
			copyOver('test/fixtures/sub/sub.html', 'test/bundles/sub/sub.html'),
			copyOver('test/fixtures/sub/sub.js', 'test/bundles/sub/sub.js'),
			copyOver('test/fixtures/sub/sub.css', 'test/bundles/sub.css')
		]).then(function () {
			return bundledom('test/fixtures/import-sub.html', {
				root: 'test/bundles',
				html: 'import-sub.html',
				js: 'import-sub.js'
			}).then(function (data) {
				data.should.have.property('js');
				return new Promise(function (resolve, reject) {
					fs.readFile('test/bundles/import-sub.js', function (err, data) {
						if (err) return reject(err);
						data.toString().should.match(/.*window\.test=23.*/);
						data.toString().should.match(/.*mysubselector.*/);
						return resolve();
					});
				});
			});
		});
	});

	it('should not bundle remotes', function () {
		return bundledom('test/fixtures/remote.html', {
			root: 'test/bundles',
			html: 'remote.html',
			css: 'remote.css'
		}).then(function (data) {
			data.should.have.property('css');
			return new Promise(function (resolve, reject) {
				fs.readFile('test/bundles/remote.css', function (err, data) {
					if (err) return reject(err);
					data.toString().should.not.containEql("font-family");
					return resolve();
				});
			});
		});
	});

	it('should bundle remote stylesheet', function () {
		this.timeout(10000);
		return bundledom('test/fixtures/remote.html', {
			root: 'test/bundles',
			html: 'remote.html',
			css: 'remote.css',
			remotes: ['fonts.googleapis.com'],
			concatenate: true
		}).then(function (data) {
			data.should.have.property('css');
			return new Promise(function (resolve, reject) {
				fs.readFile('test/bundles/remote.css', function (err, data) {
					if (err) return reject(err);
					data.toString().should.containEql("font-family");
					return resolve();
				});
			});
		});
	});

	it('should import jquery-like bundle with side effects', function () {
		return bundledom('test/fixtures/fakejquery.html', {
			concatenate: true
		}).then(function (data) {
			data.js.should.containEql("window.$ = jQuery");
			data.js.should.containEql("window.$()");
		});
	});

	it('should bundle remote script', function () {
		this.timeout(10000);
		return Promise.all([
			copyOver('test/fixtures/usejquery.js', 'test/bundles/usejquery.js')
		]).then(function () {
			return bundledom('test/fixtures/remote.html', {
				root: 'test/bundles',
				html: 'remote.html',
				js: 'remote.js',
				remotes: ['ajax.googleapis.com']
			}).then(function (data) {
				data.should.have.property('js');
				return new Promise(function (resolve, reject) {
					fs.readFile('test/bundles/remote.js', function (err, data) {
						if (err) return reject(err);
						data.toString().should.containEql("jQuery");
						return resolve();
					});
				});
			});
		});
	});

});

function copyOver(from, to) {
	return new Promise(function (resolve, reject) {
		fs.unlink(to, function (err) {
			fs.readFile(from, function (err, data) {
				if (err) return reject(err);
				mkdirp(Path.dirname(to)).then(function () {
					fs.writeFile(to, data, function (err) {
						if (err) return reject(err);
						resolve();
					});
				}).catch(reject);
			});
		});
	});
}
