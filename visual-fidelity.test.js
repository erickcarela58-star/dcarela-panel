const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const themeCss = fs.readFileSync("panel-theme.css", "utf8");
const panelJs = fs.readFileSync("panel.js", "utf8");
const panelHtml = fs.readFileSync("panel.html", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");

test("las metricas y graficos cargan la capa visual unificada", () => {
  assert.match(indexHtml, /panel-theme\.css\?v=2026\.08\.17\.1\.0\.44\.1/);
  assert.match(panelHtml, /panel-theme\.css\?v=2026\.08\.17\.1\.0\.44\.1/);
});

test("las ondas tienen degradado, linea interior clara y animacion accesible en el tema", () => {
  assert.match(themeCss, /--metric-inner-stroke: rgba\(255, 255, 255, \.96\)/);
  assert.match(themeCss, /@keyframes current-metric-draw/);
  assert.match(themeCss, /prefers-reduced-motion: reduce/);
});

test("reportes y finanzas usan areas SVG degradadas reales", () => {
  assert.match(panelJs, /linearGradient id="\$\{gradientId\}"/);
  assert.match(panelJs, /linearGradient id="reportNetArea"/);
  assert.match(panelJs, /--wave-fill:url\(#\$\{gradientId\}\)/);
  assert.match(panelJs, /--report-wave-fill:url\(#reportNetArea\)/);
});
