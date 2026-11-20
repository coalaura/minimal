export const corpus = [
	{
		name: "numeric-closures",
		source: `(() => {
			function accumulate(values) {
				let total = 0;
				function add(value) { total += value; return total; }
				return values.map(add).map((value, index) => value * (index + 1));
			}
			console.log(JSON.stringify(accumulate([3, -2, 9, 4])));
		})();`
	},
	{
		name: "text-rendering",
		source: `(() => {
			const messages = [${Array.from({ length: 18 }, (_, index) => JSON.stringify(`Section ${index}: The quick brown fox jumps over the lazy dog. Please review the selected information before continuing.`)).join(",")}];
			const rows = messages.map((message, index) => ({ title: message, index: index }));
			console.log(JSON.stringify(rows.map(row => row.index + ": " + row.title).join("\\n")));
		})();`
	},
	{
		name: "local-records",
		source: `(() => {
			function create(value) { return { runningTotal: value, sampleCount: 1 }; }
			function update(record, value) { record.runningTotal += value; record.sampleCount++; return record; }
			const record = create(+globalThis.input || 3);
			let alias; alias = record;
			update(alias, 7);
			const read = () => record.runningTotal / record.sampleCount;
			console.log(read(), alias.runningTotal, record.sampleCount);
		})();`
	},
	{
		name: "class-receivers",
		source: `(() => {
			class Counter {
				constructor(value) { this.currentValue = value; }
				incrementValue(amount) { this.currentValue += amount; return this.currentValue; }
			}
			class DoubleCounter extends Counter {
				incrementValue(amount) { return super.incrementValue(amount * 2); }
			}
			const counter = new DoubleCounter(+globalThis.input || 2);
			console.log(counter.incrementValue(3), counter.currentValue);
		})();`
	}
];
