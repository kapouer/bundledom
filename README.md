bundledom -- bundle assets of an html document
==============================================

* Warning this is for bundling old web apps with modern tools without any kind of modules system *

Features
--------

* recursively concatenate scripts, styles, and link[rel=import]
* minify scripts and stylesheets
* vendor autoprefixing of stylesheets, configurable through env, see
  https://github.com/ai/browserslist
* bundle everything in one single js file, or split in js / css.
* prepend or append additional scripts, styles, or imports
* exclude or ignore a tag by matching a url substring
  new in version 1.8.0: or a minimatch pattern with wildcard (see example below)
* modify the DOM and outputs html
* downloads remote scripts or stylesheets with whitelist (new in 1.7.0)
* allows custom asynchronous DOM modifications (new in 1.6.0)


Install
-------

`npm install -g bundledom`

Usage
-----

This saves modified html file, and styles are bundled into js file:
```
bundledom 
--html bundles/index.html
--js /bundles/index.js
-x jquery.js -x moment.js -i index.js
--prepend '/js/HTMLImports.js'
public/index.html
```

This saves styles separately:
```
bundledom 
--html bundles/index.html
--css /bundles/index.css
--js /bundles/index.js
--exclude jquery.js 
--prepend '/js/HTMLImports.js'
public/index.html
```

This does not compress files, and specifies root dir
```
bundledom
--concatenate
--html bundles/index.html
--css /bundles/index.css
--js /bundles/index.js
--exclude jquery.js 
--prepend '/js/HTMLImports.js'
--root public
public/templates/index.html
```

*new in 1.6.0*

```
bundledom-all
  --filter "**/excluded-*.*"
  --common common.html
  --suffix 1.0.0
  "templates/*.html"
```
it bundles common files then processes all files matching pattern and put
everything with suffixes in a bundles/ directory.

See `bundledom-all -h` for more command-line options.

Paths are relative to the input file path.


API
---

`bundledom(path, opts, cb)`

where `path` is the path of the html file to process,
and `opts` has these properties:

- exclude: array of matched strings
- ignore: array of matched strings
- append: array of strings
- prepend: array of strings
- js: path relative to html file
- css: path relative to html file
- html: path relative to root
- root: path
- custom: function(dom, opts, data) {} returning a promise
- remotes: list of allowed remote domains to download from

Strings are matched simply by searching a substring.

Tags without src or href attributes can be excluded or ignored by passing a
dot ".", otherwise they are bundled.

Omitting js, css options skips the insertion of the corresponding tag in the
html document.

If cb is omitted, returns a promise.

Returns an object with following properties:

- js, css, html: the resulting js, css, html
- scripts, stylesheets, imports: the lists of processed files


Compatibility of HTML Imports bundling
--------------------------------------

Anywhere createHTMLDocument works. For IE 9 to 11, works better with
[create-html-document-polyfill](https://github.com/kapouer/create-html-document-polyfill)


Help
----

`bundledom --help`


License
-------

MIT, see LICENSE file.

