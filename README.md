bundledom -- bundle assets of an html document
==============================================

Javascripts, stylesheets, html imports found in a given HTML document
are concatenated, minified, transformed and made injectable from a single script.

Install
-------

`npm install -g bundledom`

Usage
-----

From command-line:
```
bundledom 
--serialize index.prod.html
--output /js/index.bundle.js
--exclude jquery.js 
--prepend 'HTMLImports.js'
public/index.html
```

License
-------

MIT, see LICENSE file.

