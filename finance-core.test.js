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

test("proyecta ventas POS como ingresos de solo lectura sin perder centavos", () => {
  const movements = core.projectSalesAsMovements([{
    event_id: "evt-1", entity_id: "sale-1", business_id: "dcarela",
    created_at_local: "2026-08-30T21:45:00-04:00",
    payload: { folio: 27354, totalCobradoCentavos: 371263, clienteNombre: "Cliente prueba" }
  }], { accountId: "cuenta-ventas" });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].tipo, "ingreso");
  assert.equal(movements[0].monto_centavos, 371263);
  assert.equal(movements[0].fecha, "2026-08-30");
  assert.equal(movements[0].cuenta_id, "cuenta-ventas");
  assert.equal(movements[0].solo_lectura, true);
});

test("integra ventas al tablero una sola vez si ya existe su movimiento", () => {
  const sale = {
    event_id: "evt-venta-2", entity_id: "sale-2", created_at_local: "2026-08-30T18:00:00-04:00",
    payload: { folio: "27355", total_centavos: 125050 }
  };
  const existing = [{
    id: "mov-1", tipo: "ingreso", estado: "registrado", fecha: "2026-08-30",
    monto_centavos: 125050, venta_folio: "27355", origen: "panel"
  }];
  const merged = core.mergeSalesIntoMovements(existing, [sale]);
  assert.equal(merged.length, 1);
  assert.equal(core.summarizeMovements(merged).ingresos_centavos, 125050);
});

test("integra ventas distintas y evita duplicarlas en recargas sucesivas", () => {
  const sales = [
    { event_id: "evt-a", entity_id: "sale-a", created_at_local: "2026-08-30T10:00:00-04:00", payload: { folio: 1, totalCentavos: 10000 } },
    { event_id: "evt-b", entity_id: "sale-b", created_at_local: "2026-08-30T11:00:00-04:00", payload: { folio: 2, totalCentavos: 20505 } },
  ];
  const once = core.mergeSalesIntoMovements([], sales);
  const twice = core.mergeSalesIntoMovements(once, sales);
  assert.equal(twice.length, 2);
  assert.equal(core.summarizeMovements(twice).ingresos_centavos, 30505);
});

test("ignora rescates duplicados de una venta por terminal y folio", () => {
  const sales = [
    { event_id: "original", entity_id: "venta-original", device_id: "caja-1", created_at_local: "2026-08-29T10:00:00-04:00", payload: { folio: 27507, totalCentavos: 12000 } },
    { event_id: "rescate", entity_id: "venta-rescatada", device_id: "caja-1", created_at_local: "2026-08-29T10:00:00-04:00", payload: { folio: 27507, totalCentavos: 12000 } },
  ];
  const unique = core.deduplicateSales(sales);
  assert.equal(unique.length, 1);
  assert.equal(core.saleAmount(unique[0]), 12000);
});

test("conserva folios iguales de terminales diferentes", () => {
  const sales = [
    { event_id: "sucursal-a", entity_id: "venta-a", device_id: "caja-a", payload: { folio: 15, totalCentavos: 10000 } },
    { event_id: "sucursal-b", entity_id: "venta-b", device_id: "caja-b", payload: { folio: 15, totalCentavos: 20000 } },
  ];
  assert.equal(core.deduplicateSales(sales).length, 2);
});

test("lee ventas Firebase cuando payload llega serializado como JSON", () => {
  const movements = core.projectSalesAsMovements([{
    event_id: "evt-json", entity_id: "sale-json", created_at_local: "2026-08-30T20:00:00-04:00",
    payload: JSON.stringify({ folio: 27356, totalCobradoCentavos: 6651000, vendidaEn: "2026-08-30T20:00:00-04:00" })
  }]);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].monto_centavos, 6651000);
  assert.equal(movements[0].fecha, "2026-08-30");
});

test("una recarga reemplaza la proyeccion anterior sin conservar ventas obsoletas", () => {
  const previous = [{ id: "pos-sale:vieja", tipo: "ingreso", fecha: "2026-08-01", monto_centavos: 99900, origen: "pos_venta" }];
  const fresh = [{ event_id: "nueva", entity_id: "venta-nueva", created_at_local: "2026-08-30T18:00:00-04:00", payload: { folio: 20, totalCentavos: 45015 } }];
  const merged = core.mergeSalesIntoMovements(previous, fresh);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].monto_centavos, 45015);
  assert.equal(merged[0].id.includes("nueva"), true);
});

test("sustituye un marcador ledger sin importe por la venta POS completa", () => {
  const marker = [{
    id: "ledger-vacio", sync_event_id: "evt-sale", tipo: "gasto", fecha: "2026-08-30",
    monto_centavos: 0, origen: "pos", descripcion: "Marcador de sincronizacion"
  }];
  const sales = [{
    event_id: "evt-sale", entity_id: "sale-500", created_at_local: "2026-08-30T18:00:00-04:00",
    payload: { folio: 500, totalCentavos: 4501500 }
  }];
  const merged = core.mergeSalesIntoMovements(marker, sales);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].origen, "pos_venta");
  assert.equal(merged[0].monto_centavos, 4501500);
});
