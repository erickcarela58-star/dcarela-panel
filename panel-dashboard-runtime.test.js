const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./panel.js'), 'utf8');
const start = source.indexOf('  async function cargarDashboard(');
const end = source.indexOf('  const salePendingStore', start);
assert.ok(start > 0 && end > start);

function harness({ salesError, activity = [], auxiliaryError = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '' });
    return elements.get(id);
  };
  const messages = [];
  const context = {
    dashboardViewCache: null, Date, console: { warn() {} },
    $: element, estadoDashboard: (...args) => messages.push(args),
    inicioDia: () => '2026-10-01T04:00:00Z', finDia: () => '2026-10-02T03:59:59Z',
    ventasActivas: async () => {
      if (salesError) throw salesError;
      return { active: [{ payload: { total: 100 } }], excluded: 0 };
    },
    eventos: async types => types ? [] : activity,
    getDevices: async () => { if (auxiliaryError) throw new Error('devices offline'); return []; },
    getBackups: async () => { if (auxiliaryError) throw new Error('backups offline'); return []; },
    obtenerAlertas: async () => { if (auxiliaryError) throw new Error('alerts offline'); return []; },
    renderAlertPreview: async () => { if (auxiliaryError) throw new Error('alerts offline'); },
    P: event => event.payload, totalDe: payload => payload.total, montoDe: () => 0,
    efectivoDe: () => 100, itbisDe: () => 0, money: amount => `RD$${amount}`,
    fecha: value => value, fechaCorta: value => value, fechaEventoIso: event => event.created_at_local,
    dashboardBuckets: () => [], renderKpiSparkline() {}, renderHourChart() {}, renderFeed() {}, esc: value => value,
  };
  const load = vm.runInNewContext(`(${source.slice(start, end).trim()})`, context);
  return { load, element, messages, context };
}

test('el resumen no declara Caja cerrada si la actividad no contiene un evento de caja', async () => {
  const h = harness({ activity: [{ event_type: 'ProductoEditado' }] });
  await h.load();
  assert.equal(h.element('kCaja').textContent, '--');
  assert.equal(h.element('kCajaDetalle').textContent, 'sin eventos');
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
