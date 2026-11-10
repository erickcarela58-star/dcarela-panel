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

test('Caja proyecta ventas, salida con gasto, abono y pago de obligacion sin duplicar caja', async () => {
  const accounts = [
    {id:'cash',nombre:'Efectivo',tipo:'efectivo',moneda:'DOP',ligada_ventas:true},
    {id:'bank',nombre:'Banco Popular',tipo:'banco',moneda:'DOP'},
  ];
  const event = (id, type, entity, payload) => ({
    event_id:id, business_id:'dcarela', event_type:type, entity_id:entity,
    created_at_local:'2026-11-09T15:00:00-04:00', payload,
  });
  const sale = event('sale-event','VentaCobrada','sale-2',{
    ventaId:'sale-2',folio:30002,totalCobradoCentavos:12500,
    vendidaEn:'2026-11-09T15:00:00-04:00',
    pagos:[{metodo:'efectivo',montoCentavos:5000},
      {metodo:'transferencia',montoCentavos:7500,cuentaFinancieraId:'bank'}],
  });
  const exit = event('exit-event','SalidaEfectivo','cash-exit',{
    movimientoId:'cash-exit',tipo:'salida',montoCentavos:4500,
    motivo:'Gasto: materiales',fecha:'2026-11-09T15:10:00-04:00',
  });
  const expense = event('expense-event','GastoRegistrado','expense-1',{
    gastoId:'expense-1',movimientoCajaId:'cash-exit',montoCentavos:4500,
    metodoPago:'efectivo',descripcion:'materiales',fecha:'2026-11-09T15:10:00-04:00',
  });
  const installment = event('installment-event','AbonoClienteRegistrado','client-1',{
    clienteId:'client-1',movimientoId:'installment-1',metodo:'transferencia',
    montoCentavos:2000,registradoEn:'2026-11-09T15:20:00-04:00',
  });
  // Caja publica este pago de deuda para actualizar su saldo; la salida de
  // dinero viaja por LedgerMovimientoRegistrado. Contar ambos resta dos veces.
  const obligation = event('obligation-event','CostoPagoRegistrado','payment-1',{
    pagoId:'payment-1',obligacionId:'obligation-1',montoCentavos:3000,
    metodoPago:'transferencia',pagadoEn:'2026-11-09T15:30:00-04:00',
  });
  const ledger = event('ledger-event','LedgerMovimientoRegistrado','ledger-1',{
    id:'ledger-1',business_id:'dcarela',tipo:'gasto',estado:'registrado',
    monto_centavos:3000,cuenta_id:'bank',fecha:'2026-11-09',
    source_timestamp:'2026-11-09T15:30:00-04:00',descripcion:'Pago de obligación',
  });
  journal.getFinanceAccounts = async () => accounts;
  journal.getFinancePreferences = async () => ({});
  journal.getSyncEvents = async () => [sale, exit, expense, installment, obligation, ledger];
  journal.getCollection = async collection => collection === 'fin_movements' ? [{
    id:'ledger-1',business_id:'dcarela',tipo:'gasto',estado:'registrado',
    monto_centavos:3000,cuenta_id:'bank',fecha:'2026-11-09',
    source_timestamp:'2026-11-09T15:30:00-04:00',descripcion:'Pago de obligación',
  }] : [];
  const rows = await journal.getFinanceJournal('dcarela', {accounts});
  assert.equal(rows.sales.length, 1);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => [row.tipo,row.cuenta_id,row.monto_centavos]).sort(), [
    ['gasto','bank',3000],['gasto','cash',4500],
    ['ingreso','bank',2000],['ingreso','bank',7500],['ingreso','cash',5000],
  ].sort());
  assert.equal(rows.filter(row => row.monto_centavos === 4500).length, 1);
  assert.equal(rows.filter(row => row.monto_centavos === 3000).length, 1);
});
