const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./panel.js'), 'utf8');
const start = source.indexOf('  async function cargarCuentasFin(');
const end = source.indexOf('  function dispararAlertaCumuloMensual()', start);
assert.ok(start > 0 && end > start, 'se localiza la carga real de cuentas');
const functionSource = source.slice(start, end).trim();

test('el diario empieza mientras una consulta independiente de Finanzas sigue pendiente', async () => {
  let finishPending;
  const pendingTransfers = new Promise(resolve => { finishPending = resolve; });
  const called = [];
  const adapter = {
    isAvailable: true,
    getFinanceAccounts: async () => [{ id: 'cash', reconciled_at: '2026-09-01T00:00:00Z' }],
    getFinanceCategories: async () => [],
    getFinanceCards: async () => [],
    getFinanceBudgets: async () => [],
    getFinancePreferences: async () => ({ cuenta_ingreso_default_id: 'cash' }),
    getFinanceCurrencies: async () => [],
    getFinanceCommitments: async () => [],
    getFinanceCommitmentPayments: async () => [],
    getFinancePendingTransfers: () => pendingTransfers,
    getFinanceJournal: async (_business, options) => {
      called.push(options);
      return [];
    },
  };
  const context = {
    authProvider: 'firebase', BUSINESS: 'fixture', window: { DcarelaFirebase: adapter },
    financeCore: { normalizeMovement: value => value }, finStateCache: null,
    console,
  };
  const load = vm.runInNewContext(`(${functionSource})`, context);
  let completed = false;
  const task = load('2026-09', '2026-09-01T00:00:00Z').then(result => {
    completed = true;
    return result;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(called.length, 1);
  assert.equal(called[0].historyFrom, '2026-09-01T00:00:00Z');
  assert.equal(completed, false, 'el resto de metadatos sigue pendiente');
  assert.equal(context.finStateCache, null, 'no publica un estado parcial mientras falta una consulta');
  finishPending([]);
  const result = await task;
  assert.deepEqual(await result.journalRequest, []);
  assert.equal(completed, true);
  assert.equal(context.finStateCache.accounts[0].id, 'cash');
});
