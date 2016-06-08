bundledom -- bundle assets of an html document
==============================================



Features
--------

* recursively concatenate scripts, styles and html in HTML imports
* concatenate and minify scripts and stylesheets (which are also run through
autoprefixer).
* bundle everything in one single js file, or split in js / css.
* prepend or append additional scripts, styles, or imports
* exclude by matching a url substring
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
--exclude jquery.js 
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

This does not compress files:
```
bundledom
--concatenate
--html bundles/index.html
--css /bundles/index.css
--js /bundles/index.js
--exclude jquery.js 
--prepend '/js/HTMLImports.js'
public/index.html
```

Paths are relative to the input file path.


Help
----

`bundledom --help`


License
-------

MIT, see LICENSE file.

