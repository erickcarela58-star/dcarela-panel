const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('./finance-core');
function harness(role='admin') {
  let rejectCommit=false;
  const docs = new Map([
    ['fin_accounts/cash',{business_id:'test',tipo:'efectivo',nombre:'Efectivo',ligada_ventas:true,saldo_actual_centavos:3650000}],
    ['fin_accounts/bank',{business_id:'test',tipo:'banco',nombre:'Banco Popular',saldo_actual_centavos:63410}],
    ['cash_shifts/shift',{business_id:'test',opened_by_uid:'user',status:'open',abiertoEn:'2026-09-07T12:00:00Z'}],
    ['products/product',{business_id:'test',nombre:'Foto',precioFinalCentavos:10000,usaInventario:false}],
    ['cost_obligations/payroll',{business_id:'test',saldoCentavos:814000}],
  ]);
  const snap=(key)=>({id:key.split('/').pop(),exists:docs.has(key),data:()=>docs.get(key)});
  const query=(name,filters=[])=>({
    where:(...f)=>query(name,[...filters,f]),limit:()=>query(name,filters),orderBy:()=>query(name,filters),
    async get(){return {docs:[...docs.keys()].filter(k=>k.startsWith(name+'/')&&filters.every(([field,op,v])=>op==='=='&&(field==='__name__'?k.split('/').pop():docs.get(k)[field])===v)).map(snap)};},
    doc(id){const key=`${name}/${id}`;return {key,async get(){if(!docs.has(key))throw new Error('missing-read');return snap(key);}};}
  });
  const db={collection:query,enablePersistence:async()=>{},async runTransaction(fn){
    const writes=[];
    const result=await fn({async get(ref){assert.equal(writes.length,0,'reads before writes');if(!docs.has(ref.key))throw new Error('missing-read');return snap(ref.key);},
      set:(ref,v,opts)=>writes.push({key:ref.key,v,merge:opts?.merge}),update:(ref,v)=>writes.push({key:ref.key,v,merge:true})});
    if(rejectCommit)throw new Error('offline');
    for(const w of writes){
      if(w.key.startsWith('sync_events/')&&docs.has(w.key))throw new Error('immutable-event');
      if(role==='cajero'&&/^fin_/.test(w.key))throw new Error('admin-only');
    }
    for(const w of writes){const next=w.merge?{...docs.get(w.key)}:{};for(const[k,v]of Object.entries(w.v))next[k]=v&&typeof v==='object'&&'increment'in v?(next[k]||0)+v.increment:v;docs.set(w.key,next);}
    return result;
  }};
  const auth={currentUser:{uid:'user',email:'test@example.test'}};
  const firebase={apps:[],initializeApp:()=>({}),auth:()=>auth,firestore:()=>db};
  firebase.firestore.FieldValue={increment:value=>({increment:value})};
  firebase.firestore.FieldPath={documentId:()=> '__name__'};
  const window={__DCARELA_FIREBASE_CONFIG:{projectId:'test'},DcarelaFinanceCore:core};
  vm.runInNewContext(fs.readFileSync(__dirname+'/firebase-adapter.js','utf8'),{window,firebase,console,Date,Math,Map,Promise,String,Number,Error,setTimeout,clearTimeout});
  return {api:window.DcarelaFirebase,docs,fail:()=>{rejectCommit=true;}};
}
test('pago, transferencia y reintentos son atomicos en ejecucion',async()=>{
  const h=harness();
  const pay={cuentaId:'cash',montoCentavos:814000,requestId:'payroll-request'};
  await h.api.adminAction('cost.payment.create','test','admin','payroll',pay);
  await h.api.adminAction('cost.payment.create','test','admin','payroll',pay);
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,2836000);
  assert.equal(h.docs.get('cost_obligations/payroll').saldoCentavos,0);
  const transfer={cuentaOrigenId:'cash',cuentaDestinoId:'bank',montoCentavos:100000,requestId:'transfer-request'};
  await h.api.adminAction('fin.transfer.create','test','admin',null,transfer);
  await h.api.adminAction('fin.transfer.create','test','admin',null,transfer);
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,2736000);
  assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,163410);
  h.fail();
  await assert.rejects(h.api.adminAction('fin.movement.create','test','admin',null,{cuentaId:'cash',tipo:'gasto',montoCentavos:1100000,requestId:'rent'}),/offline/);
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,2736000);
  assert.equal(h.docs.has('fin_movements/rent'),false);
});
test('crear editar y anular gasto no lee documentos inexistentes ni sobreescribe eventos',async()=>{
  const h=harness();
  const expense={cuentaId:'cash',montoCentavos:1100000,fecha:'2026-09-07',requestId:'rent'};
  const first=await h.api.adminAction('expense.upsert','test','admin',null,expense);
  await h.api.adminAction('expense.upsert','test','admin',null,expense);
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,2550000);
  await h.api.adminAction('expense.upsert','test','admin',first.id,{...expense,montoCentavos:1000000,requestId:'rent-edit'});
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,2650000);
  await h.api.adminAction('expense.delete','test','admin',first.id,{});
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,3650000);
});
test('cajero registra venta y salida sin permisos de administrador financiero',async()=>{
  const h=harness('cajero');
  const data={lineas:[{productoId:'product',cantidad:1}],pagos:[{metodo:'efectivo',montoCentavos:10000}],pagoConCentavos:10000};
  await h.api.webSaleAction('sale.create','test','cajero',data,'sale-request');
  await h.api.webSaleAction('sale.create','test','cajero',data,'sale-request');
  await h.api.webSaleAction('cash.move','test','cajero',{tipo:'salida',montoCentavos:7000},'cash-out');
  const events=[...h.docs.entries()].filter(([k])=>k.startsWith('sync_events/')).map(([id,x])=>({id:id.split('/').pop(),...x}));
  const accounts=[...h.docs.entries()].filter(([k])=>k.startsWith('fin_accounts/')).map(([id,x])=>({id:id.split('/').pop(),...x,reconciled_at:'2026-09-05T03:59:59.999Z',reconciled_balance_centavos:x.saldo_actual_centavos}));
  const movements=[...core.projectSalePaymentsAsMovements(events.filter(x=>x.event_type==='VentaCobrada'),accounts),...core.projectOperationsAsMovements(events,accounts)];
  assert.equal(core.effectiveAccountBalance(accounts[0],movements),3653000);
  assert.equal(h.docs.get('cash_shifts/shift').saleCount,1);
});

test('venta mixta y anulacion revierten ambas cuentas y publican estado del diario',async()=>{
  const h=harness();
  const sale=await h.api.webSaleAction('sale.create','test','admin',{
    lineas:[{productoId:'product',cantidad:1}],
    pagos:[{metodo:'efectivo',montoCentavos:4000},{metodo:'transferencia',montoCentavos:6000,cuentaFinancieraId:'bank'}],
  },'mixed-sale');
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,3654000);
  assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,69410);
  await h.api.webSaleAction('sale.cancel','test','admin',{ventaId:sale.sale.ventaId,motivo:'prueba',sourceEventId:'mixed-sale'},'cancel-mixed');
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,3650000);
  assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,63410);
  const states=[...h.docs.values()].filter(x=>x.event_type==='LedgerMovimientoRegistrado'&&x.payload.estado==='anulado');
  assert.equal(states.length,2);
});

test('seguimiento confirmado exige asiento real y no vuelve a mover dinero',async()=>{
  const h=harness();
  h.docs.set('fin_pending_transfers/p',{business_id:'test',estado:'pendiente',cuenta_id:'bank',direccion:'entrada',monto_centavos:10000});
  const act=(action,data)=>h.api.adminAction('fin.pending_transfer.'+action,'test','admin','p',data);
  await assert.rejects(act('confirm',{nota:'Banco verificado'}),/movimiento financiero original/);
  assert.equal(h.docs.get('fin_pending_transfers/p').estado,'pendiente');
  await h.api.adminAction('fin.transfer.create','test','admin',null,{cuentaOrigenId:'cash',cuentaDestinoId:'bank',montoCentavos:10000,requestId:'original'});
  const bank=h.docs.get('fin_accounts/bank').saldo_actual_centavos;
  await act('confirm',{nota:'Banco verificado',movimientoId:'original'});
  await act('confirm',{nota:'Reintento',movimientoId:'original'});
  assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,bank);
  assert.equal(h.docs.get('fin_pending_transfers/p').movimiento_id,'original');
  await assert.rejects(act('cancel',{nota:'Cambio'}),/cerrado/);
});

test('seguimiento rechaza asiento ajeno o incorrecto y falla sin escritura parcial',async()=>{
  const h=harness();
  h.docs.set('fin_pending_transfers/p',{business_id:'test',estado:'pendiente',cuenta_id:'bank',direccion:'entrada',monto_centavos:10000});
  h.docs.set('fin_movements/m',{business_id:'other',estado:'registrado',tipo:'ingreso',cuenta_id:'bank',monto_centavos:10000});
  const confirm=()=>h.api.adminAction('fin.pending_transfer.confirm','test','admin','p',{nota:'Verificado',movimientoId:'m'});
  await assert.rejects(confirm(),/no existe/);
  h.docs.get('fin_movements/m').business_id='test';
  h.docs.get('fin_movements/m').monto_centavos=9999;
  await assert.rejects(confirm(),/coincidir/);
  h.docs.get('fin_movements/m').monto_centavos=10000;
  h.fail();
  await assert.rejects(confirm(),/offline/);
  assert.equal(h.docs.get('fin_pending_transfers/p').estado,'pendiente');
  assert.equal(h.docs.has('sync_events/pending-transfer-p-confirmada'),false);
});
