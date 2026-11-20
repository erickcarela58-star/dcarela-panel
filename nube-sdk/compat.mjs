import * as app from './app.mjs';
import * as authSdk from './auth.mjs';
import * as f from './firestore.mjs';
import {db as coreDb} from './core.mjs';
const snap=original=>({...original,exists:original.exists(),ref:ref(original.ref)});
const qs=original=>({...original,docs:original.docs.map(snap),forEach:callback=>original.docs.forEach(d=>callback(snap(d))),docChanges:()=>original.docChanges().map(c=>({...c,doc:snap(c.doc)}))});
function ref(value){
  const r={...value};
  if(value.type==='document')Object.assign(r,{get:async()=>snap(await f.getDoc(value)),set:(data,options)=>f.setDoc(value,data,options),update:data=>f.updateDoc(value,data),collection:name=>ref(f.collection(value,name)),onSnapshot:(next,error)=>f.onSnapshot(value,s=>next(snap(s)),error)});
  else{
    Object.assign(r,{doc:id=>ref(f.doc(value,id||crypto.randomUUID().replaceAll('-','').slice(0,20))),add:async data=>ref(await f.addDoc(value,data)),get:async()=>qs(await f.getDocs(value)),onSnapshot:(next,error)=>f.onSnapshot(value,s=>next(qs(s)),error)});
    for(const name of ['where','orderBy','limit','startAfter','startAt','endAt','endBefore'])r[name]=(...args)=>ref(f.query(value,f[name](...args)));
  }
  return r;
}
function batch(){const b=f.writeBatch();const result={set(r,data,o){b.set(r,data,o);return result;},update(r,data){b.update(r,data);return result;},commit:()=>b.commit()};return result;}
const database={collection:path=>ref(f.collection(coreDb,path)),doc:path=>ref(f.doc(coreDb,path)),batch,settings:()=>{},enablePersistence:async()=>{},runTransaction:callback=>f.runTransaction(coreDb,tx=>callback({get:async r=>snap(await tx.get(r)),set:(r,data,o)=>tx.set(r,data,o),update:(r,data)=>tx.update(r,data)}))};
function auth(){const a=authSdk.getAuth();a.onAuthStateChanged=(next,error)=>authSdk.onAuthStateChanged(a,next,error);a.onIdTokenChanged=a.onAuthStateChanged;a.signInWithEmailAndPassword=(email,password)=>authSdk.signInWithEmailAndPassword(a,email,password);a.signOut=()=>authSdk.signOut(a);a.setPersistence=async()=>{};return a;}
auth.Auth={Persistence:{LOCAL:'LOCAL'}};
function firestore(){return database;}
firestore.FieldValue={serverTimestamp:f.serverTimestamp,increment:f.increment,arrayUnion:f.arrayUnion,arrayRemove:f.arrayRemove,delete:f.deleteField};firestore.Timestamp=f.Timestamp;firestore.FieldPath={documentId:f.documentId};
globalThis.firebase={initializeApp:app.initializeApp,app:app.getApp,get apps(){return app.getApps();},auth,firestore};
