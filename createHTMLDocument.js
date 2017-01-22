(function() {
	var impl = document.implementation;
	var mother;
	if (!impl) impl = document.implementation = {};
	if (impl.createHTMLDocument) {
		if (impl.createHTMLDocument.custom) return;
		mother = impl.createHTMLDocument("");
	} else {
		mother = document.createElement('iframe').contentWindow.document;
	}
	function createHTMLDocument(str) {
		var copy = mother.cloneNode(true);
		if (str != null) copy.title = str;
		return copy;
	}
	createHTMLDocument.custom = true;
	impl.__proto__.createHTMLDocument = createHTMLDocument;
})();
