const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/panel.js','utf8'),core=require('./finance-core');
test('indicadores, grafico diario y categorias comparten resultado sin abonos ni capital',async()=>{
 const rows=[
  {id:'sale',tipo:'ingreso',monto_centavos:10000},
  {id:'abono',tipo:'ingreso',monto_centavos:3000,afecta_resultado:false},
  {id:'capital',tipo:'gasto',monto_centavos:5000,afecta_resultado:false},
  {id:'interest',tipo:'gasto',monto_centavos:2000},
  {id:'transfer',tipo:'transferencia',monto_centavos:10000,comision_centavos:500},
  {id:'cancelled',tipo:'gasto',monto_centavos:9000,estado:'anulado'},
 ].map(r=>({...r,fecha:'2026-09-10'}));
 const state={movements:rows,accounts:[],categories:[],budgetProgress:[]};
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',querySelectorAll:()=>[]});return elements.get(id);};
 const code=source.slice(source.indexOf('  async function renderFinDashboard('),source.indexOf('  function renderFinFlowChart('));
 assert.ok(code.length>100);
 await vm.runInNewContext(code+'\nrenderFinDashboard()',{
  finStateCache:state,finRange:()=>({from:'2026-09-01',to:'2026-09-30',label:'mes fixture'}),finReferenceDate:'2026-09-10',
  $,authProvider:'firebase',financeCore:core,numero:(x,d=0)=>Number(x??d),money:String,esc:String,waveMetric:()=>'',
  renderFinFlowChart:()=>{},renderFinCategoryChart:()=>{},renderFinRecent:()=>{},renderFinPlanning:()=>{},console
 });
 assert.equal(state.dashboard.summary.ingresos_centavos,10000);
 assert.equal(state.dashboard.summary.gastos_centavos,2500);
 assert.equal(state.dashboard.daily.reduce((s,d)=>s+d.gastos_centavos,0),2500);
 assert.equal(state.dashboard.daily.reduce((s,d)=>s+d.ingresos_centavos,0),10000);
 assert.equal(state.dashboard.categories.reduce((s,c)=>s+c.total_centavos,0),2500);
 assert.match($('finDashboardKpis').innerHTML,/Resultado del periodo/);
});
test('formulario de conciliacion conserva deuda negativa e identificador en reintento',async()=>{
 let submit;const requests=[];
 const code=source.slice(source.indexOf('  function abrirConciliacionCuentaFin('),source.indexOf('  function abrirTransferenciaFin('));
 vm.runInNewContext(code+'\nabrirConciliacionCuentaFin({id:"card",nombre:"Tarjeta fixture",tipo:"tarjeta_credito"})',{
  crypto:{randomUUID:()=> 'fixed-request'},abrirEditor:(title,desc,html,callback)=>{submit=callback;},
  finAccountBalance:()=>-40000,money:String,centavosConSignoInput:x=>Math.round(Number(x)*100),
  adminWrite:async(...args)=>requests.push(args),cerrarEditor:()=>{},cargarProveedores:async()=>{}
 });
 const form=new Map([['saldo','-432.10'],['motivo','Estado bancario fixture']]);
 await submit(form);await submit(form);
 assert.equal(requests[0][2].saldoObjetivoCentavos,-43210);
 assert.equal(requests[0][2].requestId,requests[1][2].requestId);
});

test('consumo de tarjeta conserva centavos, cuenta y requestId incluso al reintentar', async () => {
 let submit;const requests=[];
 const code=source.slice(source.indexOf('  function abrirConsumoTarjetaFin('),source.indexOf('  function renderFinSettings('));
 vm.runInNewContext(code+'\nabrirConsumoTarjetaFin("qik")',{
   crypto:{randomUUID:()=> 'consumo-fixture'},finStateCache:{accounts:[{id:'qik',nombre:'Qik'}]},
   abrirEditor:(title,desc,html,callback)=>{submit=callback;},finCategoryOptions:()=>'',inputDate:()=> '2026-09-20',
   centavosInput:x=>Math.round(Number(x)*100),adminWrite:async(...args)=>requests.push(args),cerrarEditor:()=>{},cargarProveedores:async()=>{}
 });
 const form=new Map([['monto','3712.63'],['fecha','2026-09-20'],['descripcion','Comida']]);
 await submit(form);await submit(form);
 assert.equal(requests[0][2].montoCentavos,371263);assert.equal(requests[0][2].cuentaId,'qik');
 assert.ok(requests[0][2].requestId);assert.equal(requests[0][2].requestId,requests[1][2].requestId);
});

test('transferencia incluye selector de ITBIS 0.20% y Sin ITBIS calculando centavos exactos', async () => {
 let formHtml;
 const requests = [];
 const code = source.slice(source.indexOf('  function bindTransferItbisOptions('), source.indexOf('  function finCategoryOptions('));
 const accounts = [
   { id: 'pop', nombre: 'Banco Popular', tipo: 'banco', estado: 'activa' },
   { id: 'qik', nombre: 'Cuenta Corriente Qik', tipo: 'banco', estado: 'activa' }
 ];
 let submitCallback;
 vm.runInNewContext(code + '\nabrirTransferenciaFin()', {
   crypto: { randomUUID: () => 'trf-itbis-test' },
   finStateCache: { accounts },
   abrirEditor: (title, desc, html, callback) => { formHtml = html; submitCallback = callback; },
   toast: () => {}, finAccountBalance: () => 100000, money: String, esc: String, selected: () => '',
   inputDate: () => '2026-09-22', centavosInput: x => Math.round(Number(x) * 100),
   adminWrite: async (...args) => requests.push(args), cerrarEditor: () => {}, cargarProveedores: async () => {},
   $: () => ({ querySelector: () => null, querySelectorAll: () => [] })
 });
 assert.match(formHtml, /Sin ITBIS/);
 assert.match(formHtml, /0\.20%/);
 assert.match(formHtml, /name="comision"/);

 const form = new Map([
   ['cuentaOrigenId', 'pop'], ['cuentaDestinoId', 'qik'],
   ['monto', '8100.00'], ['comision', '16.20'], ['fecha', '2026-09-22'],
   ['descripcion', 'Transferencia con ITBIS'], ['nota', '']
 ]);
 await submitCallback(form);
 assert.equal(requests[0][2].montoCentavos, 810000);
 assert.equal(requests[0][2].comisionCentavos, 1620);
 assert.equal(requests[0][2].cuentaOrigenId, 'pop');
 assert.equal(requests[0][2].cuentaDestinoId, 'qik');
});

