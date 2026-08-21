const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const panelHtml = fs.readFileSync(path.join(root, "panel.html"), "utf8");
const panelCss = fs.readFileSync(path.join(root, "panel.css"), "utf8");
const panelJs = fs.readFileSync(path.join(root, "panel.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mobileHtml = fs.readFileSync(path.join(root, "mobile", "index.html"), "utf8");
const manifest = fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8");
const shellAsset = indexHtml.match(/shell-assets\/(index-[^"']+\.js)/)?.[1];
const mobileAsset = mobileHtml.match(/assets\/(index-[^"']+\.js)/)?.[1];
assert.ok(shellAsset, "index.html debe referenciar el bundle del shell");
assert.ok(mobileAsset, "mobile/index.html debe referenciar el bundle movil");
const shellJs = fs.readFileSync(path.join(root, "shell-assets", shellAsset), "utf8");
const mobileJs = fs.readFileSync(path.join(root, "mobile", "assets", mobileAsset), "utf8");

test("panel.html contiene exactamente un único shell estructural en desktop", () => {
  const sidebarCount = (panelHtml.match(/<aside\s+class="sidebar"/g) || []).length;
  const topbarCount = (panelHtml.match(/<header\s+class="topbar"/g) || []).length;
  const workspaceCount = (panelHtml.match(/<div\s+class="workspace"/g) || []).length;
  const appShellCount = (panelHtml.match(/id="app"\s+class="app-shell/g) || []).length;

  assert.equal(sidebarCount, 1, `Esperado 1 sidebar, encontrado ${sidebarCount}`);
  assert.equal(topbarCount, 1, `Esperado 1 topbar, encontrado ${topbarCount}`);
  assert.equal(workspaceCount, 1, `Esperado 1 workspace, encontrado ${workspaceCount}`);
  assert.equal(appShellCount, 1, `Esperado 1 app-shell, encontrado ${appShellCount}`);
});

test("solo embedded=1 suprime el shell; un navegador integrado conserva la navegación", () => {
  assert.match(panelCss, /html\.is-embedded\s+\.sidebar/);
  assert.match(panelCss, /display:\s*none\s*!important/);
  assert.doesNotMatch(panelCss, /html\.embedded-panel\s+\.sidebar[\s\S]{0,180}display:\s*none\s*!important/);
  assert.doesNotMatch(panelCss, /html\.embedded-panel\s+\.app-shell\s*\{[\s\S]{0,120}display:\s*block/);
  assert.match(panelHtml, /document\.documentElement\.classList\.add\("is-embedded"/);
  assert.match(panelJs, /document\.documentElement\.classList\.add\("is-embedded"/);
  assert.match(panelHtml, /panelParams\.get\("embedded"\) === "1"/);
  assert.match(panelJs, /get\("embedded"\) === "1"/);
  assert.doesNotMatch(panelHtml, /window\.self\s*!==\s*window\.top/);
  assert.doesNotMatch(panelJs, /window\.self\s*!==\s*window\.top/);
});

test("index.html carga el shell moderno como entrada principal sin redirigir al panel heredado", () => {
  assert.match(indexHtml, /id="root"/);
  assert.match(indexHtml, /shell-assets\/index-[^"']+\.js/);
  assert.doesNotMatch(indexHtml, /location\.replace|window\.location\s*=/);
  assert.doesNotMatch(indexHtml, /<iframe/i);
});

test("mobile vuelve a cargar el shell responsive real y no redirige al panel antiguo", () => {
  assert.match(mobileHtml, /id="root"/);
  assert.match(mobileHtml, /assets\/index-[^"']+\.js/);
  assert.doesNotMatch(mobileHtml, /location\.replace|\.\.\/panel\.html/);
});

test("Finanzas conserva una URL semántica y migra enlaces antiguos de proveedores", () => {
  assert.match(panelHtml, /href="#finanzas"[^>]*data-title="Finanzas"/);
  assert.match(panelHtml, /id="v-finanzas"/);
  assert.doesNotMatch(panelHtml, /href="#proveedores"|id="v-proveedores"|data-pos-route="proveedores"/);
  assert.match(panelJs, /if \(name === "proveedores"\)[\s\S]*?#finanzas/);
  assert.match(manifest, /#finanzas/);
  assert.doesNotMatch(manifest, /#proveedores/);
  assert.doesNotMatch(shellJs, /`proveedores`/);
  assert.doesNotMatch(mobileJs, /`proveedores`/);
});

test("Conciliación conserva una URL semántica aunque reutilice el módulo interno de recálculo", () => {
  assert.match(shellJs, /id:`conciliacion`,label:`Conciliacion`/);
  assert.match(mobileJs, /id:`conciliacion`,label:`Conciliacion`/);
  assert.match(shellJs, /t===`conciliacion`\?`recalcular`:t/);
  assert.match(mobileJs, /t===`conciliacion`\?`recalcular`:t/);
  assert.match(shellJs, /e===`recalcular`\?`conciliacion`/);
  assert.match(mobileJs, /e===`recalcular`\?`conciliacion`/);
});
