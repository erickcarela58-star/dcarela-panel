const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");

const html = fs.readFileSync(__dirname + "/panel.html", "utf8");
const script = fs.readFileSync(__dirname + "/panel.js", "utf8");
const css = fs.readFileSync(__dirname + "/panel.css", "utf8");
const desktopShell = fs.readFileSync(__dirname + "/shell-assets/index-a8e27158.js", "utf8");
const mobileShell = fs.readFileSync(__dirname + "/mobile/assets/index-7e44ede9.js", "utf8");

test("Money Manager es un modulo separado en panel, barra lateral y telefono", () => {
  assert.match(html, /href="#money-manager"[^>]*data-title="Money Manager"/);
  assert.match(html, /id="v-money-manager"/);
  assert.match(html, /class="mobile-command-dock"[\s\S]*href="#money-manager"/);
  assert.match(html, /&#128055;/);
  assert.match(script, /"money-manager": cargarMoneyManager/);
  assert.match(desktopShell, /id:`money-manager`/);
  assert.match(mobileShell, /id:`money-manager`/);
});

test("el modulo ofrece registro manual, calendario, cuentas, tarjetas, pagos y respaldo", () => {
  for (const id of ["btnMmExpense", "btnMmIncome", "btnMmTransfer", "btnMmReconcile", "mmCalendar", "mmMovements", "mmAccounts", "mmObligations", "btnMmBackup"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /abrirMovimientoFin\("gasto"\)/);
  assert.match(script, /abrirMovimientoFin\("ingreso"\)/);
  assert.match(script, /abrirTransferenciaFin/);
  assert.match(script, /abrirConciliacionCuentaFin/);
  assert.match(script, /generarObligacionesWeb/);
});

test("el libro distingue ventas, cierres de caja, movimientos manuales y conciliaciones", () => {
  assert.match(script, /Ventas automáticas/);
  assert.match(script, /Efectivo a entregar/);
  assert.match(script, /Efectivo contado/);
  assert.match(script, /MM_SOURCE_LABEL/);
  assert.match(script, /moneyManagerCore\.obligationSummary/);
  assert.match(script, /accountBalanceMovements/);
});

test("Money Manager adapta tarjetas, filtros, calendario y barra inferior al telefono", () => {
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.money-manager-primary-actions/);
  assert.match(css, /\.money-manager-calendar-surface \{ overflow-x: auto; \}/);
  assert.match(css, /\.mobile-command-dock \{ overflow-x: auto;/);
  assert.match(css, /\.money-manager-accounts \{ grid-template-columns: 1fr; \}/);
});

test("recarga cierres desde el loader comun y escucha cambios en la ruta nueva", () => {
  const loader = script.slice(script.indexOf("async function cargarProveedores"), script.indexOf("function readSet"));
  assert.match(loader, /finStateCache\.shiftClosings = \(await eventos\(\["CajaCerrada"\], from, to/);
  const refresh = script.slice(script.indexOf("function scheduleLiveRefresh"), script.indexOf("function conectarRealtime"));
  assert.match(refresh, /"money-manager"/);
  assert.match(script, /await cargarMoneyManager\(true\)\.catch/);
});

test("la exportacion usa los filtros visibles de Money Manager y no promete respaldo completo", () => {
  assert.match(script, /exportarFinCsv\(filteredMoneyManagerMovements\(\)\)/);
  assert.match(script, /const rows = filteredMoneyManagerMovements\(\)/);
  assert.match(script, /includes_archived_ledger: false/);
  assert.doesNotMatch(html, /Copia verificada/);
});

test("un fallo al cargar deuda nunca se presenta como lista vacia", () => {
  assert.match(script, /const cards = required\(3, "las tarjetas"\)/);
  assert.match(script, /const commitments = required\(7, "los compromisos"\)/);
  assert.match(script, /const commitmentPayments = required\(8, "los abonos de compromisos"\)/);
  assert.match(script, /state\.shiftClosings == null \? "No verificado"/);
});

test("los estilos de pantalla no quedan anidados dentro de impresion", () => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  let depth = 0;
  for (const ch of clean) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    assert.ok(depth >= 0, "Cierre CSS inesperado");
  }
  assert.equal(depth, 0, "Bloque CSS sin cerrar");
});
