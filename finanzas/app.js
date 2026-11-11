import {loadFinance,commitAction,isLive} from './data-source.js';
const emulatorWritesAllowed=()=>isLive && ['localhost','127.0.0.1'].includes(location.hostname)
 && String(window.__DCARELA_FIREBASE_CONFIG?.projectId||'').startsWith('demo-')
 && window.__DCARELA_FINANCE_STAGING_WRITE__===true;
const core=window.DcarelaFinanceCore, money=window.DcarelaMoneyManagerCore, simple=window.DcarelaSimpleFinanceCore;
if(!core || !money || !simple) throw new Error('No se pudieron cargar los módulos financieros incluidos en el paquete.');
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const ico=(id,cls='')=>`<svg class="ico ${cls}" aria-hidden="true"><use href="#ic-${id}"></use></svg>`;
const today=core.businessDay(new Date());
const initialMonth=today.slice(0,7);
const initialMonthEnd=new Date(Date.UTC(Number(initialMonth.slice(0,4)),Number(initialMonth.slice(5,7)),0)).toISOString().slice(0,10);
const params=new URLSearchParams(location.search);
const branches=isLive?{}:{'sucursal-a':'Sucursal A · Demo','sucursal-b':'Sucursal B · Demo'};
const FINANCE_VIEWS=[['diario','Diario'],['calendario','Calendario'],['semana','Semana'],['mes','Mes'],['resumen','Resumen'],['estadisticas','Estadísticas']];
const state={business:params.get('b')||(isLive?'':'sucursal-a'),loading:true,error:'',authRequired:false,loginBusy:false,loginError:'',loginEmail:'',data:null,tab:'home',route:'',financeView:'diario',
 month:today.slice(0,7),day:today,theme:localStorage.getItem('dcarela-mm-theme')==='dark'?'dark':'light',
 currency:'DOP',statsType:'gasto',modal:null,accountId:null,movementId:null,accountDraft:null,
 search:{query:'',type:'',category:'',from:`${initialMonth}-01`,to:initialMonthEnd,accountIds:[]},searched:false,
 entryType:'gasto',entryDigits:'',entryAccount:'',entryDest:'',entryCategory:'',entryNote:'',entryDate:today,
 reconcileDigits:'',reconcileReason:'',editingNote:'',pendingRequestId:null,busy:false,financeFilterOpen:false};
const nMonth=(m,delta)=>{const [y,n]=m.split('-').map(Number);const d=new Date(Date.UTC(y,n-1+delta,1));return d.toISOString().slice(0,7)};
const nDay=(day,delta)=>{const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+delta)).toISOString().slice(0,10)};
const longMonth=m=>new Intl.DateTimeFormat('es-DO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${m}-15T12:00:00Z`));
const niceDay=date=>new Intl.DateTimeFormat('es-DO',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const weekDay=date=>['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][new Date(`${date}T12:00:00Z`).getUTCDay()];
function moneyText(cents,currency='DOP',compact=false){
 if(!Number.isSafeInteger(cents)) return 'No verificado';
 const symbol=currency==='USD'?'US$':currency==='DOP'?'RD$':`${esc(currency)} `;
 const neg=cents<0?'−':'';let abs=Math.abs(cents);
 if(compact && abs>=100000000){const t=Math.floor((abs+5000000)/10000000);return `${neg}${symbol}${String(Math.floor(t/10))}${t%10?'.'+t%10:''}M`;}
 if(compact && abs>=100000){const t=Math.floor((abs+5000)/10000);return `${neg}${symbol}${Math.floor(t/10)}${t%10?'.'+t%10:''}K`;}
 const major=Math.floor(abs/100).toLocaleString('en-US');const minor=String(abs%100).padStart(2,'0');
 return `${neg}${symbol}${major}.${minor}`;
}
const accounts=()=>state.data?.accounts||[];
const rows=()=>state.data?.movements||[];
const cats=()=>state.data?.categories||[];
const account=id=>accounts().find(a=>a.id===id);
const cat=id=>cats().find(c=>c.id===id);
const curr=row=>row.moneda||account(row.cuenta_id)?.moneda||'DOP';
const categoryMap=()=>Object.fromEntries(cats().map(c=>[c.id,c.nombre]));
const accountCurrencies=()=>Object.fromEntries(accounts().map(a=>[a.id,a.moneda]));
const matchingMonth=row=>String(row.fecha||'').startsWith(`${state.month}-`);
const active=()=>money.activeMovements(rows());
const getMonthRows=(currency=state.currency)=>rows().filter(r=>matchingMonth(r)&&curr(r)===currency);
const monthTotals=(currency=state.currency)=>core.summarizeMovements(getMonthRows(currency),`${state.month}-01`,`${state.month}-31`);
const accountBalance=a=>core.effectiveAccountBalance(a,rows());
const activeByAccount=a=>rows().filter(r=>r.cuenta_id===a.id||r.cuenta_destino_id===a.id).sort((x,y)=>`${y.fecha} ${y.hora||''}`.localeCompare(`${x.fecha} ${x.hora||''}`));
function salePayload(event){if(event?.payload && typeof event.payload==='object')return event.payload;try{return JSON.parse(event?.payload||'{}')}catch{return {}}}
function saleForMovement(m){
 if(m.origen!=='pos_venta' && !m.venta_id && !m.sync_event_id && !m.metadata?.sale_identifiers?.length)return null;
 const folio=String(m.venta_folio||'').toLowerCase();
 const keys=[m.venta_id,m.ventaId,m.sync_event_id,...(m.metadata?.sale_identifiers||[])].map(x=>String(x||'').trim().toLowerCase()).filter(x=>x&&x!==folio);
 return (state.data?.sales||[]).find(e=>{const p=salePayload(e);return [e.id,e.event_id,e.entity_id,p.ventaId,p.venta_id,p.saleId,p.sale_id].some(x=>keys.includes(String(x||'').trim().toLowerCase()))})||null;
}
function movementTitle(m){const sale=saleForMovement(m);if(!sale)return m.origen==='pos_venta'||m.venta_id?`Venta de Caja${m.venta_folio?' #'+m.venta_folio:''}`:m.descripcion||m.categoria||'Movimiento';const p=salePayload(sale);return `Venta ${p.folio?'#'+p.folio:''}${p.clienteNombre||p.cliente_nombre?' · '+(p.clienteNombre||p.cliente_nombre):''}`.trim()}
const currencyOption=(value)=>`<option value="${value}" ${state.currency===value?'selected':''}>${value==='DOP'?'DOP · RD$':'USD · US$'}</option>`;
function note(msg){const el=$('toast-region');el.innerHTML=`<div role="status" class="toast">${esc(msg)}</div>`;clearTimeout(note._timer);note._timer=setTimeout(()=>el.replaceChildren(),3200)}
function customOptions(items,selected){return items.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.nombre)}</option>`).join('')}
const cashAccountOptions=(selected,skip='')=>accounts().filter(a=>a.id!==skip&&a.tipo!=='tarjeta_credito').map(a=>`<option value="${esc(a.id)}" ${selected===a.id?'selected':''}>${esc(a.nombre)} · ${a.moneda}</option>`).join('');
function setTheme(theme){state.theme=theme;document.documentElement.dataset.theme=theme;localStorage.setItem('dcarela-mm-theme',theme);render()}
let loadSerial=0,lastLoadedAt=0;
async function load(){const serial=++loadSerial;state.loading=true;state.error='';state.authRequired=false;state.data=null;render();try{
 if(params.get('fail')==='1')throw new Error('Error de lectura simulado: no se pudo obtener el libro financiero.');
 const data=await loadFinance(state.business);
 if(serial!==loadSerial)return;
 state.business=data.businessId;
 for(const key of Object.keys(branches))delete branches[key];
 for(const b of data.authorizedBusinesses)branches[b.id]=b.name;
 for(const a of data.accounts){const balance=core.effectiveAccountBalance(a,data.movements);if(!Number.isSafeInteger(balance))throw new Error('Saldo fuera de rango o sin verificación para una cuenta.')}state.data=data;state.currency='DOP';
 state.search.accountIds=data.accounts.map(a=>a.id);
 state.entryAccount=data.accounts.find(a=>a.moneda==='DOP'&&a.tipo!=='tarjeta_credito')?.id||data.accounts[0]?.id||'';
 state.entryDest=data.accounts.find(a=>a.moneda==='DOP'&&a.id!==state.entryAccount)?.id||'';
 state.entryCategory=data.categories.find(c=>c.tipo===state.entryType)?.id||'';
 lastLoadedAt=Date.now();
 }catch(e){if(serial===loadSerial){state.error=e?.message||'No fue posible comprobar los datos.';state.authRequired=e?.code==='AUTH_REQUIRED';}}finally{if(serial===loadSerial){state.loading=false;render()}}}
function renderHeader(){return `<header class="topbar"><div class="brand-block"><img class="brand-logo" src="./icons/dcarela-logo.png" width="38" height="38" alt="Logo D’ Carela"><div><div class="brand-title">D’ Carela</div><div class="brand-sub">FINANZAS</div></div></div><div class="top-actions">
 <button class="round-button theme-toggle" data-do="theme" aria-label="Cambiar a tema ${state.theme==='dark'?'claro':'oscuro'}" title="Cambiar a tema ${state.theme==='dark'?'claro':'oscuro'}">${ico(state.theme==='dark'?'sun':'moon')}</button>
 <button class="round-button" data-do="refresh" aria-label="Actualizar movimientos de Caja" title="Actualizar movimientos de Caja">${ico('refresh')}</button>
 </div></header>${!isLive?`<div class="demo-ribbon"><span><span class="dot"></span><strong>PROTOTIPO</strong> · Datos 100% ficticios</span><span>Sin conexión real</span></div>`:emulatorWritesAllowed()?`<div class="demo-ribbon"><span>Emulador Firebase aislado</span><span>Datos ficticios</span></div>`:`<div class="demo-ribbon"><span>Libro Firebase del CRM · solo lectura</span><span>Escrituras en validación</span></div>`}`}
function renderBottom(){const nav=[['home','house','Resumen'],['finance','bars','Finanzas'],['search','search','Buscar'],['more','more','Más']];const selected=state.tab;
 if(state.authRequired||(isLive&&state.loading&&!state.data))return '';
 return `<nav class="bottom-nav" aria-label="Navegación principal">${nav.map(([id,icon,label])=>`<button class="tab-button ${id===selected?'is-active':''}" data-do="tab" data-tab="${id}" ${id===selected?'aria-current="page"':''}><span class="tab-icon">${ico(icon)}</span><span class="tab-label">${label}</span></button>`).join('')}</nav><button class="fab" data-do="entry" aria-label="Registrar un movimiento" title="Registrar un movimiento">${ico('plus')}</button>`}
function summaryCard(){const balances=core.accountTotalsByCurrency(accounts(),rows());const dop=balances.find(x=>x.currency==='DOP');const usd=balances.find(x=>x.currency==='USD');const totals=monthTotals('DOP');
 return `<div class="hero"><div class="hero-label">Saldo de cuentas incluidas · DOP</div><div class="hero-main balance-text animated-amount">${moneyText(dop?.centavos??0)}</div>${usd?`<div class="hero-usd">Saldo separado en USD: ${moneyText(usd.centavos,'USD')}</div>`:''}
 <div class="hero-bottom"><div><span>Resultado · ${longMonth(state.month)}</span><strong class="${totals.ingresos_centavos>=totals.gastos_centavos?'income-text':'expense-text'}">${moneyText(totals.ingresos_centavos-totals.gastos_centavos,'DOP')}</strong></div></div></div>`}
function metricCard(label,value,kind){return `<div class="metric ${kind}"><div class="metric-name">${label}</div><strong title="${esc(value)}">${value}</strong><small>${longMonth(state.month)}</small></div>`}
// Íconos institucionales entregados en el ZIP original; sin redibujar sus marcas.
const BANK_ASSETS=Object.freeze({popular:'popular',banreservas:'banreservas',bhd:'bhd',qik:'qik'});
function bankKey(a){
 const claimed=String(a.logo||a.banco||a.bank||a.codigo_banco||'').trim().toLowerCase();
 if(Object.hasOwn(BANK_ASSETS,claimed))return claimed;
 const name=String(a.nombre||'').toLocaleLowerCase('es');
 if(/banreservas|banco de reservas/.test(name))return 'banreservas';
 if(/popular/.test(name))return 'popular';
 if(/\bbhd\b/.test(name))return 'bhd';
 if(/\bqik\b/.test(name))return 'qik';
 return null;
}
function accountBadge(a,large=false){
 const cls=`account-icon glass-icon ${large?'large':''}`;
 const bank= a.tipo==='banco'?bankKey(a):null;
 if(bank)return `<span class="${cls} bank-logo" data-bank="${bank}"><img src="./assets/bancos/${bank}.png" alt="" loading="eager" decoding="async"></span>`;
 return `<span class="${cls}" data-kind="${esc(a.tipo)}">${ico(a.tipo==='banco'?'bank':a.tipo==='tarjeta_credito'?'card':'wallet')}</span>`;
}
function accountRows(list=accounts()){return list.map(a=>`<button class="account-row" data-do="account" data-id="${esc(a.id)}">${accountBadge(a)}<span class="row-copy"><b>${esc(a.nombre)}</b><small>${a.tipo==='tarjeta_credito'?'Tarjeta de crédito':a.tipo==='banco'?'Cuenta bancaria':'Efectivo'} · ${a.moneda}${a.incluir_en_total===false?' · Excluida del total':''}</small></span><span class="row-amount ${accountBalance(a)<0?'expense-text':'balance-text'}"><span title="${moneyText(accountBalance(a),a.moneda)}">${moneyText(accountBalance(a),a.moneda,Math.abs(accountBalance(a))>=100000000)}</span><span class="tiny">${a.tipo==='tarjeta_credito'?'Deuda / saldo':'Ver historial'}</span></span></button>`).join('')}
function movementsUI(list,limit=null){const show=limit?list.slice(0,limit):list;if(!show.length)return '<div class="empty">Sin movimientos para este filtro.</div>';
 return show.map(m=>`<button class="movement-row ${m.estado==='anulado'?'is-void':''}" data-do="movement" data-id="${esc(m.id)}"><span class="row-copy"><b>${esc(movementTitle(m))}</b><small>${esc(cat(m.categoria_id)?.nombre|| (m.tipo==='transferencia'?'Transferencia':'Sin categoría'))} · ${esc(account(m.cuenta_id)?.nombre||'Cuenta')}${m.estado==='anulado'?' · Anulado':''}</small></span><span class="row-amount ${m.tipo} ${m.tipo==='ingreso'?'income-text':m.tipo==='gasto'?'expense-text':'warning-text'}">${m.tipo==='gasto'?'−':m.tipo==='ingreso'?'+':''}<span title="${moneyText(m.monto_centavos,curr(m))}">${moneyText(m.monto_centavos,curr(m),m.monto_centavos>=100000000)}</span><span class="tiny">${esc(m.fecha?.slice(8,10)||'')}</span></span></button>`).join('')}
function groupedByDate(list){if(!list.length)return '<div class="card"><div class="empty">No hay movimientos en este periodo.</div></div>';const bucket=new Map();for(const m of list){if(!bucket.has(m.fecha))bucket.set(m.fecha,[]);bucket.get(m.fecha).push(m)}
 return [...bucket.entries()].sort(([a],[b])=>b.localeCompare(a)).map(([day,items])=>{const isoDay=new Date(`${day}T12:00:00Z`).getUTCDay();const byCurrency=[...new Set(items.map(curr))].map(c=>{const sub=core.summarizeMovements(items.filter(m=>curr(m)===c),day,day);return moneyText(sub.ingresos_centavos-sub.gastos_centavos,c)}).join(' · ');return `<div class="date-section"><div class="date-head"><div class="date-box"><b>${day.slice(8)}</b><small>${['dom','lun','mar','mié','jue','vie','sáb'][isoDay]}</small></div><div class="date-heading"><b>${esc(weekDay(day))}</b><small>${esc(niceDay(day))}</small></div><span class="date-net ${items.length&&core.summarizeMovements(items.filter(m=>curr(m)===state.currency),day,day).ingresos_centavos>=core.summarizeMovements(items.filter(m=>curr(m)===state.currency),day,day).gastos_centavos?'income-text':'expense-text'}" title="${esc(byCurrency)}">${esc(byCurrency)}</span></div><div class="card">${movementsUI(items)}</div></div>`}).join('')}
function flowChart(currency=state.currency){const groups=simple.group(getMonthRows(currency),state.month,'day',accountCurrencies()).reverse();
 if(!groups.length)return '<div class="empty">Sin movimientos para graficar este mes.</div>';
 const entries=groups.map(g=>({day:g.key,income:g.currencies[currency]?.income||0,expense:g.currencies[currency]?.expenses||0}));
 const max=Math.max(1,...entries.flatMap(e=>[e.income,e.expense]));const left=12,right=328,top=14,bottom=115;
 const x=i=>left+i*(right-left)/Math.max(1,entries.length-1);
 const y=v=>bottom-Math.sqrt(Math.max(0,v)/max)*(bottom-top);
 const path=kind=>entries.map((e,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(e[kind]).toFixed(1)}`).join(' ');
 const marks=[0,Math.floor((entries.length-1)/2),entries.length-1].filter((v,i,a)=>a.indexOf(v)===i);
 return `<section class="flow-panel" aria-label="Tendencia diaria de ${esc(longMonth(state.month))}"><div class="flow-head"><h2>Movimiento del mes</h2><small>${esc(currency)} · ${entries.length} días con actividad</small></div><svg class="flow-svg" viewBox="0 0 340 150" role="img" aria-label="Ingresos y gastos confirmados por día"><path class="flow-grid" d="M12 14H328 M12 64H328 M12 115H328"/><path class="flow-income" pathLength="1" d="${path('income')}"/><path class="flow-expense" pathLength="1" d="${path('expense')}"/>${marks.map(i=>`<text x="${x(i).toFixed(1)}" y="141" text-anchor="${i===0?'start':i===entries.length-1?'end':'middle'}">${entries[i].day.slice(8)}</text>`).join('')}</svg><div class="flow-legend"><span>— Ingresos</span><span>┄ Gastos</span></div></section>`}
function categoryChart(currency=state.currency){const b=simple.breakdown(rows(),state.month,'gasto',currency,categoryMap(),accountCurrencies());
 return `<section class="category-panel"><div class="section-head"><h2>Gastos por categoría</h2><small>${esc(currency)}</small></div>${b.items.length?b.items.slice(0,5).map(item=>`<div class="category-bar-row"><div><span>${esc(item.nombre)}</span><strong>${moneyText(item.centavos,currency)}</strong></div><div class="category-track"><span style="width:${Math.max(1,item.porcentaje)}%"></span></div></div>`).join(''):'<div class="empty">Sin gastos en este periodo.</div>'}</section>`}
function dashboardSignals(){const t=monthTotals('DOP'),income=t.ingresos_centavos,expense=t.gastos_centavos;
 const budgets=state.data?.budgets||[];const healthy=budgets.filter(b=>{const spent=core.summarizeMovements(rows().filter(m=>m.categoria_id===b.categoria_id),`${state.month}-01`,`${state.month}-31`).gastos_centavos;return b.monto_centavos>0&&spent*100/b.monto_centavos<Number(b.alerta_porcentaje||85)}).length;
 const signals=[['Margen disponible',income?`${Math.round((income-expense)*100/income)}%`:'—',income?Math.max(0,Math.min(100,Math.round((income-expense)*100/income))):0],['Cobertura de gastos',expense?`${Math.round(income*100/expense)}%`:'—',expense?Math.max(0,Math.min(100,Math.round(income*100/expense))):0],['Presupuestos sanos',budgets.length?`${healthy} de ${budgets.length}`:'Sin presupuestos',budgets.length?healthy*100/budgets.length:0]];
 return `<section class="signals-panel"><div class="section-head"><h2>Indicadores</h2><small>${esc(longMonth(state.month))}</small></div>${signals.map(([label,value,pct])=>`<div class="signal-row"><div><span>${label}</span><strong>${value}</strong></div><div class="category-track"><span style="width:${pct}%"></span></div></div>`).join('')}</section>`}
function renderHome(){const total=monthTotals('DOP');const acct=accounts().filter(a=>a.estado!=='eliminada');
 return `<main class="page" id="main"><section class="screen-intro"><div class="eyebrow">VISTA GENERAL</div><h1 class="page-title">Resumen</h1><div class="subline">${esc(branches[state.business]||state.business)} · ${esc(longMonth(state.month))}</div></section>
 ${summaryCard()}<div class="metric-grid">${metricCard('Ingresos del mes','+ '+moneyText(total.ingresos_centavos),'income')}${metricCard('Gastos del mes','− '+moneyText(total.gastos_centavos),'expense')}</div>
 ${flowChart('DOP')}${dashboardSignals()}${categoryChart('DOP')}
 <div class="section-head"><h2>Cuentas del negocio</h2><small>${acct.length} cuentas</small></div><div class="card">${accountRows(acct)}</div><div class="soft-note">Los saldos de monedas distintas no se convierten ni se suman entre sí.</div>
 <div class="section-head"><h2>Actividad reciente</h2><button class="round-button" data-do="tab" data-tab="finance" aria-label="Ver todos los movimientos">${ico('chevron')}</button></div><div class="card">${movementsUI(active().slice(0,6))}</div></main>`}
function periodPicker(){return `<div class="month-swipe" data-swipe="month" role="group" tabindex="0" aria-label="${esc(longMonth(state.month))}. Desliza horizontalmente para cambiar mes"><span>${esc(longMonth(state.month))}</span><small>Desliza para cambiar mes</small></div>`}
function financeNavigation(){const index=Math.max(0,FINANCE_VIEWS.findIndex(([id])=>id===state.financeView));
 return `<div class="finance-filter" data-swipe="view" role="group" tabindex="0" aria-label="${FINANCE_VIEWS[index][1]}. Desliza horizontalmente para cambiar vista"><div class="filter-current"><span>VISTA ${index+1} DE ${FINANCE_VIEWS.length}</span><strong>${FINANCE_VIEWS[index][1]}</strong></div><button class="filter-open" data-do="filter-toggle" aria-label="Mostrar filtros" aria-expanded="${state.financeFilterOpen}">${ico('filter')}</button></div>${state.financeFilterOpen?`<div class="finance-filter-menu" role="group" aria-label="Filtros de finanzas">${FINANCE_VIEWS.map(([id,label])=>`<button data-do="view" data-view="${id}" class="${id===state.financeView?'selected':''}" ${id===state.financeView?'aria-current="true"':''}>${label}</button>`).join('')}<label class="filter-currency">Moneda<select name="currency" aria-label="Moneda de la vista">${currencyOption('DOP')}${currencyOption('USD')}</select></label></div>`:''}`}
function totalsUI(){const daily=state.financeView==='diario',t=daily?core.summarizeMovements(getMonthRows(),state.day,state.day):monthTotals(),scope=daily?'del día':'del mes';return `<div class="triple-summary" role="group" aria-label="Totales ${daily?`del ${niceDay(state.day)}`:`de ${longMonth(state.month)}`}"><div><small>Ingresos ${scope}</small><strong class="income-text" title="${moneyText(t.ingresos_centavos,state.currency)}">+${moneyText(t.ingresos_centavos,state.currency,t.ingresos_centavos>=100000000)}</strong></div><div><small>Gastos ${scope}</small><strong class="expense-text" title="${moneyText(t.gastos_centavos,state.currency)}">−${moneyText(t.gastos_centavos,state.currency,t.gastos_centavos>=100000000)}</strong></div><div><small>Resultado ${scope}</small><strong class="${t.ingresos_centavos>=t.gastos_centavos?'income-text':'expense-text'}">${moneyText(t.ingresos_centavos-t.gastos_centavos,state.currency,Math.abs(t.ingresos_centavos-t.gastos_centavos)>=100000000)}</strong></div></div>`}
function renderDay(){const selected=active().filter(r=>r.fecha===state.day&&curr(r)===state.currency);
 const days=Array.from({length:7},(_,i)=>nDay(state.day,i-3));
 return `<section class="daily-picker" aria-label="Seleccionar día"><div class="daily-picker-head"><div><small>DÍA SELECCIONADO</small><strong>${esc(niceDay(state.day))}</strong></div><label class="daily-calendar" aria-label="Elegir fecha en calendario">${ico('calendar','sm')}<input name="finance-day" type="date" value="${state.day}" aria-label="Elegir fecha"></label></div><div class="daily-days" data-swipe="day" aria-label="Desliza para cambiar de día">${days.map(day=>`<button class="daily-day ${day===state.day?'active':''}" data-do="select-day" data-day="${day}" ${day===state.day?'aria-current="date"':''}><small>${esc(weekDay(day).slice(0,3))}</small><strong>${Number(day.slice(8))}</strong></button>`).join('')}</div><p class="daily-hint">Desliza para ver otro día</p></section><div class="section-head"><h2>Movimientos del día</h2><small>${selected.length}</small></div><div class="card">${movementsUI(selected)}</div>`}
function renderCalendar(){const cm=money.calendar(getMonthRows(),state.month);const byDate=Object.fromEntries(cm.cells.filter(c=>!c.outside).map(c=>[c.date,c]));
 // El motor del calendario trabaja con una sola moneda aquí (filtrada antes).
 const cells=cm.cells.map(c=>c.outside?'<span class="day-cell outside" aria-hidden="true"></span>':`<button class="day-cell ${state.day===c.date?'active':''} ${c.date===today?'today':''}" data-do="day" data-day="${c.date}" aria-label="${c.day} de ${longMonth(state.month)}"><span class="day-number">${c.day}</span>${c.income?`<span class="tiny-num income">${moneyText(c.income,state.currency,true)}</span>`:'<span class="tiny-num">&nbsp;</span>'}${c.expenses?`<span class="tiny-num expense">${moneyText(c.expenses,state.currency,true)}</span>`:'<span class="tiny-num">&nbsp;</span>'}</button>`).join('');
 const selected=active().filter(m=>m.fecha===state.day&&curr(m)===state.currency);return `<div class="card calendar-card"><div class="weekdays">${['L','M','X','J','V','S','D'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></div><p class="soft-note">Selecciona un día. Importes en formato compacto para conservar la legibilidad.</p><div class="section-head"><h2>${niceDay(state.day)}</h2><small>${selected.length} movimientos</small></div><div class="card">${movementsUI(selected)}</div>`}
function periodGroups(which){const list=simple.group(getMonthRows(),state.month,which,accountCurrencies());if(!list.length)return '<div class="card"><div class="empty">Sin movimientos en este mes.</div></div>';
 return `<div class="period-stack">${list.map(g=>{const sums=g.currencies[state.currency]||{income:0,expenses:0,result:0};const top=sums.income+sums.expenses;const incomePercent=top>0?Math.round(sums.income*100/top):0;return `<section class="period-card"><div class="period-line"><span>${which==='week'?`Semana del ${esc(niceDay(g.key))}`:esc(longMonth(state.month))}</span></div><div class="horizontal-bar"><span class="gain" style="width:${incomePercent}%"></span><span class="spend" style="width:${100-incomePercent}%"></span></div><div class="period-values"><span class="income-text">+ ${moneyText(sums.income,state.currency)}</span><span class="expense-text">− ${moneyText(sums.expenses,state.currency)}</span></div><div class="soft-note" style="margin-bottom:0">${g.items.length} movimientos · Resultado ${moneyText(sums.result,state.currency)}</div><div class="period-detail">${groupedByDate(g.items.filter(m=>curr(m)===state.currency))}</div></section>`}).join('')}</div>`}
function renderFinSummary(){const t=monthTotals();
 return `${flowChart()}<div class="section-head"><h2>Detalle del periodo</h2><small>${t.movements.length} movimientos</small></div><div class="card"><div class="info-line"><span>Ingresos</span><strong class="income-text">${moneyText(t.ingresos_centavos,state.currency,t.ingresos_centavos>=100000000)}</strong></div><div class="info-line"><span>Gastos</span><strong class="expense-text">${moneyText(t.gastos_centavos,state.currency,t.gastos_centavos>=100000000)}</strong></div><div class="info-line"><span>Resultado</span><strong>${moneyText(t.ingresos_centavos-t.gastos_centavos,state.currency,Math.abs(t.ingresos_centavos-t.gastos_centavos)>=100000000)}</strong></div></div>${categoryChart()}<div class="section-head"><h2>Movimientos del mes</h2></div>${groupedByDate(active().filter(r=>matchingMonth(r)&&curr(r)===state.currency))}<p class="soft-note">Los resultados no incluyen transferencias entre cuentas.</p>`}
function getStat(){return simple.breakdown(rows(),state.month,state.statsType,state.currency,categoryMap(),accountCurrencies())}
function statList(short=false){const b=getStat();const tones=['var(--tone-1)','var(--tone-2)','var(--tone-3)','var(--tone-4)','var(--tone-5)'];return `<div class="card" style="padding:5px 15px">${b.items.slice(0,short?4:undefined).map((x,i)=>`<div class="stat-row"><span class="stat-dot" style="background:${tones[i%tones.length]}"></span><span class="cat">${esc(x.nombre)}<small>${x.porcentaje}% · ${x.movimientos} mov.</small></span><strong class="${state.statsType==='ingreso'?'income-text':'expense-text'}">${moneyText(x.centavos,state.currency)}</strong></div>`).join('')||'<div class="empty">No hay categorías para el filtro.</div>'}</div>`}
function renderStats(){const b=getStat();let total=0;const tones=['var(--tone-1)','var(--tone-2)','var(--tone-3)','var(--tone-4)','var(--tone-5)'];const parts=b.items.map((x,i)=>{const start=total;const size=b.total?x.centavos*100/b.total:0;total+=size;return `${tones[i%tones.length]} ${start.toFixed(3)}% ${total.toFixed(3)}%`}).join(',');return `<div class="mini-switch" role="group" aria-label="Estadística de ingresos o gastos"><button data-do="stats-type" data-type="gasto" class="${state.statsType==='gasto'?'active':''}">Gastos</button><button data-do="stats-type" data-type="ingreso" class="${state.statsType==='ingreso'?'active':''}">Ingresos</button></div><div class="card donut-panel" style="margin-top:12px"><div class="eyebrow" style="text-align:center">DISTRIBUCIÓN POR CATEGORÍA</div><div class="donut" style="background:${b.total?`conic-gradient(${parts})`:'var(--surface-2)'}"><div class="donut-center"><small>Total ${state.statsType==='gasto'?'gastos':'ingresos'}</small><strong>${moneyText(b.total,state.currency)}</strong></div></div><div class="soft-note" style="text-align:center;margin-bottom:0">${longMonth(state.month)} · ${state.currency} · sin conversión de divisas</div></div><div class="section-head"><h2>Categorías</h2><small>${b.items.length} categorías</small></div>${statList()}`}
function renderFinance(){let content='';switch(state.financeView){case 'calendario':content=renderCalendar();break;case 'semana':content=`${flowChart()}<div class="section-head"><h2>Semanas del mes</h2></div>${periodGroups('week')}`;break;case 'mes':content=`${flowChart()}${categoryChart()}<div class="section-head"><h2>Día por día</h2></div>${groupedByDate(active().filter(r=>matchingMonth(r)&&curr(r)===state.currency))}`;break;case 'resumen':content=renderFinSummary();break;case 'estadisticas':content=renderStats();break;default:content=renderDay()}
 return `<main id="main" class="page"><section class="screen-intro finance-intro"><h1 class="page-title">Finanzas</h1><span class="screen-kicker">${state.currency}</span></section>${periodPicker()}${financeNavigation()}${totalsUI()}<section class="finance-view-body" data-swipe="view" aria-label="${FINANCE_VIEWS.find(([id])=>id===state.financeView)?.[1]||'Diario'}. Desliza para cambiar de vista">${content}</section></main>`}
function searchResults(){if(!state.searched)return `<div class="card"><div class="empty">Selecciona los filtros y pulsa Buscar movimientos.</div></div>`;
 const q=state.search.query.trim().toLocaleLowerCase('es');const found=rows().filter(m=>{
  const d=m.fecha||'';if(d<state.search.from||d>state.search.to)return false;
  if(state.search.type&&m.tipo!==state.search.type)return false;
  if(state.search.category&&m.categoria_id!==state.search.category)return false;
  if(state.search.accountIds.length===0||(!state.search.accountIds.includes(m.cuenta_id)&&!state.search.accountIds.includes(m.cuenta_destino_id)))return false;
  return [m.descripcion,m.nota,cat(m.categoria_id)?.nombre,account(m.cuenta_id)?.nombre].some(v=>String(v||'').toLocaleLowerCase('es').includes(q));
 }).sort((a,b)=>b.fecha.localeCompare(a.fecha));
 return `<div class="section-head"><h2>Resultados</h2><small>${found.length} movimientos</small></div>${found.length?groupedByDate(found):'<div class="card"><div class="empty">No se encontraron movimientos con esos filtros.</div></div>'}`}
function renderSearch(){return `<main id="main" class="page"><section class="screen-intro"><div class="eyebrow">ENCUENTRA CUALQUIER OPERACIÓN</div><h1 class="page-title">Búsqueda</h1><div class="subline">Filtra el historial de tu sucursal</div></section><form id="search-form" class="card" style="padding:15px"><label class="field-label" for="query" style="margin-top:0">Concepto, nota o categoría</label><div class="search-input-wrapper">${ico('search')}<input class="field-control" id="query" name="search-query" value="${esc(state.search.query)}" placeholder="Buscar movimientos..." autocomplete="off"></div>
 <div class="filter-grid"><div><label class="field-label" for="date-from">Desde</label><input class="field-control" type="date" name="from" id="date-from" value="${state.search.from}"></div><div><label class="field-label" for="date-to">Hasta</label><input class="field-control" type="date" name="to" id="date-to" value="${state.search.to}"></div></div>
 <label class="field-label">Cuentas</label><button type="button" class="filter-trigger" data-do="accounts-filter"><span>${state.search.accountIds.length===accounts().length?'Todas las cuentas':`${state.search.accountIds.length} cuentas seleccionadas`}</span>${ico('chevron','sm')}</button>
 <div class="filter-grid"><div><label class="field-label" for="search-type">Tipo</label><select class="field-select" id="search-type" name="search-type"><option value="">Todos</option><option value="ingreso" ${state.search.type==='ingreso'?'selected':''}>Ingreso</option><option value="gasto" ${state.search.type==='gasto'?'selected':''}>Gasto</option><option value="transferencia" ${state.search.type==='transferencia'?'selected':''}>Transferencia</option></select></div><div><label class="field-label" for="search-cat">Categoría</label><select class="field-select" id="search-cat" name="search-category"><option value="">Todas</option>${cats().map(c=>`<option value="${esc(c.id)}" ${state.search.category===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}</select></div></div><button type="submit" class="primary-btn full" style="margin-top:17px">${ico('search','sm')} Buscar movimientos</button></form><p class="search-summary">Incluye registros anulados en los resultados para conservar la trazabilidad.</p>${searchResults()}</main>`}
const moreItems=[['debts','clock','Compromisos y deudas','Cuotas y próximos vencimientos'],['budgets','target','Presupuestos','Control por categoría'],['cards','card','Tarjetas','Límites, corte y pagos'],['settings','settings','Ajustes','Moneda, apariencia y sucursal']];
function renderMore(){return `<main id="main" class="page"><section class="screen-intro"><h1 class="page-title">Más opciones</h1><div class="subline">Configura y consulta tus finanzas</div></section><div class="card settings-list">${moreItems.map(([route,ic,title,caption])=>`<button class="setting-row" data-do="route" data-route="${route}"><span class="row-copy"><b>${title}</b><small>${caption}</small></span>${ico('chevron','sm chev')}</button>`).join('')}</div>${isLive?'<button class="secondary-btn full finance-signout" data-do="sign-out">Cerrar sesión</button>':''}</main>`}
function routeHead(title,desc){return `<section class="screen-intro"><button class="round-button" data-do="back-more" aria-label="Regresar a Más">${ico('back')}</button><div class="eyebrow">HERRAMIENTAS</div><h1 class="page-title">${title}</h1><div class="subline">${desc}</div></section>`}
function obligationRows(){return money.obligationSummary({commitments:state.data.commitments||[],costObligations:state.data.costObligations||[],costRecurrents:state.data.costRecurrents||[],month:state.month})}
function paymentRowsFor(item){const raw=item.raw||{};const id=String(item.source==='factura'?(raw.id||raw.obligacionId):raw.id||'');const list=item.source==='factura'?state.data.costPayments||[]:state.data.commitmentPayments||[];return list.filter(p=>String(item.source==='factura'?(p.obligacionId||p.obligacion_id):(p.compromiso_id||p.compromisoId))===id).sort((a,b)=>String(b.fecha||b.pagadoEn||b.created_at||'').localeCompare(String(a.fecha||a.pagadoEn||a.created_at||'')))}
function renderDebts(){
 const summary=obligationRows();
 const overdue=summary.rows.filter(x=>x.due&&x.due<today);
 const current=summary.rows.filter(x=>x.due>=today&&x.due.startsWith(state.month));
 const upcoming=summary.rows.filter(x=>!overdue.includes(x)&&!current.includes(x));
 const row=item=>`<button class="movement-row" data-do="debt" data-id="${esc(item.id)}"><span class="row-copy"><b>${esc(item.name)}</b><small>${esc(item.type||'Obligación')} · ${esc(item.due||'Sin fecha verificada')} · ${esc(item.source==='planificado'?'Previsto':item.state)}</small></span><span class="row-amount warning-text">${item.outstanding==null?'Saldo no verificado':moneyText(item.outstanding,'DOP')}<span class="tiny">Ver detalle</span></span></button>`;
 return `<main class="page" id="main">${routeHead('Compromisos','Libro financiero y obligaciones de Caja')}
 <p class="soft-note">Saldos y estados leídos del CRM y Caja. Los pagos se muestran como historial; no se descuentan otra vez aquí.</p>
 <div class="section-head"><h2>Vencidos</h2><small>${overdue.length}</small></div><div class="card">${overdue.map(row).join('')||'<div class="empty">No hay compromisos vencidos activos.</div>'}</div>
 <div class="section-head"><h2>Este mes</h2><small>${current.length}</small></div><div class="card">${current.map(row).join('')||'<div class="empty">No hay compromisos activos para este mes.</div>'}</div>
 <div class="section-head"><h2>Próximos o sin fecha</h2></div><div class="card">${upcoming.map(row).join('')||'<div class="empty">No hay otros compromisos activos.</div>'}</div>
 ${summary.review.length?`<div class="section-head"><h2>Pagos por verificar</h2><small>${summary.review.length}</small></div><p class="soft-note">Estas obligaciones tienen un pago declarado sin conciliación. No se suman como deuda pagadera ni se consideran saldadas.</p><div class="card">${summary.review.map(row).join('')}</div>`:''}
 <p class="soft-note">Los pagos registrados en Caja y Finanzas están vinculados en el detalle de cada obligación. Si no existe saldo verificado se muestra expresamente.</p></main>`;
}
function renderBudgets(){return `<main class="page" id="main">${routeHead('Presupuestos','Seguimiento mensual por categoría')}<div class="card">${state.data.budgets.map(b=>{const spent=core.summarizeMovements(rows().filter(m=>m.categoria_id===b.categoria_id),`${state.month}-01`,`${state.month}-31`).gastos_centavos;const pct=b.monto_centavos?Math.floor(spent*100/b.monto_centavos):0;return `<div class="budget-item"><div class="title-row"><b>${esc(cat(b.categoria_id)?.nombre||'Categoría')}</b><span>${pct}% utilizado</span></div><div class="progress-track"><span class="${pct>=85?'warn':''}" style="width:${Math.min(pct,100)}%"></span></div><div class="budget-footer"><span>Gastado: ${moneyText(spent,'DOP')}</span><span>Objetivo: ${moneyText(b.monto_centavos,'DOP')}</span></div></div>`}).join('')||'<div class="empty">No hay presupuestos.</div>'}</div><p class="soft-note">Presupuesto y gasto se muestran en la misma moneda, sin convertir divisas.</p></main>`}
function renderCards(){return `<main class="page" id="main">${routeHead('Tarjetas','Fechas de corte y límites')}<div class="card">${state.data.cards.map(c=>{const a=account(c.cuenta_id);const debt=Math.abs(Math.min(0,a?accountBalance(a):0));return `<div class="budget-item"><div class="title-row"><b>${esc(c.nombre||a?.nombre||'Tarjeta')}</b><span>Crédito</span></div><div class="account-large" style="margin-top:14px"><small>Deuda actual</small><strong style="font-size:1.55rem">${moneyText(debt,a?.moneda||'DOP')}</strong></div><div class="soft-note">Límite: ${moneyText(c.limite_credito_centavos||0,a?.moneda||'DOP')} · Corte día ${esc(c.dia_corte||'—')} · Pago día ${esc(c.dia_pago||'—')}</div><button class="secondary-btn" data-do="account" data-id="${esc(a?.id||'')}">Abrir cuenta</button></div>`}).join('')||'<div class="empty">No hay tarjetas.</div>'}</div></main>`}
function renderSettings(){return `<main class="page" id="main">${routeHead('Ajustes','Personaliza la visualización')}<div class="card" style="padding:15px"><label class="field-label" for="branch-choice" style="margin-top:0">Sucursal</label><select class="field-select" id="branch-choice" name="branch">${Object.entries(branches).map(([key,label])=>`<option value="${key}" ${key===state.business?'selected':''}>${esc(label)}</option>`).join('')}</select><label class="field-label" for="theme-choice">Apariencia</label><select class="field-select" id="theme-choice" name="theme"><option value="light" ${state.theme==='light'?'selected':''}>Claro</option><option value="dark" ${state.theme==='dark'?'selected':''}>Oscuro</option></select><label class="field-label" for="pref-currency">Moneda de las vistas</label><select class="field-select" id="pref-currency" name="currency">${currencyOption('DOP')}${currencyOption('USD')}</select><div class="notice">Las monedas se muestran por separado; cambiar el selector nunca convierte importes ni modifica el libro.</div></div><div class="section-head"><h2>Estado de conexión</h2></div><div class="card small-card"><h3>${isLive?'Integración bajo validación':'Demostración sin escritura'}</h3><p>La vista solo presenta información disponible. Una lectura fallida bloquea los saldos y ofrece reintentar.</p></div></main>`}
function renderMain(){if(state.loading)return `<main class="page"><div class="card error-screen"><h2>Consultando el libro financiero...</h2><p>No se mostrarán cifras hasta completar la lectura.</p></div></main>`;
 if(state.authRequired)return `<main class="page"><section class="login-screen"><div class="eyebrow">ACCESO SEGURO</div><h1 class="page-title">Tus finanzas</h1><p class="subline">Usa la misma cuenta del CRM. Tus datos se consultan solo después de verificar tu sucursal.</p><form id="login-form" class="login-form"><label class="field-label" for="finance-email">Correo</label><input class="field-control" id="finance-email" name="login-email" type="email" inputmode="email" autocomplete="username" value="${esc(state.loginEmail)}" required><label class="field-label" for="finance-password">Contraseña</label><input class="field-control" id="finance-password" name="login-password" type="password" autocomplete="current-password" required>${state.loginError?`<p class="login-error" role="alert">${esc(state.loginError)}</p>`:''}<button class="primary-btn full" type="submit" ${state.loginBusy?'disabled':''}>${state.loginBusy?'Comprobando acceso…':'Entrar a Finanzas'}</button></form></section></main>`;
 if(state.error)return `<main class="page"><div class="card error-screen" role="alert"><div class="error-symbol">${ico('info','lg')}</div><h2>Datos no verificados</h2><p>${esc(state.error)}</p><button class="primary-btn" data-do="retry">${ico('refresh','sm')} Reintentar consulta</button></div></main>`;
 if(state.route==='debts')return renderDebts();if(state.route==='budgets')return renderBudgets();if(state.route==='cards')return renderCards();if(state.route==='settings')return renderSettings();
 return state.tab==='finance'?renderFinance():state.tab==='search'?renderSearch():state.tab==='more'?renderMore():renderHome()}
function modalFrame(title,inner){return `<div class="overlay" data-do="backdrop"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-grab"></div><div class="sheet-header"><h2>${esc(title)}</h2><button class="round-button" data-do="close" aria-label="Cerrar ventana">${ico('x')}</button></div>${inner}</section></div>`}
function modalAccount(){const a=account(state.accountId);if(!a)return modalFrame('Cuenta','<div class="empty">Cuenta no disponible.</div>');const history=activeByAccount(a);
 return modalFrame('Detalle de cuenta',`<div class="account-sheet-head">${accountBadge(a,true)}<div><div class="pill">${a.moneda} · ${a.tipo==='banco'?'Banco':a.tipo==='tarjeta_credito'?'Tarjeta':'Efectivo'}</div><div class="account-large"><small>${esc(a.nombre)} · Saldo actual</small><strong>${moneyText(accountBalance(a),a.moneda)}</strong></div></div></div><div class="btn-pair"><button class="secondary-btn" data-do="reconcile">${ico('check','sm')} Conciliar</button><button class="primary-btn" data-do="account-transfer">${ico('arrows','sm')} Transferir</button></div><button class="secondary-btn full" data-do="account-edit" style="margin-top:10px">${ico('edit','sm')} Editar cuenta</button><h3>Historial de esta cuenta</h3><div>${movementsUI(history,9)}</div>`)}
function modalAccountsFilter(){return modalFrame('Elegir cuentas',`<p class="soft-note">Puedes seleccionar varias cuentas para la búsqueda. No se combinan monedas.</p><div>${accounts().map(a=>`<label class="option-line option-account"><input type="checkbox" name="account-toggle" value="${esc(a.id)}" ${state.search.accountIds.includes(a.id)?'checked':''}>${accountBadge(a)}<span>${esc(a.nombre)} <small style="color:var(--muted)">${a.moneda}</small></span></label>`).join('')}</div><button class="primary-btn full" data-do="close" style="margin-top:15px">Aplicar selección</button>`)}
function saleDetailHtml(m){
 const event=saleForMovement(m);
 if(!event)return m.origen==='pos_venta'||m.venta_id?'<div class="notice warning">El asiento está sincronizado, pero el detalle de la venta no llegó en esta lectura. Actualiza el libro para comprobarlo.</div>':'';
 const p=salePayload(event), lines=Array.isArray(p.lineas)?p.lineas:Array.isArray(p.items)?p.items:[], payments=Array.isArray(p.pagos)?p.pagos:[];
 const val=(label,value)=>value==null||value===''?'':`<div class="info-line"><span>${label}</span><strong>${esc(value)}</strong></div>`;
 const cents=(label,value)=>value!=null&&value!==''&&Number.isSafeInteger(Number(value))?val(label,moneyText(Number(value),curr(m))):'';
 const saleMoney=value=>value!=null&&value!==''&&Number.isSafeInteger(Number(value))?moneyText(Number(value),curr(m)):'Importe no disponible';
 return `<h3>Venta de Caja</h3><div class="card">${val('Folio',p.folio||p.numero||p.ticket)}${val('Cliente',p.clienteNombre||p.cliente_nombre)}${val('Caja',p.cajaNombre||p.caja_nombre)}${val('Atendió',p.usuarioNombre||p.cajeroNombre)}${cents('Total de la venta',p.totalCobradoCentavos??p.total_centavos??p.totalCentavos)}${cents('Descuento',p.descuentoCentavos??p.descuento_centavos)}${cents('ITBIS',p.itbisCentavos??p.itbis_centavos)}</div>
 <h3>Productos y servicios</h3><div class="card">${lines.length?lines.map(l=>`<div class="info-line"><span>${esc(l.nombre||l.descripcion||l.productoNombre||'Línea de venta')}${l.cantidad!=null?' · '+esc(l.cantidad):''}</span><strong>${saleMoney(l.importeFinalCentavos??l.totalCentavos)}</strong></div>`).join(''):'<div class="empty">Caja no entregó el desglose de productos de esta venta.</div>'}</div>
 ${payments.length?`<h3>Pagos de la venta</h3><div class="card">${payments.map(pay=>`<div class="info-line"><span>${esc(pay.metodo||pay.metodoPago||pay.method||'Método no indicado')}</span><strong>${saleMoney(pay.montoCentavos??pay.monto_centavos??pay.amountCents)}</strong></div>`).join('')}</div>`:''}${p.nota?`<p class="soft-note">${esc(p.nota)}</p>`:''}`;
}
function modalMovement(){const m=rows().find(x=>x.id===state.movementId);if(!m)return modalFrame('Movimiento','<div class="empty">No disponible</div>');return modalFrame('Detalle del movimiento',`<div class="pill">${esc(m.tipo.toUpperCase())} · ${esc(m.estado)}</div><div class="account-large"><small>${esc(movementTitle(m))}</small><strong class="${m.tipo==='gasto'?'expense-text':m.tipo==='ingreso'?'income-text':'warning-text'}">${m.tipo==='gasto'?'−':m.tipo==='ingreso'?'+':''}${moneyText(m.monto_centavos,curr(m))}</strong></div><div class="card"><div class="info-line"><span>Fecha</span><strong>${niceDay(m.fecha)}</strong></div><div class="info-line"><span>Categoría</span><strong>${esc(cat(m.categoria_id)?.nombre||'Sin categoría')}</strong></div><div class="info-line"><span>Cuenta</span><strong>${esc(account(m.cuenta_id)?.nombre||'No verificada')}</strong></div>${m.tipo==='transferencia'?`<div class="info-line"><span>Destino</span><strong>${esc(account(m.cuenta_destino_id)?.nombre||'No verificado')}</strong></div>`:''}<div class="info-line"><span>Estado</span><strong>${esc(m.estado)}</strong></div></div>${saleDetailHtml(m)}<div class="btn-pair" style="margin-top:14px"><button class="secondary-btn" data-do="movement-edit">${ico('edit','sm')} Editar</button><button class="danger-btn" data-do="void-confirm" ${m.estado==='anulado'?'disabled':''}>Anular</button></div><div class="notice warning">Anular conserva el asiento y su historial; nunca lo elimina.</div>`)}
function modalVoid(){return modalFrame('Confirmar anulación',`<div class="notice warning">Esta acción preservará el movimiento original con estado «anulado». No crea otro gasto ni otra transferencia.</div><label class="field-label" for="void-reason">Motivo de anulación</label><textarea class="field-area" id="void-reason" name="void-reason" placeholder="Motivo obligatorio" rows="3"></textarea><div class="btn-pair" style="margin-top:14px"><button class="secondary-btn" data-do="movement" data-id="${esc(state.movementId)}">Volver</button><button class="danger-btn" data-do="void-save">Confirmar anulación</button></div>`)}
function modalMovementEdit(){const m=rows().find(x=>x.id===state.movementId);if(!m)return modalFrame('Editar','<div class="empty">Sin movimiento.</div>');return modalFrame('Editar movimiento',`<div class="notice warning">El adaptador entregado no incluye una acción «fin.movement.edit». Esta pantalla permite revisar una corrección, pero no la aplica.</div><label class="field-label">Importe original</label><div class="account-large" style="margin:5px 0">${moneyText(m.monto_centavos,curr(m))}</div><label class="field-label" for="edit-desc">Descripción</label><input id="edit-desc" class="field-control" name="edit-desc" value="${esc(m.descripcion)}"><label class="field-label" for="edit-note">Nota de la corrección</label><textarea id="edit-note" class="field-area" name="edit-note" rows="3">${esc(m.nota||'')}</textarea><button data-do="edit-preview" class="secondary-btn full" style="margin-top:15px">Revisar cambios (sin guardar)</button>`)}
function modalAccountEdit(){const a=account(state.accountId);if(!a)return '';
 return modalFrame('Editar cuenta',`<label class="field-label" for="account-name">Nombre</label><input class="field-control" id="account-name" value="${esc(a.nombre)}"><label class="field-label">Moneda</label><input class="field-control" value="${esc(a.moneda)}" disabled><div class="notice">La edición real requiere revisar permisos, uso en POS y regla de integridad. Vista previa únicamente.</div><button class="secondary-btn full" data-do="account-edit-preview">Revisar cambios (sin guardar)</button>`)}
function modalReconcile(){const a=account(state.accountId);if(!a)return '';
 return modalFrame('Conciliar cuenta',`<div class="account-large"><small>${esc(a.nombre)} · Saldo en el libro</small><strong>${moneyText(accountBalance(a),a.moneda)}</strong></div><div class="notice warning">Conciliar solo contra saldo contado o estado bancario comprobado. No sirve para corregir sincronizaciones pendientes.</div><label class="field-label" for="reconcile-amount">Saldo físico / bancario verificado (${a.moneda})</label><input class="field-control" id="reconcile-amount" name="reconcile-amount" placeholder="Ej. 12500.00 o -550.00" inputmode="decimal" autocomplete="off"><label class="field-label" for="reconcile-reason">Evidencia y motivo</label><textarea class="field-area" id="reconcile-reason" name="reconcile-reason" placeholder="Conteo físico / estado bancario y fecha" rows="3"></textarea><button class="primary-btn full" data-do="reconcile-save" style="margin-top:15px">Verificar conciliación</button>`)}
function modalDebt(){
 const summary=obligationRows();
 const item=[...summary.rows,...summary.review].find(x=>x.id===state.accountId);
 if(!item)return modalFrame('Compromiso','<div class="empty">Este compromiso ya no está activo en el periodo. Actualiza el libro.</div>');
 const payments=paymentRowsFor(item),raw=item.raw||{};
 const line=(label,value)=>value==null||value===''?'':`<div class="info-line"><span>${label}</span><strong>${esc(value)}</strong></div>`;
 const amount=(label,value)=>value!=null&&value!==''&&Number.isSafeInteger(Number(value))?line(label,moneyText(Number(value),'DOP')):'';
 return modalFrame('Detalle de compromiso',`<div class="account-large"><small>${esc(item.name)}</small><strong>${item.outstanding==null?'Saldo no verificado':moneyText(item.outstanding,'DOP')}</strong></div><div class="card">${line('Origen',item.source==='factura'?'Obligación de Caja':item.source==='planificado'?'Plan recurrente':'Compromiso financiero')}${line('Estado',item.state)}${line('Vencimiento',item.due||'No verificado')}${amount('Cuota',item.periodAmount)}${amount('Capital pendiente',item.capital)}${raw.cuotas_totales?line('Cuotas',`${raw.cuotas_pagadas||0} de ${raw.cuotas_totales}`):''}${line('Referencia',raw.referencia)}${line('Nota',raw.nota)}</div><h3>Pagos vinculados</h3><div class="card">${payments.length?payments.map(p=>`<div class="budget-item"><div class="title-row"><b>${esc(p.fecha||p.pagadoEn||p.created_at||'Fecha no verificada')}</b><strong>${moneyText(Number(p.monto_centavos??p.montoCentavos),'DOP')}</strong></div><div class="soft-note">${esc(p.estado||'Registrado')}${p.referencia?' · '+esc(p.referencia):''}${p.metodoPago||p.metodo_pago?' · '+esc(p.metodoPago||p.metodo_pago):''}</div></div>`).join(''):'<div class="empty">No hay pagos vinculados en el libro.</div>'}</div><p class="soft-note">El saldo pendiente proviene del registro original. El historial no genera un nuevo débito.</p>`);
}
function modalEntry(){if(isLive&&!emulatorWritesAllowed())return modalFrame('Registrar movimiento',`<div class="notice warning">El registro desde esta PWA sigue bloqueado mientras se coteja el libro con la Caja activa. En el panel central puedes registrar si tu cuenta tiene permiso de escritura.</div><button class="primary-btn full" type="button" data-do="open-finance-panel" style="margin:16px 0">Abrir Finanzas del panel central</button><div class="card"><div class="info-line"><span>Ingreso o gasto</span><strong>Finanzas → Registrar movimiento</strong></div><div class="info-line"><span>Transferencia</span><strong>Finanzas → Transferir</strong></div></div>`);const type=state.entryType;const isTransfer=type==='transferencia';const a=account(state.entryAccount);const amt=state.entryDigits?Number(state.entryDigits):0;const currency=a?.moneda||'DOP';
 return modalFrame('Registrar movimiento',`<div class="sheet-tabs" role="group" aria-label="Tipo de movimiento"><button class="${type==='gasto'?'active':''}" data-do="entry-type" data-type="gasto">Gasto</button><button class="${type==='ingreso'?'active':''}" data-do="entry-type" data-type="ingreso">Ingreso</button><button class="${isTransfer?'active':''}" data-do="entry-type" data-type="transferencia">Transferencia</button></div><div class="input-amount ${type==='gasto'?'expense-text':type==='ingreso'?'income-text':'warning-text'}" aria-label="Importe actual" role="status">${type==='gasto'?'−':type==='ingreso'?'+':''}${moneyText(amt,currency)}</div><div class="keypad" role="group" aria-label="Teclado para introducir el importe">${['1','2','3','4','5','6','7','8','9','00','0','⌫'].map(v=>`<button data-do="digit" data-digit="${v}" aria-label="${v==='⌫'?'Borrar último dígito':`Agregar ${v}`}">${v}</button>`).join('')}</div><label class="field-label" for="entry-account">${isTransfer?'Cuenta de origen':'Cuenta'}</label><select class="field-select" id="entry-account" name="entry-account">${cashAccountOptions(state.entryAccount)}</select>${isTransfer?`<label class="field-label" for="entry-dest">Cuenta de destino</label><select class="field-select" id="entry-dest" name="entry-dest">${cashAccountOptions(state.entryDest)}</select>`:`<label class="field-label" for="entry-category">Categoría</label><select class="field-select" id="entry-category" name="entry-category">${cats().filter(c=>c.tipo===type).map(c=>`<option value="${esc(c.id)}" ${state.entryCategory===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}</select>`}<div class="filter-grid"><div><label class="field-label" for="entry-date">Fecha</label><input class="field-control" id="entry-date" type="date" name="entry-date" value="${esc(state.entryDate)}"></div><div><label class="field-label" for="entry-note">Concepto</label><input class="field-control" id="entry-note" name="entry-note" value="${esc(state.entryNote)}" placeholder="Descripción" maxlength="180"></div></div><div class="notice">${isLive?'La operación se enviará únicamente mediante la acción transaccional del adaptador con permisos validados.':'Previsualización: el registro no alterará saldos, historial ni Firebase.'}</div><button class="primary-btn full" data-do="entry-save" ${state.busy?'disabled':''}>${isLive?'Registrar operación':'Revisar simulación'}</button>`)}
function renderModal(){if(!state.modal)return '';switch(state.modal){case 'account':return modalAccount();case 'accounts-filter':return modalAccountsFilter();case 'movement':return modalMovement();case 'void':return modalVoid();case 'movement-edit':return modalMovementEdit();case 'account-edit':return modalAccountEdit();case 'reconcile':return modalReconcile();case 'debt':return modalDebt();case 'entry':return modalEntry();default:return ''}}
let previousModal=null, previousViewKey='', popupSerial=0, navigationDirection=0;
function render(){const modalIsNew=!!state.modal&&state.modal!==previousModal;const viewKey=`${state.tab}/${state.route}/${state.financeView}/${state.month}/${state.financeView==='diario'?state.day:''}`;const viewIsNew=viewKey!==previousViewKey;const motion=viewIsNew&&navigationDirection?`slide-${navigationDirection>0?'forward':'back'}`:'';navigationDirection=0;previousModal=state.modal;previousViewKey=viewKey;document.documentElement.dataset.theme=state.theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.theme==='dark'?'#050607':'#e8e9eb');document.body.classList.toggle('modal-open',Boolean(state.modal));$('app').innerHTML=`<div class="shell ${viewIsNew?'view-enter':''} ${motion}">${renderHeader()}${renderMain()}${renderBottom()}</div>${renderModal()}`;if(isLive&&!emulatorWritesAllowed()){for(const button of document.querySelectorAll('[data-do="account-transfer"],[data-do="reconcile"],[data-do="void-confirm"],[data-do="entry-save"],[data-do="reconcile-save"],[data-do="void-save"],[data-do="account-edit"],[data-do="movement-edit"]')){button.disabled=true;button.title='Acción bloqueada hasta validar Caja y permisos en emulador';}}if(state.modal&&!modalIsNew)document.querySelector('.overlay')?.classList.add('no-enter');requestAnimationFrame(()=>{const scroller=document.querySelector('.segment-wrap');const active=scroller?.querySelector('.segment.active');if(scroller&&active)scroller.scrollLeft=Math.max(0,active.offsetLeft-(scroller.clientWidth-active.clientWidth)/2)})}
function openModal(type){popupSerial++;state.modal=type;render();requestAnimationFrame(()=>document.querySelector('.sheet [data-do="close"]')?.focus({preventScroll:true}))}
function closeModal(){
 const which=state.modal,serial=popupSerial,sheet=document.querySelector('.sheet');
 if(sheet && !sheet.dataset.closing && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof sheet.animate==='function'){
  sheet.dataset.closing='1';document.querySelector('.overlay')?.classList.add('closing');
  const animation=sheet.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(32px)'}],{duration:180,easing:'cubic-bezier(.4,0,.9,.55)',fill:'forwards'});
  const finish=()=>{if(state.modal===which && popupSerial===serial){state.modal=null;state.busy=false;render()}};
  animation.finished.then(finish).catch(finish);return;
 }
 if(sheet?.dataset.closing)return;
 state.modal=null;state.busy=false;render();
}
function openTab(t){const tabs=['home','finance','search','more'];navigationDirection=Math.sign(tabs.indexOf(t)-tabs.indexOf(state.tab));state.tab=t;state.route='';state.modal=null;render();window.scrollTo({top:0,behavior:'instant'})}
function changeBusiness(b){if(!Object.hasOwn(branches,b))return;state.business=b;state.modal=null;state.route='';state.tab='home';const p=new URLSearchParams(location.search);p.set('b',b);history.replaceState(null,'',`${location.pathname}?${p.toString()}`);load()}
const numericCents=v=>{const t=String(v??'').trim().replace(/,/g,'');if(!/^-?\d+(?:\.\d{1,2})?$/.test(t))throw new Error('Introduce un importe válido con hasta dos decimales.');const neg=t[0]==='-';const [a,b='']=t.replace(/^-/, '').split('.');const parsed=Number(a)*100+Number((b+'00').slice(0,2));if(!Number.isSafeInteger(parsed))throw new Error('Importe fuera de rango.');return neg?-parsed:parsed};
function requestId(){return globalThis.crypto?.randomUUID?.()||`ui-${Date.now()}-${Math.random().toString(16).slice(2)}`}
async function commit(action,entity,payload){if(state.busy)return;state.busy=true;try{const res=await commitAction(action,state.business,entity,payload);if(res.preview){note('Vista previa: ningún dato fue guardado.');closeModal()}else{note(res.message||'Operación confirmada.');state.pendingRequestId=null;closeModal();await load()}}catch(e){note(e?.message||'No se pudo completar la operación.');}finally{state.busy=false}}
async function handleClick(e){if(Date.now()<swipeSuppressClickUntil)return;const btn=e.target.closest('[data-do]');if(!btn)return;const action=btn.dataset.do;
 if(action==='backdrop'){if(e.target===btn)closeModal();return}
 if(action==='close'){closeModal();return}
 if(action==='retry'){params.delete('fail');history.replaceState(null,'',`${location.pathname}?${params.toString()}`);await load();return}
 if(action==='refresh'){if(!state.loading)await load();return}
 if(action==='sign-out'){
  if(!isLive)return;
  const previousUid=seenAuthUid;seenAuthUid=null;
  try{await window.DcarelaFirebase.signOut();state.loginEmail='';state.loginError='';state.business='';state.tab='home';state.route='';state.modal=null;params.delete('b');history.replaceState(null,'',`${location.pathname}?${params.toString()}`);await load();}
  catch{seenAuthUid=previousUid;note('No se pudo cerrar la sesión. Inténtalo de nuevo.');}
  return;
 }
 if(action==='theme'){setTheme(state.theme==='light'?'dark':'light');return}
 if(action==='open-settings'){state.route='settings';state.tab='more';render();return}
 if(action==='tab'){openTab(btn.dataset.tab);return}
 if(action==='route'){state.route=btn.dataset.route;state.tab='more';render();window.scrollTo(0,0);return}
 if(action==='back-more'){state.route='';state.tab='more';render();return}
 if(action==='filter-toggle'){state.financeFilterOpen=!state.financeFilterOpen;render();return}
 if(action==='view-step'){const index=FINANCE_VIEWS.findIndex(([id])=>id===state.financeView);navigationDirection=Number(btn.dataset.step);state.financeView=FINANCE_VIEWS[(index+navigationDirection+FINANCE_VIEWS.length)%FINANCE_VIEWS.length][0];state.financeFilterOpen=false;render();return}
 if(action==='view'){navigationDirection=Math.sign(FINANCE_VIEWS.findIndex(([id])=>id===btn.dataset.view)-FINANCE_VIEWS.findIndex(([id])=>id===state.financeView));state.financeView=btn.dataset.view;state.financeFilterOpen=false;render();return}
 if(action==='select-day'){navigationDirection=Math.sign(btn.dataset.day.localeCompare(state.day));state.day=btn.dataset.day;state.month=state.day.slice(0,7);render();return}
 if(action==='prev-month'||action==='next-month'){navigationDirection=action==='prev-month'?-1:1;state.month=nMonth(state.month,navigationDirection);state.day=state.month+'-01';render();return}
 if(action==='day'){state.day=btn.dataset.day;state.financeView='calendario';state.tab='finance';render();return}
 if(action==='stats-type'){state.statsType=btn.dataset.type;render();return}
 if(action==='account'){state.accountId=btn.dataset.id;openModal('account');return}
 if(action==='movement'){state.movementId=btn.dataset.id;openModal('movement');return}
 if(action==='accounts-filter'){openModal('accounts-filter');return}
 if(action==='entry'){state.entryType='gasto';state.entryDigits='';state.entryNote='';state.pendingRequestId=null;state.entryCategory=cats().find(c=>c.tipo==='gasto')?.id||'';openModal('entry');return}
 if(action==='open-finance-panel'){location.assign(new URL('../panel.html#finanzas',location.href).href);return}
 if(action==='entry-type'){state.entryType=btn.dataset.type;state.entryCategory=cats().find(c=>c.tipo===state.entryType)?.id||'';render();return}
 if(action==='digit'){let d=btn.dataset.digit;if(d==='⌫')state.entryDigits=state.entryDigits.slice(0,-1);else if(state.entryDigits.length+d.length<=12)state.entryDigits=(state.entryDigits+d).replace(/^0+(?=\d)/,'');render();return}
 if(action==='account-transfer'){state.entryType='transferencia';state.entryDigits='';state.entryAccount=state.accountId;state.entryNote='';state.pendingRequestId=null;const a=account(state.entryAccount);state.entryDest=accounts().find(x=>x.id!==a?.id&&x.moneda===a?.moneda)?.id||'';openModal('entry');return}
 if(action==='account-edit'){openModal('account-edit');return}
 if(action==='account-edit-preview'){note('Edición de cuenta no guardada: interfaz de revisión.');return}
 if(action==='reconcile'){openModal('reconcile');return}
 if(action==='reconcile-save'){const text=document.querySelector('[name="reconcile-amount"]')?.value||'';const reason=document.querySelector('[name="reconcile-reason"]')?.value?.trim();let cents;try{cents=numericCents(text)}catch(e){note(e.message);return}if(!reason){note('Escribe la evidencia del saldo verificado.');return}if(account(state.accountId)?.moneda!=='DOP'){note('El adaptador actual solo admite conciliación manual DOP.');return}
 state.pendingRequestId ||= requestId();await commit('fin.account.reconcile',state.accountId,{cuentaId:state.accountId,saldoObjetivoCentavos:cents,motivo:reason,requestId:state.pendingRequestId});return}
 if(action==='movement-edit'){openModal('movement-edit');return}
 if(action==='edit-preview'){note('Cambio mostrado solo en el formulario. No existe acción de edición en el adaptador.');return}
 if(action==='void-confirm'){state.pendingRequestId=null;openModal('void');return}
 if(action==='void-save'){const reason=document.querySelector('[name="void-reason"]')?.value?.trim();if(!reason){note('Indica el motivo de anulación.');return}state.pendingRequestId ||= requestId();await commit('fin.movement.cancel',state.movementId,{motivo:reason,requestId:state.pendingRequestId});return}
 if(action==='debt'){state.accountId=btn.dataset.id;openModal('debt');return}
 if(action==='entry-save'){const cents=Number(state.entryDigits||0),a=account(state.entryAccount),dest=account(state.entryDest);if(!Number.isSafeInteger(cents)||cents<=0){note('Introduce un monto mayor que cero.');return}if(!a){note('Selecciona una cuenta válida.');return}if(state.entryType==='transferencia'&&(!dest||dest.id===a.id||dest.moneda!==a.moneda)){note('Elige cuentas diferentes y de la misma moneda.');return}
 if(isLive&&a.moneda!=='DOP'){note('La escritura manual del adaptador original solo admite cuentas DOP.');return}
 state.pendingRequestId ||= requestId();const data=state.entryType==='transferencia'?{
 cuentaOrigenId:a.id,cuentaDestinoId:dest.id,montoCentavos:cents,comisionCentavos:0,descripcion:state.entryNote||'Transferencia interna',fecha:state.entryDate,requestId:state.pendingRequestId
 }:{cuentaId:a.id,tipo:state.entryType,montoCentavos:cents,categoriaId:state.entryCategory,descripcion:state.entryNote||state.entryType,fecha:state.entryDate,requestId:state.pendingRequestId};
 await commit(state.entryType==='transferencia'?'fin.transfer.create':'fin.movement.create',state.pendingRequestId,data);return}
}
function handleChange(e){const target=e.target,name=target.name;switch(name){
 case 'currency':state.currency=target.value;render();break;
 case 'finance-day':if(/^\d{4}-\d{2}-\d{2}$/.test(target.value)){state.day=target.value;state.month=target.value.slice(0,7);render()}break;
 case 'theme':setTheme(target.value);break;
 case 'branch':changeBusiness(target.value);break;
 case 'search-type':state.search.type=target.value;break;
 case 'search-category':state.search.category=target.value;break;
 case 'from':state.search.from=target.value;break;case 'to':state.search.to=target.value;break;
 case 'account-toggle':state.search.accountIds=target.checked?[...new Set([...state.search.accountIds,target.value])]:state.search.accountIds.filter(x=>x!==target.value);break;
 case 'entry-account':state.entryAccount=target.value;if(state.entryDest===target.value)state.entryDest=accounts().find(x=>x.id!==target.value&&x.moneda===account(target.value)?.moneda)?.id||'';state.pendingRequestId=null;render();break;
 case 'entry-dest':state.entryDest=target.value;state.pendingRequestId=null;break;
 case 'entry-category':state.entryCategory=target.value;state.pendingRequestId=null;break;
 case 'entry-note':state.entryNote=target.value;state.pendingRequestId=null;break;
 case 'entry-date':state.entryDate=target.value;state.pendingRequestId=null;break;
}}
function handleInput(e){if(e.target.name==='search-query')state.search.query=e.target.value;if(e.target.name==='entry-note')state.entryNote=e.target.value}
let signingIn=false,seenAuthUid;
async function handleSubmit(e){if(e.target.id==='login-form'){
 e.preventDefault();if(state.loginBusy)return;
 const email=e.target.querySelector('[name="login-email"]').value.trim();
 const password=e.target.querySelector('[name="login-password"]').value;
 state.loginEmail=email;state.loginError='';state.loginBusy=true;signingIn=true;render();
 try{const api=window.DcarelaFirebase;if(!api?.signIn)throw new Error('auth/unavailable');await api.signIn(email,password);seenAuthUid=api.getCurrentUser()?.uid;signingIn=false;state.loginBusy=false;await load();}
 catch(error){signingIn=false;state.loginBusy=false;state.loginError=String(error?.code||'').startsWith('auth/')?'No se pudo iniciar sesión. Comprueba el correo y la contraseña.':'No se pudo iniciar sesión. Comprueba la conexión e inténtalo de nuevo.';render();}
 return;
 }if(e.target.id!=='search-form')return;e.preventDefault();state.search.query=e.target.querySelector('[name="search-query"]').value;
 if(state.search.from>state.search.to){note('El inicio no puede ser posterior al fin.');return}if(state.search.accountIds.length===0){note('Selecciona al menos una cuenta.');return}state.searched=true;render()}
function stepSwipe(kind,step){navigationDirection=step;if(kind==='month'){state.month=nMonth(state.month,step);state.day=`${state.month}-01`;}else if(kind==='view'){const index=Math.max(0,FINANCE_VIEWS.findIndex(([id])=>id===state.financeView));state.financeView=FINANCE_VIEWS[(index+step+FINANCE_VIEWS.length)%FINANCE_VIEWS.length][0];state.financeFilterOpen=false;}else if(kind==='day'){state.day=nDay(state.day,step);state.month=state.day.slice(0,7);}else if(kind==='tab'){const tabs=['home','finance','search','more'];const next=tabs.indexOf(state.tab)+step;if(next<0||next>=tabs.length)return;openTab(tabs[next]);return;}render()}
let swipeStart=null,swipeSuppressClickUntil=0;
function beginSwipe(target,id,x,y){
 if(state.modal||state.route||state.loading||state.error||state.authRequired||target.closest('input,select,textarea,a,[contenteditable],.bottom-nav'))return;
 const zone=target.closest('[data-swipe]'),main=target.closest('main.page');
 if(zone||main)swipeStart={id,kind:zone?.dataset.swipe||(state.tab==='finance'?'view':'tab'),x,y};
}
function finishSwipe(id,x,y){
 if(!swipeStart||swipeStart.id!==id)return false;
 const start=swipeStart;swipeStart=null;
 const dx=x-start.x,dy=y-start.y;
 if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.3)return false;
 swipeSuppressClickUntil=Date.now()+350;
 stepSwipe(start.kind,dx<0?1:-1);
 return true;
}
// Safari en iPhone puede cancelar Pointer Events al iniciar un gesto nativo.
// Touch Events manejan el dedo; Pointer Events quedan para ratón y lápiz.
document.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];beginSwipe(e.target,t.identifier,t.clientX,t.clientY)},{passive:true});
document.addEventListener('touchend',e=>{if(e.changedTouches.length!==1)return;const t=e.changedTouches[0];if(finishSwipe(t.identifier,t.clientX,t.clientY)&&e.cancelable)e.preventDefault()},{passive:false});
document.addEventListener('touchcancel',()=>{swipeStart=null},{passive:true});
document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;beginSwipe(e.target,e.pointerId,e.clientX,e.clientY)});
document.addEventListener('pointerup',e=>{if(e.pointerType==='touch')return;finishSwipe(e.pointerId,e.clientX,e.clientY)});
document.addEventListener('pointercancel',e=>{if(e.pointerType!=='touch')swipeStart=null});
document.addEventListener('click',handleClick);
document.addEventListener('change',handleChange);
document.addEventListener('input',handleInput);
document.addEventListener('submit',handleSubmit);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.modal)closeModal();const zone=e.target.closest?.('[data-swipe]');if(zone&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();stepSwipe(zone.dataset.swipe,e.key==='ArrowLeft'?1:-1)}});
// Al regresar de otra app se consulta de nuevo si el libro quedó viejo. Evita
// sondeos continuos y conserva una actualización manual para movimientos remotos.
document.addEventListener('visibilitychange',()=>{
 if(isLive && !document.hidden && !state.loading && Date.now()-lastLoadedAt>120000)load();
});
if('serviceWorker' in navigator&&location.protocol!=='file:'&&!emulatorWritesAllowed())navigator.serviceWorker.register('./sw.js').catch(()=>{});
if (!isLive) window.__DCARELA_UI_DEBUG={state,render,openModal,openTab}; // Solo demo.
if (isLive && window.DcarelaFirebase?.onAuthStateChanged) {
 window.DcarelaFirebase.onAuthStateChanged(user => {
  const uid=user?.uid || null;
  if (seenAuthUid === undefined) {seenAuthUid=uid;return;}
  if (uid !== seenAuthUid) {seenAuthUid=uid;if(signingIn)return;state.data=null;state.modal=null;load();}
 });
}
load();
