import UglifyJS from "uglify-js";

export const outputOptions = {
	beautify: false,
	comments: false,
	ascii_only: false,
	inline_script: false
};

export function minify(source, compression) {
	const ast = typeof source === "string" ? UglifyJS.parse(source, { module: true }) : source,
		globals = globalNames(ast);

	const result = UglifyJS.minify(ast, {
		module: true,
		toplevel: true,
		compress: {
			arrows: true,
			passes: 100,
			...compression
		},
		mangle: true,
		output: outputOptions
	});

	if (result.error) {
		throw result.error;
	}

	// Reparse emitted code: stale compiler scope metadata can hide lost closure bindings.
	const emitted = UglifyJS.parse(result.code, { module: true }),
		unbound = [...globalNames(emitted)].filter(name => !globals.has(name));

	if (unbound.length > 0) {
		throw new Error(`Minification introduced unbound identifiers: ${unbound.join(", ")}`);
	}

	return result.code;
}

function globalNames(ast) {
	ast.figure_out_scope();

	const names = new Set();

	ast.globals.each(definition => {
		names.add(definition.name);
	});

	return names;
}
