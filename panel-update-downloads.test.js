const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const panelHtml = fs.readFileSync(path.join(root, "panel.html"), "utf8");
const panelJs = fs.readFileSync(path.join(root, "panel.js"), "utf8");
const shellHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "app-version.json"), "utf8"));

test("Actualizaciones contiene un bloque visible de archivos descargables", () => {
  assert.match(panelHtml, />Actualizaciones<\/a>/);
  assert.match(panelHtml, /id="updateDownloads"/);
  assert.match(panelHtml, /Descargas disponibles/);
  assert.match(panelJs, /function renderDescargasAplicacion\(/);
  assert.match(panelJs, /Sin certificado de editor/);
});

test("la vista principal muestra la aplicacion completa de forma standalone", () => {
  assert.match(shellHtml, /D' Carela Compufoto \| Panel POS 1\.0\.44/);
  assert.doesNotMatch(shellHtml, /shell-assets|iframe/i);
  assert.match(panelHtml, /id="updateDownloads"/);
  assert.match(panelJs, /function renderDescargasAplicacion\(/);
});

test("el manifiesto publica los instaladores de escritorio e iOS con integridad verificable", () => {
  assert.equal(manifest.web_version, "1.0.44");
  assert.equal(manifest.desktop_release.version, "1.0.44");
  assert.ok(manifest.downloads.length >= 2);
  for (const file of manifest.downloads) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.size_bytes > 0);
  }
});
