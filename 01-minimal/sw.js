// ──────────────────────────────────────────────────────────────────────────────
// 01-minimal — background service worker
//
// Flow:
//   1. User clicks "Run verification" in the side panel.
//   2. The side panel sends { type: 'run' } to this SW.
//   3. We call sdk.runZKTLS({...}).
//   4. When onListening fires, we open the trigger page so it emits the request
//      the SDK is waiting for.
//   5. The SDK returns the result; we log it and push it to the side panel.
// ──────────────────────────────────────────────────────────────────────────────

import { TransGateExtensionCore } from '@zkpass/transgate-extension-sdk';
import { SCHEMA_ID, APP_ID, TRIGGER_URL, AES_KEY, AES_NONCE } from './config.js';

// Make clicking the toolbar icon open the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// One SDK instance is enough — it doesn't hold per-run state.
const sdk = new TransGateExtensionCore();

async function run() {
  const result = await sdk.runZKTLS({
    schemaId: SCHEMA_ID,
    appId: APP_ID,
    aesKeys: {
      aesKey: new Uint8Array(AES_KEY),
      aesNonce: new Uint8Array(AES_NONCE),
    },

    // onListening fires the moment the SDK has registered its webRequest listener
    // and is ready to capture the matching request. That's the safe moment to open
    // the trigger page — opening it any earlier could miss the request entirely.
    //
    // active: true puts the page in the foreground so the user can see it. The side
    // panel stays open across tab switches, so it doesn't disappear when we navigate.
    onListening: () => chrome.tabs.create({ url: TRIGGER_URL, active: true }),
  });

  // Always log the full result to the SW console (open from chrome://extensions →
  // this extension → "Inspect views: service worker").
  console.log('zkPass result', result);

  // Push the result to the side panel for display.
  // If the side panel happens to be closed, there's no listener and .catch swallows
  // the "Receiving end does not exist" error.
  chrome.runtime.sendMessage({ type: 'result', result }).catch(() => {});
}

// Side panel → SW request. Starts a verification run.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'run') {
    run();
  }
});
