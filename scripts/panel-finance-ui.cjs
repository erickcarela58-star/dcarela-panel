'use strict';
// Isolated browser fixtures. No production authentication or customer records.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {chromium}=require(process.env.DCARELA_PLAYWRIGHT || 'C:/Users/Erick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=fs.readFileSync(path.join(root,'panel.js'),'utf8');
const fixtureSource=fs.readFileSync(path.join(root,'firebase-finance-runtime.test.js'),'utf8');
const start=fixtureSource.indexOf('function harness('),end=fixtureSource.indexOf("test('Plaza",start);
const fixture=vm.runInNewContext(fixtureSource.slice(start,end)+'\nharness',{
  fs,vm,assert,__dirname:root,core:require('../finance-core'),require:require('node:module').createRequire(path.join(root,'firebase-finance-runtime.test.js')),setTimeout,clearTimeout,console
});
const today=require('../finance-core').businessDay(new Date());
const accounts=[{id:'cash',nombre:'Efectivo',tipo:'efectivo',saldo_actual_centavos:1000000,incluir_en_total:true,ligada_ventas:true},
  {id:'bank',nombre:'Banco Popular',tipo:'banco',saldo_actual_centavos:500000,incluir_en_total:true},
  {id:'qik',nombre:'Tarjeta Qik',tipo:'tarjeta_credito',saldo_actual_centavos:0,incluir_en_total:true}];
const categories=[{id:'food',nombre:'Comida',tipo:'gasto'}];
const loan={id:'loan',nombre:'Prestamo fixture',tipo:'prestamo',monto_centavos:12000,saldo_pendiente_centavos:1000000,capital_pendiente_centavos:1000000,cuotas_totales:100,cuotas_pagadas:0};
function seed(){const h=fixture('admin','dcarela');for(const a of accounts)h.docs.set('fin_accounts/'+a.id,{...a,business_id:'dcarela'});
  for(const c of categories)h.docs.set('fin_categories/'+c.id,{...c,business_id:'dcarela'});
  h.docs.set('fin_commitments/loan',{...loan,business_id:'dcarela'});return h;}
let h=seed();
const binding=source.slice(source.indexOf('    on("btnCerrarEditor"'),source.indexOf('    on("alertFilter"'));
const injection=`
  window.__financeTest = {
    openExpense:()=>abrirMovimientoFin('gasto'),openTransfer:abrirTransferenciaFin,openCard:()=>abrirConsumoTarjetaFin('qik'),
    openCardPayment:()=>abrirPagoTarjetaFin('qik'),openLoanPayment:()=>abrirPagoCompromisoFin(${JSON.stringify(loan)}),openAccount:()=>abrirCuentaFin(),
    openReconcile:()=>abrirConciliacionCuentaFin(finStateCache.accounts.find(a=>a.id==='cash')),
    async refresh(){
      const data=await window.__fixtureSnapshot();
      finStateCache={...data,month:${JSON.stringify(today.slice(0,7))},preferences:{},cards:[{cuenta_id:'qik',limite_credito_centavos:1000000,dia_corte:20,dia_pago:5}],
        budgets:[],budgetProgress:[],currencies:[{codigo:'DOP',nombre:'Peso',simbolo:'RD$',tasa_a_principal:1,principal:true}],
        commitments:[],commitmentPayments:[],pendingTransfers:[],costObligations:[],costPayments:[],costRecurrents:[],shiftClosings:[]};
      costStateCache={obligations:[],recurrents:[],payments:[],receipts:[],expenses:[]};
      renderFinAccounts();renderFinCards();renderFinMovements();renderFinSettings();await renderFinDashboard();renderMoneyManager();
    },
    async init(){
      canEdit=true;memberRole='admin';session={user:{id:'user',email:'fixture@example.test'}};authProvider='firebase';
      $('provMes').value=${JSON.stringify(today.slice(0,7))};$('mmMonth').value=${JSON.stringify(today.slice(0,7))};
      $('access').classList.add('oculto');$('app').classList.remove('oculto');
      document.querySelectorAll('[data-view]').forEach(e=>e.classList.add('oculto'));
      $('v-money-manager').classList.remove('oculto');
      cargarProveedores=async()=>window.__financeTest.refresh();
      ${binding}
      await this.refresh();
    }
  };return;
`;
async function main(){
 const server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://localhost');
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
   let data=fs.readFileSync(file);
   if(url.pathname==='/panel.html')data=String(data).replace(/<script[^>]*src="(?:https:[^"]*|supabase.min.js|firebase-adapter.js[^\"]*)"[^>]*><\/script>/g,'');
   if(url.pathname==='/panel.js')data=source.replace('  if (window.__DCARELA_TEST_PANEL_SHORTCUTS__ === true) {',()=>injection+'\n  if (window.__DCARELA_TEST_PANEL_SHORTCUTS__ === true) {');
   res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.DCARELA_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  for(const width of [1440,390]){
   h=seed();const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   await page.exposeFunction('__fixtureWrite',async(...args)=>h.api.adminAction(...args));
   await page.exposeFunction('__fixtureSnapshot',()=>({accounts:[...h.docs].filter(([k])=>k.startsWith('fin_accounts/')).map(([k,v])=>({...v,id:k.split('/')[1]})),
     categories,movements:[...h.docs].filter(([k])=>k.startsWith('fin_movements/')).map(([,v])=>v)}));
   await page.addInitScript(()=>{window.DcarelaFirebase={isAvailable:true,adminAction:(...args)=>window.__fixtureWrite(...args)};localStorage.setItem('dcarela.cfg','malformed fixture');});
   await page.goto(origin+'/panel.html?embedded=1#money-manager');
   assert.deepEqual(errors,[], 'panel bootstrap');
   await page.evaluate(()=>window.__financeTest.init());
   assert.equal(await page.locator('#mmKpis').isVisible(),true);
   assert.equal(await page.locator('#access').isVisible(),false,'mobile login must stay hidden after authentication');
   assert.equal(await page.locator('.vista.oculto:visible').count(),0,'hidden modules must not cover the current module');
   await page.evaluate(()=>window.__financeTest.openExpense());
   for(const digit of ['5','0','0','0','0'])await page.locator('[data-fin-key="'+digit+'"]').click();
   await page.locator('[name=categoriaId]').selectOption('food');await page.locator('[name=cuentaId]').selectOption('cash');
   await page.locator('[name=descripcion]').fill('Comida fixture');await page.locator('#btnGuardarEditor').click();
   await page.waitForFunction(()=>document.getElementById('editorOverlay').classList.contains('oculto'));
   assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,950000);
   await page.evaluate(()=>window.__financeTest.openTransfer());
   await page.locator('[name=cuentaOrigenId]').selectOption('cash');await page.locator('[name=cuentaDestinoId]').selectOption('bank');
   await page.locator('[name=monto]').fill('2500');await page.locator('#btnGuardarEditor').click();
   await page.waitForFunction(()=>document.getElementById('editorOverlay').classList.contains('oculto'));
   assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,700000);assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,750000);
   await page.evaluate(()=>window.__financeTest.openCard());
   await page.locator('[name=monto]').fill('3712.63');await page.locator('[name=categoriaId]').selectOption('food');
   await page.locator('[name=descripcion]').fill('Consumo fixture');await page.locator('#btnGuardarEditor').click();
   await page.waitForFunction(()=>document.getElementById('editorOverlay').classList.contains('oculto'));
   assert.equal(h.docs.get('fin_accounts/qik').saldo_actual_centavos,-371263);
   assert.equal(h.docs.get('fin_accounts/cash').saldo_actual_centavos,700000);
   await page.evaluate(()=>window.__financeTest.openCardPayment());
   await page.locator('[name=cuentaOrigenId]').selectOption('bank');await page.locator('[name=monto]').fill('1000');
   await page.locator('#btnGuardarEditor').click();await page.waitForFunction(()=>document.getElementById('editorOverlay').classList.contains('oculto'));
   assert.equal(h.docs.get('fin_accounts/qik').saldo_actual_centavos,-271263);assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,650000);
   await page.evaluate(()=>window.__financeTest.openLoanPayment());
   await page.locator('[name=cuentaId]').selectOption('bank');await page.locator('[name=capital]').fill('100');await page.locator('[name=interes]').fill('20');
   await page.locator('#btnGuardarEditor').click();await page.waitForFunction(()=>document.getElementById('editorOverlay').classList.contains('oculto'));
   assert.equal(h.docs.get('fin_accounts/bank').saldo_actual_centavos,638000);assert.equal(h.docs.get('fin_commitments/loan').capital_pendiente_centavos,990000);
   const movements=[...h.docs].filter(([k])=>k.startsWith('fin_movements/')).map(([,v])=>v);
   assert.equal(require('../finance-core').summarizeMovements(movements).gastos_centavos,423263,'capital and credit-card payment must not duplicate expenses');
   await page.evaluate(()=>window.__financeTest.openAccount());
   await page.locator('[name=nombre]').fill('Cuenta nueva fixture');await page.locator('[name=saldoInicial]').fill('100');
   await page.locator('#btnGuardarEditor').click();await page.waitForFunction(()=>document.getElementById('editorOverlay').classList.contains('oculto'));
   assert.equal([...h.docs.values()].find(v=>v.nombre==='Cuenta nueva fixture').saldo_actual_centavos,10000);
   await page.evaluate(()=>window.__financeTest.refresh());
   await page.screenshot({path:path.join(process.env.TEMP || root,'dcarela-finance-fixture-'+width+'.png'),fullPage:true});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   assert.ok(overflow<=2,'horizontal overflow: '+overflow);
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({viewport:width,expense:'500.00 cash',transfer:'2500.00 cash to bank',creditCard:'3712.63',cardPayment:'1000.00',loan:'100 capital + 20 interest',newAccount:'100.00',runtimeErrors:errors.length,productionWrites:0}));
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
