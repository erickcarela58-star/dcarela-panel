const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const html = fs.readFileSync("panel.html", "utf8");
const panel = fs.readFileSync("panel.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const shellAsset = index.match(/shell-assets\/(index-[^"']+\.js)/)?.[1];
assert.ok(shellAsset, "La portada debe referenciar el shell compilado");
const shell = fs.readFileSync(`shell-assets/${shellAsset}`, "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("Caja virtual es un modulo visible en shell, panel y movil", () => {
  assert.match(shell, /id:`caja-virtual`,label:`Caja virtual`,caption:`Terminal web completa`/);
  assert.match(shell, /`caja-virtual`/);
  assert.match(html, /id="v-caja-virtual"/);
  assert.match(html, /href="#caja-virtual"/);
  assert.match(html, /id="btnVirtualCashOut"/);
});

test("Caja virtual consume el resumen real y movimientos auditados", () => {
  assert.match(panel, /"caja-virtual": cargarCajaVirtual/);
  assert.match(panel, /saleApi\("cash\.move"/);
  assert.match(panel, /summary\.expectedCashCentavos/);
  assert.match(sw, /const APP_BUILD = "2026\.\d{2}\.\d{2}\.1\.0\.\d+\.\d+"/);
  assert.match(sw, new RegExp(shellAsset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Caja virtual replica F1-F12 y protege el esperado durante el conteo", () => {
  for (let key = 1; key <= 12; key += 1) assert.match(panel, new RegExp(`"F${key}"`));
  assert.match(panel, /CHANGE_LINE: "change-line"/);
  assert.match(panel, /CASH_IN: "cash-in"/);
  assert.match(panel, /CASH_OUT: "cash-out"/);
  assert.match(panel, /WHOLESALE: "wholesale"/);
  assert.match(panel, /submitSale\(null, shortcut\.action === SALE_SHORTCUT_ACTIONS\.SUBMIT_PRINT\)/);
  assert.doesNotMatch(panel, /id="conteoEsperado"/);
  assert.doesNotMatch(panel, /Esperado por el sistema/);
  assert.match(html, /id="btnSaleSubmitPrint"/);
  assert.match(html, /id="btnSaleWholesale"/);
  assert.match(html, /class="sale-desktop-nav"/);
  assert.match(html, /class="sale-cart-table-head"/);
  assert.match(html, /COBRAR \(F12\)/);
  assert.match(panel, /latestActiveSaleEvent/);
  assert.match(panel, /selected === "caja-virtual"/);
});

test("Nueva venta muestra el turno antes de terminar el catalogo historico", () => {
  assert.match(panel, /renderSaleShift\(\);\s*renderSaleCart\(\);\s*const failures/s);
  assert.match(panel, /cargarCatalogoCloud\(\)\s*\.then\(\(\) => renderSaleProducts\(\)\)/s);
  assert.match(panel, /eventos\(\["ProductoCreado"[\s\S]+?null, null, 3000\)/);
  assert.doesNotMatch(panel, /await Promise\.all\(\[cargarCatalogoCloud\(\), cargarClientesCloud\(\)/);
});

test("Cuentas y tarjetas exponen signo, jerarquia y contraste en ambos temas", () => {
  assert.match(panel, /fin-account-sign/);
  assert.match(panel, /Disponible/);
  assert.match(panel, /Negativo/);
  assert.match(panel, /Sin deuda/);
  const theme = fs.readFileSync("panel-theme.css", "utf8");
  assert.match(theme, /color-mix\(in srgb, var\(--account-primary\) 62%, #101114\)/);
  assert.match(theme, /fin-account-balance-row/);
  assert.match(theme, /fin-account\.visual:not\(\.outline\).*color: #fff/s);
});

test("Finanzas rastrea transferencias pendientes sin alterar el saldo", () => {
  assert.match(html, /id="finTransferenciasPendientes"/);
  assert.match(html, /id="btnFinNuevaPendiente"/);
  assert.match(panel, /fin_transferencias_pendientes/);
  assert.match(panel, /fin\.pending_transfer\.confirm/);
  assert.match(panel, /no duplica el movimiento financiero original/i);
});
