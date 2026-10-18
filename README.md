# Transgate-Extension-SDK-Examples

Examples and tutorials for integrating the zkPass SDK into your own Chrome extensions.

These examples target [`@zkpass/transgate-extension-sdk`](https://www.npmjs.com/package/@zkpass/transgate-extension-sdk) — a library that runs zkPass **zkTLS** verification entirely inside a Chrome **MV3 background service worker**, without requiring a separately installed TransGate extension or an integrator-built backend for these examples. Verification still uses remote schema, allocation, and notary services; it is not offline or service-independent.

## Examples

| # | Directory | What it shows |
|---|---|---|
| **01** | [`01-minimal/`](./01-minimal) | The smallest possible extension that calls `runZKTLS`. One side-panel button → service worker runs the verification → result is dumped as JSON. |
| **02** | [`02-login-site/`](./02-login-site) | Realistic integration against a **login-gated site** (Twitter / X follow schema). Side panel with live progress + history, categorized error handling, full proof display. |

## Documentation

| File | What's inside |
|---|---|
| **[Integration Guide](./docs/integration-guide.md)** | Tutorial: from `npm install` to a working `runZKTLS` call. Covers data flow, the `onListening` trigger hook, login-gated sites, error categorization, common patterns, and troubleshooting. |
| **[API Reference](./docs/api-reference.md)** | Mirrored API notes for the declared SDK range (resolved-version behavior must be checked): `class TransGateExtensionCore`, `RunZKTLSOptions` (options table), `RunResult`, the 12 `ErrorCode` values, `STATUS_MSG` constants, `VERSION`. |

For the canonical SDK package, see [`@zkpass/transgate-extension-sdk` on npm](https://www.npmjs.com/package/@zkpass/transgate-extension-sdk).

## Quick start

```bash
cd 01-minimal             # Or choose 02-login-site
npm install                # installs @zkpass/transgate-extension-sdk + esbuild
npm run build              # esbuild bundles the SW into dist/, copies manifest + sidepanel files
# then in Chrome:
#   chrome://extensions → Developer mode → "Load unpacked" → select the dist/ directory
```

## License

[Apache 2.0](./LICENSE)

## Version and verification scope

Both examples declare `@zkpass/transgate-extension-sdk: ^0.1.0` and esbuild `^0.23.0`; neither includes a dependency lockfile or a Node engine declaration. The guide's Node 18+ statement is historical guidance, not a tested runtime matrix. Record the actually resolved SDK version before relying on mirrored defaults, error codes, or internal cleanup behavior.

The manifests specify Chrome `114` minimum and request `webRequest`, `webNavigation`, `tabs`, `storage`, `sidePanel`, and `<all_urls>`. Review these permissions before loading the extension. Configuration contains demonstration schema/application/trigger settings and fixed AES material; it is not a production credential or key-management example. Do not copy fixed bytes into production or log private proofs/session data.

The build scripts bundle the worker and copy UI/manifest files into `dist`; `clean` removes `dist`. No installation, build, browser loading, login, schema request, verification, or cleanup command was run during this review. No automated tests or CI workflow are tracked. SDK internals and hosted service compatibility are not verified by these example sources alone.

For a future authorized manual check, use controlled accounts/data: inspect generated permissions and resolved versions, confirm the target login state, trigger one run after `onListening`, observe status/result handling, and check failure/cancellation behavior without recording confidential data. The bundled panels have no general cancellation API bridge; the guide's AbortController snippet is a separate integration pattern. Do not treat a rendered JSON result as downstream contract acceptance or replay protection.
