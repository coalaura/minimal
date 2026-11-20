import { execFileSync } from "node:child_process";
import uglifyPackage from "uglify-js/package.json";
import { buildCandidates } from "../src/build-candidates.js";
import { corpus } from "./corpus.js";
import { observe } from "./observe.js";

const modes = [
	{ name: "fallback", identifiers: false, strings: false, properties: false },
	{ name: "identifiers", identifiers: true, strings: false, properties: false },
	{ name: "strings", identifiers: false, strings: true, properties: false },
	{ name: "properties", identifiers: false, strings: false, properties: true },
	{ name: "combined", identifiers: true, strings: true, properties: true }
];

const requested = Bun.argv.find(argument => argument.startsWith("--mode="))?.slice(7),
	quick = Bun.argv.includes("--corpus-only"),
	selected = requested ? modes.filter(mode => mode.name === requested) : modes,
	fixtures = [...corpus];

if (selected.length === 0) {
	throw new Error(`Unknown benchmark mode: ${requested}`);
}

if (!quick) {
	const file = Bun.file(new URL("../data/source.js", import.meta.url));

	if (await file.exists()) {
		fixtures.unshift({ name: "indexeddb", source: await file.text() });
	} else {
		console.log(JSON.stringify({ skipped: "IndexedDB input data/source.js is unavailable" }));
	}
}

console.log(JSON.stringify({
	revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
	bun: Bun.version,
	bunRevision: Bun.revision,
	uglify: uglifyPackage.version,
	platform: process.platform,
	architecture: process.arch,
	workers: 3
}));

for (const mode of selected) {
	for (const fixture of fixtures) {
		const started = performance.now(),
			result = await buildCandidates(fixture.source, 3, mode),
			seconds = (performance.now() - started) / 1000;

		let behavior = "browser check not run";

		if (fixture.name !== "indexeddb") {
			const original = await observe(fixture.source),
				optimized = await observe(result.code);

			if (JSON.stringify(original) !== JSON.stringify(optimized)) {
				throw new Error(`Behavior mismatch: ${mode.name}/${fixture.name}: ${JSON.stringify({ original: original, optimized: optimized })}`);
			}

			behavior = "matched";
		}

		console.log(JSON.stringify({
			mode: mode.name,
			fixture: fixture.name,
			inputBytes: Buffer.byteLength(fixture.source),
			bytes: Buffer.byteLength(result.code),
			fallbackBytes: result.fallbackBytes,
			seconds: Number(seconds.toFixed(3)),
			configuration: result.configuration,
			allocation: result.allocation,
			properties: result.properties,
			strategy: result.strategy,
			extraction: result.extraction,
			ordering: result.ordering,
			finalized: result.finalized,
			search: result.search,
			behavior: behavior,
			candidates: result.candidates
		}));
	}
}
