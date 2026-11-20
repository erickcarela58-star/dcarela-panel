// Thin browser transport. No data database, credential or model is bundled with the app.
export const BASE=()=>String(globalThis.DCARELA_NUBE_URL||globalThis.CRM_CONFIG?.localCloudBase||'https://dcarela-api.dcarela-compufoto.workers.dev').replace(/\/$/,'');
const SESSION='dcarela_nube_session_v1',DEVICE='dcarela_nube_device_v1';
const listeners=new Set();let pendingRefresh,authReady,session;
try{session=JSON.parse(localStorage.getItem(SESSION)||'null');}catch{session=null;}
export const auth={currentUser:null};
function device(){let key=localStorage.getItem(DEVICE);if(!key){key=crypto.randomUUID().replaceAll('-','');localStorage.setItem(DEVICE,key);}return key;}
function user(value){
  if(!value)return null;
  return {...value,getIdToken:force=>idToken(force),getIdTokenResult:async force=>{
    const token=await idToken(force),encoded=token.split('.')[1].replaceAll('-','+').replaceAll('_','/');
    return {token,claims:JSON.parse(atob(encoded))};
  }};
}
function save(value){session=value?{...value,expiresAt:Date.now()+Number(value.expiresIn||3600)*1000}:null;if(session)localStorage.setItem(SESSION,JSON.stringify(session));else localStorage.removeItem(SESSION);auth.currentUser=user(session?.user);for(const callback of listeners)queueMicrotask(()=>callback(auth.currentUser));}
export async function rawApi(path,body,token){
  const response=await fetch(BASE()+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store'});
  let result;try{result=await response.json();}catch{throw Object.assign(new Error('El servidor local no esta disponible'),{code:'unavailable'});}
  if(!response.ok)throw Object.assign(new Error(result.error||'No se completo la operacion'),{code:result.code||String(response.status),status:response.status});return result;
}
async function migrateLegacy(){
  const config=globalThis.__DCARELA_FIREBASE_CONFIG;if(!config?.apiKey||!config.projectId)return;
  try{
    // One transition only. Existing Firebase sessions are exchanged without asking for a password.
    // A separate legacy SDK version avoids the import-map routes of the local adapter.
    const appSdk=await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
    const authSdk=await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
    const app=appSdk.getApps().find(a=>a.options.projectId===config.projectId)||appSdk.initializeApp(config),old=authSdk.getAuth(app);
    await old.authStateReady();if(old.currentUser){const token=await old.currentUser.getIdToken();save(await rawApi('/v1/auth/exchange',{idToken:token,deviceKey:device()}));}
  }catch{/* The login form stays available; no existing session is erased. */}
}
export function ready(){if(!authReady)authReady=(async()=>{if(session){auth.currentUser=user(session.user);try{await idToken();}catch(error){if(error.status===401)save(null);}}else await migrateLegacy();return auth.currentUser;})();return authReady;}
export async function idToken(force=false){
  if(!session)throw Object.assign(new Error('Sesion requerida'),{code:'auth/user-signed-out'});
  if(!force&&session.expiresAt>Date.now()+60000)return session.idToken;
  if(!pendingRefresh)pendingRefresh=(async()=>{
    const refresh=async()=>{let latest;try{latest=JSON.parse(localStorage.getItem(SESSION));}catch{}if(latest?.refreshToken)session=latest;if(!force&&session.expiresAt>Date.now()+60000)return session.idToken;save(await rawApi('/v1/auth/refresh',{refreshToken:session.refreshToken}));return session.idToken;};
    return navigator.locks? navigator.locks.request('dcarela_nube_refresh',refresh):refresh();
  })().finally(()=>{pendingRefresh=null;});return pendingRefresh;
}
export async function api(path,body){await ready();return rawApi(path,body,await idToken());}
export function onAuth(callback,error){listeners.add(callback);ready().then(()=>callback(auth.currentUser)).catch(e=>error?.(e));return()=>listeners.delete(callback);}
export async function login(email,password){save(await rawApi('/v1/auth/login',{email,password,deviceKey:device()}));authReady=Promise.resolve(auth.currentUser);return {user:auth.currentUser};}
export async function logout(){try{if(session)await rawApi('/v1/auth/logout',{},await idToken());}finally{save(null);}}
globalThis.addEventListener?.('storage',event=>{if(event.key===SESSION){try{session=JSON.parse(event.newValue);}catch{session=null;}auth.currentUser=user(session?.user);for(const callback of listeners)callback(auth.currentUser);}});
export class Timestamp{constructor(seconds,nanoseconds){this.seconds=seconds;this.nanoseconds=nanoseconds;}static now(){return this.fromMillis(Date.now());}static fromMillis(ms){return new Timestamp(Math.floor(ms/1000),Math.floor((ms%1000)*1e6));}static fromDate(date){return this.fromMillis(date.getTime());}toMillis(){return this.seconds*1000+this.nanoseconds/1e6;}toDate(){return new Date(this.toMillis());}toJSON(){return {seconds:this.seconds,nanoseconds:this.nanoseconds};}isEqual(t){return t?.seconds===this.seconds&&t?.nanoseconds===this.nanoseconds;}}
export function encode(value){
  if(value===null)return {nullValue:null};if(typeof value==='string')return {stringValue:value};if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:Number.isFinite(value)?value:String(value)};
  if(value?.__dcarelaTransform)return {localTransform:{kind:value.__dcarelaTransform,values:(value.values||[]).map(encode)}};
  if(value instanceof Date)return {timestampValue:value.toISOString()};if(value instanceof Timestamp)return {timestampValue:new Date(value.seconds*1000).toISOString().slice(0,19)+'.'+String(value.nanoseconds).padStart(9,'0')+'Z'};
  if(value?.path&&value.type==='document')return {referenceValue:'projects/erikccarela/databases/(default)/documents/'+value.path};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
  if(value&&typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
  throw new TypeError('Dato no admitido');
}
export function decode(raw){
  if(!raw)return undefined;if('nullValue'in raw)return null;if('stringValue'in raw)return raw.stringValue;if('booleanValue'in raw)return raw.booleanValue;
  if('integerValue'in raw){const n=Number(raw.integerValue);return Number.isSafeInteger(n)?n:raw.integerValue;}if('doubleValue'in raw)return Number(raw.doubleValue);
  if('timestampValue'in raw){const s=raw.timestampValue,m=s.match(/\.(\d{1,9})Z$/);return new Timestamp(Math.floor(Date.parse(s)/1000),Number((m?.[1]||'').padEnd(9,'0')));}
  if('bytesValue'in raw)return Uint8Array.from(atob(raw.bytesValue),c=>c.charCodeAt(0));if('referenceValue'in raw)return docRef(raw.referenceValue.split('/documents/')[1]);
  if('arrayValue'in raw)return (raw.arrayValue.values||[]).map(decode);if('mapValue'in raw)return Object.fromEntries(Object.entries(raw.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));if('geoPointValue'in raw)return raw.geoPointValue;throw new TypeError('Dato remoto no admitido');
}
export const db={type:'firestore',app:{options:{projectId:'erikccarela'}}};
export function docRef(path){return {type:'document',path,id:path.split('/').at(-1),firestore:db};}
export function collectionRef(path){return {type:'collection',path,id:path.split('/').at(-1),firestore:db,constraints:[]};}
export function snapshot(data){const ref=docRef(data.path),exists=!!data.exists;return {id:ref.id,ref,exists:()=>exists,data:()=>exists?decode({mapValue:{fields:data.fields}}):undefined,get:field=>field.split('.').reduce((v,k)=>v?.[k],exists?decode({mapValue:{fields:data.fields}}):undefined),metadata:{fromCache:false,hasPendingWrites:false},_wire:data};}
export function querySnapshot(data,previous){const docs=(data.documents||[]).map(snapshot),old=new Map((previous?.docs||[]).map((d,i)=>[d.id,{d,i}]));return {docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false,hasPendingWrites:false},forEach:fn=>docs.forEach(fn),docChanges:()=>{
  const changes=[];docs.forEach((d,i)=>{const was=old.get(d.id);if(!was)changes.push({type:'added',doc:d,oldIndex:-1,newIndex:i});else if(JSON.stringify(was.d._wire)!==JSON.stringify(d._wire))changes.push({type:'modified',doc:d,oldIndex:was.i,newIndex:i});old.delete(d.id);});for(const {d,i} of old.values())changes.push({type:'removed',doc:d,oldIndex:i,newIndex:-1});return changes;
}};}
export function queryBody(ref){
  const body={collection:ref.path,filters:[],orderBy:[]};
  for(const c of ref.constraints||[]){if(c.type==='where')body.filters.push({field:c.field,op:c.op,value:encode(c.value)});else if(c.type==='orderBy')body.orderBy.push({field:c.field,direction:c.direction});else if(c.type==='limit')body.limit=c.n;else if(!['startAfter','startAt','endAt','endBefore'].includes(c.type))throw new Error('Consulta no admitida');}
  for(const c of ref.constraints||[]){if(!['startAfter','startAt','endAt','endBefore'].includes(c.type))continue;
    if(c.values.length===1&&c.values[0]?._wire){
      const snap=c.values[0];if(!body.orderBy.some(o=>o.field==='__name__'))body.orderBy.push({field:'__name__',direction:body.orderBy.at(-1)?.direction||'asc'});
      body[c.type]=body.orderBy.map(o=>encode(o.field==='__name__'?snap.ref:snap.get(o.field)));
    }else body[c.type]=c.values.map(encode);
  }return body;
}
const watches=new Map();let watchTimer,busy=false;
export function watch(ref,next,error){const id=crypto.randomUUID();watches.set(id,{ref,next,error,hash:null,previous:null});if(!watchTimer){watchTimer=setInterval(poll,5000);}void poll();return()=>{watches.delete(id);if(!watches.size){clearInterval(watchTimer);watchTimer=null;}};}
async function poll(){if(busy||!watches.size)return;busy=true;try{
  const all=[...watches];for(let i=0;i<all.length;i+=12){const group=all.slice(i,i+12),result=await api('/v1/client/poll',{queries:group.map(([id,w])=>({id,hash:w.hash,...(w.ref.type==='document'?{path:w.ref.path}:queryBody(w.ref))}))});
    for(const r of result.results){const w=watches.get(r.id);if(!w)continue;if(r.error){w.error?.(Object.assign(new Error(r.error),{code:String(r.status)}));continue;}w.hash=r.hash;if(r.unchanged)continue;const snap=w.ref.type==='document'?snapshot(r.value):querySnapshot(r.value,w.previous);w.previous=snap;w.next(snap);}
  }
}catch(e){for(const w of watches.values())w.error?.(e);}finally{busy=false;}}
