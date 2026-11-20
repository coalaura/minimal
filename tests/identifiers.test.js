import { expect, test } from "bun:test";
import UglifyJS from "uglify-js";
import { mangleIdentifiers } from "../src/mangle-identifiers.js";
import { observe } from "./observe.js";

test("weighted allocation includes declarations and favors emitted hot bindings", async () => {
	const declarations = Array.from({ length: 80 }, (_, index) => `binding${index}=input+${index}`).join(","),
		references = Array.from({ length: 80 }, (_, index) => `binding${index}`).join(","),
		frequent = Array.from({ length: 40 }, (_, index) => `console.log(binding${index + 40});`.repeat(3)).join(""),
		source = `(()=>{let ${declarations};console.log(${references});${frequent}${"console.log(binding79);".repeat(30)}})()`,
		ordinary = UglifyJS.minify(source, { compress: false, mangle: { toplevel: true } }).code,
		result = mangleIdentifiers(ordinary);

	expect(result.allocation).toBe("byte-weighted");
	expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(ordinary));
	expect(await observe(result.code, { input: 2 })).toEqual(await observe(source, { input: 2 }));
	expect(mangleIdentifiers(ordinary)).toEqual(result);
});

test("nested scopes, captures, shadowing, destructuring and shorthand preserve behavior", async () => {
	const source = `(()=>{
		let captured=3;
		function outer({value: renamed}, [first, ...rest]) {
			let shadow=renamed;
			const read=()=>({captured, shadow, first, rest});
			{ let shadow=7; console.log(shadow); }
			captured++;
			return read;
		}
		console.log(outer({value:4}, [1,2,3])());
	})()`;

	expect(await observe(mangleIdentifiers(source).code)).toEqual(await observe(source));
});

test("reserved names and dynamic scope restrictions remain Uglify's", async () => {
	const source = `(()=>{let reservedName=3; function keptName(value){return value+reservedName} console.log(keptName.name,keptName(4),eval("reservedName"));})()`,
		result = mangleIdentifiers(source, { reserved: ["reservedName"], keep_fnames: true });

	expect(result.code).toContain("reservedName");
	expect(await observe(result.code)).toEqual(await observe(source));
});
