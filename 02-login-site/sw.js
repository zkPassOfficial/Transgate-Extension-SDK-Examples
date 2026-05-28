// ──────────────────────────────────────────────────────────────────────────────
// 02-login-site — background service worker
//
// A realistic zkPass integration: streams live progress to the side panel,
// categorizes errors, and forwards the full proof on success.
//
// Flow:
//   1. User clicks "Run verification" in the side panel.
//   2. Side panel sends { type: 'run' } to this SW.
//   3. We call sdk.runZKTLS({...}) and push a `state` message each time the SDK
//      emits an onStatus callback.
//   4. When onListening fires, we open the trigger page so it emits the matching
//      request the SDK is waiting for.
//   5. The SDK resolves with success/failure; we push the final state and clean up
//      the trigger tab.
//
// Side panel ↔ SW communication uses chrome.runtime.sendMessage. The side panel
// stays open across tab switches, so messages aren't lost when the user navigates
// to the trigger page.
// ──────────────────────────────────────────────────────────────────────────────

import { TransGateExtensionCore, STATUS_MSG } from '@zkpass/transgate-extension-sdk';
import { SCHEMA_ID, APP_ID, TRIGGER_URL, AES_KEY, AES_NONCE, TIMEOUT_MS } from './config.js';

// Make clicking the toolbar icon open the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// One SDK instance is enough — it doesn't hold per-run state.
const sdk = new TransGateExtensionCore();

// Map each SDK error code to a user-facing category and a short hint.
// Keeps the UI code simple — it just renders whatever strings are here.
// (See the README's "Error categories" table for the full mapping.)
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

// Push a state update to the side panel.
// chrome.runtime.sendMessage broadcasts to all extension pages; if the side panel
// is closed, there's no listener and the .catch swallows the error.
function pushState(state) {
  chrome.runtime.sendMessage({ type: 'state', ...state }).catch(() => {});
}

async function run() {
  // Running history of all stage messages we've seen — shown as a timeline in the UI.
  const history = [];
  pushState({ status: 'running', stage: 'starting…', history });

  // We open one trigger tab inside onListening; keep its id so we can close it later.
  let triggerTabId = null;

  try {
    const result = await sdk.runZKTLS({
      schemaId: SCHEMA_ID,
      appId: APP_ID,
      aesKeys: {
        aesKey: new Uint8Array(AES_KEY),
        aesNonce: new Uint8Array(AES_NONCE),
      },
      timeoutMs: TIMEOUT_MS,

      // onStatus is called every time the SDK transitions to a new stage,
      // e.g. "Waiting for matching request", "Connecting to notary node".
      // We append it to history and push the UI an update.
      onStatus: (stageMessage) => {
        history.push(stageMessage);
        pushState({ status: 'running', stage: stageMessage, history });
      },

      // onListening fires the moment the SDK has registered its webRequest listener
      // and is ready to capture the matching request. That's the safe moment to open
      // the trigger page — opening it any earlier could miss the request entirely.
      //
      // active: true so the user sees the page; the side panel stays open across tabs.
      onListening: async () => {
        const tab = await chrome.tabs.create({ url: TRIGGER_URL, active: true });
        triggerTabId = tab.id;
      },
    });

    // runZKTLS resolves with one of two shapes:
    //   { success: true,  ...proofFields }
    //   { success: false, code, error }
    if (result.success) {
      pushState({
        status: 'done',
        stage: STATUS_MSG.VERIFICATION_COMPLETE,
        history,
        // Spread proof fields (taskId, validatorAddress, validatorSignature, uHash,
        // allocatorAddress, allocatorSignature, publicFields) onto the state.
        ...result,
      });
    } else {
      // Look up category + hint, falling back to "unknown" if we don't recognize the code.
      const info = ERROR_INFO[result.code] || { category: 'unknown', hint: result.error };
      pushState({
        status: 'done',
        success: false,
        history,
        code: result.code,
        error: result.error,
        category: info.category,
        hint: info.hint,
      });
    }
  } finally {
    // Always try to close the trigger tab we opened — even on error.
    if (triggerTabId !== null) {
      try {
        await chrome.tabs.remove(triggerTabId);
      } catch {
        // Tab may already be gone (user closed it manually). Ignore.
      }
    }
  }
}

// Side panel → SW request. Starts a verification run.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'run') {
    run();
  }
});
