# minimal

An experimental JavaScript minifier built with Bun and UglifyJS. The goal: see how small a JavaScript file can get while preserving its behavior.

Inspired by trying to fit a large script into a browser bookmarklet. Every byte of the generated JavaScript counts; HTTP gzip or Brotli compression does not help with that limit.

## Usage

With [Bun](https://bun.sh) installed, put your script in `data/source.js`, then run:

```sh
bun install
bun run build
```

The result is written to `data/source.min.js`. The build reports input and output sizes, the percentage of the original size remaining, and the winning configuration.

## How it works

- Runs a small set of UglifyJS configurations in parallel and keeps the smallest final output.
- Minifies embedded CSS, pools repeated strings and shortens properties where their usage stays internal.
- Compares individual and shared Brotli-compressed string payloads, extraction methods, table orderings and Base64/Base85 encodings.

Compressed strings are decoded once before the original code runs, making startup asynchronous while allowing its functions to stay synchronous. The generated helpers use browser APIs including `DecompressionStream("brotli")` and do not require `unsafe-eval`.
