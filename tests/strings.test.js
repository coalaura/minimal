import { expect, test } from "bun:test";
import UglifyJS from "uglify-js";
import { changeStringTable, compressStrings, orderStringTable, replacementSavings, transformStrings } from "../src/compress-strings.js";
import { mangleIdentifiers } from "../src/mangle-identifiers.js";
import { optimize } from "../src/optimize.js";
import { poolStrings } from "../src/pool-strings.js";
import { searchOptions, searchStrings } from "../src/search-strings.js";
import { observe } from "./observe.js";

const messages = [
	"An infrequent message with enough repeated text to join the compressed table.",
	"The frequently referenced message shares repeated text with the compressed table.",
	"Unicode \u{1f680} \u00e9 \u4e2d and quotes \" \\ with repeated text for the compressed table.",
	"Another message with repeated text but different \n\r\t escape sequences."
];

const tableSource = `const messages=${JSON.stringify(messages)};console.log(messages[+globalThis.input||0]);console.log(${JSON.stringify(messages[1])});console.error(${JSON.stringify(messages[1])});console.log(${JSON.stringify(messages[1])},${JSON.stringify(messages[1])});`;

test("occurrence costs distinguish literals, dots, keys and template segments", async () => {
	const reference = new UglifyJS.AST_SymbolRef({ name: "pooled" }),
		source = 'const pooled="abc";const object={abc:3};console.log("abc",object.abc,`abc${object.abc}abc`);',
		ast = UglifyJS.parse(source),
		contexts = new Set();

	transformStrings(ast, (value, literal, context) => {
		if (value !== "abc") {
			return;
		}

		contexts.add(context);

		if (context !== "literal" || literal === ast.body[0].definitions[0].value) {
			expect(replacementSavings(value, literal, reference, context)).toBeLessThanOrEqual(context === "literal" ? 3 : 0);

			return;
		}

		return replacementSavings(value, literal, reference, context) > 0 ? reference.clone() : undefined;
	});

	expect(contexts).toEqual(new Set(["literal", "key", "dot", "template"]));
	expect(ast.print_to_string()).toContain("object.abc");
	expect(await observe(ast.print_to_string())).toEqual(await observe(source));
});

test("mixed extraction and frequency ordering preserve decoded values and receivers", async () => {
	const compressed = await compressStrings(tableSource, { css: "original" }),
		variant = compressed.candidates.find(candidate => candidate.table?.format.strategy === "delimiter/split" && !candidate.table.format.destructure),
		mixed = changeStringTable(variant, variant.table.entries, { ...variant.table.format, mixed: 3 }),
		direct = changeStringTable(variant, variant.table.entries, { ...variant.table.format, direct: true }),
		orders = orderStringTable(mixed, 4, true),
		frequency = orders.find(candidate => candidate.ordering === "frequency");

	expect(mixed.extraction).toBe("mixed");
	expect(direct.extraction).toBe("direct");
	expect(frequency.table.entries[0].value).toBe(messages[1]);

	for (const candidate of [mixed, direct, ...orders]) {
		expect(await observe(candidate.code)).toEqual(await observe(tableSource));
	}
});

test("all retained encodings and extraction strategies preserve Unicode and escaping", async () => {
	const compressed = await compressStrings(tableSource, { css: "original" }),
		original = await observe(tableSource),
		encodings = new Set();

	for (const candidate of compressed.candidates) {
		if (candidate.encoding) {
			encodings.add(candidate.encoding);
		}

		expect(await observe(candidate.code)).toEqual(original);
	}

	expect(encodings.size).toBe(3);
});

test("bounded additions and removals are finalized, pooled and deterministic", async () => {
	const compressed = await compressStrings(tableSource),
		options = searchOptions({ beamWidth: 3, candidateLimit: 9, trialLimit: 6, poolTrials: 2 }),
		seen = [],
		finalize = variant => {
			seen.push(variant.table?.entries.map(entry => entry.value));

			return mangleIdentifiers(poolStrings(variant.code, { contextual: true, trialLimit: 2 }).code);
		},
		first = await searchStrings(compressed, finalize, options),
		second = await searchStrings(compressed, finalize, options);

	expect(first).toEqual(second);
	expect(first.length).toBeLessThanOrEqual(options.candidateLimit + options.trialLimit);
	expect(new Set(seen.filter(Boolean).map(entries => entries.length)).size).toBeGreaterThan(1);

	for (const candidate of first) {
		expect(await observe(candidate.code)).toEqual(await observe(tableSource));
	}
});

test("Unicode, lone surrogates, BOM, template coercion and thrown exceptions", async () => {
	const source = `${tableSource}function item(){console.log("side effect");return {toString(){console.log("coerce");return "value"}}}console.log(\`${messages[0]}\${item()}${messages[0]}\`);console.log("\\uD800","\\uFEFFprefix");throw new Error("expected");`,
		result = await optimize(source, undefined, { search: { beamWidth: 3, candidateLimit: 8, trialLimit: 2 } });

	expect(await observe(result.code)).toEqual(await observe(source));
	expect(Buffer.byteLength(result.code)).toBeLessThanOrEqual(result.fallbackBytes);
});

test("pooling interactions are scored after identifier allocation", async () => {
	const lines = Array.from({ length: 12 }, (_, index) => `console.log("shared-value-${index % 3}","another shared-value-${index % 2}");`),
		source = lines.join(""),
		options = {
			contextual: true,
			trialLimit: 8,
			score: code => Buffer.byteLength(mangleIdentifiers(code).code)
		},
		result = poolStrings(source, options);

	expect(result.count).toBeGreaterThan(0);
	expect(await observe(result.code)).toEqual(await observe(source));
	expect(poolStrings(source, options)).toEqual(result);
});

test("original and minified CSS survive to full encoded candidate scoring", async () => {
	const css = Array.from({ length: 18 }, (_, index) => `.entry-${index} { color: #ffffff; padding: 0px 0px 0px 0px; margin: 0px; }`).join("\n"),
		source = `globalThis.stylesheet=${JSON.stringify(css)};console.log(${JSON.stringify(messages[0])});`,
		compressed = await compressStrings(source),
		seen = new Set();

	expect(compressed.cssAlternative).toBe(source);
	await searchStrings(compressed, variant => {
		seen.add(variant.css);

		return mangleIdentifiers(poolStrings(variant.code).code);
	}, searchOptions({ beamWidth: 6, candidateLimit: 6, trialLimit: 0 }));
	expect(seen).toEqual(new Set(["selected", "alternative"]));
});

test("CSS alternatives are retained even when minification expands the raw CSS", async () => {
	const css = "@media(width>1px){.x{color:red}}",
		source = `globalThis.stylesheet=${JSON.stringify(css)};`,
		compressed = await compressStrings(source),
		seen = new Set();

	expect(compressed.variants[0].code).toBe(source);
	expect(compressed.cssAlternatives.some(code => code.includes("min-width"))).toBe(true);

	await searchStrings(compressed, variant => {
		seen.add(variant.css);

		return { code: variant.code };
	}, searchOptions({ candidateLimit: 6, trialLimit: 0 }));

	expect(seen).toEqual(new Set(["selected", "alternative"]));
});

test("zero search budgets retain the original pipeline fallback", async () => {
	const source = 'const object={abc:3};console.log("abc",object.abc);',
		base = { identifiers: false, properties: false },
		legacy = await optimize(source, undefined, { ...base, strings: false }),
		pruned = await optimize(source, undefined, { ...base, strings: true, search: { beamWidth: 0, candidateLimit: 0, trialLimit: 0 } });

	expect(pruned.code).toBe(legacy.code);
	expect(pruned.fallbackBytes).toBe(Buffer.byteLength(legacy.code));
	expect(() => searchOptions({ trialLimit: -1 })).toThrow(RangeError);
});

test("module paths and named imports remain literal syntax", async () => {
	const source = `import { value } from "a-long-module-specifier-for-string-extraction";export { other } from "another-long-module-specifier";console.log(value);`,
		result = await compressStrings(source);

	for (const candidate of result.candidates) {
		expect(() => UglifyJS.parse(candidate.code, { module: true })).not.toThrow();
	}
});

test("string payload helpers never use eval or Function unpacking", async () => {
	const compressed = await compressStrings(tableSource);

	for (const candidate of compressed.candidates) {
		const forbidden = [];

		UglifyJS.parse(candidate.code).walk(new UglifyJS.TreeWalker(node => {
			if (node instanceof UglifyJS.AST_SymbolRef && ["eval", "Function"].includes(node.name)) {
				forbidden.push(node.name);
			}
		}));

		expect(forbidden).toEqual([]);
	}
});
