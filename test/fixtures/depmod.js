export async function test() {
	var emptyObject = {};
	return emptyObject?.test?.toto ?? 'what';
}
