// ──────────────────────────────────────────────────────────────────────────────
// 01-minimal — side panel UI
//
// Two responsibilities:
//   1. When the user clicks "Run verification", ask the SW to start a run.
//   2. When the SW pushes back a result, render it as pretty-printed JSON.
// ──────────────────────────────────────────────────────────────────────────────

const outputEl = document.getElementById('out');

// Run button → tell the SW to start.
document.getElementById('run').addEventListener('click', () => {
  outputEl.textContent = 'Running…';
  chrome.runtime.sendMessage({ type: 'run' });
});

// Listen for the result the SW pushes when verification finishes.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'result') {
    outputEl.textContent = JSON.stringify(message.result, null, 2);
  }
});
