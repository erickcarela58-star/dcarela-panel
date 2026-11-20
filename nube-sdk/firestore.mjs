import {api,db,docRef,collectionRef,snapshot,querySnapshot,queryBody,watch,encode,Timestamp} from './core.mjs';
export {Timestamp};
export const getFirestore=()=>db;
export const initializeFirestore=()=>db;
export const doc=(base,...parts)=>docRef((base?.path?[base.path,...parts]:parts).join('/'));
export const collection=(base,...parts)=>collectionRef((base?.path?[base.path,...parts]:parts).join('/'));
export const query=(ref,...constraints)=>({...ref,type:'query',constraints:[...(ref.constraints||[]),...constraints]});
export const where=(field,op,value)=>({type:'where',field,op,value});
export const orderBy=(field,direction='asc')=>({type:'orderBy',field,direction});
export const limit=n=>({type:'limit',n});
export const startAfter=(...values)=>({type:'startAfter',values});
export const startAt=(...values)=>({type:'startAt',values});
export const endAt=(...values)=>({type:'endAt',values});
export const endBefore=(...values)=>({type:'endBefore',values});
export const documentId=()=>'__name__';
export const getDoc=async ref=>snapshot(await api('/v1/client/get',{path:ref.path}));
export async function getDocs(ref){
  const body=queryBody(ref);if(body.limit)return querySnapshot(await api('/v1/client/query',body));
  // Exhaust unbounded legacy reads by pages; never silently truncate a financial history.
  if(!body.orderBy.some(o=>o.field==='__name__'))body.orderBy.push({field:'__name__',direction:body.orderBy.at(-1)?.direction||'asc'});
  body.limit=1000;const documents=[];
  while(true){const page=await api('/v1/client/query',body);documents.push(...page.documents);if(page.documents.length<1000)break;
    if(documents.length>=100000)throw new Error('Consulta muy grande; filtra por fecha');
    const last=snapshot(page.documents.at(-1));body.startAfter=body.orderBy.map(o=>encode(o.field==='__name__'?last.ref:last.get(o.field)));
  }return querySnapshot({documents});
}
export function onSnapshot(ref,...args){const callbacks=args.filter(x=>typeof x==='function');if(args.some(x=>x&&typeof x==='object'&&typeof x.next==='function')){const observer=args.find(x=>x&&typeof x==='object'&&typeof x.next==='function');return watch(ref,observer.next,observer.error);}return watch(ref,callbacks[0],callbacks[1]);}
const write=(kind,ref,data,options)=>({kind,path:ref.path,fields:encode(data).mapValue.fields,...(options?{options}:{})});
export const setDoc=(ref,data,options)=>api('/v1/client/write',{writes:[write('set',ref,data,options)]});
export const updateDoc=(ref,data)=>api('/v1/client/write',{writes:[write('update',ref,data)]});
export const addDoc=async(ref,data)=>{const target=doc(ref,crypto.randomUUID().replaceAll('-','').slice(0,20));await api('/v1/client/write',{writes:[write('create',target,data)]});return target;};
export const serverTimestamp=()=>({__dcarelaTransform:'timestamp'});
export const increment=value=>({__dcarelaTransform:'increment',values:[value]});
export const arrayUnion=(...values)=>({__dcarelaTransform:'union',values});
export const arrayRemove=(...values)=>({__dcarelaTransform:'remove',values});
export const deleteField=()=>({__dcarelaTransform:'delete'});
export function writeBatch(){const writes=[];const batch={set(ref,data,options){writes.push(write('set',ref,data,options));return batch;},update(ref,data){writes.push(write('update',ref,data));return batch;},commit:()=>api('/v1/client/write',{writes})};return batch;}
export async function runTransaction(instance,callback){
  for(let attempt=0;attempt<5;attempt++){
    const writes=[],readVersions=[];
    const tx={get:async ref=>{if(writes.length)throw new Error('Las lecturas deben preceder a las escrituras');const s=await getDoc(ref);readVersions.push({path:ref.path,updateTime:s._wire.updateTime||null});return s;},set(ref,data,options){writes.push(write('set',ref,data,options));return tx;},update(ref,data){writes.push(write('update',ref,data));return tx;}};
    const result=await callback(tx);if(!writes.length)return result;
    try{await api('/v1/client/write',{writes,readVersions});return result;}catch(error){if(error.status!==409||attempt===4)throw error;}
  }
}
