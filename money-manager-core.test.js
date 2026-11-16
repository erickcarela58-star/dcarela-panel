const test = require("node:test");
const assert = require("node:assert/strict");
const money = require("./money-manager-core.js");

test("separa ventas automaticas, movimientos manuales y transferencias sin inflar resultados", () => {
  const summary = money.summarizeMovements([
    { tipo: "ingreso", fecha: "2026-09-01", monto_centavos: 100000, origen: "pos_venta" },
    { tipo: "ingreso", fecha: "2026-09-02", monto_centavos: 25000, origen: "panel" },
    { tipo: "gasto", fecha: "2026-09-03", monto_centavos: 40000, origen: "asistente" },
    { tipo: "transferencia", fecha: "2026-09-04", monto_centavos: 50000, origen: "panel" },
  ], "2026-09");
  assert.equal(summary.sales, 100000);
  assert.equal(summary.manualIncome, 25000);
  assert.equal(summary.income, 125000);
  assert.equal(summary.expenses, 40000);
  assert.equal(summary.transfers, 50000);
  assert.equal(summary.result, 85000);
});

test("una transferencia conciliada sigue siendo traslado y no ajuste de saldo", () => {
  assert.equal(money.sourceOf({ tipo: "transferencia", conciliado: true, afecta_resultado: false }), "transferencia");
  assert.equal(money.sourceOf({ tipo: "ajuste_positivo", origen: "panel", afecta_resultado: false }), "conciliacion");
});

test("calcula patrimonio y deuda de tarjetas con el mismo saldo efectivo del motor financiero", () => {
  const summary = money.accountSummary([
    { id: "cash", tipo: "efectivo", saldo_actual_centavos: 3650000, incluir_en_total: true },
    { id: "bank", tipo: "banco", saldo_actual_centavos: 63410, incluir_en_total: true },
    { id: "card", tipo: "tarjeta_credito", saldo_actual_centavos: -291129, incluir_en_total: false },
  ], []);
  assert.equal(summary.available, 3713410);
  assert.equal(summary.netWorth, 3713410);
  assert.equal(summary.cardDebt, 291129);
});

test("muestra servicios vencidos y del mes aunque no se hayan marcado como pagados", () => {
  const summary = money.obligationSummary({
    month: "2026-09",
    costObligations: [
      { id: "luz-agosto", concepto: "EDEEste", venceEn: "2026-08-20", saldoCentavos: 475553, estado: "pendiente", categoria: "Servicios" },
      { id: "internet-sept", concepto: "Wind", venceEn: "2026-09-10", saldoCentavos: 298105, estado: "pendiente", categoria: "Servicios" },
    ],
  });
  assert.equal(summary.overdueDue, 475553);
  assert.equal(summary.currentDue, 298105);
  assert.equal(summary.payableNow, 773658);
});

test("la deuda de prestamos sale del saldo contractual y no de todas las facturas", () => {
  const summary = money.obligationSummary({
    month: "2026-09",
    commitments: [
      { id: "loan", nombre: "Prestamo motor", tipo: "prestamo", activo: true, monto_centavos: 120000, saldo_pendiente_centavos: 7580000, capital_pendiente_centavos: 7000000, proximo_vencimiento: "2026-09-15" },
    ],
    costObligations: [
      { id: "rent", concepto: "Alquiler", venceEn: "2026-09-05", saldoCentavos: 2500000, estado: "pendiente", categoria: "Alquiler" },
    ],
  });
  assert.equal(summary.loanDebt, 7580000);
  assert.equal(summary.loanCapital, 7000000);
  assert.equal(summary.currentDue, 2620000);
});

test("recupera una deuda vieja guardada como cuotas sin sumar servicios", () => {
  const summary = money.obligationSummary({
    month: "2026-09",
    costObligations: [
      { id: "loan-1", concepto: "Deuda semanal (10 cuotas)", categoria: "Prestamo", venceEn: "2026-09-07", saldoCentavos: 120000, estado: "pendiente" },
      { id: "loan-2", concepto: "Deuda semanal (10 cuotas)", categoria: "Prestamo", venceEn: "2026-09-14", saldoCentavos: 120000, estado: "pendiente" },
      { id: "internet", concepto: "Internet", venceEn: "2026-09-18", saldoCentavos: 298105, estado: "pendiente" },
    ],
  });
  assert.equal(summary.loanDebt, 240000);
  assert.equal(summary.currentDue, 538105);
});

test("prestamos liquidados no vencen otra vez y servicios recurrentes conservan el siguiente pago", () => {
  const summary = money.obligationSummary({ month: "2026-09", commitments: [
    { id: "weekly", tipo: "prestamo", nombre: "Semanal", activo: true, monto_centavos: 120000,
      saldo_pendiente_centavos: 0, proximo_vencimiento: "2026-09-07" },
    { id: "complete", tipo: "prestamo", nombre: "Diez cuotas", activo: true, monto_centavos: 120000,
      cuotas_totales: 10, cuotas_pagadas: 10, proximo_vencimiento: "2026-09-07" },
    { id: "internet", tipo: "servicio", nombre: "Internet", activo: true, monto_centavos: 298105,
      saldo_pendiente_centavos: 0, proximo_vencimiento: "2026-09-10" },
  ] });
  assert.deepEqual(summary.rows.map(item => item.id), ["internet"]);
  assert.equal(summary.loanDebt, 0);
  assert.equal(summary.currentDue, 298105);
});

test("la ultima cuota se limita al saldo y contradicciones de cuotas quedan visibles", () => {
  const summary = money.obligationSummary({ month: "2026-09", commitments: [
    { id: "loan", tipo: "prestamo", activo: true, monto_centavos: 120000,
      saldo_pendiente_centavos: 25000, cuotas_totales: 10, cuotas_pagadas: 10,
      proximo_vencimiento: "2026-09-07" },
  ] });
  assert.equal(summary.currentDue, 25000);
  assert.equal(summary.loanDebt, 25000);
  assert.equal(summary.rows[0].needsReview, true);
});

test("un nombre con deuda o cuota no convierte un servicio en prestamo", () => {
  const summary = money.obligationSummary({ month: "2026-09",
    commitments: [{ id: "service", tipo: "servicio", nombre: "Deuda de internet", activo: true,
      monto_centavos: 298105, saldo_pendiente_centavos: 0, proximo_vencimiento: "2026-09-10" }],
    costObligations: [{ id: "bill", concepto: "Cuota servicio", categoria: "Servicios",
      saldoCentavos: 20000, venceEn: "2026-09-11", estado: "pendiente" }],
  });
  assert.equal(summary.loanDebt, 0);
  assert.equal(summary.currentDue, 318105);
});

test("una cuota conocida no sustituye una deuda o capital contractual desconocidos", () => {
  const summary = money.obligationSummary({ month: "2026-10", commitments: [
    { id: "known", tipo: "prestamo", activo: true, monto_centavos: 50000,
      saldo_pendiente_centavos: 300000, capital_pendiente_centavos: 250000,
      proximo_vencimiento: "2026-10-22" },
    { id: "unknown", tipo: "prestamo", activo: true, monto_centavos: 100000,
      proximo_vencimiento: "2026-10-23" },
  ] });
  assert.equal(summary.currentDue, 150000, "las cuotas comprobadas conservan su importe");
  assert.equal(summary.loanDebt, null, "no presenta cuota + saldo parcial como deuda total");
  assert.equal(summary.loanCapital, null, "desconocido no equivale a capital cero");
  assert.equal(summary.unknownLoanBalances, 1);
  assert.equal(summary.unknownLoanCapitals, 1);
});

test("resumen y calendario muestran comisiones sin duplicar el gasto vinculado", () => {
  const transfer = { id: "transfer-1", tipo: "transferencia", fecha: "2026-09-05", monto_centavos: 250000, comision_centavos: 4060 };
  const fee = { id: "fee-1", tipo: "gasto", fecha: "2026-09-05", monto_centavos: 4060, transferencia_id: "transfer-1" };
  for (const rows of [[transfer], [transfer, fee]]) {
    assert.equal(money.summarizeMovements(rows, "2026-09").expenses, 4060);
    assert.equal(money.summarizeMovements(rows, "2026-09").result, -4060);
    assert.equal(money.calendar(rows, "2026-09").cells.find(item => item.day === 5).expenses, 4060);
  }
});

test("un plan de servicio no materializado sigue visible como pago previsto", () => {
  const summary = money.obligationSummary({
    month: "2026-09",
    costRecurrents: [
      { id: "internet", nombre: "Internet", activo: true, proximaFecha: "2026-09-12", montoEstimadoCentavos: 298105 },
    ],
  });
  assert.equal(summary.plannedMissing.length, 1);
  assert.equal(summary.currentDue, 298105);
});

test("una factura vieja del mismo plan no oculta el vencimiento nuevo", () => {
  const summary = money.obligationSummary({
    month: "2026-09",
    costObligations: [
      { id: "internet-agosto", recurrenteId: "internet", periodoClave: "internet:2026-08-12", concepto: "Internet", venceEn: "2026-08-12", saldoCentavos: 0, estado: "pagada" },
    ],
    costRecurrents: [
      { id: "internet", nombre: "Internet", activo: true, proximaFecha: "2026-09-12", montoEstimadoCentavos: 298105 },
    ],
  });
  assert.equal(summary.plannedMissing.length, 1);
  assert.equal(summary.currentDue, 298105);
});

test("factura y plan sin identificador recurrente no duplican la misma cuota", () => {
  const summary = money.obligationSummary({month:"2026-11",
    costObligations:[{id:"factura-1",concepto:"Suscripción Adobe",venceEn:"2026-11-18",saldoCentavos:167504,estado:"pendiente"}],
    costRecurrents:[{id:"plan-1",nombre:"Suscripcion Adobe",proximaFecha:"2026-11-18",montoEstimadoCentavos:167504,activo:true}]});
  assert.equal(summary.current.length,1);
  assert.equal(summary.plannedMissing.length,0);
  assert.equal(summary.currentDue,167504);
});

test("pago por verificar queda visible para revisión sin aumentar la deuda pagadera", () => {
  const summary = money.obligationSummary({ month: "2026-11", costObligations: [
    { id: "claro-8651", concepto: "Claro 8651", venceEn: "2026-11-18", saldoCentavos: 298105, estado: "pago_por_verificar" },
  ] });
  assert.equal(summary.rows.length, 0);
  assert.equal(summary.review.length, 1);
  assert.equal(summary.review[0].name, "Claro 8651");
  assert.equal(summary.payableNow, 0);
});

test("el calendario conserva centavos y agrupa entradas, salidas y transferencias por dia", () => {
  const result = money.calendar([
    { tipo: "ingreso", fecha: "2026-09-05", monto_centavos: 10001 },
    { tipo: "gasto", fecha: "2026-09-05", monto_centavos: 5001 },
    { tipo: "transferencia", fecha: "2026-09-05", monto_centavos: 2500 },
  ], "2026-09");
  const day = result.cells.find(item => item.date === "2026-09-05");
  assert.deepEqual({ income: day.income, expenses: day.expenses, transfers: day.transfers, count: day.count },
    { income: 10001, expenses: 5001, transfers: 2500, count: 3 });
});

test("deduplica compromisos registrados dos veces entre colecciones sin colapsar lineas o quincenas distintas", () => {
  const summary = money.obligationSummary({
    month: "2026-11",
    commitments: [
      { id: "commit-fotoquimsa-20261130", nombre: "Fotoquimsa", tipo: "proveedor", monto_centavos: 1960000, saldo_pendiente_centavos: 1960000, proximo_vencimiento: "2026-11-30", activo: true, estado: "pendiente" },
    ],
    costObligations: [
      { id: "fotoquimsa-2026-11-30", concepto: "Factura Fotoquimsa", categoria: "Inventario", montoCentavos: 1960000, saldoCentavos: 1960000, venceEn: "2026-11-30", estado: "pendiente" },
      { id: "claro-8651-2026-11-15", concepto: "Claro internet 8651", montoCentavos: 220000, saldoCentavos: 220000, venceEn: "2026-11-15", estado: "pendiente" },
      { id: "claro-5644-2026-11-15", concepto: "Claro telefono 5644", montoCentavos: 180000, saldoCentavos: 180000, venceEn: "2026-11-15", estado: "pendiente" },
      { id: "nomina-05", concepto: "Nomina Central", montoCentavos: 1500000, saldoCentavos: 1500000, venceEn: "2026-11-05", estado: "pendiente" },
      { id: "nomina-20", concepto: "Nomina Central", montoCentavos: 1500000, saldoCentavos: 1500000, venceEn: "2026-11-20", estado: "pendiente" },
    ],
  });

  const fotoRows = summary.rows.filter(r => /fotoquimsa/i.test(r.name));
  assert.equal(fotoRows.length, 1);
  assert.equal(fotoRows[0].legacyId, "fotoquimsa-2026-11-30");
  assert.equal(fotoRows[0].duplicateRefs.length, 1);
  assert.equal(fotoRows[0].duplicateRefs[0].nativeId, "commit-fotoquimsa-20261130");
  assert.equal(summary.currentDue, 1960000 + 220000 + 180000 + 1500000 + 1500000);
  assert.equal(summary.rows.filter(r => /claro/i.test(r.name)).length, 2);
  assert.equal(summary.rows.filter(r => /nomina/i.test(r.name)).length, 2);
});

test("asocia pagos por palabras clave y sinonimos sin renombrar movimientos y excluye microimpuesto o luz residencial", () => {
  const summary = money.obligationSummary({
    month: "2026-11",
    costObligations: [
      { id: "foto-1", concepto: "Fotoquimsa", acreedor: "Fotoquimsa", palabras_clave: ["viajante", "ramon martinez"], montoCentavos: 1960000, saldoCentavos: 1960000, venceEn: "2026-11-30", estado: "pendiente" },
    ],
    costRecurrents: [
      { id: "rec-viegas", nombre: "Viegas Academy", montoEstimadoCentavos: 196800, proximaFecha: "2026-11-28", activo: true },
      { id: "rec-claude", nombre: "Claude Pro", montoEstimadoCentavos: 129600, proximaFecha: "2026-11-22", activo: true },
      { id: "rec-alq", nombre: "Alquiler", montoEstimadoCentavos: 1150000, proximaFecha: "2026-11-30", activo: true },
      { id: "rec-ede", nombre: "Edeeste", montoEstimadoCentavos: 500000, proximaFecha: "2026-11-25", activo: true },
    ],
  });

  const movements = [
    { id: "m-ramon", tipo: "gasto", estado: "registrado", fecha: "2026-11-01", monto_centavos: 1960000, descripcion: "Pago a Ramón Martínez, viajante Fotoquimsa" },
    { id: "m-skool", tipo: "gasto", estado: "registrado", fecha: "2026-10-05", monto_centavos: 196800, descripcion: "Consumo Popular: P.SKOOL.COM/ZLBWW" },
    { id: "m-anth", tipo: "gasto", estado: "registrado", fecha: "2026-10-22", monto_centavos: 129600, descripcion: "Consumo Banco Popular: ANTHROPIC" },
    { id: "m-anth-tax", tipo: "gasto", estado: "registrado", fecha: "2026-10-22", monto_centavos: 259, descripcion: "Impuesto DGII 0.20% (Consumo Banco Popular: ANTHROPIC)", subtipo: "impuesto_dgii_020" },
    { id: "m-local", tipo: "gasto", estado: "registrado", fecha: "2026-10-12", monto_centavos: 1150000, descripcion: "Factura Local" },
    { id: "m-casa", tipo: "gasto", estado: "registrado", fecha: "2026-11-03", monto_centavos: 320000, descripcion: "Luz de la casa" },
  ];

  const byName = n => summary.rows.find(r => r.name === n);
  const fotoLinks = money.linkedPaymentsForCommitment(byName("Fotoquimsa"), { movements });
  assert.equal(fotoLinks.length, 1);
  assert.equal(fotoLinks[0].descripcion, "Pago a Ramón Martínez, viajante Fotoquimsa");
  assert.equal(money.linkedPaymentsForCommitment(byName("Viegas Academy"), { movements }).length, 1);
  assert.equal(money.linkedPaymentsForCommitment(byName("Claude Pro"), { movements }).length, 1);
  assert.equal(money.linkedPaymentsForCommitment(byName("Alquiler"), { movements }).length, 1);
  assert.equal(money.linkedPaymentsForCommitment(byName("Edeeste"), { movements }).length, 0);

  const autoViegas = money.matchFixedCommitmentForMovement({ descripcion: "Consumo P.SKOOL.COM", monto_centavos: 196800 }, summary.rows);
  assert.equal(autoViegas?.item?.name, "Viegas Academy");

  const pion = { id: "c-pion", source: "compromiso", name: "Prestamo PION (motor)", type: "prestamo", due: "2026-12-12", outstanding: 3863900, active: true, raw: { id: "c-pion", nombre: "Prestamo PION (motor)" } };
  assert.equal(money.linkedPaymentsForCommitment(pion, { movements: [{ id: "m-gas", tipo: "gasto", estado: "registrado", fecha: "2026-09-05", monto_centavos: 97900, descripcion: "Gasolina motor" }] }).length, 0);
  assert.equal(money.linkedPaymentsForCommitment(byName("Edeeste"), { movements: [{ id: "m-luz-casa", tipo: "gasto", estado: "registrado", fecha: "2026-08-28", monto_centavos: 205150, descripcion: "Pago de luz de la casa", payee: "Edeeste" }] }).length, 0);

  const plazaSummary = money.obligationSummary({
    month: "2026-11",
    commitments: [
      { id: "p-0", nombre: "Cheque Proveedor", monto_centavos: 2100000, saldo_pendiente_centavos: 2100000, proximo_vencimiento: "2026-09-30", activo: true, estado: "pendiente" },
      { id: "p-1", nombre: "Cheque Proveedor", monto_centavos: 900000, saldo_pendiente_centavos: 900000, proximo_vencimiento: "2026-09-30", activo: true, estado: "pendiente" },
    ],
  });
  assert.equal(plazaSummary.rows.length, 2);
  assert.equal(plazaSummary.overdueDue, 3000000);
});

test("alquiler no enlaza recibos de nomina/contabilidad con categoria Alquiler ni movimientos de otras obligaciones, y muestra cuota verificada", () => {
  const alquiler = {
    id: "recovery-compromiso-alquiler-local-20260905",
    source: "compromiso",
    name: "Alquiler del local",
    type: "alquiler",
    due: "2026-11-05",
    periodAmount: 1150000,
    outstanding: null,
    active: true,
    raw: { id: "recovery-compromiso-alquiler-local-20260905", nombre: "Alquiler del local", tipo: "alquiler", monto_centavos: 1150000, saldo_pendiente_centavos: null },
  };
  const contable = {
    id: "ob-contable",
    source: "compromiso",
    name: "Contable",
    type: "servicio",
    due: "2026-11-15",
    periodAmount: 1500000,
    outstanding: 1500000,
    active: true,
    raw: { id: "ob-contable", nombre: "Contable", tipo: "servicio" },
  };
  const movements = [
    { id: "m-rent", tipo: "gasto", estado: "registrado", fecha: "2026-11-05", monto_centavos: 1150000, descripcion: "Pago Alquiler del local noviembre", categoria: "Alquiler" },
    { id: "m-recibo-10", tipo: "gasto", estado: "registrado", fecha: "2026-11-08", monto_centavos: 1800000, descripcion: "Recibo #10 · Genesis J Estevez · Nomina", categoria: "Alquiler" },
    { id: "m-recibo-9", tipo: "gasto", estado: "registrado", fecha: "2026-11-09", monto_centavos: 1500000, descripcion: "Recibo #9 · Denni Gil Carela · Pago mes Octubre contabilidad", categoria: "Alquiler" },
    { id: "m-claimed", tipo: "gasto", estado: "registrado", fecha: "2026-11-10", monto_centavos: 1500000, descripcion: "Pago mensual estudio", categoria: "Alquiler", compromiso_id: "ob-contable" },
    { id: "m-claimed-cp", tipo: "gasto", estado: "registrado", fecha: "2026-11-11", monto_centavos: 1500000, descripcion: "Recibo local contable", categoria: "Alquiler" },
  ];
  const commitmentPayments = [
    { id: "cp-1", compromiso_id: "ob-contable", movimiento_id: "m-claimed-cp", monto_centavos: 1500000, fecha: "2026-11-11" },
  ];

  const alquilerLinks = money.linkedPaymentsForCommitment(alquiler, { movements, commitmentPayments });
  assert.deepEqual(alquilerLinks.map(x => x.movimientoId), ["m-rent"]);

  const contableLinks = money.linkedPaymentsForCommitment(contable, { movements, commitmentPayments });
  assert.ok(contableLinks.some(x => x.movimientoId === "m-recibo-9"));
  assert.ok(contableLinks.some(x => x.movimientoId === "m-claimed"));
  assert.ok(!contableLinks.some(x => x.movimientoId === "m-recibo-10"));

  assert.deepEqual(money.obligationDisplayAmount(alquiler), { amount: 1150000, verified: true, kind: "installment" });
  assert.deepEqual(money.obligationDisplayAmount({
    id: "loan-unknown",
    type: "prestamo",
    periodAmount: 1150000,
    outstanding: null,
  }), { amount: null, verified: false, kind: "unverified" });
});

test("v35.52 excludeCoveredByMovements oculta Google y Nomina del 5 cubiertos pero conserva Claude, Nomina del 20, Internet, Luz y Fotoquimsa", () => {
  const summary = money.obligationSummary({
    month: "2026-11",
    excludeCoveredByMovements: true,
    commitments: [
      { id: "c-google", nombre: "Google AI / Workspace", monto_centavos: 125000, saldo_pendiente_centavos: 125000, proximo_vencimiento: "2026-11-10", frecuencia: "mensual", activo: true, estado: "activo" },
      { id: "c-claude", nombre: "Claude Pro", monto_centavos: 130000, saldo_pendiente_centavos: 130000, proximo_vencimiento: "2026-11-18", frecuencia: "mensual", activo: true, estado: "activo" },
      { id: "c-nomina", nombre: "Genesis J Estevez · Nomina", monto_centavos: 1800000, saldo_pendiente_centavos: 1800000, proximo_vencimiento: "2026-11-20", frecuencia: "quincenal", activo: true, estado: "activo" },
    ],
    costObligations: [
      { id: "ob-nom-5", concepto: "Genesis J Estevez · Nomina", monto_centavos: 1800000, saldo_centavos: 0, vence_en: "2026-11-05", estado: "pagada" },
      { id: "ob-claro", concepto: "Claro Internet 8095748651", monto_centavos: 345000, saldo_centavos: 345000, vence_en: "2026-11-22", estado: "pendiente" },
      { id: "ob-luz", concepto: "Edeeste Luz Estudio", monto_centavos: 480000, saldo_centavos: 480000, vence_en: "2026-11-25", estado: "pendiente" },
      { id: "ob-fotoq", concepto: "Fotoquimsa", monto_centavos: 650000, saldo_centavos: 650000, vence_en: "2026-11-21", estado: "pendiente" },
    ],
    movements: [
      { id: "m-google", tipo: "gasto", estado: "registrado", fecha: "2026-11-10", monto_centavos: 126000, descripcion: "Consumo GOOGLE *GOOGLE ONE", categoria: "Suscripciones" },
      { id: "m-nom-5", tipo: "gasto", estado: "registrado", fecha: "2026-11-05", monto_centavos: 1800000, descripcion: "Genesis J Estevez · Nomina 1ra quincena", categoria: "Nómina" },
    ],
  });

  const names = summary.rows.map(r => r.name);
  assert.ok(!names.some(n => /Google/i.test(n)), "Google cubierto en noviembre debe ocultarse");
  assert.ok(names.some(n => /Claude/i.test(n)), "Claude pendiente debe seguir visible");
  assert.ok(names.some(n => /Nomina/i.test(n)), "Nomina del 20 no debe ocultarse por pago del dia 5");
  assert.ok(names.some(n => /Claro/i.test(n)), "Claro Internet pendiente debe seguir visible");
  assert.ok(names.some(n => /Edeeste/i.test(n)), "Luz Edeeste pendiente debe seguir visible");
  assert.ok(names.some(n => /Fotoquimsa/i.test(n)), "Fotoquimsa pendiente debe seguir visible");
});

test("v35.53 Fotoquimsa: no muestra RD$0.00 si tiene cuota o pendiente, ni se oculta por gastos previos del mes o pagos parciales", () => {
  // (a) Compromiso recurrente de Fotoquimsa con saldo_pendiente_centavos: 0 y monto_centavos > 0
  const recurringSummary = money.obligationSummary({
    month: "2026-11",
    commitments: [
      { id: "c-foto-rec", nombre: "Fotoquimsa", tipo: "proveedor", frecuencia: "mensual", monto_centavos: 2650000, saldo_pendiente_centavos: 0, proximo_vencimiento: "2026-11-21", activo: true, estado: "activo" },
      { id: "c-unica-paid", nombre: "Compra Única Saldada", tipo: "deuda", frecuencia: "unica", monto_centavos: 500000, saldo_pendiente_centavos: 0, proximo_vencimiento: "2026-11-15", activo: true, estado: "activo" },
    ],
  });
  assert.equal(recurringSummary.rows.length, 1);
  assert.equal(recurringSummary.rows[0].id, "c-foto-rec");
  assert.deepEqual(money.obligationDisplayAmount(recurringSummary.rows[0]), { amount: 2650000, verified: true, kind: "installment" });
  assert.equal(recurringSummary.currentDue, 2650000);

  // (b) Un compromiso en 0 nunca se come ni aparece junto a una obligacion/suplidor con pendiente real
  const dedupSummary = money.obligationSummary({
    month: "2026-11",
    commitments: [
      { id: "c-foto-zero-same", nombre: "Fotoquimsa", tipo: "proveedor", frecuencia: "mensual", monto_centavos: 0, saldo_pendiente_centavos: 0, proximo_vencimiento: "2026-11-21", activo: true, estado: "activo" },
      { id: "c-foto-zero-diff", nombre: "Fotoquimsa Crédito", tipo: "proveedor", frecuencia: "mensual", monto_centavos: 0, saldo_pendiente_centavos: 0, proximo_vencimiento: "2026-11-05", activo: true, estado: "activo" },
    ],
    costObligations: [
      { id: "ob-foto-real", concepto: "Fotoquimsa SRL", tipo: "proveedor", montoCentavos: 2650000, saldoCentavos: 2650000, venceEn: "2026-11-21", estado: "pendiente" },
    ],
  });
  assert.equal(dedupSummary.rows.length, 1);
  assert.deepEqual(money.obligationDisplayAmount(dedupSummary.rows[0]), { amount: 2650000, verified: true, kind: "balance" });

  // (c) Un gasto previo del mes o abono parcial (>= 70%) con saldo > 0 nunca oculta Fotoquimsa pendiente
  const coveredCheck = money.obligationSummary({
    month: "2026-11",
    excludeCoveredByMovements: true,
    costObligations: [
      { id: "ob-foto-prev", concepto: "Factura pagada Fotoquimsa", tipo: "proveedor", montoCentavos: 1500000, saldoCentavos: 0, venceEn: "2026-11-05", estado: "pagada" },
      { id: "ob-foto-open", concepto: "Fotoquimsa SRL", tipo: "proveedor", montoCentavos: 2650000, saldoCentavos: 650000, venceEn: "2026-11-25", emitidaEn: "2026-11-12", estado: "parcial" },
    ],
    costPayments: [
      { id: "cp-foto-1", obligacionId: "ob-foto-open", montoCentavos: 2000000, pagadoEn: "2026-11-14" },
    ],
    movements: [
      { id: "m-foto-prev", tipo: "gasto", estado: "registrado", fecha: "2026-11-05", monto_centavos: 2650000, descripcion: "Pago Fotoquimsa factura anterior", categoria: "Proveedores" },
    ],
  });
  assert.equal(coveredCheck.rows.length, 1);
  assert.equal(coveredCheck.rows[0].id, "legacy:ob-foto-open");
  assert.deepEqual(money.obligationDisplayAmount(coveredCheck.rows[0]), { amount: 650000, verified: true, kind: "balance" });

  // (d) Alias saldoPendienteCentavos en obligaciones legadas
  const aliasCheck = money.obligationSummary({
    month: "2026-11",
    costObligations: [
      { id: "ob-foto-alias", concepto: "Fotoquimsa Crédito", tipo: "proveedor", saldoPendienteCentavos: 1960000, venceEn: "2026-11-30", estado: "pendiente" },
    ],
  });
  assert.equal(aliasCheck.rows.length, 1);
  assert.deepEqual(money.obligationDisplayAmount(aliasCheck.rows[0]), { amount: 1960000, verified: true, kind: "balance" });
});
