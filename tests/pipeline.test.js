import { expect, test } from "bun:test";
import { buildCandidates } from "../src/build-candidates.js";
import { optimize } from "../src/optimize.js";
import { corpus } from "./corpus.js";
import { observe } from "./observe.js";

test("worker scheduling preserves deterministic output and tie-breaking", async () => {
	const source = corpus[2].source,
		options = { search: { beamWidth: 2, candidateLimit: 3, trialLimit: 1 } },
		serial = await buildCandidates(source, 1, options),
		parallel = await buildCandidates(source, 3, options);

	expect(parallel.code).toBe(serial.code);
	expect(parallel.configuration).toBe(serial.configuration);
	expect(parallel.candidates).toEqual(serial.candidates);
	expect(await observe(parallel.code)).toEqual(await observe(source));
});

test("pruned searches cannot displace a smaller complete fallback", async () => {
	for (const fixture of corpus) {
		const fallback = await optimize(fixture.source, undefined, { identifiers: false, strings: false, properties: false }),
			searched = await optimize(fixture.source, undefined, { search: { beamWidth: 1, candidateLimit: 1, trialLimit: 1, poolTrials: 1 } });

		expect(searched.fallbackBytes).toBe(Buffer.byteLength(fallback.code));
		expect(Buffer.byteLength(searched.code)).toBeLessThanOrEqual(Buffer.byteLength(fallback.code));
		expect(await observe(searched.code)).toEqual(await observe(fixture.source));
	}
});
