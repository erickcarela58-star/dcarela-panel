// Resumen del libro de Hermes: no escribe ni modifica movimientos de Caja.
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const sum=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))throw new Error('El total supera el rango monetario verificable.');return n;};
const cents=value=>{if(value===null||value===undefined||value===''||typeof value==='boolean')throw new Error('Un e-CF tiene importes no verificables.');const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('Un e-CF tiene importes no verificables.');return n;};
export function saleKind(row){return /^E34/i.test(String(row.encf||'').trim())||/nota.*credito/.test(norm(row.tipo_comprobante))?'credito':'venta';}
export function isExcluded(row){return row.descartado_irreal===true||row.anulada===true||row.anulado===true||/anul|rechaz|cancel|descart|irreal|borrador/.test(norm(row.estado));}
export function summarizeFacturadorSales(rows,{month='',businessId}={}){
 if(!Array.isArray(rows))throw new Error('No se pudo verificar la lista del Facturador.');
 if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Elige un mes válido.');
 const unique=new Map();let duplicates=0;
 for(const original of rows){
  if(!original||businessId&&original.business_id!==businessId)throw new Error('Se recibió un comprobante de otra sucursal.');
  const row={...original},total=cents(row.total_centavos),subtotal=cents(row.subtotal_centavos),itbis=cents(row.itbis_centavos);
  if(sum(subtotal,itbis)!==total)throw new Error('El subtotal y el ITBIS no coinciden con el total del e-CF.');
  const currency=String(row.moneda||'DOP').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new Error('Moneda no verificable.');
  const encf=String(row.encf||'').trim().toUpperCase(),id=encf||String(row.id||'');if(!id)throw new Error('Comprobante sin identificador verificable.');
  Object.assign(row,{total_centavos:total,subtotal_centavos:subtotal,itbis_centavos:itbis,moneda:currency,credit:saleKind(row)==='credito',excluded:isExcluded(row),
   pendingVerification:row.requiere_verificacion_hermes===true||/pendiente|por.?verificar/.test(norm(row.estado_verificacion))||(!row.verificado_hermes&&/por confirmar/.test(norm(row.forma_pago)+' '+norm(row.cliente)))});
  const key=String(row.business_id||businessId||'')+'|'+id,prior=unique.get(key);
  if(prior){
   if(['total_centavos','subtotal_centavos','itbis_centavos','moneda','credit','excluded'].some(k=>prior[k]!==row[k]))throw new Error('Hay versiones contradictorias de '+id+'. Pide verificación a Hermes.');
   duplicates++;if(String(row.updated_at||'')>String(prior.updated_at||''))unique.set(key,row);
  }else unique.set(key,row);
 }
 const allRows=[...unique.values()].sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||String(b.encf||'').localeCompare(String(a.encf||'')));
 const selected=allRows.filter(r=>!month||String(r.fecha||'').slice(0,7)===month),groups=new Map();
 for(const row of selected){
  let group=groups.get(row.moneda);if(!group){group={currency:row.moneda,salesCount:0,creditCount:0,excludedCount:0,pendingVerificationCount:0,pendingVerificationTotal:0,gross:0,credits:0,subtotal:0,itbis:0,total:0};groups.set(row.moneda,group);}
  if(row.excluded){group.excludedCount++;continue;}
  const sign=row.credit?-1:1;
  if(row.pendingVerification){group.pendingVerificationCount++;group.pendingVerificationTotal=sum(group.pendingVerificationTotal,sign*row.total_centavos);}
  if(row.credit){group.creditCount++;group.credits=sum(group.credits,row.total_centavos);}else{group.salesCount++;group.gross=sum(group.gross,row.total_centavos);}
  group.subtotal=sum(group.subtotal,sign*row.subtotal_centavos);group.itbis=sum(group.itbis,sign*row.itbis_centavos);group.total=sum(group.total,sign*row.total_centavos);
 }
 return {rows:selected,groups:[...groups.values()].sort((a,b)=>a.currency==='DOP'?-1:b.currency==='DOP'?1:a.currency.localeCompare(b.currency)),
  totalRecords:allRows.length,selectedRecords:selected.length,duplicates,withoutDate:allRows.filter(r=>!/^\d{4}-\d{2}-\d{2}/.test(String(r.fecha||''))).length};
}
