# Integration Guide

How to integrate **`@zkpass/transgate-extension-sdk`** into your own Chrome MV3 extension — from `npm install` to a working `runZKTLS` call, including the patterns the SDK was designed around.

For type signatures and option tables, see **[API Reference](./api-reference.md)**.
For runnable code, see the **[`01-minimal/`](../01-minimal)** and **[`02-login-site/`](../02-login-site)** examples.

---

## Contents

- [What this SDK does](#what-this-sdk-does)
- [Prerequisites](#prerequisites)
- [Install the SDK](#install-the-sdk)
- [How a verification call works](#how-a-verification-call-works)
- [Minimal integration](#minimal-integration)
- [`onListening`: the precise trigger hook](#onlistening-the-precise-trigger-hook)
- [Login-gated sites](#login-gated-sites)
- [Error handling](#error-handling)
- [Common patterns](#common-patterns)
- [Troubleshooting / FAQ](#troubleshooting--faq)
- [Further reading](#further-reading)

---

## What this SDK does

The SDK runs **zkPass zkTLS verification entirely inside your extension's MV3 background service worker**. Your extension:

1. provides a zkPass **`schemaId`** (what to verify), an **`appId`**, and AES key material,
2. triggers the target site to make its API request (the one the schema is matching against),
3. receives a **proof object** (notary signature + nullifier hash + public fields) it can use downstream (e.g. on-chain verification).

The SDK doesn't navigate, log in, or trigger requests on your behalf — it observes traffic and builds the proof. Causing the target request is your responsibility (the [`onListening`](#onlistening-the-precise-trigger-hook) hook tells you the exact moment to do so).

```
┌─────────────────────────────┐
│ Your MV3 extension (SW)     │
│  ┌────────────────────────┐ │       ┌──────────────────────┐
│  │ TransGateExtensionCore │─┼──────▶│ zkPass dev/prod API  │
│  │     .runZKTLS({...})   │ │       │ schema + allocate    │
│  └──────────┬─────────────┘ │       └──────────┬───────────┘
│             │               │                  │
│             ▼               │                  ▼
│  ┌────────────────────────┐ │       ┌──────────────────────┐
│  │ chrome.webRequest      │◀┼───────│ target site (your    │
│  │   observes traffic     │ │       │ tab triggers request)│
│  └────────────────────────┘ │       └──────────────────────┘
│             │               │
│             ▼               │       ┌──────────────────────┐
│  ┌────────────────────────┐ │──────▶│ notary node (TLS)    │
│  │ WASM proof + sig       │ │       │ allocate + sign      │
│  └────────────────────────┘ │       └──────────────────────┘
└─────────────────────────────┘
                              ▼
                  proof you can use downstream
```

---

## Prerequisites

- Chrome 114+ (or any Chromium-based browser with the same MV3 support).
- Node.js 18+ and npm (for installing the SDK in your project).
- A zkPass `schemaId` and `appId` — both required for any call; the `appId` cannot be an empty string.
- AES key material (`aesKey: Uint8Array(32)`, `aesNonce: Uint8Array(12)`). Placeholder bytes are enough to produce a valid proof in dev/test; in production, generate fresh random bytes per run.

### Minimum `manifest.json` for the SDK

The SDK itself strictly requires this much:

```json
{
  "manifest_version": 3,
  "background": { "service_worker": "sw.js", "type": "module" },
  "permissions": ["webRequest", "webNavigation", "tabs", "storage"],
  "host_permissions": ["<all_urls>"],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

- `wasm-unsafe-eval` is **required** — the SDK runs an inlined WASM module.
- `<all_urls>` is needed because the SDK opens a TLS connection to a notary node selected at runtime from the schema.
- The SDK **only works inside a background service worker**; calling it from any other context returns `INVALID_CONTEXT`.

### Choosing a UI surface

The SDK has no opinion about how you surface progress and results to the user — options page, side panel, content script, anything that can `chrome.runtime.sendMessage` to your SW works. Both bundled examples use **`chrome.sidePanel`** because it stays open across tab switches, which is convenient when `onListening` opens the trigger page in the foreground.

If you want to copy that setup, add to the manifest above:

```json
{
  "minimum_chrome_version": "114",
  "action": {},
  "side_panel": { "default_path": "sidepanel.html" },
  "permissions": ["webRequest", "webNavigation", "tabs", "storage", "sidePanel"]
}
```

…and call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` once at SW startup so clicking the toolbar icon opens the side panel.

---

## Install the SDK

```bash
npm install @zkpass/transgate-extension-sdk
```

The package is ESM-only and ships a single bundled entry (`dist/index.js`) with type declarations. **The WASM is inlined into the bundle** — there is no separate `.wasm` asset to host or path-coordinate.

In a real extension you'll typically run the SDK through your bundler (Vite / Webpack / esbuild), e.g.:

```ts
import { TransGateExtensionCore } from '@zkpass/transgate-extension-sdk';
```

Both examples in this repo bundle the SDK with esbuild at build time (`npm run build`) and load the resulting `dist/` directory as the unpacked extension.

---

## How a verification call works

A single `runZKTLS` call performs these steps in order and **short-circuits on the first failure** (each potential failure maps to a specific [`ErrorCode`](./api-reference.md#errorcode)):

| # | Step | Fails with |
|---|---|---|
| 1 | Fetch schema (`GET /schema/{schemaId}`) | `SCHEMA_FETCH_FAILED` |
| 2 | Verify schema signature | `SIGNATURE_INVALID` |
| 3 | Allocate a notary node (`POST /sdk/atask`) | `NODE_UNREACHABLE` |
| 4 | Register `webRequest` listener; wait for a matching request | `INTERCEPT_TIMEOUT` |
| 5 | Run the proof body (3P-TLS, VOLE, circuit, signature) | `SESSION_FAILED` / `TLS_PROXY_FAILED` / `PROOF_COMPUTE_FAILED` / `NODE_VERIFY_FAILED` / `PROOF_GENERATION_FAILED` |

Also possible: `MISSING_AES_KEY` (no keys), `INVALID_CONTEXT` (not a SW), `ABORTED` (caller cancelled).

**The SDK never throws.** Any failure becomes a `{ success: false, code, error }` result. You always get a result object back.

---

## Minimal integration

The smallest useful integration is the [`01-minimal/`](../01-minimal) example. Here are the only meaningful pieces of code:

**`config.js`** — what you supply:

```js
export const SCHEMA_ID = '<your-schema-id>';
export const APP_ID = '<your-app-id>';
export const TRIGGER_URL = 'https://example.com/page-that-emits-the-request';
export const AES_KEY = Array(32).fill(1);
export const AES_NONCE = Array(12).fill(2);
```

**`sw.js`** — the SDK call plus the UI bridge:

```js
import { TransGateExtensionCore } from '@zkpass/transgate-extension-sdk';
import { SCHEMA_ID, APP_ID, TRIGGER_URL, AES_KEY, AES_NONCE } from './config.js';

// (Side-panel UX only — omit if you use a different UI surface.)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const sdk = new TransGateExtensionCore();

async function run() {
  const result = await sdk.runZKTLS({
    schemaId: SCHEMA_ID,
    appId: APP_ID,
    aesKeys: {
      aesKey: new Uint8Array(AES_KEY),
      aesNonce: new Uint8Array(AES_NONCE),
    },
    // Open the trigger page only after the SDK is ready to capture its request.
    // active: true is safe because the side panel stays open across tab switches.
    // (Use active: false instead for UI surfaces that dismiss on focus loss.)
    onListening: () => chrome.tabs.create({ url: TRIGGER_URL, active: true }),
  });

  console.log('zkPass result', result);
  chrome.runtime.sendMessage({ type: 'result', result }).catch(() => {});
}

// UI → SW: start a run when the user clicks the button.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'run') {
    run();
  }
});
```

**`sidepanel.js`** — a button that asks the SW to run, and a listener that renders the result:

```js
document.getElementById('run').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'run' });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'result') {
    document.getElementById('out').textContent = JSON.stringify(message.result, null, 2);
  }
});
```

That's all the SDK requires. Everything else (progress UI, error categorization, multi-schema batching) is layered on top.

---

## `onListening`: the precise trigger hook

The single most important pattern in this SDK.

**The problem.** Step 4 of `runZKTLS` registers a `chrome.webRequest` listener and then waits for a matching request. If your target request fires *before* the listener is up, the SDK won't see it, and the call ends in a silent `INTERCEPT_TIMEOUT` after `timeoutMs` (default 2 min).

**The solution.** `onListening` fires **once**, right after the SDK registers its listener — that's the exact moment to make the page emit the request.

```js
await sdk.runZKTLS({
  schemaId, appId, aesKeys,
  onListening: async () => {
    // Listener is up. Now do whatever causes the target site to emit the matching request.
    await chrome.tabs.create({ url: TRIGGER_URL, active: true });
  },
});
```

### Why not match `STATUS_MSG.WAITING_MATCH` instead?

You *could* match the `onStatus` text `STATUS_MSG.WAITING_MATCH` to detect the moment, but **prefer `onListening`**:

- `onListening` is a hook **designed** for this — it fires on the same line that registers the listener, with no text dependency.
- Matching the text creates a hidden coupling to the SDK's internal progress wording; a future wording change silently breaks your trigger and you'll only see `INTERCEPT_TIMEOUT` with no obvious cause.

### Three ways to trigger the request

| Pattern | When to use | Notes |
|---|---|---|
| `chrome.tabs.create({ url, active })` (used in both examples) | Most schemas; you control the URL | `active: true` makes the page visible — fine when your UI surface (side panel, content script overlay) survives tab switches. Use `active: false` for surfaces that dismiss on focus loss. Close the tab in a `finally` block when you're done. |
| `chrome.scripting.executeScript({ target, func/files })` injected into an already-open tab | The user is already on the target page | Saves opening a new tab; needs the `scripting` permission. |
| `fetch(url)` from inside the SW | Public APIs with no JS gating | Note: SW-originated requests **are** observed by `webRequest`, but they don't carry the page's auth state. |

For login-gated sites you almost always want the first pattern (the tab inherits browser cookies for that origin).

---

## Login-gated sites

A schema may require the user to be **logged into the target site** (e.g. verifying a Twitter / X follower count requires an authenticated `x.com` session). The pattern is straightforward:

1. **Tell the user to log in first** in the same Chrome profile — your UI should make this a prerequisite.
2. Open the target URL with `chrome.tabs.create({ url, active: true })` inside `onListening`. The new tab inherits the profile's cookies for that origin → the page makes its API request as the logged-in user → the SDK captures it.

The [`02-login-site/`](../02-login-site) example does exactly this against the Twitter / X follower schema.

If the user is not logged in, the page typically still loads but **doesn't emit the matching API request** (it redirects to a login page or hits a different endpoint), and you'll get `INTERCEPT_TIMEOUT`. Use that as a signal to prompt re-login.

---

## Error handling

The SDK has 12 [`ErrorCode`](./api-reference.md#errorcode) values, by design — they map to the verification steps so you can localize the failure. But 12 codes is too many to show users directly. A pragmatic strategy is to **categorize** them into a handful of user-actionable buckets with hints. The [`02-login-site/`](../02-login-site) example uses an `ERROR_INFO` lookup table:

```js
const ERROR_INFO = {
  MISSING_AES_KEY:         { category: 'config',  hint: 'Check the extension setup.' },
  INVALID_CONTEXT:         { category: 'config',  hint: 'Check the extension setup.' },
  SCHEMA_FETCH_FAILED:     { category: 'schema',  hint: 'Schema fetch failed.' },
  SIGNATURE_INVALID:       { category: 'schema',  hint: 'Schema signature invalid.' },
  NODE_UNREACHABLE:        { category: 'node',    hint: 'Could not allocate a notary node. Check appId.' },
  INTERCEPT_TIMEOUT:       { category: 'trigger', hint: 'No matching request — are you logged into the target site?' },
  SESSION_FAILED:          { category: 'network', hint: 'Notary connection failed; retry.' },
  TLS_PROXY_FAILED:        { category: 'network', hint: 'Notary connection failed; retry.' },
  NODE_VERIFY_FAILED:      { category: 'network', hint: 'Notary connection failed; retry.' },
  PROOF_COMPUTE_FAILED:    { category: 'proof',   hint: 'Local proof generation failed.' },
  PROOF_GENERATION_FAILED: { category: 'proof',   hint: 'Local proof generation failed.' },
  ABORTED:                 { category: 'aborted', hint: 'Cancelled.' },
};

if (!result.success) {
  const info = ERROR_INFO[result.code] || { category: 'unknown', hint: result.error };
  showError(info.category, info.hint, result.code, result.error);
}
```

This collapses 12 codes into 7 user-facing categories with actionable hints.

**Always also log `code` and `error`** for support / debugging — `error` carries the underlying message (network error, server response, etc.).

---

## Common patterns

### Live progress

```js
onStatus: (msg) => updateUI({ stage: msg })
```

`msg` is a [`STATUS_MSG`](./api-reference.md#status_msg) value. Use the constant for any conditional logic; use the raw text only for display.

### Bounded timeout

The SDK default is 2 minutes. Override per-call:
```js
await sdk.runZKTLS({ ..., timeoutMs: 90_000 })
```

### Cancellation

```js
const ac = new AbortController();
const p = sdk.runZKTLS({ ..., signal: ac.signal });
// elsewhere:
ac.abort();  // resolves p with { success: false, code: 'ABORTED' }
```

Note: cancellation is **best-effort** — the SDK checks `signal` between phases, but cannot interrupt WASM computation mid-call.

### Multiple schemas — serial, not concurrent

The SDK is designed to be called serially. Each `runZKTLS` registers and tears down a `chrome.webRequest` listener; running two in parallel would observe each other's traffic and confuse the matching. Loop sequentially:

```js
for (const schemaId of schemaIds) {
  results.push(await sdk.runZKTLS({ schemaId, ... }));
}
```

The same SDK instance is reusable across calls — no need to `new` per run.

### WASM cleanup

`runZKTLS` releases WASM on every call (success or failure) via an internal `finally`. You **don't need to call `destroy()`**. It exists only as an explicit early-release escape hatch (idempotent).

### Downstream use of the proof

A successful `RunResult` carries:
- `validatorSignature` — the notary's signature, suitable for on-chain verification.
- `uHash` — the nullifier hash (prevents replay).
- `publicFields` — the fields the schema declared public.
- `allocatorAddress` / `allocatorSignature`, `validatorAddress`, `taskId` — for on-chain claim flows.

How exactly you submit on-chain is contract-specific and out of scope for this guide.

---

## Troubleshooting / FAQ

**`INTERCEPT_TIMEOUT` — the most common failure.**
Order of causes, from most to least common:
1. The target page never emitted the matching request (user not logged in, page changed its API, wrong `TRIGGER_URL`).
2. The request fired *before* `onListening`, so the listener missed it. Make sure you only trigger inside `onListening`, not on `runZKTLS` startup.
3. `timeoutMs` is too short for slow networks.

Quick checks: open Chrome devtools on the trigger tab, watch the Network panel — did the matching request actually fire? Did it match the schema's URL pattern?

**`NODE_UNREACHABLE`.**
Almost always an `appId` problem (empty / invalid / revoked) — the server rejects with HTTP 500. Double-check the value in `config.js`. The dev server endpoint also matters; if you're targeting prod, ensure your `appId` is valid there.

**`SIGNATURE_INVALID`.**
The schema's signature didn't verify against the SDK's pinned public key. Either the schema was tampered with (unlikely on the canonical zkPass server) or you're targeting a schema published with a key the SDK doesn't recognize. Check the SDK version (key may have rotated).

**`MISSING_AES_KEY`.**
You forgot to pass `aesKeys`, or one of `aesKey`/`aesNonce` is missing. They are both required.

**Nothing happens / no logs.**
Open `chrome://extensions` → click the extension's **service worker** link to open its DevTools console. SW logs don't appear in the page's DevTools.

**My `dist/index.js` is huge (~12 MB).**
That's expected — WASM (~2 MB), DOM parsing (jsdom), and crypto are inlined into the single bundle so consumers don't have to host a `.wasm` file. Bundle size of *your* extension grows by the same amount.

---

## Further reading

- **[`api-reference.md`](./api-reference.md)** — full API surface (types, options, codes, status constants).
- **[`01-minimal/`](../01-minimal)** — the smallest runnable extension.
- **[`02-login-site/`](../02-login-site)** — realistic integration with progress + categorized errors.
- **[`@zkpass/transgate-extension-sdk` on npm](https://www.npmjs.com/package/@zkpass/transgate-extension-sdk)** — the canonical source of truth (README is rendered on the package page).
