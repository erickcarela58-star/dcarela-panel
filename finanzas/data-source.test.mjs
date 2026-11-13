import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

globalThis.location = {search:'?mode=live',hostname:'localhost'};
globalThis.window = {};
const source = await readFile(new URL('./data-source.js', import.meta.url), 'utf8');
const {authorizedBusinesses, sessionBusinesses, loadFinance, commitAction, canRegister, getTerminalReceipt} =
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
    getFinanceCards:async()=>[], getFinanceCommitments:async()=>[], getFinanceCommitmentPayments:async()=>[],
    getCollection:async()=>[],
    getDocument:async()=>null,
    getFinancePreferences:async()=>({id:'central',business_id:'central'}),
    getFinanceJournal:async(id,options)=>{calls.push(['journal',id,options]);return [{id:'m1',business_id:'central',monto_centavos:12500}]},
    getSyncEvents:async(id,options)=>{calls.push(['events',id,options]);return []},
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
  await assert.rejects(sessionBusinesses(),error=>error.code==='AUTH_REQUIRED'&&/Inicia sesión/.test(error.message));
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

test('lee pagos y obligaciones de Caja por sucursal sin agregarlos al diario',async()=>{
  const collections=[];
  const {calls}=mock({getCollection:async(name,filters)=>{
    collections.push([name,filters]);
    return name==='cost_payments'?[{id:'p1',business_id:'central',montoCentavos:3000}]:
      name==='cost_obligations'?[{id:'o1',business_id:'central',saldoCentavos:7000}]:[];
  }});
  const data=await loadFinance('central');
  assert.equal(data.costPayments[0].montoCentavos,3000);
  assert.equal(data.costObligations[0].saldoCentavos,7000);
  assert.equal(data.movements.length,1);
  assert.equal(calls.filter(c=>c[0]==='journal').length,1);
  assert.deepEqual(collections.map(c=>c[0]).sort(),['cost_obligations','cost_payments','cost_recurrents']);
  assert.ok(collections.every(([,filter])=>filter[0][2]==='central'));
});

test('conserva el detalle de venta y los pagos vinculados sin sumar otro movimiento',async()=>{
  const event={id:'sale-event',business_id:'central',event_type:'VentaCobrada',payload:{ventaId:'sale-1',folio:28,lineas:[{nombre:'Retrato',cantidad:1}],pagos:[{metodo:'efectivo',montoCentavos:12500}]}};
  mock({getFinanceJournal:async()=>Object.assign([{id:'pos-sale:sale-event:0',business_id:'central',tipo:'ingreso',monto_centavos:12500}],{sales:[event]}),
    getFinanceCommitmentPayments:async()=>[{id:'cp1',business_id:'central',compromiso_id:'c1',monto_centavos:5000}],
    getCollection:async name=>name==='cost_recurrents'?[{id:'r1',business_id:'central',montoEstimadoCentavos:7000}]:[]});
  const data=await loadFinance('central');
  assert.equal(data.movements.length,1);
  assert.equal(data.sales[0].payload.lineas[0].nombre,'Retrato');
  assert.equal(data.commitmentPayments[0].compromiso_id,'c1');
  assert.equal(data.costRecurrents[0].montoEstimadoCentavos,7000);
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
  mock({getCollection:async name=>name==='cost_payments'?
    [{id:'p1',business_id:'ajena'}]:[]});
  await assert.rejects(loadFinance('central'),/pagos de Caja.*fuera de la sucursal/);
  let n=0;
  mock({getCurrentUser:()=>({uid:++n===1?'owner-1':'intruso'})});
  await assert.rejects(loadFinance('central'),/sesión cambió/);
});

test('un origen no oficial y usuarios sin rol admin no pueden escribir',async()=>{
  const {calls}=mock();
  await assert.rejects(commitAction('fin.movement.create','central','op-1',{requestId:'op-1'}),/PWA oficial/);
  assert.equal(calls.filter(c=>c[0]==='write').length,0);
  window.__DCARELA_FIREBASE_CONFIG.projectId='demo-finanzas';
  window.__DCARELA_FINANCE_STAGING_WRITE__=true;
  mock({getMembershipsForUser:async()=>[{business_id:'central',role:'viewer',active:true}]});
  window.__DCARELA_FIREBASE_CONFIG.projectId='demo-finanzas';
  window.__DCARELA_FINANCE_STAGING_WRITE__=true;
  await assert.rejects(commitAction('fin.movement.create','central','op-1',{requestId:'op-1'}),/permiso/);
});

test('PWA oficial registra ingreso, gasto y transferencia solo con rol admin y requestId estable',async()=>{
  const previous={hostname:location.hostname,protocol:location.protocol};
  location.hostname='panel.dcarelacompufoto.com';location.protocol='https:';
  try{
    const {calls}=mock();
    assert.equal(canRegister(),true);
    for(const action of ['fin.movement.create','fin.transfer.create','cost.recurring.upsert','cost.obligation.upsert']){
      const requestId=`stable-${action}`;
      await commitAction(action,'central',requestId,{requestId,montoCentavos:12500});
      assert.deepEqual(calls.at(-1),['write',action,'central','owner',requestId,{requestId,montoCentavos:12500}]);
    }
    await assert.rejects(commitAction('fin.movement.cancel','central','m1',{requestId:'cancel-1'}),/Caja activa/);
    assert.equal(calls.filter(c=>c[0]==='write').length,4);
    mock({getMembershipsForUser:async()=>[{business_id:'central',role:'viewer',active:true}]});
    await assert.rejects(commitAction('fin.movement.create','central','viewer-1',{requestId:'viewer-1'}),/permiso/);
    assert.equal(canRegister(),true);
    location.protocol='http:';
    assert.equal(canRegister(),false);
    await assert.rejects(commitAction('fin.movement.create','central','http-1',{requestId:'http-1'}),/PWA oficial/);
  }finally{location.hostname=previous.hostname;location.protocol=previous.protocol}
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

test('el acuse de Caja exige evento, movimiento, sucursal y dispositivo coincidentes',async()=>{
  const movement={id:'m1',business_id:'central',sync_event_id:'ledger-m1',created_at:'2026-11-11T12:00:00.000Z'};
  const matching={business_id:'central',event_type:'EventoNubeAplicado',source:'pos_local_firebase',device_id:'pos-central-1',payload:{
    sourceEventId:'ledger-m1',sourceEventType:'LedgerMovimientoRegistrado',
    sourceEntityId:'m1',appliedByDeviceId:'pos-central-1',appliedAt:'2026-11-11T12:01:00Z'
  }};
  const {calls}=mock({getSyncEvents:async(id,options)=>{
    calls.push(['events',id,options]);return [
      {...matching,business_id:'plaza'},
      {...matching,payload:{...matching.payload,sourceEventId:'ledger-otro'}},
      {...matching,source:'otro'},
      matching
    ];
  }});
  assert.deepEqual(await getTerminalReceipt('central',movement),{
    status:'applied',deviceId:'pos-central-1',appliedAt:'2026-11-11T12:01:00Z'
  });
  assert.deepEqual(calls[0],['events','central',{
    from:movement.created_at,eventTypes:['EventoNubeAplicado'],includeArchives:false,limit:500
  }]);
  await assert.rejects(getTerminalReceipt('plaza',movement),/fuera de la sucursal/);
});

test('sin acuse no inventa aplicación; consulta saturada queda inconclusa',async()=>{
  const movement={id:'m1',business_id:'central',sync_event_id:'ledger-m1',created_at:'2026-11-11T12:00:00.000Z'};
  mock({getSyncEvents:async()=>[]});
  assert.deepEqual(await getTerminalReceipt('central',movement),{status:'not_observed'});
  mock({getSyncEvents:async()=>Array.from({length:500},(_,i)=>({
    business_id:'central',event_type:'EventoNubeAplicado',payload:{sourceEventId:`otro-${i}`}
  }))});
  assert.deepEqual(await getTerminalReceipt('central',movement),{status:'inconclusive'});
  assert.deepEqual(await getTerminalReceipt('central',{...movement,created_at:''}),{status:'unavailable'});
});

test('los seis asientos históricos solo muestran el acuse de su reparación verificada',async()=>{
  const movement={id:'owner-repair-20261105-cash-comida',business_id:'central',tipo:'gasto',
    cuenta_id:'cash',monto_centavos:45000,created_at:'2026-11-05T12:00:00Z',
    sync_event_id:'ledger-owner-repair-20261105-cash-comida'};
  const repairId=`projection-repair-20261111-${movement.id}`;
  const repair={id:repairId,event_id:repairId,business_id:'central',
    event_type:'LedgerMovimientoRegistrado',entity_id:movement.id,
    projection_repair_only:true,received_at_cloud:'2026-11-11T20:40:00Z',
    payload:{ledgerId:movement.id,importeDopCentavos:45000,cuentaOrigenId:'cash'}};
  const receipt={business_id:'central',event_type:'EventoNubeAplicado',source:'pos_local_firebase',
    device_id:'pos-central-1',payload:{sourceEventId:repairId,
      sourceEventType:'LedgerMovimientoRegistrado',sourceEntityId:movement.id,
      appliedByDeviceId:'pos-central-1',appliedAt:'2026-11-11T20:45:00Z'}};
  const {calls}=mock({getDocument:async(collection,id)=>{calls.push(['document',collection,id]);return repair},
    getSyncEvents:async(id,options)=>{calls.push(['events',id,options]);return [receipt]}});
  assert.deepEqual(await getTerminalReceipt('central',movement),{
    status:'applied',deviceId:'pos-central-1',appliedAt:'2026-11-11T20:45:00Z',historicalRepair:true
  });
  assert.deepEqual(calls[0],['document','sync_events',repairId]);
  assert.deepEqual(calls[1],['events','central',{
    from:repair.received_at_cloud,eventTypes:['EventoNubeAplicado'],includeArchives:false,limit:500
  }]);
  calls.length=0;
  mock({getDocument:async()=>({...repair,payload:{...repair.payload,importeDopCentavos:97500}}),
    getSyncEvents:async()=>{throw Error('No debe consultar acuses de una reparación que no coincide')}});
  assert.deepEqual(await getTerminalReceipt('central',movement),{status:'unavailable'});
  await assert.rejects(getTerminalReceipt('plaza',movement),/fuera de la sucursal/);
});
