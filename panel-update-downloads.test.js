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
  assert.match(shellHtml, /updates-downloads-current\.js\?v=1\.0\.35\.1/);
  assert.match(shellHtml, /updates-downloads-current\.css\?v=1\.0\.35\.1/);
  assert.match(currentDownloadsJs, /id = "current-downloads"|ROOT_ID = "current-downloads"/);
  assert.match(currentDownloadsJs, /Abrir centro web completo/);
  assert.match(currentDownloadsJs, /current-legacy-download-link/);
  assert.match(currentDownloadsJs, /Descargas disponibles/);
});

test("el manifiesto publica EXE, ZIP e IPA con integridad verificable", () => {
  assert.equal(manifest.web_version, "1.0.35.1");
  assert.equal(manifest.desktop_release.version, "1.0.35");
  assert.equal(manifest.downloads.length, 3);
  assert.deepEqual(manifest.downloads.map(file => file.extension), ["EXE", "ZIP", "IPA"]);
  for (const file of manifest.downloads) {
    assert.match(file.url, /^https:\/\/github\.com\/erickcarela58-star\/dcarela-panel\/releases\/download\//);
    assert.doesNotMatch(file.url, /dcarela-pos-private/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.size_bytes > 0);
    assert.equal(file.publisher_signature, "not_signed");
    assert.ok(file.installation_method.length > 20);
  }
});

test("Finanzas se ofrece solo como beta manual y el CRM tiene URL operativa", () => {
  const finance = manifest.apps.find(app => app.id === "finanzas-ios");
  const crm = manifest.apps.find(app => app.id === "crm");
  assert.ok(finance);
  assert.equal(finance.status, "beta_unsigned");
  assert.match(finance.url, /finanzas-ios-1\.2\.2-beta\/DCarelaFinanzas\.ipa$/);
  assert.equal(crm.status, "published");
  assert.equal(crm.url, "https://erickcarela58-star.github.io/dcarela-crm-panel/");
});

test("Brújula no se presenta como instalada antes de compilar y firmar", () => {
  const brujula = manifest.apps.find(app => app.id === "brujula");
  assert.equal(brujula.status, "build_pending");
  assert.equal(brujula.url, null);
});
