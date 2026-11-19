(() => {
	"use strict";

	const makeEl = tag => document.createElement(tag),
		setAttr = (el, key, val) => el.setAttribute(key, val),
		onEvt = (el, evt, cb) => el.addEventListener(evt, cb),
		append = (el, ...chlds) => el.append(...chlds);

	const previousManager = document.getElementById("__indexed_db_manager__");

	previousManager?.dispatchEvent(new Event("indexeddb-manager-dispose"));
	previousManager?.remove();

	if (!window.indexedDB) {
		alert("IndexedDB is not available on this page.");

		return;
	}

	const root = makeEl("div");

	root.id = "__indexed_db_manager__";
	root.attachShadow({ mode: "open" });

	document.body.appendChild(root);

	const style = makeEl("style");

	style.textContent = `
	:host {
		all: initial;
		font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		color: #e8e8e8;
	}

	*,
	*::before,
	*::after {
		box-sizing: border-box;
	}

	[hidden] {
		display: none !important;
	}

	header {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 18px 20px;
		border-bottom: 1px solid #303338;
	}

	h1 {
		margin: 0;
		color: #fff;
		font-size: 17px;
		font-weight: 650;
		letter-spacing: 0.01em;
	}

	button {
		appearance: none;
		border: 1px solid #424850;
		border-radius: 2px;
		background: #24282d;
		color: #e7e9eb;
		padding: 7px 11px;
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}

	button:hover {
		background: #30353b;
		border-color: #606873;
	}

	button:disabled {
		opacity: 0.48;
		cursor: not-allowed;
	}

	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid #9cddb1;
		outline-offset: 2px;
	}

	main {
		flex: 1;
		min-height: 0;
		overflow: auto;
		scrollbar-gutter: stable;
		padding: 14px 20px 20px;
	}

	summary {
		cursor: pointer;
	}

	input[type="file"] {
		display: none;
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 2147483647;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		background: rgba(0, 0, 0, 0.68);
	}

	.modal {
		width: min(720px, 100%);
		max-height: calc(100dvh - 40px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #17191c;
		border: 1px solid #34383d;
		border-radius: 2px;
		box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
	}

	.modal.exploring {
		width: min(1280px, 100%);
		height: min(900px, calc(100dvh - 40px));
	}

	.modal.exploring main {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		scrollbar-gutter: auto;
	}

	.subtitle {
		margin-top: 4px;
		color: #9299a3;
		font-size: 12px;
	}

	.icon-button {
		width: 30px;
		height: 30px;
		padding: 0;
		font-size: 20px;
		line-height: 1;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.toolbar-title {
		color: #aab1ba;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.toolbar-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.database {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		min-height: 58px;
		margin: 8px 0;
		padding: 11px 12px;
		border: 1px solid #30353a;
		border-radius: 2px;
		background: #1d2024;
	}

	.database > div:first-child {
		min-width: 0;
	}

	.database .toolbar-actions {
		flex-shrink: 0;
	}

	.database-name {
		min-width: 0;
		overflow: hidden;
		color: #f1f2f3;
		font-size: 13px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.database-meta {
		margin-top: 4px;
		color: #858d98;
		font-size: 11px;
	}

	.empty {
		padding: 38px 12px;
		color: #8e96a0;
		font-size: 13px;
		text-align: center;
	}

	.import-preview {
		font-size: 12px;
	}

	.import-preview.exploring {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.import-fields {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.import-preview.exploring .import-fields {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}

	.import-title {
		margin: 0 0 6px;
		font-size: 16px;
	}

	.import-file {
		margin: 0 0 18px;
		color: #9299a3;
		overflow-wrap: anywhere;
	}

	.import-summary {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px 20px;
		margin: 0 0 18px;
	}

	.import-summary dt {
		margin-bottom: 4px;
		color: #9299a3;
	}

	.import-summary dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.import-stores {
		flex-shrink: 0;
		margin-bottom: 20px;
	}

	.import-stores[open] {
		margin-bottom: 12px;
	}

	.import-stores > summary {
		padding: 10px 0;
		color: #9cddb1;
	}

	.import-label {
		display: block;
		margin-bottom: 7px;
		font-weight: 600;
	}

	.import-name {
		width: 100%;
		padding: 9px 10px;
		border: 1px solid #424850;
		border-radius: 2px;
		background: #1d2024;
		color: #f1f2f3;
		font: inherit;
	}

	.import-name:focus-visible {
		outline: 2px solid #9cddb1;
		outline-offset: 2px;
	}

	.import-option {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		cursor: pointer;
	}

	.import-option input {
		appearance: none;
		display: grid;
		place-content: center;
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		margin: 0;
		border: 1px solid #424850;
		border-radius: 2px;
		background: #1d2024;
		cursor: pointer;
	}

	.import-option input::before {
		content: "";
		width: 5px;
		height: 9px;
		margin-top: -2px;
		border: solid #17191c;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
		opacity: 0;
	}

	.import-option input:hover:not(:disabled) {
		border-color: #606873;
	}

	.import-option input:checked {
		border-color: #9cddb1;
		background: #9cddb1;
	}

	.import-option input:checked::before {
		opacity: 1;
	}

	.import-option input:focus-visible {
		outline: 2px solid #9cddb1;
		outline-offset: 2px;
	}

	.import-option input:disabled {
		opacity: 0.48;
		cursor: not-allowed;
	}

	.import-notice {
		margin: 12px 0 18px;
		color: #9cddb1;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.import-notice.replace {
		color: #e8c38a;
	}

	.import-notice.error {
		color: #ff9b9b;
	}

	.import-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.import-submit {
		border-color: #537b60;
		color: #9cddb1;
	}

	.import-submit:hover {
		border-color: #9cddb1;
	}

	.explorer {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		font-size: 12px;
	}

	.explorer-heading {
		display: flex;
		flex-shrink: 0;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.explorer-title {
		margin: 0;
		font-size: 15px;
		overflow-wrap: anywhere;
	}

	.explorer-layout {
		display: grid;
		flex: 1;
		min-height: 0;
		grid-template-columns: 170px minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
		border: 1px solid #30353a;
	}

	.explorer-stores {
		min-height: 0;
		overflow: auto;
		padding: 10px;
		border-right: 1px solid #30353a;
		background: #1d2024;
	}

	.explorer-store {
		display: block;
		width: 100%;
		margin-top: 6px;
		text-align: left;
		overflow-wrap: anywhere;
	}

	.explorer-store[aria-pressed="true"],
	.explorer-record[aria-pressed="true"] {
		border-color: #9cddb1;
		color: #9cddb1;
		background: #25342b;
	}

	.explorer-content {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.explorer-schema {
		flex-shrink: 0;
		max-height: 35%;
		overflow: auto;
		padding: 12px;
		border-bottom: 1px solid #30353a;
		color: #aab1ba;
		overflow-wrap: anywhere;
		line-height: 1.6;
	}

	.explorer-panes {
		display: grid;
		flex: 1;
		min-height: 0;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
		grid-template-rows: minmax(0, 1fr);
	}

	.explorer-records {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: auto;
		border-right: 1px solid #30353a;
	}

	.explorer-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.explorer-table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		text-align: left;
	}

	.explorer-table th,
	.explorer-table td {
		padding: 8px;
		border-bottom: 1px solid #30353a;
		overflow-wrap: anywhere;
		vertical-align: top;
	}

	.explorer-table th {
		position: sticky;
		top: 0;
		background: #1d2024;
		color: #aab1ba;
	}

	.explorer-record {
		width: 100%;
		text-align: left;
		overflow-wrap: anywhere;
		font-family: ui-monospace, monospace;
	}

	.explorer-pagination {
		display: flex;
		flex-shrink: 0;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 10px;
	}

	.explorer-message {
		margin: 0;
		padding: 12px;
		color: #aab1ba;
		overflow-wrap: anywhere;
	}

	.explorer-inspector {
		min-width: 0;
		min-height: 0;
		overflow: auto;
		padding: 12px;
	}

	.value-node {
		margin: 6px 0;
		font-family: ui-monospace, monospace;
		font-size: 12px;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.value-children {
		margin-left: 10px;
		padding-left: 10px;
		border-left: 1px solid #424850;
	}

	.binary-meta {
		color: #9cddb1;
	}

	.binary-image {
		display: block;
		max-width: 100%;
		max-height: 280px;
		margin: 10px 0;
		object-fit: contain;
	}

	.binary-hex {
		overflow: auto;
		white-space: pre;
	}

	.status {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 12px;
		min-height: 36px;
		padding: 10px 20px;
		border-top: 1px solid #303338;
		color: #9da5ae;
		font-size: 12px;
	}

	.status.error {
		color: #ff9b9b;
	}

	.status.success {
		color: #9cddb1;
	}

	.status-reload {
		flex-shrink: 0;
		margin-left: auto;
	}

	@media (max-width: 850px) {
		.explorer-panes {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: repeat(2, minmax(0, 1fr));
		}

		.explorer-records {
			border-right: 0;
			border-bottom: 1px solid #30353a;
		}
	}

	@media (max-width: 560px) {
		.backdrop {
			padding: 8px;
		}

		.modal {
			max-height: calc(100dvh - 16px);
		}

		.modal.exploring {
			height: min(900px, calc(100dvh - 16px));
		}

		main {
			padding: 12px;
		}

		.explorer-layout {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) minmax(0, 3fr);
		}

		.explorer-stores {
			border-right: 0;
			border-bottom: 1px solid #30353a;
		}
	}
	`;

	const shadow = root.shadowRoot,
		backdrop = createPreviewElement("div", "backdrop"),
		modal = createPreviewElement("section", "modal"),
		header = makeEl("header"),
		heading = makeEl("div"),
		title = createPreviewElement("h1", "", "IndexedDB Manager"),
		main = makeEl("main"),
		databaseList = makeEl("div"),
		databaseMessage = createPreviewElement("div", "empty"),
		databaseItems = new Map(),
		fileInput = makeEl("input"),
		statusElement = createPreviewElement("div", "status", "Loading databases..."),
		toolbar = createPreviewElement("div", "toolbar"),
		toolbarActions = createPreviewElement("div", "toolbar-actions"),
		closeButton = createPreviewElement("button", "icon-button", "\u00d7");

	title.id = "title";

	setAttr(modal, "role", "dialog");
	setAttr(modal, "aria-modal", "true");
	setAttr(modal, "aria-labelledby", title.id);

	closeButton.dataset.action = "close";
	closeButton.title = "Close";

	setAttr(closeButton, "aria-label", "Close");

	databaseList.dataset.role = "databases";
	databaseMessage.hidden = true;

	append(databaseList, databaseMessage);

	fileInput.dataset.role = "file";
	fileInput.type = "file";
	fileInput.accept = ".idbpack,application/octet-stream";
	statusElement.dataset.role = "status";

	setAttr(statusElement, "role", "status");

	for (const action of ["import", "refresh"]) {
		const button = createPreviewElement("button", "", action === "import" ? "Import" : "Refresh");

		button.dataset.action = action;
		append(toolbarActions, button);
	}

	append(heading, title, createPreviewElement("div", "subtitle", "Databases available to this website origin"));
	append(header, heading, closeButton);
	append(toolbar, createPreviewElement("div", "toolbar-title", "Current databases"), toolbarActions);
	append(main, toolbar, databaseList, fileInput);
	append(modal, header, main, statusElement);
	append(backdrop, modal);
	append(shadow, style, backdrop);

	let importInProgress = false,
		cancelImportPreview = null,
		disposeLiveExplorer = null;

	const setStatus = (message, type = "", showReload = false) => {
		statusElement.textContent = message;
		statusElement.className = `status ${type}`;

		if (showReload) {
			const reloadButton = makeEl("button");

			reloadButton.type = "button";
			reloadButton.className = "status-reload";
			reloadButton.dataset.action = "reload";
			reloadButton.textContent = "Reload page";

			append(statusElement, reloadButton);
		}
	};

	const request = (idbRequest) =>
		new Promise((resolve, reject) => {
			idbRequest.onsuccess = () => resolve(idbRequest.result);
			idbRequest.onerror = () => reject(idbRequest.error);
		});

	const transactionComplete = (transaction) =>
		new Promise((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted."));
		});

	// IDBPACK3: magic[8], manifest length u32, reserved flags u32, total size u64,
	// integrity root[32], binary manifest, then verbatim attachments. Integers and
	// floats are little-endian; varints use canonical unsigned base-128 encoding.
	// The root is SHA-256(header[0:24] || SHA-256(body chunk 0) || ...), with
	// fixed 4 MiB chunks. This detects corruption without buffering all attachments.
	const EXPORT_MAGIC = "IDBPACK3",
		EXPORT_HEADER_BYTES = 56,
		INTEGRITY_CHUNK_BYTES = 4 * 1024 * 1024,
		MAX_MANIFEST_BYTES = 256 * 1024 * 1024,
		MAX_MANIFEST_VALUES = 4 * 1024 * 1024,
		MAX_VALUE_DEPTH = 128,
		MAX_BATCH_RECORDS = 128,
		MAX_BATCH_BINARY_BYTES = 32 * 1024 * 1024;

	// Tag positions are part of the on-disk format. Object identifiers are scoped
	// to each record key/value; the string dictionary spans the entire manifest.
	const valueTags = [
		"null", "false", "true", "string", "float", "positive", "negative",
		"undefined", "bigint", "ref", "date", "regexp", "blob", "file",
		"array-buffer", "typed-array", "map", "set", "array", "object", "hole"
	];

	const typedArrayConstructors = {
		Int8Array,
		Uint8Array,
		Uint8ClampedArray,
		Int16Array,
		Uint16Array,
		Int32Array,
		Uint32Array,
		Float32Array,
		Float64Array,
		BigInt64Array,
		BigUint64Array,
		DataView
	};

	class ManifestWriter {
		constructor() {
			this.bytes = new Uint8Array(4096);
			this.view = new DataView(this.bytes.buffer);
			this.offset = 0;
			this.values = 0;
			this.strings = new Map();
			this.encoder = new TextEncoder();
		}

		reserve(length) {
			const required = this.offset + length;

			if (required > MAX_MANIFEST_BYTES) {
				throw new Error("Backup manifest exceeds the 256 MiB safety limit.");
			}

			if (required > this.bytes.length) {
				const grown = new Uint8Array(Math.min(MAX_MANIFEST_BYTES, Math.max(required, this.bytes.length * 2)));

				grown.set(this.bytes.subarray(0, this.offset));

				this.bytes = grown;
				this.view = new DataView(grown.buffer);
			}
		}

		byte(value) {
			this.reserve(1);
			this.bytes[this.offset++] = value;
		}

		uint(value) {
			if (!Number.isSafeInteger(value) || value < 0) {
				throw new Error("Invalid unsigned integer in backup manifest.");
			}

			while (value >= 128) {
				this.byte(value % 128 + 128);
				value = Math.floor(value / 128);
			}

			this.byte(value);
		}

		count(value) {
			if (value > MAX_MANIFEST_VALUES) {
				throw new Error("Backup collection exceeds the safety limit.");
			}

			this.uint(value);
		}

		float(value) {
			this.reserve(8);
			this.view.setFloat64(this.offset, value, true);
			this.offset += 8;
		}

		string(value) {
			checkValueBudget(this, 0);

			if (this.strings.has(value)) {
				this.uint(this.strings.get(value) * 2);

				return;
			}

			this.strings.set(value, this.strings.size);

			// UTF-8 cannot round-trip lone JS surrogates. Use raw UTF-16 only for
			// those strings; ordinary text stays UTF-8. Low bits select the encoding.
			let wellFormed = true;

			for (let index = 0; index < value.length; index++) {
				const unit = value.charCodeAt(index);

				if (unit >= 0xd800 && unit <= 0xdbff) {
					const next = value.charCodeAt(index + 1);

					if (!(next >= 0xdc00 && next <= 0xdfff)) {
						wellFormed = false;

						break;
					}

					index++;
				} else if (unit >= 0xdc00 && unit <= 0xdfff) {
					wellFormed = false;

					break;
				}
			}

			if (!wellFormed) {
				this.uint(value.length * 4 + 3);
				this.reserve(value.length * 2);

				for (let index = 0; index < value.length; index++) {
					this.view.setUint16(this.offset, value.charCodeAt(index), true);
					this.offset += 2;
				}

				return;
			}

			if (value.length > MAX_MANIFEST_BYTES) {
				throw new Error("String exceeds the backup manifest safety limit.");
			}

			const encoded = this.encoder.encode(value);

			this.uint(encoded.length * 4 + 1);
			this.reserve(encoded.length);

			this.bytes.set(encoded, this.offset);
			this.offset += encoded.length;
		}

		keyPath(value) {
			this.byte(value === null ? 0 : typeof value === "string" ? 1 : 2);

			if (typeof value === "string") {
				this.string(value);
			} else if (Array.isArray(value)) {
				this.count(value.length);

				for (const part of value) {
					this.string(part);
				}
			}
		}
	}

	class ManifestReader {
		constructor(bytes) {
			this.bytes = bytes;
			this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			this.offset = 0;
			this.values = 0;
			this.strings = [];
			this.decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
		}

		require(length) {
			if (!Number.isSafeInteger(length) || length < 0 || length > this.bytes.length - this.offset) {
				throw new Error("Truncated or invalid binary manifest.");
			}
		}

		byte() {
			this.require(1);

			return this.bytes[this.offset++];
		}

		uint() {
			let value = 0,
				factor = 1;

			for (let index = 0; index < 8; index++) {
				const part = this.byte();

				value += (part & 127) * factor;

				if (!Number.isSafeInteger(value)) {
					break;
				}

				if (part < 128) {
					if (index > 0 && part === 0) {
						break;
					}

					return value;
				}

				factor *= 128;
			}

			throw new Error("Invalid or non-canonical manifest integer.");
		}

		count(minimumBytes = 1) {
			const count = this.uint();

			this.require(count * minimumBytes);

			if (count > MAX_MANIFEST_VALUES) {
				throw new Error("Backup collection exceeds the safety limit.");
			}

			return count;
		}

		float() {
			this.require(8);

			const value = this.view.getFloat64(this.offset, true);

			this.offset += 8;

			return value;
		}

		string() {
			checkValueBudget(this, 0);

			const token = this.uint();

			if (token % 2 === 0) {
				const index = token / 2;

				if (index >= this.strings.length) {
					throw new Error("Invalid manifest string reference.");
				}

				return this.strings[index];
			}

			const length = Math.floor(token / 4);

			let value;

			if (token % 4 === 1) {
				this.require(length);

				value = this.decoder.decode(this.bytes.subarray(this.offset, this.offset + length));

				this.offset += length;
			} else {
				this.require(length * 2);

				const parts = [],
					units = new Uint16Array(Math.min(length, 8192));

				for (let start = 0; start < length; start += units.length) {
					const count = Math.min(units.length, length - start);

					for (let index = 0; index < count; index++) {
						units[index] = this.view.getUint16(this.offset, true);
						this.offset += 2;
					}

					parts.push(String.fromCharCode(...units.subarray(0, count)));
				}

				value = parts.join("");
			}

			this.strings.push(value);

			return value;
		}

		keyPath() {
			const tag = this.byte();

			if (tag === 0) {
				return null;
			}

			if (tag === 1) {
				return this.string();
			}

			if (tag !== 2) {
				throw new Error("Invalid manifest key path tag.");
			}

			const count = this.count(),
				parts = [];

			for (let index = 0; index < count; index++) {
				parts.push(this.string());
			}

			return parts;
		}
	}

	function checkValueBudget(codec, depth) {
		if (depth > MAX_VALUE_DEPTH || ++codec.values > MAX_MANIFEST_VALUES) {
			throw new Error("Backup manifest exceeds the nesting or value-count safety limit.");
		}
	}

	function writeManifestValue(writer, value, depth = 0) {
		checkValueBudget(writer, depth);

		if (value === null || typeof value === "boolean") {
			writer.byte(value === null ? 0 : value ? 2 : 1);

			return;
		}

		if (typeof value === "string") {
			writer.byte(3);
			writer.string(value);

			return;
		}

		if (typeof value === "number" || value.$type === "number") {
			const number = typeof value === "number" ? value : Number(value.value),
				integer = Number.isSafeInteger(number) && !Object.is(number, -0);

			writer.byte(integer ? number < 0 ? 6 : 5 : 4);

			if (integer) {
				writer.uint(Math.abs(number));
			} else {
				writer.float(number);
			}

			return;
		}

		const tag = valueTags.indexOf(value.$type);

		if (tag < 7) {
			throw new Error("Unsupported binary manifest value.");
		}

		writer.byte(tag);

		if (tag >= 10 && tag <= 19) {
			writer.uint(value.$id);
		}

		switch (value.$type) {
			case "undefined":
			case "hole":
				break;
			case "bigint":
				writer.string(value.value);

				break;
			case "ref":
				writer.uint(value.id);

				break;
			case "date":
				writer.float(value.value);

				break;
			case "regexp":
				writer.string(value.source);
				writer.string(value.flags);

				break;
			case "file":
				writer.string(value.name);
				writer.float(value.lastModified);
			// Files share the Blob payload fields.
			case "blob":
				writer.string(value.mimeType);
				writer.uint(value.binaryIndex);

				break;
			case "typed-array":
				writer.string(value.constructorName);
				writer.uint(value.binaryIndex);

				break;
			case "array-buffer":
				writer.uint(value.binaryIndex);

				break;
			case "map":
				writer.count(value.entries.length);

				for (const [key, item] of value.entries) {
					writeManifestValue(writer, key, depth + 1);
					writeManifestValue(writer, item, depth + 1);
				}

				break;
			case "set":
			case "array":
				writer.count(value.values.length);

				for (const item of value.values) {
					writeManifestValue(writer, item, depth + 1);
				}

				break;
			case "object": {
				const keys = Object.keys(value.properties);

				writer.count(keys.length);

				for (const key of keys) {
					writer.string(key);

					writeManifestValue(writer, value.properties[key], depth + 1);
				}

				break;
			}
		}
	}

	function readManifestValue(reader, depth = 0) {
		checkValueBudget(reader, depth);

		const tag = reader.byte();

		switch (tag) {
			case 0:
				return null;
			case 1:
				return false;
			case 2:
				return true;
			case 3:
				return reader.string();
			case 4: {
				const number = reader.float();

				return Number.isFinite(number) ? number : { $type: "number", value: String(number) };
			}
			case 5:
				return reader.uint();
			case 6:
				return -reader.uint();
		}

		if (tag >= valueTags.length) {
			throw new Error("Unknown binary manifest value tag.");
		}

		const value = { $type: valueTags[tag] };

		if (tag >= 10 && tag <= 19) {
			value.$id = reader.uint();
		}

		switch (value.$type) {
			case "undefined":
			case "hole":
				break;
			case "bigint":
				value.value = reader.string();

				if (!/^(0|-?[1-9][0-9]*)$/.test(value.value)) {
					throw new Error("Invalid binary manifest bigint.");
				}

				break;
			case "ref":
				value.id = reader.uint();

				break;
			case "date":
				value.value = reader.float();

				break;
			case "regexp":
				value.source = reader.string();
				value.flags = reader.string();

				break;
			case "file":
				value.name = reader.string();
				value.lastModified = reader.float();
			// Files share the Blob payload fields.
			case "blob":
				value.mimeType = reader.string();
				value.binaryIndex = reader.uint();

				break;
			case "typed-array":
				value.constructorName = reader.string();
				value.binaryIndex = reader.uint();

				break;
			case "array-buffer":
				value.binaryIndex = reader.uint();

				break;
			case "map": {
				const count = reader.count(2);

				value.entries = [];

				for (let index = 0; index < count; index++) {
					value.entries.push([readManifestValue(reader, depth + 1), readManifestValue(reader, depth + 1)]);
				}

				break;
			}
			case "set":
			case "array": {
				const count = reader.count();

				value.values = [];

				for (let index = 0; index < count; index++) {
					value.values.push(readManifestValue(reader, depth + 1));
				}

				break;
			}
			case "object": {
				const count = reader.count(2);

				value.properties = Object.create(null);

				for (let index = 0; index < count; index++) {
					const key = reader.string();

					if (Object.hasOwn(value.properties, key)) {
						throw new Error("Duplicate object property in backup manifest.");
					}

					value.properties[key] = readManifestValue(reader, depth + 1);
				}

				break;
			}
		}

		return value;
	}

	function encodeManifest(manifest) {
		const writer = new ManifestWriter();

		writer.string(manifest.exportedName);
		writer.uint(manifest.version);
		writer.float(manifest.exportedAt);
		writer.count(manifest.binarySizes.length);

		for (const size of manifest.binarySizes) {
			writer.uint(size);
		}

		writer.count(manifest.stores.length);

		for (const store of manifest.stores) {
			writer.string(store.name);
			writer.keyPath(store.keyPath);
			writer.byte(store.autoIncrement ? 1 : 0);
			writer.count(store.indexes.length);

			for (const index of store.indexes) {
				writer.string(index.name);
				writer.keyPath(index.keyPath);
				writer.byte((index.unique ? 1 : 0) | (index.multiEntry ? 2 : 0));
			}

			writer.count(store.records.length);

			for (const record of store.records) {
				writeManifestValue(writer, record.key);
				writeManifestValue(writer, record.value);
			}
		}

		return writer.bytes.subarray(0, writer.offset);
	}

	function decodeManifest(bytes) {
		const reader = new ManifestReader(bytes),
			manifest = {
				exportedName: reader.string(),
				version: reader.uint(),
				exportedAt: reader.float(),
				binarySizes: [],
				stores: []
			},
			binaryCount = reader.count();

		for (let index = 0; index < binaryCount; index++) {
			manifest.binarySizes.push(reader.uint());
		}

		const storeCount = reader.count(5);

		for (let storeIndex = 0; storeIndex < storeCount; storeIndex++) {
			const store = {
				name: reader.string(),
				keyPath: reader.keyPath(),
				autoIncrement: false,
				indexes: [],
				records: []
			},
				flags = reader.byte();

			if (flags > 1) {
				throw new Error("Unknown object store flags.");
			}

			store.autoIncrement = flags === 1;

			const indexCount = reader.count(3);

			for (let index = 0; index < indexCount; index++) {
				const name = reader.string(),
					keyPath = reader.keyPath(),
					indexFlags = reader.byte();

				if (indexFlags > 3) {
					throw new Error("Unknown index flags.");
				}

				store.indexes.push({
					name: name,
					keyPath: keyPath,
					unique: Boolean(indexFlags & 1),
					multiEntry: Boolean(indexFlags & 2)
				});
			}

			const recordCount = reader.count(2);

			for (let index = 0; index < recordCount; index++) {
				store.records.push({
					key: readManifestValue(reader),
					value: readManifestValue(reader)
				});
			}

			manifest.stores.push(store);
		}

		if (reader.offset !== bytes.length) {
			throw new Error("Unexpected trailing data in binary manifest.");
		}

		return manifest;
	}

	async function backupIntegrity(header, body) {
		if (!globalThis.crypto?.subtle) {
			throw new Error("Backup integrity checks require Web Crypto (use HTTPS or localhost).");
		}

		const chunkCount = Math.ceil(body.size / INTEGRITY_CHUNK_BYTES),
			roots = new Uint8Array(24 + chunkCount * 32);

		roots.set(header.subarray(0, 24));

		for (let index = 0; index < chunkCount; index++) {
			const start = index * INTEGRITY_CHUNK_BYTES,
				chunk = await body.slice(start, start + INTEGRITY_CHUNK_BYTES).arrayBuffer(),
				digest = await crypto.subtle.digest("SHA-256", chunk);

			roots.set(new Uint8Array(digest), 24 + index * 32);
		}

		return new Uint8Array(await crypto.subtle.digest("SHA-256", roots));
	}

	function addBinary(binaries, data) {
		const index = binaries.length;

		binaries.push(data instanceof Blob ? data : new Blob([data]));

		return index;
	}

	function encodeValue(value, binaries, seen = new Map(), state = { nextId: 1, values: 0 }, depth = 0) {
		checkValueBudget(state, depth);

		if (value === null || typeof value === "string" || typeof value === "boolean") {
			return value;
		}

		if (typeof value === "number") {
			return Number.isFinite(value) ? value : {
				$type: "number",
				value: String(value)
			};
		}

		if (typeof value === "undefined") {
			return {
				$type: "undefined"
			};
		}

		if (typeof value === "bigint") {
			return {
				$type: "bigint",
				value: value.toString()
			};
		}

		if (typeof value !== "object") {
			throw new Error(`Unsupported IndexedDB value type: ${typeof value}`);
		}

		if (seen.has(value)) {
			return {
				$type: "ref",
				id: seen.get(value)
			};
		}

		const id = state.nextId++;

		seen.set(value, id);

		if (value instanceof Date) {
			return {
				$id: id,
				$type: "date",
				value: value.getTime()
			};
		}

		if (value instanceof RegExp) {
			return {
				$id: id,
				$type: "regexp",
				source: value.source,
				flags: value.flags
			};
		}

		if (value instanceof Blob) {
			const isFile = typeof File !== "undefined" && value instanceof File;

			return {
				$id: id,
				$type: isFile ? "file" : "blob",
				mimeType: value.type,
				...(isFile ? { name: value.name, lastModified: value.lastModified } : {}),
				binaryIndex: addBinary(binaries, value)
			};
		}

		if (value instanceof ArrayBuffer) {
			return {
				$id: id,
				$type: "array-buffer",
				binaryIndex: addBinary(binaries, value)
			};
		}

		if (ArrayBuffer.isView(value)) {
			return {
				$id: id,
				$type: "typed-array",
				constructorName: value.constructor.name,
				binaryIndex: addBinary(
					binaries,
					new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
				)
			};
		}

		if (value instanceof Map) {
			return {
				$id: id,
				$type: "map",
				entries: [...value].map(([key, item]) => [
					encodeValue(key, binaries, seen, state, depth + 1),
					encodeValue(item, binaries, seen, state, depth + 1)
				])
			};
		}

		if (value instanceof Set) {
			return {
				$id: id,
				$type: "set",
				values: [...value].map((item) => encodeValue(item, binaries, seen, state, depth + 1))
			};
		}

		if (Array.isArray(value)) {
			if (value.length > MAX_MANIFEST_VALUES) {
				throw new Error("Backup array exceeds the safety limit.");
			}

			return {
				$id: id,
				$type: "array",
				values: Array.from({ length: value.length }, (_, index) =>
					index in value
						? encodeValue(value[index], binaries, seen, state, depth + 1)
						: { $type: "hole" }
				)
			};
		}

		const properties = Object.create(null);

		for (const key of Object.keys(value)) {
			properties[key] = encodeValue(value[key], binaries, seen, state, depth + 1);
		}

		return {
			$id: id,
			$type: "object",
			properties: properties
		};
	}

	// Check the entire manifest before replacing a database. Return the approximate
	// binary size of a record to bound the memory used by import batches.
	function validateEncodedValue(value, binarySizes, references = new Set()) {
		if (value === null || typeof value === "string" || typeof value === "boolean") {
			return 0;
		}

		if (typeof value === "number") {
			if (!Number.isFinite(value)) {
				throw new Error("Invalid encoded number.");
			}

			return 0;
		}

		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new Error("Invalid encoded value.");
		}

		if (value.$type === "ref") {
			if (!references.has(value.id)) {
				throw new Error("Invalid object reference in backup.");
			}

			return 0;
		}

		if (value.$type === "undefined") {
			return 0;
		}

		if (value.$type === "number") {
			if (!["NaN", "Infinity", "-Infinity"].includes(value.value)) {
				throw new Error("Invalid encoded number.");
			}

			return 0;
		}

		if (value.$type === "bigint") {
			try {
				BigInt(value.value);
			} catch {
				throw new Error("Invalid encoded bigint.");
			}

			return 0;
		}

		if (!Number.isSafeInteger(value.$id) || value.$id < 1 || references.has(value.$id)) {
			throw new Error("Invalid object identifier in backup.");
		}

		references.add(value.$id);

		if (value.$type === "date") {
			if (typeof value.value !== "number" || !Object.is(new Date(value.value).getTime(), value.value)) {
				throw new Error("Invalid encoded date.");
			}

			return 0;
		}

		if (value.$type === "regexp") {
			try {
				new RegExp(value.source, value.flags);
			} catch {
				throw new Error("Invalid encoded regular expression.");
			}

			return 0;
		}

		if (["blob", "file", "array-buffer", "typed-array"].includes(value.$type)) {
			if (!Number.isSafeInteger(value.binaryIndex) || value.binaryIndex < 0 || value.binaryIndex >= binarySizes.length) {
				throw new Error("Invalid binary reference in backup.");
			}

			if ((value.$type === "blob" || value.$type === "file") && typeof value.mimeType !== "string") {
				throw new Error("Invalid binary MIME type.");
			}

			if (value.$type === "file" && (typeof value.name !== "string" || !Number.isFinite(value.lastModified))) {
				throw new Error("Invalid encoded file metadata.");
			}

			if (value.$type === "typed-array") {
				if (!Object.hasOwn(typedArrayConstructors, value.constructorName)) {
					throw new Error(`Unsupported typed array: ${value.constructorName}`);
				}

				const Constructor = typedArrayConstructors[value.constructorName];

				if (value.constructorName !== "DataView" && binarySizes[value.binaryIndex] % Constructor.BYTES_PER_ELEMENT !== 0) {
					throw new Error("Invalid typed array byte length.");
				}
			}

			return binarySizes[value.binaryIndex];
		}

		if (value.$type === "map") {
			if (!Array.isArray(value.entries)) {
				throw new Error("Invalid encoded map.");
			}

			let size = 0;

			for (const entry of value.entries) {
				if (!Array.isArray(entry) || entry.length !== 2) {
					throw new Error("Invalid encoded map entry.");
				}

				size += validateEncodedValue(entry[0], binarySizes, references);
				size += validateEncodedValue(entry[1], binarySizes, references);
			}

			return size;
		}

		if (value.$type === "set" || value.$type === "array") {
			if (!Array.isArray(value.values)) {
				throw new Error("Invalid encoded collection.");
			}

			let size = 0;

			for (const item of value.values) {
				if (value.$type === "array" && item?.$type === "hole") {
					continue;
				}

				size += validateEncodedValue(item, binarySizes, references);
			}

			return size;
		}

		if (value.$type === "object") {
			if (!value.properties || typeof value.properties !== "object" || Array.isArray(value.properties)) {
				throw new Error("Invalid encoded object properties.");
			}

			let size = 0;

			for (const item of Object.values(value.properties)) {
				size += validateEncodedValue(item, binarySizes, references);
			}

			return size;
		}

		throw new Error(`Unsupported encoded value type: ${value.$type}`);
	}

	async function decodeValue(value, binaries, references = new Map()) {
		if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
			return value;
		}

		if (value.$type === "ref") {
			return references.get(value.id);
		}

		if (value.$type === "undefined") {
			return undefined;
		}

		if (value.$type === "number") {
			return Number(value.value);
		}

		if (value.$type === "bigint") {
			return BigInt(value.value);
		}

		let result;

		switch (value.$type) {
			case "date":
				result = new Date(value.value);

				break;
			case "regexp":
				result = new RegExp(value.source, value.flags);

				break;
			case "blob":
				result = binaries[value.binaryIndex].slice(0, undefined, value.mimeType);

				break;
			case "file":
				result = new File([binaries[value.binaryIndex]], value.name, {
					type: value.mimeType,
					lastModified: value.lastModified
				});

				break;
			case "array-buffer":
				result = await binaries[value.binaryIndex].arrayBuffer();

				break;
			case "typed-array":
				result = new typedArrayConstructors[value.constructorName](
					await binaries[value.binaryIndex].arrayBuffer()
				);

				break;
			case "map":
				result = new Map();

				break;
			case "set":
				result = new Set();

				break;
			case "array":
				result = [];

				break;
			case "object":
				result = {};

				break;
			default:
				throw new Error(`Unsupported encoded value type: ${value.$type}`);
		}

		references.set(value.$id, result);

		if (value.$type === "map") {
			for (const [key, item] of value.entries) {
				result.set(
					await decodeValue(key, binaries, references),
					await decodeValue(item, binaries, references)
				);
			}
		} else if (value.$type === "set") {
			for (const item of value.values) {
				result.add(await decodeValue(item, binaries, references));
			}
		} else if (value.$type === "array") {
			result.length = value.values.length;

			for (let index = 0; index < value.values.length; index++) {
				if (value.values[index]?.$type !== "hole") {
					result[index] = await decodeValue(value.values[index], binaries, references);
				}
			}
		} else if (value.$type === "object") {
			for (const [key, item] of Object.entries(value.properties)) {
				Object.defineProperty(result, key, {
					value: await decodeValue(item, binaries, references),
					enumerable: true,
					configurable: true,
					writable: true
				});
			}
		}

		return result;
	}

	async function listDatabases() {
		if (typeof indexedDB.databases !== "function") {
			throw new Error("This browser does not expose indexedDB.databases(), so database discovery is unavailable.");
		}

		return indexedDB.databases();
	}

	async function exportDatabase(name) {
		const db = await request(indexedDB.open(name));

		try {
			const binaries = [],
				stores = [],
				storeNames = Array.from(db.objectStoreNames);

			if (storeNames.length) {
				// Keep a single read transaction open across all stores. Process each
				// cursor result synchronously, rather than loading every record with getAll().
				const transaction = db.transaction(storeNames, "readonly"),
					completion = transactionComplete(transaction);

				let encodeError = null;

				for (const storeName of storeNames) {
					const store = transaction.objectStore(storeName),
						indexes = [];

					for (const indexName of Array.from(store.indexNames)) {
						const index = store.index(indexName);

						indexes.push({
							name: index.name,
							keyPath: index.keyPath,
							unique: index.unique,
							multiEntry: index.multiEntry
						});
					}

					const storeData = {
						name: store.name,
						keyPath: store.keyPath,
						autoIncrement: store.autoIncrement,
						indexes,
						records: []
					};

					stores.push(storeData);

					const cursorRequest = store.openCursor();

					cursorRequest.onsuccess = () => {
						const cursor = cursorRequest.result;

						if (!cursor) {
							return;
						}

						try {
							storeData.records.push({
								key: encodeValue(cursor.primaryKey, binaries),
								value: encodeValue(cursor.value, binaries)
							});

							cursor.continue();
						} catch (error) {
							encodeError = error;

							transaction.abort();
						}
					};
				}

				try {
					await completion;
				} catch (error) {
					throw encodeError || error;
				}
			}

			const manifest = {
				exportedName: db.name,
				version: db.version,
				exportedAt: Date.now(),
				binarySizes: binaries.map((binary) => binary.size),
				stores
			};

			const manifestBytes = encodeManifest(manifest),
				body = new Blob([manifestBytes, ...binaries]),
				header = new Uint8Array(EXPORT_HEADER_BYTES),
				headerView = new DataView(header.buffer),
				totalSize = EXPORT_HEADER_BYTES + body.size;

			if (!Number.isSafeInteger(totalSize)) {
				throw new Error("Backup exceeds the supported file size.");
			}

			header.set(new TextEncoder().encode(EXPORT_MAGIC));
			headerView.setUint32(8, manifestBytes.byteLength, true);
			headerView.setBigUint64(16, BigInt(totalSize), true);
			header.set(await backupIntegrity(header, body), 24);

			return {
				exportedName: db.name,
				blob: new Blob([header, body], {
					type: "application/octet-stream"
				})
			};
		} finally {
			db.close();
		}
	}

	function validKeyPath(keyPath) {
		if (keyPath === null) {
			return true;
		}

		if (Array.isArray(keyPath)) {
			return keyPath.every((part) => typeof part === "string" && validKeyPath(part));
		}

		return typeof keyPath === "string" && (keyPath === "" || keyPath.split(".").every((part) => /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(part)));
	}

	async function readExport(file) {
		if (file.size < EXPORT_HEADER_BYTES) {
			throw new Error("Not an IndexedDB Manager binary backup.");
		}

		const header = new Uint8Array(await file.slice(0, EXPORT_HEADER_BYTES).arrayBuffer());

		if (new TextDecoder().decode(header.subarray(0, 8)) !== EXPORT_MAGIC) {
			throw new Error("Not an IndexedDB Manager binary backup (IDBPACK3 required).");
		}

		const headerView = new DataView(header.buffer),
			manifestSize = headerView.getUint32(8, true);

		if (headerView.getUint32(12, true) !== 0) {
			throw new Error("Unsupported backup flags.");
		}

		if (!Number.isSafeInteger(file.size) || headerView.getBigUint64(16, true) !== BigInt(file.size)) {
			throw new Error("Backup file size does not match its header.");
		}

		if (!manifestSize || manifestSize > MAX_MANIFEST_BYTES || manifestSize > file.size - EXPORT_HEADER_BYTES) {
			throw new Error("Backup metadata is incomplete.");
		}

		const integrity = await backupIntegrity(header, file.slice(EXPORT_HEADER_BYTES));

		if (!integrity.every((byte, index) => byte === header[24 + index])) {
			throw new Error("Backup integrity check failed. The file is damaged or has been modified.");
		}

		const binaryStart = EXPORT_HEADER_BYTES + manifestSize,
			manifestBytes = await file.slice(EXPORT_HEADER_BYTES, binaryStart).arrayBuffer(),
			manifest = decodeManifest(new Uint8Array(manifestBytes));

		if (!Number.isSafeInteger(manifest.version) || manifest.version < 1 || !Number.isFinite(manifest.exportedAt)) {
			throw new Error("Invalid IndexedDB Manager backup metadata.");
		}

		const binaries = [];

		let offset = binaryStart;

		for (const size of manifest.binarySizes) {
			if (!Number.isSafeInteger(size) || size < 0 ||
				!Number.isSafeInteger(offset + size) || offset + size > file.size) {
				throw new Error("Invalid or truncated binary data in backup.");
			}

			binaries.push(file.slice(offset, offset + size));

			offset += size;
		}

		if (offset !== file.size) {
			throw new Error("Backup contains unexpected or missing binary data.");
		}

		const storeNames = new Set(),
			recordSizes = [];

		for (const storeData of manifest.stores) {
			if (!storeData || typeof storeData.name !== "string" || storeNames.has(storeData.name) || !validKeyPath(storeData.keyPath) || typeof storeData.autoIncrement !== "boolean" || !Array.isArray(storeData.indexes) || !Array.isArray(storeData.records)) {
				throw new Error("Invalid object store metadata in backup.");
			}

			if (storeData.autoIncrement && (storeData.keyPath === "" || Array.isArray(storeData.keyPath))) {
				throw new Error("Invalid auto-increment key path in backup.");
			}

			storeNames.add(storeData.name);

			const indexNames = new Set();

			for (const indexData of storeData.indexes) {
				if (!indexData || typeof indexData.name !== "string" || indexNames.has(indexData.name) || indexData.keyPath === null || !validKeyPath(indexData.keyPath) || (indexData.multiEntry && Array.isArray(indexData.keyPath)) || typeof indexData.unique !== "boolean" || typeof indexData.multiEntry !== "boolean") {
					throw new Error(`Invalid index metadata in store "${storeData.name}".`);
				}

				indexNames.add(indexData.name);
			}

			const sizes = [];

			for (const record of storeData.records) {
				if (!record || !Object.hasOwn(record, "key") || !Object.hasOwn(record, "value")) {
					throw new Error(`Invalid record in store "${storeData.name}".`);
				}

				sizes.push(
					validateEncodedValue(record.key, manifest.binarySizes) +
					validateEncodedValue(record.value, manifest.binarySizes)
				);

				try {
					const key = await decodeValue(record.key, binaries);

					indexedDB.cmp(key, key);
				} catch {
					throw new Error(`Invalid record key in store "${storeData.name}".`);
				}
			}

			recordSizes.push(sizes);
		}

		return { manifest, binaries, recordSizes };
	}

	function deleteDatabase(name) {
		return new Promise((resolve, reject) => {
			const deletion = indexedDB.deleteDatabase(name);

			deletion.onsuccess = () => resolve();
			deletion.onerror = () => reject(deletion.error);
			deletion.onblocked = () => {
				reject(new Error(`Deleting "${name}" was blocked. Close other tabs using this database and try again.`));
			};
		});
	}

	function openImportedDatabase(manifest, databaseName) {
		return new Promise((resolve, reject) => {
			const openRequest = indexedDB.open(databaseName, manifest.version);

			let schemaError = null,
				created = false,
				abandoned = false;

			openRequest.onupgradeneeded = (event) => {
				// A database may appear after the preview's existence check. Never
				// upgrade or merge into it, including when a replacement races a tab.
				if (abandoned || event.oldVersion !== 0) {
					schemaError = new Error(`Database "${databaseName}" already exists. Choose another name or review the replacement option.`);
					openRequest.transaction.abort();

					return;
				}

				try {
					const db = openRequest.result;

					created = true;

					for (const storeData of manifest.stores) {
						const store = db.createObjectStore(storeData.name, {
							keyPath: storeData.keyPath,
							autoIncrement: storeData.autoIncrement
						});

						for (const indexData of storeData.indexes) {
							store.createIndex(indexData.name, indexData.keyPath, {
								unique: indexData.unique,
								multiEntry: indexData.multiEntry
							});
						}
					}
				} catch (error) {
					schemaError = error;
					openRequest.transaction.abort();
				}
			};

			openRequest.onsuccess = () => {
				if (abandoned || !created) {
					openRequest.result.close();

					reject(new Error(`Database "${databaseName}" already exists. Choose another name or review the replacement option.`));

					return;
				}

				resolve(openRequest.result);
			};

			openRequest.onerror = () => reject(schemaError || openRequest.error);

			openRequest.onblocked = () => {
				abandoned = true;
				reject(new Error(`Opening "${databaseName}" was blocked. Close other tabs and try again.`));
			};
		});
	}

	async function writeStoreRecords(db, storeData, sizes, binaries) {
		const records = storeData.records;

		let start = 0;

		while (start < records.length) {
			let end = start,
				batchBytes = 0;

			while (end < records.length && end - start < MAX_BATCH_RECORDS && (end === start || batchBytes < MAX_BATCH_BINARY_BYTES)) {
				batchBytes += sizes[end];
				end++;
			}

			// Read ArrayBuffers before opening a transaction: awaiting a Blob read
			// inside a readwrite transaction would let that transaction go inactive.
			const decoded = [];

			for (let index = start; index < end; index++) {
				const record = records[index];

				decoded.push({
					key: storeData.keyPath === null
						? await decodeValue(record.key, binaries)
						: undefined,
					value: await decodeValue(record.value, binaries)
				});
			}

			const transaction = db.transaction(storeData.name, "readwrite"),
				completion = transactionComplete(transaction),
				store = transaction.objectStore(storeData.name);

			try {
				for (const record of decoded) {
					if (storeData.keyPath === null) {
						store.put(record.value, record.key);
					} else {
						store.put(record.value);
					}
				}

				await completion;
			} catch (error) {
				try {
					transaction.abort();
				} catch {
					// The transaction may have already aborted.
				}

				await completion.catch(() => { });

				throw error;
			}

			start = end;
		}
	}

	async function importDatabase(backup, destination) {
		const { manifest, binaries, recordSizes } = backup,
			databaseName = destination.name;

		if (destination.replaceExisting) {
			await deleteDatabase(databaseName);
		}

		const db = await openImportedDatabase(manifest, databaseName);

		let success = false;

		try {
			for (let index = 0; index < manifest.stores.length; index++) {
				await writeStoreRecords(
					db,
					manifest.stores[index],
					recordSizes[index],
					binaries
				);
			}

			success = true;
		} finally {
			db.close();

			if (!success) {
				// Don't leave a half-restored database that appears valid.
				try {
					await deleteDatabase(databaseName);
				} catch {
					// Keep the original import error.
				}
			}
		}

		return {
			imported: true,
			name: databaseName
		};
	}

	function formatBytes(bytes) {
		const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

		let amount = bytes,
			unit = 0;

		while (amount >= 1024 && unit < units.length - 1) {
			amount /= 1024;
			unit++;
		}

		return `${amount.toLocaleString(undefined, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
	}

	function createPreviewElement(tag, className = "", text = "") {
		const element = makeEl(tag);

		element.className = className;
		element.textContent = text;

		return element;
	}

	const EXPLORER_PAGE_SIZE = 50,
		VALUE_CHILDREN_BATCH = 50,
		MAX_INSPECTOR_NODES = 2000,
		MAX_INSPECTOR_DEPTH = 32,
		MAX_TEXT_PREVIEW = 16 * 1024,
		BINARY_HEADER_BYTES = 512,
		MAX_IMAGE_PREVIEW_BYTES = 32 * 1024 * 1024;

	const BINARY_SIGNATURES = [
		[[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG image", "image/png"],
		[[0xff, 0xd8, 0xff], "JPEG image", "image/jpeg"],
		["GIF87a", "GIF image", "image/gif"],
		["GIF89a", "GIF image", "image/gif"],
		["BM", "BMP image", "image/bmp"],
		[[0, 0, 1, 0], "ICO image", "image/x-icon"],
		[[0x49, 0x49, 0x2a, 0], "TIFF image", ""],
		[[0x4d, 0x4d, 0, 0x2a], "TIFF image", ""],
		["%PDF-", "PDF document", ""],
		[[0x50, 0x4b, 3, 4], "ZIP archive", ""],
		[[0x50, 0x4b, 5, 6], "ZIP archive", ""],
		[[0x1f, 0x8b], "GZIP archive", ""],
		[[0, 0x61, 0x73, 0x6d], "WebAssembly", ""],
		["OggS", "Ogg media", ""],
		["fLaC", "FLAC audio", ""],
		["ID3", "MP3 audio (ID3)", ""],
		[[0x1a, 0x45, 0xdf, 0xa3], "WebM / Matroska media", ""]
	];

	function openExplorerSource(name) {
		return new Promise((resolve, reject) => {
			const opening = indexedDB.open(name);

			let abandoned = false;

			opening.onupgradeneeded = () => {
				// Opening a deleted database would otherwise create an empty one.
				opening.transaction.abort();
			};

			opening.onerror = () => reject(new Error(`Could not open "${name}": ${opening.error?.message || "database no longer exists"}`));

			opening.onblocked = () => {
				abandoned = true;
				reject(new Error(`Opening "${name}" is blocked by another connection.`));
			};

			opening.onsuccess = () => {
				const database = opening.result;

				if (abandoned) {
					database.close();

					return;
				}

				try {
					const storeNames = Array.from(database.objectStoreNames),
						stores = [],
						schema = storeNames.length ? database.transaction(storeNames, "readonly") : null;

					for (const name of storeNames) {
						const store = schema.objectStore(name),
							indexes = [];

						for (const indexName of store.indexNames) {
							const index = store.index(indexName);

							indexes.push({
								name: index.name,
								keyPath: index.keyPath,
								unique: index.unique,
								multiEntry: index.multiEntry
							});
						}

						stores.push({
							name: store.name,
							keyPath: store.keyPath,
							autoIncrement: store.autoIncrement,
							indexes: indexes
						});
					}

					const source = {
						name: database.name,
						version: database.version,
						stores: stores,
						encoded: false,
						onInvalidated: null,
						async readPage(storeIndex, position) {
							const transaction = database.transaction(stores[storeIndex].name, "readonly"),
								completion = transactionComplete(transaction),
								store = transaction.objectStore(stores[storeIndex].name),
								count = store.count(),
								range = position === null ? null : IDBKeyRange.lowerBound(position.after, true),
								cursorRequest = store.openCursor(range),
								records = [];

							let hasMore = false;

							cursorRequest.onsuccess = () => {
								const cursor = cursorRequest.result;

								if (!cursor) {
									return;
								}

								if (records.length === EXPLORER_PAGE_SIZE) {
									hasMore = true;

									return;
								}

								records.push({
									key: cursor.primaryKey,
									value: cursor.value
								});

								cursor.continue();
							};

							await completion;

							return {
								records: records,
								total: count.result,
								next: hasMore ? { after: records[records.length - 1].key } : null
							};
						},
						close() {
							database.close();
						}
					};

					const invalidate = () => {
						database.close();
						source.onInvalidated?.();
					};

					database.onversionchange = invalidate;
					database.onclose = invalidate;

					resolve(source);
				} catch (error) {
					database.close();

					reject(error);
				}
			};
		});
	}

	function backupExplorerSource(backup) {
		return {
			name: backup.manifest.exportedName,
			version: backup.manifest.version,
			stores: backup.manifest.stores,
			encoded: true,
			binaries: backup.binaries,
			async readPage(storeIndex, position) {
				const records = backup.manifest.stores[storeIndex].records,
					start = position ?? 0,
					end = Math.min(records.length, start + EXPLORER_PAGE_SIZE);

				return {
					records: records.slice(start, end),
					total: records.length,
					next: end < records.length ? end : null
				};
			},
			close() { }
		};
	}

	function explorerValueKind(value, source) {
		if (value === null) {
			return "null";
		}

		if (typeof value !== "object") {
			return typeof value;
		}

		if (source.encoded) {
			return value.$type;
		}

		if (value instanceof Blob) {
			return typeof File !== "undefined" && value instanceof File ? "file" : "blob";
		}

		if (value instanceof ArrayBuffer) {
			return "array-buffer";
		}

		if (ArrayBuffer.isView(value)) {
			return "typed-array";
		}

		if (Array.isArray(value)) {
			return "array";
		}

		if (value instanceof Map) {
			return "map";
		}

		if (value instanceof Set) {
			return "set";
		}

		if (value instanceof Date) {
			return "date";
		}

		if (value instanceof RegExp) {
			return "regexp";
		}

		return "object";
	}

	function isBinaryKind(kind) {
		return kind === "blob" || kind === "file" || kind === "array-buffer" || kind === "typed-array";
	}

	function clipPreview(text, limit = 140) {
		return text.length > limit ? `${text.slice(0, limit)}...` : text;
	}

	function explorerValueSummary(value, source, limit = 140) {
		const kind = explorerValueKind(value, source);

		if (kind === "string") {
			return clipPreview(JSON.stringify(value.slice(0, limit)), limit);
		}

		if (kind === "null" || kind === "undefined" || kind === "hole") {
			return kind === "hole" ? "(empty slot)" : kind;
		}

		if (kind === "number" || kind === "boolean" || kind === "bigint") {
			const scalar = source.encoded && typeof value === "object" ? value.value : value;

			return clipPreview(`${Object.is(scalar, -0) ? "-0" : String(scalar)}${kind === "bigint" ? "n" : ""}`, limit);
		}

		if (kind === "ref") {
			return `Reference #${value.id}`;
		}

		if (kind === "date") {
			return `Date(${source.encoded ? new Date(value.value).toString() : value.toString()})`;
		}

		if (kind === "regexp") {
			return clipPreview(`/${clipPreview(value.source, limit)}/${value.flags}`, limit);
		}

		const identifier = source.encoded ? ` #${value.$id}` : "";

		if (isBinaryKind(kind)) {
			const size = source.encoded ? source.binaries[value.binaryIndex].size : value.size ?? value.byteLength,
				label = kind === "typed-array" ? source.encoded ? value.constructorName : value.constructor.name : kind,
				name = kind === "file" ? ` ${clipPreview(value.name, 60)}` : "";

			return `${label}${identifier}${name} (${formatBytes(size)})`;
		}

		if (kind === "array" || kind === "map" || kind === "set") {
			const size = source.encoded ? (value.values ?? value.entries).length : value.length ?? value.size;

			return `${kind}${identifier} (${size.toLocaleString()})`;
		}

		const properties = source.encoded ? value.properties : value,
			names = [];

		for (const name in properties) {
			if (Object.hasOwn(properties, name)) {
				names.push(clipPreview(name, 30));

				if (names.length === 4) {
					break;
				}
			}
		}

		return `Object${identifier} {${names.slice(0, 3).join(", ")}${names.length > 3 ? ", ..." : ""}}`;
	}

	function* explorerValueChildren(value, source) {
		const kind = explorerValueKind(value, source);

		if (kind === "array" || kind === "set") {
			const values = source.encoded ? value.values : value;

			let index = 0;

			for (const item of values) {
				const label = kind === "array" && !source.encoded && !Object.hasOwn(value, index) ? `${index} (empty slot)` : String(index);

				yield [label, item];

				index++;
			}
		} else if (kind === "map") {
			const entries = source.encoded ? value.entries : value;

			let index = 0;

			for (const [key, item] of entries) {
				yield [`${index} key`, key];
				yield [`${index} value`, item];

				index++;
			}
		} else {
			const properties = source.encoded ? value.properties : value;

			for (const name in properties) {
				if (Object.hasOwn(properties, name)) {
					yield [name, properties[name]];
				}
			}
		}
	}

	function binaryDescriptor(value, source) {
		if (source.encoded) {
			const blob = source.binaries[value.binaryIndex];

			return {
				blob: blob,
				size: blob.size,
				mime: value.mimeType || ""
			};
		}

		if (value instanceof Blob) {
			return {
				blob: value,
				size: value.size,
				mime: value.type
			};
		}

		const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

		return {
			bytes: bytes,
			size: bytes.byteLength,
			mime: ""
		};
	}

	async function binaryPrefix(binary, length) {
		return binary.blob ? new Uint8Array(await binary.blob.slice(0, length).arrayBuffer()) : binary.bytes.subarray(0, length);
	}

	function binaryStartsWith(bytes, signature, offset = 0) {
		if (bytes.length < offset + signature.length) {
			return false;
		}

		for (let index = 0; index < signature.length; index++) {
			const expected = typeof signature === "string" ? signature.charCodeAt(index) : signature[index];

			if (bytes[offset + index] !== expected) {
				return false;
			}
		}

		return true;
	}

	function detectBinaryFormat(bytes) {
		for (const [signature, label, mime] of BINARY_SIGNATURES) {
			if (binaryStartsWith(bytes, signature)) {
				return { label: label, imageMime: mime };
			}
		}

		if (binaryStartsWith(bytes, "RIFF") && binaryStartsWith(bytes, "WEBP", 8)) {
			return { label: "WebP image", imageMime: "image/webp" };
		}

		if (binaryStartsWith(bytes, "RIFF") && binaryStartsWith(bytes, "WAVE", 8)) {
			return { label: "WAV audio", imageMime: "" };
		}

		if (binaryStartsWith(bytes, "ftyp", 4)) {
			const avif = binaryStartsWith(bytes, "avif", 8) || binaryStartsWith(bytes, "avis", 8);

			return {
				label: avif ? "AVIF image" : "ISO media (MP4 / HEIF)",
				imageMime: avif ? "image/avif" : ""
			};
		}

		return { label: bytes.length ? "Unknown binary" : "Empty binary", imageMime: "" };
	}

	function binaryTextSample(bytes, complete) {
		try {
			const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: !complete });

			return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) ? null : text;
		} catch {
			return null;
		}
	}

	function binaryHexSample(bytes) {
		const lines = [];

		for (let offset = 0; offset < bytes.length; offset += 16) {
			const chunk = bytes.subarray(offset, offset + 16),
				hex = [],
				text = [];

			for (const byte of chunk) {
				hex.push(byte.toString(16).padStart(2, "0"));
				text.push(byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".");
			}

			lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex.join(" ").padEnd(47, " ")}  ${text.join("")}`);
		}

		return lines.join("\n");
	}

	async function renderBinaryPreview(container, value, source, lifetime) {
		container.textContent = "Reading binary header...";

		try {
			const binary = binaryDescriptor(value, source),
				bytes = await binaryPrefix(binary, BINARY_HEADER_BYTES),
				format = detectBinaryFormat(bytes);

			if (!lifetime.active) {
				return;
			}

			const metadata = createPreviewElement("div", "binary-meta", `${format.label} | ${formatBytes(binary.size)}`);

			container.replaceChildren(metadata);

			if (binary.mime) {
				append(container, createPreviewElement("div", "", `Declared MIME: ${clipPreview(binary.mime, 200)}`));
			}

			if (format.imageMime && binary.size <= MAX_IMAGE_PREVIEW_BYTES) {
				const image = makeEl("img"),
					blob = binary.blob ? binary.blob.slice(0, binary.size, format.imageMime) : new Blob([binary.bytes], { type: format.imageMime }),
					url = URL.createObjectURL(blob);

				lifetime.urls.add(url);

				image.className = "binary-image";
				image.alt = format.label;
				image.decoding = "async";

				image.onload = () => {
					if (lifetime.active) {
						append(metadata, document.createTextNode(` | ${image.naturalWidth} x ${image.naturalHeight}`));
					}
				};

				image.onerror = () => {
					if (lifetime.active) {
						image.replaceWith(createPreviewElement("div", "", "Image preview unavailable (unsupported, damaged, or blocked by this page)."));
					}
				};

				image.src = url;

				append(container, image);
			} else if (format.imageMime) {
				append(container, createPreviewElement("div", "", "Image preview omitted above 32 MiB."));
			}

			const hex = makeEl("details");

			append(hex, createPreviewElement("summary", "", `Hex preview (first ${bytes.length} bytes)`), createPreviewElement("pre", "binary-hex", binaryHexSample(bytes)));
			hex.open = !format.imageMime;

			append(container, hex);

			if (binary.size && !format.imageMime && binaryTextSample(bytes, bytes.length === binary.size) !== null) {
				const sample = await binaryPrefix(binary, 4096),
					text = binaryTextSample(sample, sample.length === binary.size);

				if (lifetime.active && text !== null) {
					const preview = makeEl("details");

					preview.open = true;

					append(preview, createPreviewElement("summary", "", `UTF-8 text sample (first ${sample.length} bytes)`), createPreviewElement("pre", "value-node", text));

					container.insertBefore(preview, hex);

					hex.open = false;
				}
			}
		} catch (error) {
			if (lifetime.active) {
				container.textContent = `Binary preview failed: ${error.message}`;
			}
		}
	}

	function createValueInspector(label, value, source, lifetime, ancestors = []) {
		lifetime.nodes++;

		const kind = explorerValueKind(value, source),
			summary = `${clipPreview(label, 200)}: ${explorerValueSummary(value, source, 500)}`,
			containerKind = kind === "object" || kind === "array" || kind === "map" || kind === "set";

		if (!source.encoded && containerKind && ancestors.includes(value)) {
			return createPreviewElement("div", "value-node", `${clipPreview(label, 200)}: [Circular reference]`);
		}

		if (!containerKind && !isBinaryKind(kind)) {
			const text = kind === "string" ? `${clipPreview(label, 200)}: ${JSON.stringify(value.slice(0, MAX_TEXT_PREVIEW))}${value.length > MAX_TEXT_PREVIEW ? ` [showing ${MAX_TEXT_PREVIEW} of ${value.length} characters]` : ""}` : summary;

			return createPreviewElement("div", "value-node", text);
		}

		const details = createPreviewElement("details", "value-node"),
			children = createPreviewElement("div", "value-children");

		append(details, createPreviewElement("summary", "", summary), children);

		let initialized = false;

		onEvt(details, "toggle", () => {
			if (!details.open || initialized || !lifetime.active) {
				return;
			}

			initialized = true;

			if (isBinaryKind(kind)) {
				void renderBinaryPreview(children, value, source, lifetime);

				return;
			}

			if (ancestors.length >= MAX_INSPECTOR_DEPTH) {
				children.textContent = "Nesting preview limit reached.";

				return;
			}

			const iterator = explorerValueChildren(value, source),
				parents = [...ancestors, value],
				more = createPreviewElement("button", "", "Show more fields");

			let next = iterator.next();

			more.type = "button";

			const appendBatch = () => {
				more.remove();

				if (!lifetime.active) {
					return;
				}

				let count = 0;

				while (!next.done && count < VALUE_CHILDREN_BATCH && lifetime.nodes < MAX_INSPECTOR_NODES) {
					append(children, createValueInspector(next.value[0], next.value[1], source, lifetime, parents));

					next = iterator.next();

					count++;
				}

				if (!next.done) {
					if (lifetime.nodes >= MAX_INSPECTOR_NODES) {
						append(children, createPreviewElement("div", "", "Preview node limit reached. Select another record, then return to start over."));
					} else {
						append(children, more);
					}
				} else if (!children.childNodes.length) {
					children.textContent = "(empty)";
				}
			};

			onEvt(more, "click", appendBatch);

			appendBatch();
		});

		return details;
	}

	function createExplorer(source) {
		const element = createPreviewElement("section", "explorer"),
			layout = createPreviewElement("div", "explorer-layout"),
			stores = createPreviewElement("nav", "explorer-stores"),
			content = createPreviewElement("div", "explorer-content"),
			schema = createPreviewElement("div", "explorer-schema"),
			panes = createPreviewElement("div", "explorer-panes"),
			records = createPreviewElement("div", "explorer-records"),
			scroll = createPreviewElement("div", "explorer-scroll"),
			table = createPreviewElement("table", "explorer-table"),
			head = makeEl("thead"),
			heading = makeEl("tr"),
			body = makeEl("tbody"),
			message = createPreviewElement("p", "explorer-message", "Loading records..."),
			pagination = createPreviewElement("div", "explorer-pagination"),
			previous = createPreviewElement("button", "", "Previous"),
			next = createPreviewElement("button", "", "Next"),
			reload = createPreviewElement("button", "", "Refresh store"),
			pageLabel = createPreviewElement("span"),
			inspector = createPreviewElement("div", "explorer-inspector"),
			inspectorHint = createPreviewElement("p", "explorer-message", "Select a record to inspect its key and value."),
			rowViews = [],
			storeButtons = [];

		let active = true,
			invalidated = false,
			generation = 0,
			selectedStore = 0,
			positions = [null],
			pageIndex = 0,
			nextPosition = null,
			selectedRow = null,
			lifetime = null;

		setAttr(stores, "aria-label", "Object stores");
		setAttr(pageLabel, "role", "status");

		previous.type = "button";
		next.type = "button";
		reload.type = "button";
		reload.hidden = source.encoded;
		table.hidden = true;

		for (const label of ["Key", "Value"]) {
			const cell = createPreviewElement("th", "", label);

			cell.scope = "col";
			append(heading, cell);
		}

		append(head, heading);
		append(table, head, body);
		append(scroll, message, table);
		append(inspector, inspectorHint);
		append(stores, createPreviewElement("div", "toolbar-title", "Object stores"));
		append(pagination, previous, next, pageLabel, reload);
		append(records, scroll, pagination);
		append(panes, records, inspector);
		append(content, schema, panes);
		append(layout, stores, content);
		append(element, layout);

		const clearInspector = () => {
			if (lifetime) {
				lifetime.active = false;

				for (const url of lifetime.urls) {
					URL.revokeObjectURL(url);
				}
			}

			lifetime = null;

			if (selectedRow) {
				setAttr(selectedRow.button, "aria-pressed", "false");

				selectedRow = null;

				inspector.replaceChildren(inspectorHint);
				inspector.scrollTop = 0;
			}
		};

		const createRecordRow = () => {
			const row = {
				element: makeEl("tr"),
				button: createPreviewElement("button", "explorer-record"),
				valueCell: makeEl("td"),
				record: null
			},
				keyCell = makeEl("td");

			row.button.type = "button";

			setAttr(row.button, "aria-pressed", "false");

			onEvt(row.button, "click", () => {
				if (!active || invalidated || row.button.disabled || row === selectedRow) {
					return;
				}

				clearInspector();

				selectedRow = row;

				setAttr(row.button, "aria-pressed", "true");

				lifetime = {
					active: true,
					nodes: 0,
					urls: new Set()
				};

				const key = createValueInspector("Key", row.record.key, source, lifetime),
					value = createValueInspector("Value", row.record.value, source, lifetime);

				inspector.replaceChildren(key, value);

				if (value.tagName === "DETAILS") {
					value.open = true;
				}
			});

			append(keyCell, row.button);
			append(row.element, keyCell, row.valueCell);
			append(body, row.element);

			return row;
		};

		const renderRows = (pageRecords) => {
			// Reuse at most one page of row nodes and listeners; hidden rows release their record values.
			for (let index = 0; index < Math.max(pageRecords.length, rowViews.length); index++) {
				if (!rowViews[index]) {
					rowViews.push(createRecordRow());
				}

				const row = rowViews[index];

				row.record = pageRecords[index] ?? null;
				row.element.hidden = !row.record;
				row.button.disabled = !row.record;

				if (!row.record) {
					continue;
				}

				const keyText = explorerValueSummary(row.record.key, source),
					valueText = explorerValueSummary(row.record.value, source);

				if (row.button.textContent !== keyText) {
					row.button.textContent = keyText;
				}

				if (row.valueCell.textContent !== valueText) {
					row.valueCell.textContent = valueText;
				}
			}

			table.hidden = !pageRecords.length;
			message.hidden = Boolean(pageRecords.length);
		};

		const renderSchema = () => {
			const store = source.stores[selectedStore],
				indexDetails = makeEl("details");

			schema.replaceChildren(createPreviewElement("strong", "", store.name || "(empty name)"));
			append(schema, createPreviewElement("div", "", `Key path: ${JSON.stringify(store.keyPath)} | Auto-increment: ${store.autoIncrement ? "yes" : "no"}`));
			append(indexDetails, createPreviewElement("summary", "", `${store.indexes.length} indexes`));

			for (const index of store.indexes) {
				append(indexDetails, createPreviewElement("div", "value-node", `${index.name}: ${JSON.stringify(index.keyPath)}${index.unique ? " | unique" : ""}${index.multiEntry ? " | multi-entry" : ""}`));
			}

			append(schema, indexDetails);
		};

		const loadPage = async () => {
			const current = ++generation;

			clearInspector();

			previous.disabled = true;
			next.disabled = true;
			reload.disabled = true;

			pageLabel.textContent = "Loading...";
			message.textContent = "Loading records...";

			setAttr(element, "aria-busy", "true");

			for (const row of rowViews) {
				row.button.disabled = true;
			}

			try {
				const page = await source.readPage(selectedStore, positions[pageIndex]);

				if (!active || current !== generation) {
					return;
				}

				nextPosition = page.next;

				renderRows(page.records);

				message.textContent = "No records on this page.";
				scroll.scrollTop = 0;
				pageLabel.textContent = `Page ${pageIndex + 1} | ${page.records.length} shown | ${page.total.toLocaleString()} total`;

				previous.disabled = pageIndex === 0;
				next.disabled = nextPosition === null;
			} catch (error) {
				if (active && current === generation) {
					renderRows([]);

					pageLabel.textContent = "Could not load records.";
					message.textContent = error.message;

					previous.disabled = pageIndex === 0;
				}
			} finally {
				if (active && current === generation) {
					reload.disabled = false;

					setAttr(element, "aria-busy", "false");
				}
			}
		};

		for (let index = 0; index < source.stores.length; index++) {
			const store = source.stores[index],
				button = createPreviewElement("button", "explorer-store", `${store.name || "(empty name)"}${source.encoded ? ` (${store.records.length.toLocaleString()})` : ""}`);

			button.type = "button";

			setAttr(button, "aria-pressed", String(index === selectedStore));

			onEvt(button, "click", () => {
				if (invalidated || !active || index === selectedStore) {
					return;
				}

				setAttr(storeButtons[selectedStore], "aria-pressed", "false");

				selectedStore = index;

				setAttr(button, "aria-pressed", "true");

				positions = [null];
				pageIndex = 0;

				renderRows([]);
				renderSchema();

				void loadPage();
			});

			storeButtons.push(button);
			append(stores, button);
		}

		onEvt(previous, "click", () => {
			pageIndex--;

			void loadPage();
		});

		onEvt(next, "click", () => {
			positions.length = pageIndex + 1;
			positions.push(nextPosition);
			pageIndex++;

			void loadPage();
		});

		onEvt(reload, "click", () => {
			positions = [null];
			pageIndex = 0;

			void loadPage();
		});

		source.onInvalidated = () => {
			invalidated = true;
			generation++;

			clearInspector();
			renderRows([]);

			message.textContent = "Database changed or closed. Return to the database list and reopen it.";
			pageLabel.textContent = "Connection closed";

			previous.disabled = true;
			next.disabled = true;
			reload.disabled = true;

			setAttr(element, "aria-busy", "false");

			for (const button of storeButtons) {
				button.disabled = true;
			}
		};

		if (source.stores.length) {
			renderSchema();

			void loadPage();
		} else {
			content.replaceChildren(createPreviewElement("p", "empty", "This database has no object stores."));
		}

		return {
			element: element,
			dispose() {
				active = false;
				generation++;

				clearInspector();

				for (const row of rowViews) {
					row.record = null;
				}

				source.onInvalidated = null;
				source.close();

				element.remove();
			}
		};
	}

	async function showDatabaseExplorer(name) {
		disposeLiveExplorer?.();

		const panel = createPreviewElement("section", "explorer"),
			heading = createPreviewElement("div", "explorer-heading"),
			title = createPreviewElement("h2", "explorer-title", name || "(empty name)"),
			back = createPreviewElement("button", "", "Back to databases"),
			loading = createPreviewElement("p", "explorer-message", "Opening database...");

		let active = true,
			explorer = null;

		back.type = "button";

		append(heading, title, back);
		append(panel, heading, loading);
		append(main, panel);

		toolbar.hidden = true;
		databaseList.hidden = true;
		modal.classList.add("exploring");
		main.scrollTop = 0;

		back.focus();

		setStatus("Read-only explorer. Each page reads current data; use Refresh store to start over.");

		disposeLiveExplorer = () => {
			active = false;

			explorer?.dispose();
			panel.remove();

			toolbar.hidden = false;
			databaseList.hidden = false;
			modal.classList.remove("exploring");

			disposeLiveExplorer = null;
		};

		const goBack = () => {
			disposeLiveExplorer?.();

			shadow.querySelector('[data-action="refresh"]').focus();

			void refresh();
		};

		onEvt(back, "click", goBack);

		onEvt(panel, "keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();

				goBack();
			}
		});

		try {
			const source = await openExplorerSource(name);

			if (!active) {
				source.close();

				return;
			}

			explorer = createExplorer(source);

			title.textContent = `${name || "(empty name)"} | Version ${source.version} | Read-only`;

			loading.replaceWith(explorer.element);
		} catch (error) {
			if (active) {
				loading.textContent = error.message;
			}
		}
	}

	function chooseImportDestination(file, backup, databases) {
		return new Promise((resolve) => {
			const manifest = backup.manifest,
				form = createPreviewElement("form", "import-preview"),
				fields = createPreviewElement("fieldset", "import-fields"),
				overview = makeEl("div"),
				title = createPreviewElement("h2", "import-title", "Import backup"),
				fileDetails = createPreviewElement("p", "import-file", `${file.name} (${formatBytes(file.size)})`),
				summary = createPreviewElement("dl", "import-summary"),
				storeList = createPreviewElement("details", "import-stores"),
				storeToggle = createPreviewElement("summary", "", "Explore backup contents (read-only)"),
				destinationFields = makeEl("div"),
				nameLabel = createPreviewElement("label", "import-label", "Destination database name"),
				nameInput = createPreviewElement("input", "import-name"),
				newOption = createPreviewElement("label", "import-option"),
				newOnly = makeEl("input"),
				notice = createPreviewElement("p", "import-notice"),
				actions = createPreviewElement("div", "import-actions"),
				cancelButton = createPreviewElement("button", "", "Cancel"),
				submitButton = createPreviewElement("button", "import-submit"),
				recordCount = manifest.stores.reduce((total, store) => total + store.records.length, 0),
				attachmentSize = manifest.binarySizes.reduce((total, size) => total + size, 0),
				details = [
					["Original database", manifest.exportedName || "(empty name)"],
					["Database version", manifest.version.toLocaleString()],
					["Exported", new Date(manifest.exportedAt).toLocaleString()],
					["Object stores", manifest.stores.length.toLocaleString()],
					["Records", recordCount.toLocaleString()],
					["Attachments", `${formatBytes(attachmentSize)} across ${manifest.binarySizes.length.toLocaleString()} payloads`]
				];

			let databaseNames = new Set(databases.map((database) => database.name)),
				settled = false,
				checking = false,
				previewExplorer = null;

			for (const [label, value] of details) {
				const detail = makeEl("div");

				append(detail, createPreviewElement("dt", "", label), createPreviewElement("dd", "", value));
				append(summary, detail);
			}

			setAttr(storeToggle, "aria-controls", "import-explorer");

			append(storeList, storeToggle);

			onEvt(storeList, "toggle", () => {
				if (settled) {
					return;
				}

				if (storeList.open && !previewExplorer) {
					previewExplorer = createExplorer(backupExplorerSource(backup));
					previewExplorer.element.id = "import-explorer";
					storeList.after(previewExplorer.element);
				}

				if (previewExplorer) {
					previewExplorer.element.hidden = !storeList.open;
				}

				overview.hidden = storeList.open;
				destinationFields.hidden = storeList.open;
				storeToggle.textContent = storeList.open ? "Back to import options" : "Explore backup contents (read-only)";

				form.classList.toggle("exploring", storeList.open);
				modal.classList.toggle("exploring", storeList.open);

				main.scrollTop = 0;
			});

			title.id = "import-preview-title";

			setAttr(form, "aria-labelledby", title.id);

			nameLabel.htmlFor = "import-destination";
			nameInput.id = "import-destination";
			nameInput.type = "text";
			nameInput.value = manifest.exportedName;
			nameInput.autocomplete = "off";
			nameInput.spellcheck = false;

			setAttr(nameInput, "aria-describedby", "import-destination-notice");

			newOnly.type = "checkbox";

			append(newOption, newOnly, document.createTextNode("Import as a new database"));

			notice.id = "import-destination-notice";

			setAttr(notice, "aria-live", "polite");

			cancelButton.type = "button";
			submitButton.type = "submit";

			append(actions, cancelButton, submitButton);
			append(overview, title, fileDetails, summary);
			append(destinationFields, nameLabel, nameInput, newOption, notice, actions);
			append(fields, overview, storeList, destinationFields);
			append(form, fields);

			const updateDestination = () => {
				const exists = databaseNames.has(nameInput.value),
					conflict = exists && newOnly.checked;

				notice.className = `import-notice${conflict ? " error" : exists ? " replace" : ""}`;
				notice.textContent = conflict
					? "A database with this name already exists. Choose an unused name to import a new database."
					: exists
						? "This database already exists. Importing will replace all of its stores and records."
						: "This name is available. A new database will be created.";

				submitButton.textContent = exists && !newOnly.checked ? "Replace database" : "Import database";
				submitButton.disabled = conflict;
			};

			const finish = (destination) => {
				if (settled) {
					return;
				}

				settled = true;
				cancelImportPreview = null;
				closeButton.disabled = true;

				previewExplorer?.dispose();

				modal.classList.remove("exploring");

				form.remove();

				resolve(destination);
			};

			onEvt(nameInput, "input", updateDestination);

			onEvt(newOnly, "change", () => {
				if (newOnly.checked && (databaseNames.has(nameInput.value) || nameInput.value === manifest.exportedName)) {
					const baseName = `${manifest.exportedName || "database"}-imported`;

					let candidate = baseName,
						suffix = 2;

					while (databaseNames.has(candidate)) {
						candidate = `${baseName}-${suffix++}`;
					}

					nameInput.value = candidate;
				}

				updateDestination();

				nameInput.focus();
			});

			onEvt(cancelButton, "click", () => finish(null));

			onEvt(form, "keydown", (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();

					finish(null);
				}
			});

			onEvt(form, "submit", async (event) => {
				event.preventDefault();

				if (checking || settled || submitButton.disabled) {
					return;
				}

				checking = true;
				fields.disabled = true;
				closeButton.disabled = true;

				try {
					const name = nameInput.value,
						previouslyExisted = databaseNames.has(name),
						currentDatabases = await listDatabases();

					if (settled) {
						return;
					}

					databaseNames = new Set(currentDatabases.map((database) => database.name));

					const exists = databaseNames.has(name);

					updateDestination();

					if (exists !== previouslyExisted || (newOnly.checked && exists)) {
						setStatus("The destination changed. Review its status before importing.");

						return;
					}

					finish({ name: name, replaceExisting: exists && !newOnly.checked });
				} catch (error) {
					if (!settled) {
						setStatus(`Could not check the destination: ${error.message}`, "error");
					}
				} finally {
					checking = false;

					if (!settled) {
						fields.disabled = false;
						closeButton.disabled = false;
					}
				}
			});

			cancelImportPreview = () => finish(null);

			closeButton.disabled = false;

			updateDestination();

			append(shadow.querySelector("main"), form);

			setStatus("Backup verified. Explore its contents and review the destination before importing.");

			nameInput.focus();
		});
	}

	function closeManager() {
		if (importInProgress && !cancelImportPreview) {
			return;
		}

		cancelImportPreview?.();
		disposeLiveExplorer?.();

		root.remove();
	}

	function downloadExport(data) {
		const safeName = data.exportedName.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "database",
			url = URL.createObjectURL(data.blob),
			link = makeEl("a");

		link.href = url;
		link.download = `${safeName}.idbpack`;

		document.body.appendChild(link);

		link.click();
		link.remove();

		setTimeout(() => URL.revokeObjectURL(url), 60_000);
	}

	function renderDatabases(databases) {
		const remaining = new Set(databaseItems.keys());

		for (const database of databases) {
			remaining.delete(database.name);
		}

		for (const name of remaining) {
			databaseItems.get(name).element.remove();
			databaseItems.delete(name);
		}

		let position = databaseMessage.nextSibling;

		databaseMessage.hidden = Boolean(databases.length);

		if (!databases.length) {
			databaseMessage.textContent = "No IndexedDB databases were found for this origin.";
		}

		databases.sort((a, b) => a.name.localeCompare(b.name));

		for (const database of databases) {
			let item = databaseItems.get(database.name);

			if (!item) {
				const element = createPreviewElement("div", "database"),
					details = makeEl("div"),
					name = createPreviewElement("div", "database-name", database.name),
					meta = createPreviewElement("div", "database-meta"),
					actions = createPreviewElement("div", "toolbar-actions");

				for (const action of ["explore", "export"]) {
					const button = createPreviewElement("button", "", action === "explore" ? "Explore" : "Export");

					button.dataset.action = action;
					button.dataset.name = database.name;

					append(actions, button);
				}

				append(details, name, meta);
				append(element, details, actions);

				item = { element: element, meta: meta };
				databaseItems.set(database.name, item);
			}

			const version = `Version ${database.version ?? "unknown"}`;

			if (item.meta.textContent !== version) {
				item.meta.textContent = version;
			}

			if (item.element === position) {
				position = position.nextSibling;
			} else {
				databaseList.insertBefore(item.element, position);
			}
		}
	}

	async function refresh() {
		const refreshButton = shadow.querySelector(`[data-action="refresh"]`);

		refreshButton.disabled = true;

		setStatus("Loading databases...");

		try {
			const databases = await listDatabases();

			renderDatabases(databases);

			setStatus(`${databases.length} database${databases.length === 1 ? "" : "s"} found.`);
		} catch (error) {
			databaseMessage.hidden = false;
			databaseMessage.textContent = error.message;

			setStatus(error.message, "error");
		} finally {
			refreshButton.disabled = false;
		}
	}

	onEvt(root, "indexeddb-manager-dispose", () => {
		cancelImportPreview?.();
		disposeLiveExplorer?.();
	});

	onEvt(shadow, "click", async (event) => {
		const button = event.target.closest("button");

		if (!button) {
			return;
		}

		const action = button.dataset.action;

		if (action === "close") {
			closeManager();

			return;
		}

		if (importInProgress) {
			return;
		}

		if (action === "refresh") {
			await refresh();

			return;
		}

		if (action === "reload") {
			window.location.reload();

			return;
		}

		if (action === "import") {
			fileInput.value = "";

			fileInput.click();

			return;
		}

		if (action === "explore") {
			await showDatabaseExplorer(button.dataset.name);

			return;
		}

		if (action === "export") {
			button.disabled = true;

			setStatus(`Exporting "${button.dataset.name}"…`);

			try {
				const data = await exportDatabase(button.dataset.name);

				downloadExport(data);

				setStatus(`"${button.dataset.name}" exported successfully.`, "success");
			} catch (error) {
				setStatus(`Export failed: ${error.message}`, "error");
			} finally {
				button.disabled = false;
			}
		}
	});

	onEvt(fileInput, "change", async () => {
		const file = fileInput.files?.[0];

		if (!file || importInProgress) {
			return;
		}

		disposeLiveExplorer?.();

		importInProgress = true;
		toolbar.hidden = true;
		databaseList.hidden = true;
		closeButton.disabled = true;

		setStatus(`Verifying "${file.name}"...`);

		try {
			const backup = await readExport(file),
				databases = await listDatabases();

			if (!root.isConnected) {
				return;
			}

			const destination = await chooseImportDestination(file, backup, databases);

			if (!destination) {
				setStatus("Import cancelled.");

				return;
			}

			setStatus(`Importing into "${destination.name}"...`);

			const result = await importDatabase(backup, destination);

			await refresh();

			setStatus(`"${result.name}" imported successfully.`, "success", true);
		} catch (error) {
			setStatus(`Import failed: ${error.message}`, "error");
		} finally {
			importInProgress = false;

			toolbar.hidden = false;
			databaseList.hidden = false;
			closeButton.disabled = false;
			fileInput.value = "";

			shadow.querySelector('[data-action="import"]').focus();
		}
	});

	onEvt(shadow.querySelector(".backdrop"), "click", (event) => {
		if (event.target.classList.contains("backdrop")) {
			closeManager();
		}
	});

	refresh();
})();
