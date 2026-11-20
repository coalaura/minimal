import { parentPort, workerData } from "node:worker_threads";
import { optimize } from "./optimize.js";

const result = await optimize(workerData.source, workerData.compression, workerData.options);

parentPort.postMessage(result);
parentPort.close();
