'use strict';

// Development-only preview. No Firebase SDK, tokens, credentials or business data.
// UI interaction stays in Computer Use; this file only serves a loopback fixture.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const scenarios = new Set(['timeout', 'denied', 'signed-out', 'changed-user', 'success']);
const assets = new Map([
  ['/panel.css', ['panel.css', 'text/css; charset=utf-8']],
  ['/panel-theme.css', ['panel-theme.css', 'text/css; charset=utf-8']],
  ['/visual-fidelity.css', ['visual-fidelity.css', 'text/css; charset=utf-8']],
  ['/crm-visual.css', ['crm-visual.css', 'text/css; charset=utf-8']],
  ['/dcarela-logo.png', ['dcarela-logo.png', 'image/png']]
]);
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error('Production auth markers changed; update the preview first.');
  return source.slice(start, end);
}

function buildFixture(scenario = 'timeout', theme = 'light') {
  if (!scenarios.has(scenario)) throw new Error('Unknown fixture scenario');
  if (!['light', 'dark'].includes(theme)) throw new Error('Unknown fixture theme');
  const html = fs.readFileSync(path.join(root, 'panel.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'panel.js'), 'utf8');
  const access = section(html, '  <section id="access"', '  <div id="app"')
    .replace('value="erickcarela58@gmail.com"', 'value="fixture@example.test"')
    .replace('placeholder="https://proyecto.supabase.co"', 'placeholder="Simulación local sin conexión"')
    .replaceAll('<input ', '<input disabled ')
    .replace('id="btnEntrar"', 'id="btnEntrar" disabled')
    .replace('id="btnGuardarCfg"', 'id="btnGuardarCfg" disabled');
  const functions = section(source, '  function mostrarAcceso(', '  const loaders =')
    + section(source, '  async function iniciar(generation', '  // Elementos que arrancar() esperaba');
  const retryBinding = source.split(/\r?\n/).find(line => line.includes('on("btnReintentarAcceso", "click",'));
  if (!retryBinding || !source.includes('DcarelaFirebase.onAuthStateChanged(manejarEstadoFirebase)')) {
    throw new Error('Production auth bindings changed; update the preview first.');
  }
  const script = `(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const requested = ${JSON.stringify(scenario)};
    const previewKey = 'dcarela-auth-preview.' + requested;
    const scenario = sessionStorage.getItem(previewKey) === 'retry' ? 'success' : requested;
    let identity = {uid:'fixture-owner',email:'fixture@example.test'}, observer = () => {};
    let session=null,sesionOk=false,activeUserId='',authProvider='none',authGeneration=0,startupPromise=null,canEdit=false,memberRole='viewer',liveChannel=null;
    const EMBEDDED=true;
    window.DcarelaFirebase = {
      isAvailable:true, getCurrentUser:() => identity, waitForAuthState:async () => identity,
      onAuthStateChanged:callback => {observer=callback;return () => {};}
    };
    async function cargarSucursalesDisponibles() {
      if (scenario === 'timeout') throw Object.assign(new Error('Tiempo de espera simulado'),{code:'deadline-exceeded'});
      if (scenario === 'denied') throw new Error('permission-denied');
      if (['signed-out','changed-user'].includes(scenario)) await new Promise(resolve => setTimeout(resolve,50));
    }
    async function cargarRolEdicion() {memberRole='viewer';canEdit=false;}
    function verEstado() {}
    function conectarRealtime() {}
    function comprobarVersion() {}
    function mostrarVista() {$('previewStatus').textContent='Permisos de prueba revalidados. No hay ventas, cuentas o movimientos reales.';}
    async function cargarPermisosCajaWeb() {}
    function setSaleAccess() {}
    async function obtenerAlertas() {}
    function on(id,event,handler) {$(id)?.addEventListener(event,handler);}
    ${functions}
    $('previewScenario').textContent = 'SIMULACIÓN LOCAL · ' + scenario + ' · sin conexión a Firebase';
    $('btnReintentarAcceso').addEventListener('click',() => sessionStorage.setItem(previewKey,'retry'));
    ${retryBinding}
    on('previewReset','click',() => {sessionStorage.removeItem(previewKey);location.reload();});
    window.DcarelaFirebase.onAuthStateChanged(manejarEstadoFirebase);
    restaurarSesion();
    if (scenario === 'signed-out' || scenario === 'changed-user') setTimeout(() => {
      identity = scenario === 'signed-out' ? null : {uid:'fixture-other',email:'other@example.test'};
      observer(identity);
    },0);
  })();`;
  return `<!doctype html><html lang="es" data-theme="${theme}" class="embedded-panel is-embedded${theme === 'dark' ? ' dark' : ''}"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <title>SIMULACIÓN LOCAL — recuperación de acceso D' Carela</title>
    <link rel="stylesheet" href="/panel.css"><link rel="stylesheet" href="/panel-theme.css"><link rel="stylesheet" href="/visual-fidelity.css"><link rel="stylesheet" href="/crm-visual.css">
    <style>.preview-banner{position:fixed;top:0;left:0;right:0;z-index:9999;background:#16324f;color:white;font:12px/1.5 system-ui;padding:7px 12px;display:flex;gap:12px;flex-wrap:wrap}.preview-banner button{font:inherit;color:white;border:1px solid white;background:transparent;padding:0 8px}#app{display:block;padding:72px 20px}</style>
    </head><body><aside class="preview-banner"><span id="previewScenario">SIMULACIÓN LOCAL — sin datos reales</span><button id="previewReset" type="button">Reiniciar simulación</button></aside>
    ${access}<div id="app" class="app-shell oculto"><h1>Acceso simulado</h1><p id="sessionEmail"></p><p id="backendLabel"></p><p id="previewStatus" role="status"></p></div>
    <script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`;
}

function createPreviewServer() {
  return http.createServer((req, res) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {res.writeHead(405);res.end('Read-only local preview');return;}
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(buildFixture(url.searchParams.get('scenario') || 'timeout', url.searchParams.get('theme') || 'light'));
      } else if (assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        res.setHeader('Content-Type', type);res.end(fs.readFileSync(path.join(root, file)));
      } else {res.writeHead(404);res.end('Not served by this isolated preview');}
    } catch (_) {res.writeHead(400);res.end('Invalid local fixture request');}
  });
}

module.exports = {buildFixture, createPreviewServer, scenarios};
if (require.main === module) {
  const port = Number(process.argv[2] || 8816);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
  const server = createPreviewServer();
  server.on('error', () => {console.error('Preview could not start; no other process was modified.');process.exitCode=1;});
  server.listen(port, '127.0.0.1', () => console.log('Isolated preview: http://127.0.0.1:' + port + '/?scenario=timeout'));
}
