'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {buildFixture, createPreviewServer, scenarios} = require('./.local-tests/auth-preview.cjs');

test('la vista aislada usa el HTML y las funciones de recuperacion reales', () => {
  const source = fs.readFileSync(__dirname + '/panel.js', 'utf8');
  const fixture = buildFixture();
  assert.ok(fixture.includes(source.slice(source.indexOf('  function mostrarAcceso('), source.indexOf('  const loaders ='))));
  assert.match(fixture, /id="v-auth-error"/);
  assert.match(fixture, /id="btnReintentarAcceso"/);
  assert.match(fixture, /on\("btnReintentarAcceso", "click", \(\) => location\.reload\(\)\)/);
  assert.match(fixture, /onAuthStateChanged\(manejarEstadoFirebase\)/);
  const script = fixture.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});

test('las cinco simulaciones no cargan SDK, tokens, claves o datos del negocio', () => {
  for (const scenario of scenarios) {
    const fixture = buildFixture(scenario);
    assert.match(fixture, /SIMULACIÓN LOCAL/);
    assert.match(fixture, /fixture@example\.test/);
    assert.doesNotMatch(fixture, /erickcarela58@gmail\.com|www\.gstatic\.com|supabase\.co/);
    assert.doesNotMatch(fixture, /<script[^>]+src=|firebase-config\.js|firebase-adapter\.js|anon:|access_token|refresh_token/);
    assert.match(fixture, /<input disabled[^>]*id="pass"/);
    assert.match(fixture, /id="btnEntrar" disabled/);
  }
});

test('el servidor local bloquea conexiones, formularios, POST y archivos no permitidos', async () => {
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    const response = await fetch(origin + '/?scenario=denied&theme=dark');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
    assert.match(response.headers.get('content-security-policy'), /form-action 'none'/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /data-theme="dark"/);
    assert.equal((await fetch(origin + '/firebase-config.js')).status, 404);
    assert.equal((await fetch(origin + '/panel.js')).status, 404);
    assert.equal((await fetch(origin + '/', {method:'POST'})).status, 405);
    assert.equal((await fetch(origin + '/?scenario=unknown')).status, 400);
  } finally {server.closeAllConnections();await new Promise(resolve => server.close(resolve));}
});

async function executeFixture(scenario, storage = new Map()) {
  const fixture = buildFixture(scenario), nodes = new Map(), timers = new Set();
  let reloads = 0;
  for (const match of fixture.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const classes = new Set((match[0].match(/class="([^"]*)"/)?.[1] || '').split(/\s+/));
    nodes.set(match[1], {textContent:'',handlers:new Map(),classList:{
      add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),
      toggle(value,force){if(force)classes.add(value);else classes.delete(value);}
    },addEventListener(event,handler){const handlers=this.handlers.get(event)||[];handlers.push(handler);this.handlers.set(event,handlers);}});
  }
  const context = {
    window:{},document:{getElementById:id=>nodes.get(id)},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    location:{hash:'#dashboard',reload(){reloads++;}},console:{warn(){}},
    setTimeout(fn,ms){const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;},
    clearTimeout(timer){clearTimeout(timer);timers.delete(timer);}
  };
  vm.createContext(context);
  try {
    vm.runInContext(fixture.match(/<script>([\s\S]*)<\/script>/)[1], context);
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(timers.size,0,'no startup timeout remains in the isolated preview');
  } finally {for(const timer of timers)clearTimeout(timer);}
  return {nodes,storage,reloads:()=>reloads};
}

test('el controlador aislado reproduce los estados y revalida por recarga sin operaciones reales', async () => {
  for (const scenario of scenarios) {
    const h = await executeFixture(scenario);
    const visible = id => !h.nodes.get(id).classList.contains('oculto');
    assert.equal(visible('app'),scenario==='success',scenario);
    assert.equal(visible('v-login'),scenario==='signed-out',scenario);
    assert.equal(visible('v-auth-error'),['timeout','denied','changed-user'].includes(scenario),scenario);
    if (scenario==='timeout') {
      for(const handler of h.nodes.get('btnReintentarAcceso').handlers.get('click'))handler();
      assert.equal(h.reloads(),1);
      const retried=await executeFixture(scenario,h.storage);
      assert.equal(retried.nodes.get('app').classList.contains('oculto'),false);
      assert.match(retried.nodes.get('previewStatus').textContent,/No hay ventas, cuentas o movimientos reales/);
    }
  }
});
