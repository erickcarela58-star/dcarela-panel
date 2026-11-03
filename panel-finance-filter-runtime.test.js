'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./panel.js'),'utf8').replace(/\r\n/g,'\n');
const core=require('./finance-core');
function load(name,next,ctx){const a=source.indexOf('  function '+name+'('),b=source.indexOf('  function '+next+'(',a);assert.ok(a>=0&&b>a,'función real '+name);vm.runInContext(source.slice(a,b),ctx);}
function banco(){
  const fields=Object.fromEntries(['Type','Account','Category','Search','From','To'].map(k=>['finMovement'+k,{value:''}]));
  const state={accounts:[],categories:[{id:'known',nombre:'Materiales'}],movements:[]};
  const ctx=vm.createContext({$:id=>fields[id],finStateCache:state,financeCore:core});
  load('finMovementMatches','renderFinMovements',ctx);return {ctx,state,fields};
}
test('el filtro Sin categoría distingue registros sin categoría de otras categorías históricas',()=>{
  const h=banco();h.fields.finMovementCategory.value='sin-categoria';
  assert.equal(h.ctx.finMovementMatches({tipo:'gasto',fecha:'2026-11-02',categoria_id:null}),true);
  assert.equal(h.ctx.finMovementMatches({tipo:'gasto',fecha:'2026-11-02',categoria_id:'deleted'}),false);
});
test('el detalle del gráfico respeta las fechas visibles y no mezcla gastos históricos de otro mes',()=>{
  const h=banco();h.fields.finMovementFrom.value='2026-11-01';h.fields.finMovementTo.value='2026-11-30';
  assert.equal(h.ctx.finMovementMatches({tipo:'gasto',fecha:'2026-10-15'}),false);
  assert.equal(h.ctx.finMovementMatches({tipo:'gasto',fecha:'2026-11-02'}),true);
});
test('Gastos del resultado incluye la comisión y excluye transferencias sin comisión y anulados',()=>{
  const h=banco();h.fields.finMovementType.value='gastos_resultado';
  const fee={id:'fee',tipo:'transferencia',fecha:'2026-11-02',monto_centavos:100000,comision_centavos:200,estado:'registrado'};
  h.state.movements=[fee];
  assert.equal(h.ctx.finMovementMatches(fee),true);
  assert.equal(h.ctx.finMovementMatches({...fee,comision_centavos:0}),false);
  assert.equal(h.ctx.finMovementMatches({...fee,estado:'anulado'}),false);
});
test('categorías históricas permanecen seleccionables sin inventar nombres ni alterar datos',()=>{
  const ctx=vm.createContext({});load('finCategoryRows','finMovementMatches',ctx);
  const state={categories:[{id:'known',nombre:'Materiales'}],movements:[{categoria_id:null},{categoria_id:'deleted-category-123'},{categoria_id:'known'}]};
  const antes=JSON.stringify(state),rows=ctx.finCategoryRows(state);
  assert.equal(rows.find(r=>r.id==='sin-categoria').nombre,'Sin categoría');
  assert.match(rows.find(r=>r.id==='deleted-category-123').nombre,/no disponible/);
  assert.equal(rows.find(r=>r.id==='known').nombre,'Materiales');assert.equal(JSON.stringify(state),antes);
});
test('clic en el segmento abre sus gastos en su periodo y limpia filtros de otra cuenta',()=>{
  const fields=Object.fromEntries(['Type','Account','Category','Search','From','To'].map(k=>['finMovement'+k,{value:'anterior'}]));
  const details={open:false};fields.finMovementCategory.closest=()=>details;
  let click,render=0;
  const button={dataset:{finCategoryFilter:'sin-categoria'},addEventListener:(_,f)=>{click=f;}};
  fields.finCategoryChart={innerHTML:'',querySelectorAll:()=>[button]};
  const ctx=vm.createContext({$:id=>fields[id],numero:Number,money:String,esc:String,FIN_CHART_COLORS:['#123'],
    agruparCategoriasGrafica:r=>r,finRange:()=>({from:'2026-11-01',to:'2026-11-30'}),setCostTab:()=>{},renderFinMovements:()=>{render++;}});
  load('renderFinCategoryChart','renderFinRecent',ctx);
  ctx.renderFinCategoryChart([{categoria_id:'sin-categoria',nombre:'Sin categoría',total_centavos:100}],100);click();
  assert.equal(fields.finMovementType.value,'gastos_resultado');assert.equal(fields.finMovementCategory.value,'sin-categoria');
  assert.equal(fields.finMovementAccount.value,'');assert.equal(fields.finMovementSearch.value,'');
  assert.equal(fields.finMovementFrom.value,'2026-11-01');assert.equal(fields.finMovementTo.value,'2026-11-30');
  assert.equal(details.open,true);assert.equal(render,1);
});
