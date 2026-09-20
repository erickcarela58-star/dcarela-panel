const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('./finance-core');

test('crear cuenta no lee un documento inexistente, conserva identidad y no altera un cuadre al editar',async()=>{
 const h=harness();
 const data={nombre:'Cuenta fixture',tipo:'banco',saldoInicialCentavos:12345,incluirEnTotal:true};
 await h.api.adminAction('fin.account.upsert','test','admin','new-account',data);
 await h.api.adminAction('fin.account.upsert','test','admin','new-account',data);
 assert.equal(h.docs.get('fin_accounts/new-account').saldo_actual_centavos,12345);
 h.docs.set('fin_accounts/new-account',{...h.docs.get('fin_accounts/new-account'),reconciled_at:'2026-09-10T12:00:00Z',reconciled_balance_centavos:12345});
 await assert.rejects(h.api.adminAction('fin.account.upsert','test','admin','new-account',{...data,saldoInicialCentavos:99999}),/concili/);
 assert.equal(h.docs.get('fin_accounts/new-account').saldo_actual_centavos,12345);
});

test('anular y restaurar un gasto anterior al cuadre afecta al saldo visible una sola vez', async () => {
 const h=harness();
 const account={...h.docs.get('fin_accounts/cash'),reconciled_at:'2026-09-10T12:00:00Z',reconciled_balance_centavos:100000,saldo_actual_centavos:100000};
 h.docs.set('fin_accounts/cash',account);
 h.docs.set('fin_movements/historical',{id:'historical',business_id:'test',tipo:'gasto',cuenta_id:'cash',monto_centavos:10000,fecha:'2026-09-05',estado:'registrado',origen:'panel'});
 await h.api.adminAction('fin.movement.cancel','test','admin','historical',{requestId:'rev-1',motivo:'Error documentado'});
 let row=h.docs.get('fin_movements/historical');
 assert.equal(core.effectiveAccountBalance({...h.docs.get('fin_accounts/cash'),id:'cash'},[row]),110000);
 await h.api.adminAction('fin.movement.restore','test','admin','historical',{requestId:'rev-2'});
 row=h.docs.get('fin_movements/historical');
 assert.equal(core.effectiveAccountBalance({...h.docs.get('fin_accounts/cash'),id:'cash'},[row]),100000);
 assert.equal(row.balance_effects.length,3);
 assert.equal(h.docs.get('sync_events/ledger-state-rev-2').payload.balance_effects.length,3);
});

test('Central: dos cobros simultaneos no consumen la misma ultima unidad', async () => {
  const h = harness();
  h.docs.set('products/product', {...h.docs.get('products/product'), usaInventario:true, stock:1});
  const sale = {lineas:[{productoId:'product',cantidad:1}],pagos:[{metodo:'efectivo',montoCentavos:10000}],pagoConCentavos:10000};
  const results = await Promise.allSettled(['stock-a','stock-b'].map(id => h.api.webSaleAction('sale.create','test','admin',sale,id)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(h.docs.get('products/product').stock, 0);
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos, 3660000);
});

test('Central: lineas repetidas acumulan consumo y anulacion sin perder unidades', async () => {
  const h = harness();
  h.docs.set('products/product', {...h.docs.get('products/product'), usaInventario:true, stock:5});
  const sale = await h.api.webSaleAction('sale.create','test','admin',{
    lineas:[{productoId:'product',cantidad:1},{productoId:'product',cantidad:2}],
    pagos:[{metodo:'efectivo',montoCentavos:30000}],pagoConCentavos:30000
  },'repeat-products');
  assert.equal(h.docs.get('products/product').stock, 2);
  await h.api.webSaleAction('sale.cancel','test','admin',{ventaId:sale.sale.ventaId,sourceEventId:'repeat-products',motivo:'Prueba'},'cancel-repeat');
  assert.equal(h.docs.get('products/product').stock, 5);
});

test('Credito valida sucursal y saldo actual en cada intento de transaccion', async () => {
  const h = harness();
  h.docs.set('clients/customer',{business_id:'test',nombre:'Fixture',activo:true,saldoCentavos:0,limiteCreditoCentavos:15000});
  const sale = {clienteId:'customer',lineas:[{productoId:'product',cantidad:1}],pagos:[{metodo:'credito',montoCentavos:10000}]};
  const results = await Promise.allSettled(['credit-a','credit-b'].map(id => h.api.webSaleAction('sale.create','test','admin',sale,id)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(h.docs.get('clients/customer').saldoCentavos,10000);
  h.docs.set('clients/customer',{...h.docs.get('clients/customer'),business_id:'otra',saldoCentavos:0});
  await assert.rejects(h.api.webSaleAction('sale.create','test','admin',sale,'foreign-client'),/sucursal/);
});

test('Un tipo de movimiento desconocido no puede aumentar saldo', async () => {
  const h = harness();
  await assert.rejects(h.api.adminAction('fin.movement.create','test','admin',null,{
    requestId:'bad-type',cuentaId:'cash',tipo:'transferncia',montoCentavos:10000
  }),/tipo|Tipo/);
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,3650000);
  assert.equal(h.docs.has('fin_movements/bad-type'),false);
});

test('Cierre Central incluye abonos, propinas y devoluciones, exige lectura completa y admite reintento', async () => {
  const h = harness();
  h.docs.set('cash_shifts/shift',{...h.docs.get('cash_shifts/shift'),montoAperturaCentavos:10000});
  const event = (id,event_type,payload) => ({id,event_type,payload:{turnoId:'shift',...payload}});
  h.api.getSyncEvents = async (business,opts) => {
    assert.equal(opts.complete,true);
    return [event('s','VentaCobrada',{ventaId:'s',pagos:[{metodo:'efectivo',montoCentavos:20000}],propinaCentavos:500}),
      event('p','AbonoClienteRegistrado',{metodo:'efectivo',montoCentavos:3000}),
      event('r','DevolucionRegistrada',{metodo:'efectivo',montoCentavos:1000}),
      event('e','EntradaEfectivo',{montoCentavos:2000}),event('x','SalidaEfectivo',{montoCentavos:4000})];
  };
  const input = {efectivoContadoCentavos:30500};
  const first = await h.api.webSaleAction('shift.close','test','admin',input,'close-complete');
  assert.equal(first.summary.efectivoEsperadoCentavos,30500);
  assert.equal(first.summary.diferenciaCentavos,0);
  const retry = await h.api.webSaleAction('shift.close','test','admin',input,'close-complete');
  assert.equal(retry.summary.efectivoEsperadoCentavos,30500);
  assert.equal(retry.deduplicated,true);
});
function harness(role='admin',business='test') {
  let rejectCommit=false;
  const docs = new Map([
    ['fin_accounts/cash',{business_id:'test',tipo:'efectivo',nombre:'Efectivo',ligada_ventas:true,saldo_actual_centavos:3650000}],
    ['fin_accounts/bank',{business_id:'test',tipo:'banco',nombre:'Banco Popular',saldo_actual_centavos:63410}],
    ['cash_shifts/shift',{business_id:'test',opened_by_uid:'user',status:'open',abiertoEn:'2026-09-07T12:00:00Z'}],
    ['products/product',{business_id:'test',nombre:'Foto',precioFinalCentavos:10000,usaInventario:false}],
    ['cost_obligations/payroll',{business_id:'test',saldoCentavos:814000}],
  ]);
  for(const [key,value] of docs)docs.set(key,{...value,business_id:business});
  const snap=(key)=>({id:key.split('/').pop(),exists:docs.has(key),data:()=>docs.get(key)});
  const query=(name,filters=[])=>({
    where:(...f)=>query(name,[...filters,f]),limit:()=>query(name,filters),orderBy:()=>query(name,filters),
    startAt:id=>query(name,[...filters,['__name__','>=',id]]),
    endAt:id=>query(name,[...filters,['__name__','<=',id]]),
    async get(){
      const exactId=filters.find(([field,op])=>field==='__name__'&&op==='==');
      // Firestore evaluates an exact document-name lookup against the missing
      // resource. Tenant rules based on resource.data reject this before create.
      if(exactId&&!docs.has(name+'/'+exactId[2]))throw new Error('permission-denied: missing resource');
      return {docs:[...docs.keys()].filter(k=>k.startsWith(name+'/')&&filters.every(([field,op,v])=>{
        const value=field==='__name__'?k.split('/').pop():docs.get(k)[field];
        return op==='=='?value===v:op==='>='?value>=v:op==='<='?value<=v:false;
      })).map(snap)};
    },
    doc(id){const key=`${name}/${id}`;return {key,async get(){if(!docs.has(key))throw new Error('missing-read');return snap(key);}};}
  });
  const db={collection:query,enablePersistence:async()=>{},async runTransaction(fn){
    for(let attempt=0;attempt<8;attempt++) {
    const writes=[], reads=new Map();
    const result=await fn({async get(ref){assert.equal(writes.length,0,'reads before writes');if(!docs.has(ref.key))throw new Error('missing-read');
      const value=docs.get(ref.key);reads.set(ref.key,value);return {id:ref.key.split('/').pop(),exists:true,data:()=>value};},
      set:(ref,v,opts)=>writes.push({key:ref.key,v,merge:opts?.merge}),update:(ref,v)=>writes.push({key:ref.key,v,merge:true})});
    if(rejectCommit)throw new Error('offline');
    if([...reads].some(([key,value])=>docs.get(key)!==value))continue;
    for(const w of writes){
      if(w.key.startsWith('sync_events/')&&docs.has(w.key))throw new Error('immutable-event');
      if(role==='cajero'&&/^fin_/.test(w.key))throw new Error('admin-only');
    }
    for(const w of writes){const next=w.merge?{...docs.get(w.key)}:{};for(const[k,v]of Object.entries(w.v))next[k]=v&&typeof v==='object'&&'increment'in v?(next[k]||0)+v.increment:v;docs.set(w.key,next);}
    return result;
    }
    throw new Error("transaction-contention");
  }};
  const auth={currentUser:{uid:'user',email:'test@example.test'}};
  const firebase={apps:[],initializeApp:()=>({}),auth:()=>auth,firestore:()=>db};
  firebase.firestore.FieldValue={increment:value=>({increment:value})};
  firebase.firestore.FieldPath={documentId:()=> '__name__'};
  const window={__DCARELA_FIREBASE_CONFIG:{projectId:'test'},DcarelaFinanceCore:core,DcarelaVirtualCash:require('./virtual-cash-core')};
  vm.runInNewContext(fs.readFileSync(__dirname+'/firebase-adapter.js','utf8'),{window,firebase,console,Date,Math,Map,Promise,String,Number,Error,setTimeout,clearTimeout});
  return {api:window.DcarelaFirebase,docs,fail:()=>{rejectCommit=true;}};
}
test('Plaza bloquea stock cero incluso forzado y dos ventas no consumen la misma unidad',async()=>{
  const b='plaza-artesanal',h=harness('admin',b);
  h.docs.set('products/product',{...h.docs.get('products/product'),stock:0});
  const data={lineas:[{productoId:'product',cantidad:1}],pagos:[{metodo:'efectivo',montoCentavos:10000}],pagoConCentavos:10000,forzarInventario:true,motivoInventario:'forzar fixture'};
  await assert.rejects(h.api.webSaleAction('sale.create',b,'admin',data,'plaza-zero'),/Registra inventario/);
  assert.equal(h.docs.has('sync_events/plaza-zero'),false);
  h.docs.set('products/product',{...h.docs.get('products/product'),stock:1});
  const result=await Promise.allSettled(['plaza-a','plaza-b'].map(id=>h.api.webSaleAction('sale.create',b,'admin',data,id)));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(h.docs.get('products/product').stock,0);
  assert.equal(h.docs.get('cash_shifts/shift').saleCount,1);
});

test('Plaza apertura y cierre conservan denominaciones y rechazan total alterado',async()=>{
  const b='plaza-artesanal',h=harness('admin',b);h.docs.delete('cash_shifts/shift');h.api.getSyncEvents=async()=>[];
  await assert.rejects(h.api.webSaleAction('shift.open',b,'admin',{montoAperturaCentavos:10000},'open-no-count'),/billetes/);
  const count=[{valorCentavos:10000,cantidad:1}];
  await assert.rejects(h.api.webSaleAction('shift.open',b,'admin',{montoAperturaCentavos:50000,conteoDenominaciones:count},'open-wrong'),/no coincide/);
  const opened=await h.api.webSaleAction('shift.open',b,'admin',{montoAperturaCentavos:10000,conteoDenominaciones:count},'open-count');
  assert.deepEqual(opened.shift.conteoDenominaciones,count);
  await assert.rejects(h.api.webSaleAction('shift.close',b,'admin',{efectivoContadoCentavos:50000,conteoDenominaciones:count},'close-wrong'),/no coincide/);
  const closed=await h.api.webSaleAction('shift.close',b,'admin',{efectivoContadoCentavos:10000,conteoDenominaciones:count},'close-count');
  assert.equal(closed.summary.diferenciaCentavos,0);assert.deepEqual(h.docs.get('sync_events/close-count').payload.conteoDenominaciones,count);
});

test('Plaza combo consume componentes y la anulacion devuelve esas mismas unidades una sola vez',async()=>{
  const b='plaza-artesanal',h=harness('admin',b);
  h.docs.set('products/product',{...h.docs.get('products/product'),stock:4});
  h.docs.set('products/combo',{business_id:b,nombre:'Combo',precioFinalCentavos:10000,usaInventario:false,inventory_mode:'components',componentes:[{productoId:'product',cantidad:2}],stock:0});
  const sale=await h.api.webSaleAction('sale.create',b,'admin',{lineas:[{productoId:'combo',cantidad:1}],pagos:[{metodo:'efectivo',montoCentavos:10000}],pagoConCentavos:10000},'combo-sale');
  assert.equal(h.docs.get('products/product').stock,2);assert.equal(h.docs.get('products/combo').stock,0);
  const cancel={ventaId:sale.sale.ventaId,motivo:'fixture',sourceEventId:'combo-sale'};
  await h.api.webSaleAction('sale.cancel',b,'admin',cancel,'combo-cancel');
  await h.api.webSaleAction('sale.cancel',b,'admin',cancel,'combo-cancel');
  assert.equal(h.docs.get('products/product').stock,4);assert.equal(h.docs.get('products/combo').stock,0);
});

test('Plaza importa sin existencias y reintentar conserva stock ingresado y excluye la central',async()=>{
  const b='plaza-artesanal',h=harness('admin',b);
  h.docs.set('catalog_snapshots/plaza-artesanal-initial-v1',{schema:1,version:'fixture',business_id:b,categories:[{id:'plaza-cat',nombre:'Fotos'}],products:[{id:'plaza-p',nombre:'Producto',categoriaId:'plaza-cat',precioFinalCentavos:100,costoCentavos:0,precioMayoreoCentavos:0,stock:99}]});
  const first=await h.api.adminAction('plaza.catalog.import',b,'admin',null,{});assert.equal(first.added,2);
  assert.equal(h.docs.get('products/plaza-p').stock,0);
  h.docs.set('products/plaza-p',{...h.docs.get('products/plaza-p'),stock:7});
  const second=await h.api.adminAction('plaza.catalog.import',b,'admin',null,{});assert.equal(second.added,0);assert.equal(h.docs.get('products/plaza-p').stock,7);
  await assert.rejects(h.api.adminAction('plaza.catalog.import','dcarela','admin',null,{}),/exclusiva/);
  await assert.rejects(h.api.adminAction('plaza.catalog.import',b,'cajero',null,{}));
});

test('conciliacion no reutiliza un evento de otra sucursal ni acepta una cuenta ajena',async()=>{
  const h=harness();
  h.api.getFinanceAccounts=async()=>[{...h.docs.get('fin_accounts/cash'),id:'cash'}];
  h.api.getFinanceJournal=async()=>[];
  const before={...h.docs.get('fin_accounts/cash')};
  h.docs.set('sync_events/ledger-foreign',{business_id:'other',created_by_uid:'user',event_type:'LedgerMovimientoRegistrado',payload:{cuentaId:'cash',metadata:{reconciliation_target:8000}}});
  await assert.rejects(h.api.adminAction('fin.account.reconcile','test','admin',null,
    {cuentaId:'cash',saldoObjetivoCentavos:8000,motivo:'Fixture',requestId:'foreign'}),/immutable-event/);
  assert.deepEqual(h.docs.get('fin_accounts/cash'),before);
  assert.equal(h.docs.has('fin_movements/foreign'),false);
  h.docs.set('fin_accounts/cash',{...before,business_id:'other'});
  await assert.rejects(h.api.adminAction('fin.account.reconcile','test','admin',null,
    {cuentaId:'cash',saldoObjetivoCentavos:8000,motivo:'Fixture',requestId:'fresh'}),/no existe/);
  assert.equal(h.docs.has('fin_movements/fresh'),false);
});

test('conciliacion usa diario, conserva evento exacto y no vuelve a aplicar un reintento',async()=>{
  const h=harness();const initial=h.docs.get('fin_accounts/cash');
  Object.assign(initial,{saldo_actual_centavos:1000,reconciled_balance_centavos:10000,reconciled_at:'2026-09-01T00:00:00Z'});
  h.api.getFinanceAccounts=async()=>[{...h.docs.get('fin_accounts/cash'),id:'cash'}];
  const rows=[{id:'sale',tipo:'ingreso',cuenta_id:'cash',monto_centavos:2000,source_timestamp:'2026-09-02T12:00:00Z',origen:'pos_venta'}];
  h.api.getFinanceJournal=async()=>rows;
  const request={cuentaId:'cash',saldoObjetivoCentavos:8000,motivo:'Conteo fixture',requestId:'reconcile-fixture'};
  const result=await h.api.adminAction('fin.account.reconcile','test','admin',null,request);
  assert.equal(result.difference,-4000);
  const account={...h.docs.get('fin_accounts/cash'),id:'cash'};
  const movement=h.docs.get('fin_movements/reconcile-fixture');
  const event=h.docs.get('sync_events/ledger-reconcile-fixture');
  assert.equal(event.payload.fechaEfectiva,account.reconciled_at);
  assert.equal(core.effectiveAccountBalance(account,[...rows,movement]),8000);
  await assert.rejects(h.api.adminAction('fin.movement.cancel','test','admin','reconcile-fixture',{motivo:'Fixture'}),/base auditada/);
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,8000);
  await h.api.adminAction('fin.account.reconcile','test','admin',null,request);
  assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,8000);
  await assert.rejects(h.api.adminAction('fin.account.reconcile','test','admin',null,{...request,saldoObjetivoCentavos:9000}),/otra conciliacion/);
});

test('conciliacion falla atomicamente y rechaza cuenta cambiada durante lectura',async()=>{
  for(const offline of [false,true]){
    const h=harness();h.api.getFinanceAccounts=async()=>[{...h.docs.get('fin_accounts/cash'),id:'cash'}];
    h.api.getFinanceJournal=async()=>{if(!offline)h.docs.set('fin_accounts/cash',{...h.docs.get('fin_accounts/cash'),saldo_actual_centavos:9000});return [];};
    if(offline)h.fail();
    await assert.rejects(h.api.adminAction('fin.account.reconcile','test','admin',null,
      {cuentaId:'cash',saldoObjetivoCentavos:8000,motivo:'Conteo fixture',requestId:'failed'}),offline?/offline/:/cambio/);
    assert.equal(h.docs.has('fin_movements/failed'),false);
    assert.equal(h.docs.has('sync_events/ledger-failed'),false);
  }
});

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

test('prestamo separa capital del resultado y actualiza deuda una sola vez',async()=>{
  const h=harness();h.docs.set('fin_commitments/loan',{business_id:'test',nombre:'Prestamo fixture',tipo:'prestamo',saldo_pendiente_centavos:120000,capital_pendiente_centavos:100000,cargos_intereses_pendientes_centavos:20000,cuotas_pagadas:0,cuotas_totales:12,cuota_actual:1});
  const pay={requestId:'loan-pay',cuentaId:'bank',montoCentavos:12000,capitalCentavos:10000,interesCentavos:1500,cargosCentavos:500,fecha:'2026-09-09'};
  await h.api.adminAction('fin.commitment.payment','test','admin','loan',pay);
  await h.api.adminAction('fin.commitment.payment','test','admin','loan',pay);
  assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,51410);
  const loan=h.docs.get('fin_commitments/loan');
  assert.equal(loan.saldo_pendiente_centavos,108000);assert.equal(loan.capital_pendiente_centavos,90000);assert.equal(loan.cargos_intereses_pendientes_centavos,18000);assert.equal(loan.cuotas_pagadas,1);
  const movements=[...h.docs.entries()].filter(([k])=>k.startsWith('fin_movements/')).map(([,v])=>v);
  assert.equal(movements.reduce((s,m)=>s+m.monto_centavos,0),12000);
  assert.equal(core.summarizeMovements(movements).gastos_centavos,2000);
});

test('prestamo exige desglose exacto y no deja datos parciales si falla el commit',async()=>{
  const h=harness();h.docs.set('fin_commitments/loan',{business_id:'test',tipo:'prestamo',saldo_pendiente_centavos:100000,capital_pendiente_centavos:90000,cargos_intereses_pendientes_centavos:10000});
  const pay={requestId:'loan-pay',cuentaId:'bank',montoCentavos:2000,capitalCentavos:0,interesCentavos:2000};
  await assert.rejects(h.api.adminAction('fin.commitment.payment','test','admin','loan',{...pay,capitalCentavos:null}),/Indica el capital/);
  await assert.rejects(h.api.adminAction('fin.commitment.payment','test','admin','loan',{...pay,interesCentavos:1000}),/exactamente/);
  h.fail();await assert.rejects(h.api.adminAction('fin.commitment.payment','test','admin','loan',pay),/offline/);
  assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,63410);assert.equal(h.docs.get('fin_commitments/loan').saldo_pendiente_centavos,100000);
  assert.equal(h.docs.has('fin_commitment_payments/loan-pay'),false);
});

test('compra a cuotas sin intereses se paga con los tres campos en cero',()=>{
 // El motor de PION: tipo prestamo, sin capital ni cargos guardados. Antes esto
 // lanzaba "deben sumar exactamente el pago" y la cuota no se podia registrar.
 const pion={tipo:'prestamo',nombre:'Prestamo PION (motor)',saldo_pendiente_centavos:6663900,capital_pendiente_centavos:null,cargos_intereses_pendientes_centavos:null,cuotas_pagadas:2,cuota_actual:3};
 const plan=core.planCommitmentPayment(pion,{montoCentavos:700000,capitalCentavos:0,interesCentavos:0,cargosCentavos:0,cuotasAplicadas:1});
 assert.equal(plan.capital,700000);assert.equal(plan.interest,0);assert.equal(plan.charges,0);
 assert.equal(plan.patch.saldo_pendiente_centavos,5963900);
 assert.equal('capital_pendiente_centavos' in plan.patch,false);
 assert.equal(plan.patch.cuotas_pagadas,3);assert.equal(plan.patch.cuota_actual,4);
 assert.equal(plan.mainAmount,700000);assert.equal(plan.mainAffectsResult,false);assert.equal(plan.expenseAmount,0);
 // Dejarlo todo en blanco vale igual que dejarlo en cero.
 assert.equal(core.planCommitmentPayment(pion,{montoCentavos:700000}).capital,700000);
 // Pero declarar un interes sigue obligando al desglose completo.
 assert.throws(()=>core.planCommitmentPayment(pion,{montoCentavos:700000,interesCentavos:5000}),/Indica el capital/);
 assert.throws(()=>core.planCommitmentPayment(pion,{montoCentavos:700000,capitalCentavos:600000,interesCentavos:5000}),/exactamente/);
});

test('pago solo de intereses conserva capital y saldos desconocidos',()=>{
 const plan=core.planCommitmentPayment({tipo:'prestamo',capital_pendiente_centavos:90000},{montoCentavos:2000,capitalCentavos:0,interesCentavos:2000});
 assert.equal(plan.patch.capital_pendiente_centavos,90000);assert.equal('saldo_pendiente_centavos' in plan.patch,false);assert.equal(plan.mainAffectsResult,true);assert.equal(plan.expenseAmount,0);
 assert.throws(()=>core.planCommitmentPayment({tipo:'prestamo',saldo_pendiente_centavos:1000},{montoCentavos:2000,capitalCentavos:2000}),/supera/);
});

const loanFixture=()=>{
 const h=harness();h.docs.set('fin_commitments/loan',{business_id:'test',nombre:'Prestamo fixture',tipo:'prestamo',saldo_pendiente_centavos:120000,capital_pendiente_centavos:100000,cargos_intereses_pendientes_centavos:20000,cuotas_pagadas:0,cuota_actual:1,cuotas_totales:12,proximo_vencimiento:'2026-09-20'});return h;
};
const loanPay={requestId:'loan-pay',cuentaId:'bank',montoCentavos:12000,capitalCentavos:10000,interesCentavos:1500,cargosCentavos:500,fecha:'2026-09-09'};
test('anular desde una parte revierte el pago entero; reintento y restauracion conservan cuenta y contrato',async()=>{
 const h=loanFixture();await h.api.adminAction('fin.commitment.payment','test','admin','loan',loanPay);
 const cancel={motivo:'Fixture',requestId:'cancel-loan'};
 await h.api.adminAction('fin.movement.cancel','test','admin','commitment-payment-loan-pay-finance-charge',cancel);
 await h.api.adminAction('fin.commitment.payment.cancel','test','admin','loan-pay',cancel);
 assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,63410);
 assert.equal(h.docs.get('fin_commitments/loan').saldo_pendiente_centavos,120000);
 assert.equal(h.docs.get('fin_commitments/loan').capital_pendiente_centavos,100000);
 assert.equal(h.docs.get('fin_commitments/loan').cuotas_pagadas,0);
 const rows=()=>[...h.docs.entries()].filter(([k])=>k.startsWith('fin_movements/')).map(([,v])=>v);
 assert.equal(rows().filter(r=>r.estado==='anulado').length,2);assert.equal(core.summarizeMovements(rows()).gastos_centavos,0);
 await h.api.adminAction('fin.movement.restore','test','admin','commitment-payment-loan-pay',{motivo:'Fixture',requestId:'restore-loan'});
 assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,51410);
 assert.equal(h.docs.get('fin_commitments/loan').saldo_pendiente_centavos,108000);
 assert.equal(core.summarizeMovements(rows()).gastos_centavos,2000);
});
test('anulacion de pago anterior conserva otro pago posterior y exige revisar calendario',async()=>{
 const h=loanFixture();await h.api.adminAction('fin.commitment.payment','test','admin','loan',loanPay);
 await h.api.adminAction('fin.commitment.payment','test','admin','loan',{...loanPay,requestId:'later',proximoVencimiento:'2026-10-20'});
 await h.api.adminAction('fin.commitment.payment.cancel','test','admin','loan-pay',{motivo:'Fixture'});
 const c=h.docs.get('fin_commitments/loan');assert.equal(c.saldo_pendiente_centavos,108000);assert.equal(c.cuotas_pagadas,1);
 assert.equal(c.proximo_vencimiento,'2026-10-20');assert.equal(c.schedule_review_required,true);
 assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,51410);
});
test('fallo de reversa no deja pagos, asientos ni saldos parciales',async()=>{
 const h=loanFixture();await h.api.adminAction('fin.commitment.payment','test','admin','loan',loanPay);
 const before=JSON.stringify([...h.docs]);h.fail();
 await assert.rejects(h.api.adminAction('fin.commitment.payment.cancel','test','admin','loan-pay',{motivo:'Fixture'}),/offline/);
 assert.equal(JSON.stringify([...h.docs]),before);
});
test('pago historico o incluido en cuadre no se revierte parcialmente',async()=>{
 const h=loanFixture();await h.api.adminAction('fin.commitment.payment','test','admin','loan',loanPay);
 h.docs.get('fin_accounts/bank').reconciled_at='2026-09-10T03:59:59.999Z';
 await assert.rejects(h.api.adminAction('fin.commitment.payment.cancel','test','admin','loan-pay',{motivo:'Fixture'}),/cuadre/);
 delete h.docs.get('fin_accounts/bank').reconciled_at;delete h.docs.get('fin_commitment_payments/loan-pay').accounting_version;
 await assert.rejects(h.api.adminAction('fin.movement.cancel','test','admin','commitment-payment-loan-pay',{motivo:'Fixture'}),/historico/);
 assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,51410);
});

test('dos anulaciones concurrentes desde partes distintas generan una sola reversa',async()=>{
 const h=loanFixture();await h.api.adminAction('fin.commitment.payment','test','admin','loan',loanPay);
 await Promise.all(['commitment-payment-loan-pay','commitment-payment-loan-pay-finance-charge'].map((id,i)=>
  h.api.adminAction('fin.movement.cancel','test','admin',id,{motivo:'Fixture',requestId:'parallel-'+i})));
 assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,63410);
 assert.equal(h.docs.get('fin_commitments/loan').cuotas_pagadas,0);
 assert.equal([...h.docs.keys()].filter(k=>k.startsWith('sync_events/ledger-payment-state-')).length,2);
});
test('pago nuevo concurrente con anulacion conserva exactamente el pago nuevo',async()=>{
 const h=loanFixture();await h.api.adminAction('fin.commitment.payment','test','admin','loan',loanPay);
 await Promise.all([
  h.api.adminAction('fin.commitment.payment.cancel','test','admin','loan-pay',{motivo:'Fixture'}),
  h.api.adminAction('fin.commitment.payment','test','admin','loan',{...loanPay,requestId:'new-pay'})
 ]);
 assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,51410);
 assert.equal(h.docs.get('fin_commitments/loan').saldo_pendiente_centavos,108000);
 assert.equal(h.docs.get('fin_commitments/loan').cuotas_pagadas,1);
});

test('abono extra de capital admite cero cuotas y no altera el contador de cuotas',()=>{
 const p=core.planCommitmentPayment({tipo:'prestamo',saldo_pendiente_centavos:20000,capital_pendiente_centavos:20000,cuotas_pagadas:3,cuota_actual:4},
  {montoCentavos:1000,capitalCentavos:1000,cuotasAplicadas:0});
 assert.equal(p.patch.cuotas_pagadas,3);assert.equal(p.patch.cuota_actual,4);assert.equal(p.patch.capital_pendiente_centavos,19000);
 assert.equal(p.mainAffectsResult,false);
});
