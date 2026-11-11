// Datos inventados para una maqueta. No contiene cifras, clientes ni cuentas del negocio real.
// Montos monetarios en centavos ENTEROS: nunca se generan importes en coma flotante.
const defs = [
  {id:'cash',nombre:'Caja del estudio',tipo:'efectivo',moneda:'DOP',saldo_actual_centavos:12894500,incluir_en_total:true,color:'#4f6df5',logo:'cash'},
  {id:'popular',nombre:'Banco Popular',tipo:'banco',moneda:'DOP',saldo_actual_centavos:7520630,incluir_en_total:true,color:'#f47b20',logo:'popular'},
  {id:'reservas',nombre:'Banreservas',tipo:'banco',moneda:'DOP',saldo_actual_centavos:4750320,incluir_en_total:true,color:'#006f8f',logo:'banreservas'},
  {id:'petty',nombre:'Caja chica',tipo:'efectivo',moneda:'DOP',saldo_actual_centavos:824100,incluir_en_total:false,color:'#9b7b42',logo:'cash'},
  {id:'usd',nombre:'Ahorros en dólares',tipo:'banco',moneda:'USD',saldo_actual_centavos:231640,incluir_en_total:true,color:'#6b62b5',logo:'usd'},
  {id:'visa',nombre:'Tarjeta empresarial',tipo:'tarjeta_credito',moneda:'DOP',saldo_actual_centavos:-643200,incluir_en_total:true,color:'#203b8f',logo:'visa'},
];
const categoryDefs=[
  {id:'ventas',nombre:'Sesiones fotográficas',tipo:'ingreso',color:'#3f78b7'},
  {id:'impresiones',nombre:'Impresiones y cuadros',tipo:'ingreso',color:'#6d8fc2'},
  {id:'otrosing',nombre:'Otros ingresos',tipo:'ingreso',color:'#969ab7'},
  {id:'materiales',nombre:'Materiales',tipo:'gasto',color:'#d88972'},
  {id:'alquiler',nombre:'Alquiler y servicios',tipo:'gasto',color:'#b8778c'},
  {id:'nomina',nombre:'Personal',tipo:'gasto',color:'#8d7bb7'},
  {id:'marketing',nombre:'Publicidad',tipo:'gasto',color:'#7ca0c4'},
  {id:'equipos',nombre:'Equipos',tipo:'gasto',color:'#d1a358'},
];
const incomeNames=['Sesión familiar · demo','Fotos de graduación · demo','Impresión de cuadros · demo','Paquete cumpleaños · demo','Sesión de estudio · demo','Impresiones de laboratorio · demo'];
const expenseNames=['Papel fotográfico · demo','Suscripción de edición · demo','Publicidad digital · demo','Material de empaque · demo','Mantenimiento · demo','Servicio de mensajería · demo'];
function fixture(b='sucursal-a') {
  const factor = b==='sucursal-b' ? 2 : 1;
  const accounts=defs.map(a=>({...a,id:`${b}-${a.id}`,business_id:b,saldo_actual_centavos:a.saldo_actual_centavos*factor,estado:'activa'}));
  const categories=categoryDefs.map(c=>({...c,business_id:b}));
  let seed = b==='sucursal-b' ? 736234 : 145389;
  const rand = max => {seed ^= seed<<13;seed ^= seed>>>17;seed ^= seed<<5;return (seed>>>0)%max;};
  const movements=[];
  let index=1;
  const add=(fecha,tipo,cuentaId,catId,monto,descripcion,extra={})=>{
    movements.push({id:`${b}-fake-${index++}`,business_id:b,fecha,tipo,cuenta_id:`${b}-${cuentaId}`,
      categoria_id:catId,monto_centavos:monto,descripcion,estado:'registrado',origen:'panel',moneda:cuentaId==='usd'?'USD':'DOP',afecta_resultado:tipo!=='transferencia',...extra});
  };
  // 100+ movimientos individuales repartidos en dos meses, anulados y transferencias incluidos.
  for(const month of ['2026-10','2026-11']) {
    const limit=month==='2026-11'?10:28;
    for(let day=1;day<=limit;day++){
      const date=`${month}-${String(day).padStart(2,'0')}`;
      const incomeAmount=(120000+rand(420000))*factor;
      const spent=(25000+rand(130000))*factor;
      const acct=['cash','popular','reservas'][rand(3)];
      const incomeCat=rand(3)?'ventas':'impresiones';
      add(date,'ingreso',acct,incomeCat,incomeAmount,incomeNames[rand(incomeNames.length)]);
      add(date,'gasto',['cash','popular','visa'][rand(3)],['materiales','alquiler','nomina','marketing','equipos'][rand(5)],spent,expenseNames[rand(expenseNames.length)]);
      if(day%3===0) add(date,'ingreso','cash','ventas',(59000+rand(235000))*factor,incomeNames[rand(incomeNames.length)]);
      if(day%4===0) add(date,'gasto','popular','marketing',(25000+rand(145000))*factor,'Campaña de temporada · demo');
      if(day%6===0) add(date,'transferencia','cash',null,(150000+rand(200000))*factor,'Transferencia interna · demo',
        {cuenta_destino_id:`${b}-popular`,afecta_resultado:false});
      if(day%9===0) add(date,'gasto','cash','equipos',95000*factor,'Registro anulado · demo',{estado:'anulado'});
    }
  }
  add('2026-11-03','ingreso','usd','otrosing',12450*factor,'Ingreso en dólares · demo');
  add('2026-11-06','gasto','usd','materiales',3600*factor,'Compra en dólares · demo');
  const sales=[{id:`${b}-sale-event`,business_id:b,event_type:'VentaCobrada',entity_id:`${b}-sale-1`,payload:{ventaId:`${b}-sale-1`,folio:'D-104',clienteNombre:'Cliente ficticio',cajaNombre:'Caja de prueba',totalCobradoCentavos:150000*factor,descuentoCentavos:10000*factor,itbisCentavos:22881*factor,lineas:[{nombre:'Sesión de retrato · demo',cantidad:1,importeFinalCentavos:150000*factor}],pagos:[{metodo:'efectivo',montoCentavos:150000*factor}]}}];
  add('2026-11-10','ingreso','cash','ventas',150000*factor,'D-104',{origen:'pos_venta',estado:'confirmado',venta_id:`${b}-sale-1`,sync_event_id:`${b}-sale-event`,venta_folio:'D-104'});
  // Una venta a crédito informativa (sin movimiento contable ni efecto en cuentas).
  const commitments=[
    {id:`${b}-d1`,business_id:b,nombre:'Cuota de equipo · demo',tipo:'prestamo',saldo_pendiente_centavos:380000*factor,monto_centavos:95000*factor,proximo_vencimiento:'2026-11-18',estado:'activo',cuotas_pagadas:2,cuotas_totales:6},
    {id:`${b}-d2`,business_id:b,nombre:'Servicio mensual · demo',tipo:'servicio',saldo_pendiente_centavos:68500*factor,monto_centavos:68500*factor,proximo_vencimiento:'2026-11-24',estado:'activo'}
  ];
  const commitmentPayments=[{id:`${b}-pay-1`,business_id:b,compromiso_id:`${b}-d1`,monto_centavos:95000*factor,fecha:'2026-10-18',estado:'registrado',referencia:'Pago de prueba'}];
  const costObligations=[{id:`${b}-ob1`,business_id:b,obligacionId:`${b}-ob1`,concepto:'Internet · demo',saldoCentavos:240000*factor,venceEn:'2026-11-25',estado:'parcial'}];
  const costPayments=[{id:`${b}-cp1`,business_id:b,obligacionId:`${b}-ob1`,montoCentavos:50000*factor,pagadoEn:'2026-10-25',estado:'registrado',metodoPago:'efectivo'}];
  const budgets=[
    {id:`${b}-b1`,business_id:b,categoria_id:'materiales',monto_centavos:800000*factor,periodo:'mensual',periodo_inicio:'2026-11-01',estado:'activo'},
    {id:`${b}-b2`,business_id:b,categoria_id:'marketing',monto_centavos:600000*factor,periodo:'mensual',periodo_inicio:'2026-11-01',estado:'activo'},
    {id:`${b}-b3`,business_id:b,categoria_id:'equipos',monto_centavos:450000*factor,periodo:'mensual',periodo_inicio:'2026-11-01',estado:'activo'}
  ];
  const cards=[{id:`${b}-card-1`,business_id:b,cuenta_id:`${b}-visa`,nombre:'Tarjeta empresarial · demo',limite_credito_centavos:2000000*factor,dia_corte:15,dia_pago:25}];
  return {accounts,categories,movements,sales,commitments,commitmentPayments,costObligations,costPayments,costRecurrents:[],budgets,cards,preferences:{business_id:b,moneda_principal:'DOP'},demo:true};
}
export {fixture};
