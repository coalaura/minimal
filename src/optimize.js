import { compressStrings, orderStringTable } from "./compress-strings.js";
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

	let best,
		selected;

	for (const variant of compressed.variants) {
		const result = finalizeStrings(variant);

		if (!best || Buffer.byteLength(result.code) < Buffer.byteLength(best.code)) {
			best = result;
			selected = variant;
		}
	}

	for (const variant of orderStringTable(selected)) {
		const result = finalizeStrings(variant);

		if (Buffer.byteLength(result.code) < Buffer.byteLength(best.code)) {
			best = result;
		}
	}

	return best;
}

function finalizeStrings(variant) {
	const pooled = poolStrings(variant.code);

	return {
		code: pooled.code,
		count: variant.count,
		encoding: variant.encoding,
		strategy: variant.strategy,
		extraction: variant.extraction,
		ordering: variant.ordering,
		pooled: pooled.count
	};
}
