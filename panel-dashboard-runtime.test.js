const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./panel.js'), 'utf8');
const start = source.indexOf('  function conexionRecienteDispositivo(');
const end = source.indexOf('  const salePendingStore', start);
assert.ok(start > 0 && end > start);

function harness({ salesError, activity = [], auxiliaryError = false, devices = [], now = Date.now() } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', dataset: {} });
    return elements.get(id);
  };
  const messages = [];
  const context = {
    dashboardViewCache: null, dashboardDevicesSnapshot: null, Date: class extends Date { static now() { return now; } }, console: { warn() {} },
    window: { DcarelaDeviceHealth: require('./device-health-core.js'), setInterval: () => 0, clearInterval() {} },
    $: element, estadoDashboard: (...args) => messages.push(args),
    inicioDia: () => '2026-10-01T04:00:00Z', finDia: () => '2026-10-02T03:59:59Z',
    ventasActivas: async () => {
      if (salesError) throw salesError;
      return { active: [{ payload: { total: 100 } }], excluded: 0 };
    },
    eventos: async types => types ? [] : activity,
    getDevices: async () => { if (auxiliaryError) throw new Error('devices offline'); return devices; },
    getBackups: async () => { if (auxiliaryError) throw new Error('backups offline'); return []; },
    obtenerAlertas: async () => { if (auxiliaryError) throw new Error('alerts offline'); return []; },
    renderAlertPreview: async () => { if (auxiliaryError) throw new Error('alerts offline'); },
    P: event => event.payload, totalDe: payload => payload.total, montoDe: () => 0,
    efectivoDe: () => 100, itbisDe: () => 0, money: amount => `RD$${amount}`,
    fecha: value => value, fechaCorta: value => value, fechaEventoIso: event => event.created_at_local,
    dashboardBuckets: () => [], renderKpiSparkline() {}, renderHourChart() {}, renderFeed() {}, esc: value => value,
  };
  const functions = vm.runInNewContext(`${source.slice(start, end)}; ({ load: cargarDashboard, refresh: actualizarSaludDispositivos, connect: conectarSaludDispositivos });`, context);
  return { ...functions, element, messages, context, advance: ms => { now += ms; } };
}

function subscription(h, businessId = 'fixture-plaza') {
  let callback, options, stopped = 0;
  const stop = h.connect({ listenCollection(name, conditions, cb, opts) {
    assert.equal(name, 'devices');
    assert.deepEqual(Array.from(conditions, row => Array.from(row)), [['business_id', '==', businessId]]);
    assert.equal(opts.includeMetadataChanges, true);
    callback = cb; options = opts;
    return () => { stopped++; };
  } }, businessId);
  return { emit: (rows, metadata = { fromCache: false, hasPendingWrites: false }) => callback(rows, metadata),
    fail: () => options.onError(new Error('fixture listener')), stop, stopped: () => stopped };
}

test('una señal nueva actualiza solo la salud y no recarga ventas ni Finanzas', async () => {
  const h = harness({ now: Date.parse('2026-10-02T10:00:00Z') });
  await h.load();
  const original = h.element('kVenta').textContent;
  h.context.ventasActivas = () => { throw new Error('no debe volver a leer ventas'); };
  const s = subscription(h);
  s.emit([{ status: 'activa', last_seen_at: '2026-10-02T09:59:00Z' }]);
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /1 con conexion reciente/);
  assert.equal(h.element('dashboardDevicesHealth').dataset.deviceConnection, 'server');
  assert.equal(h.element('kVenta').textContent, original);
  assert.equal(h.element('pillVivo').textContent, 'consultado');
  h.advance(9 * 60 * 1000); h.refresh();
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /sin senal reciente/);
  s.emit([{ status: 'activa', last_seen_at: '2026-10-02T10:09:00Z' }]);
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /1 con conexion reciente/);
});

test('caché, escrituras pendientes y errores no certifican conexión; una lectura remota la recupera', async () => {
  const h = harness({ now: Date.parse('2026-10-02T10:00:00Z') });
  await h.load();
  const s = subscription(h);
  const rows = [{ status: 'activa', last_seen_at: '2026-10-02T09:59:00Z' }];
  for (const metadata of [{ fromCache: true }, { fromCache: false, hasPendingWrites: true }, undefined]) {
    // Emitir metadatos ausentes explícitamente también debe ser conservador.
    if (metadata === undefined) s.emit(rows, null); else s.emit(rows, metadata);
    assert.match(h.element('dashboardDevicesHealth').innerHTML, /conexion sin verificar/);
    assert.doesNotMatch(h.element('dashboardDevicesHealth').innerHTML, /con conexion reciente/);
    assert.equal(h.element('dashboardDevicesHealth').dataset.deviceCheckedAt, '');
  }
  s.fail();
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /No se pudo verificar/);
  assert.equal(h.element('kVenta').textContent, 'RD$100');
  s.emit(rows);
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /1 con conexion reciente/);
  assert.ok(h.element('dashboardDevicesHealth').dataset.deviceCheckedAt);
  s.emit([]);
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /Sin dispositivos registrados/);
});

test('una lectura lenta del resumen no reemplaza una señal remota posterior', async () => {
  const h = harness({ now: Date.parse('2026-10-02T10:00:00Z') });
  let release;
  h.context.getDevices = () => new Promise(resolve => { release = resolve; });
  const loading = h.load();
  const s = subscription(h);
  s.emit([{ status: 'activa', last_seen_at: '2026-10-02T09:59:00Z' }]);
  release([{ status: 'activa', last_seen_at: '2026-09-29T16:00:00Z' }]);
  await loading;
  assert.match(h.element('healthList').innerHTML, /1 con conexion reciente/);
});

test('la desconexión descarta callbacks tardíos y la sucursal nueva queda aislada', async () => {
  const h = harness({ now: Date.parse('2026-10-02T10:00:00Z') });
  await h.load();
  const old = subscription(h);
  old.stop();
  const current = subscription(h, 'fixture-central');
  current.emit([]);
  const html = h.element('dashboardDevicesHealth').innerHTML;
  old.emit([{ status: 'activa', last_seen_at: '2026-10-02T09:59:00Z' }]); old.fail();
  assert.equal(h.element('dashboardDevicesHealth').innerHTML, html);
  assert.equal(old.stopped(), 1);
  current.stop();
});

test('un fallo al iniciar la suscripción no interrumpe el resumen', async () => {
  const h = harness();
  h.connect({ listenCollection() { throw new Error('fixture'); } }, 'fixture');
  await h.load();
  assert.equal(h.element('kVenta').textContent, 'RD$100');
  assert.match(h.element('healthList').innerHTML, /No se pudo verificar/);
});

test('el resumen no declara Caja cerrada si la actividad no contiene un evento de caja', async () => {
  const h = harness({ activity: [{ event_type: 'ProductoEditado' }] });
  await h.load();
  assert.equal(h.element('kCaja').textContent, '--');
  assert.equal(h.element('kCajaDetalle').textContent, 'sin eventos');
});

test('habilitar una terminal no acredita conexion reciente', async () => {
  const now = Date.parse('2026-10-01T19:00:00Z');
  const h = harness({ now, devices: [
    { status: 'activa', last_seen_at: '2026-10-01T18:59:00Z' },
    { status: 'activa', last_seen_at: '2026-09-29T16:42:49Z' },
  ] });
  await h.load();
  assert.match(h.element('healthList').innerHTML, /1 con conexion reciente de 2 habilitado/);
  assert.doesNotMatch(h.element('healthList').innerHTML, /en linea/);
  assert.equal(h.element('pillVivo').textContent, 'consultado');
});

test('fecha ausente, invalida o futura y una terminal bloqueada no acreditan conexion', async () => {
  const now = Date.parse('2026-10-01T19:00:00Z');
  const h = harness({ now, devices: [
    { status: 'activa' },
    { status: 'activa', last_seen_at: 'fecha invalida' },
    { status: 'activa', last_seen_at: '2026-10-02T19:00:00Z' },
    { status: 'bloqueada', last_seen_at: '2026-10-01T18:59:00Z' },
    { status: 'activa', last_seen_at: '2026-10-01T18:50:00Z' },
  ] });
  await h.load();
  assert.match(h.element('healthList').innerHTML, /0 con conexion reciente de 4 habilitado/);
  assert.match(h.element('healthList').innerHTML, /3 sin fecha verificable/);
  assert.match(h.element('healthList').innerHTML, /sin senal reciente/);
});

test('un listado vacio no anuncia dispositivos conectados', async () => {
  const h = harness();
  await h.load();
  assert.match(h.element('healthList').innerHTML, /Sin dispositivos registrados/);
  assert.doesNotMatch(h.element('healthList').innerHTML, /en linea/);
});

test('la señal caduca sin eventos nuevos ni consultas adicionales', async () => {
  const h = harness({ now: Date.parse('2026-10-01T19:00:00Z'), devices: [
    { status: 'activa', last_seen_at: '2026-10-01T18:59:00Z' },
  ] });
  await h.load();
  h.refresh();
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /1 con conexion reciente/);
  h.advance(9 * 60 * 1000);
  h.refresh();
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /0 con conexion reciente/);
  assert.match(h.element('dashboardDevicesHealth').innerHTML, /sin senal reciente/);
  h.context.dashboardDevicesSnapshot = null;
  h.element('dashboardDevicesHealth').innerHTML = 'cargando';
  h.refresh();
  assert.equal(h.element('dashboardDevicesHealth').innerHTML, 'cargando');
});

test('el resumen conserva el estado y la fecha del evento de caja encontrado', async () => {
  for (const [event_type, state] of [['CajaAbierta', 'Abierta'], ['CajaCerrada', 'Cerrada']]) {
    const h = harness({ activity: [{ event_type, created_at_local: '2026-10-01T12:00:00Z' }] });
    await h.load();
    assert.equal(h.element('kCaja').textContent, state);
    assert.equal(h.element('kCajaDetalle').textContent, '2026-10-01T12:00:00Z');
  }
});

test('ventas rechazadas dejan indicadores desconocidos y reintento disponible', async () => {
  const h = harness({ salesError: new Error('sales offline') });
  await h.load();
  for (const id of ['kVenta', 'kNum', 'kProm', 'kEfec', 'kItbis', 'kCaja']) assert.equal(h.element(id).textContent, '--');
  assert.equal(h.element('pillVivo').textContent, 'sin datos');
  assert.equal(h.context.dashboardViewCache, null);
  assert.equal(h.messages.at(-1)[1], 'Reintentar');
});

test('fallos auxiliares no borran ventas confirmadas ni inventan dispositivos', async () => {
  const h = harness({ auxiliaryError: true });
  await h.load();
  assert.equal(h.element('kVenta').textContent, 'RD$100');
  assert.match(h.element('healthList').innerHTML, /No disponible/);
  assert.doesNotMatch(h.element('healthList').innerHTML, /1 activo/);
  assert.match(h.element('alertPreview').innerHTML, /No se pudieron consultar/);
});
