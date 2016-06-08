bundledom -- bundle assets of an html document
==============================================

Javascripts, stylesheets, html imports found in a given HTML document
are concatenated, minified, transformed and made injectable from a single script.

Install
-------

`npm install -g bundledom`

Usage
-----

This saves modified html file, and styles are bundled into js file:
```
bundledom 
--html index.prod.html
--js /bundles/index.js
--exclude jquery.js 
--prepend '/js/HTMLImports.js'
public/index.html
```

This saves styles separately:
```
bundledom 
--html index.prod.html
--css /bundles/index.css
--js /bundles/index.js
--exclude jquery.js 
--prepend '/js/HTMLImports.js'
public/index.html
```


Help
----

`bundledom --help`


License
-------

MIT, see LICENSE file.

