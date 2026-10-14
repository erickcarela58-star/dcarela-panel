const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tools=require('./tool-layout-core.js'),finance=require('./finance-core.js');
test('orden y visibilidad solo aceptan herramientas disponibles y siempre permiten recuperar el Resumen',()=>{
 const ids=['resumen','cuentas','recibos'];
 const saved={order:['recibos','desconocida','recibos','cuentas'],hidden:['resumen','cuentas','desconocida']};
 const before=JSON.stringify(saved),value=tools.normalize(ids,saved,['resumen','cuentas'],['resumen']);
 assert.deepEqual(value,{order:['recibos','cuentas','resumen'],hidden:['cuentas']});assert.equal(JSON.stringify(saved),before);
 assert.deepEqual(tools.normalize(ids,null,['cuentas','resumen'],['resumen']),{order:['cuentas','resumen','recibos'],hidden:['recibos']});
});
test('abrir una cuenta exige origen, iframe padre, sucursal, sesión y cuenta permitidos',()=>{
 const parent={},accounts=[{id:'cash'},{id:'deleted',estado:'eliminada'}],context={origin:'https://panel.test',parent,business:'central',authenticated:true,accounts};
 const event={origin:context.origin,source:parent,data:{type:'dcarela:open-account',businessId:'central',accountId:'cash'}};
 assert.equal(tools.accountMessage(event,context),'cash');
 for(const rejected of [{...event,origin:'https://other.test'},{...event,source:{}},{...event,data:{...event.data,businessId:'plaza'}},{...event,data:{...event.data,accountId:'deleted'}},{...event,data:{...event.data,accountId:'other'}}])assert.equal(tools.accountMessage(rejected,context),null);
 assert.equal(tools.accountMessage(event,{...context,authenticated:false}),null);
});
test('la apertura espera al iframe de la sucursal correcta y no repite la selección tras confirmarla',()=>{
 const callbacks={},sent=[],frame={contentWindow:{postMessage:(payload,origin)=>sent.push({payload,origin})}},routes=[];
 let mounted=false;
 const sandbox={module:{exports:{}},window:{addEventListener:(name,fn)=>callbacks[name]=fn},document:{querySelector:()=>mounted?frame:null},location:{origin:'https://panel.test',hash:'#finanzas'}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./tool-layout-core.js'),'utf8'),sandbox);
 sandbox.module.exports.requestAccount('cash','central',route=>routes.push(route));mounted=true;
 const ready={origin:sandbox.location.origin,source:frame.contentWindow,data:{type:'dcarela:account-ready',businessId:'central'}};
 callbacks.message({...ready,data:{...ready.data,businessId:'plaza'}});callbacks.message({...ready,source:{}});assert.equal(sent.length,0);
 callbacks.message(ready);assert.equal(sent.length,1);assert.equal(sent[0].payload.accountId,'cash');assert.equal(sent[0].origin,sandbox.location.origin);
 callbacks.message(ready);assert.equal(sent.length,1);assert.deepEqual(routes,['finanzas']);
});
test('detalle conserva saldo firmado y separa ingresos/gastos de traslados y asientos anulados',()=>{
 const source=fs.readFileSync(require.resolve('./panel.js'),'utf8'),start=source.indexOf('  function renderFinAccountDetail()'),end=source.indexOf('  function abrirGasto(',start);
 const account={id:'card',nombre:'Tarjeta fixture',tipo:'tarjeta_credito',saldo_actual_centavos:-40000};
 const rows=[{id:'income',tipo:'ingreso',monto_centavos:1000},{id:'expense',tipo:'gasto',monto_centavos:600},{id:'transfer',tipo:'transferencia',monto_centavos:2000,comision_centavos:100},{id:'cancel',tipo:'gasto',monto_centavos:9000,estado:'anulado'}].map(r=>({...r,cuenta_id:'card',fecha:'2026-10-14'}));
 const before=JSON.stringify({account,rows}),mount={innerHTML:'',classList:{toggle:()=>{}},querySelector:()=>({addEventListener:()=>{}})};
 vm.runInNewContext(source.slice(start,end)+'\nrenderFinAccountDetail()',{$:id=>id==='finAccountDetail'?mount:{value:'card'},finStateCache:{accounts:[account]},finFilteredMovements:rows,financeCore:finance,finAccountBalance:()=>account.saldo_actual_centavos,FIN_TIPO_LABEL:{tarjeta_credito:'Tarjeta'},money:String,esc:String});
 assert.match(mount.innerHTML,/<strong>-40000<\/strong>/);assert.match(mount.innerHTML,/<strong>1000<\/strong>/);assert.match(mount.innerHTML,/<strong>600<\/strong>/);assert.doesNotMatch(mount.innerHTML,/<strong>700<\/strong>/);
 assert.equal(JSON.stringify({account,rows}),before);
});
