const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./panel.js'), 'utf8');
const start = source.indexOf('  function crearProgresoFinanciero()');
const end = source.indexOf('  let financeLoad = null;', start);
assert.ok(start > 0 && end > start);

function harness() {
  let now = 1000, tick = null;
  const nodes = {
    finPosSyncStatus: { textContent: 'Ventas anteriores', dataset: {} },
    mmSyncStatus: { textContent: 'Resumen anterior', dataset: {} },
  };
  const status = { textContent: 'Actualizando datos...' };
  nodes['v-finanzas'] = { querySelector: () => status, getAttribute: () => 'true' };
  const context = {
    $: id => nodes[id], Date: class extends Date { static now() { return now; } },
    setInterval: callback => { tick = callback; return 1; },
    clearInterval: () => { tick = null; },
  };
  const create = vm.runInNewContext(`(${source.slice(start, end).trim()})`, context);
  return { create, nodes, status, advance(ms) { now += ms; tick?.(); }, active: () => tick !== null };
}

test('la carga nombra las fuentes pendientes, mide su demora y no sustituye el resultado final', async () => {
  const h = harness(), progress = h.create();
  let finish;
  const read = progress.run('journal', () => new Promise(resolve => { finish = resolve; }));
  progress.report('archivedEvents', 'loading');
  h.advance(11000);
  assert.match(h.status.textContent, /historial archivado/);
  assert.match(h.status.textContent, /11 s/);
  assert.match(h.nodes.finPosSyncStatus.textContent, /anteriores aún no se han actualizado/);
  assert.doesNotMatch(h.status.textContent, /historial y saldos/, 'evita repetir padre e hijo');
  progress.report('archivedEvents', 'done', 11000);
  finish(['verified']);
  assert.deepEqual(await read, ['verified']);
  progress.report('render', 'loading');
  h.nodes.finPosSyncStatus.textContent = 'Ventas verificadas';
  h.nodes.mmSyncStatus.textContent = 'Resumen verificado';
  h.advance(20);
  // The timer still runs while rendering. Publish the result at the end.
  h.nodes.finPosSyncStatus.textContent = 'Ventas verificadas';
  h.nodes.mmSyncStatus.textContent = 'Resumen verificado';
  progress.report('render', 'done', 20);
  progress.finish();
  const diagnostic = JSON.parse(h.nodes.finPosSyncStatus.dataset.financeLoad);
  assert.equal(diagnostic.state, 'done');
  assert.equal(diagnostic.totalMs, 11020);
  assert.equal(diagnostic.phases.journal.ms, 11000);
  assert.equal(diagnostic.phases.render.ms, 20);
  assert.equal(h.nodes.finPosSyncStatus.textContent, 'Ventas verificadas');
  assert.equal(h.active(), false, 'no deja un temporizador después de completar');
});

test('un fallo conserva la excepción, deja la información sin verificar y detiene callbacks tardíos', async () => {
  const h = harness(), progress = h.create();
  const error = new Error('fixture sin conexión');
  await assert.rejects(progress.run('accounts', async () => { throw error; }), value => value === error);
  progress.report('archivedEvents', 'loading');
  progress.finish(error);
  const saved = h.nodes.finPosSyncStatus.dataset.financeLoad;
  h.advance(8000);
  progress.report('archivedEvents', 'done', 8000);
  assert.equal(h.nodes.finPosSyncStatus.dataset.financeLoad, saved);
  assert.match(h.nodes.finPosSyncStatus.textContent, /no están verificadas/);
  assert.equal(JSON.parse(saved).phases.accounts.state, 'error');
  assert.equal(h.active(), false);
});

test('las métricas de carga excluyen claves y contenido ajenos a las fases conocidas', () => {
  const h = harness(), progress = h.create();
  progress.report('cuenta-privada-secreto', 'loading', 125);
  progress.report('movements', 'done', 125);
  progress.finish();
  const saved = h.nodes.finPosSyncStatus.dataset.financeLoad;
  assert.doesNotMatch(saved, /privada|secreto|cuenta-/);
  assert.equal(JSON.parse(saved).phases.movements.ms, 125);
});
