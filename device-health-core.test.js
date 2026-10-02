const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, observe } = require('./device-health-core.js');
test('la señal excluye fechas futuras, inválidas, ausentes, vencidas y terminales bloqueadas', () => {
  const now = Date.parse('2026-10-02T10:00:00Z');
  assert.deepEqual(summarize([
    { status: 'activa', last_seen_at: '2026-10-02T09:59:00Z' },
    { status: 'activa', last_seen_at: '2026-10-02T10:01:00Z' },
    { status: 'activa', last_seen_at: '2026-10-02T09:50:00Z' },
    { status: 'activa', last_seen_at: 'incorrecta' }, { status: 'activa' },
    { status: 'bloqueada', last_seen_at: '2026-10-02T09:58:00Z' },
  ], now), { onlineDevices: 1, lastDeviceSeenAt: '2026-10-02T09:59:00.000Z' });
});
test('caduca sin descargar otra vez, no certifica caché y cancela callbacks al salir', () => {
  let now = Date.parse('2026-10-02T10:00:00Z'), next, onError, tick, reads = 0, stopped = 0, cancelled = 0;
  const changes = [];
  const stop = observe({ listenCollection(name, conditions, callback, options) {
    reads++; assert.equal(name, 'devices'); assert.deepEqual(conditions, [['business_id', '==', 'fixture']]);
    next = callback; onError = options.onError; return () => { stopped++; };
  } }, 'fixture', change => changes.push(change), { clock: () => now,
    setInterval: callback => { tick = callback; return 123; }, clearInterval: id => { assert.equal(id, 123); cancelled++; } });
  const rows = [{ status: 'activa', last_seen_at: '2026-10-02T09:59:00Z' }];
  next(rows, { fromCache: true }); assert.equal(changes.at(-1).onlineDevices, null);
  next(rows, { fromCache: false, hasPendingWrites: false }); assert.equal(changes.at(-1).onlineDevices, 1);
  now += 9 * 60000; tick(); assert.equal(changes.at(-1).onlineDevices, 0); assert.equal(reads, 1);
  onError(); assert.equal(changes.at(-1).status, 'error'); assert.equal(changes.at(-1).onlineDevices, null);
  const count = changes.length; stop(); next([], { fromCache: false }); tick(); onError();
  assert.equal(changes.length, count); assert.equal(stopped, 1); assert.equal(cancelled, 1);
});
