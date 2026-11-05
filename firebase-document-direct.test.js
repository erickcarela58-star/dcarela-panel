'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/firebase-adapter.js','utf8');
function harness(fetch){const auth={currentUser:{uid:'owner',getIdToken:async()=> 'fixture-token'}};const db={settings:()=>{},collection:()=>{throw Error('streaming used');}};
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

