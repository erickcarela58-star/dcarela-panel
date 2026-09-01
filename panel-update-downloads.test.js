const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const panelHtml = fs.readFileSync(path.join(root, "panel.html"), "utf8");
const panelJs = fs.readFileSync(path.join(root, "panel.js"), "utf8");
const shellHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "app-version.json"), "utf8"));
const altStore = JSON.parse(fs.readFileSync(path.join(root, "ios-releases", "altstore-source.json"), "utf8"));

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
  assert.match(manifest.desktop_release.version, /^1\.0\.\d+$/);
  assert.equal(manifest.downloads.length, 3);
  for (const file of manifest.downloads) {
    assert.match(
      file.url,
      /^https:\/\/(?:panel\.dcarelacompufoto\.com\/|github\.com\/erickcarela58-star\/dcarela-panel\/releases\/download\/)/
    );
    assert.doesNotMatch(file.url, /dcarela-pos-private/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.size_bytes > 0);
    assert.equal(file.publisher_signature, "not_signed");
    assert.ok(file.installation_method.length > 20);
  }
  const desktop = manifest.downloads.find(file => file.product === "D' Carela POS");
  assert.ok(desktop);
  assert.match(manifest.desktop_release.release_url, /\.exe$/i);
  assert.equal(desktop.url, manifest.desktop_release.release_url);
});

test("Finanzas vigente y los dos CRM se publican por dominios oficiales", () => {
  const finance = manifest.apps.find(app => app.id === "finanzas-ios" || app.id === "com.dcarela.panel");
  assert.ok(finance);
  assert.equal(finance.status, "published");
  assert.equal(finance.version, "6.2.5 (build 629)");
  assert.match(finance.url, /DCarelaFinanzas-.*\.ipa$/);
  const crm = manifest.apps.find(app => app.id === "crm");
  const photos = manifest.apps.find(app => app.id === "crm-fotos");
  assert.equal(crm.url, "https://crm.dcarelacompufoto.com/");
  assert.equal(photos.url, "https://fotos.dcarelacompufoto.com/");
  assert.notEqual(crm.url, photos.url);
  assert.match(crm.notes, /Meta\/Cloud/);
  assert.match(photos.notes, /WhatsApp Web/);
  assert.match(photos.notes, /código telefónico/);
  for (const app of manifest.apps) {
    assert.doesNotMatch(app.url || "", /netlify\.app|github\.io|raw\.githubusercontent\.com/i);
  }
});

test("AltStore solo anuncia los dos IPA vigentes", () => {
  assert.equal(altStore.apps.length, 2);
  for (const app of altStore.apps) {
    assert.equal(app.versions.length, 1);
    assert.equal(app.versions[0].downloadURL, app.downloadURL);
    assert.equal(app.versions[0].sha256, app.sha256);
    assert.match(app.downloadURL, /^https:\/\/(?:panel\.dcarelacompufoto\.com\/ios-releases\/|github\.com\/erickcarela58-star\/dcarela-panel\/releases\/download\/)/);
    assert.doesNotMatch(app.downloadURL, /QA|netlify|github\.io/i);
  }
  const urls = altStore.apps.map(app => app.downloadURL);
  assert.ok(urls.some(url => /Brujula-5\.2\.0-492-AltStore\.ipa$/.test(url)));
  assert.ok(urls.some(url => /DCarelaFinanzas-6\.2\.5-629-AltStore\.ipa$/.test(url)));
});
