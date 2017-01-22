(function() {
	var impl = document.implementation;
	var mother;
	if (impl && impl.createHTMLDocument) {
		if (impl.custom) return;
		mother = impl.createHTMLDocument("");
	} else {
		mother = document.createElement('iframe').contentWindow.document;
	}
	document.implementation.createHTMLDocument = function(str) {
		var copy = mother.cloneNode();
		if (str != null) copy.title = str;
		return copy;
	};
	document.implementation.createHTMLDocument.custom = true;
})();
