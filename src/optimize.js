import { compressStrings } from "./compress-strings.js";
import { mangleProperties } from "./mangle-properties.js";
import { minify } from "./minify.js";
import { poolStrings } from "./pool-strings.js";

export async function optimize(source, compression) {
	// Vary the initial pass; generated helpers keep the established minification settings.
	const baseline = minify(source, compression),
		mangled = mangleProperties(baseline);

	let result = await optimizeStrings(baseline),
		propertyCount = 0;

	if (mangled.count > 0) {
		const candidate = await optimizeStrings(mangled.code);

		if (Buffer.byteLength(candidate.code) < Buffer.byteLength(result.code)) {
			result = candidate;
			propertyCount = mangled.count;
		}
	}

	return { ...result, properties: propertyCount };
}

async function optimizeStrings(source) {
	const compressed = await compressStrings(source);

	let best;

	for (const variant of compressed.variants) {
		const pooled = poolStrings(variant.code);

		if (!best || Buffer.byteLength(pooled.code) < Buffer.byteLength(best.code)) {
			best = {
				code: pooled.code,
				count: variant.count,
				encoding: variant.encoding,
				strategy: variant.strategy,
				pooled: pooled.count
			};
		}
	}

	return best;
}
