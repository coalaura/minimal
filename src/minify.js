import UglifyJS from "uglify-js";

export const outputOptions = {
	beautify: false,
	comments: false,
	ascii_only: false,
	inline_script: false
};

export function minify(source, compression) {
	const result = UglifyJS.minify(source, {
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

	return result.code;
}
