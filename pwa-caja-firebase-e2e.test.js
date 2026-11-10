const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const finance = require('./finance-core');
const simple = require('./simple-finance-core');

// El sobre conserva los nombres que la Caja Firebase publica en sync_events.
// Todos los importes y folios son ficticios; no se consulta ni escribe producción.
const source = fs.readFileSync(__dirname + '/firebase-adapter.js', 'utf8');
const start = source.indexOf('    async getFinanceJournal(');
const end = source.indexOf('    async getFinanceMovements(', start);
const journal = vm.runInNewContext(`({ ${source.slice(start, end)} })`, {
  window: { DcarelaFinanceCore: finance },
  SYNC_EVENT_MAX_BATCH: 5000,
  observeReadPhase: promise => promise,
  financeMovementFromLedgerEvent: event => event.payload,
  financeMovementKey: item => item.id,
});

test('Caja Firebase y PWA leen el mismo cobro mixto una sola vez', async () => {
  const accounts = [
    { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', moneda: 'DOP', ligada_ventas: true },
    { id: 'bank', nombre: 'Banco', tipo: 'banco', moneda: 'DOP' },
  ];
  const caja = {
    event_id: 'pos-event-uno', business_id: 'dcarela', event_type: 'VentaCobrada',
    entity_id: 'sale-uno', created_at_local: '2026-11-09T15:00:00Z', source: 'pos_local_firebase',
    payload: {
      ventaId: 'sale-uno', folio: 30001, totalCobradoCentavos: 12500,
      vendidaEn: '2026-11-09T11:00:00-04:00',
      pagos: [
        { metodo: 'efectivo', montoCentavos: 5000, cuentaFinancieraId: 'cash' },
        { metodo: 'transferencia', montoCentavos: 7500, cuentaFinancieraId: 'bank' },
      ],
    },
  };
  journal.getFinanceAccounts = async () => accounts;
  journal.getFinancePreferences = async () => ({});
  journal.getSyncEvents = async () => [caja, { ...caja, event_id: 'imported-copy' }];
  journal.getCollection = async () => [];
  const rows = await journal.getFinanceJournal('dcarela', {
    from: '2026-11-01', to: '2026-11-30', accounts,
  });
  assert.equal(rows.sales.length, 1);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => [row.cuenta_id, row.monto_centavos]).sort(),
    [['bank', 7500], ['cash', 5000]]);
  assert.equal(simple.group(rows, '2026-11')[0].income, 12500);
  assert.equal(simple.group(rows, '2026-11')[0].expenses, 0);
});
