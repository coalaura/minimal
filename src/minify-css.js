const stylesheetStart = /^\s*(?:\/\*[\s\S]*?\*\/\s*)*(?:[.#:\[*@]|[a-z_-][\w-]*(?=[\s.#:\[{>+~|]))/i;

export async function minifyStylesheets(values) {
	const replacements = new Map();

	for (const value of values) {
		if (!isStylesheet(value)) {
			continue;
		}

		let result;

		try {
			result = await Bun.build({
				entrypoints: ["embedded.css"],
				write: false,
				minify: true,
				// Keep imports and asset URLs intact instead of resolving them at build time.
				external: ["*"],
				plugins: [{
					name: "embedded-css",
					setup(build) {
						build.onResolve({ filter: /^embedded\.css$/ }, args => ({
							path: args.path,
							namespace: "embedded-css"
						}));

						build.onLoad({ filter: /.*/, namespace: "embedded-css" }, () => ({
							contents: value,
							loader: "css"
						}));
					}
				}]
			});
		} catch (error) {
			if (!(error instanceof AggregateError)) {
				throw error;
			}

			continue;
		}

		if (!result.success || result.logs.length > 0 || result.outputs.length !== 1) {
			continue;
		}

		const minified = (await result.outputs[0].text()).trim();

		if (Buffer.byteLength(minified) < Buffer.byteLength(value)) {
			replacements.set(value, minified);
		}
	}

	return replacements;
}

function isStylesheet(value) {
	if (!value.includes("{") || !value.includes(":") || !stylesheetStart.test(value)) {
		return false;
	}

	if (!value.isWellFormed() || value.startsWith("\uFEFF")) {
		return false;
	}

	let depth = 0,
		quote = "";

	// CSS parsers recover missing closing braces; reject fragments before parsing.
	for (let index = 0; index < value.length; index++) {
		const character = value[index];

		if (character === "\\") {
			index++;
			continue;
		}

		if (quote) {
			if (character === quote) {
				quote = "";
			}

			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === "/" && value[index + 1] === "*") {
			const end = value.indexOf("*/", index + 2);

			if (end === -1) {
				return false;
			}

			index = end + 1;
			continue;
		}

		if (character === "{") {
			depth++;
		} else if (character === "}") {
			if (--depth < 0) {
				return false;
			}
		}
	}

	return depth === 0 && quote === "";
}
