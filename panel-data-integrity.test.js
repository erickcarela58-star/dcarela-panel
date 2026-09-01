const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");

const panel = fs.readFileSync(__dirname + "/panel.js", "utf8");
const adapter = fs.readFileSync(__dirname + "/firebase-adapter.js", "utf8");
const shell = fs.readFileSync(__dirname + "/shell-assets/index-a8e27158.js", "utf8");
const mobile = fs.readFileSync(__dirname + "/mobile/assets/index-7e44ede9.js", "utf8");

test("el resumen solicita la ventana completa y agrupa ventas por el dia comercial", () => {
  for (const bundle of [shell, mobile]) {
    assert.match(bundle, /getSyncEvents\(o,\{from:c\.toISOString\(\),to:\(new Date\)\.toISOString\(\),limit:5e3\}\)/);
    assert.match(bundle, /DcarelaFinanceCore\.eventDay\(e\)/);
    assert.doesNotMatch(bundle, /getSyncEvents\(o\)/);
  }
});

test("una caja atrasada no se presenta como un dia sin ventas", () => {
  for (const bundle of [shell, mobile]) {
    assert.match(bundle, /ge\?`Todavia no hay ventas validas hoy\.`:`No hay datos de ventas sincronizados para hoy\.`/);
  }
});

test("el panel compara fechas como instantes y no como textos local contra UTC", () => {
  const eventsMethod = panel.slice(panel.indexOf("async function eventos("), panel.indexOf("async function cargarRolEdicion"));
  assert.match(eventsMethod, /eventoEnRango\(item, from, to\)/);
  assert.doesNotMatch(eventsMethod, /String\(item\.created_at_local \|\| ""\) >= from/);
});

test("finanzas normaliza estados y no usa RPC de otro proveedor en sesion Firebase", () => {
  assert.match(panel, /movements: movs\.map\(item => financeCore\.normalizeMovement\(item\)\)/);
  assert.match(panel, /financeCore\.summarizeMovements\(state\.movements, range\.from, range\.to\)/);
  assert.match(panel, /if \(authProvider !== "firebase" && sb\)/);
  assert.match(adapter, /String\(payload\.tipo \|\| 'gasto'\)\.trim\(\)\.toLowerCase\(\)/);
});

test("las consultas recientes no vuelven a descargar archivos historicos", () => {
  const method = adapter.slice(adapter.indexOf("async getSyncEvents"), adapter.indexOf("async getSales"));
  assert.match(method, /if \(recentWindow\) return current/);
});

test("Money Manager limita el ledger al mes y tolera modulos secundarios", () => {
  const financeMethod = adapter.slice(adapter.indexOf("async getFinanceMovements"), adapter.indexOf("async webSaleAction"));
  assert.match(financeMethod, /getSyncEvents\(businessId, \{ from, to, limit: SYNC_EVENT_MAX_BATCH \}\)/);
  assert.match(panel, /const results = await Promise\.allSettled\(\[/);
  assert.match(panel, /const accounts = required\(0, "las cuentas financieras"\)/);
  assert.match(panel, /const budgets = optional\(4, \[\]\)/);
});

test("Finanzas abre en el dia comercial de Santo Domingo y no en UTC", () => {
  assert.match(panel, /let finReferenceDate = "";/);
  assert.match(panel, /finReferenceDate = financeCore\?\.businessDay\(new Date\(\)\) \|\| inputDate\(new Date\(\)\);/);
  assert.doesNotMatch(panel, /let finReferenceDate = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("Finanzas integra las ventas activas del POS y muestra su procedencia", () => {
  const loadAccountsAt = panel.indexOf("await cargarCuentasFin(month);");
  const projectSalesAt = panel.indexOf("integratedSales = salesResult.active.flatMap");
  assert.ok(loadAccountsAt >= 0 && projectSalesAt > loadAccountsAt,
    "Money Manager debe cargar antes de proyectar ventas");
  assert.match(panel, /const amount = totalDe\(payload\)/);
  assert.match(panel, /origen: "pos_venta"/);
  assert.match(panel, /const activeSaleIdentifiers = new Set\(salesResult\.active\.flatMap/);
  assert.match(panel, /finStateCache\.movements = \[\.\.\.baseMovements, \.\.\.integratedSales\]/);
  assert.match(panel, /movement\.origen === "pos_venta" \? "POS Windows"/);
  assert.match(panel, /venta\(s\) integrada\(s\) en Finanzas/);
  assert.match(panel, /financeCore\.deduplicateSales\(notCancelled\)/);
  assert.match(panel, /evento\(s\) duplicado\(s\) ignorado\(s\)/);
});
