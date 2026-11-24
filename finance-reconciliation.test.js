const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./finance-core');
const account = {id:'cash',business_id:'fixture',tipo:'efectivo',saldo_actual_centavos:1000,
  reconciled_at:'2026-09-01T00:00:00Z',reconciled_balance_centavos:10000};
const options = {target:8000,cutoff:'2026-09-10T12:00:00.000Z',createdAt:'2026-09-10T12:30:00Z',id:'check',reason:'Conteo comprobado'};
const sale = (id,at,amount) => ({id,tipo:'ingreso',cuenta_id:'cash',monto_centavos:amount,fecha:core.businessDay(at),source_timestamp:at,origen:'pos_venta'});
test('cuadre usa saldo efectivo y preserva ventas del turno incluso si llegan tarde',()=>{
  const before = sale('prior','2026-09-09T22:00:00Z',5000);
  const current = sale('current','2026-09-10T12:01:00Z',2300);
  const plan = core.planAccountReconciliation(account,[before,current],options);
  assert.equal(plan.before,15000);assert.equal(plan.difference,-7000);
  const reconciled = {...account,...plan.patch};
  assert.equal(core.effectiveAccountBalance(reconciled,[before,current,plan.movement]),10300);
  assert.equal(core.effectiveAccountBalance(reconciled,[before,plan.movement]),8000);
  assert.equal(core.summarizeMovements([plan.movement]).gastos_centavos,0);
});
test('cuadre legacy y deuda de tarjeta usan centavos con signo',()=>{
  const legacy={...account,reconciled_balance_centavos:undefined,saldo_actual_centavos:1000};
  assert.equal(core.planAccountReconciliation(legacy,[sale('x','2026-09-09T22:00:00Z',2000)],options).before,3000);
  const p=core.planAccountReconciliation(account,[],{...options,target:-432100});
  assert.equal(core.effectiveAccountBalance({...account,...p.patch},[p.movement]),-432100);
});
test('cuadre rechaza fechas ambiguas, retroceso de corte e importes no enteros',()=>{
  assert.throws(()=>core.planAccountReconciliation(account,[{...sale('x',options.cutoff,100),source_timestamp:null}],options),/sin hora/);
  assert.throws(()=>core.planAccountReconciliation(account,[],{...options,target:10.5}),/invalida/);
  assert.throws(()=>core.planAccountReconciliation(account,[],{...options,cutoff:'2026-08-01T00:00:00Z'}),/invalida/);
  assert.throws(()=>core.planAccountReconciliation(account,[{tipo:'gasto',cuenta_id:'cash'}],options),/fecha/);
});
test('cuadre con faltante y gasto no documentado crea movimiento de gasto que afecta resultado',()=>{
  const plan = core.planAccountReconciliation(account,[sale('prior','2026-09-09T22:00:00Z',5000)],{
    ...options,
    unrecordedExpense: true,
  });
  assert.equal(plan.difference,-7000);
  assert.equal(plan.movement.tipo,'gasto');
  assert.equal(plan.movement.afecta_resultado,true);
  assert.equal(plan.movement.es_ajuste_conciliacion,true);
  assert.equal(plan.movement.categoria_id,'efaa1d8d-1ad2-4815-95e1-755b99a8c241');
  assert.equal(core.summarizeMovements([plan.movement]).gastos_centavos,7000);
});
test('conciliacion al cierre del 22/11 preserva movimientos del 23/11 (incluso con fecha de solo dia)',()=>{
  const cash22 = {id:'cash',business_id:'fixture',tipo:'efectivo',saldo_actual_centavos:500000,
    reconciled_at:'2026-11-17T09:27:51.599Z',reconciled_balance_centavos:1000000};
  const mov22 = {id:'gasto-22',tipo:'gasto',cuenta_id:'cash',monto_centavos:600000,fecha:'2026-11-22',source_timestamp:'2026-11-22',origen:'panel',estado:'registrado'};
  const mov23Hora = {id:'corte-23',tipo:'ingreso',cuenta_id:'cash',monto_centavos:118000,fecha:'2026-11-23',source_timestamp:'2026-11-23T17:03:17.815Z',origen:'cash_cut',estado:'registrado'};
  const mov23Dia = {id:'extra-23',tipo:'gasto',cuenta_id:'cash',monto_centavos:20000,fecha:'2026-11-23',source_timestamp:'2026-11-23',origen:'panel',estado:'registrado'};
  const plan = core.planAccountReconciliation(cash22,[mov22,mov23Hora,mov23Dia],{
    target:471000,cutoff:'2026-11-22T23:59:59-04:00',createdAt:'2026-11-24T00:30:00.000Z',id:'rec-22',reason:'Conteo 22/11 en la noche'
  });
  // Al cierre del 22/11 habia 1000000 - 600000 = 400000; faltaban +71000 para llegar a 471000.
  assert.equal(plan.before,400000);
  assert.equal(plan.difference,71000);
  assert.equal(plan.movement.fecha,'2026-11-22');
  assert.equal(plan.movement.source_timestamp,'2026-11-22T23:59:59-04:00');
  // El saldo reconciliado es 471000 y el actual suma encima +118000 - 20000 = 569000.
  assert.equal(plan.patch.reconciled_balance_centavos,471000);
  assert.equal(plan.patch.saldo_actual_centavos,569000);
  const reconciled = {...cash22,...plan.patch};
  assert.equal(core.effectiveAccountBalance(reconciled,[mov22,mov23Hora,mov23Dia,plan.movement]),569000);
});
