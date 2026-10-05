const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./device-health-core.js');

for (const entry of ['index.html', 'mobile/index.html']) {
  const html = fs.readFileSync(path.join(__dirname, entry), 'utf8');
  const asset = html.match(/(?:shell-assets|assets)\/(index-[^?"']+\.js)/)[0];
  const source = fs.readFileSync(path.join(__dirname, entry.startsWith('mobile') ? 'mobile' : '', asset), 'utf8');
  const oldProjection = 'if(deviceHealth?.businessId===e)f={...f,onlineDevices:deviceHealth.onlineDevices,lastDeviceSeenAt:deviceHealth.lastDeviceSeenAt||f.lastDeviceSeenAt,deviceHealthStatus:deviceHealth.status};';
  const newProjection = 'f=window.DcarelaDeviceHealth.project(f,deviceHealth,e);';
  const projection = source.includes(newProjection) ? newProjection : oldProjection;
  assert.ok(source.includes(projection), 'proyección de la entrada realmente publicada');
  const now = Date.parse('2026-10-05T17:00:00Z');
  const row = { status: 'activa', last_seen_at: '2026-10-05T16:59:00Z' };
  const snapshot = (checkedAt, rows = [row], businessId = 'plaza-artesanal') => ({ businessId, status: 'server', checkedAt, rows });
  const live = (checkedAt, rows = [], status = 'server', businessId = 'plaza-artesanal') => ({
    businessId, checkedAt, status, rows, ...core.summarize(rows, now),
  });
  function render(state, health, clock = now) {
    return vm.runInNewContext(`(()=>{${projection}return f})()`, {
      f: state, deviceHealth: health, e: 'plaza-artesanal',
      window: { DcarelaDeviceHealth: { project: (...args) => core.project(...args, clock) } },
    });
  }

  test(`${entry}: la función real conserva sucursal, filas y hora de inicio de la consulta`, () => {
    const start = source.indexOf('function commitShellSnapshot(');
    const end = source.indexOf('\n', start);
    assert.ok(start > 0 && end > start);
    const data = { accounts: [{ id: 'cash', balanceCents: 12300 }], saleCount: 3, totalCents: 45600 };
    const ref = { current: null };
    let saved;
    const commit = vm.runInNewContext(`(${source.slice(start, end)})`, {
      shellSnapshotRef: ref, p: value => { saved = value; },
    });
    commit('plaza-artesanal', data, [row], '2026-10-05T16:59:30Z');
    assert.equal(saved.deviceHealthSnapshot.businessId, 'plaza-artesanal');
    assert.equal(saved.deviceHealthSnapshot.checkedAt, '2026-10-05T16:59:30Z');
    assert.equal(saved.deviceHealthSnapshot.status, 'server');
    assert.equal(saved.deviceHealthSnapshot.rows[0], row);
    assert.equal(saved.accounts, data.accounts);
    assert.equal(saved.totalCents, 45600);
    assert.equal(ref.current.business, 'plaza-artesanal');
    assert.ok(source.includes('},m,shellReadToken.startedAt);'), 'el lector real entrega la hora de inicio');
    assert.ok(!data.deviceHealthSnapshot, 'no modifica el objeto recibido');
    commit('otra', data);
    assert.equal(saved, data, 'no inventa verificación si no recibe filas');
  });

  test(`${entry}: una escucha antigua no sustituye la lectura remota nueva de dispositivos`, () => {
    const result = render({ onlineDevices: 1, deviceHealthSnapshot: snapshot('2026-10-05T16:59:30Z') },
      live('2026-10-05T16:50:00Z'));
    assert.equal(result.onlineDevices, 1);
    assert.equal(result.lastDeviceSeenAt, '2026-10-05T16:59:00.000Z');
  });
  test(`${entry}: una escucha posterior sí puede bloquear o eliminar la terminal`, () => {
    const state = { onlineDevices: 1, deviceHealthSnapshot: snapshot('2026-10-05T16:58:00Z') };
    for (const rows of [[], [{ ...row, status: 'bloqueada' }]]) {
      const result = render(state, live('2026-10-05T16:59:30Z', rows));
      assert.equal(result.onlineDevices, 0);
    }
  });
  test(`${entry}: una consulta lenta no gana por terminar después de una señal posterior`, () => {
    const state = { onlineDevices: 1, deviceHealthSnapshot: snapshot('2026-10-05T16:55:00Z') };
    const result = render(state, live('2026-10-05T16:59:30Z'));
    assert.equal(result.onlineDevices, 0);
  });
  test(`${entry}: caché y errores nunca acreditan conexión ni se mezclan las sucursales`, () => {
    const state = { onlineDevices: 1, deviceHealthSnapshot: snapshot('2026-10-05T16:59:30Z') };
    for (const status of ['cache', 'error']) {
      const result = render(state, live('', [row], status));
      assert.equal(result.onlineDevices, null);
      assert.equal(result.lastDeviceSeenAt, null);
    }
    const result = render(state, live('2026-10-05T17:00:00Z', [], 'server', 'dcarela'));
    assert.equal(result.onlineDevices, 1);
    assert.equal(result.deviceHealthStatus, 'server');
  });
  test(`${entry}: la lectura nueva caduca sin inventar ni consultar ventas o dinero`, () => {
    const accounts = [{ id: 'cash', balanceCents: 12300 }];
    const state = { onlineDevices: 1, accounts, saleCount: 3, totalCents: 45600,
      deviceHealthSnapshot: snapshot('2026-10-05T16:59:30Z') };
    const result = render(state, live('2026-10-05T16:50:00Z'), now + 10 * 60000);
    assert.equal(result.onlineDevices, 0);
    assert.equal(result.accounts, accounts);
    assert.equal(result.saleCount, 3);
    assert.equal(result.totalCents, 45600);
    assert.equal(state.onlineDevices, 1, 'no muta la instantánea original');
  });
}
