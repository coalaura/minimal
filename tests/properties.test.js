import { expect, test } from "bun:test";
import { mangleProperties } from "../src/mangle-properties.js";
import { minify } from "../src/minify.js";
import { observe } from "./observe.js";

const supported = [
	{
		name: "aliases, calls, returns and captured bindings",
		source: `(()=>{function create(value){return {runningTotal:value,sampleCount:1}} function update(record,value){record.runningTotal+=value;record.sampleCount++;return record} const record=create(3);let alias=record;update(alias,7);function reader(){return ()=>record.runningTotal/record.sampleCount}console.log(reader()(),alias.runningTotal,record.sampleCount)})()`
	},
	{
		name: "method receivers and local method calls",
		source: `(()=>{const object={currentValue:2,changeValue(amount){console.log("before",this.currentValue);this.currentValue+=amount;return this}};const alias=object.changeValue(3);console.log(alias.currentValue,alias===object)})()`
	},
	{
		name: "classes, overrides and inherited receivers",
		source: `(()=>{class Base{constructor(value){this.currentValue=value}changeValue(amount){this.currentValue+=amount;return this.currentValue}} class Child extends Base{changeValue(amount){console.log("child");return super.changeValue(amount*2)}}const object=new Child(2);console.log(object.changeValue(3),object.currentValue)})()`
	},
	{
		name: "explicit super constructor and multiple instances",
		source: `(()=>{class Base{constructor(value){this.currentValue=value}readValue(){return this.currentValue}}class Child extends Base{constructor(value){super(value+1)}readValue(){return super.readValue()+1}}const first=new Child(2),second=new Base(8);console.log(first.readValue(),second.readValue())})()`
	},
	{
		name: "static bracket access and exceptions after side effects",
		source: `(()=>{const object={longValue:2};function read(value){console.log(value["longValue"]);throw new TypeError("expected failure")}read(object)})()`
	},
	{
		name: "nested local containers",
		source: `(()=>{const object={innerRecord:{longValue:2}};const alias=object.innerRecord;alias.longValue+=3;console.log(object.innerRecord.longValue)})()`
	},
	{
		name: "top-level local declarations",
		source: `function read(object){return object.longValue}class Record{constructor(value){this.longValue=value}readValue(){return read(this)}}const record=new Record(7);console.log(record.readValue())`
	}
];

for (const fixture of supported) {
	test(`properties: ${fixture.name}`, async () => {
		const result = mangleProperties(fixture.source);

		expect(result.count).toBeGreaterThan(0);
		expect(await observe(result.code)).toEqual(await observe(fixture.source));
		expect(mangleProperties(fixture.source)).toEqual(result);
	});
}

const rejected = [
	`const object={longValue:2};console.log(object);`,
	`const object={longValue:2};globalThis.exposed=object;console.log(object.longValue);`,
	`const object={longValue:2};console.log(Object.keys(object),object.longValue);`,
	`const object={longValue:2};console.log(JSON.stringify(object),object.longValue);`,
	`const object={longValue:2};const key=globalThis.key||"longValue";console.log(object[key],object.longValue);`,
	`const object={longValue:2};console.log(Reflect.get(object,"longValue"));`,
	`const object={longValue:2};console.log("longValue" in object,object.longValue);`,
	`const object={longValue:2};for(const key in object)console.log(key);`,
	`const object={longValue:2};console.log({...object});`,
	`const object={longValue:2};const {longValue}=object;console.log(longValue);`,
	`const object={longMethod(){return 2}};console.log(object.longMethod.name);`,
	`const object={longValue:2};console.log(()=>object.longValue);`,
	`class Counter{longMethod(){return 2}}const object=new Counter;console.log(object.longMethod.name);`,
	`class Counter{longMethod(){return 2}}console.log(Counter.prototype);`,
	`Object.defineProperty(Object.prototype,"a",{set(){console.log("setter")},configurable:true});class Counter{constructor(){this.longValue=2}}const object=new Counter;console.log(object.longValue);`,
	`class External extends globalThis.ExternalBase{longMethod(){return this.longValue}}console.log(new External);`,
	`const object={get longValue(){console.log("getter");return 2}};console.log(object.longValue);`,
	`const object={longValue:2,toJSON(){return this.longValue}};console.log(JSON.stringify(object));`,
	`const object={longValue:2};function read(value){return value.longValue}console.log(read(object),read(globalThis.external));`,
	`const object={longValue:2};const alias=globalThis.input?object:null;console.log(alias.longValue);`,
	`const object={longValue:2};delete object.longValue;console.log(object.longValue);`,
	`(()=>{function read(record){const arrow=()=>arguments[0][globalThis.key||"longValue"];return arrow()}const object={longValue:7};console.log(read(object),object.longValue)})()`,
	`(()=>{class Base{constructor(){return globalThis.external||{longValue:3}}}class Child extends Base{constructor(){super();this.longValue+=2}}const object=new Child;console.log(object.longValue)})()`,
	`const key="a";Object.defineProperty(Object.getPrototypeOf({}),key,{set(){console.log("setter")},configurable:true});class Record{constructor(){this.longValue=2}}console.log(new Record().longValue);`,
	`(()=>{function spy(){return spy.caller.arguments[0].longValue}function read(object){return spy()}const object={longValue:7};console.log(read(object),object.longValue)})()`,
	`(()=>{function spy(){return spy[globalThis.key||"caller"].arguments[0].longValue}function read(object){return spy()}const object={longValue:7};console.log(read(object),object.longValue)})()`
];

for (const [index, source] of rejected.entries()) {
	test(`properties reject observable or unresolved flow ${index + 1}`, async () => {
		const result = mangleProperties(source);

		expect(result.count).toBe(0);
		expect(result.code).toBe(source);
		expect(await observe(result.code)).toEqual(await observe(source));
	});
}

test("property analysis exhausts its budget without changing the source", () => {
	const source = supported[0].source;

	expect(mangleProperties(source, { roundLimit: 0 })).toEqual({ code: source, count: 0 });
});

test("exported classes retain public methods and properties", () => {
	const source = `export class Record{constructor(value){this.longValue=value}readValue(){return this.longValue}}const record=new Record(2);console.log(record.readValue());`;

	expect(mangleProperties(source)).toEqual({ code: source, count: 0 });
});

test("Uglify retains property updates through otherwise unused local aliases", async () => {
	const source = `(()=>{function create(value){return {runningTotal:value,sampleCount:1}}function update(record,value){record.runningTotal+=value;record.sampleCount++;return record}const record=create(+globalThis.input||3);let alias;alias=record;update(alias,7);const read=()=>record.runningTotal/record.sampleCount;console.log(read(),alias.runningTotal,record.sampleCount)})()`;

	expect(await observe(minify(source))).toEqual(await observe(source));
	expect(mangleProperties(minify(source)).count).toBeGreaterThan(0);
});
