const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./panel.js'), 'utf8');
const start = source.indexOf('  let financeLoad = null;');
const end = source.indexOf('  async function cargarProveedoresData(', start);

function harness() {
  const reads = [];
  const context = {
    finStateCache: null, costStateCache: null, financeWriteEpoch: 0,
    $: () => ({ value: '2026-10' }),
    crearProgresoFinanciero: () => ({ finish() {} }),
    announceAccountReady() {},
    cargarProveedoresData(force) {
      return new Promise((resolve, reject) => reads.push({ force, resolve, reject }));
    },
  };
  const load = vm.runInNewContext(`${source.slice(start, end)}; cargarProveedores`, context);
  return { load, reads, context };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('actualizaciones forzadas simultáneas comparten una consulta completa', async () => {
  const h = harness();
  const requests = [h.load(true), h.load(true), h.load(true)];
  h.context.finStateCache = { month: '2026-10' };
  h.reads[0].resolve();
  await tick();
  assert.equal(h.reads.length, 1, 'tres clics no leen tres diarios financieros');
  await Promise.all(requests);
});

test('forzar durante una lectura normal hace solo una actualización adicional', async () => {
  const h = harness();
  const requests = [h.load(), h.load(true), h.load(true)];
  h.context.finStateCache = { month: '2026-10' };
  h.reads[0].resolve();
  await tick();
  assert.equal(h.reads.length, 2);
  assert.equal(h.reads[1].force, true);
  h.reads[1].resolve();
  await tick();
  assert.equal(h.reads.length, 2, 'los solicitantes comparten la actualización nueva');
  await Promise.all(requests);
});

test('una actualización fallida invalida la frescura sin borrar la instantánea anterior', async () => {
  const h = harness();
  const snapshot = { month: '2026-10', accounts: [{ id: 'demo' }], _renderedAt: Date.now() };
  h.context.finStateCache = snapshot;
  const request = h.load(true);
  const failed = assert.rejects(request, /sin conexión/);
  h.context.finStateCache = { accounts: [], month: '2026-10' };
  h.reads[0].reject(new Error('sin conexión'));
  await failed;
  assert.equal(h.context.finStateCache, snapshot);
  assert.equal(snapshot._renderedAt, 0, 'no reutiliza cifras fallidas como una consulta reciente');
});

test('un guardado posterior al inicio de la consulta exige leer de nuevo', async () => {
  const h = harness();
  const first = h.load(true);
  h.context.financeWriteEpoch++;
  const afterWrite = h.load(true);
  h.context.finStateCache = { month: '2026-10' };
  h.reads[0].resolve();
  await tick();
  assert.equal(h.reads.length, 2, 'la consulta anterior al guardado no verifica el cambio nuevo');
  h.reads[1].resolve();
  await Promise.all([first, afterWrite]);
});
