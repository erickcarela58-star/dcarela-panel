const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const panelJs = fs.readFileSync("panel.js", "utf8").replace(/\r\n/g, "\n");
const catalog = panelJs.match(/const FIN_BANK_BRANDS = \[[\s\S]*?\n  \];/)[0];
const helpers = panelJs.match(/const finPlainText[\s\S]*?\n  function finBankBrand[\s\S]*?\n  }\n/)[0];
const identify = new Function(`${catalog}\n${helpers}\nreturn finBankBrand;`)();

test("el panel reconoce los bancos de RD por el nombre de la cuenta", () => {
  assert.equal(identify("Banco Popular").id, "popular");
  assert.equal(identify("Cuenta Corriente Qik").id, "qik");
  assert.equal(identify("Tarjeta de Credito Qik").id, "qik");
  assert.equal(identify("BanReservas Nómina").id, "banreservas");
  assert.equal(identify("BHD León").id, "bhd");
  assert.equal(identify("Asociación Popular").id, "asociacion-popular");
  assert.equal(identify("Efectivo"), null);
  assert.equal(identify(""), null);
});

test("los logos de los bancos existen y el render los usa", () => {
  for (const file of ["popular", "qik", "banreservas", "bhd"]) assert.ok(fs.existsSync(`bancos/${file}.png`), file);
  assert.match(panelJs, /fin-bank-logo/);
});
