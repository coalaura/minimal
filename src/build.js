import { compressStrings } from "./compress-strings.js";
import { mangleProperties } from "./mangle-properties.js";
import { minify } from "./minify.js";
import { poolStrings } from "./pool-strings.js";

const sizeUnits = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];

const input = Bun.file(new URL("../data/source.js", import.meta.url)),
	output = Bun.file(new URL("../data/source.min.js", import.meta.url));

const source = await input.text(),
	inputSize = input.size;

const baseline = minify(source),
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

const outputSize = await Bun.write(output, result.code),
	remaining = inputSize === 0 ? 0 : outputSize / inputSize * 100;

console.log(`Input: ${formatSize(inputSize)}`);
console.log(`Output: ${formatSize(outputSize)}`);
console.log(`Remaining: ${remaining.toFixed(2)}%`);
console.log(`Strings: ${result.count} compressed${result.encoding ? ` (Brotli + ${result.encoding})` : ""}`);
console.log(`Storage: ${result.strategy ?? "plain strings"}`);
console.log(`Pooled: ${result.pooled} strings`);
console.log(`Properties: ${propertyCount} renamed`);

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

function formatSize(bytes) {
	let size = bytes,
		unitIndex = 0;

	while (size >= 1000 && unitIndex < sizeUnits.length - 1) {
		size /= 1000;
		unitIndex++;
	}

	return `${Number(size.toFixed(2))} ${sizeUnits[unitIndex]}`;
}
