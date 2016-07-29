bundledom -- bundle assets of an html document
==============================================



Features
--------

* recursively concatenate scripts, styles and html in HTML imports
* minify scripts and stylesheets
* autoprefix stylesheets
* bundle everything in one single js file, or split in js / css.
* prepend or append additional scripts, styles, or imports
* exclude or ignore a tag by matching a url substring
* modify the DOM and outputs html


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

Paths are relative to the input file path.


API
---

`bundledom(path, opts, cb)`

- path: the path to the html file to process
- opts can contain `exclude`, `ignore`, `prepend`, `append` arrays, and a `root`
option to set the base directory for paths.

If cb is omitted, returns a promise.

Returns an object with following properties:

- js, css, html: the resulting js, css, html
- scripts, stylesheets, imports: the lists of processed files


Help
----

`bundledom --help`


License
-------

MIT, see LICENSE file.

