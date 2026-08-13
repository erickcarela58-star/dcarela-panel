const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "panel.js"), "utf8");

test("cambiar de sucursal usa la URL sin reescribir la configuracion global", () => {
  const start = source.indexOf("function abrirSucursal(");
  const end = source.indexOf("async function cargarSucursalesDisponibles", start);
  assert.ok(start >= 0 && end > start, "No se encontro el controlador de sucursales");
  const body = source.slice(start, end);
  assert.match(body, /searchParams\.set\("b", businessId\)/);
  assert.doesNotMatch(body, /localStorage\.setItem\("dcarela\.cfg"/);
});

test("consultas y escrituras siguen usando el business de la URL", () => {
  assert.match(source, /const BUSINESS = _urlBiz \|\|/);
  assert.match(source, /body: JSON\.stringify\(\{ business_id: BUSINESS, action/);
  assert.match(source, /filter: `business_id=eq\.\$\{BUSINESS\}`/);
});
