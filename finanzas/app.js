import {loadFinance,loadFullFinanceHistory,commitAction,getTerminalReceipt,isLive,canRegister} from './data-source.js?v=35.30';
import {fixture as demoFixture} from './demo-data.js?v=35.30';
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
const monthEndOf=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
const initialMonthEnd=monthEndOf(initialMonth);
const defaultCommitmentForm=(catId='')=>({kind:'recurrente',nombre:'',acreedor:'',monto:'',categoriaId:catId,frecuencia:'mensual',diaMes1:'',diaMes2:'',proximaFecha:today,emitidaEn:today,numeroFactura:'',metodoPago:'transferencia',montoVariable:false,nota:''});
const params=new URLSearchParams(location.search);
const branchAppKind=document.querySelector('meta[name="dcarela-branch-app"]')?.content==='plaza'||/\/plaza(?:\.html)?$/i.test(location.pathname)?'plaza':'central';
const DEMO_BRANCH_NAMES={'sucursal-a':'Central · Demo','sucursal-b':'Plaza Artesanal · Demo'};
const LIVE_BRANCH_NAMES={dcarela:'Central','plaza-artesanal':'Plaza Artesanal'};
const branches=isLive?{}:{...DEMO_BRANCH_NAMES};
const defaultBranchId=isLive?(branchAppKind==='plaza'?'plaza-artesanal':'dcarela'):(branchAppKind==='plaza'?'sucursal-b':'sucursal-a');
const isPlazaBranch=(id=state.business)=>id==='plaza-artesanal'||id==='sucursal-b'||(id===''&&branchAppKind==='plaza');
const branchDisplayName=(id=state.business)=>branches[id]||LIVE_BRANCH_NAMES[id]||DEMO_BRANCH_NAMES[id]||(isPlazaBranch(id)?'Plaza Artesanal':'Central');
const FINANCE_VIEWS=[['diario','Día'],['calendario','Calendario'],['semana','Semana'],['mes','Mes'],['ano','Año'],['personalizado','Personalizado'],['resumen','Resumen'],['estadisticas','Estadísticas']];
const state={business:defaultBranchId,loading:true,error:'',authRequired:params.get('login')==='1'&&!isLive,loginBusy:false,loginError:'',loginEmail:'',data:null,tab:'home',route:'',financeView:'diario',
 month:today.slice(0,7),day:today,year:today.slice(0,4),customFrom:`${initialMonth}-01`,customTo:today,theme:localStorage.getItem('dcarela-mm-theme')==='dark'?'dark':'light',
 currency:'DOP',statsType:'gasto',modal:null,accountId:null,movementId:null,accountDraft:null,historyLoaded:!isLive,historyLoading:false,
 search:{query:'',type:'',category:'',from:`${initialMonth}-01`,to:initialMonthEnd,accountIds:[]},searched:false,
 entryType:'gasto',entryDigits:'',entryAccount:'',entryDest:'',entryCategory:'',entryNote:'',entryDate:today,
 commitmentForm:defaultCommitmentForm(),
 reconcileDigits:'',reconcileReason:'',editingNote:'',pendingRequestId:null,busy:false,financeFilterOpen:false,
 receiptMovementId:null,receiptStatus:null,receiptBusy:false};
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
const cats=()=>{const list=state.data?.categories||[];if(!state.data||list.some(c=>c.tipo==='gasto'&&/\bcomida\b/i.test(c.nombre||'')))return list;return [{id:'recon-cat-comida',business_id:state.business,nombre:'Comida',tipo:'gasto',color:'#e07a5f'},...list]};
const canWriteBranch=()=>!isLive || (canRegister() && state.data?.authorizedBusinesses?.some(b=>b.id===state.business&&['owner','admin'].includes(b.role)));
const account=id=>accounts().find(a=>a.id===id);
const cat=id=>cats().find(c=>c.id===id);
// 35.23 (dueño 13/11/2026: «reanima totalmente el pwa. mejora procesos, funciones e iconos»): un ícono por categoría, deducido del
// nombre (sin acentos), para reconocer cada movimiento de un vistazo. Lo que no encaja usa la flecha de ingreso o de gasto.
const CAT_ICONS=[[/sesion|foto|retrato|camara/,'camera'],[/impres|cuadro|laborat|copia|revelad/,'printer'],[/material|insumo|papel|sublima|consumible|mercanc|inventar/,'box'],
 [/personal|nomina|sueldo|emplead|salario|mensajer/,'users'],[/publicid|anuncio|marketing|redes|promoc/,'megaphone'],[/alquiler|local|renta/,'home'],
 [/servicio|luz|agua|internet|claro|altice|edeeste|telefon|electric/,'bolt'],[/venta|cobro|abono/,'tag'],[/compra|equipo|herramient/,'cart'],
 [/comida|almuerzo|desayuno|cena|aliment/,'food'],[/transporte|pasaje|gasolina|combustib|viaje|taxi/,'car'],[/impuesto|itbis|dgii|factura|fiscal/,'receipt'],
 [/regalo|donac/,'gift'],[/tarjeta|banco|comision/,'card'],[/prestamo|deuda|cuota|financ/,'clock']];
const sinAcento=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function catIcon(m){if(m.tipo==='transferencia')return 'arrows';const n=sinAcento(cat(m.categoria_id)?.nombre||'')+' '+sinAcento(m.descripcion||'');const f=CAT_ICONS.find(([re])=>re.test(n));return f?f[1]:m.tipo==='ingreso'?'income':'expense'}
const catIconFor=(item,tipo='gasto')=>catIcon({tipo,categoria_id:item?.id||item?.categoria_id||'',descripcion:item?.nombre||item?.descripcion||''});
const catBadge=(item,tipo='gasto',size='sm')=>`<span class="cat-bubble ${size} ${esc(tipo)}" aria-hidden="true">${ico(catIconFor(item,tipo),size==='sm'?'sm':'')}</span>`;
// La última cuenta usada para cada tipo: registrar el gasto de siempre es elegir solo el monto.
const lastAccount=type=>{try{const id=localStorage.getItem('dcarela-mm-cuenta-'+type);return accounts().some(a=>a.id===id&&a.estado!=='eliminada')?id:''}catch{return ''}};
const rememberAccount=(type,id)=>{try{localStorage.setItem('dcarela-mm-cuenta-'+type,id)}catch{}};
const curr=row=>row.moneda||account(row.cuenta_id)?.moneda||'DOP';
const categoryMap=()=>Object.fromEntries(cats().map(c=>[c.id,c.nombre]));
const accountCurrencies=()=>Object.fromEntries(accounts().map(a=>[a.id,a.moneda]));
const matchingMonth=row=>String(row.fecha||'').startsWith(`${state.month}-`);
const active=()=>money.activeMovements(rows());
const getMonthRows=(currency=state.currency)=>rows().filter(r=>matchingMonth(r)&&curr(r)===currency);
const getRangeRows=(from,to,currency=state.currency)=>rows().filter(r=>{const d=String(r.fecha||'');return (!from||d>=from)&&(!to||d<=to)&&curr(r)===currency;});
const rangeTotals=(from,to,currency=state.currency)=>core.summarizeMovements(getRangeRows(from,to,currency),from||'1900-01-01',to||'2999-12-31');
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
const cashAccountOptions=(selected,skip='',allowCredit=false)=>accounts().filter(a=>a.id!==skip&&(allowCredit||a.tipo!=='tarjeta_credito')&&(!isLive||a.moneda==='DOP')).map(a=>`<option value="${esc(a.id)}" ${selected===a.id?'selected':''}>${esc(a.nombre)} · ${a.moneda}</option>`).join('');
function setTheme(theme){state.theme=theme;document.documentElement.dataset.theme=theme;localStorage.setItem('dcarela-mm-theme',theme);render()}
let loadSerial=0,lastLoadedAt=0;
async function ensureFullHistory(){
 if(!isLive||!state.data||state.historyLoaded||state.historyLoading)return;
 const reqBusiness=state.business,reqSerial=loadSerial;
 state.historyLoading=true;
 try{
  const full=await loadFullFinanceHistory(reqBusiness,{accounts:state.data.accounts,preferences:state.data.preferences});
  if(reqSerial!==loadSerial||state.business!==reqBusiness||!state.data)return;
  state.data={...state.data,movements:full.movements,sales:full.sales,fullHistoryLoaded:true};
  state.historyLoaded=true;
 }catch{ /* Mantiene los movimientos ya leídos si falla la carga histórica en segundo plano */ }
 finally{if(reqSerial===loadSerial){state.historyLoading=false;render()}}
}
async function load(){const serial=++loadSerial;const demoLoginPreview=!isLive&&params.get('login')==='1';state.loading=true;state.error='';state.authRequired=demoLoginPreview;state.data=null;state.historyLoaded=!isLive;state.historyLoading=false;render();try{
 if(params.get('fail')==='1')throw new Error('Error de lectura simulado: no se pudo obtener el libro financiero.');
 const data=await loadFinance(defaultBranchId);
 if(serial!==loadSerial)return;
 state.business=data.businessId;
 for(const key of Object.keys(branches))delete branches[key];
 for(const b of data.authorizedBusinesses)branches[b.id]=(!isLive&&DEMO_BRANCH_NAMES[b.id])?DEMO_BRANCH_NAMES[b.id]:b.name;
 for(const a of data.accounts){const balance=core.effectiveAccountBalance(a,data.movements);if(!Number.isSafeInteger(balance))throw new Error('Saldo fuera de rango o sin verificación para una cuenta.')}state.data=data;state.currency='DOP';state.historyLoaded=!isLive||Boolean(data.fullHistoryLoaded);
 state.search.accountIds=data.accounts.map(a=>a.id);
 state.entryAccount=data.accounts.find(a=>a.moneda==='DOP'&&a.tipo!=='tarjeta_credito')?.id||data.accounts[0]?.id||'';
 state.entryDest=data.accounts.find(a=>a.moneda==='DOP'&&a.id!==state.entryAccount)?.id||'';
 state.entryCategory=data.categories.find(c=>c.tipo===state.entryType)?.id||'';
 lastLoadedAt=Date.now();
 if(isLive&&!state.historyLoaded)setTimeout(()=>ensureFullHistory(),350);
 }catch(e){if(serial===loadSerial){state.error=e?.message||'No fue posible comprobar los datos.';state.authRequired=e?.code==='AUTH_REQUIRED';}}finally{if(serial===loadSerial){state.loading=false;render()}}}
function renderHeader(){return `<header class="topbar"><div class="brand-block"><img class="brand-logo" src="${isPlazaBranch()?'./icons/icon-plaza-192.png':'./icons/dcarela-logo.png'}" width="38" height="38" alt="Logo D’ Carela ${esc(branchDisplayName())}"><div><div class="brand-title">D’ Carela</div><div class="brand-sub">${isPlazaBranch()?'PLAZA ARTESANAL':'CENTRAL'} · FINANZAS</div></div></div><div class="top-actions">
 <button class="round-button theme-toggle" data-do="theme" aria-label="Cambiar a tema ${state.theme==='dark'?'claro':'oscuro'}" title="Cambiar a tema ${state.theme==='dark'?'claro':'oscuro'}">${ico(state.theme==='dark'?'sun':'moon')}</button>
 <button class="round-button" data-do="refresh" aria-label="Actualizar movimientos de Caja" title="Actualizar movimientos de Caja">${ico('refresh')}</button>
 </div></header>${!isLive?`<div class="demo-ribbon"><span><span class="dot"></span><strong>PROTOTIPO</strong> · ${esc(branchDisplayName())}</span><span>Sin conexión real</span></div>`:emulatorWritesAllowed()?`<div class="demo-ribbon"><span>Emulador Firebase aislado</span><span>Datos ficticios</span></div>`:canRegister()?`<div class="demo-ribbon"><span>Libro Firebase · ${esc(branchDisplayName())}</span><span>Caja pendiente de confirmar</span></div>`:`<div class="demo-ribbon"><span>Libro Firebase · ${esc(branchDisplayName())} · solo lectura</span><span>Escrituras en validación</span></div>`}`}
function renderBottom(){const nav=[['home','house','Resumen'],['finance','bars','Finanzas'],['debts','clock','Compromisos'],['more','tools','Herramientas']];const selected=state.route?'more':state.tab;
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
 const bank=(a?.tipo==='banco'||a?.tipo==='tarjeta_credito')?bankKey(a):null;
 if(bank)return `<span class="${cls} bank-logo" data-bank="${bank}"><img src="./assets/bancos/${bank}.png" alt="" loading="eager" decoding="async"></span>`;
 return `<span class="${cls}" data-kind="${esc(a?.tipo||'efectivo')}">${ico(a?.tipo==='banco'?'bank':a?.tipo==='tarjeta_credito'?'card':'wallet')}</span>`;
}
function accountRows(list=accounts()){return list.map(a=>`<button class="account-row" data-do="account" data-id="${esc(a.id)}">${accountBadge(a)}<span class="row-copy"><b>${esc(a.nombre)}</b><small>${a.tipo==='tarjeta_credito'?'Tarjeta de crédito':a.tipo==='banco'?'Cuenta bancaria':'Efectivo'} · ${a.moneda}${a.incluir_en_total===false?' · Excluida del total':''}</small></span><span class="row-amount ${accountBalance(a)<0?'expense-text':'balance-text'}"><span title="${moneyText(accountBalance(a),a.moneda)}">${moneyText(accountBalance(a),a.moneda,Math.abs(accountBalance(a))>=100000000)}</span><span class="tiny">${a.tipo==='tarjeta_credito'?'Deuda / saldo':'Ver historial'}</span></span></button>`).join('')}
function movementsUI(list,limit=null){const show=limit?list.slice(0,limit):list;if(!show.length)return '<div class="empty">Sin movimientos para este filtro.</div>';
 return show.map(m=>`<button class="movement-row ${m.estado==='anulado'?'is-void':''}" data-do="movement" data-id="${esc(m.id)}"><span class="cat-bubble ${esc(m.tipo)}" aria-hidden="true">${ico(catIcon(m),'sm')}</span><span class="row-copy"><b>${esc(movementTitle(m))}</b><small>${esc(cat(m.categoria_id)?.nombre||(m.tipo==='transferencia'?'Transferencia':'Sin categoría'))} · ${esc(account(m.cuenta_id)?.nombre||'Cuenta')}${m.estado==='anulado'?' · Anulado':''}</small></span><span class="row-amount ${m.tipo} ${m.tipo==='ingreso'?'income-text':m.tipo==='gasto'?'expense-text':'warning-text'}">${m.tipo==='gasto'?'−':m.tipo==='ingreso'?'+':''}<span title="${moneyText(m.monto_centavos,curr(m))}">${moneyText(m.monto_centavos,curr(m),m.monto_centavos>=100000000)}</span><span class="tiny">${esc(m.fecha?.slice(8,10)||'')}</span></span></button>`).join('')}
function groupedByDate(list){if(!list.length)return '<div class="card"><div class="empty">No hay movimientos en este periodo.</div></div>';const bucket=new Map();for(const m of list){const key=String(m.fecha||'');if(!bucket.has(key))bucket.set(key,[]);bucket.get(key).push(m)}
 return [...bucket.entries()].sort(([a],[b])=>b.localeCompare(a)).map(([day,items])=>{const valid=/^\d{4}-\d{2}-\d{2}$/.test(day);const isoDay=valid?new Date(`${day}T12:00:00Z`).getUTCDay():0;const dayNum=valid?day.slice(8):'—';const dayWk=valid?['dom','lun','mar','mié','jue','vie','sáb'][isoDay]:'—';const dayFull=valid?weekDay(day):'Sin fecha';const dayNice=valid?niceDay(day):'Fecha no verificada';const byCurrency=[...new Set(items.map(curr))].map(c=>{const sub=valid?core.summarizeMovements(items.filter(m=>curr(m)===c),day,day):{ingresos_centavos:0,gastos_centavos:0};return moneyText(sub.ingresos_centavos-sub.gastos_centavos,c)}).join(' · ');const curSub=valid?core.summarizeMovements(items.filter(m=>curr(m)===state.currency),day,day):{ingresos_centavos:0,gastos_centavos:0};return `<div class="date-section"><div class="date-head"><div class="date-box"><b>${dayNum}</b><small>${dayWk}</small></div><div class="date-heading"><b>${esc(dayFull)}</b><small>${esc(dayNice)}</small></div><span class="date-net ${items.length&&curSub.ingresos_centavos>=curSub.gastos_centavos?'income-text':'expense-text'}" title="${esc(byCurrency)}">${esc(byCurrency)}</span></div><div class="card">${movementsUI(items)}</div></div>`}).join('')}
function flowChart(currency=state.currency){const groups=simple.group(getMonthRows(currency),state.month,'day',accountCurrencies()).reverse();
 if(!groups.length)return '<div class="empty">Sin movimientos para graficar este mes.</div>';
 const entries=groups.map(g=>({day:g.key,income:g.currencies[currency]?.income||0,expense:g.currencies[currency]?.expenses||0}));
 const max=Math.max(1,...entries.flatMap(e=>[e.income,e.expense]));const left=3,right=357,top=12,bottom=106;
 const x=i=>left+i*(right-left)/Math.max(1,entries.length-1);
 const y=v=>bottom-Math.sqrt(Math.max(0,v)/max)*(bottom-top);
 const path=kind=>entries.map((e,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(e[kind]).toFixed(1)}`).join(' ');
 const marks=[0,Math.floor((entries.length-1)/2),entries.length-1].filter((v,i,a)=>a.indexOf(v)===i);
 return `<section class="flow-panel" aria-label="Tendencia diaria de ${esc(longMonth(state.month))}"><div class="flow-head"><h2>Movimiento del mes</h2><small>${esc(currency)} · ${entries.length} días con actividad</small></div><svg class="flow-svg" viewBox="0 0 360 138" role="img" aria-label="Ingresos y gastos confirmados por día"><path class="flow-grid" d="M3 12H357 M3 59H357 M3 106H357"/><path class="flow-income" pathLength="1" d="${path('income')}"/><path class="flow-expense" pathLength="1" d="${path('expense')}"/>${marks.map(i=>`<text x="${x(i).toFixed(1)}" y="128" text-anchor="${i===0?'start':i===entries.length-1?'end':'middle'}">${entries[i].day.slice(8)}</text>`).join('')}</svg><div class="flow-legend"><span>— Ingresos</span><span>┄ Gastos</span></div></section>`}
function categoryChart(currency=state.currency){const b=simple.breakdown(rows(),state.month,'gasto',currency,categoryMap(),accountCurrencies());
 return `<section class="category-panel"><div class="section-head"><h2>Gastos por categoría</h2><small>${esc(currency)}</small></div>${b.items.length?b.items.slice(0,5).map(item=>`<div class="category-bar-row"><div class="category-bar-head"><span class="category-bar-label">${catBadge(item,'gasto')}<span>${esc(item.nombre)}</span><small class="cat-pct">${item.porcentaje}%</small></span><strong>${moneyText(item.centavos,currency)}</strong></div><div class="category-track"><span style="width:${Math.max(1,item.porcentaje)}%"></span></div></div>`).join(''):'<div class="empty">Sin gastos en este periodo.</div>'}</section>`}
function dashboardSignals(){const t=monthTotals('DOP'),income=t.ingresos_centavos,expense=t.gastos_centavos;
 const budgets=state.data?.budgets||[];const healthy=budgets.filter(b=>{const spent=core.summarizeMovements(rows().filter(m=>m.categoria_id===b.categoria_id),`${state.month}-01`,`${state.month}-31`).gastos_centavos;return b.monto_centavos>0&&spent*100/b.monto_centavos<Number(b.alerta_porcentaje||85)}).length;
 const signals=[['Margen disponible',income?`${Math.round((income-expense)*100/income)}%`:'—',income?Math.max(0,Math.min(100,Math.round((income-expense)*100/income))):0],['Cobertura de gastos',expense?`${Math.round(income*100/expense)}%`:'—',expense?Math.max(0,Math.min(100,Math.round(income*100/expense))):0],['Presupuestos sanos',budgets.length?`${healthy} de ${budgets.length}`:'Sin presupuestos',budgets.length?healthy*100/budgets.length:0]];
 return `<section class="signals-panel"><div class="section-head"><h2>Indicadores</h2><small>${esc(longMonth(state.month))}</small></div>${signals.map(([label,value,pct])=>`<div class="signal-row"><div><span>${label}</span><strong>${value}</strong></div><div class="category-track"><span style="width:${pct}%"></span></div></div>`).join('')}</section>`}
// 35.23 · Accesos rápidos: lo que más se hace, a un toque desde el inicio.
function quickActions(){const can=canWriteBranch();const b=(type,ic,label,cls)=>`<button class="quick-action ${cls}" type="button" data-do="quick" data-type="${type}" ${can?'':'disabled'}><span class="quick-icon">${ico(ic)}</span><span>${label}</span></button>`;
 return `<nav class="quick-actions" aria-label="Acciones rápidas">${b('gasto','outflow','Gasto','expense')}${b('ingreso','inflow','Ingreso','income')}${b('transferencia','arrows','Transferir','transfer')}<button class="quick-action bills" type="button" data-do="route" data-route="debts"><span class="quick-icon">${ico('receipt')}</span><span>Pagos</span></button></nav>`}
// 35.23 · Lo que hay que pagar ya (vencido y de este mes), con «Pagar» al lado: los compromisos dejan de estar escondidos en «Más».
function upcomingPayments(){
 const s=obligationRows(),end=`${state.month}-31`;
 const list=s.rows.filter(x=>x.due&&x.due<=end&&(x.outstanding==null||x.outstanding>0)).sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,4);
 if(!list.length)return '';
 const can=canWriteBranch();
 return `<div class="section-head"><h2>Próximos pagos</h2><button class="text-link" type="button" data-do="route" data-route="debts">Ver todos</button></div><div class="card">${list.map(x=>{const late=x.due<today;
  return `<div class="pay-row ${late?'late':''}"><button class="pay-copy" type="button" data-do="debt" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><small>${late?'Vencido · ':''}${esc(new Intl.DateTimeFormat('es-DO',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${x.due}T12:00:00Z`)))}</small></button><span class="pay-amount">${x.outstanding==null?'—':moneyText(x.outstanding,'DOP')}</span>${can?`<button class="pay-btn" type="button" data-do="debt-pay" data-id="${esc(x.id)}">Pagar</button>`:''}</div>`}).join('')}</div>`}
function renderHome(){const total=monthTotals('DOP');const acct=accounts().filter(a=>a.estado!=='eliminada');
 return `<main class="page" id="main" data-v3526-page="home"><section class="screen-intro"><div class="eyebrow">VISTA GENERAL</div><h1 class="page-title">Resumen</h1><div class="subline">${esc(branches[state.business]||state.business)} · ${esc(longMonth(state.month))}</div></section>
 ${summaryCard()}${quickActions()}<div class="metric-grid">${metricCard('Ingresos del mes','+ '+moneyText(total.ingresos_centavos),'income')}${metricCard('Gastos del mes','− '+moneyText(total.gastos_centavos),'expense')}</div>
 ${upcomingPayments()}${flowChart('DOP')}${dashboardSignals()}${categoryChart('DOP')}
 <div class="section-head"><h2>Cuentas del negocio</h2><small>${acct.length} cuentas</small></div><div class="card">${accountRows(acct)}</div><div class="soft-note">Los saldos de monedas distintas no se convierten ni se suman entre sí.</div>
 <div class="section-head"><h2>Actividad reciente</h2><button class="round-button" data-do="tab" data-tab="finance" aria-label="Ver todos los movimientos">${ico('chevron')}</button></div><div class="card">${movementsUI(active().slice(0,6))}</div></main>`}
function periodPicker(){
 if(state.financeView==='ano')return `<div class="month-swipe year-picker" role="group" aria-label="Año ${esc(state.year)}"><button class="year-step-btn" type="button" data-do="prev-year" aria-label="Año anterior">${ico('back','sm')}</button><span>Año ${esc(state.year)}</span><button class="year-step-btn" type="button" data-do="next-year" aria-label="Año siguiente">${ico('chevron','sm')}</button></div>`;
 if(state.financeView==='personalizado')return `<div class="month-swipe range-banner" role="group" aria-label="Periodo personalizado ${esc(state.customFrom)} a ${esc(state.customTo)}"><span>${esc(niceDay(state.customFrom))} — ${esc(niceDay(state.customTo))}</span><small>${state.historyLoading?'Cargando base antigua…':'Base histórica completa'}</small></div>`;
 return `<div class="month-swipe" data-swipe="month" role="group" tabindex="0" aria-label="${esc(longMonth(state.month))}. Desliza horizontalmente para cambiar mes"><span>${esc(longMonth(state.month))}</span><small>Desliza para cambiar mes</small></div>`;
}
function financeNavigation(){const index=Math.max(0,FINANCE_VIEWS.findIndex(([id])=>id===state.financeView));
 return `<div class="finance-filter" data-swipe="view" role="group" tabindex="0" aria-label="${FINANCE_VIEWS[index][1]}. Desliza horizontalmente para cambiar vista"><div class="filter-current"><span>VISTA ${index+1} DE ${FINANCE_VIEWS.length}</span><strong>${FINANCE_VIEWS[index][1]}</strong></div><button class="filter-open" data-do="filter-toggle" aria-label="Mostrar filtros" aria-expanded="${state.financeFilterOpen}">${ico('filter')}</button></div>${state.financeFilterOpen?`<div class="finance-filter-menu" role="group" aria-label="Filtros de finanzas">${FINANCE_VIEWS.map(([id,label])=>`<button data-do="view" data-view="${id}" class="${id===state.financeView?'selected':''}" ${id===state.financeView?'aria-current="true"':''}>${label}</button>`).join('')}<label class="filter-currency">Moneda<select name="currency" aria-label="Moneda de la vista">${currencyOption('DOP')}${currencyOption('USD')}</select></label></div>`:''}`}
function totalsUI(){
 let t,scope,label;
 if(state.financeView==='diario'){t=core.summarizeMovements(getMonthRows(),state.day,state.day);scope='del día';label=`del ${niceDay(state.day)}`;}
 else if(state.financeView==='ano'){t=rangeTotals(`${state.year}-01-01`,`${state.year}-12-31`);scope='del año';label=`del año ${state.year}`;}
 else if(state.financeView==='personalizado'){const f=state.customFrom<=state.customTo?state.customFrom:state.customTo;const to=state.customFrom<=state.customTo?state.customTo:state.customFrom;t=rangeTotals(f,to);scope='del periodo';label=`de ${f} a ${to}`;}
 else{t=monthTotals();scope='del mes';label=`de ${longMonth(state.month)}`;}
 return `<div class="triple-summary" role="group" aria-label="Totales ${esc(label)}"><div><small>Ingresos ${scope}</small><strong class="income-text" title="${moneyText(t.ingresos_centavos,state.currency)}">+${moneyText(t.ingresos_centavos,state.currency,t.ingresos_centavos>=100000000)}</strong></div><div><small>Gastos ${scope}</small><strong class="expense-text" title="${moneyText(t.gastos_centavos,state.currency)}">−${moneyText(t.gastos_centavos,state.currency,t.gastos_centavos>=100000000)}</strong></div><div><small>Resultado ${scope}</small><strong class="${t.ingresos_centavos>=t.gastos_centavos?'income-text':'expense-text'}">${moneyText(t.ingresos_centavos-t.gastos_centavos,state.currency,Math.abs(t.ingresos_centavos-t.gastos_centavos)>=100000000)}</strong></div></div>`}
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
function statList(short=false){const b=getStat();const tones=['var(--tone-1)','var(--tone-2)','var(--tone-3)','var(--tone-4)','var(--tone-5)'];return `<div class="card" style="padding:5px 15px">${b.items.slice(0,short?4:undefined).map((x,i)=>`<div class="stat-row">${catBadge(x,state.statsType)}<span class="cat">${esc(x.nombre)}<small><span class="stat-dot" style="background:${tones[i%tones.length]}"></span>${x.porcentaje}% · ${x.movimientos} mov.</small></span><strong class="${state.statsType==='ingreso'?'income-text':'expense-text'}">${moneyText(x.centavos,state.currency)}</strong></div>`).join('')||'<div class="empty">No hay categorías para el filtro.</div>'}</div>`}
function renderStats(){const b=getStat();let total=0;const tones=['var(--tone-1)','var(--tone-2)','var(--tone-3)','var(--tone-4)','var(--tone-5)'];const parts=b.items.map((x,i)=>{const start=total;const size=b.total?x.centavos*100/b.total:0;total+=size;return `${tones[i%tones.length]} ${start.toFixed(3)}% ${total.toFixed(3)}%`}).join(',');return `<div class="mini-switch" role="group" aria-label="Estadística de ingresos o gastos"><button data-do="stats-type" data-type="gasto" class="${state.statsType==='gasto'?'active':''}">Gastos</button><button data-do="stats-type" data-type="ingreso" class="${state.statsType==='ingreso'?'active':''}">Ingresos</button></div><div class="card donut-panel" style="margin-top:12px"><div class="eyebrow" style="text-align:center">DISTRIBUCIÓN POR CATEGORÍA</div><div class="donut" style="background:${b.total?`conic-gradient(${parts})`:'var(--surface-2)'}"><div class="donut-center"><small>Total ${state.statsType==='gasto'?'gastos':'ingresos'}</small><strong>${moneyText(b.total,state.currency)}</strong></div></div><div class="soft-note" style="text-align:center;margin-bottom:0">${longMonth(state.month)} · ${state.currency} · sin conversión de divisas</div></div><div class="section-head"><h2>Categorías</h2><small>${b.items.length} categorías</small></div>${statList()}`}
function availableYears(){
 const years=new Set([today.slice(0,4),String(Number(today.slice(0,4))-1),state.year]);
 for(const r of rows()){const y=String(r.fecha||'').slice(0,4);if(/^\d{4}$/.test(y))years.add(y);}
 return [...years].sort((a,b)=>b.localeCompare(a));
}
function renderYear(){
 const years=availableYears();
 const from=`${state.year}-01-01`,to=`${state.year}-12-31`;
 const yearRows=active().filter(r=>String(r.fecha||'').startsWith(`${state.year}-`)&&curr(r)===state.currency);
 const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
 const byMonth=Array.from({length:12},(_,idx)=>{
  const mKey=`${state.year}-${String(idx+1).padStart(2,'0')}`;
  const mRows=yearRows.filter(r=>String(r.fecha||'').startsWith(`${mKey}-`));
  const s=core.summarizeMovements(mRows,`${mKey}-01`,`${mKey}-31`);
  return {idx,mKey,label:monthNames[idx],income:s.ingresos_centavos,expense:s.gastos_centavos,count:mRows.length};
 }).filter(m=>m.count>0||m.mKey===state.month);
 const peak=Math.max(1,...byMonth.flatMap(m=>[m.income,m.expense]));
 return `<div class="search-chips year-chips" role="group" aria-label="Años disponibles">${years.map(y=>`<button type="button" class="chip ${y===state.year?'is-active':''}" data-do="select-year" data-year="${esc(y)}">${esc(y)}</button>`).join('')}${isLive&&!state.historyLoaded?`<button type="button" class="chip" data-do="load-full-history">${state.historyLoading?'Cargando base antigua…':'Cargar todo el historial'}</button>`:''}</div>
 <div class="section-head"><h2>Resumen mensual · ${esc(state.year)}</h2><small>${yearRows.length} movimientos</small></div>
 <div class="period-stack">${byMonth.length?byMonth.map(m=>{const top=m.income+m.expense;const pct=top>0?Math.round(m.income*100/top):0;return `<button type="button" class="period-card year-month-row" data-do="jump-month" data-month="${esc(m.mKey)}"><div class="period-line"><span>${esc(m.label)} ${esc(state.year)}</span><small>${m.count} mov.</small></div><div class="horizontal-bar"><span class="gain" style="width:${pct}%"></span><span class="spend" style="width:${100-pct}%"></span></div><div class="period-values"><span class="income-text">+ ${moneyText(m.income,state.currency,m.income>=peak&&m.income>=1000000)}</span><span class="expense-text">− ${moneyText(m.expense,state.currency,m.expense>=1000000)}</span></div></button>`;}).join(''):'<div class="empty">Sin movimientos registrados en este año.</div>'}</div>
 <div class="section-head"><h2>Detalle del año ${esc(state.year)}</h2><small>${yearRows.length}</small></div>
 ${groupedByDate(yearRows.slice(0,120))}`;
}
function renderCustomRange(){
 const from=state.customFrom<=state.customTo?state.customFrom:state.customTo;
 const to=state.customFrom<=state.customTo?state.customTo:state.customFrom;
 const rangeRows=active().filter(r=>{const d=String(r.fecha||'');return d>=from&&d<=to&&curr(r)===state.currency;});
 return `<section class="custom-range-panel" aria-label="Filtro personalizado por periodo">
  <div class="search-chips" role="group" aria-label="Rangos rápidos">
   <button type="button" class="chip" data-do="custom-preset" data-preset="7d">7 días</button>
   <button type="button" class="chip" data-do="custom-preset" data-preset="month">Este mes</button>
   <button type="button" class="chip" data-do="custom-preset" data-preset="90d">90 días</button>
   <button type="button" class="chip" data-do="custom-preset" data-preset="prev-year">${Number(today.slice(0,4))-1}</button>
   <button type="button" class="chip" data-do="custom-preset" data-preset="all">Todo</button>
  </div>
  <div class="filter-grid">
   <div><label class="field-label" for="fin-custom-from">Desde</label><input class="field-control" id="fin-custom-from" type="date" name="finance-custom-from" value="${esc(state.customFrom)}"></div>
   <div><label class="field-label" for="fin-custom-to">Hasta</label><input class="field-control" id="fin-custom-to" type="date" name="finance-custom-to" value="${esc(state.customTo)}"></div>
  </div>
 </section>
 <div class="section-head"><h2>Movimientos del periodo</h2><small>${rangeRows.length} movimientos</small></div>
 ${groupedByDate(rangeRows)}`;
}
function renderFinance(){let content='';switch(state.financeView){case 'calendario':content=renderCalendar();break;case 'semana':content=`${flowChart()}<div class="section-head"><h2>Semanas del mes</h2></div>${periodGroups('week')}`;break;case 'mes':content=`${flowChart()}${categoryChart()}<div class="section-head"><h2>Día por día</h2></div>${groupedByDate(active().filter(r=>matchingMonth(r)&&curr(r)===state.currency))}`;break;case 'ano':content=renderYear();break;case 'personalizado':content=renderCustomRange();break;case 'resumen':content=renderFinSummary();break;case 'estadisticas':content=renderStats();break;default:content=renderDay()}
 return `<main id="main" class="page"><section class="screen-intro finance-intro"><h1 class="page-title">Finanzas</h1><span class="screen-kicker">${state.currency}</span></section>${periodPicker()}${financeNavigation()}${totalsUI()}<section class="finance-view-body" data-swipe="view" aria-label="${FINANCE_VIEWS.find(([id])=>id===state.financeView)?.[1]||'Día'}. Desliza para cambiar de vista">${content}</section></main>`}
function searchResults(){if(!state.searched)return `<div class="card"><div class="empty">Selecciona los filtros y pulsa Buscar movimientos.</div></div>`;
 const q=state.search.query.trim().toLocaleLowerCase('es');const found=rows().filter(m=>{
  const d=m.fecha||'';if(d<state.search.from||d>state.search.to)return false;
  if(state.search.type&&m.tipo!==state.search.type)return false;
  if(state.search.category&&m.categoria_id!==state.search.category)return false;
  if(state.search.accountIds.length===0||(!state.search.accountIds.includes(m.cuenta_id)&&!state.search.accountIds.includes(m.cuenta_destino_id)))return false;
  return [m.descripcion,m.nota,cat(m.categoria_id)?.nombre,account(m.cuenta_id)?.nombre].some(v=>String(v||'').toLocaleLowerCase('es').includes(q));
 }).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
 return `<div class="section-head"><h2>Resultados</h2><small>${found.length} movimientos</small></div>${found.length?groupedByDate(found):'<div class="card"><div class="empty">No se encontraron movimientos con esos filtros.</div></div>'}`}
function searchChips(){
 const prevMonth=nMonth(initialMonth,-1),prevEnd=monthEndOf(prevMonth),d30=nDay(today,-29);
 const chips=[
  ['this-month','Este mes',state.search.from===`${initialMonth}-01`&&state.search.to===initialMonthEnd],
  ['last-month','Mes pasado',state.search.from===`${prevMonth}-01`&&state.search.to===prevEnd],
  ['30d','Últimos 30 días',state.search.from===d30&&state.search.to===today],
  ['all-time','Todo el historial',state.search.from<='2020-01-01'],
  ['gasto','Solo gastos',state.search.type==='gasto'],
  ['ingreso','Solo ingresos',state.search.type==='ingreso'],
  ['transferencia','Transferencias',state.search.type==='transferencia'],
  ['reset','Limpiar',false]
 ];
 return `<div class="search-chips" role="group" aria-label="Filtros rápidos">${chips.map(([id,label,active])=>`<button type="button" class="chip ${active?'is-active':''}" data-do="search-chip" data-chip="${id}" aria-pressed="${active?'true':'false'}">${label}</button>`).join('')}</div>`;
}
function renderSearch(fromTools=false){return `<main id="main" class="page" data-v3526-page="search">${fromTools?routeHead('Búsqueda','Filtra el historial de tu sucursal'):`<section class="screen-intro"><div class="eyebrow">ENCUENTRA CUALQUIER OPERACIÓN</div><h1 class="page-title">Búsqueda</h1><div class="subline">Filtra el historial de tu sucursal</div></section>`}${searchChips()}<form id="search-form" class="card search-form-card"><label class="field-label" for="query" style="margin-top:0">Concepto, nota o categoría</label><div class="search-input-wrapper">${ico('search')}<input class="field-control" id="query" name="search-query" value="${esc(state.search.query)}" placeholder="Buscar movimientos..." autocomplete="off"></div>
 <div class="search-advanced-fields" id="search-advanced-fields">
  <div class="filter-grid"><div><label class="field-label" for="date-from">Desde</label><input class="field-control" type="date" name="from" id="date-from" value="${state.search.from}"></div><div><label class="field-label" for="date-to">Hasta</label><input class="field-control" type="date" name="to" id="date-to" value="${state.search.to}"></div></div>
  <div class="search-accounts"><label class="field-label">Cuentas</label><button type="button" class="filter-trigger" data-do="accounts-filter"><span>${state.search.accountIds.length===accounts().length?'Todas las cuentas':`${state.search.accountIds.length} cuentas seleccionadas`}</span>${ico('chevron','sm')}</button></div>
  <div class="filter-grid"><div><label class="field-label" for="search-type">Tipo</label><select class="field-select" id="search-type" name="search-type"><option value="">Todos</option><option value="ingreso" ${state.search.type==='ingreso'?'selected':''}>Ingreso</option><option value="gasto" ${state.search.type==='gasto'?'selected':''}>Gasto</option><option value="transferencia" ${state.search.type==='transferencia'?'selected':''}>Transferencia</option></select></div><div><label class="field-label" for="search-cat">Categoría</label><select class="field-select" id="search-cat" name="search-category"><option value="">Todas</option>${cats().map(c=>`<option value="${esc(c.id)}" ${state.search.category===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}</select></div></div>
 </div><button type="submit" class="primary-btn full" style="margin-top:16px">${ico('search','sm')} Buscar movimientos</button></form><p class="search-summary">Incluye registros anulados en los resultados para conservar la trazabilidad.</p>${searchResults()}</main>`}
const moreItems=[['search','search','Buscar movimientos','Filtra historial por fecha, monto y categoría'],['mail','mail','Correos y Códigos Cash','Cuentas Gmail, transferencias y retiros'],['books','book','Libros fiscales · Hermes','Compras 606, ventas 607 y validación'],['budgets','target','Presupuestos','Control y avance por categoría'],['cards','card','Tarjetas y bancos','Límites, corte, FX USD y débito digital'],['settings','settings','Ajustes y Apariencia','Paleta glass, alertas push y tema']];
function renderMore(){return `<main id="main" class="page" data-v3526-page="tools"><section class="screen-intro"><h1 class="page-title">Herramientas</h1><div class="subline">Accesos avanzados, correos y control</div></section><div class="card settings-list">${moreItems.map(([route,ic,title,caption])=>`<button class="setting-row" data-do="route" data-route="${route}"><span class="setting-icon" aria-hidden="true">${ico(ic,'sm')}</span><span class="row-copy"><b>${title}</b><small>${caption}</small></span>${ico('chevron','sm chev')}</button>`).join('')}</div>${isLive?'<button class="secondary-btn full finance-signout" data-do="sign-out">Cerrar sesión</button>':`<button class="secondary-btn full finance-signout" data-do="demo-login">Ver pantalla de login · ${esc(branchDisplayName())}</button>`}</main>`}
function routeHead(title,desc,actionHtml=''){const intro=`<section class="screen-intro"><button class="round-button" data-do="back-more" aria-label="Regresar a Herramientas">${ico('back')}</button><div class="eyebrow">HERRAMIENTAS</div><h1 class="page-title">${title}</h1><div class="subline">${desc}</div></section>`;return actionHtml?`<div class="route-head-row">${intro}${actionHtml}</div>`:intro}
function obligationRows(){return money.obligationSummary({commitments:state.data.commitments||[],costObligations:state.data.costObligations||[],costRecurrents:state.data.costRecurrents||[],month:state.month})}
function debtCatalog(){
 const summary=obligationRows(),monthEnd=`${state.month}-31`;
 const seenIds=new Set(summary.rows.map(x=>x.id));
 const seenRecurring=new Set(summary.rows.map(x=>x.recurringId).filter(Boolean));
 const seenKeys=new Set((state.data?.costObligations||[]).map(o=>`${o.recurrenteId||o.recurrente_id||''}:${core.businessDay(o.venceEn||o.vence_en||'')}`).filter(k=>!k.startsWith(':')));
 const futurePlans=(state.data?.costRecurrents||[]).filter(p=>p&&p.activo!==false&&p.activo!==0).map(p=>{
  const id=`plan:${p.id||p.recurrenteId||p.nombre}`;
  const recurringId=p.id||p.recurrenteId||null;
  const due=core.businessDay(p.proximaFecha||p.proxima_fecha||'');
  const amt=Number(p.montoEstimadoCentavos??p.monto_estimado_centavos);
  return {id,recurringId,source:'planificado',name:p.nombre||p.descripcion||'Pago recurrente',type:String(p.categoria||p.frecuencia||'recurrente').toLowerCase(),due,periodAmount:Number.isSafeInteger(amt)?amt:null,outstanding:Number.isSafeInteger(amt)?amt:null,active:true,state:`previsto · ${p.frecuencia||'mensual'}`,raw:p};
 }).filter(item=>!seenIds.has(item.id)&&(!item.recurringId||(!seenRecurring.has(item.recurringId)&&!seenKeys.has(`${item.recurringId}:${item.due}`)))&&(!item.due||item.due>monthEnd));
 return {summary,allRows:[...summary.rows,...futurePlans],futurePlans};
}
function paymentRowsFor(item){const raw=item.raw||{};const id=String(item.source==='factura'?(raw.id||raw.obligacionId):raw.id||'');const list=item.source==='factura'?state.data.costPayments||[]:state.data.commitmentPayments||[];return list.filter(p=>String(item.source==='factura'?(p.obligacionId||p.obligacion_id):(p.compromiso_id||p.compromisoId))===id).sort((a,b)=>String(b.fecha||b.pagadoEn||b.created_at||'').localeCompare(String(a.fecha||a.pagadoEn||a.created_at||'')))}
function renderDebts(){
 const {summary,allRows}=debtCatalog();
 const overdue=allRows.filter(x=>x.due&&x.due<today);
 const current=allRows.filter(x=>x.due>=today&&x.due.startsWith(state.month));
 const upcoming=allRows.filter(x=>!overdue.includes(x)&&!current.includes(x)).sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999')));
 const row=item=>{const raw=item.raw||{};return `<button class="movement-row" data-do="debt" data-id="${esc(item.id)}">${catBadge({id:raw.categoriaId||raw.categoria_id||'',nombre:`${item.name} ${item.type||''} ${raw.acreedor||''}`},'gasto')}<span class="row-copy"><b>${esc(item.name)}</b><small>${esc(item.type||'Obligación')} · ${esc(item.due||'Sin fecha verificada')} · ${esc(item.state)}</small></span><span class="row-amount warning-text">${item.outstanding==null?'Saldo no verificado':moneyText(item.outstanding,'DOP')}<span class="tiny">Ver detalle</span></span></button>`};
 const can=canWriteBranch();
 return `<main class="page" id="main" data-v3526-page="debts">${state.route==='debts'?routeHead('Compromisos','Libro financiero y obligaciones de Caja',`<button class="route-add-btn" type="button" data-do="debt-new" ${!can?'disabled':''}>${ico('plus','sm')} Nuevo</button>`):`<div class="route-head-row"><section class="screen-intro"><div class="eyebrow">OBLIGACIONES Y VENCIMIENTOS</div><h1 class="page-title">Compromisos</h1><div class="subline">Cuotas, suscripciones y facturas sincronizadas</div></section><button class="route-add-btn" type="button" data-do="debt-new" ${!can?'disabled':''}>${ico('plus','sm')} Nuevo</button></div>`}
 <p class="soft-note">Los pagos recurrentes y facturas creados aquí viajan sincronizados hacia Caja y el libro del CRM.</p>
 <div class="section-head"><h2>Vencidos</h2><small>${overdue.length}</small></div><div class="card">${overdue.map(row).join('')||'<div class="empty">No hay compromisos vencidos activos.</div>'}</div>
 <div class="section-head"><h2>Este mes</h2><small>${current.length}</small></div><div class="card">${current.map(row).join('')||'<div class="empty">No hay compromisos activos para este mes.</div>'}</div>
 <div class="section-head"><h2>Próximos o sin fecha</h2><small>${upcoming.length}</small></div><div class="card">${upcoming.map(row).join('')||'<div class="empty">No hay otros compromisos activos.</div>'}</div>
 ${summary.review.length?`<div class="section-head"><h2>Pagos por verificar</h2><small>${summary.review.length}</small></div><p class="soft-note">Estas obligaciones tienen un pago declarado sin conciliación. No se suman como deuda pagadera ni se consideran saldadas.</p><div class="card">${summary.review.map(row).join('')}</div>`:''}
 <p class="soft-note">Los pagos registrados en Caja y Finanzas están vinculados en el detalle de cada obligación. Si no existe saldo verificado se muestra expresamente.</p></main>`;
}
function renderBudgets(){
 const list=state.data?.budgets||[];
 const items=list.map(b=>{
  const spent=core.summarizeMovements(rows().filter(m=>m.categoria_id===b.categoria_id),`${state.month}-01`,`${state.month}-31`).gastos_centavos;
  const target=Number(b.monto_centavos||0);
  const pct=target?Math.floor(spent*100/target):0;
  const alertPct=Number(b.alerta_porcentaje||85);
  const name=cat(b.categoria_id)?.nombre||'Categoría';
  return {b,spent,target,pct,alertPct,name,diff:target-spent};
 });
 const totalTarget=items.reduce((s,x)=>s+x.target,0),totalSpent=items.reduce((s,x)=>s+x.spent,0),healthy=items.filter(x=>x.pct<x.alertPct).length;
 return `<main class="page" id="main">${routeHead('Presupuestos','Seguimiento mensual por categoría')}
 ${items.length?`<div class="card" style="margin-bottom:14px"><div class="info-line"><span>Presupuestado (${esc(longMonth(state.month))})</span><strong>${moneyText(totalTarget,'DOP')}</strong></div><div class="info-line"><span>Gastado acumulado</span><strong class="${totalSpent>totalTarget?'expense-text':''}">${moneyText(totalSpent,'DOP')}</strong></div><div class="info-line"><span>Salud</span><strong>${healthy} de ${items.length} en orden</strong></div></div>`:''}
 <div class="card">${items.map(x=>{const over=x.pct>=100,warn=!over&&x.pct>=x.alertPct;const statusLabel=over?'Excedido':warn?'Cerca del límite':'En orden';const statusCls=over||warn?'warn':'ok';
  return `<div class="budget-item"><div class="budget-head">${catBadge({id:x.b.categoria_id,nombre:x.name},'gasto')}<div class="budget-head-copy"><b>${esc(x.name)}</b><small>${esc(x.b.periodo==='mensual'?'Mensual':x.b.periodo||'Mensual')} · Alerta al ${x.alertPct}%</small></div><div class="budget-badges"><span class="pill ${statusCls}">${statusLabel}</span></div></div>
  <div class="progress-track"><span class="${over?'over':warn?'warn':''}" style="width:${Math.min(x.pct,100)}%"></span></div>
  <div class="budget-footer"><span>Gastado: ${moneyText(x.spent,'DOP')} (${x.pct}%)</span><span>Objetivo: ${moneyText(x.target,'DOP')}</span></div>
  <div class="budget-actions"><small class="soft-note" style="margin:0">${x.diff>=0?`Disponible: ${moneyText(x.diff,'DOP')}`:`Excedido por: ${moneyText(-x.diff,'DOP')}`}</small><button type="button" class="chip" data-do="budget-search" data-id="${esc(x.b.categoria_id)}">Ver gastos</button></div></div>`}).join('')||'<div class="empty">No hay presupuestos configurados.</div>'}</div><p class="soft-note">Presupuesto y gasto se muestran en la misma moneda, sin convertir divisas.</p></main>`;
}
function renderCards(){
 const list=state.data?.cards||[];
 const cards=list.map(c=>{
  const a=account(c.cuenta_id);
  const debt=Math.abs(Math.min(0,a?accountBalance(a):0));
  const limit=Number(c.limite_credito_centavos||0);
  const avail=Math.max(0,limit-debt);
  const pct=limit>0?Math.min(100,Math.round(debt*100/limit)):0;
  const currency=a?.moneda||'DOP';
  const badgeAcct={...(a||{}),tipo:'tarjeta_credito',nombre:c.nombre||a?.nombre||'Tarjeta',banco:c.banco||a?.banco};
  return {c,a,debt,limit,avail,pct,currency,badgeAcct};
 });
 const dopCards=cards.filter(x=>x.currency==='DOP');
 const totalDebt=dopCards.reduce((s,x)=>s+x.debt,0),totalLimit=dopCards.reduce((s,x)=>s+x.limit,0);
 const can=canWriteBranch();
 return `<main class="page" id="main">${routeHead('Tarjetas','Fechas de corte, límites y pagos')}
 ${dopCards.length?`<div class="card" style="margin-bottom:14px"><div class="info-line"><span>Deuda total en tarjetas (DOP)</span><strong class="${totalDebt>0?'expense-text':''}">${moneyText(totalDebt,'DOP')}</strong></div><div class="info-line"><span>Límite combinado</span><strong>${moneyText(totalLimit,'DOP')}</strong></div></div>`:''}
 <div class="card">${cards.map(x=>`<div class="budget-item"><div class="budget-head">${accountBadge(x.badgeAcct,true)}<div class="budget-head-copy"><b>${esc(x.c.nombre||x.a?.nombre||'Tarjeta')}</b><small>${esc(x.currency)} · ${x.limit>0?`${x.pct}% utilizado`:'Sin límite configurado'}</small></div><span class="pill ${x.pct>=90?'warn':'ok'}">Crédito</span></div>
  <div class="account-large" style="margin-top:14px"><small>Deuda actual</small><strong class="${x.debt>0?'expense-text':''}" style="font-size:1.55rem">${moneyText(x.debt,x.currency)}</strong></div>
  ${x.limit>0?`<div class="progress-track"><span class="${x.pct>=70?'warn':''}" style="width:${x.pct}%"></span></div>`:''}
  <div class="card-meta-pills"><span class="pill">Límite ${moneyText(x.limit,x.currency)}</span>${x.limit>0?`<span class="pill">Disponible ${moneyText(x.avail,x.currency)}</span>`:''}<span class="pill">Corte día ${esc(x.c.dia_corte||'—')}</span><span class="pill">Pago día ${esc(x.c.dia_pago||'—')}</span></div>
  <div class="btn-pair" style="margin-top:12px"><button class="secondary-btn" type="button" data-do="account" data-id="${esc(x.a?.id||'')}" ${x.a?'':'disabled'}>Abrir cuenta</button><button class="primary-btn" type="button" data-do="card-pay" data-id="${esc(x.a?.id||'')}" ${can&&x.a&&(!isLive||x.currency==='DOP')?'':'disabled'}>Pagar tarjeta</button></div></div>`).join('')||'<div class="empty">No hay tarjetas configuradas.</div>'}</div></main>`;
}
// 13/11/2026 (dueño: «un interruptor dentro de el pwa»): libros fiscales 606/607 en el Excel de Drive. El agente de la PC los anota
// una vez al día con el interruptor encendido, o al pulsar «Anotar ahora» (igual que escribir «libros» por WhatsApp). Nunca dos veces.
function renderBooks(){
 const pref=state.data?.preferences||{},cfg=pref.libros_fiscales||{},st=pref.libros_fiscales_estado||{};
 const cuando=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?new Intl.DateTimeFormat('es-DO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Santo_Domingo'}).format(new Date(t)):'Nunca'};
 const pendiente=Date.parse(cfg.solicitud_at||'')>Date.parse(st.ultima_corrida_at||'')||(cfg.solicitud_at&&!st.ultima_corrida_at);
 return `<main class="page" id="main">${routeHead('Libros fiscales','Compras 606 y ventas 607 en tu Google Drive')}
 <div class="card books-card"><div class="books-head">${ico('book','lg')}<div><b>Registro automático</b><small>${cfg.auto?'Encendido: se anota una vez al día':'Apagado: solo cuando lo pidas'}</small></div>
 <button class="switch ${cfg.auto?'on':''}" type="button" role="switch" aria-checked="${cfg.auto?'true':'false'}" aria-label="Registro automático de libros" data-do="books-toggle" ${state.busy||!canWriteBranch()?'disabled':''}><span></span></button></div>
 <button class="primary-btn full" type="button" data-do="books-now" ${state.busy||!canWriteBranch()?'disabled':''}>${ico('refresh','sm')} Anotar ahora</button>
 ${pendiente?'<div class="notice">Pedido enviado. La PC lo anota en los próximos 15 minutos.</div>':''}</div>
 <div class="section-head"><h2>Última corrida</h2></div><div class="card">
 <div class="info-line"><span>Cuándo</span><strong>${esc(cuando(st.ultima_corrida_at))}</strong></div>
 <div class="info-line"><span>Compras anotadas</span><strong>${Number(st.compras||0)}</strong></div>
 <div class="info-line"><span>Ventas anotadas</span><strong>${Number(st.ventas||0)}</strong></div>
 <div class="info-line"><span>Por revisar</span><strong>${Number(st.revisar||0)}</strong></div>
 ${st.ultimo_error_at?`<div class="notice warning">${esc(st.mensaje||'La última pasada no pudo escribir el libro.')}</div>`:st.mensaje?`<p class="soft-note">${esc(st.mensaje)}</p>`:''}</div>
 <p class="soft-note">Compras: las facturas con RNC y NCF que mandas por WhatsApp. Ventas: los XML de e-CF que guardes en la carpeta «e-CF emitidos (XML)» de Drive y, si la dejas abierta en el navegador de Hermes, la lista de comprobantes del Facturador Gratuito. Las que tienen RNC, NCF o fecha ilegible quedan «por revisar» y no entran al libro.</p>
 <p class="soft-note">También por WhatsApp: «libros», «activa libros», «apaga libros».</p><div id="v3526FiscalHost"></div></main>`}
function renderMail(){return `<main class="page" id="main" data-v3526-page="mail">${routeHead('Correos y Códigos Cash','Bancos conectados, transferencias y retiros cash')}<div id="v3526MailHost"></div></main>`}
function renderSettings(){return `<main class="page" id="main" data-v3526-page="settings">${routeHead('Ajustes y Apariencia','Colores glass, alertas y visualización')}<div id="v3526SettingsTopHost"></div><div class="card" style="padding:15px"><div class="info-line" style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)"><span>Sucursal de esta PWA</span><strong>${esc(branchDisplayName())}</strong></div><label class="field-label" for="theme-choice" style="margin-top:0">Apariencia</label><select class="field-select" id="theme-choice" name="theme"><option value="light" ${state.theme==='light'?'selected':''}>Claro</option><option value="dark" ${state.theme==='dark'?'selected':''}>Oscuro</option></select><label class="field-label" for="pref-currency">Moneda de las vistas</label><select class="field-select" id="pref-currency" name="currency">${currencyOption('DOP')}${currencyOption('USD')}</select><div class="notice">Las monedas se muestran por separado; cambiar el selector nunca convierte importes ni modifica el libro.</div></div><div class="section-head"><h2>Estado de conexión</h2></div><div class="card small-card"><h3>${isLive?'Integración bajo validación':'Demostración sin escritura'}</h3><p>La vista solo presenta información disponible. Una lectura fallida bloquea los saldos y ofrece reintentar.</p></div></main>`}
function renderMain(){if(state.loading)return `<main class="page"><div class="card error-screen"><h2>Consultando el libro financiero...</h2><p>No se mostrarán cifras hasta completar la lectura.</p></div></main>`;
 if(state.authRequired){const isPlaza=branchAppKind==='plaza';const branchTitle=isPlaza?'Plaza Artesanal':'Central';return `<main class="page"><section class="login-screen v3526-login-card"><div class="v3526-branch-pill ${isPlaza?'is-plaza':''}">${isPlaza?'🏬':'🏢'} Sucursal ${esc(branchTitle)} · ${isLive?'Firebase CRM':'Vista Previa'}</div><div style="display:flex;align-items:center;gap:12px;margin:10px 0 8px"><img class="brand-logo" src="${isPlaza?'./icons/icon-plaza-192.png':'./icons/dcarela-logo.png'}" width="46" height="46" alt="Logo ${esc(branchTitle)}"><div><div class="eyebrow" style="margin:0">ACCESO EXCLUSIVO</div><h1 class="page-title" style="margin:2px 0 0">D’ Carela · ${esc(branchTitle)}</h1></div></div><p class="subline">${isLive?'Inicia sesión con tu cuenta autorizada del CRM. Los libros de esta sucursal se consultan solo tras validar tu acceso.':'Previsualización de pantalla de acceso independiente para la PWA de '+esc(branchTitle)+'.'}</p><form id="login-form" class="login-form"><label class="field-label" for="finance-email">Correo</label><input class="field-control" id="finance-email" name="login-email" type="email" inputmode="email" autocomplete="username" value="${esc(state.loginEmail)}" placeholder="admin@dcarelacompufoto.com" ${isLive?'required':''}><label class="field-label" for="finance-password">Contraseña</label><input class="field-control" id="finance-password" name="login-password" type="password" autocomplete="current-password" placeholder="••••••••" ${isLive?'required':''}>${state.loginError?`<p class="login-error" role="alert">${esc(state.loginError)}</p>`:''}<button class="primary-btn full" type="submit" ${state.loginBusy?'disabled':''}>${state.loginBusy?'Comprobando acceso…':`Entrar a ${esc(branchTitle)}`}</button></form></section></main>`;}
 if(state.error)return `<main class="page"><div class="card error-screen" role="alert"><div class="error-symbol">${ico('info','lg')}</div><h2>Datos no verificados</h2><p>${esc(state.error)}</p><button class="primary-btn" data-do="retry">${ico('refresh','sm')} Reintentar consulta</button></div></main>`;
 if(state.route==='debts')return renderDebts();if(state.route==='search')return renderSearch(true);if(state.route==='mail')return renderMail();if(state.route==='books')return renderBooks();if(state.route==='budgets')return renderBudgets();if(state.route==='cards')return renderCards();if(state.route==='settings')return renderSettings();
 return state.tab==='finance'?renderFinance():state.tab==='debts'?renderDebts():state.tab==='more'?renderMore():renderHome()}
function modalFrame(title,inner){return `<div class="overlay" data-do="backdrop"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-grab"></div><div class="sheet-header"><h2>${esc(title)}</h2><button class="round-button" data-do="close" aria-label="Cerrar ventana">${ico('x')}</button></div>${inner}</section></div>`}
function accountActivitySeries(a){
 const unique=core.deduplicateMovements(rows()).filter(m=>core.isActiveMovement(m)&&m.fecha);
 const monthRows=unique.filter(m=>matchingMonth(m));
 const pool=monthRows.some(m=>m.cuenta_id===a.id||m.cuenta_destino_id===a.id)?monthRows:unique;
 const byDay=new Map();
 let totalIn=0,totalOut=0;
 const addDay=(day,inAmt,outAmt)=>{const cur=byDay.get(day)||{day,in:0,out:0};cur.in+=inAmt;cur.out+=outAmt;byDay.set(day,cur)};
 for(const m of pool){
  const amt=Math.abs(Number(m.monto_centavos)||0),fee=core.transferCommissionCents(m,unique);
  const src=m.cuenta_origen_id||m.cuentaOrigenId||(['gasto','transferencia','ajuste_negativo'].includes(m.tipo)?m.cuenta_id:null);
  const dst=m.cuenta_destino_id||m.cuentaDestinoId||(['ingreso','ajuste_positivo'].includes(m.tipo)?m.cuenta_id:null);
  let inAmt=0,outAmt=0;
  if(String(dst||'')===String(a.id))inAmt+=amt;
  if(String(src||'')===String(a.id))outAmt+=amt+fee;
  if(!inAmt&&!outAmt)continue;
  totalIn+=inAmt;totalOut+=outAmt;
  addDay(m.fecha,inAmt,outAmt);
 }
 const entries=[...byDay.values()].sort((x,y)=>x.day.localeCompare(y.day)).slice(-14);
 return {entries,totalIn,totalOut,inCurrentMonth:pool===monthRows};
}
function accountMiniChart(a){
 const {entries,totalIn,totalOut,inCurrentMonth}=accountActivitySeries(a);
 const periodLabel=inCurrentMonth?longMonth(state.month):'Historial reciente';
 const max=Math.max(1,...entries.flatMap(e=>[e.in,e.out]));
 const w=360,h=88,padL=2,padR=2,top=8,baseY=68,usableW=w-padL-padR;
 const step=entries.length?usableW/entries.length:usableW;
 const barW=Math.max(3,Math.min(10,step*.32));
 const barH=v=>v>0?Math.max(3,Math.round((v/max)*(baseY-top))):0;
 const marks=[0,Math.floor((entries.length-1)/2),entries.length-1].filter((v,i,arr)=>entries.length&&arr.indexOf(v)===i);
 return `<section class="account-chart-panel" aria-label="Mini gráfica de ${esc(a.nombre)}"><div class="account-chart-head"><h3>Movimiento de la cuenta</h3><small>${esc(periodLabel)} · ${entries.length} día(s)</small></div><div class="account-chart-metrics"><div class="account-chart-stat"><small>Entradas</small><strong class="income-text">+ ${moneyText(totalIn,a.moneda)}</strong></div><div class="account-chart-stat"><small>Salidas</small><strong class="expense-text">− ${moneyText(totalOut,a.moneda)}</strong></div></div>${entries.length>=2?`<svg class="mini-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Entradas y salidas por día"><line class="mini-axis" x1="${padL}" y1="${baseY}" x2="${w-padR}" y2="${baseY}"/>${entries.map((e,i)=>{const cx=padL+i*step+step/2;const hIn=barH(e.in),hOut=barH(e.out);return `${hIn?`<rect class="mini-bar-in" x="${(cx-barW-.5).toFixed(1)}" y="${baseY-hIn}" width="${barW.toFixed(1)}" height="${hIn}" rx="2"/>`:''}${hOut?`<rect class="mini-bar-out" x="${(cx+.5).toFixed(1)}" y="${baseY-hOut}" width="${barW.toFixed(1)}" height="${hOut}" rx="2"/>`:''}`}).join('')}${marks.map(i=>{const cx=padL+i*step+step/2;return `<text x="${cx.toFixed(1)}" y="81" text-anchor="${i===0?'start':i===entries.length-1?'end':'middle'}">${esc(entries[i].day.slice(8))}/${esc(entries[i].day.slice(5,7))}</text>`}).join('')}</svg>`:'<p class="soft-note" style="margin:2px 0 0">Aún no hay suficientes días con actividad para graficar la tendencia.</p>'}</section>`;
}
function modalAccount(){const a=account(state.accountId);if(!a)return modalFrame('Cuenta','<div class="empty">Cuenta no disponible.</div>');const history=activeByAccount(a);
 return modalFrame('Detalle de cuenta',`<div class="account-sheet-head">${accountBadge(a,true)}<div><div class="pill">${a.moneda} · ${a.tipo==='banco'?'Banco':a.tipo==='tarjeta_credito'?'Tarjeta':'Efectivo'}</div><div class="account-large"><small>${esc(a.nombre)} · Saldo actual</small><strong>${moneyText(accountBalance(a),a.moneda)}</strong></div></div></div><div class="btn-pair"><button class="secondary-btn" data-do="reconcile">${ico('check','sm')} Conciliar</button><button class="primary-btn" data-do="account-transfer">${ico('arrows','sm')} Transferir</button></div><button class="secondary-btn full" data-do="account-edit" style="margin-top:10px">${ico('edit','sm')} Editar cuenta</button>${accountMiniChart(a)}<h3>Historial de esta cuenta</h3><div>${movementsUI(history,9)}</div>`)}
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
function terminalReceiptUI(m){
 const historicalCashRepair=/^owner-repair-20261105-cash-(entrada|comida|regalos|desayuno|viajante|intermediarios)$/.test(String(m.id||''));
 if(!isLive||(!historicalCashRepair&&(m.origen!=='panel'||!m.sync_event_id)))return '';
 const receipt=state.receiptMovementId===m.id?state.receiptStatus:null;
 const message=receipt?.status==='applied'
  ?`Caja ${esc(receipt.deviceId)} confirmó ${receipt.historicalRepair?'la reparación histórica':'la recepción'}${receipt.appliedAt?` · ${esc(receipt.appliedAt)}`:''}. Esto no coteja el saldo físico.`
  :receipt?.status==='not_observed'?'Aún no se encontró acuse de Caja. El asiento figura en el CRM.'
  :receipt?.status==='inconclusive'?'La consulta alcanzó su límite; no se puede concluir si Caja lo recibió.'
  :receipt?.status==='unavailable'?'Faltan datos del asiento para consultar el acuse de Caja.'
  :receipt?.status==='error'?`No se pudo verificar Caja: ${esc(receipt.message)}`
  :'Registrado en CRM. Recepción de Caja sin comprobar.';
 return `<div class="notice" role="status">${message}</div><button class="secondary-btn full" data-do="check-terminal-receipt" ${state.receiptBusy?'disabled':''}>${state.receiptBusy?'Consultando Caja…':'Comprobar recepción en Caja'}</button>`;
}
function modalMovement(){const m=rows().find(x=>x.id===state.movementId);if(!m)return modalFrame('Movimiento','<div class="empty">No disponible</div>');return modalFrame('Detalle del movimiento',`<div class="pill">${esc(m.tipo.toUpperCase())} · ${esc(m.estado)}</div><div class="account-large"><small>${esc(movementTitle(m))}</small><strong class="${m.tipo==='gasto'?'expense-text':m.tipo==='ingreso'?'income-text':'warning-text'}">${m.tipo==='gasto'?'−':m.tipo==='ingreso'?'+':''}${moneyText(m.monto_centavos,curr(m))}</strong></div><div class="card"><div class="info-line"><span>Fecha</span><strong>${niceDay(m.fecha)}</strong></div><div class="info-line"><span>Categoría</span><strong>${esc(cat(m.categoria_id)?.nombre||'Sin categoría')}</strong></div><div class="info-line"><span>Cuenta</span><strong>${esc(account(m.cuenta_id)?.nombre||'No verificada')}</strong></div>${m.tipo==='transferencia'?`<div class="info-line"><span>Destino</span><strong>${esc(account(m.cuenta_destino_id)?.nombre||'No verificado')}</strong></div>`:''}<div class="info-line"><span>Estado</span><strong>${esc(m.estado)}</strong></div></div>${terminalReceiptUI(m)}${saleDetailHtml(m)}${['gasto','ingreso'].includes(m.tipo)&&m.estado!=='anulado'&&canWriteBranch()?`<button class="primary-btn full" data-do="movement-repeat" style="margin-top:14px">${ico('repeat','sm')} Repetir este ${m.tipo}</button>`:''}<div class="btn-pair" style="margin-top:14px"><button class="secondary-btn" data-do="movement-edit">${ico('edit','sm')} Editar</button><button class="danger-btn" data-do="void-confirm" ${m.estado==='anulado'?'disabled':''}>Anular</button></div><div class="notice warning">Anular conserva el asiento y su historial; nunca lo elimina.</div>`)}
function modalVoid(){return modalFrame('Confirmar anulación',`<div class="notice warning">Esta acción preservará el movimiento original con estado «anulado». No crea otro gasto ni otra transferencia.</div><label class="field-label" for="void-reason">Motivo de anulación</label><textarea class="field-area" id="void-reason" name="void-reason" placeholder="Motivo obligatorio" rows="3"></textarea><div class="btn-pair" style="margin-top:14px"><button class="secondary-btn" data-do="movement" data-id="${esc(state.movementId)}">Volver</button><button class="danger-btn" data-do="void-save">Confirmar anulación</button></div>`)}
function modalMovementEdit(){const m=rows().find(x=>x.id===state.movementId);if(!m)return modalFrame('Editar','<div class="empty">Sin movimiento.</div>');return modalFrame('Editar movimiento',`<div class="notice warning">El adaptador entregado no incluye una acción «fin.movement.edit». Esta pantalla permite revisar una corrección, pero no la aplica.</div><label class="field-label">Importe original</label><div class="account-large" style="margin:5px 0">${moneyText(m.monto_centavos,curr(m))}</div><label class="field-label" for="edit-desc">Descripción</label><input id="edit-desc" class="field-control" name="edit-desc" value="${esc(m.descripcion)}"><label class="field-label" for="edit-note">Nota de la corrección</label><textarea id="edit-note" class="field-area" name="edit-note" rows="3">${esc(m.nota||'')}</textarea><button data-do="edit-preview" class="secondary-btn full" style="margin-top:15px">Revisar cambios (sin guardar)</button>`)}
function modalAccountEdit(){const a=account(state.accountId);if(!a)return '';
 return modalFrame('Editar cuenta',`<label class="field-label" for="account-name">Nombre</label><input class="field-control" id="account-name" value="${esc(a.nombre)}"><label class="field-label">Moneda</label><input class="field-control" value="${esc(a.moneda)}" disabled><div class="notice">La edición real requiere revisar permisos, uso en POS y regla de integridad. Vista previa únicamente.</div><button class="secondary-btn full" data-do="account-edit-preview">Revisar cambios (sin guardar)</button>`)}
function modalReconcile(){const a=account(state.accountId);if(!a)return '';
 return modalFrame('Conciliar cuenta',`<div class="account-large"><small>${esc(a.nombre)} · Saldo en el libro</small><strong>${moneyText(accountBalance(a),a.moneda)}</strong></div><div class="notice warning">Conciliar solo contra saldo contado o estado bancario comprobado. No sirve para corregir sincronizaciones pendientes.</div><label class="field-label" for="reconcile-amount">Saldo físico / bancario verificado (${a.moneda})</label><input class="field-control" id="reconcile-amount" name="reconcile-amount" placeholder="Ej. 12500.00 o -550.00" inputmode="decimal" autocomplete="off"><label class="field-label" for="reconcile-reason">Evidencia y motivo</label><textarea class="field-area" id="reconcile-reason" name="reconcile-reason" placeholder="Conteo físico / estado bancario y fecha" rows="3"></textarea><button class="primary-btn full" data-do="reconcile-save" style="margin-top:15px">Verificar conciliación</button>`)}
function modalDebt(){
 const {summary,allRows}=debtCatalog();
 const item=[...allRows,...summary.review].find(x=>x.id===state.accountId);
 if(!item)return modalFrame('Compromiso','<div class="empty">Este compromiso ya no está activo en el periodo. Actualiza el libro.</div>');
 const payments=paymentRowsFor(item),raw=item.raw||{};
 const line=(label,value)=>value==null||value===''?'':`<div class="info-line"><span>${label}</span><strong>${esc(value)}</strong></div>`;
 const amount=(label,value)=>value!=null&&value!==''&&Number.isSafeInteger(Number(value))?line(label,moneyText(Number(value),'DOP')):'';
 return modalFrame('Detalle de compromiso',`<div class="account-large"><small>${esc(item.name)}</small><strong>${item.outstanding==null?'Saldo no verificado':moneyText(item.outstanding,'DOP')}</strong></div><div class="card">${line('Origen',item.source==='factura'?'Obligación de Caja':item.source==='planificado'?'Plan recurrente':'Compromiso financiero')}${line('Estado',item.state)}${line('Vencimiento',item.due||'No verificado')}${line('Acreedor',raw.acreedor)}${line('Frecuencia',raw.frecuencia)}${amount('Cuota',item.periodAmount)}${amount('Capital pendiente',item.capital)}${raw.cuotas_totales?line('Cuotas',`${raw.cuotas_pagadas||0} de ${raw.cuotas_totales}`):''}${line('Referencia',raw.referencia||raw.numeroFactura)}${line('Nota',raw.nota)}</div><h3>Pagos vinculados</h3><div class="card">${payments.length?payments.map(p=>`<div class="budget-item"><div class="title-row"><b>${esc(p.fecha||p.pagadoEn||p.created_at||'Fecha no verificada')}</b><strong>${moneyText(Number(p.monto_centavos??p.montoCentavos),'DOP')}</strong></div><div class="soft-note">${esc(p.estado||'Registrado')}${p.referencia?' · '+esc(p.referencia):''}${p.metodoPago||p.metodo_pago?' · '+esc(p.metodoPago||p.metodo_pago):''}</div></div>`).join(''):'<div class="empty">No hay pagos vinculados en el libro.</div>'}</div><p class="soft-note">El saldo pendiente proviene del registro original. El historial no genera un nuevo débito.</p>${canWriteBranch()&&(item.outstanding==null||item.outstanding>0)?`<button class="primary-btn full" type="button" data-do="debt-pay" data-id="${esc(item.id)}" style="margin-top:14px">${ico('card','sm')} Pagar este compromiso</button><p class="soft-note">Abre el gasto con el saldo ya puesto. Al guardarlo, el pago se enlaza a este compromiso y el saldo baja solo.</p>`:''}`);
}
function expenseCategoryOptions(selected){
 const list=cats().filter(c=>c.tipo==='gasto');
 if(!list.length)return '<option value="recon-cat-otros">Costos generales</option>';
 return list.map(c=>`<option value="${esc(c.id)}" ${selected===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('');
}
function modalCommitment(){
 if(isLive&&!canRegister())return modalFrame('Nuevo compromiso',`<div class="notice warning">El registro no está disponible desde este origen. Usa la PWA oficial o el panel central con una cuenta autorizada.</div>`);
 const f=state.commitmentForm,isRec=f.kind==='recurrente',can=canWriteBranch();
 const freqs=[['mensual','Mensual'],['quincenal','Quincenal'],['semanal','Semanal'],['bimestral','Bimestral'],['trimestral','Trimestral'],['semestral','Semestral'],['anual','Anual']];
 const methods=[['transferencia','Transferencia'],['efectivo','Efectivo'],['tarjeta','Tarjeta'],['cheque','Cheque']];
 return modalFrame(isRec?'Nuevo pago recurrente':'Nueva factura o deuda',`
 <div class="sheet-tabs two" role="group" aria-label="Tipo de compromiso">
  <button type="button" class="${isRec?'active':''}" data-do="debt-kind" data-kind="recurrente">Pago recurrente</button>
  <button type="button" class="${!isRec?'active':''}" data-do="debt-kind" data-kind="obligacion">Factura / deuda</button>
 </div>
 <label class="field-label" for="debt-nombre" style="margin-top:0">${isRec?'Nombre del pago fijo':'Concepto o motivo'}</label>
 <input class="field-control" id="debt-nombre" name="debt-nombre" value="${esc(f.nombre)}" placeholder="${isRec?'Ej. Internet Claro, Alquiler...':'Ej. Cuota equipo, Factura proveedor...'}" maxlength="180">
 <div class="filter-grid">
  <div><label class="field-label" for="debt-monto">${isRec?'Monto estimado (RD$)':'Monto (RD$)'}</label><input class="field-control" id="debt-monto" name="debt-monto" value="${esc(f.monto)}" placeholder="0.00" inputmode="decimal" autocomplete="off"></div>
  <div><label class="field-label" for="debt-acreedor">Acreedor / proveedor</label><input class="field-control" id="debt-acreedor" name="debt-acreedor" value="${esc(f.acreedor)}" placeholder="Opcional" maxlength="160"></div>
 </div>
 <div class="filter-grid">
  <div><label class="field-label" for="debt-categoria">Categoría</label><select class="field-select" id="debt-categoria" name="debt-categoria">${expenseCategoryOptions(f.categoriaId)}</select></div>
  <div><label class="field-label" for="debt-proxima">${isRec?'Próximo vencimiento':'Fecha límite de pago'}</label><input class="field-control" id="debt-proxima" type="date" name="debt-proxima" value="${esc(f.proximaFecha)}"></div>
 </div>
 ${isRec?`<div class="filter-grid">
  <div><label class="field-label" for="debt-frecuencia">Frecuencia</label><select class="field-select" id="debt-frecuencia" name="debt-frecuencia">${freqs.map(([v,l])=>`<option value="${v}" ${f.frecuencia===v?'selected':''}>${l}</option>`).join('')}</select></div>
  <div><label class="field-label" for="debt-metodo">Método habitual</label><select class="field-select" id="debt-metodo" name="debt-metodo">${methods.map(([v,l])=>`<option value="${v}" ${f.metodoPago===v?'selected':''}>${l}</option>`).join('')}</select></div>
 </div>
 ${['quincenal','mensual'].includes(f.frecuencia)?`<div class="filter-grid"><div><label class="field-label" for="debt-dia1">Día del mes 1</label><input class="field-control" id="debt-dia1" name="debt-dia1" type="number" min="1" max="31" value="${esc(f.diaMes1)}" placeholder="Ej. 15"></div>${f.frecuencia==='quincenal'?`<div><label class="field-label" for="debt-dia2">Día del mes 2</label><input class="field-control" id="debt-dia2" name="debt-dia2" type="number" min="1" max="31" value="${esc(f.diaMes2)}" placeholder="Ej. 30"></div>`:'<div></div>'}</div>`:''}
 <label class="check-line"><input type="checkbox" name="debt-variable" ${f.montoVariable?'checked':''}><span>El monto puede variar en cada recibo</span></label>`
 :`<div class="filter-grid">
  <div><label class="field-label" for="debt-emitida">Fecha de factura</label><input class="field-control" id="debt-emitida" type="date" name="debt-emitida" value="${esc(f.emitidaEn)}"></div>
  <div><label class="field-label" for="debt-factura">Núm. factura / ref.</label><input class="field-control" id="debt-factura" name="debt-factura" value="${esc(f.numeroFactura)}" placeholder="Opcional" maxlength="100"></div>
 </div>`}
 <label class="field-label" for="debt-nota">Nota</label>
 <textarea class="field-area" id="debt-nota" name="debt-nota" rows="2" maxlength="600" placeholder="Detalle adicional opcional">${esc(f.nota)}</textarea>
 <div class="notice">${!can?'Tu cuenta puede consultar, pero no crear compromisos en esta sucursal.':isLive?'Se guarda en el libro del CRM y se sincroniza con la Caja del estudio.':'Previsualización: el formulario valida el envío sin guardar cambios reales.'}</div>
 <button class="primary-btn full" type="button" data-do="debt-save" style="margin-top:10px" ${state.busy||!can?'disabled':''}>${isLive?'Guardar compromiso':'Revisar simulación'}</button>`);
}
function updateEntryAmountDOM(){
 const el=document.querySelector('.sheet .input-amount');
 if(!el)return false;
 const type=state.entryType,a=account(state.entryAccount),amt=state.entryDigits?Number(state.entryDigits):0,currency=a?.moneda||'DOP';
 el.className=`input-amount ${type==='gasto'?'expense-text':type==='ingreso'?'income-text':'warning-text'}`;
 el.textContent=`${type==='gasto'?'−':type==='ingreso'?'+':''}${moneyText(amt,currency)}`;
 return true;
}
function updateEntryCategoryBadge(){
 const badge=document.getElementById('entry-category-badge');
 if(!badge)return;
 const curCat=cat(state.entryCategory)||cats().find(c=>c.tipo===state.entryType);
 const L=window.DcarelaCategoryLinker;
 if(!curCat||!L?.emojiForCategory||!L?.appleEmojiHtml){badge.innerHTML='';return;}
 badge.innerHTML=L.appleEmojiHtml(L.emojiForCategory(curCat.nombre),14);
}
function modalEntry(){if(isLive&&!canRegister())return modalFrame('Registrar movimiento',`<div class="notice warning">El registro no está disponible desde este origen. Usa la PWA oficial o el panel central con una cuenta autorizada.</div><button class="primary-btn full" type="button" data-do="open-finance-panel" style="margin:16px 0">Abrir Finanzas del panel central</button>`);const type=state.entryType;const isTransfer=type==='transferencia';const a=account(state.entryAccount);const amt=state.entryDigits?Number(state.entryDigits):0;const currency=a?.moneda||'DOP';const backSvg='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M21 5H9l-6 7 6 7h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><path d="m16 9-6 6"/><path d="m10 9 6 6"/></svg>';const selCatObj=cat(state.entryCategory)||cats().find(c=>c.tipo===type);const catBadgeHtml=selCatObj&&window.DcarelaCategoryLinker?.appleEmojiHtml?window.DcarelaCategoryLinker.appleEmojiHtml(window.DcarelaCategoryLinker.emojiForCategory(selCatObj.nombre),14):'';
 return modalFrame(state.entryLink&&type==='gasto'?'Pagar compromiso':'Registrar movimiento',`${state.entryLink&&type==='gasto'?`<div class="notice">Pago vinculado a <b>${esc(state.entryLink.name)}</b>. Revisa el monto y la cuenta antes de guardar.</div>`:''}<div class="sheet-tabs" role="group" aria-label="Tipo de movimiento"><button class="${type==='gasto'?'active':''}" data-do="entry-type" data-type="gasto">Gasto</button><button class="${type==='ingreso'?'active':''}" data-do="entry-type" data-type="ingreso">Ingreso</button><button class="${isTransfer?'active':''}" data-do="entry-type" data-type="transferencia">Transferencia</button></div><div class="input-amount ${type==='gasto'?'expense-text':type==='ingreso'?'income-text':'warning-text'}" aria-label="Importe actual" role="status">${type==='gasto'?'−':type==='ingreso'?'+':''}${moneyText(amt,currency)}</div><div class="keypad" role="group" aria-label="Teclado para introducir el importe">${['1','2','3','4','5','6','7','8','9','00','0','⌫'].map(v=>`<button data-do="digit" data-digit="${v}" aria-label="${v==='⌫'?'Borrar último dígito':`Agregar ${v}`}">${v==='⌫'?backSvg:v}</button>`).join('')}</div><label class="field-label" for="entry-account">${isTransfer?'Cuenta de origen':'Cuenta'}</label><select class="field-select" id="entry-account" name="entry-account">${cashAccountOptions(state.entryAccount,'',type==='gasto')}</select>${isTransfer?`<label class="field-label" for="entry-dest">Cuenta de destino</label><select class="field-select" id="entry-dest" name="entry-dest">${cashAccountOptions(state.entryDest,state.entryAccount,true)}</select>`:`<label class="field-label" for="entry-category" style="display:flex;align-items:center;gap:6px"><span>Categoría</span><span id="entry-category-badge">${catBadgeHtml}</span></label><select class="field-select" id="entry-category" name="entry-category">${cats().filter(c=>c.tipo===type).map(c=>`<option value="${esc(c.id)}" ${state.entryCategory===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}</select>`}<div class="filter-grid"><div><label class="field-label" for="entry-date">Fecha</label><input class="field-control" id="entry-date" type="date" name="entry-date" value="${esc(state.entryDate)}"></div><div><label class="field-label" for="entry-note">Concepto</label><input class="field-control" id="entry-note" name="entry-note" value="${esc(state.entryNote)}" placeholder="Descripción" maxlength="180"></div></div><div class="notice">${!canWriteBranch()?'Tu cuenta puede consultar, pero no registrar movimientos en esta sucursal.':isLive?'Se registra en el libro del CRM con tu permiso de sucursal. La Caja física aún no ha confirmado esta integración.':'Previsualización: el registro no alterará saldos, historial ni Firebase.'}</div><button class="primary-btn full" data-do="entry-save" ${state.busy||!canWriteBranch()?'disabled':''}>${isLive?'Guardar movimiento':'Revisar simulación'}</button>`)}
function renderModal(){if(!state.modal)return '';switch(state.modal){case 'account':return modalAccount();case 'accounts-filter':return modalAccountsFilter();case 'movement':return modalMovement();case 'void':return modalVoid();case 'movement-edit':return modalMovementEdit();case 'account-edit':return modalAccountEdit();case 'reconcile':return modalReconcile();case 'debt':return modalDebt();case 'commitment':return modalCommitment();case 'entry':return modalEntry();default:return ''}}
let previousModal=null, previousViewKey='', popupSerial=0, navigationDirection=0;
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function stagePageExit(direction){
 document.querySelector('.page-exit')?.remove();
 if(!direction||reducedMotion())return null;
 const page=document.querySelector('#app .shell>.page');
 if(!page)return null;
 const box=page.getBoundingClientRect(),appBox=$('app').getBoundingClientRect();
 if(box.bottom<=0||box.top>=innerHeight)return null;
 const drag=Number(page.style.transform.match(/translate3d\((-?[\d.]+)px/)?.[1]||0);
 page.remove();
 page.classList.add('page-exit',direction>0?'page-exit-forward':'page-exit-back');
 page.setAttribute('aria-hidden','true');page.inert=true;
 page.style.cssText=`position:absolute;left:${box.left-appBox.left}px;top:${box.top-appBox.top}px;width:${box.width}px;height:${box.height}px;margin:0;pointer-events:none;z-index:2;overflow:hidden;--nav-drag:${drag}px;`;
 page.addEventListener('animationend',()=>page.remove(),{once:true});
 setTimeout(()=>page.remove(),650);
 return {page,drag};
}
function applyLiveWriteGuards(scope=document){if(!isLive||emulatorWritesAllowed())return;for(const button of scope.querySelectorAll('[data-do="account-transfer"],[data-do="reconcile"],[data-do="void-confirm"],[data-do="entry-save"],[data-do="reconcile-save"],[data-do="void-save"],[data-do="account-edit"],[data-do="movement-edit"]')){if(canWriteBranch()&&['account-transfer','entry-save'].includes(button.dataset.do))continue;button.disabled=true;button.title='Acción bloqueada hasta comprobar Caja y permisos';}}
function render(opts={}){const modalIsNew=!!state.modal&&state.modal!==previousModal;const subKey=state.financeView==='diario'?state.day:state.financeView==='ano'?state.year:state.financeView==='personalizado'?`${state.customFrom}:${state.customTo}`:'';const viewKey=`${state.tab}/${state.route}/${state.financeView}/${state.month}/${subKey}`;const viewIsNew=viewKey!==previousViewKey;const shellEl=$('app')?.querySelector('.shell');if(opts?.modalOnly&&shellEl&&!viewIsNew){previousModal=state.modal;document.body.classList.toggle('modal-open',Boolean(state.modal));const existingOverlay=$('app').querySelector('.overlay');if(!state.modal){existingOverlay?.remove();return;}const modalHtml=renderModal();if(existingOverlay){existingOverlay.outerHTML=modalHtml;}else if(modalHtml){$('app').insertAdjacentHTML('beforeend',modalHtml);}const newOverlay=$('app').querySelector('.overlay');if(newOverlay){if(!modalIsNew)newOverlay.classList.add('no-enter');applyLiveWriteGuards(newOverlay);}return;}const direction=viewIsNew?navigationDirection:0;const motion=direction?`slide-${direction>0?'forward':'back'}`:'';const exit=viewIsNew&&previousViewKey?stagePageExit(direction):null;navigationDirection=0;previousModal=state.modal;previousViewKey=viewKey;document.documentElement.dataset.theme=state.theme;document.documentElement.dataset.activeView=state.route?`route:${state.route}`:state.tab;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.theme==='dark'?'#050607':'#e8e9eb');document.body.classList.toggle('modal-open',Boolean(state.modal));$('app').innerHTML=`<div class="shell ${viewIsNew?'view-enter':''} ${motion}" style="--nav-drag:${exit?.drag||0}px">${renderHeader()}${renderMain()}${renderBottom()}</div>${renderModal()}`;if(exit)$('app').append(exit.page);applyLiveWriteGuards(document);if(state.modal&&!modalIsNew)document.querySelector('.overlay')?.classList.add('no-enter');requestAnimationFrame(()=>{const scroller=document.querySelector('.segment-wrap');const active=scroller?.querySelector('.segment.active');if(scroller&&active)scroller.scrollTo({left:Math.max(0,active.offsetLeft-(scroller.clientWidth-active.clientWidth)/2),behavior:reducedMotion()?'instant':'smooth'})});window.dispatchEvent(new CustomEvent('dcarela:finanzas-rendered',{detail:{tab:state.tab,route:state.route,theme:state.theme,modal:state.modal,business:state.business,financeView:state.financeView}}))}
function openModal(type){popupSerial++;state.modal=type;render({modalOnly:true});requestAnimationFrame(()=>document.querySelector('.sheet [data-do="close"]')?.focus({preventScroll:true}))}
function closeModal(){
 const which=state.modal,serial=popupSerial,sheet=document.querySelector('.sheet');
 if(sheet && !sheet.dataset.closing && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof sheet.animate==='function'){
  sheet.dataset.closing='1';document.querySelector('.overlay')?.classList.add('closing');
  const animation=sheet.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(32px)'}],{duration:180,easing:'cubic-bezier(.4,0,.9,.55)',fill:'forwards'});
  const finish=()=>{if(state.modal===which && popupSerial===serial){state.modal=null;state.busy=false;render({modalOnly:true})}};
  animation.finished.then(finish).catch(finish);return;
 }
 if(sheet?.dataset.closing)return;
 state.modal=null;state.busy=false;render({modalOnly:true});
}
function openTab(t){const tabs=['home','finance','debts','more'];navigationDirection=Math.sign(tabs.indexOf(t)-tabs.indexOf(state.tab));state.tab=t;state.route='';state.modal=null;render();window.scrollTo({top:0,behavior:'instant'})}
const numericCents=v=>{const t=String(v??'').trim().replace(/,/g,'');if(!/^-?\d+(?:\.\d{1,2})?$/.test(t))throw new Error('Introduce un importe válido con hasta dos decimales.');const neg=t[0]==='-';const [a,b='']=t.replace(/^-/, '').split('.');const parsed=Number(a)*100+Number((b+'00').slice(0,2));if(!Number.isSafeInteger(parsed))throw new Error('Importe fuera de rango.');return neg?-parsed:parsed};
function requestId(){return globalThis.crypto?.randomUUID?.()||`ui-${Date.now()}-${Math.random().toString(16).slice(2)}`}
async function commit(action,entity,payload){if(state.busy)return;state.busy=true;try{const res=await commitAction(action,state.business,entity,payload);if(res.preview){note('Vista previa: ningún dato fue guardado.');closeModal()}else{note(isLive&&!emulatorWritesAllowed()?'Guardado en CRM. Confirmación de Caja pendiente.':res.message||'Operación confirmada.');state.pendingRequestId=null;closeModal();await load()}}catch(e){note(e?.message||'No se pudo completar la operación.');}finally{state.busy=false}}
async function handleClick(e){if(Date.now()<swipeSuppressClickUntil)return;const btn=e.target.closest('[data-do]');if(!btn)return;const action=btn.dataset.do;
 if(action==='backdrop'){if(e.target===btn)closeModal();return}
 if(action==='close'){closeModal();return}
 if(action==='retry'){params.delete('fail');history.replaceState(null,'',`${location.pathname}?${params.toString()}`);await load();return}
 if(action==='refresh'){if(!state.loading)await load();return}
 if(action==='sign-out'){
  if(!isLive)return;
  const previousUid=seenAuthUid;seenAuthUid=null;
  try{await window.DcarelaFirebase.signOut();state.loginEmail='';state.loginError='';state.business=defaultBranchId;state.tab='home';state.route='';state.modal=null;params.delete('b');history.replaceState(null,'',`${location.pathname}?${params.toString()}`);await load();}
  catch{seenAuthUid=previousUid;note('No se pudo cerrar la sesión. Inténtalo de nuevo.');}
  return;
 }
 if(action==='theme'){setTheme(state.theme==='light'?'dark':'light');return}
 if(action==='open-settings'){state.route='settings';state.tab='more';render();return}
 if(action==='tab'){openTab(btn.dataset.tab);return}
 if(action==='route'){state.route=btn.dataset.route;state.tab='more';if(state.route==='search')ensureFullHistory();render();window.scrollTo(0,0);return}
 if(action==='back-more'){state.route='';state.tab='more';render();return}
 if(action==='filter-toggle'){state.financeFilterOpen=!state.financeFilterOpen;render();return}
 if(action==='view-step'){const index=FINANCE_VIEWS.findIndex(([id])=>id===state.financeView);navigationDirection=Number(btn.dataset.step);state.financeView=FINANCE_VIEWS[(index+navigationDirection+FINANCE_VIEWS.length)%FINANCE_VIEWS.length][0];state.financeFilterOpen=false;if(['ano','personalizado'].includes(state.financeView))ensureFullHistory();render();return}
 if(action==='view'){navigationDirection=Math.sign(FINANCE_VIEWS.findIndex(([id])=>id===btn.dataset.view)-FINANCE_VIEWS.findIndex(([id])=>id===state.financeView));state.financeView=btn.dataset.view;state.financeFilterOpen=false;if(['ano','personalizado'].includes(state.financeView))ensureFullHistory();render();return}
 if(action==='select-day'){navigationDirection=Math.sign(btn.dataset.day.localeCompare(state.day));state.day=btn.dataset.day;state.month=state.day.slice(0,7);if(state.month<initialMonth)ensureFullHistory();render();return}
 if(action==='prev-month'||action==='next-month'){navigationDirection=action==='prev-month'?-1:1;state.month=nMonth(state.month,navigationDirection);state.day=state.month+'-01';if(state.month<initialMonth)ensureFullHistory();render();return}
 if(action==='prev-year'||action==='next-year'){navigationDirection=action==='prev-year'?-1:1;state.year=String(Math.max(2015,Math.min(Number(today.slice(0,4))+1,Number(state.year)+navigationDirection)));ensureFullHistory();render();return}
 if(action==='select-year'){state.year=String(btn.dataset.year||today.slice(0,4));ensureFullHistory();render();return}
 if(action==='jump-month'){state.month=String(btn.dataset.month||state.month);state.day=`${state.month}-01`;state.financeView='mes';if(state.month<initialMonth)ensureFullHistory();render();return}
 if(action==='load-full-history'){await ensureFullHistory();return}
 if(action==='custom-preset'){
  const p=btn.dataset.preset;
  if(p==='7d'){state.customFrom=nDay(today,-6);state.customTo=today;}
  else if(p==='month'){state.customFrom=`${initialMonth}-01`;state.customTo=initialMonthEnd;}
  else if(p==='90d'){state.customFrom=nDay(today,-89);state.customTo=today;}
  else if(p==='prev-year'){const py=String(Number(today.slice(0,4))-1);state.customFrom=`${py}-01-01`;state.customTo=`${py}-12-31`;}
  else if(p==='all'){const earliest=rows().map(r=>String(r.fecha||'')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0]||`${Number(today.slice(0,4))-2}-01-01`;state.customFrom=earliest;state.customTo=today;}
  ensureFullHistory();render();return;
 }
 if(action==='day'){state.day=btn.dataset.day;state.financeView='calendario';state.tab='finance';render();return}
 if(action==='stats-type'){state.statsType=btn.dataset.type;render();return}
 if(action==='account'){state.accountId=btn.dataset.id;openModal('account');return}
 if(action==='movement'){state.movementId=btn.dataset.id;state.receiptMovementId=null;state.receiptStatus=null;openModal('movement');return}
 if(action==='check-terminal-receipt'){
  const movement=rows().find(row=>row.id===state.movementId);
  if(!movement||state.receiptBusy)return;
  state.receiptBusy=true;render();
  try{const receipt=await getTerminalReceipt(state.business,movement);
    if(state.movementId===movement.id){state.receiptMovementId=movement.id;state.receiptStatus=receipt;}}
  catch(error){if(state.movementId===movement.id){state.receiptMovementId=movement.id;
    state.receiptStatus={status:'error',message:error?.message||'Lectura no disponible.'};}}
  finally{state.receiptBusy=false;render()}
  return;
 }
 if(action==='accounts-filter'){openModal('accounts-filter');return}
 if(action==='search-chip'){
  const chip=btn.dataset.chip;
  if(chip==='reset'){state.search={query:'',type:'',category:'',from:`${initialMonth}-01`,to:initialMonthEnd,accountIds:accounts().map(a=>a.id)};state.searched=false;render();return}
  if(chip==='this-month'){state.search.from=`${initialMonth}-01`;state.search.to=initialMonthEnd;}
  else if(chip==='last-month'){const pm=nMonth(initialMonth,-1);state.search.from=`${pm}-01`;state.search.to=monthEndOf(pm);}
  else if(chip==='30d'){state.search.from=nDay(today,-29);state.search.to=today;}
  else if(chip==='all-time'){const earliest=rows().map(r=>String(r.fecha||'')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0]||'2018-01-01';state.search.from=earliest<'2018-01-01'?earliest:'2018-01-01';state.search.to=today;await ensureFullHistory();}
  else if(['gasto','ingreso','transferencia'].includes(chip)){state.search.type=state.search.type===chip?'':chip;}
  if(state.search.from<`${initialMonth}-01`)ensureFullHistory();
  if(!state.search.accountIds.length)state.search.accountIds=accounts().map(a=>a.id);
  state.searched=true;render();return;
 }
 if(action==='budget-search'){
  state.tab='more';state.route='search';state.modal=null;
  state.search={query:'',type:'gasto',category:btn.dataset.id||'',from:`${state.month}-01`,to:monthEndOf(state.month),accountIds:accounts().map(a=>a.id)};
  state.searched=true;render();window.scrollTo({top:0,behavior:'instant'});return;
 }
 if(action==='card-pay'){
  const target=account(btn.dataset.id);if(!target)return;
  const debt=Math.abs(Math.min(0,accountBalance(target)));
  const origin=accounts().find(a=>a.id!==target.id&&a.tipo!=='tarjeta_credito'&&a.moneda===target.moneda&&a.estado!=='eliminada');
  if(!origin){note('No hay otra cuenta en la misma moneda para pagar esta tarjeta.');return}
  state.entryType='transferencia';state.entryDigits=debt>0?String(debt):'';state.entryAccount=lastAccount('transferencia')||origin.id;
  if(state.entryAccount===target.id)state.entryAccount=origin.id;
  state.entryDest=target.id;state.entryNote=`Pago ${target.nombre}`.slice(0,180);state.entryDate=core.businessDay(new Date());state.entryLink=null;state.pendingRequestId=null;
  openModal('entry');return;
 }
 if(action==='entry'||action==='quick'){const type=action==='quick'?btn.dataset.type:'gasto';state.entryType=type;state.entryDigits='';state.entryNote='';state.entryLink=null;state.entryDate=core.businessDay(new Date());state.pendingRequestId=null;
  state.entryAccount=lastAccount(type)||state.entryAccount;state.entryCategory=cats().find(c=>c.tipo===type)?.id||'';
  if(type==='transferencia'){const a=account(state.entryAccount);state.entryDest=accounts().find(x=>x.id!==a?.id&&x.moneda===a?.moneda)?.id||''}openModal('entry');return}
 // 35.23 · «Repetir»: el mismo gasto o ingreso de siempre, con fecha de hoy y un monto que se puede cambiar antes de guardar.
 if(action==='movement-repeat'){const m=rows().find(x=>x.id===state.movementId);if(!m||!['gasto','ingreso'].includes(m.tipo)){note('Solo se repiten gastos e ingresos.');return}
  state.entryType=m.tipo;state.entryDigits=String(m.monto_centavos||'');state.entryNote=String(m.descripcion||'').slice(0,180);state.entryLink=null;state.entryAccount=m.cuenta_id;
  state.entryCategory=m.categoria_id||cats().find(c=>c.tipo===m.tipo)?.id||'';state.entryDate=core.businessDay(new Date());state.pendingRequestId=null;openModal('entry');return}
 // 13/11/2026 (dueño: «arreglar los compromisos y pagos recurrentes para usar más seguido en la PWA»): pagar desde la ficha.
 // Abre el gasto con el saldo y el concepto; el pago viaja con el id del compromiso y el servidor (posObligaciones →
 // finance-payment-projection) lo enlaza y baja el saldo. Aquí no se descuenta nada a mano.
 if(action==='debt-pay'){const {summary,allRows}=debtCatalog();const item=[...allRows,...summary.review].find(x=>x.id===btn.dataset.id);if(!item){note('Ese compromiso ya no está activo. Actualiza el libro.');return}const raw=item.raw||{};const cents=Number.isSafeInteger(item.outstanding)&&item.outstanding>0?item.outstanding:Number.isSafeInteger(Number(item.periodAmount))?Number(item.periodAmount):0;
 state.entryType='gasto';state.entryDigits=cents>0?String(cents):'';state.entryNote=`Pago ${item.name}`.slice(0,180);state.entryDate=core.businessDay(new Date());state.pendingRequestId=null;
 state.entryLink={name:item.name,source:item.source,obligacionId:item.source==='factura'?String(raw.id||raw.obligacionId||''):'',compromisoId:item.source!=='factura'&&item.source!=='planificado'?String(raw.id||''):'',recurrenteId:String(raw.recurrente_id||raw.recurrenteId||(item.source==='planificado'?raw.id||'':''))};
 state.entryCategory=cats().find(c=>c.tipo==='gasto'&&/pago|servicio|compromis|gasto fijo|fijo/i.test(c.nombre||''))?.id||cats().find(c=>c.tipo==='gasto')?.id||'';openModal('entry');return}
 if(action==='debt-new'){const firstCat=cats().find(c=>c.tipo==='gasto')?.id||'recon-cat-otros';state.commitmentForm=defaultCommitmentForm(firstCat);state.pendingRequestId=null;openModal('commitment');return}
 if(action==='debt-kind'){state.commitmentForm.kind=btn.dataset.kind==='obligacion'?'obligacion':'recurrente';state.pendingRequestId=null;render({modalOnly:true});return}
 if(action==='debt-save'){
  const f=state.commitmentForm;
  const val=n=>document.querySelector(`[name="${n}"]`)?.value;
  const nombre=String(val('debt-nombre')??f.nombre??'').trim();
  const acreedor=String(val('debt-acreedor')??f.acreedor??'').trim();
  const categoriaId=String(val('debt-categoria')??f.categoriaId??'recon-cat-otros').trim()||'recon-cat-otros';
  const categoriaNombre=cat(categoriaId)?.nombre||'Costos';
  const proximaFecha=String(val('debt-proxima')??f.proximaFecha??today).trim();
  const nota=String(val('debt-nota')??f.nota??'').trim();
  if(!nombre){note('Escribe el nombre del pago o compromiso.');return}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(proximaFecha)){note('Elige una fecha válida.');return}
  let cents=0;
  const rawMonto=String(val('debt-monto')??f.monto??'').trim();
  const isVariable=Boolean(document.querySelector('[name="debt-variable"]')?.checked ?? f.montoVariable);
  if(rawMonto||f.kind==='obligacion'||!isVariable){
   try{cents=numericCents(rawMonto)}catch(err){note(err.message);return}
   if(cents<=0&&(!isVariable||f.kind==='obligacion')){note('Introduce un monto mayor que cero.');return}
  }
  state.pendingRequestId ||= requestId();
  const id=state.pendingRequestId;
  if(f.kind==='recurrente'){
   const frecuencia=String(val('debt-frecuencia')??f.frecuencia??'mensual');
   const metodoPago=String(val('debt-metodo')??f.metodoPago??'transferencia');
   const d1=Number(val('debt-dia1')??f.diaMes1),d2=Number(val('debt-dia2')??f.diaMes2);
   await commit('cost.recurring.upsert',id,{
    requestId:id,recurrenteId:id,categoriaId,categoria:categoriaNombre,nombre,descripcion:nombre,
    acreedor:acreedor||null,montoEstimadoCentavos:cents,montoVariable:isVariable,
    frecuencia,intervaloDias:null,diaMes1:Number.isInteger(d1)&&d1>=1&&d1<=31?d1:null,
    diaMes2:Number.isInteger(d2)&&d2>=1&&d2<=31?d2:null,proximaFecha,metodoPago,activo:true,nota:nota||null
   });
  }else{
   const emitidaEn=String(val('debt-emitida')??f.emitidaEn??today).trim()||today;
   const numeroFactura=String(val('debt-factura')??f.numeroFactura??'').trim();
   if(!/^\d{4}-\d{2}-\d{2}$/.test(emitidaEn)){note('Elige una fecha de factura válida.');return}
   await commit('cost.obligation.upsert',id,{
    requestId:id,obligacionId:id,recurrenteId:null,categoriaId,categoria:categoriaNombre,
    acreedor:acreedor||null,concepto:nombre,numeroFactura:numeroFactura||null,
    montoCentavos:cents,saldoCentavos:cents,emitidaEn,venceEn:proximaFecha,estado:'pendiente',
    nota:nota||null,periodoClave:null
   });
  }
  return;
 }
 if(action==='demo-login'){if(isLive)return;state.authRequired=true;state.loginError='';state.modal=null;render();return}
 if(action==='open-finance-panel'){location.assign(new URL('../panel.html#finanzas',location.href).href);return}
 if(action==='entry-type'){state.entryType=btn.dataset.type;state.entryCategory=cats().find(c=>c.tipo===state.entryType)?.id||'';state.pendingRequestId=null;render({modalOnly:true});return}
 if(action==='digit'){let d=btn.dataset.digit;if(d==='⌫')state.entryDigits=state.entryDigits.slice(0,-1);else if(state.entryDigits.length+d.length<=12)state.entryDigits=(state.entryDigits+d).replace(/^0+(?=\d)/,'');state.pendingRequestId=null;if(!updateEntryAmountDOM())render({modalOnly:true});return}
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
 if(action==='books-toggle'||action==='books-now'){const cfg=state.data?.preferences?.libros_fiscales||{};state.pendingRequestId=requestId();
  await commit('fin.books.request',state.business,{requestId:state.pendingRequestId,...(action==='books-toggle'?{auto:!cfg.auto}:{})});return}
 if(action==='entry-save'){const cents=Number(state.entryDigits||0),a=account(state.entryAccount);if(!Number.isSafeInteger(cents)||cents<=0){note('Introduce un monto mayor que cero.');return}if(!a){note('Selecciona una cuenta válida.');return}
 const dest=account(state.entryDest);if(state.entryType==='transferencia'&&(!dest||dest.id===a.id||dest.moneda!==a.moneda)){note('Elige cuentas diferentes y de la misma moneda.');return}
 if(isLive&&a.moneda!=='DOP'){note('La escritura manual del adaptador original solo admite cuentas DOP.');return}
 rememberAccount(state.entryType,a.id);
 let chosenCatId=state.entryCategory;
 if(state.entryType==='gasto'&&window.DcarelaCategoryLinker?.resolveClientExpenseCategory){
  const curCat=cat(chosenCatId);
  const curName=String(curCat?.nombre||'').toLowerCase();
  if(!chosenCatId||/otros/.test(curName)){
   const auto=window.DcarelaCategoryLinker.resolveClientExpenseCategory({categoria_id:'',descripcion:state.entryNote||''},cats().filter(c=>c.tipo==='gasto'));
   if(auto?.categoria_id)chosenCatId=auto.categoria_id;
  }
 }
 state.pendingRequestId ||= requestId();const data=state.entryType==='transferencia'?{
 cuentaOrigenId:a.id,cuentaDestinoId:dest.id,montoCentavos:cents,comisionCentavos:0,descripcion:state.entryNote||'Transferencia interna',fecha:state.entryDate,requestId:state.pendingRequestId
 }:{cuentaId:a.id,tipo:state.entryType,montoCentavos:cents,categoriaId:chosenCatId,descripcion:state.entryNote||state.entryType,fecha:state.entryDate,requestId:state.pendingRequestId,
 ...(state.entryType==='gasto'&&state.entryLink?{obligacionId:state.entryLink.obligacionId||null,compromisoId:state.entryLink.compromisoId||null,recurrenteId:state.entryLink.recurrenteId||null}:{})};
 await commit(state.entryType==='transferencia'?'fin.transfer.create':'fin.movement.create',state.pendingRequestId,data);return}
}
function handleChange(e){const target=e.target,name=target.name;switch(name){
 case 'currency':state.currency=target.value;render();break;
 case 'finance-day':if(/^\d{4}-\d{2}-\d{2}$/.test(target.value)){state.day=target.value;state.month=target.value.slice(0,7);if(state.month<initialMonth)ensureFullHistory();render()}break;
 case 'finance-custom-from':if(/^\d{4}-\d{2}-\d{2}$/.test(target.value)){state.customFrom=target.value;if(state.customFrom<`${initialMonth}-01`)ensureFullHistory();render()}break;
 case 'finance-custom-to':if(/^\d{4}-\d{2}-\d{2}$/.test(target.value)){state.customTo=target.value;render()}break;
 case 'theme':setTheme(target.value);break;
 case 'search-type':state.search.type=target.value;break;
 case 'search-category':state.search.category=target.value;break;
 case 'from':state.search.from=target.value;break;case 'to':state.search.to=target.value;break;
 case 'account-toggle':state.search.accountIds=target.checked?[...new Set([...state.search.accountIds,target.value])]:state.search.accountIds.filter(x=>x!==target.value);break;
 case 'entry-account':state.entryAccount=target.value;if(state.entryDest===target.value)state.entryDest=accounts().find(x=>x.id!==target.value&&x.moneda===account(target.value)?.moneda)?.id||'';state.pendingRequestId=null;render({modalOnly:true});break;
 case 'entry-dest':state.entryDest=target.value;state.pendingRequestId=null;break;
 case 'entry-category':state.entryCategory=target.value;state.pendingRequestId=null;updateEntryCategoryBadge();break;
 case 'entry-note':state.entryNote=target.value;state.pendingRequestId=null;break;
 case 'entry-date':state.entryDate=target.value;state.pendingRequestId=null;break;
 case 'debt-nombre':state.commitmentForm.nombre=target.value;state.pendingRequestId=null;break;
 case 'debt-acreedor':state.commitmentForm.acreedor=target.value;state.pendingRequestId=null;break;
 case 'debt-monto':state.commitmentForm.monto=target.value;state.pendingRequestId=null;break;
 case 'debt-categoria':state.commitmentForm.categoriaId=target.value;state.pendingRequestId=null;break;
 case 'debt-proxima':state.commitmentForm.proximaFecha=target.value;state.pendingRequestId=null;break;
 case 'debt-frecuencia':state.commitmentForm.frecuencia=target.value;state.pendingRequestId=null;render({modalOnly:true});break;
 case 'debt-metodo':state.commitmentForm.metodoPago=target.value;state.pendingRequestId=null;break;
 case 'debt-dia1':state.commitmentForm.diaMes1=target.value;state.pendingRequestId=null;break;
 case 'debt-dia2':state.commitmentForm.diaMes2=target.value;state.pendingRequestId=null;break;
 case 'debt-variable':state.commitmentForm.montoVariable=target.checked;state.pendingRequestId=null;break;
 case 'debt-emitida':state.commitmentForm.emitidaEn=target.value;state.pendingRequestId=null;break;
 case 'debt-factura':state.commitmentForm.numeroFactura=target.value;state.pendingRequestId=null;break;
 case 'debt-nota':state.commitmentForm.nota=target.value;state.pendingRequestId=null;break;
}}
function handleInput(e){const n=e.target.name;if(n==='search-query')state.search.query=e.target.value;if(n==='entry-note'){state.entryNote=e.target.value;state.pendingRequestId=null;if(state.entryType==='gasto'&&window.DcarelaCategoryLinker?.resolveClientExpenseCategory){const sel=document.getElementById('entry-category');const auto=window.DcarelaCategoryLinker.resolveClientExpenseCategory({categoria_id:'',descripcion:e.target.value},cats().filter(c=>c.tipo==='gasto'));if(auto?.matchedBy==='keyword'&&auto.categoria_id&&sel&&sel.value!==auto.categoria_id){state.entryCategory=auto.categoria_id;sel.value=auto.categoria_id;updateEntryCategoryBadge();}}}const debtMap={'debt-nombre':'nombre','debt-acreedor':'acreedor','debt-monto':'monto','debt-factura':'numeroFactura','debt-nota':'nota','debt-dia1':'diaMes1','debt-dia2':'diaMes2'};if(Object.hasOwn(debtMap,n)){state.commitmentForm[debtMap[n]]=e.target.value;state.pendingRequestId=null;}}
let signingIn=false,seenAuthUid;
async function handleSubmit(e){if(e.target.id==='login-form'){
 e.preventDefault();if(state.loginBusy)return;
 const email=e.target.querySelector('[name="login-email"]').value.trim();
 const password=e.target.querySelector('[name="login-password"]').value;
 if(!isLive){
  state.loginEmail=email;state.loginError='';state.loginBusy=false;state.authRequired=false;
  params.delete('login');history.replaceState(null,'',`${location.pathname}?${params.toString()}`);
  render();note(`Acceso a ${branchDisplayName()} (Vista previa)`);return;
 }
 state.loginEmail=email;state.loginError='';state.loginBusy=true;signingIn=true;render();
 try{const api=window.DcarelaFirebase;if(!api?.signIn)throw new Error('auth/unavailable');await api.signIn(email,password);seenAuthUid=api.getCurrentUser()?.uid;signingIn=false;state.loginBusy=false;await load();}
 catch(error){signingIn=false;state.loginBusy=false;state.loginError=String(error?.code||'').startsWith('auth/')?'No se pudo iniciar sesión. Comprueba el correo y la contraseña.':'No se pudo iniciar sesión. Comprueba la conexión e inténtalo de nuevo.';render();}
 return;
 }if(e.target.id!=='search-form')return;e.preventDefault();state.search.query=e.target.querySelector('[name="search-query"]').value;
 if(state.search.from>state.search.to){note('El inicio no puede ser posterior al fin.');return}if(state.search.accountIds.length===0){note('Selecciona al menos una cuenta.');return}if(state.search.from<`${initialMonth}-01`)await ensureFullHistory();state.searched=true;render()}
function stepSwipe(kind,step){navigationDirection=step;if(kind==='month'){state.month=nMonth(state.month,step);state.day=`${state.month}-01`;}else if(kind==='view'){const index=Math.max(0,FINANCE_VIEWS.findIndex(([id])=>id===state.financeView));state.financeView=FINANCE_VIEWS[(index+step+FINANCE_VIEWS.length)%FINANCE_VIEWS.length][0];state.financeFilterOpen=false;}else if(kind==='day'){state.day=nDay(state.day,step);state.month=state.day.slice(0,7);}else if(kind==='tab'){const tabs=['home','finance','debts','more'];const next=tabs.indexOf(state.tab)+step;if(next<0||next>=tabs.length){navigationDirection=0;return false}openTab(tabs[next]);return true;}render();return true}
let swipeStart=null,swipeSuppressClickUntil=0;
function beginSwipe(target,id,x,y){
 if(state.modal||state.route||state.loading||state.error||state.authRequired||target.closest('input,select,textarea,a,[contenteditable],.bottom-nav'))return;
 const zone=target.closest('[data-swipe]'),main=target.closest('main.page');
 if(zone||main)swipeStart={id,kind:zone?.dataset.swipe||(state.tab==='finance'?'view':'tab'),x,y,page:main,active:false,canceled:false};
}
function restoreSwipePage(start){
 const page=start.page;if(!page?.isConnected||!start.active||reducedMotion())return;
 clearTimeout(page._swipeRestoreTimer);
 page.style.transition='transform .28s cubic-bezier(.16,1,.3,1),opacity .28s ease';
 page.style.transform='translate3d(0,0,0)';page.style.opacity='1';
 page._swipeRestoreTimer=setTimeout(()=>{if(page.isConnected){page.style.removeProperty('transition');page.style.removeProperty('transform');page.style.removeProperty('opacity');page.style.removeProperty('will-change')}},300);
}
function trackSwipe(id,x,y,event){
 const start=swipeStart;if(!start||start.id!==id||start.canceled)return;
 const dx=x-start.x,dy=y-start.y;
 if(!start.active){if(Math.abs(dx)<9&&Math.abs(dy)<9)return;if(Math.abs(dy)>Math.abs(dx)*1.15){start.canceled=true;return}start.active=true}
 if(event.cancelable)event.preventDefault();
 if(!start.page?.isConnected||reducedMotion())return;
 clearTimeout(start.page._swipeRestoreTimer);
 const offset=Math.sign(dx)*Math.min(96,Math.abs(dx)*.55);
 start.page.style.transition='none';start.page.style.willChange='transform,opacity';
 start.page.style.transform=`translate3d(${offset}px,0,0)`;
 start.page.style.opacity=String(1-Math.min(.12,Math.abs(offset)/800));
}
function finishSwipe(id,x,y){
 if(!swipeStart||swipeStart.id!==id)return false;
 const start=swipeStart;swipeStart=null;
 const dx=x-start.x,dy=y-start.y;
 if(start.canceled||Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.3){restoreSwipePage(start);return false}
 swipeSuppressClickUntil=Date.now()+350;
 if(!stepSwipe(start.kind,dx<0?1:-1)){restoreSwipePage(start);return false}
 return true;
}
// Safari en iPhone puede cancelar Pointer Events al iniciar un gesto nativo.
// Touch Events manejan el dedo; Pointer Events quedan para ratón y lápiz.
document.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];beginSwipe(e.target,t.identifier,t.clientX,t.clientY)},{passive:true});
document.addEventListener('touchmove',e=>{if(e.touches.length!==1)return;const t=e.touches[0];trackSwipe(t.identifier,t.clientX,t.clientY,e)},{passive:false});
document.addEventListener('touchend',e=>{if(e.changedTouches.length!==1)return;const t=e.changedTouches[0];if(finishSwipe(t.identifier,t.clientX,t.clientY)&&e.cancelable)e.preventDefault()},{passive:false});
document.addEventListener('touchcancel',()=>{if(swipeStart)restoreSwipePage(swipeStart);swipeStart=null},{passive:true});
document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;beginSwipe(e.target,e.pointerId,e.clientX,e.clientY)});
document.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||!e.buttons)return;trackSwipe(e.pointerId,e.clientX,e.clientY,e)});
document.addEventListener('pointerup',e=>{if(e.pointerType==='touch')return;finishSwipe(e.pointerId,e.clientX,e.clientY)});
document.addEventListener('pointercancel',e=>{if(e.pointerType!=='touch'&&swipeStart){restoreSwipePage(swipeStart);swipeStart=null}});
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
function openRoute(route){navigationDirection=1;state.route=String(route||'');state.tab='more';state.modal=null;render();window.scrollTo(0,0)}
function openPrefilledEntry(opts={}){state.entryType=opts.type==='ingreso'||opts.type==='transferencia'?opts.type:'gasto';state.entryDigits=opts.cents?String(Math.max(0,Math.round(Number(opts.cents)))):'';state.entryNote=String(opts.note||'').slice(0,180);state.entryDate=/^\d{4}-\d{2}-\d{2}$/.test(String(opts.date||''))?opts.date:core.businessDay(new Date());state.entryLink=opts.link||null;state.pendingRequestId=null;const type=state.entryType;state.entryAccount=opts.accountId||lastAccount(type)||state.entryAccount;if(type==='transferencia'){const a=account(state.entryAccount);state.entryDest=opts.destId||accounts().find(x=>x.id!==a?.id&&x.moneda===a?.moneda)?.id||'';}else{state.entryCategory=opts.categoryId||cats().find(c=>c.tipo===type)?.id||'';}openModal('entry')}
window.DcarelaFinanzasReload=()=>load();
window.DcarelaFinanzasActions={openTab,openRoute,openPrefilledEntry,setTheme,render,branchDisplayName,isPlazaBranch,getSnapshot:()=>({state,isLive,accounts:accounts(),categories:cats(),business:state.business,branchAppKind,branchDisplayName:branchDisplayName(),moreItems})};
load();
