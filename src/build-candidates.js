import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

const configurations = [
	{ name: "default", compression: {} },
	{ name: "hoist_funs", compression: { hoist_funs: true } },
	{ name: "hoist_funs + hoist_vars", compression: { hoist_funs: true, hoist_vars: true } }
];

const maximumWorkers = 3;

export async function buildCandidates(source, concurrency = availableParallelism()) {
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new RangeError("Worker concurrency must be a positive integer");
	}

	const workerCount = Math.min(concurrency, availableParallelism(), maximumWorkers, configurations.length),
		workers = new Set(),
		results = new Array(configurations.length),
		tasks = new Array(workerCount);

	let nextIndex = 0,
		stopped = false;

	async function run() {
		while (!stopped && nextIndex < configurations.length) {
			const index = nextIndex++,
				configuration = configurations[index];

			try {
				results[index] = await runCandidate(source, configuration, workers);
			} catch (error) {
				stopped = true;

				throw new Error(`Uglify configuration "${configuration.name}" failed: ${error.message}`, { cause: error });
			}
		}
	}

	try {
		for (let index = 0; index < workerCount; index++) {
			tasks[index] = run();
		}

		await Promise.all(tasks);
	} finally {
		stopped = true;

		await Promise.all([...workers].map(worker => worker.terminate()));
	}

	let bestIndex = 0;

	const candidates = results.map((result, index) => ({
		name: configurations[index].name,
		bytes: Buffer.byteLength(result.code)
	}));

	// Keep configuration order on ties, independent of worker completion order.
	for (let index = 1; index < candidates.length; index++) {
		if (candidates[index].bytes < candidates[bestIndex].bytes) {
			bestIndex = index;
		}
	}

	return {
		...results[bestIndex],
		configuration: configurations[bestIndex].name,
		candidates: candidates,
		workers: workerCount
	};
}

async function runCandidate(source, configuration, workers) {
	const worker = new Worker(new URL("./optimize-worker.js", import.meta.url), {
		workerData: {
			source: source,
			compression: configuration.compression
		}
	});

	workers.add(worker);

	try {
		return await new Promise((resolve, reject) => {
			worker.once("message", resolve);
			worker.once("error", reject);
			worker.once("exit", code => {
				reject(new Error(`Worker exited before returning a result (exit code ${code})`));
			});
		});
	} finally {
		await worker.terminate();

		workers.delete(worker);
	}
}
