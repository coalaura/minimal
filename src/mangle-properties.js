import UglifyJS from "uglify-js";
import { minify } from "./minify.js";

const propertyCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_";

export function mangleProperties(source) {
	const ast = UglifyJS.parse(source, { module: true }),
		parents = new WeakMap(),
		objects = [];

	ast.figure_out_scope();

	// Dynamic scope access can expose objects without an explicit reference in the AST.
	if (ast.pinned()) {
		return { code: source, count: 0 };
	}

	ast.walk(new UglifyJS.TreeWalker(function(node) {
		parents.set(node, this.parent());

		if (node instanceof UglifyJS.AST_VarDef && node.name instanceof UglifyJS.AST_SymbolDeclaration && node.value instanceof UglifyJS.AST_Object) {
			objects.push(node);
		}
	}));

	let count = 0;

	for (const object of objects) {
		const properties = internalProperties(object, parents);

		if (!properties) {
			continue;
		}

		const reserved = new Set(properties.keys()),
			entries = [...properties.values()];

		entries.sort((first, second) => second.accesses.length - first.accesses.length);

		let nextName = 0;

		for (const entry of entries) {
			if (entry.property.key.length < 2) {
				continue;
			}

			let name;

			do {
				name = propertyName(nextName++);
			} while (reserved.has(name));

			if (name.length >= entry.property.key.length) {
				continue;
			}

			reserved.add(name);
			entry.property.key = name;

			for (const access of entry.accesses) {
				if (access instanceof UglifyJS.AST_Dot) {
					access.property = name;
				} else {
					access.property.value = name;
				}
			}

			count++;
		}
	}

	if (count === 0) {
		return { code: source, count: 0 };
	}

	const code = minify(ast);

	if (Buffer.byteLength(code) >= Buffer.byteLength(source)) {
		return { code: source, count: 0 };
	}

	return { code: code, count: count };
}

function internalProperties(object, parents) {
	const definition = object.name.definition();

	if (definition.exported || definition.orig.length !== 1 || definition.scope.pinned() || definition.redefined()) {
		return;
	}

	const properties = new Map();

	for (const property of object.value.properties) {
		if (!(property instanceof UglifyJS.AST_ObjectKeyVal) || typeof property.key !== "string" || property.key === "__proto__" || properties.has(property.key)) {
			return;
		}

		// Renaming an anonymous function/class initializer also changes its inferred .name.
		if (property.value instanceof UglifyJS.AST_Lambda || property.value instanceof UglifyJS.AST_Class) {
			return;
		}

		properties.set(property.key, {
			property: property,
			accesses: []
		});
	}

	for (const reference of definition.references) {
		const access = parents.get(reference);

		// Passing, aliasing, reflecting on, or returning the object makes its keys observable.
		if (!(access instanceof UglifyJS.AST_PropAccess) || access.expression !== reference) {
			return;
		}

		const key = access instanceof UglifyJS.AST_Dot ? access.property : access.property instanceof UglifyJS.AST_String ? access.property.value : null,
			entry = properties.get(key),
			parent = parents.get(access);

		if (!entry) {
			return;
		}

		// Calls/tagged templates expose the receiver as `this`; deletion can reveal its prototype.
		if (parent instanceof UglifyJS.AST_Call && parent.expression === access) {
			return;
		}

		if (parent instanceof UglifyJS.AST_Template && parent.tag === access) {
			return;
		}

		if (parent instanceof UglifyJS.AST_UnaryPrefix && parent.operator === "delete") {
			return;
		}

		entry.accesses.push(access);
	}

	return properties;
}

function propertyName(index) {
	const character = propertyCharacters[index % propertyCharacters.length];

	if (index < propertyCharacters.length) {
		return character;
	}

	return `${propertyName(Math.floor(index / propertyCharacters.length) - 1)}${character}`;
}
