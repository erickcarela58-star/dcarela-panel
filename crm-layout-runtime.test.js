const test=require('node:test'),assert=require('node:assert/strict');
const layout=require('./crm-layout-core.js');
const C={jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})};
function nodes(root){if(Array.isArray(root))return root.flatMap(nodes);if(!root||typeof root!=='object')return [];return [root,...nodes(root.props?.children)];}
function text(root){if(Array.isArray(root))return root.map(text).join(' ');if(root&&typeof root==='object')return text(root.props?.children);return root==null?'':String(root);}
function snapshot(){return {totalCents:80000,saleCount:1,averageCents:80000,alerts:0,onlineDevices:null,salesSeries:[100,200],accounts:[{id:'demo-card',name:'Tarjeta Qik',type:'tarjeta_credito',balanceCents:-40000}],recentSales:[]};}
test('dashboard mantiene importes firmados y series, sin modificar la instantánea ni convertir desconocido en cero',()=>{
 const s=snapshot(),before=JSON.stringify(s),routes=[];
 const view=layout.dashboard(C,{snapshot:s,open:x=>routes.push(x),money:String,Chart:()=>null,recent:false});
 assert.equal(JSON.stringify(s),before);assert.match(text(view),/-40000/);assert.match(text(view),/-- Terminales/);
 const chart=nodes(view).find(x=>typeof x.type==='function');assert.equal(chart.props.points,s.salesSeries);
 nodes(view).find(x=>x.type==='button'&&text(x)==='Ver reporte').props.onClick();assert.deepEqual(routes,['reportes']);
});
test('estado vacío distingue ventas confirmadas de ausencia de datos sincronizados',()=>{
 const render=recent=>text(layout.dashboard(C,{snapshot:snapshot(),open:()=>{},money:String,Chart:()=>null,recent}));
 assert.match(render(false),/No hay datos de ventas sincronizados para hoy/);
 assert.doesNotMatch(render(false),/Todavia no hay ventas validas hoy/);
 assert.match(render(true),/Todavia no hay ventas validas hoy/);
});
test('actividad reciente limita los nodos a cinco sin recortar el origen de datos',()=>{
 const s=snapshot();s.recentSales=Array.from({length:80},(_,i)=>({entity_id:String(i),created_at_local:'2026-10-14T12:00:00Z',payload:{folio:i,total_centavos:100}}));
 const view=layout.dashboard(C,{snapshot:s,open:()=>{},money:String,Chart:()=>null,recent:true});
 const list=nodes(view).find(x=>x.props?.className==='crm-activity-list');assert.equal(nodes(list).filter(x=>x.type==='button').length,5);assert.equal(s.recentSales.length,80);
});
test('navegación conserva cada destino una vez y expande herramientas cuando la ruta activa está dentro',()=>{
 const routes=['dashboard','ventas','caja','finanzas','clientes','inventario','reportes','configuracion','dispositivos'];
 const selected=[],groups=[{heading:'Herramientas',items:routes.map(id=>({id,title:id,icon:()=>null}))}];
 const view=layout.navigation(C,groups,'configuracion',x=>selected.push(x)),buttons=nodes(view).filter(x=>x.type==='button');
 assert.equal(buttons.length,routes.length);assert.equal(new Set(buttons.map(x=>x.key)).size,routes.length);
 assert.equal(nodes(view).find(x=>x.type==='details').props.open,true);
 buttons.find(x=>x.key==='configuracion').props.onClick();assert.deepEqual(selected,['configuracion']);
});
