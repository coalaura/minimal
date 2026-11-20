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

const runtimeGlobals = ["Response", "Blob", "Uint8Array", "DecompressionStream"];

export async function compressStrings(source) {
	let ast = UglifyJS.parse(source, { module: true });

	const literals = new Set();

	transformStrings(ast, value => {
		literals.add(value);
	}, true);

	const stylesheets = await minifyStylesheets(literals);

	if (stylesheets.size > 0) {
		transformStrings(ast, value => {
			const stylesheet = stylesheets.get(value);

			if (stylesheet !== undefined) {
				return new UglifyJS.AST_String({ value: stylesheet });
			}
		}, true);

		const code = minify(ast);

		if (Buffer.byteLength(code) < Buffer.byteLength(source)) {
			source = code;
		}

		ast = UglifyJS.parse(source, { module: true });
	}

	const names = new Set(),
		strings = new Map();

	let moduleSyntax = false;

	ast.walk(new UglifyJS.TreeWalker(function(node) {
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
		encoding: null
	};

	if (moduleSyntax) {
		ast.figure_out_scope();

		// A module cannot put its decoder outside the scope of these bindings.
		if (runtimeGlobals.some(name => ast.variables.get(name))) {
			return best;
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
			changed = true;

		// Measure the complete minified program, including shared startup overhead.
		while (changed && candidates.length > 0) {
			changed = false;

			for (let index = candidates.length - 1; index >= 0; index--) {
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
				encoding: encoding.name
			};
		}
	}

	return best;
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

	const transformed = transformStrings(ast.clone(true), value => {
		const name = replacements.get(value);

		if (name) {
			return new UglifyJS.AST_SymbolRef({ name: name });
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
	return ast.transform(new UglifyJS.TreeTransformer(function(node, descend) {
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
			return replace(node.value, node) ?? node;
		}

		if (node instanceof UglifyJS.AST_Template && !node.tag) {
			const replacements = node.strings.map(raw => replace(decodeTemplate(raw), new UglifyJS.AST_Template({ strings: [raw], expressions: [] })));

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
			const replacement = replace(node.key, new UglifyJS.AST_String({ value: node.key }));

			if (replacement) {
				node.key = replacement;
			}
		}

		if (node instanceof UglifyJS.AST_Dot && !node.property.startsWith("#")) {
			const replacement = replace(node.property, new UglifyJS.AST_String({ value: node.property }));

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
