'use strict';
// Real shell/panel with synthetic data only. Inherits the base CSP (connect-src 'none')
// and rejected writes. ?role=admin, ?large=1 and ?slow=1 exercise UI variants.
const preview=require('./workspace-preview.cjs');
const fixture=preview.fixtureScript
  .replace("['Estudio','Materiales','Local','Transporte','Equipo','Servicios']","['Estudio','Materiales','Local']")
  .replace("role:'viewer'","role:(new URLSearchParams(window.parent.location.search).get('role')==='admin'?'owner':'viewer')")
  .replace("const accounts=business=>[", "const accounts=business=>[")
  .replace("{id:business+'-usd',", "{id:business+'-card-dop',business_id:business,nombre:'Tarjeta DOP · ficticia',tipo:'tarjeta_credito',saldo_actual_centavos:-10000,incluir_en_total:true},{id:business+'-card-usd',business_id:business,nombre:'Tarjeta USD · ficticia',moneda:'USD',tipo:'tarjeta_credito',saldo_actual_centavos:-6400,incluir_en_total:true},{id:business+'-usd',")
  .replace('categoria_id:c.id,','categoria_id:i===0?null:i===1?"categoria-qa-sin-nombre":c.id,')
  .replace('getFinanceCards:async()=>[]', "getFinanceCards:async business=>[{cuenta_id:business+'-card-dop',limite_credito_centavos:100000,dia_corte:20,dia_pago:5},{cuenta_id:business+'-card-usd',limite_credito_centavos:10000,dia_corte:20,dia_pago:5}]")
  .replace('getFinanceJournal:async business=>{', `getFinanceJournal:async business=>{
    if(new URLSearchParams(window.parent.location.search).has('slow'))await new Promise(resolve=>setTimeout(resolve,business==='dcarela'?2500:500));`)
  .replace('return Object.assign([...projected,...expenses],', `return Object.assign([...projected,...expenses,
    {id:'qa-old',tipo:'gasto',fecha:'2026-10-02',monto_centavos:7777,categoria_id:null,estado:'registrado',descripcion:'Gasto del mes anterior · ficticio'},
    {id:'qa-income',tipo:'ingreso',fecha:today,monto_centavos:59999,categoria_id:null,estado:'registrado',descripcion:'Ingreso de control · ficticio'},
    {id:'qa-fee',tipo:'transferencia',fecha:today,monto_centavos:100000,comision_centavos:333,categoria_id:null,estado:'registrado',descripcion:'Transferencia con comisión · ficticia'},
    ...(new URLSearchParams(window.parent.location.search).has('large')?Array.from({length:12000},(_,i)=>({id:'qa-history-'+i,tipo:'gasto',fecha:today,monto_centavos:100,categoria_id:null,cuenta_id:business+'-cash',estado:'registrado',descripcion:'Historial ficticio '+(i+1)})):[])],`);
function createServer(){
  const server=preview.createServer(),base=server.listeners('request')[0];server.removeAllListeners('request');
  server.on('request',(req,res)=>{if(req.url.split('?')[0]==='/preview-fixture.js'&&req.method==='GET'){
    res.setHeader('Content-Type','application/javascript');res.setHeader('Cache-Control','no-store');res.end(fixture);
  }else base(req,res);});return server;
}
if(require.main===module)createServer().listen(Number(process.argv[2]||8897),'127.0.0.1',()=>console.log('Panel QA aislado: http://127.0.0.1:'+(process.argv[2]||8897)+' · sin nube ni escrituras'));
module.exports={createServer,fixture};
