import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFacturadorSales} from './facturador-sales.mjs';
const row=(id,total=11800,more={})=>({id,business_id:'dcarela',encf:id,fecha:'2026-11-20',estado:'Emitido',total_centavos:total,subtotal_centavos:total/118*100,itbis_centavos:total/118*18,...more});
test('suma centavos de todas las ventas y resta E34 como en el libro del POS',()=>{
 const rows=[row('E32001'),row('E32002',23600),row('E34001',5900)],before=structuredClone(rows),s=summarizeFacturadorSales(rows,{businessId:'dcarela'}),g=s.groups[0];
 assert.equal(s.selectedRecords,3);assert.equal(g.gross,35400);assert.equal(g.credits,5900);assert.equal(g.total,29500);assert.equal(g.subtotal,25000);assert.equal(g.itbis,4500);assert.equal(g.salesCount,2);assert.equal(g.creditCount,1);assert.deepEqual(rows,before);
});
test('anulados, rechazados e irreales se muestran fuera de las sumas; una nota anulada no resta',()=>{
 const s=summarizeFacturadorSales([row('E32001'),...['Anulado','Rechazado','anulado_irreal','Borrador'].map((estado,i)=>row('E320'+i,11800,{estado})),row('E34001',11800,{estado:'Anulado'}),row('E320099',11800,{descartado_irreal:true})]);
 assert.equal(s.groups[0].total,11800);assert.equal(s.groups[0].excludedCount,6);assert.equal(s.rows.length,7);
});
test('el mismo e-CF capturado por dos orígenes cuenta una vez; contradicciones no se ocultan',()=>{
 const a=row('E32001'),s=summarizeFacturadorSales([a,{...a,id:'otra-captura'}]);assert.equal(s.duplicates,1);assert.equal(s.groups[0].total,11800);
 assert.throws(()=>summarizeFacturadorSales([a,row('E32001',23600)]),/contradictorias/);
});
test('el filtro mensual y las monedas no mezclan sucursales ni divisas',()=>{
 const rows=[row('E32001'),row('E32002',11800,{fecha:'2026-10-30'}),row('E32003',11800,{moneda:'USD'})],s=summarizeFacturadorSales(rows,{month:'2026-11',businessId:'dcarela'});
 assert.equal(s.totalRecords,3);assert.equal(s.selectedRecords,2);assert.deepEqual(s.groups.map(g=>[g.currency,g.total]),[['DOP',11800],['USD',11800]]);
 assert.throws(()=>summarizeFacturadorSales([row('other',11800,{business_id:'plaza-artesanal'})],{businessId:'dcarela'}),/sucursal/);
});
test('un importe ausente, inconsistente o desbordado falla sin presentar un cero inventado',()=>{
 for(const value of [null,undefined,'',true,1.5,-1])assert.throws(()=>summarizeFacturadorSales([row('a',11800,{total_centavos:value})]),/verificables/);
 assert.throws(()=>summarizeFacturadorSales([row('a',11800,{itbis_centavos:1})]),/coinciden/);
 const max=Number.MAX_SAFE_INTEGER;assert.throws(()=>summarizeFacturadorSales([row('a',max,{subtotal_centavos:max,itbis_centavos:0}),row('b',max,{subtotal_centavos:max,itbis_centavos:0})]),/rango/);
});
test('identifica los importes emitidos pendientes de revisión y excluye los descartados',()=>{
 const rows=[row('E32001',11800,{forma_pago:'Por confirmar'}),row('E34001',5900,{requiere_verificacion_hermes:true}),
  row('E32002',11800,{estado:'anulado_irreal',requiere_verificacion_hermes:true})];
 const {groups:[g]}=summarizeFacturadorSales(rows);
 assert.equal(g.total,5900);assert.equal(g.pendingVerificationCount,2);assert.equal(g.pendingVerificationTotal,5900);
});
test('vacío y meses inválidos quedan explícitos',()=>{
 const s=summarizeFacturadorSales([]);assert.equal(s.selectedRecords,0);assert.deepEqual(s.groups,[]);assert.throws(()=>summarizeFacturadorSales([],{month:'2026-13'}),/mes/);
});
