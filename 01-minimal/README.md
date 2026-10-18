# 01 — Minimal example

The smallest Chrome MV3 extension that calls the zkPass SDK.

- One side-panel button → service worker runs `runZKTLS` → result is rendered as JSON.
- Default: zkPass dev **weatherstack** schema (no login required).

## What's in this example

| File | What it does |
|---|---|
| `manifest.json` | MV3 manifest with the permissions, CSP, and `side_panel` config the SDK requires. |
| `sw.js` | Background service worker. Creates one `TransGateExtensionCore`, calls `runZKTLS`, uses `onListening` to open the trigger URL. |
| `sidepanel.{html,js}` | Side-panel UI: a button + a `<pre>` that renders the result. |
| `config.js` | `SCHEMA_ID` / `APP_ID` / `TRIGGER_URL` — **hardcoded for testing**, replace with your own for production. |
| `package.json` | Pulls in `@zkpass/transgate-extension-sdk` + `esbuild`; `npm run build` bundles the SW into `dist/`. |

## Build & run

```bash
npm install         # installs @zkpass/transgate-extension-sdk + esbuild
npm run build       # esbuild bundles sw.js into dist/, then copies manifest + sidepanel files
```

Then in Chrome:

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked**
2. Select the **`dist/`** directory (not the example root).
3. Click the extension's toolbar icon → the **side panel** opens on the right → click **Run verification**.

The side panel stays open even when Chrome navigates to the trigger page, so you can watch the result come back without losing the UI.

## What to read first

To understand how the SDK is used, read the files in this order:

1. **`config.js`** — what you supply.
2. **`sw.js`** — the actual `runZKTLS` call and the `onListening` trigger hook.
3. **`sidepanel.{html,js}`** — UI plumbing only.

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Bundle `sw.js` into `dist/sw.js` and copy `manifest.json` / `sidepanel.html` / `sidepanel.js` into `dist/`. |
| `npm run clean` | Remove `dist/`. |

## Implementation boundaries

This example declares SDK `^0.1.0` without a lockfile. Remote schema/notary services, schema/application compatibility, and browser behavior have not been tested here. The fixed AES material in configuration is demonstration input, not a production key-management pattern; no valid-proof guarantee follows from placeholder bytes.

The worker handles incoming run messages without a worker-level in-flight guard or an AbortController cancellation bridge. Avoid overlapping requests and add deliberate lifecycle/error handling before adapting it. Proofs and underlying error messages may contain sensitive information; inspect them locally and redact before sharing.

The minimal worker opens the trigger tab in `onListening` but does not close it afterward and has no surrounding `try/catch`. A rejected SDK promise can therefore bypass its result message.
