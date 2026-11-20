import UglifyJS from "uglify-js";
import { poolingSavings, transformStrings, uniqueName } from "./compress-strings.js";
import { minify, outputOptions } from "./minify.js";

const maximumPruningTrials = 8;

export function poolStrings(source) {
	const ast = UglifyJS.parse(source, { module: true }),
		names = new Set(),
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

	transformStrings(ast, (value, literal) => {
		let entry = strings.get(value);

		if (!entry) {
			entry = {
				value: value,
				name: uniqueName(names, "__pooled"),
				count: 0,
				literalBytes: 0,
				savings: 0
			};

			strings.set(value, entry);
		}

		entry.count++;
		entry.literalBytes += Buffer.byteLength(literal.print_to_string(outputOptions));
	});

	let candidates = [];

	for (const entry of strings.values()) {
		entry.savings = poolingSavings(entry);

		if (entry.count > 1 && entry.savings > 0) {
			candidates.push(entry);
		}
	}

	candidates.sort((first, second) => second.savings - first.savings);

	if (candidates.length === 0) {
		return { code: source, count: 0 };
	}

	let code = buildVariant(ast, candidates, moduleSyntax),
		trials = 0;

	// Bound whole-program minifications; large string pools otherwise require hundreds of trials.
	for (let size = Math.ceil(candidates.length / 2); size >= 1 && trials < maximumPruningTrials; size = Math.floor(size / 2)) {
		for (let end = candidates.length; end > 0 && trials < maximumPruningTrials; end -= size) {
			trials++;

			const start = Math.max(0, end - size),
				trial = candidates.filter((entry, index) => index < start || index >= end),
				trialCode = trial.length === 0 ? source : buildVariant(ast, trial, moduleSyntax);

			if (Buffer.byteLength(trialCode) <= Buffer.byteLength(code)) {
				candidates = trial;
				code = trialCode;
			}
		}
	}

	if (Buffer.byteLength(code) >= Buffer.byteLength(source)) {
		return { code: source, count: 0 };
	}

	return { code: code, count: candidates.length };
}

function buildVariant(ast, candidates, moduleSyntax) {
	const replacements = new Map(),
		definitions = [];

	for (const entry of candidates) {
		replacements.set(entry.value, entry.name);

		definitions.push(new UglifyJS.AST_VarDef({
			name: new UglifyJS.AST_SymbolConst({ name: entry.name }),
			value: new UglifyJS.AST_String({ value: entry.value })
		}));
	}

	const transformed = transformStrings(ast.clone(true), value => {
		const name = replacements.get(value);

		if (name) {
			return new UglifyJS.AST_SymbolRef({ name: name });
		}
	});

	const initialization = new UglifyJS.AST_Const({ definitions: definitions });

	if (moduleSyntax) {
		transformed.body.unshift(initialization);
	} else {
		const wrapper = new UglifyJS.AST_Call({
			expression: new UglifyJS.AST_Arrow({
				argnames: [],
				body: [initialization, ...transformed.body]
			}),
			args: []
		});

		transformed.body = [new UglifyJS.AST_SimpleStatement({ body: wrapper })];
	}

	return minify(transformed);
}
