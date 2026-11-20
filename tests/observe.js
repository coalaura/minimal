import { createContext, Script } from "node:vm";

export async function observe(source, globals = {}) {
	const events = [],
		context = createContext({
			...globals,
			console: {
				log: (...values) => events.push(JSON.stringify(values)),
				error: (...values) => events.push(JSON.stringify(values))
			},
			Response: Response,
			Blob: Blob,
			Uint8Array: Uint8Array,
			DecompressionStream: DecompressionStream
		});

	let exception = null;

	try {
		await new Script(source).runInContext(context, { timeout: 2000 });
	} catch (error) {
		exception = { name: error.name, message: error.message };
	}

	return { events: events, exception: exception };
}
