import UglifyJS from "uglify-js";
import { minify } from "./minify.js";

const unknown = Symbol("unknown"),
	primitive = Symbol("primitive"),
	reserved = new Set(["__proto__", "prototype", "constructor", "toString", "toLocaleString", "valueOf", "toJSON", "then", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]),
	alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_";

// A monotone, allocation-site analysis. Unknown flows poison candidates rather
// than proving safety from spelling, nominal types, or a particular call site.
export function mangleProperties(source, options = {}) {
	const ast = UglifyJS.parse(source, { module: true });

	ast.figure_out_scope();

	const nodes = [],
		parents = new Map(),
		owners = new Map(),
		tokens = new Map(),
		values = new Map(),
		bindings = new Map(),
		propertyOwners = new Map(),
		accesses = [],
		occupied = new Set(reserved);

	let changed = false,
		dynamic = false,
		complete = false;

	ast.walk(new UglifyJS.TreeWalker(function(node) {
		nodes.push(node);
		parents.set(node, this.parent());
		owners.set(node, this.find_parent(UglifyJS.AST_Lambda));

		if (node instanceof UglifyJS.AST_With || node instanceof UglifyJS.AST_Call && node.expression instanceof UglifyJS.AST_SymbolRef && node.expression.name === "eval") {
			dynamic = true;
		}

		if (node instanceof UglifyJS.AST_PropAccess) {
			accesses.push(node);
			occupied.add(propertyName(node));

			if (["prototype", "__proto__", "getPrototypeOf", "setPrototypeOf", "caller", "callee"].includes(propertyName(node))) {
				dynamic = true;
			}
		}

		if (typeof node.key === "string") {
			occupied.add(node.key);
		}

		let kind;

		if (node instanceof UglifyJS.AST_Lambda) {
			kind = "function";
		} else if (node instanceof UglifyJS.AST_Class) {
			kind = "class";
		} else if (node instanceof UglifyJS.AST_Object) {
			kind = "object";
		} else if (node instanceof UglifyJS.AST_New) {
			kind = "instance";
		}

		if (kind) {
			const token = {
				node: node,
				kind: kind,
				fields: new Map(),
				links: new Set(),
				bases: new Set(),
				arguments: new Set(),
				receivers: new Set(),
				returns: new Set(),
				classOwner: null,
				unsafe: false
			};

			tokens.set(node, token);

			if (kind !== "instance") {
				values.set(node, new Set([token]));
			}
		}
	}));

	if (dynamic) {
		return { code: source, count: 0 };
	}

	function merge(destination, incoming) {
		for (const value of incoming) {
			if (!destination.has(value)) {
				destination.add(value);

				changed = true;
			}
		}
	}

	function get(node) {
		if (!node) {
			return new Set([primitive]);
		}

		if (!values.has(node)) {
			values.set(node, new Set());
		}

		return values.get(node);
	}

	function binding(symbol) {
		const definition = symbol.definition();

		if (!bindings.has(definition)) {
			bindings.set(definition, new Set(definition.undeclared ? [unknown] : []));
		}

		return bindings.get(definition);
	}

	function field(token, name) {
		if (!token.fields.has(name)) {
			token.fields.set(name, new Set());
		}

		return token.fields.get(name);
	}

	function reject(incoming) {
		for (const token of incoming) {
			if (typeof token === "object") {
				token.unsafe = true;
			}
		}
	}

	function connect(first, second) {
		first.links.add(second);
		second.links.add(first);
	}

	function lexicalOwner(node) {
		let owner = owners.get(node);

		while (owner instanceof UglifyJS.AST_Arrow || owner instanceof UglifyJS.AST_AsyncArrow) {
			owner = owners.get(owner);
		}

		return tokens.get(owner);
	}

	function lookup(token, name, visited = new Set()) {
		if (typeof token !== "object") {
			return new Set([unknown]);
		}

		if (visited.has(token)) {
			return new Set();
		}

		visited.add(token);

		const result = new Set(token.fields.get(name));

		for (const base of token.bases) {
			// Include overridden methods as well: flow-insensitive receiver unions
			// deliberately overapproximate dispatch across an inheritance family.
			for (const value of lookup(base, name, visited)) {
				result.add(value);
			}
		}

		if (complete && result.size === 0) {
			result.add(unknown);
		}

		return result;
	}

	function receivers(access) {
		if (access.expression instanceof UglifyJS.AST_Super) {
			const owner = lexicalOwner(access);

			return owner?.classOwner?.bases ?? new Set([unknown]);
		}

		return get(access.expression);
	}

	function assign(target, incoming) {
		if (target instanceof UglifyJS.AST_Symbol) {
			merge(binding(target), incoming);

			if (target.definition().undeclared || target.definition().exported) {
				reject(incoming);
			}
		} else if (target instanceof UglifyJS.AST_PropAccess) {
			const name = propertyName(target),
				objects = get(target.expression);

			for (const token of objects) {
				if (typeof token !== "object" || name === undefined) {
					reject(incoming);
					reject(objects);
				} else {
					merge(field(token, name), incoming);

					for (const value of incoming) {
						if (typeof value === "object" && value.kind === "function") {
							connect(token, value);
						}
					}
				}
			}
		} else {
			reject(incoming);
		}
	}

	function invoke(callable, args, receiver) {
		if (typeof callable !== "object" || callable.kind !== "function") {
			return;
		}

		const lambda = callable.node;

		for (const argument of args) {
			merge(callable.arguments, get(argument));
		}

		if (lambda.TYPE.includes("Async") || lambda.TYPE.includes("Generator") || lambda.rest || args.some(argument => argument instanceof UglifyJS.AST_Spread)) {
			callable.unsafe = true;
		}

		if (!(lambda instanceof UglifyJS.AST_Arrow)) {
			merge(callable.receivers, receiver);
		}

		for (let index = 0; index < lambda.argnames.length; index++) {
			assign(lambda.argnames[index], get(args[index]));
		}
	}

	function constructors(token, visited = new Set()) {
		if (visited.has(token)) {
			return new Set();
		}

		visited.add(token);

		if (token.fields.has("constructor")) {
			return token.fields.get("constructor");
		}

		const result = new Set();

		for (const base of token.bases) {
			for (const callable of constructors(base, visited)) {
				result.add(callable);
			}
		}

		return result;
	}

	for (const token of tokens.values()) {
		const node = token.node;

		if (token.kind === "function" || token.kind === "class") {
			if (node.name) {
				merge(binding(node.name), [token]);

				if (node.name.definition().exported) {
					token.unsafe = true;
				}
			}
		}

		if (token.kind === "function" && !terminates(node.body.at(-1))) {
			merge(token.returns, [primitive]);
		}

		if (token.kind !== "object" && token.kind !== "class") {
			continue;
		}

		const names = new Set();

		for (const property of node.properties) {
			const name = property.key;

			if (typeof name !== "string" || property.static || property.private || names.has(name) || property instanceof UglifyJS.AST_ObjectGetter || property instanceof UglifyJS.AST_ObjectSetter || property instanceof UglifyJS.AST_ClassGetter || property instanceof UglifyJS.AST_ClassSetter || property instanceof UglifyJS.AST_ClassField || reserved.has(name) && !(token.kind === "class" && name === "constructor")) {
				token.unsafe = true;
			}

			names.add(name);
			propertyOwners.set(property, token);

			const callable = tokens.get(property.value);

			if (callable?.kind === "function") {
				connect(token, callable);

				if (token.kind === "class") {
					callable.classOwner = token;
				}
			}
		}
	}

	const roundLimit = options.roundLimit ?? 64;

	for (let round = 0; ; round++) {
		changed = false;

		for (let index = nodes.length - 1; index >= 0; index--) {
			const node = nodes[index],
				result = get(node),
				token = tokens.get(node);

			if (node instanceof UglifyJS.AST_This) {
				merge(result, lexicalOwner(node)?.receivers ?? [unknown]);
			} else if (node instanceof UglifyJS.AST_Super) {
				merge(result, lexicalOwner(node)?.receivers ?? [unknown]);
			} else if (node instanceof UglifyJS.AST_SymbolRef) {
				merge(result, binding(node));

				if (complete && result.size === 0) {
					merge(result, [unknown]);
				}
			} else if (node instanceof UglifyJS.AST_Constant) {
				merge(result, [primitive]);
			} else if (node instanceof UglifyJS.AST_VarDef) {
				assign(node.name, get(node.value));
			} else if (node instanceof UglifyJS.AST_Assign) {
				const incoming = node.operator === "=" || ["&&=", "||=", "??="].includes(node.operator) ? get(node.right) : [primitive];

				assign(node.left, incoming);
				merge(result, incoming);
			} else if (node instanceof UglifyJS.AST_PropAccess) {
				const name = propertyName(node);

				for (const object of receivers(node)) {
					merge(result, name === undefined ? [unknown] : lookup(object, name));
				}
			} else if (node instanceof UglifyJS.AST_New) {
				for (const constructor of get(node.expression)) {
					if (typeof constructor !== "object" || constructor.kind !== "class") {
						token.unsafe = true;
						merge(result, [unknown]);

						continue;
					}

					merge(token.bases, [constructor]);
					connect(token, constructor);
					merge(result, [token]);

					for (const callable of constructors(constructor)) {
						invoke(callable, node.args, [token]);
						merge(result, [...callable.returns].filter(value => value !== primitive));
					}
				}
			} else if (node instanceof UglifyJS.AST_Call) {
				if (node.expression instanceof UglifyJS.AST_Super) {
					const owner = lexicalOwner(node);

					for (const base of owner?.classOwner?.bases ?? []) {
						for (const callable of constructors(base)) {
							invoke(callable, node.args, owner.receivers);
						}
					}

					merge(result, owner?.receivers ?? [unknown]);
				} else {
					const receiver = node.expression instanceof UglifyJS.AST_PropAccess ? get(node.expression.expression) : [primitive];

					for (const callable of get(node.expression)) {
						invoke(callable, node.args, receiver);
						merge(result, typeof callable === "object" && callable.kind === "function" ? callable.returns : [unknown]);
					}
				}
			} else if (node instanceof UglifyJS.AST_Return) {
				const owner = tokens.get(owners.get(node));

				if (owner) {
					merge(owner.returns, get(node.value));
				}
			} else if (node instanceof UglifyJS.AST_Sequence) {
				merge(result, get(node.expressions.at(-1)));
			} else if (node instanceof UglifyJS.AST_Conditional) {
				merge(result, get(node.consequent));
				merge(result, get(node.alternative));
			} else if (node instanceof UglifyJS.AST_Binary) {
				if (["&&", "||", "??"].includes(node.operator)) {
					merge(result, get(node.left));
					merge(result, get(node.right));
				} else {
					merge(result, [primitive]);
				}
			} else if (node instanceof UglifyJS.AST_Unary || node instanceof UglifyJS.AST_Template) {
				merge(result, [primitive]);
			} else if (!token) {
				merge(result, [unknown]);
			}

			const propertyOwner = propertyOwners.get(node);

			if (propertyOwner && typeof node.key === "string") {
				merge(field(propertyOwner, node.key), get(node.value));
			} else if (propertyOwner) {
				reject(get(node.value));
				reject(get(node.expression));
				reject(get(node.key));
			}

			if (token?.kind === "class" && node.extends) {
				for (const base of get(node.extends)) {
					if (typeof base !== "object" || base.kind !== "class") {
						token.unsafe = true;
					} else {
						merge(token.bases, [base]);
						connect(token, base);
					}
				}
			}
		}

		if (!changed) {
			if (complete) {
				break;
			}

			complete = true;
		}

		if (round >= roundLimit) {
			return { code: source, count: 0 };
		}
	}

	for (const node of nodes) {
		const parent = parents.get(node),
			incoming = get(node);

		if (node instanceof UglifyJS.AST_Call) {
			const callables = get(node.expression),
				kind = node instanceof UglifyJS.AST_New ? "class" : "function",
				known = node.expression instanceof UglifyJS.AST_Super || callables.size > 0 && [...callables].every(token => typeof token === "object" && token.kind === kind);

			if (!known || node.args.some(argument => argument instanceof UglifyJS.AST_Spread)) {
				reject(callables);

				for (const argument of node.args) {
					reject(get(argument));
				}

				if (node.expression instanceof UglifyJS.AST_PropAccess) {
					reject(get(node.expression.expression));
				}
			}
		}

		if (node instanceof UglifyJS.AST_Assign && !["=", "&&=", "||=", "??="].includes(node.operator)) {
			reject(get(node.left));
			reject(get(node.right));
		}

		if (node instanceof UglifyJS.AST_SymbolRef && (node.name === "arguments" || node.definition().exported)) {
			reject(incoming);

			if (node.name === "arguments") {
				const owner = lexicalOwner(node);

				if (owner) {
					owner.unsafe = true;
				}
			}
		}

		if (!parent || ![...incoming].some(value => typeof value === "object")) {
			continue;
		}

		const declaration = (node instanceof UglifyJS.AST_Defun || node instanceof UglifyJS.AST_DefClass) && !node.name.definition().exported,
			storage = parent instanceof UglifyJS.AST_VarDef && parent.name instanceof UglifyJS.AST_Symbol || parent instanceof UglifyJS.AST_Assign || propertyOwners.has(parent),
			flow = parent instanceof UglifyJS.AST_Call || parent instanceof UglifyJS.AST_Return || parent instanceof UglifyJS.AST_Sequence || parent instanceof UglifyJS.AST_Conditional || parent instanceof UglifyJS.AST_SimpleStatement || parent instanceof UglifyJS.AST_Lambda,
			receiver = parent instanceof UglifyJS.AST_PropAccess && parent.expression === node || parent instanceof UglifyJS.AST_Class && parent.extends === node,
			nonCoercing = parent instanceof UglifyJS.AST_Binary && ["&&", "||", "??", "===", "!=="].includes(parent.operator) || parent instanceof UglifyJS.AST_Unary && ["!", "void", "typeof"].includes(parent.operator) || parent.condition === node,
			safeUse = declaration || storage || flow || receiver || nonCoercing;

		if (!safeUse) {
			reject(incoming);
		}
	}

	for (const access of accesses) {
		const objects = receivers(access),
			name = propertyName(access),
			parent = parents.get(access),
			invalid = name === undefined || reserved.has(name) || objects.size === 0 || [...objects].some(token => typeof token !== "object" || token.kind === "function" || token.kind === "class" && !(access.expression instanceof UglifyJS.AST_Super));

		// Dynamic function properties may expose caller/arguments, reaching values
		// through the call stack rather than through explicit data-flow edges.
		if (name === undefined && [...objects].some(token => typeof token === "object" && token.kind === "function")) {
			return { code: source, count: 0 };
		}

		if (invalid || parent instanceof UglifyJS.AST_UnaryPrefix && parent.operator === "delete") {
			reject(objects);
		}
	}

	for (const token of tokens.values()) {
		if (token.kind !== "class") {
			continue;
		}

		// Replacement objects returned from constructors can replace a derived
		// receiver during super(). Reject that family instead of assuming its shape.
		for (const callable of token.fields.get("constructor") ?? []) {
			if ([...callable.returns].some(value => value !== primitive)) {
				token.unsafe = true;
			}
		}
	}

	// Escaped functions expose their closures, arguments and return values. Escaped
	// containers expose their reachable fields; class families share method definitions.
	let poisoned;

	do {
		poisoned = false;

		for (const token of tokens.values()) {
			if (!token.unsafe) {
				continue;
			}

			const exposed = new Set(token.links);

			for (const contents of token.fields.values()) {
				for (const value of contents) {
					exposed.add(value);
				}
			}

			if (token.kind === "function") {
				for (const value of token.arguments) {
					exposed.add(value);
				}

				for (const value of token.receivers) {
					exposed.add(value);
				}

				for (const value of token.returns) {
					exposed.add(value);
				}

				token.node.walk(new UglifyJS.TreeWalker(node => {
					for (const value of get(node)) {
						exposed.add(value);
					}
				}));
			}

			for (const value of exposed) {
				if (typeof value === "object" && !value.unsafe) {
					value.unsafe = true;
					poisoned = true;
				}
			}
		}
	} while (poisoned);

	const candidates = new Map(),
		blocked = new Set(reserved);

	for (const token of tokens.values()) {
		for (const name of token.fields.keys()) {
			if (token.unsafe) {
				blocked.add(name);
			}
		}
	}

	function record(name, node) {
		if (!candidates.has(name)) {
			candidates.set(name, []);
		}

		candidates.get(name).push(node);
	}

	for (const [property, token] of propertyOwners) {
		if (!token.unsafe && typeof property.key === "string") {
			record(property.key, property);
		}
	}

	for (const access of accesses) {
		const objects = receivers(access),
			name = propertyName(access);

		if (objects.size > 0 && [...objects].every(token => typeof token === "object" && !token.unsafe && hasProperty(token, name))) {
			record(name, access);
		} else {
			// Any partially accounted access prevents a shared spelling from moving.
			for (const token of objects) {
				if (typeof token === "object") {
					blocked.add(name);
				}
			}
		}
	}

	const ranked = [...candidates].filter(([name]) => !blocked.has(name)).sort((first, second) => second[1].length * Buffer.byteLength(second[0]) - first[1].length * Buffer.byteLength(first[0]));

	let nextName = 0,
		count = 0;

	for (const [name, references] of ranked) {
		let replacement;

		do {
			replacement = propertyIdentifier(nextName++);
		} while (occupied.has(replacement));

		occupied.add(replacement);

		if (Buffer.byteLength(replacement) >= Buffer.byteLength(name)) {
			continue;
		}

		for (const node of references) {
			if (node instanceof UglifyJS.AST_Dot) {
				node.property = replacement;
			} else if (node instanceof UglifyJS.AST_Sub) {
				node.property = new UglifyJS.AST_String({ value: replacement });
			} else {
				node.key = replacement;
			}
		}

		count++;
	}

	if (count === 0) {
		return { code: source, count: 0 };
	}

	const code = minify(ast);

	return Buffer.byteLength(code) < Buffer.byteLength(source) ? { code: code, count: count } : { code: source, count: 0 };
}

function propertyName(node) {
	if (node instanceof UglifyJS.AST_Dot) {
		return node.property;
	}

	if (node instanceof UglifyJS.AST_Sub && node.property instanceof UglifyJS.AST_String) {
		return node.property.value;
	}
}

function hasProperty(token, name, visited = new Set()) {
	if (visited.has(token)) {
		return false;
	}

	visited.add(token);

	return token.fields.has(name) || [...token.bases].some(base => hasProperty(base, name, visited));
}

function terminates(node) {
	if (node instanceof UglifyJS.AST_Return || node instanceof UglifyJS.AST_Throw) {
		return true;
	}

	if (node instanceof UglifyJS.AST_BlockStatement) {
		return terminates(node.body.at(-1));
	}

	return node instanceof UglifyJS.AST_If && terminates(node.body) && terminates(node.alternative);
}

function propertyIdentifier(index) {
	if (index < alphabet.length) {
		return alphabet[index];
	}

	return `${propertyIdentifier(Math.floor(index / alphabet.length) - 1)}${alphabet[index % alphabet.length]}`;
}
