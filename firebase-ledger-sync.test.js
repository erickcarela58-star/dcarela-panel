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
  assert.match(adapter, /partial_error/);
});

test('los movimientos creados en web publican un evento idempotente al ledger global', () => {
  const createStart = adapter.indexOf("if (action === 'fin.movement.create')");
  const publishStart = adapter.indexOf("if (action === 'fin.movement.publish')", createStart);
  const transferStart = adapter.indexOf("if (action === 'fin.transfer.create')", publishStart);
  const create = adapter.slice(createStart, publishStart);
  const publish = adapter.slice(publishStart, transferStart);
  assert.match(create, /eventId = `ledger-\$\{movementId\}`/);
  assert.match(create, /'LedgerMovimientoRegistrado'/);
  assert.match(create, /sync_event_id: eventId/);
  assert.match(create, /transaction\.set\(eventRef, eventDocument/);
  assert.match(publish, /eventId = `ledger-\$\{id\}`/);
  assert.doesNotMatch(publish, /transaction\.get\(eventRef\)/);
  assert.match(publish, /existing = await eventRef\.get\(\)/);
  assert.match(publish, /row\.event_type === 'LedgerMovimientoRegistrado'/);
  assert.match(publish, /Movimiento enviado al ledger global/);
});
