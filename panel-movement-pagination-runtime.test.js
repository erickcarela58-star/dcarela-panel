'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./panel.js'),'utf8'),core=require('./finance-core');
function banco(count=251){
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',querySelectorAll:()=>[]});return nodes.get(id);};
  const movements=Array.from({length:count},(_,i)=>({id:'m'+i,tipo:'gasto',fecha:'2026-11-03',estado:'registrado',monto_centavos:i+1}));
  let displayed;
  const ctx=vm.createContext({$,finStateCache:{accounts:[],categories:[],movements},financeCore:core,
    finFilteredMovements:[],finMovementPage:0,finMovementFilterKey:'',finMovementPageSize:100,
    renderFinAccountDetail:()=>{},selected:()=>'',esc:String,tabla:rows=>{displayed=rows;return 'tabla';}});
  const a=source.indexOf('  function finCategoryRows('),b=source.indexOf('  async function renderFinBudgets(',a);
  vm.runInContext(source.slice(a,b),ctx);return {ctx,$,rows:()=>displayed};
}
test('historial extenso limita filas visibles sin recortar el conjunto para exportar',()=>{
  const h=banco();h.ctx.renderFinMovements();assert.equal(h.rows().length,100);assert.equal(h.ctx.finFilteredMovements.length,251);
  h.ctx.finMovementPage=2;h.ctx.renderFinMovements();assert.equal(h.rows().length,51);assert.equal(h.rows()[0].id,'m200');
});
test('CSV exporta todas las páginas filtradas y conserva la categoría que muestra el listado',async()=>{
  const h=banco();h.ctx.renderFinMovements();let blob;
  Object.assign(h.ctx,{Blob,numero:Number,downloadBlob:value=>{blob=value;}});
  const a=source.indexOf('  function csvCell('),b=source.indexOf('  function downloadBlob(',a);
  const c=source.indexOf('  function exportarFinCsv('),d=source.indexOf('  function exportarFinPdf(',c);
  vm.runInContext(source.slice(a,b)+source.slice(c,d)+'\nexportarFinCsv()',h.ctx);
  const csv=await blob.text();assert.equal(csv.trim().split('\r\n').length,252);
  assert.match(csv,/Sin categoría/);assert.match(csv,/"251","2.51"/);
});
test('cambiar filtros desde una página posterior vuelve al primer resultado y el rango inválido conserva su error',()=>{
  const h=banco();h.ctx.renderFinMovements();h.ctx.finMovementPage=2;
  h.$('finMovementFrom').value='2026-11-01';h.ctx.renderFinMovements();assert.equal(h.ctx.finMovementPage,0);
  h.$('finMovementFrom').value='2026-12-01';h.$('finMovementTo').value='2026-11-01';h.$('finMovementAccount').value='missing';
  h.ctx.renderFinMovements();assert.match(h.$('finMovimientosTabla').innerHTML,/fecha inicial no puede/);
});
