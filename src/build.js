import { buildCandidates } from "./build-candidates.js";

const sizeUnits = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];

const input = Bun.file(new URL("../data/source.js", import.meta.url)),
	output = Bun.file(new URL("../data/source.min.js", import.meta.url));

const source = await input.text(),
	inputSize = input.size;

const started = performance.now(),
	result = await buildCandidates(source);

const outputSize = await Bun.write(output, result.code),
	remaining = inputSize === 0 ? 0 : outputSize / inputSize * 100;

console.log(`Input: ${formatSize(inputSize)}`);
console.log(`Output: ${formatSize(outputSize)}`);
console.log(`Remaining: ${remaining.toFixed(2)}%`);
console.log(`Configurations: ${result.candidates.length} (${result.workers} workers)`);

for (const candidate of result.candidates) {
	console.log(`  ${candidate.name}: ${formatSize(candidate.bytes)}${candidate.name === result.configuration ? " (selected)" : ""}`);
}

console.log(`Strings: ${result.count} compressed${result.encoding ? ` (Brotli + ${result.encoding})` : ""}`);
console.log(`Storage: ${result.strategy ?? "plain strings"}`);
console.log(`Pooled: ${result.pooled} strings`);
console.log(`Properties: ${result.properties} renamed`);
console.log(`Build: ${((performance.now() - started) / 1000).toFixed(2)}s`);

function formatSize(bytes) {
	let size = bytes,
		unitIndex = 0;

	while (size >= 1000 && unitIndex < sizeUnits.length - 1) {
		size /= 1000;
		unitIndex++;
	}

	return `${Number(size.toFixed(2))} ${sizeUnits[unitIndex]}`;
}
