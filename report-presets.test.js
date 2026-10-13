const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const panelJs = fs.readFileSync(path.join(root, "panel.js"), "utf8");
const panelHtml = fs.readFileSync(path.join(root, "panel.html"), "utf8");

test("Reportes ofrece periodos rápidos que llenan Desde/Hasta y regeneran el reporte", () => {
  for (const rango of ["hoy", "semana", "mes", "mes-anterior"]) {
    assert.match(panelHtml, new RegExp(`data-report-rango="${rango}"`));
  }
  const bloque = panelJs.slice(panelJs.indexOf('querySelectorAll("[data-report-rango]")'));
  assert.match(bloque.slice(0, 1400), /\$\("repDesde"\)\.value = desde/);
  assert.match(bloque.slice(0, 1400), /\$\("repHasta"\)\.value = hasta/);
  assert.match(bloque.slice(0, 1400), /cargarReporte\(true\)/);
});

test("las fechas de los periodos rápidos son las del calendario local", () => {
  const inputDate = date => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const rangos = hoy => {
    const dia = (anio, mes, d) => inputDate(new Date(anio, mes, d, 12));
    return {
      semana: [dia(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7)), dia(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())],
      "mes-anterior": [dia(hoy.getFullYear(), hoy.getMonth() - 1, 1), dia(hoy.getFullYear(), hoy.getMonth(), 0)],
    };
  };
  // martes 13/10/2026: la semana empieza el lunes 12; el mes anterior es septiembre completo.
  assert.deepEqual(rangos(new Date(2026, 9, 13, 9)).semana, ["2026-10-12", "2026-10-13"]);
  assert.deepEqual(rangos(new Date(2026, 9, 13, 9))["mes-anterior"], ["2026-09-01", "2026-09-30"]);
  // domingo 11/10/2026 pertenece a la semana que empezó el lunes 5; enero mira a diciembre.
  assert.deepEqual(rangos(new Date(2026, 9, 11, 9)).semana, ["2026-10-05", "2026-10-11"]);
  assert.deepEqual(rangos(new Date(2027, 0, 15, 9))["mes-anterior"], ["2026-12-01", "2026-12-31"]);
});

test("el manejador de periodos usa el mismo cálculo que el contrato probado", () => {
  assert.match(panelJs, /\(hoy\.getDay\(\) \+ 6\) % 7/);
  assert.match(panelJs, /dia\(hoy\.getFullYear\(\), hoy\.getMonth\(\) - 1, 1\), dia\(hoy\.getFullYear\(\), hoy\.getMonth\(\), 0\)/);
});
