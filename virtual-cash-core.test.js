const test=require('node:test'),assert=require('node:assert/strict'),core=require('./virtual-cash-core');
test('conteo usa denominaciones dominicanas y rechaza fracciones, duplicados y negativos',()=>{
 assert.equal(core.countCash([{valorCentavos:200000,cantidad:2},{valorCentavos:2500,cantidad:15},{valorCentavos:500,cantidad:6},{valorCentavos:1000,cantidad:1}]),441500);
 assert.equal(core.countCash([]),0);
 for(const rows of [[{valorCentavos:200000,cantidad:-1}],[{valorCentavos:100,cantidad:.5}],[{valorCentavos:300,cantidad:1}],[{valorCentavos:100,cantidad:1},{valorCentavos:100,cantidad:1}]])assert.throws(()=>core.countCash(rows));
});
test('catalogo inicial fuerza cero, conserva precios y nunca permite destino central',()=>{
 const s={schema:1,business_id:core.BUSINESS,version:'test',categories:[{id:'plaza-cat',nombre:'Fotos'}],products:[{id:'plaza-p',nombre:'Foto',categoriaId:'plaza-cat',stock:99,precioFinalCentavos:12345,precioMayoreoCentavos:0,costoCentavos:500}]};
 const result=core.catalogDocuments(s,core.BUSINESS);assert.equal(result.products[0].stock,0);assert.equal(result.products[0].precioFinalCentavos,12345);assert.equal(s.products[0].stock,99);
 assert.throws(()=>core.catalogDocuments(s,'dcarela'));assert.throws(()=>core.catalogDocuments({...s,products:[s.products[0],s.products[0]]},core.BUSINESS));
});
test('stock cero bloquea incluso servicios, combos comparten componentes y no admiten venta comun',()=>{
 const p=[{id:'p',nombre:'Foto',business_id:core.BUSINESS,stock:0,usaInventario:false},{id:'combo',business_id:core.BUSINESS,inventory_mode:'components',componentes:[{productoId:'p',cantidad:2}]}];
 const required=core.stockRequirements([{productoId:'combo',cantidad:1},{productoId:'p',cantidad:1}],p);
 assert.deepEqual(required,[{id:'p',quantity:3}]);assert.throws(()=>core.checkStock(required,p),/Registra inventario/);
 p[0].stock=3;assert.deepEqual(core.checkStock(required,p),[{id:'p',stock:0}]);
 assert.throws(()=>core.stockRequirements([{comun:true,productoId:'comun-x',cantidad:1}],p));
 p[1].componentes=[{productoId:'combo',cantidad:1}];assert.throws(()=>core.stockRequirements([{productoId:'combo',cantidad:1}],p),/ciclo/);
});
