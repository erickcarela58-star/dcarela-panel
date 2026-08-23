const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const adapter = fs.readFileSync(__dirname + '/firebase-adapter.js', 'utf8');

test('integra el ledger Windows desde eventos Firebase sin escanear todo el histórico', () => {
  assert.match(adapter, /event_type', '==', 'LedgerMovimientoRegistrado'/);
  assert.match(adapter, /payload\.importeDopCentavos/);
  assert.match(adapter, /source: 'pos_sync_event'/);
  const method = adapter.slice(adapter.indexOf('async getFinanceMovements'), adapter.indexOf('async webSaleAction'));
  assert.doesNotMatch(method, /this\.getSyncEvents/);
});

test('la lectura financiera conserva fallback parcial y deduplica por id', () => {
  assert.match(adapter, /Promise\.allSettled/);
  assert.match(adapter, /const merged = new Map\(\)/);
  assert.match(adapter, /merged\.set\(item\.id, item\)/);
});
