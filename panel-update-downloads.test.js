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
  assert.ok(manifest.downloads.length >= 3);
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
  assert.equal(desktop.version, manifest.desktop_version);
  assert.equal(desktop.sha256, manifest.desktop_release.sha256);
  assert.equal(desktop.size_bytes, manifest.desktop_release.size_bytes);
  const plaza = manifest.downloads.find(file => file.business_id === "plaza-artesanal");
  if (plaza) {
    assert.equal(plaza.url, manifest.desktop_releases["plaza-artesanal"].release_url);
    assert.equal(plaza.version, manifest.desktop_releases["plaza-artesanal"].version);
    assert.equal(plaza.sha256, manifest.desktop_releases["plaza-artesanal"].sha256);
    assert.equal(plaza.size_bytes, manifest.desktop_releases["plaza-artesanal"].size_bytes);
    assert.match(plaza.url, /DCARELA_PLAZA_ARTESANAL_/);
    assert.notEqual(plaza.url, desktop.url);
  }
});

test("la seleccion de instalador mantiene aisladas las sucursales", () => {
  const vm = require("node:vm");
  const start = panelJs.indexOf("  function releaseParaSucursal(");
  const end = panelJs.indexOf("  async function consultarVersion()", start);
  const context = { BUSINESS: "dcarela" };
  vm.createContext(context);
  vm.runInContext(panelJs.slice(start, end), context);
  const select = context.releaseParaSucursal;
  const plazaRelease = { version: "1.0.66", release_url: "https://github.com/erickcarela58-star/dcarela-panel/releases/download/pos-v1.0.66/DCARELA_PLAZA_ARTESANAL_1.0.66_Setup.exe" };
  const withPlaza = { ...manifest, desktop_releases: { "plaza-artesanal": plazaRelease } };
  assert.equal(select(manifest, "dcarela"), manifest.desktop_release);
  assert.equal(select(withPlaza, "plaza-artesanal"), plazaRelease);
  assert.equal(select({ desktop_release: manifest.desktop_release }, "plaza-artesanal"), null);
  assert.equal(select({ desktop_releases: { "plaza-artesanal": manifest.desktop_release } }, "plaza-artesanal"), null);
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
  assert.ok(urls.some(url => /Brujula-5\.2\.1-493-AltStore\.ipa$/.test(url)));
  assert.ok(urls.some(url => /DCarelaFinanzas-6\.2\.5-629-AltStore\.ipa$/.test(url)));
});
