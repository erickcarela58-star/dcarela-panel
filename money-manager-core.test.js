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
