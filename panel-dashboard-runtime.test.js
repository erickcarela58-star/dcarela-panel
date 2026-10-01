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
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '' });
    return elements.get(id);
  };
  const messages = [];
  const context = {
    dashboardViewCache: null, dashboardDevicesSnapshot: null, Date: class extends Date { static now() { return now; } }, console: { warn() {} },
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
  const functions = vm.runInNewContext(`${source.slice(start, end)}; ({ load: cargarDashboard, refresh: actualizarSaludDispositivos });`, context);
  return { ...functions, element, messages, context, advance: ms => { now += ms; } };
}

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
