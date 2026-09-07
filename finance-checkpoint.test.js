const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./finance-core');
const accounts = [
  {id:'cash',tipo:'efectivo',ligada_ventas:true,reconciled_at:'2026-09-05T03:59:59.999Z',reconciled_balance_centavos:3650000,saldo_actual_centavos:3282000},
  {id:'bank',tipo:'banco',nombre:'Banco Popular',reconciled_at:'2026-09-05T03:59:59.999Z',reconciled_balance_centavos:63410,saldo_actual_centavos:163410},
];
const expense = (id, amount) => ({id,business_id:'test',tipo:'gasto',monto_centavos:amount,cuenta_id:'cash',fecha:'2026-09-07',origen:'asistente'});
test('cuadre + diario aplica nomina, alquiler y transferencia una sola vez sin usar acumulados contaminados',()=>{
  const ledger=[expense('genesis',814000),expense('rent',1100000),
    {id:'transfer',tipo:'transferencia',monto_centavos:100000,cuenta_id:'cash',cuenta_destino_id:'bank',fecha:'2026-09-07'},
    {id:'supplier',tipo:'ingreso',monto_centavos:100000,cuenta_id:'bank',fecha:'2026-09-07'},
    {...expense('sync-ledger-genesis',814000),source:'pos_sync_event'},
  ];
  assert.equal(core.effectiveAccountBalance(accounts[0],ledger),1636000);
  assert.equal(core.effectiveAccountBalance(accounts[1],ledger),263410);
  assert.equal(core.effectiveAccountBalance({...accounts[0],saldo_actual_centavos:99999999},ledger),1636000);
  ledger[0].estado='anulado';
  assert.equal(core.effectiveAccountBalance(accounts[0],ledger),2450000);
});
const event = (type,id,p) => ({event_type:type,event_id:id,created_at_local:'2026-09-06T14:00:00Z',payload:p});
test('gasto de caja + salida ligada descuenta una vez; traslado interno no crea dinero',()=>{
  const rows=core.projectOperationsAsMovements([
    event('SalidaEfectivo','s',{movimientoId:'cash-out',montoCentavos:7000}),
    event('GastoRegistrado','g',{gastoId:'expense',movimientoCajaId:'cash-out',montoCentavos:7000,metodoPago:'efectivo'}),
    event('EntradaEfectivo','i',{movimientoId:'internal',montoCentavos:100000,origenEntrada:'traslado_ventas_anteriores'}),
    event('EntradaEfectivo','e',{movimientoId:'external',montoCentavos:1000,origenEntrada:'dinero_cliente'}),
  ],accounts);
  assert.equal(rows.length,2);
  assert.equal(core.effectiveAccountBalance(accounts[0],rows),3644000);
});
test('abonos alimentan la cuenta de cobro pero no duplican el ingreso de la venta',()=>{
  const rows=core.projectOperationsAsMovements([
    event('AbonoClienteRegistrado','a',{movimientoId:'abono',metodo:'transferencia',montoCentavos:368500}),
    event('AbonoClienteRegistrado','a-retry',{movimientoId:'abono',metodo:'transferencia',montoCentavos:368500}),
  ],accounts);
  assert.equal(rows.length,1);
  assert.equal(core.effectiveAccountBalance(accounts[1],rows),431910);
  assert.equal(core.summarizeMovements(rows).ingresos_centavos,0);
  assert.equal(core.salePaymentAccount({method:'credito',account_id:'cash'},accounts),null);
});
test('gasto enlazado al asiento no duplica ni resucita una anulacion',()=>{
  const events=[event('GastoRegistrado','g',{gastoId:'g',montoCentavos:7000})];
  assert.equal(core.projectOperationsAsMovements(events,accounts,[{gasto_id:'g',estado:'anulado'}]).length,0);
  const edited=[{id:'g',ledger_id:'g',source:'pos_sync_event',estado:'registrado',updated_at:'2026-09-06',idempotency_key:'create'},
    {id:'g',ledger_id:'g',source:'pos_sync_event',estado:'anulado',updated_at:'2026-09-07',idempotency_key:'cancel'}];
  assert.equal(core.deduplicateMovements(edited).length,1);
  assert.equal(core.deduplicateMovements(edited)[0].estado,'anulado');
});
test('no vuelve a descontar gastos incorporados en el cuadre aunque se subieran despues',()=>{
  const rows=[{...expense('old',1728425),fecha:'2026-09-04',source_timestamp:'2026-09-05T03:59:59.999Z',created_at:'2026-09-06T06:00:00Z'}];
  assert.equal(core.effectiveAccountBalance(accounts[0],rows),3650000);
});
