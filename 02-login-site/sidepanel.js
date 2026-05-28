// ──────────────────────────────────────────────────────────────────────────────
// 02-login-site — side panel UI
//
// Receives state pushes from the SW and renders them. The SW pushes one of:
//   { type: 'state', status: 'running', stage, history }
//   { type: 'state', status: 'done', success: true,  history, ...proofFields }
//   { type: 'state', status: 'done', success: false, history, code, error, category, hint }
// ──────────────────────────────────────────────────────────────────────────────

const stageEl   = document.getElementById('stage');
const historyEl = document.getElementById('history');
const cardEl    = document.getElementById('card');

// The proof fields the SDK returns on success — shown as labelled rows in the UI.
const PROOF_FIELDS = [
  'taskId',
  'validatorAddress',
  'validatorSignature',
  'uHash',
  'allocatorAddress',
  'allocatorSignature',
];

// HTML-escape a value before injecting it via innerHTML, so a stray '<' or '"' in
// the data can't break the markup (or, worst case, inject script).
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Render one labelled key/value row (used for proof fields and error details).
function renderRow(key, value) {
  return `<div class="row"><span class="k">${key}</span><span class="v mono">${escapeHtml(value)}</span></div>`;
}

// Render the entire UI from a single state object.
function render(state) {
  // 1. Current stage — always shown at the top.
  stageEl.textContent = state.stage || '—';

  // 2. History list. The latest entry is highlighted while still running.
  const history = state.history || [];
  historyEl.innerHTML = history
    .map((message, index) => {
      const isCurrent = index === history.length - 1 && state.status !== 'done';
      const className = isCurrent ? ' class="current"' : '';
      return `<li${className}>${escapeHtml(message)}</li>`;
    })
    .join('');

  // 3. Result card — only shown when verification is done.
  if (state.status !== 'done') {
    cardEl.innerHTML = '';
  } else if (state.success) {
    // Success: list every proof field, then publicFields as JSON.
    const proofRows = PROOF_FIELDS.map((field) => renderRow(field, state[field])).join('');
    const publicFieldsRow = renderRow('publicFields', JSON.stringify(state.publicFields));
    cardEl.innerHTML = `
      <div class="card">
        <div class="ok">success</div>
        ${proofRows}
        ${publicFieldsRow}
      </div>`;
  } else {
    // Failure: show code, category, raw error, and the human-readable hint.
    const errorRows =
      renderRow('code', state.code) +
      renderRow('category', state.category) +
      renderRow('error', state.error);
    cardEl.innerHTML = `
      <div class="card">
        <div class="fail">failed</div>
        ${errorRows}
        <div class="hint">${escapeHtml(state.hint || '')}</div>
      </div>`;
  }

  // Auto-scroll: keep the latest content (history tail, proof card) in view.
  window.scrollTo(0, document.documentElement.scrollHeight);
}

// Run button → ask the SW to start a verification run.
document.getElementById('run').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'run' });
});

// Listen for state pushes from the SW.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'state') {
    render(message);
  }
});
