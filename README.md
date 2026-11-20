# minimal

An experimental JavaScript minifier built with Bun and UglifyJS. The goal: see how small a JavaScript file can get while preserving its behavior.

Inspired by trying to fit a large script into a browser bookmarklet. Every byte of the generated JavaScript counts; HTTP gzip or Brotli compression does not help with that limit.

## Usage

With [Bun](https://bun.sh) installed, put your script in `data/source.js`, then run:

```sh
bun install --frozen-lockfile
bun run build
```

The result is written to `data/source.min.js`. The build reports input and output sizes, the percentage of the original size remaining, and the winning configuration.

Run `bun test` for regression and behavioral differential tests. `bun run benchmark` measures the input and a small unrelated corpus with each optimization separately and combined; `--mode=combined` selects one mode and `--corpus-only` omits the input. Browser workflows are not exercised by these commands.

The programmatic API `buildCandidates(source, concurrency, options)` in `src/build-candidates.js` accepts `identifiers`, `strings` and `properties` booleans (all default to `true`). `options.search` accepts `beamWidth: 6`, `candidateLimit: 30`, `trialLimit: 8` and `poolTrials: 8`. These bound the extra search per property branch and Uglify configuration: up to 30 candidate evaluations plus 8 table membership trials, with up to 8 pooling trials per finalist. The existing pipeline runs independently as a fallback; zero beam or candidate limits disable the extra string search. The property analysis falls back unchanged if its 64-round flow budget is exhausted.

## How it works

- Runs a small set of UglifyJS configurations in parallel and keeps the smallest final output.
- Minifies embedded CSS, pools repeated strings and shortens properties where their usage stays internal.
- Compares individual and shared Brotli-compressed string payloads, extraction methods, table orderings and Base64/Base85 encodings.
- Carries a deterministic, diverse string beam through pooling and final identifier allocation, measuring complete raw UTF-8 bytes. Original and minified CSS, frequency-sorted tables and mixed binding/direct extraction compete at that stage.
- Compares ordinary and occurrence-weighted identifier allocation using a pinned, checked-in UglifyJS patch installed by Bun. The patch also retains property mutations through otherwise unused aliases.

Compressed strings are decoded once before the original code runs, making startup asynchronous while allowing its functions to stay synchronous. The generated helpers use browser APIs including `DecompressionStream("brotli")` and do not require `unsafe-eval`.
