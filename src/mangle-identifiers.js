import UglifyJS from "uglify-js";
import { outputOptions } from "./minify.js";

export function mangleIdentifiers(source, options = {}) {
	let best = { code: source, allocation: "existing" };

	// Reparse each alternative: scope metadata and allocated names are mutable.
	for (const weighted of [false, true]) {
		const result = UglifyJS.minify(source, {
			module: true,
			toplevel: true,
			compress: false,
			mangle: {
				...options,
				byte_weighted: weighted
			},
			output: outputOptions
		});

		if (result.error) {
			throw result.error;
		}

		if (Buffer.byteLength(result.code) < Buffer.byteLength(best.code)) {
			best = {
				code: result.code,
				allocation: weighted ? "byte-weighted" : "existing"
			};
		}
	}

	return best;
}
