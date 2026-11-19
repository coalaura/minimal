import { compressStrings } from "./compress-strings.js";
import { minify } from "./minify.js";

const sizeUnits = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];

const input = Bun.file(new URL("../data/source.js", import.meta.url)),
	output = Bun.file(new URL("../data/source.min.js", import.meta.url));

const source = await input.text(),
	inputSize = input.size;

const result = compressStrings(minify(source));

const outputSize = await Bun.write(output, result.code),
	remaining = inputSize === 0 ? 0 : outputSize / inputSize * 100;

console.log(`Input: ${formatSize(inputSize)}`);
console.log(`Output: ${formatSize(outputSize)}`);
console.log(`Remaining: ${remaining.toFixed(2)}%`);
console.log(`Strings: ${result.count} compressed${result.encoding ? ` (Brotli + ${result.encoding})` : ""}`);

function formatSize(bytes) {
	let size = bytes,
		unitIndex = 0;

	while (size >= 1000 && unitIndex < sizeUnits.length - 1) {
		size /= 1000;
		unitIndex++;
	}

	return `${Number(size.toFixed(2))} ${sizeUnits[unitIndex]}`;
}
