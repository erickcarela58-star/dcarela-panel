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
