const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function harness(read) {
  let now = Date.now();
  const user = {uid:'admin-a'};
  const calls = [];
  function query(name, conditions = []) {
    return {where:(...condition)=>query(name,[...conditions,condition]),
      doc:id=>query(name, [id]),
      orderBy:(...order)=>query(name,[...conditions,['orderBy',...order]]),
      limit:value=>query(name,[...conditions,['limit',value]]),
      async get(){ calls.push({name,conditions}); return read(name,conditions); }};
  }
  const auth = {currentUser:user};
  const db = {collection:query, enablePersistence:async()=>{}};
  const firebase = {apps:[], initializeApp:()=>({}), auth:()=>auth, firestore:()=>db};
  const window = {__DCARELA_FIREBASE_CONFIG:{projectId:'test'}};
  const clock = class extends Date {static now(){return now;}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/firebase-adapter.js','utf8'),
    {window,firebase,console,Date:clock,Map,Promise,Error});
  return {api:window.DcarelaFirebase,calls,auth,advance:ms=>{now+=ms;}};
}
const snapshot = rows => ({docs:rows.map(row=>({id:row.id,data:()=>({...row})}))});

test('consultas simultáneas comparten una lectura sin recortar ni cachear saldos', async()=>{
  const rows = Array.from({length:1700},(_,i)=>({id:String(i),monto_centavos:125+i}));
  const h = harness(async()=>snapshot(rows));
  const result = await Promise.all([h.api.getClients('dcarela'),h.api.getClients('dcarela')]);
  assert.equal(h.calls.length,1);
  assert.equal(result[0].length,1700);
  result[0].pop();
  assert.equal(result[1].length,1700);
  await h.api.getClients('dcarela');
  assert.equal(h.calls.length,2,'una nueva consulta debe reflejar cambios remotos');
});

test('la deduplicación separa sucursales y usuarios',async()=>{
  const h=harness(async()=>snapshot([]));
  const first=h.api.getClients('dcarela');
  h.auth.currentUser={uid:'admin-b'};
  await Promise.all([first,h.api.getClients('dcarela'),h.api.getClients('local2')]);
  assert.equal(h.calls.length,3);
});

test('429 pausa consultas posteriores y permite recuperar sin borrar datos',async()=>{
  let quota=true;
  const h=harness(async()=>{if(quota)throw Object.assign(new Error('Quota exceeded'),{code:'resource-exhausted'});return snapshot([{id:'real'}]);});
  await assert.rejects(h.api.getClients(),{code:'resource-exhausted'});
  await assert.rejects(h.api.getProducts(),{code:'resource-exhausted'});
  assert.equal(h.calls.length,1);
  quota=false;
  h.advance(15*60*1000);
  assert.equal((await h.api.getClients())[0].id,'real');
  assert.equal(h.calls.length,2);
});

test('un permiso denegado no bloquea otras consultas ni se convierte en lista vacía',async()=>{
  const h=harness(async name=>{if(name==='clients')throw Object.assign(new Error('denied'),{code:'permission-denied'});return snapshot([]);});
  await assert.rejects(h.api.getClients(),{code:'permission-denied'});
  await h.api.getProducts();
  assert.equal(h.calls.length,2);
});

test('finanzas informa consulta parcial o fallo total, nunca saldo cero ficticio',async()=>{
  const h=harness(async name=>{if(name==='fin_movements')throw new Error('offline');return snapshot([{id:'ledger',payload:{ledgerId:'l1',importeDopCentavos:325,fechaEfectiva:'2026-08-26'}}]);});
  const rows=await h.api.getFinanceMovements();
  assert.equal(rows.length,1);
  assert.match(rows.partial_error,/financiera web/);
  const failed=harness(async()=>{throw new Error('offline');});
  await assert.rejects(failed.api.getFinanceMovements(),/offline/);
});

test('finanzas no duplica una conciliacion materializada y su evento del ledger',async()=>{
  const h=harness(async name=>{
    if(name==='fin_movements') return snapshot([{
      id:'fin-recon-20260827-comida',tipo:'gasto',monto_centavos:50000,fecha:'2026-08-27',descripcion:'Comida materializada'
    }]);
    if(name==='sync_events') return snapshot([{
      id:'ledger-event',event_id:'ledger-event',event_type:'LedgerMovimientoRegistrado',business_id:'dcarela',
      payload:{ledgerId:'sync-ledger-recon-20260827-comida',tipo:'GASTO',importeDopCentavos:50000,fechaEfectiva:'2026-08-27'}
    }]);
    return snapshot([]);
  });
  const rows=await h.api.getFinanceMovements();
  assert.equal(rows.length,1);
  assert.equal(rows[0].descripcion,'Comida materializada');
});

test('un rango contable incluye ventas archivadas y ventas recibidas tarde',async()=>{
  const lateAugust={id:'late-aug',event_id:'late-aug',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-09-01T05:00:00.000Z',payload:{vendidaEn:'2026-08-31T18:00:00.000Z',totalCobradoCentavos:12500}};
  const september={id:'sep',event_id:'sep',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-09-01T14:00:00.000Z',payload:{vendidaEn:'2026-09-01T14:00:00.000Z',totalCobradoCentavos:30000}};
  const archived={id:'archive-1',event_id:'archive-1',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-08-05T16:00:00.000Z',payload:{vendidaEn:'2026-08-05T15:00:00.000Z',totalCobradoCentavos:7000}};
  const h=harness(async name=>{
    if(name==='sync_events') return snapshot([lateAugust,september]);
    if(name==='sync_event_archives') return snapshot([{id:'chunk',business_id:'dcarela',events:[archived]}]);
    return snapshot([]);
  });
  const rows=await h.api.getSyncEvents('dcarela',{
    from:'2026-08-01T04:00:00.000Z',to:'2026-09-01T03:59:59.999Z',limit:5000,includeArchives:true
  });
  assert.deepEqual([...rows.map(item=>item.event_id)].sort(),['archive-1','late-aug']);
  const currentCalls=h.calls.filter(call=>call.name==='sync_events');
  assert.ok(currentCalls.length>=1);
  assert.equal(currentCalls.some(call=>call.conditions.some(condition=>
    Array.isArray(condition)&&condition[0]==='received_at_cloud')),false,
  'la fecha de recepcion no debe recortar un periodo contable');
});
