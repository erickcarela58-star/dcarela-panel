const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('./panel.js'), 'utf8');
const start = source.indexOf('  function renderFinPlanning()');
const end = source.indexOf('  function abrirCuentaFin(', start);

test('Planificación incluye préstamos, facturas y planes sin duplicar cuotas materializadas', () => {
  const mount = { innerHTML: '' };
  const context = {
    $: () => mount, money: String, esc: String, dateOnly: String,
    moneyManagerCore: require('./money-manager-core.js'),
    finStateCache: { month: '2026-10', categories: [], commitments: [
      { id: 'loan', nombre: 'Préstamo ficticio', tipo: 'prestamo', activo: true,
        monto_centavos: 100000, proximo_vencimiento: '2026-10-22' },
    ] },
    costStateCache: {
      obligations: [{ id: 'bill', concepto: 'Internet ficticio', estado: 'pendiente',
        saldoCentavos: 40000, venceEn: '2026-10-23', recurrenteId: 'internet', periodoClave: 'internet:2026-10-23' }],
      recurrents: [{ id: 'internet', nombre: 'Internet ficticio', activo: true,
        montoEstimadoCentavos: 40000, proximaFecha: '2026-10-23' }],
    },
  };
  vm.runInNewContext(source.slice(start, end) + '\nrenderFinPlanning()', context);
  assert.match(mount.innerHTML, /Préstamo ficticio/);
  assert.equal((mount.innerHTML.match(/Internet ficticio/g) || []).length, 1);
  assert.doesNotMatch(mount.innerHTML, /Todo bajo control/);
});
