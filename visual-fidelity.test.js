const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const themeCss = fs.readFileSync("panel-theme.css", "utf8");
const panelJs = fs.readFileSync("panel.js", "utf8");
const panelHtml = fs.readFileSync("panel.html", "utf8");
const mobileHtml = fs.readFileSync("mobile/index.html", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");
const appVersion = JSON.parse(fs.readFileSync("app-version.json", "utf8"));

test("las metricas y graficos cargan la capa visual unificada en escritorio y movil", () => {
  assert.ok(panelHtml.includes(`panel-theme.css?v=${appVersion.build}`));
  assert.match(indexHtml, /shell-assets\/index-[^"']+\.css/);
  assert.match(mobileHtml, /assets\/index-[^"']+\.css/);
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

test("los controles, modales, teclado y acciones de tabla conservan contraste accesible en tema claro y oscuro", () => {
  assert.match(themeCss, /\.primary,\s*\.button-link\s*\{\s*color:\s*var\(--ui-canvas\)/);
  assert.match(themeCss, /\.itbis-opt\.act\s*\{[\s\S]*?color:\s*var\(--ui-canvas\)/);
  assert.doesNotMatch(panelJs, /class="itbis-opt[^"]*"[^>]*background:var\(--navy/);
  assert.match(themeCss, /\.fin-quick-types button\.act\s*\{[\s\S]*?color:\s*var\(--ui-canvas\)/);
  assert.match(themeCss, /\.fin-number-pad button\s*\{[\s\S]*?color:\s*var\(--ui-text\)/);
  assert.match(themeCss, /html\[data-theme="light"\] \.editor-dialog\s*\{\s*background:\s*rgba\(255,\s*255,\s*255/);
  assert.match(themeCss, /\.table-actions button\s*\{[\s\S]*?color:\s*var\(--ui-text\)/);
});

