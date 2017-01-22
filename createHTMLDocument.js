(function() {
	var impl = document.implementation;
	var mother;
	if (impl && impl.createHTMLDocument) {
		mother = impl.createHTMLDocument("");
	} else {
		mother = document.createElement('iframe').contentWindow.document;
	}
	document.implementation.createHTMLDocument = function(str) {
		var copy = mother.cloneNode();
		if (str != null) copy.title = str;
		return copy;
	};
})();
