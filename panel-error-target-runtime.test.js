const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/panel.js','utf8');
function harness(){
 const permanent={id:'iaError',removed:false,remove(){this.removed=true;}};
 const virtual={id:'virtualCashError',removed:false,remove(){this.removed=true;}};
 const transient={id:'',removed:false,remove(){this.removed=true;}};
 const status={hidden:false,textContent:'',setAttribute(){},append(){}};
 const view={querySelector(){return status;},querySelectorAll(selector){if(selector==='p.error')return [permanent,virtual,transient];if(selector==='p[data-module-error]')return [transient];throw new Error('Unexpected error selector: '+selector);},setAttribute(){},insertAdjacentHTML(_position,html){this.inserted=html;}};
 const context={$:()=>view,document:{querySelector:()=>view,createElement:()=>status},loaders:{asistente:async()=>{}},console,verEstado(){},esc:String,setTimeout,clearTimeout};
 const moduleStart=source.indexOf('  const moduleLoads = new Map();');
 const moduleEnd=source.indexOf('  function hideSaleConsoleForRouteChange()',moduleStart);
 const errorStart=source.indexOf('  function mostrarError('),errorEnd=source.indexOf('  function nombreSucursal(',errorStart);
 vm.createContext(context);vm.runInContext(source.slice(errorStart,errorEnd)+source.slice(moduleStart,moduleEnd),context);
 return{context,permanent,virtual,transient,view};
}
test('cargar un modulo conserva los destinos de errores del asistente y de Caja virtual',async()=>{
 const h=harness();assert.equal(await h.context.cargarModulo('asistente'),true);
 assert.equal(h.permanent.removed,false,'iaError debe permanecer para enviar mensajes');
 assert.equal(h.virtual.removed,false,'virtualCashError debe permanecer para validar apertura/cierre');
 assert.equal(h.transient.removed,true,'el fallo transitorio de la carga anterior sí desaparece');
});
test('mostrar un error de carga conserva controles operativos y marca solo su propio aviso',()=>{
 const h=harness();h.context.mostrarError('asistente',new Error('Consulta fallida'));
 assert.equal(h.permanent.removed,false);assert.equal(h.virtual.removed,false);
 assert.match(h.view.inserted,/data-module-error/);assert.match(h.view.inserted,/Consulta fallida/);
});

async function assistantHarness(request){
 const h=harness();await h.context.cargarModulo('asistente');
 const input={value:'Solo consulta: saldo de Plaza',style:{},focus(){},dispatchEvent(){}};
 const messages={children:[],querySelector(){return null;},insertAdjacentHTML(){},scrollTop:0,scrollHeight:0};
 const nodes={iaInput:input,iaError:h.permanent,btnIaEnviar:{disabled:false},iaMessages:messages,
  iaActiveTool:{textContent:'',classList:{add(){}}},iaModel:{value:'auto'},iaDepth:{value:'deep'},
  iaInitiative:{value:'proactive'},iaDetail:{value:'extended'},iaModelEffective:{textContent:''}};
 Object.assign(h.context,{$:id=>id==='iaError'&&h.permanent.removed?null:nodes[id],
  extractLearningsFromMessage(){return [];},iaMessageHtml(){return '';},renderIaAttachments(){},getIaLearnedRules(){return [];},
  iaRequest:request,async cargarConversacionesIa(){},async abrirConversacionIa(){},renderIaLearnings(){},toast(){},Event:class Event{}});
 vm.runInContext('let iaBusy=false,iaAttachments=[],iaConversationId=null,canEdit=false;const iaStatusCache={configured:true,capabilities:{can_use:true}};const IA_EMPTY_HTML="";',h.context);
 const start=source.indexOf('  async function enviarMensajeIa()'),end=source.indexOf('  async function cargarAsistente()',start);
 vm.runInContext(source.slice(start,end),h.context);
 return {...h,input,nodes};
}

test('tras cargar el asistente se envian dos consultas y se libera el boton',async()=>{
 const requests=[];const h=await assistantHarness(async(action,payload)=>{requests.push({action,payload});return {conversation:{id:'test-only'},effective_model:'local-test'};});
 await h.context.enviarMensajeIa();
 h.input.value='Segunda consulta sin movimientos';await h.context.enviarMensajeIa();
 assert.equal(requests.length,2);assert.equal(requests[0].payload.message,'Solo consulta: saldo de Plaza');
 assert.equal(h.nodes.btnIaEnviar.disabled,false);assert.equal(vm.runInContext('iaBusy',h.context),false);
});

test('si falla el proveedor se conserva el borrador y se puede reintentar',async()=>{
 let attempts=0;const h=await assistantHarness(async()=>{attempts++;throw new Error('Proveedor no disponible');});
 await h.context.enviarMensajeIa();
 assert.equal(h.input.value,'Solo consulta: saldo de Plaza');assert.equal(h.permanent.textContent,'Proveedor no disponible');
 assert.equal(h.nodes.btnIaEnviar.disabled,false);assert.equal(vm.runInContext('iaBusy',h.context),false);
 await h.context.enviarMensajeIa();assert.equal(attempts,2);
});
