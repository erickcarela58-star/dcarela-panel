const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const panel = fs.readFileSync("panel.js", "utf8");
const adapter = fs.readFileSync("firebase-adapter.js", "utf8");
const serviceWorker = fs.readFileSync("sw.js", "utf8");

test("la carga de módulos conserva la vista y ofrece reintento", () => {
  assert.match(panel, /const moduleLoads = new Map\(\)/);
  assert.match(panel, /status\.textContent = "No se pudo actualizar\. "/);
  assert.match(panel, /retry\.textContent = "Reintentar"/);
  assert.match(panel, /cargarModulo\(view\)\.catch\(\(\) => \{\}\)/);
});

test("las consultas compartidas terminan y no se acumulan al cambiar de módulo", () => {
  assert.match(panel, /let financeLoad = null/);
  assert.match(panel, /financeLoad = cargarProveedoresData\(force\)\.finally/);
  assert.match(adapter, /setTimeout\(\(\) => reject\(Object\.assign\(/);
  assert.match(adapter, /La consulta tardo demasiado/);
});

test("el guardado financiero ignora un segundo submit mientras la escritura está en curso", () => {
  assert.match(panel, /const button = \$\("btnGuardarEditor"\);\s*if \(button\.disabled\) return;/);
});

test("el service worker conserva la última pantalla si el HTML tarda", () => {
  assert.match(serviceWorker, /Promise\.race\(\[network, new Promise/);
  assert.match(serviceWorker, /timer = setTimeout\(\(\) => resolve\(cached\), 2500\)/);
  assert.match(serviceWorker, /url\.searchParams\.has\("v"\)/);
});
