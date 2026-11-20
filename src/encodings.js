const decompressBase64 = data => new Response(new Blob([Uint8Array.fromBase64(data)]).stream().pipeThrough(new DecompressionStream("brotli"))).text();

export const encodings = [
	{ name: "Base64", encode: bytes => bytes.toString("base64"), decode: decompressBase64 },
	{ name: "Base85", encode: encodeBase85, decode: decompressBase85 },
	{ name: "Base85 JS", encode: bytes => encodeBase85(bytes, true), decode: decompressJavaScriptBase85 }
];

function encodeBase85(bytes, javascript = false) {
	const encoded = Buffer.alloc(Math.ceil(bytes.length * 5 / 4)),
		digits = Buffer.alloc(5);

	let position = 0;

	for (let offset = 0; offset < bytes.length; offset += 4) {
		let block = 0;

		for (let index = 0; index < 4; index++) {
			block = block * 256 + (bytes[offset + index] ?? 0);
		}

		for (let index = 4; index >= 0; index--) {
			let character = 33 + block % 85;

			// Skip both quote characters and backslash so either JS string delimiter is escape-free.
			if (javascript) {
				if (character >= 34) {
					character++;
				}

				if (character >= 39) {
					character++;
				}

				if (character >= 92) {
					character++;
				}
			}

			digits[index] = character;
			block = Math.floor(block / 85);
		}

		const length = Math.min(4, bytes.length - offset) + 1;

		for (let index = 0; index < length; index++) {
			encoded[position++] = digits[index];
		}
	}

	return encoded.toString("ascii");
}

function decompressBase85(data) {
	const bytes = new Uint8Array(Math.floor(data.length * 4 / 5));

	for (let offset = 0; offset < data.length; offset += 5) {
		let block = 0;

		// Pad a partial group with digit 84; the typed array discards its extra bytes.
		for (let index = 0; index < 5; index++) {
			block = block * 85 + (data.charCodeAt(offset + index) || 117) - 33;
		}

		for (let index = 0; index < 4; index++) {
			bytes[offset / 5 * 4 + index] = block >>> (24 - index * 8);
		}
	}

	return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("brotli"))).text();
}

function decompressJavaScriptBase85(data) {
	const bytes = new Uint8Array(Math.floor(data.length * 4 / 5));

	for (let offset = 0; offset < data.length; offset += 5) {
		let block = 0;

		for (let index = 0; index < 5; index++) {
			// Undo the three skipped characters; 120 is the padded digit 84 in this alphabet.
			const character = data.charCodeAt(offset + index) || 120;

			block = block * 85 + character - 33 - (character > 34) - (character > 39) - (character > 92);
		}

		for (let index = 0; index < 4; index++) {
			bytes[offset / 5 * 4 + index] = block >>> (24 - index * 8);
		}
	}

	return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("brotli"))).text();
}
