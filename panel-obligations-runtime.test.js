const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('./panel.js'), 'utf8');
const start = source.indexOf('  function renderMoneyManagerObligations(');
const end = source.indexOf('  function renderMoneyManager()', start);

for (const canEdit of [false, true]) test(`préstamo sin saldo: presentación y acciones para ${canEdit ? 'editor' : 'lector'}`, () => {
  const nodes = Object.fromEntries(['mmObligationKpis', 'mmObligations'].map(id => [id, { innerHTML: '', querySelectorAll: () => [] }]));
  const context = {
    canEdit, $: id => nodes[id],
    money: n => { assert.notEqual(n, null, 'un saldo desconocido no se formatea como cero'); return `RD$${n}`; },
    esc: String, dateOnly: String,
    mmMetric: (label, value, caption) => `${label}: ${value}; ${caption}`,
    tabla: (rows, render) => rows.map(render).flat().join('|'),
  };
  const render = vm.runInNewContext(`(${source.slice(start, end).trim()})`, context);
  render({ payableNow: 10000, overdueDue: 0, overdue: [], loanDebt: null, loanCapital: null,
    from: '2026-10-01', rows: [{ id: 'fixture', name: 'Préstamo ficticio', source: 'compromiso', type: 'prestamo', due: '2026-10-22', periodAmount: 10000, outstanding: null }] });
  assert.match(nodes.mmObligationKpis.innerHTML, /Deuda de préstamos: --/);
  assert.match(nodes.mmObligationKpis.innerHTML, /Capital pendiente: --/);
  assert.match(nodes.mmObligations.innerHTML, /Sin verificar/);
  assert.match(nodes.mmObligations.innerHTML, /RD\$10000/, 'conserva la cuota conocida');
  if (canEdit) assert.match(nodes.mmObligations.innerHTML, /Registrar pago/);
  else assert.doesNotMatch(nodes.mmObligations.innerHTML, /<button|Registrar pago/);
});
