const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const adapter = fs.readFileSync(__dirname + '/firebase-adapter.js', 'utf8');

test('integra el ledger Windows desde eventos Firebase sin escanear todo el histórico', () => {
  assert.match(adapter, /event_type', '==', 'LedgerMovimientoRegistrado'/);
  assert.match(adapter, /payload\.importeDopCentavos/);
  assert.match(adapter, /financeMovementFromLedgerEvent/);
  assert.match(adapter, /'web_sync_event' : 'pos_sync_event'/);
  const method = adapter.slice(adapter.indexOf('async getFinanceMovements'), adapter.indexOf('async webSaleAction'));
  assert.match(method, /this\.getSyncEvents\(businessId, \{ from, to, limit: SYNC_EVENT_MAX_BATCH,[\s\S]{0,120}includeArchives: true, eventTypes: \['LedgerMovimientoRegistrado'\] \}\)/);
  assert.match(method, /events\.filter\(event => event\.event_type === 'LedgerMovimientoRegistrado'\)/);
});

test('la lectura financiera conserva fallback parcial y deduplica por identidad contable', () => {
  assert.match(adapter, /Promise\.allSettled/);
  assert.match(adapter, /const merged = new Map\(\)/);
  assert.match(adapter, /merged\.set\(financeMovementKey\(item\), item\)/);
  assert.match(adapter, /sync-ledger-/);
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
  assert.match(adapter, /cuentaOrigenId:/);
  assert.match(adapter, /cuentaDestinoId:/);
  assert.match(adapter, /importeOriginalCentavos:/);
  assert.match(adapter, /idempotencyKey:/);
});

test('las transferencias web tambien llegan a Windows como un solo asiento ledger', () => {
  const transferStart = adapter.indexOf("if (action === 'fin.transfer.create')");
  const categoryStart = adapter.indexOf("if (action === 'fin.category.upsert')", transferStart);
  const transfer = adapter.slice(transferStart, categoryStart);
  assert.match(transfer, /eventId = `ledger-\$\{movementId\}`/);
  assert.match(transfer, /transaction\.set\(eventRef, eventDocument/);
  assert.match(transfer, /'LedgerMovimientoRegistrado'/);
  assert.match(transfer, /cuenta_destino_id: targetId/);
});
