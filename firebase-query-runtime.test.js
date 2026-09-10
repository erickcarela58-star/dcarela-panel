const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function harness(read, storageValues = {}) {
  let now = Date.now();
  const user = {uid:'admin-a'};
  const calls = [];
  function query(name, conditions = []) {
    return {where:(...condition)=>query(name,[...conditions,condition]),
      doc:id=>query(name, [id]),
      orderBy:(...order)=>query(name,[...conditions,['orderBy',...order]]),
      limit:value=>query(name,[...conditions,['limit',value]]),
      startAfter:doc=>query(name,[...conditions,['startAfter',doc.id]]),
      async get(options = {}){ calls.push({name,conditions,source:options?.source || 'server'}); return read(name,conditions,options); }};
  }
  const auth = {currentUser:user};
  const db = {collection:query, enablePersistence:async()=>{}};
  const firebase = {apps:[], initializeApp:()=>({}), auth:()=>auth, firestore:()=>db};
  const window = {__DCARELA_FIREBASE_CONFIG:{projectId:'test'}, DcarelaFinanceCore:require('./finance-core.js')};
  const localStorage = {
    getItem:key=>Object.prototype.hasOwnProperty.call(storageValues,key) ? storageValues[key] : null,
    setItem:(key,value)=>{storageValues[key]=String(value);}
  };
  const clock = class extends Date {static now(){return now;}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/firebase-adapter.js','utf8'),
    {window,firebase,console,Date:clock,Map,Promise,Error,localStorage,setTimeout,clearTimeout});
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

test('finanzas no duplica una conciliacion materializada y su evento del ledger',async()=>{
  const h=harness(async name=>{
    if(name==='fin_movements') return snapshot([{
      id:'fin-recon-20260827-comida',tipo:'gasto',monto_centavos:50000,fecha:'2026-08-27',descripcion:'Comida materializada'
    }]);
    if(name==='sync_events') return snapshot([{
      id:'ledger-event',event_id:'ledger-event',event_type:'LedgerMovimientoRegistrado',business_id:'dcarela',
      payload:{ledgerId:'sync-ledger-recon-20260827-comida',tipo:'GASTO',importeDopCentavos:50000,fechaEfectiva:'2026-08-27'}
    }]);
    return snapshot([]);
  });
  const rows=await h.api.getFinanceMovements();
  assert.equal(rows.length,1);
  assert.equal(rows[0].descripcion,'Comida materializada');
});

test('un rango contable incluye ventas archivadas y ventas recibidas tarde',async()=>{
  const lateAugust={id:'late-aug',event_id:'late-aug',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-09-01T05:00:00.000Z',payload:{vendidaEn:'2026-08-31T18:00:00.000Z',totalCobradoCentavos:12500}};
  const september={id:'sep',event_id:'sep',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-09-01T14:00:00.000Z',payload:{vendidaEn:'2026-09-01T14:00:00.000Z',totalCobradoCentavos:30000}};
  const archived={id:'archive-1',event_id:'archive-1',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-08-05T16:00:00.000Z',payload:{vendidaEn:'2026-08-05T15:00:00.000Z',totalCobradoCentavos:7000}};
  const h=harness(async name=>{
    if(name==='sync_events') return snapshot([lateAugust,september]);
    if(name==='sync_event_archives') return snapshot([{id:'chunk',business_id:'dcarela',events:[archived]}]);
    return snapshot([]);
  });
  const rows=await h.api.getSyncEvents('dcarela',{
    from:'2026-08-01T04:00:00.000Z',to:'2026-09-01T03:59:59.999Z',limit:5000,includeArchives:true
  });
  assert.deepEqual([...rows.map(item=>item.event_id)].sort(),['archive-1','late-aug']);
  const currentCalls=h.calls.filter(call=>call.name==='sync_events');
  assert.ok(currentCalls.length>=1);
  assert.equal(currentCalls.some(call=>call.conditions.some(condition=>
    Array.isArray(condition)&&condition[0]==='received_at_cloud')),false,
  'la fecha de recepcion no debe recortar un periodo contable');
});

test('una conciliacion completa no hereda una cache actual recortada',async()=>{
  const cached={id:'cached',event_id:'cached',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-08-31T18:00:00.000Z',payload:{vendidaEn:'2026-08-31T17:00:00.000Z',totalCobradoCentavos:5000}};
  const missing={id:'missing',event_id:'missing',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-08-18T18:00:00.000Z',payload:{vendidaEn:'2026-08-18T17:00:00.000Z',totalCobradoCentavos:113000}};
  const queryKey='dcarela|||5000';
  const marker=`dcarela:sync-events-primed:v1:${queryKey}`;
  const h=harness(async(name,conditions,options)=>{
    if(name==='sync_events') return options?.source==='cache' ? snapshot([cached]) : snapshot([cached,missing]);
    if(name==='sync_event_archives') return snapshot([]);
    return snapshot([]);
  },{[marker]:'1'});
  const rows=await h.api.getSyncEvents('dcarela',{
    from:'2026-08-01T04:00:00.000Z',to:'2026-09-01T03:59:59.999Z',limit:5000,
    includeArchives:true,eventTypes:['VentaCobrada']
  });
  assert.deepEqual([...rows.map(item=>item.event_id)].sort(),['cached','missing']);
  const serverCall=h.calls.find(call=>call.name==='sync_events'&&call.source==='server');
  assert.ok(serverCall);
  assert.equal(serverCall.conditions.some(condition=>Array.isArray(condition)
    &&condition[0]==='received_at_cloud'&&condition[1]==='>='),false);
  assert.ok(serverCall.conditions.some(condition=>Array.isArray(condition)
    &&condition[0]==='limit'&&condition[1]===5000));
});

test('diario completo pagina mas de 5000 eventos, conserva archivo y exige servidor',async()=>{
  const all=Array.from({length:5003},(_,i)=>({id:'e'+i,event_id:'e'+i,received_at_cloud:'2026-09-01T12:00:00Z',event_type:'VentaCobrada'}));
  const h=harness(async(name,conditions,options)=>{
    if(name==='sync_event_archives') return snapshot([{id:'a',events:[{id:'arch',event_id:'arch',received_at_cloud:'2026-08-01T00:00:00Z'}]}]);
    assert.equal(options.source,'server');
    const cursor=conditions.find(c=>c[0]==='startAfter');
    return snapshot(cursor ? all.slice(all.findIndex(x=>x.id===cursor[1])+1) : all.slice(0,5000));
  });
  const result=await h.api.getSyncEvents('dcarela',{complete:true});
  assert.equal(result.length,5004);
  assert.equal(h.calls.filter(c=>c.name==='sync_events').length,2);
  assert.equal(h.calls.some(c=>c.source==='cache'),false);
});

test('diario historico usa cada pago una vez y preserva saldo anterior al rango consultado',async()=>{
  const accounts=[{id:'cash',nombre:'Efectivo',tipo:'efectivo',reconciled_at:'2026-09-01T03:59:59Z',reconciled_balance_centavos:10000},{id:'bank',nombre:'Banco',tipo:'banco',reconciled_at:'2026-09-01T03:59:59Z',reconciled_balance_centavos:0}];
  const sale={id:'s-event',event_id:'s-event',entity_id:'s1',event_type:'VentaCobrada',received_at_cloud:'2026-09-02T12:00:00Z',payload:{ventaId:'s1',vendidaEn:'2026-09-02T12:00:00Z',totalCobradoCentavos:3000,pagos:[{metodo:'efectivo',montoCentavos:1000,cuentaFinancieraId:'cash'},{metodo:'transferencia',montoCentavos:2000,cuentaFinancieraId:'bank'}]}};
  const h=harness(async name=>{
    if(name==='fin_accounts')return snapshot(accounts);
    if(name==='sync_events')return snapshot([sale]);
    if(name==='fin_movements')return snapshot([{id:'cash-pay',venta_id:'s1',tipo:'ingreso',monto_centavos:1000,cuenta_id:'cash',fecha:'2026-09-02'}]);
    if(name==='fin_preferences')return {exists:true,data:()=>({})};
    return snapshot([]);
  });
  const rows=await h.api.getFinanceJournal('dcarela',{from:'2026-09-02',to:'2026-09-02'});
  assert.equal(rows.length,2);
  assert.equal(rows.sales.length,1);
  const state=await h.api.getFinanceAccountState('dcarela');
  assert.deepEqual([...state.balances.map(x=>x.balance)],[11000,2000]);
  const empty=await h.api.getFinanceJournal('dcarela',{from:'2026-09-03',to:'2026-09-03'});
  assert.equal(empty.length,0);
  assert.equal(empty.sales.length,0);
});

// El archivo historico son 343 bloques y 77 MB, y se bajaba entero en cada consulta: esa es la
// causa medida de que Finanzas tarde. Cada bloque declara ahora el rango de fechas efectivas
// que contiene, asi que un periodo solo pide los bloques que lo tocan --10 de 343 para treinta
// dias-- sin bajar los demas.
test('un periodo solo pide los bloques del archivo que lo tocan',async()=>{
  const viejo={id:'viejo',event_id:'viejo',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2023-05-02T16:00:00.000Z',payload:{vendidaEn:'2023-05-02T15:00:00.000Z',totalCobradoCentavos:1000}};
  const reciente={id:'reciente',event_id:'reciente',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-08-05T16:00:00.000Z',payload:{vendidaEn:'2026-08-05T15:00:00.000Z',totalCobradoCentavos:7000}};
  const h=harness(async(name,conditions)=>{
    if(name==='sync_events') return snapshot([]);
    if(name==='sync_event_archives'){
      const corte=conditions.find(c=>Array.isArray(c)&&c[0]==='events_to');
      const bloques=[
        {id:'bloque-viejo',business_id:'dcarela',events:[viejo],events_from:'2023-01-01T00:00:00.000Z',events_to:'2023-06-30T00:00:00.000Z'},
        {id:'bloque-reciente',business_id:'dcarela',events:[reciente],events_from:'2026-08-01T00:00:00.000Z',events_to:'2026-08-21T00:00:00.000Z'},
      ];
      // El servidor solo devuelve los que cumplen el filtro; asi se ve el ahorro real.
      return snapshot(corte ? bloques.filter(b=>b.events_to>=corte[2]) : bloques);
    }
    return snapshot([]);
  });
  const filas=await h.api.getSyncEvents('dcarela',{
    from:'2026-08-01T04:00:00.000Z',to:'2026-09-01T03:59:59.999Z',limit:5000,includeArchives:true
  });
  // Se copia a un array de ESTE realm: el que devuelve el VM tiene otro prototipo y
  // deepStrictEqual falla enseñando dos listas identicas en pantalla.
  assert.deepEqual([...filas.map(f=>f.event_id)],['reciente']);
  const consulta=h.calls.find(c=>c.name==='sync_event_archives');
  assert.ok(consulta.conditions.some(c=>Array.isArray(c)&&c[0]==='events_to'&&c[1]==='>='),
    'sin acotar en el servidor no se ahorra nada: el filtro en el navegador ya baja los 77 MB');
});

// Sin fecha de inicio la consulta es del historial completo y tiene que bajarlo entero.
// Recortar ahi seria perder movimientos, que es peor que tardar.
test('el historial completo sigue bajando el archivo entero',async()=>{
  const h=harness(async(name)=>{
    if(name==='sync_event_archives') return snapshot([{id:'a',events:[{id:'arch',event_id:'arch',received_at_cloud:'2020-01-01T00:00:00Z'}]}]);
    return snapshot([]);
  });
  await h.api.getSyncEvents('dcarela',{complete:true,includeArchives:true});
  const consulta=h.calls.find(c=>c.name==='sync_event_archives');
  assert.equal(consulta.conditions.some(c=>Array.isArray(c)&&c[0]==='events_to'),false,
    'acotar el historial completo dejaria fuera movimientos sin decirlo');
});

// La cache del archivo tiene que separar por rango. Si no, una consulta de un mes deja
// cacheado un archivo podado y la siguiente de historial completo lo reutiliza creyendo que lo
// tiene todo: movimientos desaparecidos sin ningun error visible.
test('la cache del archivo no mezcla un periodo con el historial completo',async()=>{
  const antiguo={id:'antiguo',event_id:'antiguo',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2021-03-01T16:00:00.000Z',payload:{vendidaEn:'2021-03-01T15:00:00.000Z'}};
  const nuevo={id:'nuevo',event_id:'nuevo',business_id:'dcarela',event_type:'VentaCobrada',
    received_at_cloud:'2026-08-05T16:00:00.000Z',payload:{vendidaEn:'2026-08-05T15:00:00.000Z'}};
  const h=harness(async(name,conditions)=>{
    if(name==='sync_events') return snapshot([]);
    if(name==='sync_event_archives'){
      const corte=conditions.find(c=>Array.isArray(c)&&c[0]==='events_to');
      return snapshot(corte
        ? [{id:'reciente',events:[nuevo],events_to:'2026-08-21T00:00:00.000Z'}]
        : [{id:'reciente',events:[nuevo],events_to:'2026-08-21T00:00:00.000Z'},
           {id:'antiguo',events:[antiguo],events_to:'2021-12-31T00:00:00.000Z'}]);
    }
    return snapshot([]);
  });
  await h.api.getSyncEvents('dcarela',{from:'2026-08-01T04:00:00.000Z',limit:5000,includeArchives:true});
  const completo=await h.api.getSyncEvents('dcarela',{complete:true,includeArchives:true});
  assert.ok(completo.some(f=>f.event_id==='antiguo'),
    'el historial completo heredo la cache podada del periodo anterior');
});

// Finanzas pedia SIEMPRE el historial completo y filtraba el rango despues, en el navegador:
// por eso seguia tardando aunque se mirara un solo mes. Todo lo anterior a una conciliacion ya
// esta dentro del saldo conciliado, asi que pedir desde el corte mas antiguo no cambia ningun
// saldo y evita bajar los 77 MB del archivo.
test('el diario financiero pide desde el corte mas antiguo, no desde el principio',async()=>{
  const cuentas=[{id:'cash',nombre:'Efectivo',tipo:'efectivo',reconciled_at:'2026-09-10T12:08:27.274Z',reconciled_balance_centavos:3237000},
    {id:'bank',nombre:'Banco',tipo:'banco',reconciled_at:'2026-09-10T12:39:44.298Z',reconciled_balance_centavos:94420}];
  const h=harness(async(name)=>{ if(name==='sync_event_archives') return snapshot([]); return snapshot([]); });
  await h.api.getFinanceJournal('dcarela',{accounts:cuentas,preferences:{}});
  const archivo=h.calls.find(c=>c.name==='sync_event_archives');
  const corte=archivo.conditions.find(c=>Array.isArray(c)&&c[0]==='events_to');
  assert.ok(corte,'sin acotar, Finanzas vuelve a bajar el archivo entero en cada consulta');
  assert.equal(corte[2],'2026-09-10T12:08:27.274Z','se pide desde el corte MAS ANTIGUO de las cuentas');
});

// Sin corte no hay saldo base, y entonces el historial completo es obligatorio: mejor tardar
// que ensenar un saldo al que le faltan movimientos.
test('una cuenta sin conciliar obliga a bajar el archivo completo',async()=>{
  const cuentas=[{id:'cash',nombre:'Efectivo',tipo:'efectivo',reconciled_at:'2026-09-10T12:08:27.274Z'},
    {id:'nueva',nombre:'Cuenta nueva',tipo:'banco'}];
  const h=harness(async()=>snapshot([]));
  await h.api.getFinanceJournal('dcarela',{accounts:cuentas,preferences:{}});
  const archivo=h.calls.find(c=>c.name==='sync_event_archives');
  assert.equal(archivo.conditions.some(c=>Array.isArray(c)&&c[0]==='events_to'),false,
    'recortar sin saldo base esconderia movimientos de la cuenta sin conciliar');
});

// Y si se esta mirando un mes anterior al corte, manda el rango pedido: recortar en el corte
// dejaria fuera justo los movimientos de ese mes.
test('un mes anterior al corte manda sobre el corte',async()=>{
  const cuentas=[{id:'cash',nombre:'Efectivo',tipo:'efectivo',reconciled_at:'2026-09-10T12:08:27.274Z'}];
  const h=harness(async()=>snapshot([]));
  await h.api.getFinanceJournal('dcarela',{accounts:cuentas,preferences:{},from:'2026-07-01T04:00:00.000Z'});
  const archivo=h.calls.find(c=>c.name==='sync_event_archives');
  const corte=archivo.conditions.find(c=>Array.isArray(c)&&c[0]==='events_to');
  assert.equal(corte[2],'2026-07-01T04:00:00.000Z');
});
