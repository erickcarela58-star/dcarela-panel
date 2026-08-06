const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const panelJs = fs.readFileSync(path.join(root, "panel.js"), "utf8");
const themeCss = fs.readFileSync(path.join(root, "panel-theme.css"), "utf8");

test("el iframe embebido conserva el tema del shell", () => {
  assert.match(panelJs, /if \(!EMBEDDED\) await cargarTemaUsuario\(\)/);
  assert.match(panelJs, /event\.data\?\.type !== "dcarela:theme"/);
});

test("el asistente define superficies claras y texto visible del modelo", () => {
  assert.match(themeCss, /html\[data-theme="light"\] #v-asistente[\s\S]*assistant-layout/);
  assert.doesNotMatch(
    themeCss.slice(themeCss.indexOf("Assistant theme contract v41")),
    /data-theme="light"\]\.embedded-panel/,
  );
  assert.match(themeCss, /background-color: #f4f4f5 !important/);
  assert.match(themeCss, /assistant-messages[\s\S]*background: #f4f4f5 !important/);
  assert.match(themeCss, /assistant-model select option[\s\S]*color: var\(--ui-text\)/);
  assert.match(themeCss, /-webkit-text-fill-color: currentColor/);
});
