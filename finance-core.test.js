const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./finance-core.js");

test("agrupa ventas por el dia comercial de Santo Domingo", () => {
  assert.equal(core.businessDay("2026-08-31T01:30:00.000Z"), "2026-08-30");
  assert.equal(core.eventDay({ payload: { vendidaEn: "2026-08-30T21:30:00-04:00" } }), "2026-08-30");
});

test("normaliza movimientos Windows y excluye anulados de las sumas", () => {
  const summary = core.summarizeMovements([
    { tipo: "GASTO", estado: "CONFIRMADO", fecha: "2026-08-30", monto_centavos: 50000 },
    { tipo: "INGRESO", estado: "registrado", fecha: "2026-08-30", monto_centavos: 125000 },
    { tipo: "gasto", estado: "anulado", fecha: "2026-08-30", monto_centavos: 900000 },
    { tipo: "TRANSFERENCIA", estado: "registrado", fecha: "2026-08-30", monto_centavos: 25000 },
  ], "2026-08-30", "2026-08-30");
  assert.equal(summary.ingresos_centavos, 125000);
  assert.equal(summary.gastos_centavos, 50000);
  assert.equal(summary.movements.length, 3);
});

test("las transferencias no inflan ingresos ni gastos", () => {
  const summary = core.summarizeMovements([
    { tipo: "transferencia", fecha: "2026-08-30", monto_centavos: 100000, estado: "registrado" },
  ]);
  assert.equal(summary.ingresos_centavos, 0);
  assert.equal(summary.gastos_centavos, 0);
});

test("un movimiento confirmado en mayusculas conserva fecha y signo", () => {
  const movement = core.normalizeMovement({
    tipo: "SALIDA", estado: "CONFIRMADO", fecha: "2026-08-30T01:15:00-04:00", montoCentavos: "26000"
  });
  assert.equal(movement.tipo, "gasto");
  assert.equal(movement.estado, "confirmado");
  assert.equal(movement.fecha, "2026-08-30");
  assert.equal(movement.monto_centavos, 26000);
  assert.equal(core.isActiveMovement(movement), true);
});
