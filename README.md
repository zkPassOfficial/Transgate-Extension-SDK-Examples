# Transgate-Extension-SDK-Examples

Examples and tutorials for integrating the zkPass SDK into your own Chrome extensions.

These examples target [`@zkpass/transgate-extension-sdk`](https://www.npmjs.com/package/@zkpass/transgate-extension-sdk) — a library that runs zkPass **zkTLS** verification entirely inside a Chrome **MV3 background service worker**, with no external extension or backend required.

## Examples

| # | Directory | What it shows |
|---|---|---|
| **01** | [`01-minimal/`](./01-minimal) | The smallest possible extension that calls `runZKTLS`. One side-panel button → service worker runs the verification → result is dumped as JSON. |
| **02** | [`02-login-site/`](./02-login-site) | Realistic integration against a **login-gated site** (Twitter / X follow schema). Side panel with live progress + history, categorized error handling, full proof display. |

## Documentation

| File | What's inside |
|---|---|
| **[Integration Guide](./docs/integration-guide.md)** | Tutorial: from `npm install` to a working `runZKTLS` call. Covers data flow, the `onListening` trigger hook, login-gated sites, error categorization, common patterns, and troubleshooting. |
| **[API Reference](./docs/api-reference.md)** | Full public API surface: `class TransGateExtensionCore`, `RunZKTLSOptions` (options table), `RunResult`, the 12 `ErrorCode` values, `STATUS_MSG` constants, `VERSION`. |

For the canonical SDK package, see [`@zkpass/transgate-extension-sdk` on npm](https://www.npmjs.com/package/@zkpass/transgate-extension-sdk).

## Quick start

```bash
cd <example-dir>           # e.g. 01-minimal or 02-login-site
npm install                # installs @zkpass/transgate-extension-sdk + esbuild
npm run build              # esbuild bundles the SW into dist/, copies manifest + sidepanel files
# then in Chrome:
#   chrome://extensions → Developer mode → "Load unpacked" → select the dist/ directory
```

## License

[Apache 2.0](./LICENSE)
