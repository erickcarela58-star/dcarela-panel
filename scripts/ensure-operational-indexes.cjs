'use strict';
// Create-only: never deploys rules, deletes indexes, or writes business data.
const path = require('node:path');
const fs = require('node:fs');
const lib = path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib');
require(path.join(lib,'logger.js')).logger.silent = true;
const auth = require(path.join(lib,'auth.js'));
const base = 'https://firestore.googleapis.com/v1/projects/erikccarela/databases/(default)/collectionGroups';
const allowed = new Set(['devices','fin_movements','backup_snapshots']);
const targets = JSON.parse(fs.readFileSync(path.join(__dirname,'../firestore.indexes.json'),'utf8')).indexes.filter(x=>allowed.has(x.collectionGroup));
async function main() {
  if (targets.length !== 3) throw Error('Inventario de indices inesperado.');
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw Error('Se requiere autenticacion de Firebase CLI.');
  const {access_token} = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
  async function request(url, body) {
    const r = await fetch(url,{method:body ? 'POST':'GET',headers:{Authorization:'Bearer '+access_token,'Content-Type':'application/json'},
      ...(body ? {body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    const j = await r.json();
    if(!r.ok)throw Error(`HTTP ${r.status}: ${j.error?.status || 'ERROR'}`);
    if(j.nextPageToken)throw Error('Inventario paginado: revisar antes de crear.');
    return j;
  }
  const inventory = await request(base+'/-/indexes');
  const existing = inventory.indexes || [];
  const missing = targets.filter(target=> !existing.some(index=>index.name.includes('/collectionGroups/'+target.collectionGroup+'/')
    && index.queryScope===target.queryScope && JSON.stringify(index.fields.filter(f=>f.fieldPath!=='__name__'))===JSON.stringify(target.fields)));
  console.log(JSON.stringify({mode:process.argv.includes('--apply')?'create-only':'plan',existing:existing.length,missing},null,2));
  if (!process.argv.includes('--apply')) return;
  for(const target of missing) {
    const result = await request(base+'/'+target.collectionGroup+'/indexes',{queryScope:target.queryScope,fields:target.fields});
    console.log(JSON.stringify({created:target.collectionGroup,operation:result.name,done:result.done===true}));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
