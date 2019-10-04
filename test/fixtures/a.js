function test() {
  return ["a", "b"].map((val) => {
    return `${val}-`;
  });
}

async function toto() {
	return Promise.resolve("wait");
}
