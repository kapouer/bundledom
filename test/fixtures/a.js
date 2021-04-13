(function () {
  window.test = Array.from([12, 34]).map((a) => {
    return a + 1;
  }).join(',');
})();
