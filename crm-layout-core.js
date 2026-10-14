(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./tool-layout-core.js'));else root.DcarelaCrmLayout=factory(root.DcarelaToolLayout);})(typeof globalThis!=='undefined'?globalThis:this,function(tools){
  'use strict';
  const primaryRoutes=['dashboard','ventas','caja','finanzas','clientes','inventario','reportes'];
  const components=new WeakMap();
  function withPreferences(R,scope,ids,defaults,required){
    const [prefs,setPrefs]=R.useState(()=>tools.read(scope,ids,defaults,required));
    R.useEffect(()=>{const update=()=>setPrefs(tools.read(scope,ids,defaults,required));update();const changed=e=>{if(e.detail?.scope===scope)update();};window.addEventListener('dcarela:tools-changed',changed);return()=>window.removeEventListener('dcarela:tools-changed',changed);},[scope,ids.join('|')]);
    return tools.normalize(ids,prefs,defaults,required);
  }
  function runtime(R){if(!components.has(R))components.set(R,{
    Navigation:props=>renderNavigation(props.C,props,withPreferences(R,props.scope,props.groups.flatMap(g=>g.items).map(i=>i.id),primaryRoutes,['dashboard'])),
    Dashboard:props=>renderDashboard(props.C,props,withPreferences(R,'summary:'+props.business,['accounts','recent','state'],['accounts','recent','state'],['accounts']))
  });return components.get(R);}
  function navigation(C,groups,active,onSelect,R,scope='shell'){
    const props={C,groups,active,onSelect,scope};
    return R?C.jsx(runtime(R).Navigation,props):renderNavigation(C,props,tools.normalize(groups.flatMap(g=>g.items).map(i=>i.id),null,primaryRoutes,['dashboard']));
  }
  function renderNavigation(C,{groups,active,onSelect,scope},prefs){
    const items=groups.flatMap(g=>g.items),byId=new Map(items.map(i=>[i.id,i]));
    const button=item=>C.jsxs('button',{type:'button',className:'crm-nav-item'+(item.id===active?' is-active':''),'aria-current':item.id===active?'page':undefined,onClick:()=>onSelect(item.id),children:[C.jsx('span',{className:'crm-nav-icon',children:C.jsx(item.icon,{size:16,strokeWidth:1.7})}),C.jsx('span',{children:item.title}),item.badge?C.jsx('small',{className:'crm-nav-badge',children:item.badge}):null]},item.id);
    return C.jsxs('div',{className:'crm-navigation',children:[C.jsx('div',{className:'crm-primary-nav',children:prefs.order.filter(id=>!prefs.hidden.includes(id)||id===active).map(id=>button(byId.get(id)))}),C.jsx('button',{type:'button',className:'crm-organize-button',onClick:()=>tools.organize({scope,items,defaults:primaryRoutes,required:['dashboard']}),children:'Organizar'})]});
  }
  function dashboard(C,props,R){return R?C.jsx(runtime(R).Dashboard,{C,...props}):renderDashboard(C,props,tools.normalize(['accounts','recent','state'],null));}
  function renderDashboard(C,{snapshot:s,open,money,Chart,recent,business='dcarela'},prefs){
    const metric=(label,value,detail,route)=>C.jsxs('button',{type:'button',className:'crm-overview-metric',onClick:()=>open(route),children:[C.jsx('span',{children:label}),C.jsx('strong',{children:value}),C.jsx('small',{children:detail})]},label);
    const logo=name=>{const n=String(name).toLowerCase();return n.includes('popular')?'popular':n.includes('qik')?'qik':n.includes('reservas')?'banreservas':n.includes('bhd')?'bhd':null;};
    const widgets={
      accounts:C.jsxs('section',{className:'crm-widget crm-account-widget',children:[C.jsxs('header',{children:[C.jsx('h3',{children:'Cuentas del negocio'}),C.jsx('span',{children:s.accounts.length+' cuentas visibles'}),C.jsx('button',{type:'button',className:'crm-text-action',onClick:()=>open('finanzas'),children:'Abrir Finanzas'})]}),C.jsx('div',{className:'crm-summary-accounts',children:s.accounts.map(account=>C.jsxs('button',{type:'button',className:'crm-summary-account',onClick:()=>tools.requestAccount(account.id,business,open),children:[C.jsx('span',{className:'crm-summary-account-logo',children:logo(account.name)?C.jsx('img',{src:'/bancos/'+logo(account.name)+'.png',alt:''}):'$'}),C.jsxs('span',{children:[C.jsx('b',{children:account.name}),C.jsx('small',{children:account.type})]}),C.jsx('strong',{children:money(account.balanceCents)})]},account.id))})]},'accounts'),
      recent:C.jsxs('details',{className:'crm-widget crm-activity-widget',children:[C.jsx('summary',{children:'Ventas recientes'}),C.jsx('button',{type:'button',className:'crm-text-action',onClick:()=>open('ventas'),children:'Ver todas'}),s.recentSales.length?C.jsx('div',{className:'crm-activity-list',children:s.recentSales.slice(0,5).map(event=>C.jsxs('button',{type:'button',onClick:()=>open('ventas'),children:[C.jsxs('span',{children:[C.jsx('b',{children:'Ticket '+(event.payload?.folio||event.entity_id||'')}),C.jsx('small',{children:new Date(event.created_at_local).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})})]}),C.jsx('strong',{children:money(event.payload?.total_centavos??event.payload?.totalCentavos??0)})]},event.entity_id))}):C.jsx('p',{className:'crm-empty',children:recent?'Todavia no hay ventas validas hoy.':'No hay datos de ventas sincronizados para hoy.'})]},'recent'),
      state:C.jsxs('details',{className:'crm-widget crm-shortcuts-widget',children:[C.jsx('summary',{children:'Estado de consulta y accesos'}),C.jsxs('div',{className:'crm-terminal-state',children:[C.jsx('strong',{children:s.onlineDevices??'--'}),C.jsxs('span',{children:['Terminales',C.jsx('small',{children:'senal reciente < 10 min'})]})]}),C.jsx('p',{children:s.alerts+' alerta(s) requieren revisión'}),C.jsx('div',{className:'crm-shortcut-list',children:[['Revisar dispositivos','dispositivos'],['Caja y turnos','caja'],['Clientes y créditos','clientes'],['Productos e inventario','inventario']].map(([label,route])=>C.jsxs('button',{type:'button',onClick:()=>open(route),children:[C.jsx('span',{children:label}),C.jsx('span',{'aria-hidden':true,children:'›'})]},route))})]},'state')
    };
    return C.jsxs('div',{className:'crm-dashboard',children:[
      C.jsxs('section',{className:'crm-sales-hero',children:[C.jsxs('header',{children:[C.jsxs('button',{type:'button',className:'crm-net-sales',onClick:()=>open('ventas'),children:[C.jsx('span',{children:'Ventas netas de hoy'}),C.jsx('strong',{children:money(s.totalCents)}),C.jsx('small',{children:'Ventas confirmadas · abre el detalle'})]}),C.jsx('button',{type:'button',className:'crm-text-action',onClick:()=>open('reportes'),children:'Ver reporte'})]}),C.jsx('div',{className:'crm-trend-chart',children:C.jsx(Chart,{points:s.salesSeries})}),C.jsxs('div',{className:'crm-overview-metrics',children:[metric('Tickets',String(s.saleCount),'ventas de hoy','ventas'),metric('Promedio',money(s.averageCents),'por ticket','reportes'),metric('Terminales',String(s.onlineDevices??'--'),'señal reciente','dispositivos')]})]}),
      C.jsx('div',{className:'crm-dashboard-tools',children:C.jsx('button',{type:'button',className:'crm-organize-button',onClick:()=>tools.organize({scope:'summary:'+business,items:[{id:'accounts',title:'Cuentas del negocio'},{id:'recent',title:'Ventas recientes'},{id:'state',title:'Estado de consulta y accesos'}],required:['accounts']}),children:'Organizar Resumen'})}),
      C.jsx('div',{className:'crm-dashboard-board',children:prefs.order.filter(id=>!prefs.hidden.includes(id)).map(id=>widgets[id])})
    ]});
  }
  return {navigation,dashboard};
});
