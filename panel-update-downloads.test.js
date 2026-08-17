const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const panelHtml = fs.readFileSync(path.join(root, "panel.html"), "utf8");
const panelJs = fs.readFileSync(path.join(root, "panel.js"), "utf8");
const shellHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const currentDownloadsJs = fs.readFileSync(path.join(root, "updates-downloads-current.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "app-version.json"), "utf8"));

test("Actualizaciones contiene un bloque visible de archivos descargables", () => {
  assert.match(panelHtml, />Actualizaciones<\/a>/);
  assert.match(panelHtml, /id="updateDownloads"/);
  assert.match(panelHtml, /Descargas disponibles/);
  assert.match(panelJs, /function renderDescargasAplicacion\(/);
  assert.match(panelJs, /Sin certificado de editor/);
});

test("la vista CURRENT muestra las descargas sin abrir el panel anterior", () => {
  assert.match(shellHtml, /mobile/);
  assert.doesNotMatch(shellHtml, /shell-assets|iframe/i);
  assert.match(panelHtml, /id="updateDownloads"/);
  assert.match(currentDownloadsJs, /id = "current-downloads"|ROOT_ID = "current-downloads"/);
  assert.match(currentDownloadsJs, /Abrir centro web completo/);
  assert.match(currentDownloadsJs, /current-legacy-download-link/);
  assert.match(currentDownloadsJs, /Descargas disponibles/);
});

test("el manifiesto publica dos EXE y las dos IPA con integridad verificable", () => {
  assert.equal(manifest.web_version, "1.0.44.0");
  assert.equal(manifest.desktop_release.version, "1.0.44");
  assert.equal(manifest.downloads.length, 3);
  for (const file of manifest.downloads) {
    assert.match(file.url, /^(?:https:\/\/github\.com\/erickcarela58-star\/(?:dcarela-panel|carela-compufoto)\/releases\/download\/|https:\/\/panel\.dcarelacompufoto\.com\/ios-releases\/)/);
    assert.doesNotMatch(file.url, /dcarela-pos-private/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.size_bytes > 0);
    assert.equal(file.publisher_signature, "not_signed");
    assert.ok(file.installation_method.length > 20);
  }
});

test("Finanzas publica el diagnostico 5.0.0 y los dos CRM apuntan a v18", () => {
  const finance = manifest.apps.find(app => app.id === "finanzas-ios" || app.id === "com.dcarela.panel");
  assert.ok(finance);
  assert.equal(finance.status, "published");
  assert.equal(finance.version, "6.1.1 (build 619)");
  assert.match(finance.url, /DCarelaFinanzas-.*\.ipa$/);
});

test("Brújula publica el diagnostico 3.1.0 build 310 verificable", () => {
  const brujula = manifest.apps.find(app => app.id === "brujula");
  assert.equal(brujula.status, "published");
  assert.equal(brujula.version, "5.0.0 (build 476)");
  assert.match(brujula.url, /Brujula-.*\.ipa$/);
});
