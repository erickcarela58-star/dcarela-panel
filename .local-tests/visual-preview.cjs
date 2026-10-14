'use strict';
// Solo GET y datos ficticios. Renderiza las funciones reales de cuentas y gráficos sin SDK ni red.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<a)throw Error('Marcadores cambiaron');return source.slice(a,b);}
function fixture(theme){
  if(!['light','dark'].includes(theme))throw Error('Tema inválido');
  const source=fs.readFileSync(path.join(root,'panel.js'),'utf8');
  const functions=section(source,'  const FIN_CHART_COLORS =','  function finRange(')
    +section(source,'  function renderFinAccounts()','  function renderFinPendingTransfers()')
    +section(source,'  function reportWaveChart(','  async function getDevices()')
    +section(source,'  function agruparCategoriasGrafica(','  function renderFinRecent(');
  const script=`const $=id=>document.getElementById(id),numero=Number;
  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const money=value=>new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP'}).format(Number(value)/100);
  const fechaCorta=value=>new Date(value).toLocaleDateString('es-DO',{day:'2-digit',month:'short'});
  const canEdit=false,FIN_TIPO_LABEL={efectivo:'Efectivo',banco:'Cuenta bancaria'};
  const financeCore=window.DcarelaFinanceCore;
  const finStateCache={accounts:[
    {id:'demo-efectivo',nombre:'Efectivo · demostración',tipo:'efectivo',saldo_actual_centavos:320000,visual_estilo:'dolar',visual_tono:'#0B6B3A',visual_tono_secundario:'#34C77B',visual_icono:'cash'},
    {id:'demo-popular',nombre:'Banco Popular · demostración',tipo:'banco',saldo_actual_centavos:1260000},
    {id:'demo-qik',nombre:'Qik · demostración',tipo:'banco',saldo_actual_centavos:860000}
  ],accountBalanceMovements:[]};
  function setCostTab(){} function renderFinMovements(){}
  ${functions}
  renderFinAccounts();
  $('reportPreview').innerHTML=reportWaveChart([80000,125000,95000,160000,180000,130000,210000].map((total,i)=>['2026-10-'+String(i+1).padStart(2,'0'),{total,refunds:0,tax:total*.15,sales:6}]));
  renderFinCategoryChart(Array.from({length:8},(_,i)=>({nombre:'Categoría '+(i+1),categoria_id:'demo-'+i,total_centavos:(8-i)*10000})),360000);
  document.querySelectorAll('[data-fin-account-ledger],[data-fin-category-filter],.report-wave-point').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation()},true));`;
  return `<!doctype html><html lang="es" data-theme="${theme}" class="embedded-panel${theme==='dark'?' dark':''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vista local del panel · datos ficticios</title>
  ${['panel.css','panel-theme.css','visual-fidelity.css','crm-visual.css'].map(f=>'<link rel="stylesheet" href="/'+f+'">').join('')}
  <style>.qa-banner{padding:12px;background:#16324f;color:white}.qa-main{max-width:1200px;margin:auto;padding:24px}.qa-charts{display:grid;grid-template-columns:1.4fr 1fr;gap:20px;margin:20px 0}.qa-charts section{padding:22px}.qa-main h1{margin:0 0 8px}.qa-main h2{margin:0 0 12px}.qa-main .fin-accounts{display:grid}#finCuentasCards>.total{display:none}@media(max-width:700px){.qa-charts{grid-template-columns:1fr}.qa-main{padding:16px}}</style>
  </head><body><div class="qa-banner">PRUEBA LOCAL · datos ficticios · sin conexión · no publicado</div><main class="qa-main"><h1>Finanzas</h1><p>Cuentas y actividad · vista del estilo CRM</p><div class="fin-accounts" id="finCuentasCards"></div><div class="qa-charts"><section class="surface"><h2>Ventas de la semana</h2><div id="reportPreview"></div></section><section class="surface"><h2>Distribución de gastos</h2><div id="finCategoryChart"></div></section></div><section class="surface" style="padding:22px"><h2>Caja y cortes</h2><div id="cajaResumen" class="inline-metrics"><div class="metric-chip"><span>Cierres registrados · demo</span><strong>2</strong></div><div class="metric-chip"><span>Diferencias · demo</span><strong>0</strong></div></div></section></main>
  <script src="/finance-core.js"></script><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`;
}
const allowed=new Set(['panel.css','panel-theme.css','visual-fidelity.css','crm-visual.css','finance-core.js','bancos/popular.png','bancos/qik.png']);
function createServer(){return http.createServer((req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'");res.setHeader('Cache-Control','no-store');if(req.method!=='GET'){res.writeHead(405);res.end();return;}try{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture(u.searchParams.get('theme')||'light'));return;}const file=u.pathname.slice(1);if(!allowed.has(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'image/png');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(400);res.end('Vista inválida');}});}
module.exports={fixture,createServer};
if(require.main===module)createServer().listen(8817,'127.0.0.1',()=>console.log('Vista local: http://127.0.0.1:8817/'));
