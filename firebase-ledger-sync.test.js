const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const adapter = fs.readFileSync(__dirname + '/firebase-adapter.js', 'utf8');
const vm = require('node:vm');

test('integra el ledger Windows desde eventos Firebase sin escanear todo el histórico', () => {
  assert.match(adapter, /event_type', '==', 'LedgerMovimientoRegistrado'/);
  assert.match(adapter, /payload\.importeDopCentavos/);
  assert.match(adapter, /source: 'pos_sync_event'/);
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

test('el saldo de cuentas puede releer solo el ledger posterior al ultimo cuadre', () => {
  const start = adapter.indexOf('async getFinanceLedgerMovements');
  const end = adapter.indexOf('async getFinanceMovements', start);
  const method = adapter.slice(start, end);
  assert.match(method, /from, to, limit: SYNC_EVENT_MAX_BATCH/);
  assert.match(method, /includeArchives: true/);
  assert.match(method, /eventTypes: \['LedgerMovimientoRegistrado'\]/);
  assert.match(method, /financeMovementFromLedgerEvent/);
});

test('el lector de saldos compara instantes y no duplica sobres del mismo ledger', async () => {
  const start = adapter.indexOf('async getFinanceLedgerMovements');
  const method = adapter.slice(start, adapter.indexOf('async getFinanceMovements', start));
  const reader = vm.runInNewContext(`({ ${method} })`, {
    SYNC_EVENT_MAX_BATCH: 5000,
    financeMovementFromLedgerEvent: event => event.payload,
    financeMovementKey: item => item.id,
  });
  reader.getSyncEvents = async () => [
    {event_type:'LedgerMovimientoRegistrado',payload:{id:'same',source_timestamp:'2026-09-05T00:30:00-04:00'}},
    {event_type:'LedgerMovimientoRegistrado',payload:{id:'same',source_timestamp:'2026-09-05T04:30:00Z'}},
    {event_type:'LedgerMovimientoRegistrado',payload:{id:'outside',source_timestamp:'2026-09-05T01:00:00Z'}},
  ];
  const result = await reader.getFinanceLedgerMovements('test', {from:'2026-09-05T04:00:00Z',to:'2026-09-05T05:00:00Z'});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'same');
  await assert.rejects(reader.getFinanceLedgerMovements('test',{from:'invalid'}), /Rango contable invalido/);
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
  assert.match(adapter, /cuentaOrigenId: \['gasto'/);
  assert.match(adapter, /cuentaDestinoId: \['ingreso'/);
  assert.match(adapter, /idempotencyKey: movement\.sync_event_id/);
  assert.match(publish, /eventId = `ledger-\$\{id\}`/);
  assert.doesNotMatch(publish, /transaction\.get\(eventRef\)/);
  assert.match(publish, /existing = await eventRef\.get\(\)/);
  assert.match(publish, /row\.event_type === 'LedgerMovimientoRegistrado'/);
  assert.match(publish, /Movimiento enviado al ledger global/);
});

test('una transferencia web publica origen y destino en un unico evento ledger', () => {
  const start = adapter.indexOf("if (action === 'fin.transfer.create')");
  const end = adapter.indexOf("if (action === 'fin.category.upsert')", start);
  const transfer = adapter.slice(start, end);
  assert.match(transfer, /eventId = `ledger-\$\{movementId\}`/);
  assert.match(transfer, /tipo: 'TRANSFERENCIA'/);
  assert.match(transfer, /cuentaOrigenId: sourceId/);
  assert.match(transfer, /cuentaDestinoId: targetId/);
  assert.match(transfer, /idempotencyKey: eventId/);
  assert.match(transfer, /transaction\.set\(eventRef, eventDocument/);
  assert.match(transfer, /sync_event_id: eventId/);
});
