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

test("is-embedded y window.self !== window.top suprimen sidebars duplicados", () => {
  assert.match(panelCss, /html\.is-embedded\s+\.sidebar/);
  assert.match(panelCss, /display:\s*none\s*!important/);
  assert.match(panelHtml, /document\.documentElement\.classList\.add\("is-embedded"\)/);
  assert.match(panelJs, /document\.documentElement\.classList\.add\("is-embedded"\)/);
});

test("index.html enruta escritorios a panel.html y móviles a mobile/ sin anidar", () => {
  assert.match(indexHtml, /\.\/panel\.html/);
  assert.match(indexHtml, /\.\/mobile\//);
  assert.doesNotMatch(indexHtml, /<iframe/i);
});

test("mobile vuelve a cargar el shell responsive real y no redirige al panel antiguo", () => {
  assert.match(mobileHtml, /id="root"/);
  assert.match(mobileHtml, /assets\/index-J61hK3gK\.js/);
  assert.match(mobileHtml, /updates-downloads-current\.js/);
  assert.doesNotMatch(mobileHtml, /location\.replace|\.\.\/panel\.html/);
});
