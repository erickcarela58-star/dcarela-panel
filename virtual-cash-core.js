(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DcarelaVirtualCash=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const BUSINESS='plaza-artesanal';
  const DENOMINATIONS=[200000,100000,50000,20000,10000,5000,2500,1000,500,100];
  function countCash(rows){
    if(!Array.isArray(rows))throw new Error('Completa el conteo de billetes y monedas.');
    const seen=new Set();let total=0;
    for(const row of rows){
      const value=Number(row.valorCentavos),quantity=Number(row.cantidad);
      if(!DENOMINATIONS.includes(value)||seen.has(value)||!Number.isSafeInteger(quantity)||quantity<0)throw new Error('Denominacion o cantidad invalida. Usa cantidades enteras no negativas.');
      seen.add(value);total+=value*quantity;
      if(!Number.isSafeInteger(total))throw new Error('Conteo fuera de rango.');
    }
    return total;
  }
  function catalogDocuments(snapshot,businessId){
    if(businessId!==BUSINESS||snapshot?.business_id!==BUSINESS||snapshot?.schema!==1)throw new Error('Catalogo exclusivo de Plaza Artesanal.');
    if(!Array.isArray(snapshot.products)||!snapshot.products.length||!Array.isArray(snapshot.categories))throw new Error('El catalogo inicial no esta disponible.');
    const ids=new Set(),products=snapshot.products.map(p=>{
      if(typeof p.id!=='string'||!p.id.startsWith('plaza-')||p.id.includes('/')||ids.has(p.id)||!p.nombre)throw new Error('Identificador de producto invalido.');
      ids.add(p.id);
      for(const key of ['precioFinalCentavos','precioMayoreoCentavos','costoCentavos'])if(!Number.isSafeInteger(p[key])||p[key]<0)throw new Error('Importe de catalogo invalido.');
      return {...p,business_id:BUSINESS,stock:0,plaza_inventory_required:true,usaInventario:p.inventory_mode!=='components',source:'plaza_initial_catalog',catalog_version:snapshot.version};
    });
    for(const p of products)for(const c of p.componentes||[])if(!ids.has(c.productoId)||!(Number(c.cantidad)>0))throw new Error('Componente de combo invalido.');
    const categories=snapshot.categories.map(c=>{if(!c.id?.startsWith('plaza-')||c.id.includes('/')||!c.nombre)throw new Error('Categoria invalida.');return {...c,business_id:BUSINESS};});
    const categoryIds=new Set(categories.map(c=>c.id));
    if(categoryIds.size!==categories.length||products.some(p=>p.categoriaId&&!categoryIds.has(p.categoriaId)))throw new Error('Categoria de producto inexistente.');
    return {products,categories};
  }
  function stockRequirements(lines,products){
    const byId=new Map(products.map(p=>[p.id,p])),required=new Map(),dependencies=new Set();
    function add(id,quantity,path=[]){
      const p=byId.get(id);
      dependencies.add(id);
      if(!p||p.business_id!==BUSINESS||p.activo===false||p.activo===0)throw new Error('Producto no disponible en Plaza Artesanal.');
      if(!Number.isFinite(quantity)||quantity<=0||!Number.isSafeInteger(Math.round(quantity*1000))||Math.abs(Math.round(quantity*1000)-quantity*1000)>1e-7)throw new Error('Cantidad invalida.');
      if(path.includes(id)||path.length>12)throw new Error('El combo contiene un ciclo.');
      if(p.inventory_mode==='components'){
        if(!p.componentes?.length)throw new Error('El combo no tiene componentes configurados.');
        p.componentes.forEach(c=>add(c.productoId,Math.round(quantity*Number(c.cantidad)*1000)/1000,[...path,id]));
      }else required.set(id,Math.round(((required.get(id)||0)+quantity)*1000)/1000);
    }
    for(const line of lines){if(line.comun||String(line.productoId).startsWith('comun-'))throw new Error('Plaza requiere un producto del catalogo con inventario registrado.');add(line.productoId,Number(line.cantidad));}
    const result=[...required].map(([id,quantity])=>({id,quantity}));
    Object.defineProperty(result,'dependencyIds',{value:[...dependencies]});
    return result;
  }
  function checkStock(required,products){
    const byId=new Map(products.map(p=>[p.id,p]));
    return required.map(r=>{const p=byId.get(r.id),stock=Number(p?.stock);
      if(!p||p.business_id!==BUSINESS||p.activo===false||p.activo===0||!Number.isFinite(stock)||stock<r.quantity){
        const error=new Error(`Registra inventario antes de vender: ${p?.nombre||r.id}. Disponible ${Number.isFinite(stock)?stock:0}, requerido ${r.quantity}.`);error.code='inventory_required';throw error;
      }
      return {id:r.id,stock:Math.round((stock-r.quantity)*1000)/1000};
    });
  }
  return {BUSINESS,DENOMINATIONS,countCash,catalogDocuments,stockRequirements,checkStock};
});
