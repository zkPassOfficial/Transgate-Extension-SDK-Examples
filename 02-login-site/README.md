# 02 — Login-gated site (Twitter / X)

A realistic zkPass SDK integration against a schema that requires the user to be **logged into the target site** (`x.com`).

Built on top of `01-minimal`, this example adds:

- **Live progress** via `onStatus` (every verification stage shows up in the side panel, plus a history timeline).
- **Categorized error handling** based on `result.code` — the SDK's 12 error codes are grouped into actionable categories with hints.
- **Full proof display** — every field of a successful `RunResult` is shown.

The default schema (`SCHEMA_ID` in `config.js`) is the public zkPass dev schema **"Verify you follow @zkPass on Twitter / X"**, opening `https://x.com/zkPass` as the trigger page.

## What's in this example

| File | What it does |
|---|---|
| `manifest.json` | MV3 manifest with the SDK's required permissions, CSP, and `side_panel` config. |
| `sw.js` | Background SW. Calls `runZKTLS`, streams `onStatus` to the side panel, opens the trigger URL inside `onListening`, categorizes errors, pushes the full result. |
| `sidepanel.{html,js}` | Side-panel UI: live stage + history + result card. Shows the full proof on success, or `code` / `category` / `hint` on failure. Auto-scrolls to keep the latest content in view. |
| `config.js` | Defaults for the Twitter / X follow schema — **hardcoded for testing**, replace with your own for production. |
| `package.json` | Pulls in `@zkpass/transgate-extension-sdk` + `esbuild`; `npm run build` bundles the SW into `dist/`. |

## Build & run

```bash
npm install         # installs @zkpass/transgate-extension-sdk + esbuild
npm run build       # esbuild bundles sw.js into dist/, then copies manifest + sidepanel files
```

Then:

1. **Log in to `x.com`** in this Chrome profile. Without an active session the page won't emit the matching API request and you'll get `INTERCEPT_TIMEOUT`.
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the **`dist/`** directory.
3. Click the extension's toolbar icon → the **side panel** opens on the right → click **Run verification**. The side panel shows the live stage and history while Chrome loads `x.com/zkPass` in the foreground tab, then either the proof fields or an error card with a hint.

The side panel stays open across tab switches, so the live progress stays visible while the trigger page loads.

## Why `onListening` matters here

`onListening` fires the moment the SDK's `chrome.webRequest` listener is registered. **That** is the precise moment to make the target page emit its request — opening the URL any earlier risks the request firing before the listener is up (which manifests as a silent `INTERCEPT_TIMEOUT`).

Prefer this callback over matching the `STATUS_MSG.WAITING_MATCH` text — `onListening` is a hook designed for this and won't break if SDK progress wording changes.

## Error categories (see `ERROR_INFO` in `sw.js`)

| `code` | category | what to do |
|---|---|---|
| `MISSING_AES_KEY` / `INVALID_CONTEXT` | `config` | Check extension setup / context. |
| `SCHEMA_FETCH_FAILED` / `SIGNATURE_INVALID` | `schema` | Check schemaId, network, and signature. |
| `NODE_UNREACHABLE` | `node` | Check `appId` and network. |
| `INTERCEPT_TIMEOUT` | `trigger` | Make sure you're logged in and the page actually emits the matching request. |
| `SESSION_FAILED` / `TLS_PROXY_FAILED` / `NODE_VERIFY_FAILED` | `network` | Notary network issue; retry. |
| `PROOF_COMPUTE_FAILED` / `PROOF_GENERATION_FAILED` | `proof` | Inspect `error` for details. |
| `ABORTED` | `aborted` | Caller cancelled via `AbortSignal`. |

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Bundle `sw.js` into `dist/sw.js` and copy `manifest.json` / `sidepanel.html` / `sidepanel.js` into `dist/`. |
| `npm run clean` | Remove `dist/`. |

## Implementation boundaries

This example declares SDK `^0.1.0` without a lockfile. Remote schema/notary services, schema/application compatibility, and browser behavior have not been tested here. The fixed AES material in configuration is demonstration input, not a production key-management pattern; no valid-proof guarantee follows from placeholder bytes.

The worker handles incoming run messages without a worker-level in-flight guard or an AbortController cancellation bridge. Avoid overlapping requests and add deliberate lifecycle/error handling before adapting it. Proofs and underlying error messages may contain sensitive information; inspect them locally and redact before sharing.

The login example forwards status history and categorizes unsuccessful SDK results. Its `finally` closes the trigger tab if created; the `try` has no `catch`, so an unexpected rejected promise is not converted into a categorized result. The configured login-gated site/schema is a historical example, not a current availability claim.
