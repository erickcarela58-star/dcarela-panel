'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./panel.js'),'utf8'),core=require('./finance-core'),mm=require('./money-manager-core');
function render(name,next,state,canEdit=false){
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',querySelectorAll:()=>[]});return nodes.get(id);};
  const ctx=vm.createContext({$,finStateCache:state,canEdit,financeCore:core,moneyManagerCore:mm,finAccountBalance:a=>a.saldo_actual_centavos,
    numero:(n,d=0)=>Number(n??d),money:n=>'RD$'+(n/100).toFixed(2),esc:String,metric:(l,v)=>l+'='+v+';',
    tabla:()=>'',finCardDates:()=>({cut:new Date(),pay:new Date()}),fechaCorta:()=>'',FIN_COMMITMENT_FREQUENCY:{}});
  const a=source.indexOf('  function '+name+'('),b=source.indexOf('  function '+next+'(',a);
  vm.runInContext(source.slice(a,b)+'\n'+name+'()',ctx);return {nodes,$};
}
function card(currency='DOP',configured=false,canEdit=false){return render('renderFinCards','abrirConsumoTarjetaFin',{
  accounts:[{id:'card',nombre:'Tarjeta ficticia',tipo:'tarjeta_credito',moneda:currency,saldo_actual_centavos:-6400}],
  cards:configured?[{cuenta_id:'card',limite_credito_centavos:10000}]:[]},canEdit).$('finTarjetasCards').innerHTML;}
test('lector puede consultar tarjetas sin botones de pago, consumo o configuración',()=>{
  for(const configured of [false,true]){const html=card('DOP',configured,false);assert.doesNotMatch(html,/data-fin-card(?:-pay|-consumo)?=/);assert.match(html,/Solo lectura/);}
});
test('tarjeta USD conserva moneda en deuda y disponible y no ofrece formularios manuales DOP',()=>{
  for(const configured of [false,true]){const html=card('USD',configured,true);assert.match(html,/US\$64\.00/);if(configured)assert.match(html,/US\$36\.00/);assert.doesNotMatch(html,/RD\$|data-fin-card(?:-pay|-consumo)?=/);}
});
test('editor DOP conserva las acciones admitidas de la tarjeta',()=>{assert.match(card('DOP',true,true),/data-fin-card-pay=/);assert.match(card('DOP',true,true),/data-fin-card-consumo=/);});
test('configurar tarjeta conserva el corte existente y excluye cuentas USD del formulario DOP',()=>{
  let html,submit;
  const ctx=vm.createContext({finStateCache:{accounts:[{id:'dop',nombre:'Tarjeta DOP',tipo:'tarjeta_credito'},{id:'usd',nombre:'Tarjeta USD',tipo:'tarjeta_credito',moneda:'USD'}],cards:[{cuenta_id:'dop',dia_corte:20,dia_pago:8,limite_credito_centavos:10000}]},financeCore:core,
    abrirEditor:(_a,_b,h,s)=>{html=h;submit=s;},esc:String,selected:()=>'',pesoInput:n=>n/100,toast:()=>{},setCostTab:()=>{},$:()=>({querySelector:()=>null})});
  const a=source.indexOf('  function abrirTarjetaFin('),b=source.indexOf('  function abrirPagoTarjetaFin(',a);
  vm.runInContext(source.slice(a,b)+'\nabrirTarjetaFin("dop")',ctx);
  assert.doesNotMatch(html,/value="usd"/);assert.match(html,/name="diaCorte"[^>]*value="20"/);assert.match(html,/name="diaPago"[^>]*value="8"/);assert.ok(submit);
});
test('Compromisos conserva deuda desconocida y separa tarjetas DOP y USD',()=>{
  const state={month:'2026-11',commitments:[{id:'unknown',nombre:'Préstamo sin saldo',tipo:'prestamo',activo:true,monto_centavos:10000,proximo_vencimiento:'2026-11-03'}],
    accounts:[{id:'dop',tipo:'tarjeta_credito',moneda:'DOP',saldo_actual_centavos:-10000},{id:'usd',tipo:'tarjeta_credito',moneda:'USD',saldo_actual_centavos:-6400}]};
  const antes=JSON.stringify(state),h=render('renderFinCommitments','finCategoryRows',state);
  const html=h.$('finCompromisosResumen').innerHTML;
  assert.match(html,/Deuda de prestamos=--/);assert.match(html,/Capital pendiente=--/);
  assert.match(html,/RD\$100\.00/);assert.match(html,/US\$64\.00/);assert.doesNotMatch(html,/RD\$164/);assert.equal(JSON.stringify(state),antes);
});
