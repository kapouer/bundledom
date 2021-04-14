(function (global, factory) {
	"use strict";
	if (typeof module === "object" && typeof module.exports === "object") {
		module.exports = global.document ?
			factory(global, true) :
			function (w) {
				if (!w.document) {
					throw new Error("jQuery requires a window with a document");
				}
				return factory(w);
			};
	} else {
		factory(global);
	}
})(typeof window !== "undefined" ? window : this, function (window, noGlobal) {
	"use strict";
	const jQuery = function () {
		document.body.dataset.jquery = "yes";
	};
	if (typeof define === "function" && define.amd) {
		define("jquery", [], function () {
			return jQuery;
		});
	}

	if (typeof noGlobal === "undefined") {
		window.jQuery = window.$ = jQuery;
	}
	return jQuery;
});
