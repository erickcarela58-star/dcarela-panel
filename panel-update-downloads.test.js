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
  assert.match(shellHtml, /updates-downloads-current\.js\?v=1\.0\.43/);
  assert.match(shellHtml, /updates-downloads-current\.css\?v=1\.0\.43/);
  assert.match(currentDownloadsJs, /id = "current-downloads"|ROOT_ID = "current-downloads"/);
  assert.match(currentDownloadsJs, /Abrir centro web completo/);
  assert.match(currentDownloadsJs, /current-legacy-download-link/);
  assert.match(currentDownloadsJs, /Descargas disponibles/);
});

test("el manifiesto publica dos EXE y las dos IPA con integridad verificable", () => {
  assert.equal(manifest.web_version, "1.0.43.1");
  assert.equal(manifest.desktop_release.version, "1.0.43");
  assert.equal(manifest.downloads.length, 4);
  assert.deepEqual(manifest.downloads.map(file => file.extension), ["EXE", "EXE", "IPA", "IPA"]);
  for (const file of manifest.downloads) {
    assert.match(file.url, /^https:\/\/github\.com\/erickcarela58-star\/(?:dcarela-panel|carela-compufoto)\/releases\/download\//);
    assert.doesNotMatch(file.url, /dcarela-pos-private/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.size_bytes > 0);
    assert.equal(file.publisher_signature, "not_signed");
    assert.ok(file.installation_method.length > 20);
  }
});

test("Finanzas publica el diagnostico 2.0.0 y los dos CRM apuntan a v18", () => {
  const finance = manifest.apps.find(app => app.id === "finanzas-ios");
  const crm = manifest.apps.find(app => app.id === "crm");
  const crmFotos = manifest.apps.find(app => app.id === "crm-fotos");
  assert.ok(finance);
  assert.equal(finance.status, "diagnostic_unsigned");
  assert.equal(finance.version, "2.0.0 (build 200)");
  assert.match(finance.url, /DCarelaFinanzas-2\.0\.0-unsigned\.ipa$/);
  assert.equal(crm.status, "published");
  assert.equal(crm.url, "https://erickcarela58-star.github.io/dcarela-crm-panel/");
  assert.equal(crmFotos.status, "published");
  assert.equal(crmFotos.url, "https://erickcarela58-star.github.io/dcarela-fotos-panel/");
  assert.match(crm.version, /per-chat-photo-bot-v18/);
  assert.match(crmFotos.version, /per-chat-photo-bot-v18/);
});

test("Brújula publica el diagnostico 1.0.0 build 100 verificable", () => {
  const brujula = manifest.apps.find(app => app.id === "brujula");
  const download = manifest.downloads.find(file => file.product === "Brújula");
  assert.equal(brujula.status, "diagnostic_unsigned");
  assert.equal(brujula.version, "1.0.0 (build 100)");
  assert.match(brujula.url, /Brujula-1\.0\.0-unsigned\.ipa$/);
  assert.equal(download.sha256, "8e7fbef1257042785c8d7176db036d1ff73450f4bf3c1b68d57d1430e0a4b838");
  assert.equal(download.size_bytes, 17626097);
});
