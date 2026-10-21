const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(__dirname+'/panel.js','utf8');
function part(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));}
function harness(account){
  const nodes=new Map();
  const $=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null});return nodes.get(id);};
  const state={accounts:[account],movements:[],accountBalanceMovements:[]};
  const context={$: $,window:{},finStateCache:state,canEdit:false,financeCore:require('./finance-core.js'),numero:Number,
    FIN_TIPO_LABEL:{banco:'Banco',tarjeta_credito:'Tarjeta'},money:String,esc:x=>String(x??'')};
  vm.createContext(context);
  vm.runInContext(part('  const FIN_CHART_COLORS =','  function finRange(')
    +part('  function renderFinAccounts()','  function renderFinPendingTransfers(')
    +part('  function renderMoneyManagerAccounts(','  function renderMoneyManagerObligations('),context);
  return {context,state,$,render(){context.renderFinAccounts();context.renderMoneyManagerAccounts({rows:[{...state.accounts[0],effective_balance_cents:state.accounts[0].saldo_actual_centavos}]});return [$('finCuentasCards').innerHTML,$('mmAccounts').innerHTML];}};
}
test('actualizacion de apariencia repinta Finanzas y Money Manager conservando saldo y diario',()=>{
  const account={id:'demo',nombre:'Banco Popular',tipo:'banco',saldo_actual_centavos:1260000};
  const h=harness(account),before=JSON.stringify(account);
  for(const html of h.render()){assert.match(html,/bancos\/popular.png/);assert.match(html,/1260000/);assert.match(html,/--account-primary:#1A4BA0/);}
  assert.equal(JSON.stringify(account),before,'el render no cambia el registro');
  h.state.accounts[0]={...account,visual_tono:'#aabbcc',visual_tono_secundario:'#334455',visual_estilo:'outline'};
  for(const html of h.render()){assert.match(html,/--account-primary:#AABBCC/);assert.match(html,/visual outline/);assert.match(html,/1260000/);}
  assert.equal(h.state.accountBalanceMovements.length,0);
  assert.equal(h.state.accounts[0].saldo_actual_centavos,1260000);
});
test('configuracion visual invalida no inyecta CSS ni pierde la marca bancaria',()=>{
  const h=harness({id:'demo',nombre:'Qik',tipo:'banco',saldo_actual_centavos:0,visual_tono:'red;background:url(https://invalid.test)',visual_estilo:'inexistente'});
  for(const html of h.render()){assert.match(html,/--account-primary:#0082CD/);assert.match(html,/visual glass/);assert.doesNotMatch(html,/invalid.test/);}
});

test('Finanzas y Money Manager muestran USD con su moneda y total separado',()=>{
  const h=harness({id:'usd',nombre:'Efectivo USD',moneda:'USD',tipo:'efectivo',incluir_en_total:true,saldo_actual_centavos:6400});
  h.state.accounts.push({id:'dop',nombre:'Pesos',moneda:'DOP',tipo:'banco',incluir_en_total:true,saldo_actual_centavos:100000});
  const [fin,mm]=h.render();
  assert.match(fin,/US\$64\.00/);assert.match(mm,/US\$64\.00/);
  assert.match(h.$('finAccountSummary').innerHTML,/100000 · US\$64\.00/);assert.doesNotMatch(fin,/106400/);
  assert.equal(h.state.accounts[0].saldo_actual_centavos,6400);
});
test('tarjeta mantiene deuda visible y saldo firmado sin modificarlos por la estetica',()=>{
  const account={id:'demo-card',nombre:'Tarjeta Qik',tipo:'tarjeta_credito',saldo_actual_centavos:-40000};
  const h=harness(account);
  for(const html of h.render()){assert.match(html,/40000/);assert.match(html,/Deuda/);assert.match(html,/bancos\/qik.png/);}
  assert.equal(account.saldo_actual_centavos,-40000);
});
