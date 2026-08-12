const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const html = fs.readFileSync("panel.html", "utf8");
const panel = fs.readFileSync("panel.js", "utf8");
const shell = fs.readFileSync("shell-assets/index-Bv7J6p00.js", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("Caja virtual es un modulo visible en shell, panel y movil", () => {
  assert.match(shell, /id:`caja-virtual`,label:`Caja virtual`,caption:`Terminal web completa`/);
  assert.match(shell, /label:`Vender`,onClick:\(\)=>he\(`caja-virtual`\)/);
  assert.match(html, /id="v-caja-virtual"/);
  assert.match(html, /href="#caja-virtual"/);
  assert.match(html, /id="btnVirtualCashOut"/);
});

test("Caja virtual consume el resumen real y movimientos auditados", () => {
  assert.match(panel, /"caja-virtual": cargarCajaVirtual/);
  assert.match(panel, /saleApi\("cash\.move"/);
  assert.match(panel, /summary\.expectedCashCentavos/);
  assert.match(sw, /2026\.08\.12\.caja-virtual-v2/);
});
