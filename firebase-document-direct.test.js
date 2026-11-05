'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/firebase-adapter.js','utf8');
function harness(fetch){const auth={currentUser:{uid:'owner',getIdToken:async()=> 'fixture-token'}};const query={where(){return this;},orderBy(){return this;},limit(){return this;},startAfter(){throw Error('SDK cursor used');},get(){throw Error('streaming used');}};const db={settings:()=>{},collection:()=>query};
const window={__DCARELA_FIREBASE_CONFIG:{projectId:'fixture-project'}};vm.runInNewContext(source,{window,fetch,AbortController,setTimeout,clearTimeout,console,firebase:{apps:[{}],initializeApp:()=>({}),app:()=>({}),auth:()=>auth,firestore:()=>db}});return {api:window.DcarelaFirebase,auth};}
test('validación puntual usa identidad del usuario y conserva tipos sin esperar al canal persistente',async()=>{
 const h=harness(async (url,options)=>{assert.equal(url,'https://firestore.googleapis.com/v1/projects/fixture-project/databases/(default)/documents/business_members/owner');assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.equal(options.redirect,'error');return {ok:true,status:200,json:async()=>({fields:{active:{booleanValue:true},business_ids:{arrayValue:{values:[{stringValue:'dcarela'}]}},amount:{integerValue:'365079'}}})};});
 const r=await h.api.getDocument('business_members','owner');assert.equal(r.active,true);assert.equal(r.business_ids[0],'dcarela');assert.equal(r.amount,365079);
});
test('permisos revocados no usan caché ni otro transporte para conceder acceso',async()=>{
 const h=harness(async()=>({ok:false,status:403}));await assert.rejects(()=>h.api.getDocument('business_members','owner'),{code:'permission-denied'});
});
test('respuesta de una sesión anterior no se entrega al siguiente usuario',async()=>{
 let finish,begin;const started=new Promise(r=>begin=r);const h=harness(()=>{begin();return new Promise(r=>finish=r);});const p=h.api.getDocument('business_members','owner');await started;h.auth.currentUser={uid:'other'};finish({ok:true,status:200,json:async()=>({fields:{active:{booleanValue:true}}})});await assert.rejects(()=>p,{code:'unauthenticated'});
});

const document=(id)=>({name:'projects/fixture-project/databases/(default)/documents/sync_events/'+id,fields:{event_id:{stringValue:id},business_id:{stringValue:'dcarela'},event_type:{stringValue:'LedgerMovimientoRegistrado'},received_at_cloud:{stringValue:'2026-11-05T12:00:00Z'}}});
test('consulta financiera directa pagina completa, conserva sucursal y no pierde eventos empatados en fecha',async()=>{
 let pages=0;const queries=[];const h=harness(async(url,options)=>{assert.ok(url.endsWith('/documents:runQuery'));const q=JSON.parse(options.body).structuredQuery;queries.push(q);if(q.from[0].collectionId==='sync_event_archives')return {ok:true,status:200,json:async()=>[]};
  pages++;if(pages===1)return {ok:true,status:200,json:async()=>Array.from({length:5000},(_,i)=>({document:document('event-'+String(5000-i).padStart(4,'0'))}))};
  assert.equal(q.startAt.before,false);assert.equal(q.startAt.values[1].referenceValue,document('event-0001').name);return {ok:true,status:200,json:async()=>[{document:document('last')}]};});
 const rows=await h.api.getSyncEvents('dcarela',{complete:true,includeArchives:true,from:'2026-11-01',eventTypes:['LedgerMovimientoRegistrado']});assert.equal(rows.length,5001);assert.equal(pages,2);
 for(const q of queries){const filters=q.where.compositeFilter?.filters||[q.where];assert.ok(filters.some(f=>f.fieldFilter?.field.fieldPath==='business_id'&&f.fieldFilter.value.stringValue==='dcarela'));if(q.from[0].collectionId==='sync_event_archives')assert.equal(q.orderBy[0].field.fieldPath,'events_to','normalización de la desigualdad como en el SDK');}
});
test('una falla en el archivo no se presenta como diario completo ni saldo cero',async()=>{
 const h=harness(async(_url,options)=>JSON.parse(options.body).structuredQuery.from[0].collectionId==='sync_event_archives'?{ok:false,status:503,json:async()=>({error:{status:'UNAVAILABLE'}})}:{ok:true,status:200,json:async()=>[]});
 await assert.rejects(()=>h.api.getSyncEvents('dcarela',{complete:true,includeArchives:true,from:'2026-11-01'}),{code:'unavailable'});
});
test('un índice no listo reintenta sin tipos y conserva sucursal y límite',async()=>{
 let calls=0;const h=harness(async(_url,options)=>{const q=JSON.parse(options.body).structuredQuery;const filters=q.where.compositeFilter?.filters||[q.where];calls++;
  if(filters.some(f=>f.fieldFilter?.field.fieldPath==='event_type'))return {ok:false,status:400,json:async()=>[{error:{status:'FAILED_PRECONDITION'}}]};
  if(q.from[0].collectionId==='sync_events')assert.equal(q.limit,5000);assert.ok(filters.some(f=>f.fieldFilter?.field.fieldPath==='business_id'));return {ok:true,status:200,json:async()=>[]};});
 const rows=await h.api.getSyncEvents('dcarela',{complete:true,includeArchives:false,eventTypes:['LedgerMovimientoRegistrado']});assert.equal(rows.length,0);assert.ok(calls>=2);
});
