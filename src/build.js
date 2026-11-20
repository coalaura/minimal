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

let result = await compressStrings(baseline),
	pooled = poolStrings(result.code),
	propertyCount = 0;

if (mangled.count > 0) {
	const compressedCandidate = await compressStrings(mangled.code),
		pooledCandidate = poolStrings(compressedCandidate.code);

	if (Buffer.byteLength(pooledCandidate.code) < Buffer.byteLength(pooled.code)) {
		result = compressedCandidate;
		pooled = pooledCandidate;
		propertyCount = mangled.count;
	}
}

const outputSize = await Bun.write(output, pooled.code),
	remaining = inputSize === 0 ? 0 : outputSize / inputSize * 100;

console.log(`Input: ${formatSize(inputSize)}`);
console.log(`Output: ${formatSize(outputSize)}`);
console.log(`Remaining: ${remaining.toFixed(2)}%`);
console.log(`Strings: ${result.count} compressed${result.encoding ? ` (Brotli + ${result.encoding})` : ""}`);
console.log(`Pooled: ${pooled.count} strings`);
console.log(`Properties: ${propertyCount} renamed`);

function formatSize(bytes) {
	let size = bytes,
		unitIndex = 0;

	while (size >= 1000 && unitIndex < sizeUnits.length - 1) {
		size /= 1000;
		unitIndex++;
	}

	return `${Number(size.toFixed(2))} ${sizeUnits[unitIndex]}`;
}
