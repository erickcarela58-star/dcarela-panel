import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, 'v35-26-inbox-fiscal.js'), 'utf8');
const start = source.indexOf('function invalidateFiscalRender(');
const end = source.indexOf('function facturadorItems(', start);
assert.ok(start >= 0 && end > start);

function harness({ facturadorError = '', inboxError = '' } = {}) {
  const events = [];
  const uiState = { facturadorBusiness: 'dcarela', facturadorError, error: inboxError };
  const fiscalHost = { dataset: { renderedSig: 'stale-same-count' } };
  const context = {
    uiState,
    document: { getElementById: id => id === 'v3526FiscalHost' ? fiscalHost : null },
    closeModal: () => events.push('close'),
    loadFacturadorForBooks: async () => events.push('reload-facturador'),
    loadInbox: async (_forceRates, options) => events.push(`reload-inbox:${options.force}`),
    renderFiscalHost: () => events.push('render-fiscal'),
    appSnapshot: () => ({ business: 'dcarela' }),
    showToast: (message) => events.push(`toast:${message}`)
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { handle: context.refreshFiscalAfterRevisionConflict, events, fiscalHost };
}

test('a stale 606 edit closes the form, reloads the canonical inbox, and requires reopening', async () => {
  const { handle, events, fiscalHost } = harness();
  assert.equal(await handle({ status: 409, code: 'fiscal_revision_conflict' }, '606'), true);
  assert.equal(fiscalHost.dataset.renderedSig, undefined, 'same row count must not hide fresh content');
  assert.deepEqual(events.slice(0, 3), ['close', 'reload-inbox:true', 'render-fiscal']);
  assert.match(events.at(-1), /ábrelo de nuevo/);
});

test('a stale Facturador e-CF reloads that document list without replaying the edit', async () => {
  const { handle, events } = harness();
  assert.equal(await handle({ status: 409, code: 'fiscal_revision_conflict' }, 'facturador'), true);
  assert.deepEqual(events.slice(0, 2), ['close', 'reload-facturador']);
  assert.equal(events.some(event => event.startsWith('reload-inbox:')), false);
});

test('other failures leave the form and data intact for normal error handling', async () => {
  const { handle, events } = harness();
  assert.equal(await handle({ status: 503, code: 'unavailable' }, '606'), false);
  assert.deepEqual(events, []);
});
