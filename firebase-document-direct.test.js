'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/firebase-adapter.js','utf8');
function harness(fetch,base){const auth={currentUser:{uid:'owner',getIdToken:async()=> 'fixture-token'}};const query={where(){return this;},orderBy(){return this;},limit(){return this;},startAfter(){throw Error('SDK cursor used');},get(){throw Error('streaming used');}};const db={settings:()=>{},collection:()=>query};
const window={DCARELA_NUBE_URL:base,__DCARELA_FIREBASE_CONFIG:{projectId:'fixture-project'}};vm.runInNewContext(source,{window,fetch,AbortController,setTimeout,clearTimeout,console,firebase:{apps:[{}],initializeApp:()=>({}),app:()=>({}),auth:()=>auth,firestore:()=>db}});return {api:window.DcarelaFirebase,auth};}
test('validación puntual usa identidad del usuario y conserva tipos sin esperar al canal persistente',async()=>{
 const h=harness(async (url,options)=>{assert.equal(url,'https://firestore.googleapis.com/v1/projects/fixture-project/databases/(default)/documents/business_members/owner');assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.equal(options.redirect,'error');return {ok:true,status:200,json:async()=>({fields:{active:{booleanValue:true},business_ids:{arrayValue:{values:[{stringValue:'dcarela'}]}},amount:{integerValue:'365079'}}})};});
 const r=await h.api.getDocument('business_members','owner');assert.equal(r.active,true);assert.equal(r.business_ids[0],'dcarela');assert.equal(r.amount,365079);
});
test('permisos revocados no usan caché ni otro transporte para conceder acceso',async()=>{
 const h=harness(async()=>({ok:false,status:403}));await assert.rejects(()=>h.api.getDocument('business_members','owner'),{code:'permission-denied'});
});
test('nube local dirige la consulta puntual y las acciones al mismo origen sin consultar Google',async()=>{
 const seen=[],base='https://fixture-cloud.example';const h=harness(async(url,options)=>{seen.push({url,options});return {ok:true,status:200,json:async()=>url.includes('/firestore/')?{fields:{active:{booleanValue:true}}}:{ok:true}};},base);
 await h.api.getDocument('business_members','owner');await h.api.assistantRequest({action:'whoami'});
 assert.equal(seen[0].url,base+'/firestore/v1/projects/fixture-project/databases/(default)/documents/business_members/owner');assert.equal(seen[1].url,base+'/functions/crmApi');
 assert.ok(seen.every(x=>x.options.headers.Authorization==='Bearer fixture-token'));
});
test('respuesta de una sesión anterior no se entrega al siguiente usuario',async()=>{
 let finish,begin;const started=new Promise(r=>begin=r);const h=harness(()=>{begin();return new Promise(r=>finish=r);});const p=h.api.getDocument('business_members','owner');await started;h.auth.currentUser={uid:'other'};finish({ok:true,status:200,json:async()=>({fields:{active:{booleanValue:true}}})});await assert.rejects(()=>p,{code:'unauthenticated'});
});

const fiscalBase='https://fixture-cloud.example';
const fiscalPath='projects/fixture-project/databases/(default)/documents/facturador_ventas/';
const fiscalFilters=[['business_id','==','dcarela']];
const fiscalPage=(start,end)=>Array.from({length:end-start+1},(_,i)=>({
 document:{name:fiscalPath+String(start+i).padStart(4,'0'),
 fields:{business_id:{stringValue:'dcarela'},total_centavos:{integerValue:'11800'}}},
}));
test('Facturador local agota la lectura por nombre y conserva el filtro de sucursal en cada página',async()=>{
 let calls=0;
 const {api}=harness(async(url,options)=>{
  assert.equal(url,fiscalBase+'/firestore/v1/projects/fixture-project/databases/(default)/documents:runQuery');
  const q=JSON.parse(options.body).structuredQuery;
  assert.equal(q.limit,1000);
  assert.equal(q.from[0].collectionId,'facturador_ventas');
  assert.deepEqual(q.where,{fieldFilter:{field:{fieldPath:'business_id'},op:'EQUAL',value:{stringValue:'dcarela'}}});
  assert.deepEqual(q.orderBy,[{field:{fieldPath:'__name__'},direction:'ASCENDING'}]);
  const first=++calls===1;
  assert.deepEqual(q.startAt,first?undefined:{before:false,values:[{referenceValue:fiscalPath+'1000'}]});
  return {ok:true,status:200,json:async()=>first?fiscalPage(1,1000):fiscalPage(1001,1002)};
 },fiscalBase);
 const rows=await api.getCollection('facturador_ventas',fiscalFilters,{complete:true});
 assert.equal(calls,2);
 assert.equal(rows.length,1002);
 assert.equal(rows[1001].id,'1002');
 assert.equal(rows.reduce((sum,row)=>sum+row.total_centavos,0),11823600);
});
test('Facturador local rechaza una página fallida o repetida sin devolver totales parciales',async()=>{
 for(const repeated of [false,true]){
  let calls=0;
  const {api}=harness(async()=>{
   if(++calls===2&&!repeated)return {ok:false,status:503,json:async()=>({error:{status:'UNAVAILABLE'}})};
   return {ok:true,status:200,json:async()=>fiscalPage(1,1000)};
  },fiscalBase);
  await assert.rejects(api.getCollection('facturador_ventas',fiscalFilters,{complete:true}),
   repeated?/cursor repetido/:{code:'unavailable'});
  assert.equal(calls,2);
 }
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
