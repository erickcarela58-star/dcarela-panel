'use strict';
// UI aislada: Chrome propio, datos ficticios y todas las salidas de red bloqueadas.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=__dirname,profile=fs.mkdtempSync(path.join(os.tmpdir(),'dcarela-card-pwa-test-'));
const output=process.argv[2]||path.join(os.tmpdir(),'dcarela-card-pwa-20261120.png');
let browser,server,ws;const pending=new Map();let seq=0;const blocked=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const call=(method,params={})=>new Promise((resolve,reject)=>{
 const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},12000);
 pending.set(id,m=>{clearTimeout(timer);m.error?reject(new Error(m.error.message)):resolve(m.result);});ws.send(JSON.stringify({id,method,params}));
});
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error('UI no llegó al estado: '+expression);}
(async()=>{
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname).replace(/^\/+/,''),file=path.resolve(root,relative||'index.html');
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const target=fs.existsSync(file)&&fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;
  if(!fs.existsSync(target)){res.writeHead(404).end();return;}
  const ext=path.extname(target),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
  res.setHeader('Content-Type',types[ext]||'application/octet-stream');res.setHeader('Cache-Control','no-store');fs.createReadStream(target).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const localBase='http://127.0.0.1:'+server.address().port;
 const base=process.env.DCARELA_QA_PUBLIC_BASE || localBase;
 assert.ok([localBase,'https://panel.dcarelacompufoto.com','https://erikccarela.web.app'].includes(base));
 const chrome=path.join(process.env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe');
 browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await sleep(100);}}
 assert.ok(port,'Chrome no abrió el puerto de pruebas');
 const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const done=pending.get(m.id);pending.delete(m.id);done(m);}
  if(m.method==='Fetch.requestPaused'){
   const p=m.params,local=p.request.url.startsWith(base+'/');
   if(!local)blocked.push(new URL(p.request.url).hostname);
   void call(local?'Fetch.continueRequest':'Fetch.failRequest',{requestId:p.requestId,...(local?{}:{errorReason:'BlockedByClient'})}).catch(()=>{});
  }
 });
 await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await call('Page.navigate',{url:base+'/finanzas/?mode=demo'});await until('!!window.__DCARELA_UI_DEBUG?.state.data');
 await evaluate(`(()=>{const s=window.__DCARELA_UI_DEBUG.state;s.data={...s.data,accounts:[{id:'qa-bank',nombre:'Banco ficticio',tipo:'banco',moneda:'DOP',saldo_actual_centavos:500000,incluir_en_total:true},{id:'qa-other',nombre:'Otro banco ficticio',tipo:'banco',moneda:'DOP',saldo_actual_centavos:100000},{id:'qa-visa',nombre:'Visa ficticia',tipo:'tarjeta_credito',moneda:'DOP',saldo_actual_centavos:-225000}],cards:[],commitments:[],costObligations:[],costRecurrents:[],costPayments:[],commitmentPayments:[],movements:[]};window.DcarelaFinanzasActions.openTab('home');})()`);
 await evaluate('window.__DCARELA_UI_DEBUG.render()');
 await until(`!!document.querySelector('[data-do="debt-pay"][data-id="card:qa-visa"]')`);
 assert.ok((await evaluate('document.body.innerText')).includes('Configurar fecha de pago'));
 await evaluate(`document.querySelector('[data-do="debt-pay"][data-id="card:qa-visa"]').click()`);
 await until(`!!document.querySelector('#entry-dest')`);
 assert.deepEqual(await evaluate(`({type:window.__DCARELA_UI_DEBUG.state.entryType,source:document.querySelector('#entry-account').value,target:document.querySelector('#entry-dest').value,amount:window.__DCARELA_UI_DEBUG.state.entryDigits})`),{type:'transferencia',source:'qa-bank',target:'qa-visa',amount:'225000'});
 assert.ok((await evaluate('document.body.innerText')).includes('Categoría: Pago de tarjeta'));
 await sleep(850);
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(output,Buffer.from(shot.data,'base64'));
 await evaluate(`(()=>{const e=document.querySelector('#entry-dest');e.value='qa-other';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(await evaluate('window.__DCARELA_UI_DEBUG.state.entryLink'),null);
 assert.equal((await evaluate('document.body.innerText')).includes('Categoría: Pago de tarjeta'),false);
 await evaluate(`window.DcarelaFinanzasActions.openRoute('cards')`);
 await until(`!!document.querySelector('[data-do="card-config"][data-id="qa-visa"]')`);
 await evaluate(`document.querySelector('[data-do="card-config"][data-id="qa-visa"]').click()`);
 await until(`!!document.querySelector('#card-pay-day')`);
 await evaluate(`document.querySelector('#card-cut-day').value='25';document.querySelector('#card-pay-day').value='32';document.querySelector('[data-do="card-config-save"]').click()`);
 assert.ok((await evaluate('document.body.innerText')).includes('entre 1 y 31'));
 await evaluate(`document.querySelector('#card-pay-day').value='5';document.querySelector('[data-do="card-config-save"]').click()`);
 await until(`window.__DCARELA_UI_DEBUG.state.modal===null`);
 assert.ok((await evaluate('document.body.innerText')).includes('Vista previa'));
 console.log(JSON.stringify({ok:true,viewport:'390x844',checks:8,screenshot:output,externalNetworkBlocked:[...new Set(blocked)],realWrites:0}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 ws?.close();browser?.kill();if(server)await new Promise(r=>server.close(r));
 // Perfil propio de prueba; nunca sesiones del propietario.
 if(path.dirname(path.resolve(profile))===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('dcarela-card-pwa-test-')){
  for(let i=0;i<15;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(200);}}
 }
});
