'use strict';
// Development preview of the real shell and panel. Synthetic records only.
// The CSP blocks every network connection; write methods always reject.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const fixtureScript = `(() => {
  const user={uid:'preview-viewer',email:'preview@example.test'};
  const today=new Date().toISOString().slice(0,10);
  const memberships=['dcarela','plaza-artesanal'].map(business_id=>({business_id,active:true,role:'viewer'}));
  const businesses=[{id:'dcarela',name:'Central · prueba local',active:true},{id:'plaza-artesanal',name:'Plaza · prueba local',active:true}];
  const accounts=business=>[
    {id:business+'-cash',business_id:business,nombre:'Efectivo · demo',tipo:'efectivo',saldo_actual_centavos:320000,visual_estilo:'dolar',visual_tono:'#0B6B3A',visual_tono_secundario:'#34C77B',visual_icono:'cash',incluir_en_total:true},
    {id:business+'-popular',business_id:business,nombre:'Banco Popular · demo',tipo:'banco',saldo_actual_centavos:1260000,incluir_en_total:true},
    {id:business+'-qik',business_id:business,nombre:'Qik · demo',tipo:'banco',saldo_actual_centavos:860000,incluir_en_total:true},
    {id:business+'-bhd',business_id:business,nombre:'BHD León · demo',tipo:'banco',saldo_actual_centavos:90000,incluir_en_total:true},
    {id:business+'-reservas',business_id:business,nombre:'Banreservas · demo',tipo:'banco',saldo_actual_centavos:190000,incluir_en_total:true}
  ].map(a=>({...a,reconciled_at:new Date().toISOString(),reconciled_balance_centavos:a.saldo_actual_centavos}));
  const categories=[{id:'demo-service',nombre:'Servicios',tipo:'ingreso'},...['Estudio','Materiales','Local','Transporte','Equipo','Servicios'].map((nombre,i)=>({id:'demo-expense-'+i,nombre,tipo:'gasto'}))];
  const events=business=>Array.from({length:7},(_,i)=>{const date=new Date(Date.now()-600000);date.setDate(date.getDate()-i);return {id:'demo-sale-'+i,business_id:business,event_type:'VentaCobrada',entity_id:'demo-'+i,created_at_local:date.toISOString(),payload:{ventaId:'demo-'+i,folio:100+i,totalCentavos:80000+i*15000,metodoPago:'efectivo',clienteNombre:'Cliente ficticio',cajeroNombre:'Usuario de prueba',cajaId:'demo-caja',turnoId:'demo-turno'}}});
  const clone=value=>JSON.parse(JSON.stringify(value));
  const api={
    isAvailable:true,getCurrentUser:()=>user,waitForAuthState:async()=>user,
    onAuthStateChanged:callback=>{queueMicrotask(()=>callback(user));return ()=>{};},
    getMembershipsForUser:async()=>clone(memberships),getBusinessesByIds:async()=>clone(businesses),
    getSyncEvents:async business=>clone(events(business)),
    getFinanceAccounts:async business=>clone(accounts(business)),
    getFinanceAccountState:async business=>({accounts:clone(accounts(business)),balances:accounts(business).map(a=>({id:a.id,balance:a.saldo_actual_centavos})),movements:[]}),
    getFinanceCategories:async()=>clone(categories),getFinancePreferences:async()=>({periodo_dashboard:'mes'}),
    getFinanceCurrencies:async()=>[{codigo:'DOP',principal:true,tasa_a_principal:1}],
    getFinanceJournal:async business=>{
      const sales=clone(events(business));
      const projected=window.DcarelaFinanceCore.projectSalePaymentsAsMovements(sales,accounts(business),{businessId:business});
      const expenses=categories.filter(c=>c.tipo==='gasto').map((c,i)=>({id:'demo-expense-'+i,tipo:'gasto',fecha:today,monto_centavos:(i+1)*10000,categoria_id:c.id,cuenta_id:business+'-cash',descripcion:c.nombre+' · demostración',estado:'registrado',afecta_resultado:true,source_timestamp:new Date(Date.now()-3600000).toISOString()}));
      return Object.assign([...projected,...expenses],{sales,saleEvents:sales});
    },getFinanceLedgerMovements:async()=>[],getFinanceMovements:async()=>[],
    getFinanceCards:async()=>[],getFinanceBudgets:async()=>[],getFinanceCommitments:async()=>[],getFinanceCommitmentPayments:async()=>[],getFinancePendingTransfers:async()=>[],
    getProducts:async business=>[{id:'demo-product',business_id:business,nombre:'Servicio fotográfico · ejemplo',codigoBarras:'DEMO-001',precioFinalCentavos:100000,existencia:'0',categoriaId:'demo-category',activo:true}],
    getCategories:async()=>[{id:'demo-category',nombre:'Fotografía'}],getProductCombos:async()=>[],getClients:async()=>[],
    getCollection:async()=>[],getLimitedCollection:async()=>[],
    listenCollection:()=>()=>{},invalidateReadCache:()=>{},
    webSaleAction:async action=>{if(action==='capabilities')return {can_use:false};if(action==='status')return {shift:null};throw Error('Escrituras bloqueadas en la prueba local');},
    adminAction:async()=>{throw Error('Escrituras bloqueadas en la prueba local');},
    assistantRequest:async()=>({configured:false,local_engine:true,providers:[],capabilities:{can_use:false}})
  };
  window.DcarelaFirebase=api;
  window.__DCARELA_DEFAULT={business:'dcarela'};
  function banner(){const b=document.createElement('aside');b.className='local-preview-banner';b.textContent='PRUEBA LOCAL · datos ficticios · sin conexión · no publicado';document.body.prepend(b);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',banner);else banner();
})();`;
function page(name) {
  let html = fs.readFileSync(path.join(root, name), 'utf8');
  html = html.replace(/<script>[\s\S]*?<\/script>/g, script => script.includes('window.__DCARELA_DEFAULT') || script.includes('serviceWorker.register') ? '' : script)
    .replace(/<script[^>]*src="(?:https:[^"]*|\.?\.?\/?(?:firebase-config|firebase-adapter)\.js[^"]*)"[^>]*><\/script>/g, '')
    .replace(/<script>\s*if \("serviceWorker" in navigator\)[\s\S]*?<\/script>/g, '')
    .replace(/<link[^>]*rel="manifest"[^>]*>/g, '')
    .replace('<head>', '<head><script src="/preview-fixture.js"></script><style>.local-preview-banner{position:relative;z-index:10000;padding:8px 16px;background:#16324f;color:#fff;font:12px system-ui}body:has(#root){padding-top:0}.local-preview-banner+ #root{min-height:calc(100vh - 30px)}</style>');
  return html;
}
const allowed = new Set(['index.html','mobile/index.html','panel.html','panel.css','panel-theme.css','crm-visual.css','visual-fidelity.css','visual-fidelity.js','panel.js','finance-core.js','finance-revision-core.js','device-health-core.js','money-manager-core.js','client-period-filter.js','virtual-cash-core.js','assistant-local.js','ticket-termico.js','panel-sale-pending.js','supabase.min.js','jspdf.umd.min.js','jspdf.plugin.autotable.min.js','dcarela-logo.png','favicon.svg','app-version.json','bancos/popular.png','bancos/qik.png','bancos/banreservas.png','bancos/bhd.png']);
allowed.add('shell-route-core.js');
allowed.add('crm-layout-core.js');
allowed.add('tool-layout-core.js');
allowed.add('crm-layout.css');
for (const folder of ['shell-assets','mobile/assets']) for (const file of fs.readdirSync(path.join(root,folder))) if (/^index-[\w-]+\.(js|css)$/.test(file)) allowed.add(folder+'/'+file);
function createServer(){return http.createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'");
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1');const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(file==='preview-fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixtureScript);return;}
  if(!allowed.has(file)){res.writeHead(404);res.end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':'image/png');res.end(file.endsWith('.html')?page(file):fs.readFileSync(path.join(root,file)));}catch{res.writeHead(500);res.end('Error de fixture');}
});}
module.exports={createServer,page,fixtureScript};
if(require.main===module)createServer().listen(8818,'127.0.0.1',()=>console.log('Prueba completa: http://127.0.0.1:8818/'));
