const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('./finance-core');
const panel=fs.readFileSync(__dirname+'/panel.js','utf8');
function formHarness(name,nextName,extra={}) {
 const editor={}, writes=[];
 const scope={crypto:{randomUUID:()=> 'ui-request'},financeCore:core,finStateCache:{accounts:[{id:'bank',nombre:'Banco'}],commitmentPayments:[]},
   esc:v=>String(v??''),todayKey:()=> '2026-09-09',pesoInput:v=>(v||0)/100,money:v=>'RD$'+v/100,dateOnly:v=>v,
   centavosInput:v=>Math.round(Number(v)*100),optionalCents:v=>v==null||v===''?null:Math.round(Number(v)*100),optionalInteger:v=>v==null||v===''?null:Number(v),
   abrirEditor:(title,description,html,submit)=>Object.assign(editor,{title,description,html,submit}),
   adminWrite:async(...args)=>writes.push(args),cerrarEditor:()=>{},cargarProveedores:async()=>{},setCostTab:()=>{},...extra};
 vm.createContext(scope);vm.runInContext(panel.slice(panel.indexOf('  function '+name+'('),panel.indexOf('  function '+nextName+'(')),scope);
 return {scope,editor,writes};
}
test('formulario de prestamo rechaza capital desconocido antes de enviar y conserva desglose valido',async()=>{
 const h=formHarness('abrirPagoCompromisoFin','desactivarCompromisoFin');
 h.scope.abrirPagoCompromisoFin({id:'loan',nombre:'Fixture',tipo:'prestamo',monto_centavos:12000,saldo_pendiente_centavos:120000});
 const form=new Map([['monto','120'],['interes','15'],['cargos','5'],['cuentaId','bank'],['fecha','2026-09-09'],['cuotasAplicadas','1']]);
 await assert.rejects(h.editor.submit(form),/Indica el capital/);assert.equal(h.writes.length,0);
 form.set('capital','100');await h.editor.submit(form);
 assert.equal(h.writes.length,1);assert.equal(h.writes[0][0],'fin.commitment.payment');
 assert.equal(h.writes[0][2].capitalCentavos,10000);assert.equal(h.writes[0][2].montoCentavos,12000);
});
test('confirmacion desde intereses muestra el total y solicita anular todo el pago',async()=>{
 const h=formHarness('confirmarAnularMovimientoFin','abrirCategoriaFin',{finStateCache:{commitmentPayments:[{id:'p',monto_centavos:12000}]}});
 h.scope.confirmarAnularMovimientoFin({id:'interest',pago_compromiso_id:'p',monto_centavos:2000,fecha:'2026-09-09'});
 assert.equal(h.editor.title,'Anular pago completo');assert.match(h.editor.html,/RD\$120/);
 await h.editor.submit(new Map([['motivo','Fixture']]));
 assert.equal(h.writes[0][0],'fin.commitment.payment.cancel');assert.equal(h.writes[0][1],'p');
});
