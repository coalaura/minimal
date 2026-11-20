import { compressStrings, orderStringTable } from "./compress-strings.js";
import { mangleDirectProperties } from "./mangle-direct-properties.js";
import { mangleIdentifiers } from "./mangle-identifiers.js";
import { mangleProperties } from "./mangle-properties.js";
import { minify } from "./minify.js";
import { poolStrings } from "./pool-strings.js";
import { searchOptions, searchStrings } from "./search-strings.js";

export async function optimize(source, compression, options = {}) {
	const settings = {
		identifiers: options.identifiers ?? true,
		strings: options.strings ?? true,
		properties: options.properties ?? true,
		search: searchOptions(options.search)
	};

	const baseline = minify(source, compression),
		direct = mangleDirectProperties(baseline),
		sources = [{ code: baseline, count: 0 }],
		poolCache = new Map(),
		identifierCache = new Map();

	if (direct.count > 0) {
		sources.push(direct);
	}

	let best,
		fallback;

	function allocate(code) {
		let result = identifierCache.get(code);

		if (!result) {
			result = settings.identifiers ? mangleIdentifiers(code) : { code: code, allocation: "existing" };
			identifierCache.set(code, result);
		}

		return result;
	}

	function finalize(variant, contextual = false) {
		const key = `${contextual}:${variant.code}`;

		let pooled = poolCache.get(key);

		if (!pooled) {
			pooled = poolStrings(variant.code, contextual ? {
				contextual: true,
				trialLimit: settings.search.poolTrials,
				score: code => Buffer.byteLength(allocate(code).code)
			} : {});
			poolCache.set(key, pooled);
		}

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

	function consider(result, properties) {
		const candidate = { ...result, ...(result.allocation ? {} : allocate(result.code)), properties: properties };

		if (!best || Buffer.byteLength(candidate.code) < Buffer.byteLength(best.code)) {
			best = candidate;
		}
	}

	async function run(entry, legacy) {
		const compressed = await compressStrings(entry.code);

		{
			let selected,
				legacyBest;

			for (const variant of compressed.variants) {
				const result = finalize(variant);

				if (!legacyBest || Buffer.byteLength(result.code) < Buffer.byteLength(legacyBest.code)) {
					legacyBest = result;
					selected = variant;
				}

				consider(result, entry.count);
			}

			for (const variant of orderStringTable(selected)) {
				const result = finalize(variant);

				if (Buffer.byteLength(result.code) < Buffer.byteLength(legacyBest.code)) {
					legacyBest = result;
				}

				consider(result, entry.count);
			}

			if (legacy && (!fallback || Buffer.byteLength(legacyBest.code) < Buffer.byteLength(fallback.code))) {
				fallback = { ...legacyBest, properties: entry.count, allocation: "existing" };
			}
		}

		if (settings.strings) {
			const results = await searchStrings(compressed, variant => {
				const result = finalize(variant, true);

				return { ...result, ...allocate(result.code) };
			}, settings.search);

			for (const result of results) {
				consider(result, entry.count);
			}
		}
	}

	for (const entry of sources) {
		await run(entry, true);
	}

	if (settings.properties) {
		const broader = mangleProperties(baseline);

		if (broader.count > 0 && !sources.some(entry => entry.code === broader.code)) {
			await run(broader, false);
		}
	}

	if (Buffer.byteLength(fallback.code) <= Buffer.byteLength(best.code)) {
		best = fallback;
	}

	return { ...best, fallbackBytes: Buffer.byteLength(fallback.code), search: settings.search, finalized: poolCache.size };
}
