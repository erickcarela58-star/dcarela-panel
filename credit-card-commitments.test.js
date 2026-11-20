'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('./money-manager-core');
const card={id:'visa',tipo:'tarjeta_credito',business_id:'dcarela',nombre:'Visa de prueba',moneda:'DOP',saldo_actual_centavos:-200000,estado:'activa'};
const input={accounts:[card],cards:[{id:'visa',cuenta_id:'visa',dia_pago:31}],asOf:'2027-02-12',month:'2027-02'};
test('la cuenta de crédito aparece como compromiso incluso sin ficha adicional; la fecha no se inventa',()=>{
  const s=core.obligationSummary({...input,cards:[]});assert.equal(s.rows.length,1);assert.equal(s.rows[0].source,'tarjeta');assert.equal(s.rows[0].outstanding,200000);assert.equal(s.rows[0].due,'');
});
test('el vencimiento respeta febrero y la deuda de tarjeta cuenta una vez sin mezclar USD',()=>{
  const s=core.obligationSummary({...input,accounts:[card,{...card,id:'usd',moneda:'USD'}],commitments:[{id:'old',nombre:'Pago Visa',cuenta_tarjeta_id:'visa',monto_centavos:200000,proximo_vencimiento:'2027-02-28',activo:true}]});
  assert.equal(s.rows.length,1);assert.equal(s.rows[0].due,'2027-02-28');assert.equal(s.payableNow,200000);assert.equal(s.rows[0].raw.compromiso_id,'old');
});
test('el abono reduce el pendiente desde el saldo actualizado, y pagar todo lo retira',()=>{
  assert.equal(core.obligationSummary({...input,accounts:[{...card,saldo_actual_centavos:-50000}]}).rows[0].outstanding,50000);
  assert.equal(core.obligationSummary({...input,accounts:[{...card,saldo_actual_centavos:0}]}).rows.length,0);
});
test('dos tarjetas no se confunden por banco o nombre; los días inválidos quedan sin fecha',()=>{
  const s=core.creditCardSchedule({...input,accounts:[card,{...card,id:'visa2'}],cards:[{cuenta_id:'visa',dia_pago:0},{cuenta_id:'visa2',dia_pago:5}]});
  assert.equal(s.length,2);assert.equal(s[0].due,'');assert.equal(s[1].due,'2027-03-05');
});
test('el día de pago por sí solo muestra el próximo vencimiento y no inventa mora; un estado fechado sí puede estar vencido',()=>{
 const c={cuenta_id:'visa',dia_pago:5};
 assert.equal(core.creditCardSchedule({...input,cards:[c],asOf:'2026-11-20'})[0].due,'2026-12-05');
 assert.equal(core.creditCardSchedule({...input,cards:[{...c,proximo_vencimiento:'2026-11-05'}],asOf:'2026-11-20'})[0].due,'2026-11-05');
 assert.equal(core.creditCardSchedule({...input,cards:[{...c,proximo_vencimiento:'2026-99-99'}],asOf:'2026-11-20'})[0].due,'2026-12-05');
});
