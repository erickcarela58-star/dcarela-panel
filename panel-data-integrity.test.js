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
  assert.match(method, /if \(recentWindow && !includeArchives\) return current/);
});

test("los rangos contables unen eventos actuales y archivos retenidos", () => {
  const eventsMethod = panel.slice(panel.indexOf("async function eventos("), panel.indexOf("function eventosDesde"));
  const branchStart = panel.indexOf("async function resumenSucursal");
  const branchMethod = panel.slice(branchStart, panel.indexOf("async function cargarSucursales()", branchStart));
  assert.match(eventsMethod, /includeArchives: Boolean\(from \|\| to\)/);
  assert.match(branchMethod, /includeArchives: true/);
  assert.match(adapter, /const serverFrom = includeArchives \? '' : from/);
  assert.match(adapter, /payload\.vendidaEn \|\| payload\.vendida_en \|\| payload\.fechaEfectiva/);
  assert.match(adapter, /current\.filter\(inRequestedRange\)/);
  assert.match(adapter, /filter\(matchesRequestedType\)/);
  assert.match(eventsMethod, /eventTypes: types \|\| null/);
  assert.match(panel, /eventos\(\["VentaCancelada"\], "2000-01-01T00:00:00\.000Z", new Date\(\)\.toISOString\(\), 1600\)/);
});

test("Money Manager limita el ledger al mes y tolera modulos secundarios", () => {
  const financeMethod = adapter.slice(adapter.indexOf("async getFinanceMovements"), adapter.indexOf("async webSaleAction"));
  assert.match(financeMethod, /getSyncEvents\(businessId, \{ from, to, limit: SYNC_EVENT_MAX_BATCH,[\s\S]{0,120}includeArchives: true, eventTypes: \['LedgerMovimientoRegistrado'\] \}\)/);
  assert.match(panel, /const results = await Promise\.allSettled\(\[/);
  assert.match(panel, /const accounts = required\(0, "las cuentas financieras"\)/);
  assert.match(panel, /const budgets = optional\(4, \[\]\)/);
});

test("cada escritura de Money Manager recarga tambien las ventas proyectadas", () => {
  const rawLoads = [...panel.matchAll(/await cargarCuentasFin\(/g)];
  assert.equal(rawLoads.length, 1, "solo cargarProveedores puede invocar la carga base de Money Manager");
  assert.match(panel, /await adminWrite\("fin\.transfer\.create"[\s\S]{0,700}await cargarProveedores\(true\)/);
  assert.match(panel, /await adminWrite\("fin\.movement\.create"[\s\S]{0,700}await cargarProveedores\(true\)/);
});

test("Finanzas abre en el dia comercial de Santo Domingo y no en UTC", () => {
  assert.match(panel, /let finReferenceDate = "";/);
  assert.match(panel, /finReferenceDate = financeCore\?\.businessDay\(new Date\(\)\) \|\| inputDate\(new Date\(\)\);/);
  assert.doesNotMatch(panel, /let finReferenceDate = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("Finanzas integra las ventas activas del POS y muestra su procedencia", () => {
  const loadAccountsAt = panel.indexOf("await cargarCuentasFin(month);");
  const projectSalesAt = panel.indexOf("integratedSales = financeCore.projectSalePaymentsAsMovements");
  assert.ok(loadAccountsAt >= 0 && projectSalesAt > loadAccountsAt,
    "Money Manager debe cargar antes de proyectar ventas");
  assert.match(panel, /projectSalePaymentsAsMovements\(salesResult\.active, finStateCache\.accounts/);
  assert.match(panel, /finAccountBalance = account => financeCore\.effectiveAccountBalance/);
  assert.match(panel, /finAccountProjectedDelta = account => financeCore\.projectedAccountDeltaForAccount/);
  assert.match(panel, /finStateCache\.accountProjectedMovements = \[/);
  assert.match(panel, /const \[balanceSalesResult, balanceLedgerMovements\] = accountCutoffs\.length/);
  assert.match(panel, /getFinanceLedgerMovements\(BUSINESS/);
  assert.match(panel, /const activeSaleIdentifiers = new Set\(salesResult\.active\.flatMap/);
  assert.match(panel, /finStateCache\.movements = \[\.\.\.baseMovements, \.\.\.integratedSales\]/);
  assert.match(panel, /movement\.origen === "pos_venta" \? "POS Windows"/);
  assert.match(panel, /venta\(s\) integrada\(s\) en Finanzas/);
  assert.match(panel, /financeCore\.deduplicateSales\(notCancelled\)/);
  assert.match(panel, /evento\(s\) duplicado\(s\) ignorado\(s\)/);
});

test("Compromisos recupera las obligaciones historicas sin duplicarlas", () => {
  assert.match(panel, /getCollection\("cost_obligations"/);
  assert.match(panel, /getCollection\("cost_payments"/);
  assert.match(panel, /getCollection\("cost_recurrents"/);
  assert.match(panel, /getCollection\("expenses"/);
  assert.match(panel, /const legacyRows = \(state\.costObligations \|\| \[\]\)\.map/);
  assert.match(panel, /No estan borradas ni se duplicaron como compromisos nuevos/);
  assert.match(panel, /finStateCache\.costObligations = state\.obligations \|\| \[\]/);
  assert.match(panel, /data-fin-legacy-obligation/);
});

test("el analisis mensual usa el mismo libro de gastos que Money Manager", () => {
  assert.match(panel, /const ledgerExpensesTotal = finStateCache[\s\S]{0,120}financeCore\.summarizeMovements/);
  assert.match(panel, /Gastos Money Manager/);
  assert.match(panel, /const net = salesTotal - ledgerExpensesTotal/);
});
