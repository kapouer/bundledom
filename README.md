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
--serialize public/index.prod.html 
--exclude jquery.js 
--prepend 'js/HTMLImports.js'
public/index.html > public/index.bundle.js
```

License
-------

MIT, see LICENSE file.

