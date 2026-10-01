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
  assert.match(panel, /financeLoad = cargarProveedoresData\(force\)\.catch/);
  assert.match(adapter, /setTimeout\(\(\) => reject\(Object\.assign\(/);
  assert.match(adapter, /La consulta tardo demasiado/);
});

test("el resumen no deja paneles en blanco cuando la consulta tarda o falla", () => {
  assert.match(panel, /estadoDashboard\("Consultando ventas, caja y actividad\.\.\."\)/);
  assert.match(panel, /Promise\.allSettled\(\[/);
  assert.match(panel, /if \(salesResult\.status === "rejected"\) throw salesResult\.reason;/);
  assert.doesNotMatch(panel, /ventasActivas\(from, to, 5000\)\.catch\(\(\) => \(\{ active: \[\], excluded: 0 \}\)\)/);
  assert.doesNotMatch(panel, /\$\{activeDevices \|\| 1\} activo\(s\)/);
  assert.match(panel, /estadoDashboard\("No se pudo comprobar la información actual\."\s*,\s*"Reintentar"\)/);
  assert.match(panel, /\["kVenta", "kNum", "kProm", "kEfec", "kItbis", "kCaja"\][\s\S]*textContent = "--"/);
});

test("el guardado financiero ignora un segundo submit mientras la escritura está en curso", () => {
  assert.match(panel, /const button = \$\("btnGuardarEditor"\);\s*if \(button\.disabled\) return;/);
});

test("las entradas no dependen de que exista un catalogo de ingresos", () => {
  assert.match(panel, /type === "ingreso" \? "Sin categoria \(opcional\)"/);
  assert.match(panel, /type === "gasto" \? " required" : ""/);
  assert.match(panel, /categoryInput\.required = nuevo === "gasto"/);
});

test("la venta web conserva la cuenta bancaria dentro de cada transferencia", () => {
  assert.match(panel, /const transferAmount = payments\.filter\(payment => payment\.metodo === "transferencia"\)/);
  assert.match(panel, /cuentaFinancieraId: transferAccountId, cuentaFinancieraNombre: transferAccount\?\.nombre/);
});

test("el service worker conserva la última pantalla si el HTML tarda", () => {
  assert.match(serviceWorker, /Promise\.race\(\[network, new Promise/);
  assert.match(serviceWorker, /timer = setTimeout\(\(\) => resolve\(cached\), 2500\)/);
  assert.match(serviceWorker, /url\.searchParams\.has\("v"\)/);
});
