import { changeStringTable, compressStrings, orderStringTable } from "./compress-strings.js";

export const searchDefaults = {
	beamWidth: 6,
	candidateLimit: 30,
	trialLimit: 8,
	poolTrials: 8
};

export function searchOptions(options = {}) {
	const result = { ...searchDefaults, ...options };

	for (const [name, value] of Object.entries(result)) {
		if (!(name in searchDefaults) || !Number.isInteger(value) || value < 0) {
			throw new RangeError(`Invalid string search budget: ${name}`);
		}
	}

	return result;
}

export async function searchStrings(compressed, finalize, options) {
	const candidates = compressed.candidates.map(candidate => ({ ...candidate, css: "selected" })),
		cache = new Map(),
		tried = new Set();

	if (options.beamWidth === 0 || options.candidateLimit === 0) {
		return [];
	}

	for (const [index, source] of compressed.cssAlternatives.entries()) {
		const alternative = await compressStrings(source, { css: "original" }),
			label = index === 0 ? "alternative" : `alternative-${index + 1}`;

		candidates.push(...alternative.candidates.map(candidate => ({ ...candidate, css: label })));
	}

	const results = [];

	function evaluate(variant) {
		let result = cache.get(variant.code);

		if (!result) {
			result = finalize(variant);
			cache.set(variant.code, result);
		}

		const candidate = { ...variant, result: result, bytes: Buffer.byteLength(result.code) };

		results.push(candidate);

		return candidate;
	}

	let beam = diverseCandidates(candidates, Math.min(options.beamWidth, options.candidateLimit)).map(evaluate),
		remaining = options.candidateLimit - beam.length;

	// Round-robin expansion prevents one encoding or inclusion set consuming the budget.
	const expansions = beam.map(candidate => expand(candidate));

	while (remaining > 0) {
		let progress = false;

		for (const expansion of expansions) {
			const next = expansion.next();

			if (next.done) {
				continue;
			}

			evaluate(next.value);
			progress = true;

			if (--remaining === 0) {
				break;
			}
		}

		if (!progress) {
			break;
		}
	}

	beam = diverseCandidates(results, options.beamWidth).filter(candidate => candidate.table);

	for (let trial = 0; trial < options.trialLimit && beam.length > 0; trial++) {
		const index = trial % beam.length,
			parent = beam[index],
			entries = parent.table.entries,
			included = new Set(entries),
			removals = [...entries].sort((first, second) => entrySavings(first) - entrySavings(second)),
			additions = parent.table.universe.filter(entry => !included.has(entry)).sort((first, second) => entrySavings(second) - entrySavings(first));

		let candidate;

		// Alternate addition/removal attempts, recalculating from the accepted table.
		for (let position = 0; position < Math.max(removals.length, additions.length); position++) {
			const changes = trial % 2 ? [additions[position], removals[position]] : [removals[position], additions[position]];

			for (const entry of changes) {
				if (!entry) {
					continue;
				}

				const nextEntries = included.has(entry) ? entries.filter(item => item !== entry) : [...entries, entry],
					key = JSON.stringify([parent.css, parent.encoding, parent.table.format, nextEntries.map(item => item.value)]);

				if (nextEntries.length === 0 || tried.has(key)) {
					continue;
				}

				tried.add(key);

				candidate = changeStringTable(parent, nextEntries);

				break;
			}

			if (candidate) {
				break;
			}
		}

		if (candidate) {
			const result = evaluate(candidate);

			if (result.bytes < parent.bytes) {
				beam[index] = result;
			}
		}
	}

	return results.map(candidate => candidate.result);
}

export function diverseCandidates(candidates, limit) {
	const sorted = [...candidates].sort((first, second) => (first.bytes ?? Buffer.byteLength(first.code)) - (second.bytes ?? Buffer.byteLength(second.code))),
		selected = [],
		seen = new Set(),
		codes = new Set();

	while (selected.length < limit) {
		let best,
			bestNovelty = -1;

		for (const candidate of sorted) {
			if (codes.has(candidate.code)) {
				continue;
			}

			const novelty = features(candidate).filter(feature => !seen.has(feature)).length;

			if (novelty > bestNovelty) {
				best = candidate;
				bestNovelty = novelty;
			}
		}

		if (!best) {
			break;
		}

		selected.push(best);
		codes.add(best.code);

		for (const feature of features(best)) {
			seen.add(feature);
		}
	}

	return selected;
}

function* expand(variant) {
	if (!variant.table) {
		return;
	}

	const format = variant.table.format,
		contextual = changeStringTable(variant);

	if (format.strategy === "delimiter/split") {
		const mixed = changeStringTable(variant, variant.table.entries, { ...format, destructure: false, mixed: 3 });

		yield mixed;

		yield* orderStringTable(mixed, 1, true);

		yield changeStringTable(variant, variant.table.entries, { ...format, destructure: false, mixed: 2 });

		yield changeStringTable(variant, variant.table.entries, { ...format, destructure: false, direct: true });
	}

	yield contextual;

	yield* orderStringTable(contextual, 4, true);
}

function features(candidate) {
	return [`css:${candidate.css}`, `encoding:${candidate.encoding}`, `inclusion:${candidate.count}`, `extraction:${candidate.extraction}`, `ordering:${candidate.ordering}`, `strategy:${candidate.strategy}`];
}

function entrySavings(entry) {
	return entry.literalBytes - entry.count * 3 - Buffer.byteLength(entry.value) - 4;
}
