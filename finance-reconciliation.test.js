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
