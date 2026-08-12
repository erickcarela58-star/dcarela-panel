const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const css = fs.readFileSync("visual-fidelity.css", "utf8");
const enhancer = fs.readFileSync("visual-fidelity.js", "utf8");
const panel = fs.readFileSync("panel.js", "utf8");
const shell = fs.readFileSync("index.html", "utf8");
const mobile = fs.readFileSync("mobile/index.html", "utf8");

test("las metricas CURRENT cargan la capa visual en escritorio y movil", () => {
  assert.match(shell, /visual-fidelity\.css\?v=1\.0\.35\.5/);
  assert.match(shell, /visual-fidelity\.js\?v=1\.0\.35\.5/);
  assert.match(mobile, /\.\.\/visual-fidelity\.css\?v=1\.0\.34/);
  assert.match(mobile, /\.\.\/visual-fidelity\.js\?v=1\.0\.34/);
});

test("las ondas tienen degradado, linea interior clara y animacion accesible", () => {
  assert.match(enhancer, /current-metric-inner/);
  assert.match(enhancer, /stop-opacity", "\.62"/);
  assert.match(css, /--metric-inner-stroke: rgba\(255, 255, 255, \.96\)/);
  assert.match(css, /@keyframes current-metric-draw/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("reportes y finanzas usan areas SVG degradadas reales", () => {
  assert.match(panel, /linearGradient id="\$\{gradientId\}"/);
  assert.match(panel, /linearGradient id="reportNetArea"/);
  assert.match(panel, /--wave-fill:url\(#\$\{gradientId\}\)/);
  assert.match(panel, /--report-wave-fill:url\(#reportNetArea\)/);
});
