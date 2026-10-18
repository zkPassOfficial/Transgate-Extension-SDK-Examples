# API Reference

The public API surface of `@zkpass/transgate-extension-sdk` — small and intentionally so.

> This is a mirror of the SDK's own API reference, kept here so you can navigate everything from the examples repo. For the canonical version, see the README on the [`@zkpass/transgate-extension-sdk` npm page](https://www.npmjs.com/package/@zkpass/transgate-extension-sdk).

## Version scope

Both checked-in examples declare `^0.1.0`; no lockfile pins a resolved package. This reference is retained as an integration aid, not an audit of the installed SDK internals. Defaults, export completeness, status constants, cancellation, and WASM cleanup must be checked against the selected SDK version. The examples themselves call `runZKTLS`; they do not validate every API described below. No SDK execution or network verification was performed.

## Public exports

```ts
import {
  TransGateExtensionCore,
  STATUS_MSG,
  VERSION,
  type RunZKTLSOptions,
  type RunResult,
  type ErrorCode,
  type AesKeyMaterial,
} from '@zkpass/transgate-extension-sdk';
```

## `class TransGateExtensionCore`

| Member | Signature | Description |
|---|---|---|
| constructor | `new TransGateExtensionCore()` | Creates a reusable instance. Holds no cross-call state. |
| `runZKTLS` | `(opts: RunZKTLSOptions) => Promise<RunResult>` | Runs one full verification. The mirrored contract uses `RunResult` for failures; consumers should still handle rejected promises. |
| `destroy` | `() => Promise<void>` | Optional, idempotent manual WASM release. Usually unnecessary — `runZKTLS` releases WASM internally on every call (success or failure). |

## `RunZKTLSOptions`

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `schemaId` | `string` | yes | — | A published zkPass schema id. |
| `appId` | `string` | yes | — | A valid zkPass appId. Server acceptance and error status depend on the deployed service. |
| `aesKeys` | `{ aesKey: Uint8Array; aesNonce: Uint8Array }` | yes | — | AES key material injected by the caller. |
| `httpVersion` | `string` | no | `'1.1'` | Override the HTTP version. `/schema` does not always return it. |
| `timeoutMs` | `number` | no | `120000` | Documented timeout parameter; a hard end-to-end deadline is not verified here. |
| `onStatus` | `(msg: string) => void` | no | — | Progress callback. `msg` is one of the [`STATUS_MSG`](#status_msg) values. |
| `onListening` | `() => void \| Promise<void>` | no | — | Called once when the `chrome.webRequest` listener is registered — the **precise moment** to trigger the target request. |
| `signal` | `AbortSignal` | no | — | Cancellation. Best-effort (checked between phases; WASM computation cannot be interrupted mid-call). |

## `RunResult`

```ts
type RunResult =
  | {
      success: true;
      taskId: string;
      allocatorAddress: string;
      allocatorSignature: string;
      validatorAddress: string;
      validatorSignature: string;
      uHash: string;            // nullifier hash
      publicFields: unknown[];
    }
  | { success: false; code: ErrorCode; error: string };
```

On success you get the notary's `validatorSignature`, the `uHash` (nullifier), `publicFields`, and the allocator/validator addresses and signatures. On failure, `code` is a stable [`ErrorCode`](#errorcode) and `error` carries the underlying message.

## `ErrorCode`

Returned in order of the verification steps; the first failing step wins.

| Code | When it happens |
|---|---|
| `MISSING_AES_KEY` | `aesKeys` (aesKey / aesNonce) not provided. |
| `INVALID_CONTEXT` | Not running inside a Chrome MV3 service worker. |
| `SCHEMA_FETCH_FAILED` | Failed to fetch the schema, or the response was not a valid schema. |
| `SIGNATURE_INVALID` | Schema signature verification failed. |
| `NODE_UNREACHABLE` | Failed to allocate a notary node (`/sdk/atask`; e.g. invalid `appId`). |
| `INTERCEPT_TIMEOUT` | No matching request was observed before `timeoutMs`. |
| `SESSION_FAILED` | Connecting to the notary node / establishing the zkTLS session failed. |
| `TLS_PROXY_FAILED` | 3P-TLS handshake or capture-replay failed. |
| `PROOF_COMPUTE_FAILED` | Local circuit / proof generation failed (incl. WASM initialization). |
| `NODE_VERIFY_FAILED` | Node interaction failed (VOLE pairing / param upload / signature evaluation). |
| `PROOF_GENERATION_FAILED` | Other / uncategorized proof-body error (fallback — inspect `error`). |
| `ABORTED` | Cancelled by the caller's `AbortSignal`. |

For an actionable categorization strategy (grouping these 12 into 7 user-facing buckets with hints), see [Integration Guide → Error handling](./integration-guide.md#error-handling).

## `STATUS_MSG`

A frozen record of progress strings reported through `onStatus`. Use the constants rather than hard-coding the literal text so your logic survives wording changes:

```ts
import { STATUS_MSG } from '@zkpass/transgate-extension-sdk';

onStatus: (msg) => {
  if (msg === STATUS_MSG.WAITING_MATCH) { /* listener is up */ }
}
```

Available keys:

| Phase | Key | Value |
|---|---|---|
| Intercept | `WAITING_MATCH` | `Waiting for API requests to match` |
| Intercept | `ALL_API_MATCHED` | `All API requests matched` |
| Engine | `CONNECTING_NODE` | `Connecting to zkPass node` |
| Engine | `SESSION_ESTABLISHED` | `Session established` |
| Engine | `INIT_WASM` | `Initializing WASM` |
| Engine | `WASM_INITIALIZED` | `WASM initialized` |
| Engine (h1) | `STARTING_3P_TLS` | `Starting 3-Party TLS` |
| Engine (h1) | `SETTING_VOLE` | `Setting up VOLE pairs` |
| Engine (h1) | `GENERATING_CIRCUIT` | `Generating circuit proof` |
| Engine (h1) | `BUILDING_CIRCUIT` | `Building circuit on node` |
| Engine (h1) | `EVALUATING_CIRCUIT` | `Evaluating circuit` |
| Engine (h2) | `SENDING_HTTP2` | `Sending HTTP/2 requests` |
| Engine (h2) | `GENERATING_PROOF` | `Generating proof` |
| Engine (h2) | `SUBMITTING_PROOF` | `Submitting proof to node` |
| Engine | `VERIFICATION_COMPLETE` | `Verification complete` |

> Tip: prefer the [`onListening`](#runzktlsoptions) callback over matching `STATUS_MSG.WAITING_MATCH` for the "trigger the request" moment — `onListening` is a precise hook that doesn't depend on text matching.

## `VERSION`

```ts
import { VERSION } from '@zkpass/transgate-extension-sdk'; // e.g. '0.1.0'
```

## Runtime constraints (recap)

1. **Notary network access.** Requires `host_permissions: ["<all_urls>"]`.
2. **WASM is inlined** into the bundle — no separate asset to host (adds bundle size).
3. **`AbortSignal` is best-effort** — checked between phases, not mid-WASM.
4. **No hang without `signal`/`timeoutMs`** — default 2-minute timeout.
5. **`chrome.webRequest` is observe-only** under MV3 (no blocking).
