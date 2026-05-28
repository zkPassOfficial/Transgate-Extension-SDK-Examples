// ──────────────────────────────────────────────────────────────────────────────
// Configuration for the minimal example.
//
// Everything below is hardcoded for quick local testing. For your own integration:
//
//   • Replace SCHEMA_ID and APP_ID with values from your zkPass dashboard
//     (https://dev.zkpass.org). Each schema is tied to a specific HTTP API and
//     defines what gets verified.
//   • Replace TRIGGER_URL with the page whose network request the schema targets.
//   • For production, generate fresh AES key material per run (see notes below).
// ──────────────────────────────────────────────────────────────────────────────

// The schema ID identifies which API schema you're verifying against.
// Below is the public zkPass dev schema for weatherstack.com (no login required).
// REPLACE with your own schema ID from your zkPass dashboard.
export const SCHEMA_ID = '925af1cca5bc4537b372cdfdc00b2a3b';

// The app ID identifies your zkPass account / project.
// REPLACE with your own appId from https://dev.zkpass.org.
export const APP_ID = '761b3b13-eafd-44dc-abe2-49456ff74b5e';

// The URL we open after the SDK is ready, so the target site emits the request
// that the schema targets. Visiting weatherstack.com triggers its homepage API call.
// REPLACE if your schema targets a different site.
export const TRIGGER_URL = 'https://weatherstack.com';

// AES key + nonce used to encrypt parts of the proof on its way to the notary node.
// These all-1s / all-2s placeholders are fine for development and testing.
// For production, generate fresh random bytes per run, e.g.:
//   const AES_KEY   = crypto.getRandomValues(new Uint8Array(32));
//   const AES_NONCE = crypto.getRandomValues(new Uint8Array(12));
export const AES_KEY = Array(32).fill(1);
export const AES_NONCE = Array(12).fill(2);
