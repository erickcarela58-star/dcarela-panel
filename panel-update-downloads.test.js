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

test("la vista principal muestra la aplicacion completa de forma standalone y responsive", () => {
  assert.match(shellHtml, /id="root"/);
  assert.match(shellHtml, /shell-assets\/index-[^"']+\.js/);
  assert.doesNotMatch(shellHtml, /iframe|location\.replace/i);
  assert.match(panelHtml, /id="updateDownloads"/);
  assert.match(panelJs, /function renderDescargasAplicacion\(/);
});

test("el manifiesto publica el instalador y las dos IPA con integridad verificable", () => {
  assert.match(manifest.web_version, /^1\.0\.\d+$/);
  assert.equal(manifest.desktop_release.version, "1.0.44");
  assert.equal(manifest.downloads.length, 3);
  for (const file of manifest.downloads) {
    assert.match(file.url, /^https:\/\/panel\.dcarelacompufoto\.com\//);
    assert.doesNotMatch(file.url, /dcarela-pos-private/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.size_bytes > 0);
    assert.equal(file.publisher_signature, "not_signed");
    assert.ok(file.installation_method.length > 20);
  }
});

test("Finanzas 621 y los dos CRM se publican por dominios oficiales", () => {
  const finance = manifest.apps.find(app => app.id === "finanzas-ios" || app.id === "com.dcarela.panel");
  assert.ok(finance);
  assert.equal(finance.status, "published");
  assert.equal(finance.version, "6.1.1 (build 621)");
  assert.match(finance.url, /DCarelaFinanzas-.*\.ipa$/);
  const crm = manifest.apps.find(app => app.id === "crm");
  const photos = manifest.apps.find(app => app.id === "crm-fotos");
  assert.equal(crm.url, "https://dcarelacompufoto.com/crm/");
  assert.equal(photos.url, "https://dcarelacompufoto.com/crm-fotos/");
  assert.notEqual(crm.url, photos.url);
  assert.match(crm.notes, /Meta\/Cloud/);
  assert.match(photos.notes, /WhatsApp Web/);
  assert.match(photos.notes, /código telefónico/);
  for (const app of manifest.apps) {
    assert.doesNotMatch(app.url || "", /netlify\.app|github\.io|raw\.githubusercontent\.com/i);
  }
});
