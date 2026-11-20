import { brotliCompressSync, constants } from "node:zlib";
import UglifyJS from "uglify-js";
import { encodings } from "./encodings.js";
import { minify, outputOptions } from "./minify.js";
import { minifyStylesheets } from "./minify-css.js";

const compressionOptions = {
	params: {
		[constants.BROTLI_PARAM_QUALITY]: 11,
		[constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT
	}
};

const runtimeGlobals = ["Response", "Blob", "Uint8Array", "DecompressionStream"],
	maximumIndividualTrials = 8,
	maximumOrderingTrials = 2,
	delimiters = ["|", "\0", "\x01", "\x02", "\x1F"];

const sharedConfigurations = [
	{ minimumLength: 16, includePooled: false },
	{ minimumLength: 64, includePooled: false },
	{ minimumLength: 16, includePooled: true }
];

const tableOrderings = [
	{ name: "alphabetical", compare: compareEntries },
	{ name: "suffix", compare: compareSuffixes },
	{ name: "length", compare: (first, second) => first.value.length - second.value.length || compareEntries(first, second) }
];

const frequencyOrdering = {
	name: "frequency",
	compare: (first, second) => second.count - first.count || compareEntries(first, second)
};

export async function compressStrings(source, options = {}) {
	let ast = UglifyJS.parse(source, { module: true }),
		cssAlternative;

	const originalSource = source,
		cssAlternatives = [],
		literals = new Set();

	transformStrings(ast, value => {
		literals.add(value);
	}, true);

	const stylesheets = options.css === "original" ? new Map() : await minifyStylesheets(literals, { keepLarger: true });

	if (stylesheets.size > 0) {
		const minifiedAST = ast.clone(true);

		let legacyChanged = false,
			allSmaller = true;

		transformStrings(minifiedAST, value => {
			const stylesheet = stylesheets.get(value);

			if (stylesheet !== undefined) {
				return new UglifyJS.AST_String({ value: stylesheet });
			}
		}, true);

		transformStrings(ast, value => {
			const stylesheet = stylesheets.get(value);

			if (stylesheet === undefined) {
				return;
			}

			if (Buffer.byteLength(stylesheet) < Buffer.byteLength(value)) {
				legacyChanged = true;

				return new UglifyJS.AST_String({ value: stylesheet });
			}

			allSmaller = false;
		}, true);

		const code = legacyChanged ? minify(ast) : source,
			minifiedCode = allSmaller ? code : minify(minifiedAST);

		if (options.css === "minified") {
			source = minifiedCode;
		} else if (Buffer.byteLength(code) < Buffer.byteLength(source)) {
			source = code;
		}

		ast = UglifyJS.parse(source, { module: true });

		for (const alternative of new Set([originalSource, code, minifiedCode])) {
			if (alternative !== source) {
				cssAlternatives.push(alternative);
			}
		}

		cssAlternative = cssAlternatives[0];
	}

	const names = new Set(),
		strings = new Map();

	let moduleSyntax = false;

	ast.walk(new UglifyJS.TreeWalker(function (node) {
		if (node instanceof UglifyJS.AST_Symbol) {
			names.add(node.name);
		}

		if (node instanceof UglifyJS.AST_Import || node.TYPE.startsWith("Export")) {
			moduleSyntax = true;
		}

		const awaitExpression = node instanceof UglifyJS.AST_Await || node instanceof UglifyJS.AST_ForAwaitOf;

		if (awaitExpression && !this.find_parent(UglifyJS.AST_Lambda)) {
			moduleSyntax = true;
		}
	}));

	let best = {
		code: source,
		count: 0,
		encoding: null,
		strategy: null
	};

	const variants = [best],
		searchCandidates = [best];

	if (moduleSyntax) {
		ast.figure_out_scope();

		// A module cannot put its decoder outside the scope of these bindings.
		if (runtimeGlobals.some(name => ast.variables.get(name))) {
			return { ...best, variants: variants, candidates: searchCandidates, cssAlternative: cssAlternative, cssAlternatives: cssAlternatives };
		}
	}

	transformStrings(ast, (value, literal) => {
		// Response.text() replaces lone surrogates and strips an initial UTF-8 BOM.
		if (!value.isWellFormed() || value.startsWith("\uFEFF")) {
			return;
		}

		let entry = strings.get(value);

		if (!entry) {
			entry = {
				value: value,
				name: uniqueName(names, "__string"),
				count: 0,
				literalBytes: 0,
				compressed: brotliCompressSync(Buffer.from(value), compressionOptions)
			};

			strings.set(value, entry);
		}

		entry.count++;
		entry.literalBytes += Buffer.byteLength(literal.print_to_string(outputOptions));
	});

	const decoderName = uniqueName(names, "__decompress");

	for (const encoding of encodings) {
		const candidates = [];

		for (const entry of strings.values()) {
			const payload = new UglifyJS.AST_String({ value: encoding.encode(entry.compressed) }),
				payloadBytes = Buffer.byteLength(payload.print_to_string(outputOptions));

			// Repetition alone is string pooling, not a reason to compress a larger payload.
			if (payloadBytes >= entry.literalBytes / entry.count) {
				continue;
			}

			// Optimistic cost of a binding, awaited call, and one-character references.
			const savings = entry.literalBytes - payloadBytes - entry.count - 12;

			if (savings > 0) {
				candidates.push({
					entry: entry,
					payload: payload,
					savings: savings
				});
			}
		}

		candidates.sort((first, second) => second.savings - first.savings);

		if (candidates.length === 0) {
			continue;
		}

		let code = buildVariant(ast, candidates, encoding, decoderName, moduleSyntax),
			changed = true,
			trials = 0;

		// Measure the complete minified program, including shared startup overhead.
		while (changed && candidates.length > 0 && trials < maximumIndividualTrials) {
			changed = false;

			for (let index = candidates.length - 1; index >= 0 && trials < maximumIndividualTrials; index--) {
				trials++;

				const trial = candidates.filter((candidate, position) => position !== index),
					trialCode = trial.length === 0 ? source : buildVariant(ast, trial, encoding, decoderName, moduleSyntax);

				if (Buffer.byteLength(trialCode) <= Buffer.byteLength(code)) {
					candidates.splice(index, 1);
					code = trialCode;
					changed = true;
				}
			}
		}

		if (Buffer.byteLength(code) < Buffer.byteLength(best.code)) {
			best = {
				code: code,
				count: candidates.length,
				encoding: encoding.name,
				strategy: "individual"
			};
		}

		searchCandidates.push({ code: code, count: candidates.length, encoding: encoding.name, strategy: "individual" });
	}

	if (best.count > 0) {
		variants.push(best);
	}

	const payloadName = uniqueName(names, "__payload"),
		sliceName = uniqueName(names, "__slice"),
		sharedVariants = new Map(),
		sharedCounts = new Set(),
		poolable = new Set();

	for (const entry of strings.values()) {
		// Short strings must also pay for table lookups and multi-character references.
		const savings = poolingSavings(entry) - entry.count - 8;

		if (entry.count > 1 && entry.value.length >= 4 && savings > 0) {
			poolable.add(entry);
		}
	}

	for (const configuration of sharedConfigurations) {
		const entries = [...strings.values()].filter(entry => entry.value.length >= configuration.minimumLength || configuration.includePooled && poolable.has(entry));

		if (entries.length < 2 || sharedCounts.has(entries.length)) {
			continue;
		}

		// These candidate sets are nested, so equal counts mean identical contents.
		sharedCounts.add(entries.length);

		const values = entries.map(entry => entry.value),
			delimiter = delimiters.find(candidate => values.every(value => !value.includes(candidate))),
			formats = [{ strategy: "concat/slice", separator: "" }];

		if (delimiter !== undefined) {
			formats.push({ strategy: "delimiter/split", separator: delimiter });
			formats.push({ strategy: "delimiter/split", separator: delimiter, destructure: true });
		}

		for (const format of formats) {
			const compressed = brotliCompressSync(Buffer.from(values.join(format.separator)), compressionOptions),
				strategy = configuration.includePooled ? `${format.strategy} + pooled strings` : format.strategy,
				extraction = format.destructure ? "destructured" : format.strategy === "delimiter/split" ? "indexed" : "slice",
				key = `${strategy}:${extraction}`;

			for (const encoding of encodings) {
				const payload = new UglifyJS.AST_String({ value: encoding.encode(compressed) }),
					code = buildSharedVariant(ast, entries, payload, encoding, decoderName, payloadName, sliceName, moduleSyntax, format),
					previous = sharedVariants.get(key);

				const variant = {
					code: code,
					count: entries.length,
					encoding: encoding.name,
					strategy: strategy,
					extraction: extraction,
					ordering: "original",
					table: {
						ast: ast,
						entries: entries,
						universe: [...strings.values()],
						compressed: compressed,
						encoding: encoding,
						decoderName: decoderName,
						payloadName: payloadName,
						sliceName: sliceName,
						moduleSyntax: moduleSyntax,
						format: format
					}
				};

				searchCandidates.push(variant);

				if (Buffer.byteLength(code) < Buffer.byteLength(previous ? previous.code : source)) {
					sharedVariants.set(key, variant);
				}
			}
		}
	}

	for (const variant of sharedVariants.values()) {
		variants.push(variant);

		if (Buffer.byteLength(variant.code) < Buffer.byteLength(best.code)) {
			best = variant;
		}
	}

	return { ...best, variants: variants, candidates: searchCandidates, cssAlternative: cssAlternative, cssAlternatives: cssAlternatives };
}

export function orderStringTable(variant, limit = maximumOrderingTrials, frequency = false) {
	if (!variant.table) {
		return [];
	}

	const table = variant.table,
		orders = [],
		orderings = frequency ? [frequencyOrdering, ...tableOrderings] : tableOrderings;

	for (const ordering of orderings) {
		const entries = [...table.entries].sort(ordering.compare),
			unchanged = entries.every((entry, index) => entry === table.entries[index]),
			duplicate = orders.some(order => entries.every((entry, index) => entry === order.entries[index]));

		if (unchanged || duplicate) {
			continue;
		}

		const values = entries.map(entry => entry.value),
			compressed = brotliCompressSync(Buffer.from(values.join(table.format.separator)), compressionOptions),
			payload = new UglifyJS.AST_String({ value: table.encoding.encode(compressed) });

		orders.push({
			name: ordering.name,
			entries: entries,
			compressed: compressed,
			bytes: Buffer.byteLength(payload.print_to_string(outputOptions))
		});
	}

	// Rank cheaply by escaped payload size, then fully minify and pool only two alternatives.
	if (!frequency) {
		orders.sort((first, second) => first.bytes - second.bytes);
	}

	return orders.slice(0, limit).map(order => tableVariant(variant, {
		...table,
		entries: order.entries,
		compressed: order.compressed
	}, order.name));
}

export function changeStringTable(variant, entries = variant.table.entries, format = variant.table.format) {
	const table = variant.table,
		values = entries.map(entry => entry.value),
		separator = format.strategy === "delimiter/split" ? delimiters.find(candidate => values.every(value => !value.includes(candidate))) : "";

	if (entries.length === 0 || separator === undefined) {
		return;
	}

	return tableVariant(variant, {
		...table,
		entries: entries,
		format: { ...format, separator: separator, contextual: true },
		compressed: brotliCompressSync(Buffer.from(values.join(separator)), compressionOptions)
	}, variant.ordering);
}

function tableVariant(variant, table, ordering) {
	const payload = new UglifyJS.AST_String({ value: table.encoding.encode(table.compressed) }),
		code = buildSharedVariant(table.ast, table.entries, payload, table.encoding, table.decoderName, table.payloadName, table.sliceName, table.moduleSyntax, table.format);

	return {
		...variant,
		code: code,
		count: table.entries.length,
		extraction: table.format.mixed ? "mixed" : table.format.direct ? "direct" : variant.extraction,
		encoding: table.encoding.name,
		ordering: ordering,
		table: table
	};
}

function compareEntries(first, second) {
	return first.value < second.value ? -1 : first.value > second.value ? 1 : 0;
}

function compareSuffixes(first, second) {
	const length = Math.min(first.value.length, second.value.length);

	for (let index = 1; index <= length; index++) {
		const difference = first.value.charCodeAt(first.value.length - index) - second.value.charCodeAt(second.value.length - index);

		if (difference !== 0) {
			return difference;
		}
	}

	return first.value.length - second.value.length;
}

function buildVariant(ast, candidates, encoding, decoderName, moduleSyntax) {
	const replacements = new Map(),
		definitions = [];

	for (const candidate of candidates) {
		replacements.set(candidate.entry.value, candidate.entry.name);

		definitions.push(new UglifyJS.AST_VarDef({
			name: new UglifyJS.AST_SymbolConst({
				name: candidate.entry.name
			}),
			value: new UglifyJS.AST_Await({
				expression: new UglifyJS.AST_Call({
					expression: new UglifyJS.AST_SymbolRef({ name: decoderName }),
					args: [candidate.payload.clone()]
				})
			})
		}));
	}

	return buildProgram(ast, replacements, definitions, encoding, decoderName, moduleSyntax);
}

function buildSharedVariant(ast, entries, payload, encoding, decoderName, payloadName, sliceName, moduleSyntax, format) {
	const replacements = new Map(),
		definitions = [],
		decoded = new UglifyJS.AST_Await({
			expression: new UglifyJS.AST_Call({
				expression: new UglifyJS.AST_SymbolRef({ name: decoderName }),
				args: [payload]
			})
		}),
		split = format.strategy === "delimiter/split";

	if (format.destructure) {
		const elements = entries.map(entry => {
			replacements.set(entry.value, entry.name);

			return new UglifyJS.AST_SymbolConst({ name: entry.name });
		});

		definitions.push(new UglifyJS.AST_VarDef({
			name: new UglifyJS.AST_DestructuredArray({ elements: elements }),
			value: new UglifyJS.AST_Call({
				expression: new UglifyJS.AST_Dot({ expression: decoded, property: "split" }),
				args: [new UglifyJS.AST_String({ value: format.separator })]
			})
		}));

		return buildProgram(ast, replacements, definitions, encoding, decoderName, moduleSyntax, format.contextual);
	}

	definitions.push(new UglifyJS.AST_VarDef({
		name: new UglifyJS.AST_SymbolConst({ name: payloadName }),
		value: split ? new UglifyJS.AST_Call({
			expression: new UglifyJS.AST_Dot({ expression: decoded, property: "split" }),
			args: [new UglifyJS.AST_String({ value: format.separator })]
		}) : decoded
	}));

	if (!split) {
		definitions.push(new UglifyJS.AST_VarDef({
			name: new UglifyJS.AST_SymbolConst({ name: sliceName }),
			value: UglifyJS.parse(`(start,end)=>${payloadName}.slice(start,end)`, { expression: true })
		}));
	}

	let offset = 0;

	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index],
			end = offset + entry.value.length;

		const lookup = split ? new UglifyJS.AST_Sub({
			expression: new UglifyJS.AST_SymbolRef({ name: payloadName }),
			property: new UglifyJS.AST_Number({ value: index })
		}) : new UglifyJS.AST_Call({
			expression: new UglifyJS.AST_SymbolRef({ name: sliceName }),
			args: [new UglifyJS.AST_Number({ value: offset }), new UglifyJS.AST_Number({ value: end })]
		});

		if (split && (format.direct || format.mixed && entry.count < format.mixed)) {
			replacements.set(entry.value, lookup);
			offset = end;

			continue;
		}

		replacements.set(entry.value, entry.name);
		definitions.push(new UglifyJS.AST_VarDef({
			name: new UglifyJS.AST_SymbolConst({ name: entry.name }),
			value: lookup
		}));

		// String.length counts UTF-16 code units, matching the runtime slice offsets.
		offset = end;
	}

	return buildProgram(ast, replacements, definitions, encoding, decoderName, moduleSyntax, format.contextual);
}

function buildProgram(ast, replacements, definitions, encoding, decoderName, moduleSyntax, contextual = false) {
	const transformed = transformStrings(ast.clone(true), (value, literal, context) => {
		const replacement = replacements.get(value);

		if (replacement) {
			const expression = typeof replacement === "string" ? new UglifyJS.AST_SymbolRef({ name: replacement }) : replacement.clone(true);

			if (!contextual || replacementSavings(value, literal, expression, context) > 0) {
				return expression;
			}
		}
	});

	const initialization = new UglifyJS.AST_Const({ definitions: definitions }),
		decoder = UglifyJS.parse(`(${encoding.decode.toString()})`, { expression: true });

	decoder.name = null;

	if (moduleSyntax) {
		const helper = new UglifyJS.AST_Const({
			definitions: [new UglifyJS.AST_VarDef({
				name: new UglifyJS.AST_SymbolConst({ name: decoderName }),
				value: decoder
			})]
		});

		transformed.body.unshift(helper, initialization);

		return minify(transformed);
	}

	// Pass the decoder from outside the input's scope so its globals cannot be shadowed.
	const wrapper = new UglifyJS.AST_Call({
		expression: new UglifyJS.AST_AsyncArrow({
			argnames: [new UglifyJS.AST_SymbolFunarg({ name: decoderName })],
			body: [initialization, ...transformed.body]
		}),
		args: [decoder]
	});

	transformed.body = [new UglifyJS.AST_SimpleStatement({ body: wrapper })];

	return minify(transformed);
}

export function transformStrings(ast, replace, cssOnly = false) {
	return ast.transform(new UglifyJS.TreeTransformer(function (node, descend) {
		if (node instanceof UglifyJS.AST_Import || node instanceof UglifyJS.AST_ExportForeign) {
			return node;
		}

		if (cssOnly) {
			if (node instanceof UglifyJS.AST_Template && (node.tag || node.expressions.length > 0)) {
				return node;
			}

			const parent = this.parent(),
				property = parent instanceof UglifyJS.AST_ObjectProperty || parent instanceof UglifyJS.AST_ClassProperty || parent instanceof UglifyJS.AST_DestructuredKeyVal;

			if (property && parent.key === node || parent instanceof UglifyJS.AST_Sub && parent.property === node) {
				return node;
			}
		}

		descend(node, this);

		if (node instanceof UglifyJS.AST_String) {
			return replace(node.value, node, "literal") ?? node;
		}

		if (node instanceof UglifyJS.AST_Template && !node.tag) {
			const replacements = node.strings.map(raw => replace(decodeTemplate(raw), new UglifyJS.AST_Template({ strings: [raw], expressions: [] }), node.expressions.length > 0 ? "template" : "literal"));

			if (!replacements.some(Boolean)) {
				return node;
			}

			if (node.expressions.length === 0) {
				return replacements[0];
			}

			const strings = [""],
				expressions = [];

			for (let index = 0; index < node.strings.length; index++) {
				if (replacements[index]) {
					expressions.push(replacements[index]);
					strings.push("");
				} else {
					strings[strings.length - 1] = node.strings[index];
				}

				if (index < node.expressions.length) {
					expressions.push(node.expressions[index]);
					strings.push("");
				}
			}

			return new UglifyJS.AST_Template({ strings: strings, expressions: expressions });
		}

		if (cssOnly) {
			return node;
		}

		const property = node instanceof UglifyJS.AST_ObjectProperty || node instanceof UglifyJS.AST_ClassProperty || node instanceof UglifyJS.AST_DestructuredKeyVal,
			constructor = node instanceof UglifyJS.AST_ClassProperty && node.key === "constructor";

		if (property && typeof node.key === "string" && node.key !== "__proto__" && !node.key.startsWith("#") && !constructor) {
			const replacement = replace(node.key, new UglifyJS.AST_String({ value: node.key }), "key");

			if (replacement) {
				node.key = replacement;
			}
		}

		if (node instanceof UglifyJS.AST_Dot && !node.property.startsWith("#")) {
			const replacement = replace(node.property, new UglifyJS.AST_String({ value: node.property }), "dot");

			if (replacement) {
				return new UglifyJS.AST_Sub({
					expression: node.expression,
					property: replacement,
					optional: node.optional
				});
			}
		}

		return node;
	}));
}

export function replacementSavings(value, literal, replacement, context) {
	// Generated bindings normally receive one or two ASCII bytes. Use two during
	// candidate construction; complete emitted bytes decide every accepted trial.
	const expression = replacement.clone(true).transform(new UglifyJS.TreeTransformer(node => {
		if (node instanceof UglifyJS.AST_SymbolRef) {
			return new UglifyJS.AST_SymbolRef({ name: "aa" });
		}
	}));

	let original = Buffer.byteLength(literal.print_to_string(outputOptions)),
		cost = Buffer.byteLength(expression.print_to_string(outputOptions));

	if (context === "dot") {
		original = Buffer.byteLength(value) + 1;
		cost += 2;
	} else if (context === "key") {
		const property = new UglifyJS.AST_ObjectKeyVal({ key: value, value: new UglifyJS.AST_Number({ value: 0 }) }),
			object = new UglifyJS.AST_Object({ properties: [property] });

		original = Buffer.byteLength(object.print_to_string(outputOptions)) - 4;
		cost += 2;
	} else if (context === "template") {
		original -= 2;
		cost += 3;
	}

	return original - cost;
}

function decodeTemplate(raw) {
	// Let the JavaScript parser decode escapes without evaluating input code.
	const quoted = raw.replace(/\\(?:\r\n|[\s\S])|\r\n|["\r\n\u2028\u2029]/g, escape => {
		if (escape.startsWith("\\")) {
			if (escape === "\\\r\n" || escape === "\\\r" || escape === "\\\n" || escape === "\\\u2028" || escape === "\\\u2029") {
				return "";
			}

			return escape;
		}

		if (escape === "\u2028") {
			return "\\u2028";
		}

		if (escape === "\u2029") {
			return "\\u2029";
		}

		return escape === '"' ? '\\"' : "\\n";
	});

	return UglifyJS.parse(`"${quoted}"`, { expression: true }).value;
}

export function uniqueName(names, prefix) {
	let suffix = names.size,
		name = `${prefix}${suffix}`;

	while (names.has(name)) {
		name = `${prefix}${++suffix}`;
	}

	names.add(name);

	return name;
}

export function poolingSavings(entry) {
	const literal = new UglifyJS.AST_String({ value: entry.value }),
		payloadBytes = Buffer.byteLength(literal.print_to_string(outputOptions));

	return entry.literalBytes - payloadBytes - entry.count - 3;
}
