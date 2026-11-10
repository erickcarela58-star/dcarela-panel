import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

globalThis.location = {search:'?mode=live',hostname:'localhost'};
globalThis.window = {};
const source = await readFile(new URL('./data-source.js', import.meta.url), 'utf8');
const {authorizedBusinesses, sessionBusinesses, loadFinance, commitAction} =
  await import(`data:text/javascript,${encodeURIComponent(source)}`);

function mock(overrides={}) {
  const calls=[];
  const api={
    isAvailable:true, waitForAuthState:async()=>({uid:'owner-1'}),
    getCurrentUser:()=>({uid:'owner-1'}),
    getMembershipsForUser:async()=>[{business_id:'central',role:'owner',active:true}],
    getBusinessesByIds:async()=>[{id:'central',nombre:'Central',active:true}],
    getFinanceAccounts:async()=>[{id:'cash',business_id:'central',moneda:'DOP',saldo_inicial_centavos:0}],
    getFinanceCategories:async()=>[], getFinanceBudgets:async()=>[],
    getFinanceCards:async()=>[], getFinanceCommitments:async()=>[],
    getFinancePreferences:async()=>({id:'central',business_id:'central'}),
    getFinanceJournal:async(id,options)=>{calls.push(['journal',id,options]);return [{id:'m1',business_id:'central',monto_centavos:12500}]},
    adminAction:async(...args)=>{calls.push(['write',...args]);return {ok:true}},
    ...overrides
  };
  window.DcarelaFirebase=api;
  window.__DCARELA_FIREBASE_CONFIG={projectId:'erikccarela'};
  delete window.__DCARELA_FINANCE_STAGING_WRITE__;
  return {api,calls};
}

test('solo entrega sucursales activas con membresía; ignora un negocio suelto',()=>{
  assert.deepEqual(authorizedBusinesses(
    [{business_id:'central',active:true,role:'viewer'},{business_id:'plaza',active:false,role:'owner'}],
    [{id:'central',nombre:'Central',active:true},{id:'plaza',nombre:'Plaza',active:true},{id:'ajena',active:true}]
  ),[{id:'central',name:'Central',role:'viewer'}]);
});

test('rechaza sesión ausente y sucursal ajena antes de consultar el libro',async()=>{
  mock({waitForAuthState:async()=>null});
  await assert.rejects(sessionBusinesses(),/Inicia sesión/);
  const {calls}=mock();
  await assert.rejects(loadFinance('ajena'),/Acceso denegado/);
  assert.equal(calls.length,0);
});

test('usa el diario canónico una vez y conserva centavos y sucursal',async()=>{
  const {calls}=mock();
  const data=await loadFinance('central');
  assert.equal(data.businessId,'central');
  assert.equal(data.movements[0].monto_centavos,12500);
  assert.equal(calls.filter(c=>c[0]==='journal').length,1);
  assert.equal(calls[0][2].accounts[0].id,'cash');
});

test('falla cerrado ante lectura parcial, documento ajeno o sesión cambiada',async()=>{
  mock({getFinanceCards:async()=>null});
  await assert.rejects(loadFinance('central'),/tarjetas.*incompleta/);
  mock({getFinanceAccounts:async()=>[{id:'x',business_id:'ajena'}]});
  await assert.rejects(loadFinance('central'),/fuera de la sucursal/);
  mock({getFinanceAccounts:async()=>[{id:'x',business_id:'central'}]});
  await assert.rejects(loadFinance('central'),/saldo base verificable/);
  mock({getFinanceJournal:async()=>Object.assign([], {partial_error:'quota'})});
  await assert.rejects(loadFinance('central'),/diario.*incompleta/);
  let n=0;
  mock({getCurrentUser:()=>({uid:++n===1?'owner-1':'intruso'})});
  await assert.rejects(loadFinance('central'),/sesión cambió/);
});

test('producción y usuarios sin rol admin no pueden escribir',async()=>{
  const {calls}=mock();
  await assert.rejects(commitAction('fin.movement.create','central','op-1',{requestId:'op-1'}),/emulador/);
  assert.equal(calls.filter(c=>c[0]==='write').length,0);
  window.__DCARELA_FIREBASE_CONFIG.projectId='demo-finanzas';
  window.__DCARELA_FINANCE_STAGING_WRITE__=true;
  mock({getMembershipsForUser:async()=>[{business_id:'central',role:'viewer',active:true}]});
  window.__DCARELA_FIREBASE_CONFIG.projectId='demo-finanzas';
  window.__DCARELA_FINANCE_STAGING_WRITE__=true;
  await assert.rejects(commitAction('fin.movement.create','central','op-1',{requestId:'op-1'}),/permiso/);
});

test('compuerta de emulador reenvía requestId estable al adaptador',async()=>{
  const {calls}=mock();
  window.__DCARELA_FIREBASE_CONFIG.projectId='demo-finanzas';
  window.__DCARELA_FINANCE_STAGING_WRITE__=true;
  const payload={requestId:'stable-1',montoCentavos:12500};
  await commitAction('fin.movement.create','central','stable-1',payload);
  assert.deepEqual(calls.find(c=>c[0]==='write').slice(1),
    ['fin.movement.create','central','owner','stable-1',payload]);
});
