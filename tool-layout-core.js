(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DcarelaToolLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function normalize(ids,saved,defaults=ids,required=[]){
    ids=[...new Set(ids.filter(id=>typeof id==='string'))];
    const valid=new Set(ids),order=[...new Set([...(Array.isArray(saved?.order)?saved.order:defaults),...ids])].filter(id=>valid.has(id));
    const hidden=new Set(Array.isArray(saved?.hidden)?saved.hidden:ids.filter(id=>!defaults.includes(id)));
    required.forEach(id=>hidden.delete(id));
    return {order,hidden:order.filter(id=>hidden.has(id))};
  }
  const key=scope=>'dcarela.tools.v1.'+scope;
  function read(scope,ids,defaults,required){let saved;try{saved=JSON.parse(localStorage.getItem(key(scope))||'null');}catch{}return normalize(ids,saved,defaults,required);}
  function save(scope,value){localStorage.setItem(key(scope),JSON.stringify(value));window.dispatchEvent(new CustomEvent('dcarela:tools-changed',{detail:{scope}}));}
  function organize({scope,items,defaults=items.map(i=>i.id),required=[],onSave}){
    const previous=document.activeElement,ids=items.map(i=>i.id),labels=new Map(items.map(i=>[i.id,i.title]));
    let draft=read(scope,ids,defaults,required);
    const dialog=document.createElement('dialog');dialog.className='crm-organizer';dialog.setAttribute('aria-labelledby','crm-organizer-title');
    const heading=document.createElement('h2');heading.id='crm-organizer-title';heading.textContent='Organizar herramientas';dialog.append(heading);
    const explanation=document.createElement('p');explanation.textContent='Mueve las opciones con las flechas y elige cuáles mostrar. Se guarda en este equipo.';dialog.append(explanation);
    const list=document.createElement('div');list.className='crm-organizer-list';dialog.append(list);
    const draw=()=>{list.replaceChildren();draft.order.forEach((id,index)=>{
      const row=document.createElement('div');row.className='crm-organizer-row';
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=!draft.hidden.includes(id);check.disabled=required.includes(id);
      check.addEventListener('change',()=>{draft.hidden=check.checked?draft.hidden.filter(x=>x!==id):[...draft.hidden,id];});
      label.append(check,document.createTextNode(labels.get(id)));row.append(label);
      [-1,1].forEach(direction=>{const button=document.createElement('button');button.type='button';button.textContent=direction<0?'↑':'↓';button.setAttribute('aria-label',(direction<0?'Subir ':'Bajar ')+labels.get(id));button.disabled=index+direction<0||index+direction>=draft.order.length;button.addEventListener('click',()=>{
        const next=index+direction;[draft.order[index],draft.order[next]]=[draft.order[next],draft.order[index]];draw();list.children[next].querySelectorAll('button')[direction<0?0:1].focus();
      });row.append(button);});list.append(row);
    });};draw();
    const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
    const actions=document.createElement('div');actions.className='crm-organizer-actions';dialog.append(actions);
    const add=(text,action)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('click',action);actions.append(button);};
    add('Restablecer',()=>{draft=normalize(ids,null,defaults,required);draw();});add('Cancelar',()=>dialog.close());
    add('Guardar disposición',()=>{try{const result=normalize(ids,draft,defaults,required);save(scope,result);onSave?.(result);dialog.close();}catch{status.textContent='No se pudo guardar la disposición en este navegador.';}});
    dialog.addEventListener('close',()=>{dialog.remove();previous?.focus();},{once:true});document.body.append(dialog);dialog.showModal();
  }
  function bindToolbar(element,{scope,defaults,required=[],active}){
    const buttons=[...element.querySelectorAll('[data-cost-tab]')];
    const items=buttons.map(button=>({id:button.dataset.costTab,title:button.textContent.trim()}));
    const apply=()=>{const prefs=read(scope,items.map(i=>i.id),defaults,required),byId=new Map(buttons.map(b=>[b.dataset.costTab,b]));
      prefs.order.forEach(id=>{const button=byId.get(id);button.hidden=prefs.hidden.includes(id)&&id!==active();element.append(button);});element.append(organizer);
    };
    const organizer=document.createElement('button');organizer.type='button';organizer.className='crm-organize-button';organizer.textContent='Organizar';organizer.setAttribute('aria-label','Organizar herramientas de Finanzas');organizer.addEventListener('click',()=>organize({scope,items,defaults,required,onSave:apply}));
    apply();return apply;
  }
  function accountMessage(event,{origin,parent,business,authenticated,accounts}){
    const d=event.data;if(!authenticated||event.origin!==origin||event.source!==parent||d?.type!=='dcarela:open-account'||d.businessId!==business||typeof d.accountId!=='string'||d.accountId.length>200)return null;
    return accounts.some(a=>a.id===d.accountId&&a.estado!=='eliminada')?d.accountId:null;
  }
  let pending=null,connected=false;
  function requestAccount(id,business,open){
    if(typeof id!=='string'||!id||typeof business!=='string')return;
    pending={accountId:id,businessId:business};
    if(!connected){connected=true;window.addEventListener('message',event=>{
      const frame=document.querySelector('iframe');
      if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.businessId!==pending?.businessId||location.hash!=='#finanzas')return;
      if(event.data.type==='dcarela:account-opened'&&event.data.accountId===pending.accountId){pending=null;return;}
      if(event.data.type!=='dcarela:account-ready')return;
      frame.contentWindow.postMessage({type:'dcarela:open-account',...pending},location.origin);pending=null;
    });}
    open('finanzas');
    const frame=document.querySelector('iframe');
    if(frame?.contentWindow)frame.contentWindow.postMessage({type:'dcarela:open-account',...pending},location.origin);
  }
  return {normalize,read,save,organize,bindToolbar,accountMessage,requestAccount};
});
