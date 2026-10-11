"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(__dirname + "/panel.js", "utf8");
const html = fs.readFileSync(__dirname + "/panel.html", "utf8");

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function harness({ membership = async () => {}, identity = { uid: "owner" } } = {}) {
  const nodes = new Map(), timers = new Map();
  let timerId = 0, opens = 0, signOuts = 0, currentIdentity = identity;
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set(["app", "v-config", "v-login", "v-auth-error"].includes(id) ? ["oculto"] : []);
      nodes.set(id, { textContent: "", classList: {
        add: value => classes.add(value), remove: value => classes.delete(value),
        contains: value => classes.has(value),
        toggle(value, force) { if (force) classes.add(value); else classes.delete(value); }
      } });
    }
    return nodes.get(id);
  }
  const ctx = {
    $: node, window: { DcarelaFirebase: {
      isAvailable: true, getCurrentUser: () => currentIdentity,
      waitForAuthState: async () => currentIdentity, signOut: async () => { signOuts++; }
    } },
    console: { warn() {} }, location: { hash: "#money-manager" },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    cargarSucursalesDisponibles: membership, cargarRolEdicion: async () => {},
    cargarTemaUsuario: async () => {}, verEstado() {}, conectarRealtime() {}, comprobarVersion() {},
    mostrarVista() { opens++; }, cargarPermisosCajaWeb: async () => {}, setSaleAccess() {},
    obtenerAlertas: async () => {}
  };
  vm.createContext(ctx);
  vm.runInContext('let session=null,sesionOk=false,activeUserId="",authProvider="none",authGeneration=1,startupPromise=null,canEdit=false,liveChannel=null;const EMBEDDED=true;', ctx);
  const accessStart = source.indexOf("  function mostrarAcceso(");
  const accessEnd = source.indexOf("  const loaders =", accessStart);
  const startupStart = source.indexOf("  async function iniciar(generation");
  const startupEnd = source.indexOf("  // Elementos que arrancar() esperaba", startupStart);
  vm.runInContext(source.slice(accessStart, accessEnd) + source.slice(startupStart, startupEnd), ctx);
  return {
    ctx, node, timers, identity, setIdentity(user) { currentIdentity = user; },
    session: { provider: "firebase", user: { id: "owner", email: "fixture@example.test" } },
    state: () => vm.runInContext('({session,sesionOk,activeUserId,authProvider,authGeneration})', ctx),
    opens: () => opens, signOuts: () => signOuts,
    async flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); },
    expire() { for (const [id, timer] of [...timers]) { if (timer.ms === 20000) { timers.delete(id); timer.fn(); } } }
  };
}

test("un timeout de membresias conserva la identidad Firebase sin abrir el panel ni pedir otra clave", async () => {
  const membership = deferred(), h = harness({ membership: () => membership.promise });
  const pending = h.ctx.iniciarConSesion(h.session);
  h.expire(); await pending;
  assert.equal(h.opens(), 0);
  assert.equal(h.node("app").classList.contains("oculto"), true);
  assert.equal(h.node("v-auth-error").classList.contains("oculto"), false);
  assert.equal(h.node("v-login").classList.contains("oculto"), true);
  assert.match(h.node("authValidationErr").textContent, /tard[oó]|tiempo/i);
  assert.equal(h.state().session, null);
  assert.equal(h.state().authGeneration, 2);
  assert.equal(h.signOuts(), 0);
});

test("una respuesta tardia de un arranque vencido nunca muestra cuentas o movimientos", async () => {
  const membership = deferred(), h = harness({ membership: () => membership.promise });
  const pending = h.ctx.iniciarConSesion(h.session);
  h.expire(); await pending;
  membership.resolve(); await h.flush();
  assert.equal(h.opens(), 0);
  assert.equal(h.state().sesionOk, false);
});

test("sin identidad Firebase vigente el fallo vuelve a login, no a recuperacion", async () => {
  const h = harness({ identity: null, membership: async () => { throw new Error("Tiempo de espera"); } });
  await h.ctx.iniciarConSesion(h.session);
  assert.equal(h.node("v-login").classList.contains("oculto"), false);
  assert.equal(h.node("v-auth-error").classList.contains("oculto"), true);
  assert.equal(h.opens(), 0);
});

test("una identidad diferente no se trata como la sesion del intento anterior", async () => {
  const h = harness({ identity: { uid: "other-user" }, membership: async () => { throw new Error("Tiempo de espera"); } });
  await h.ctx.iniciarConSesion(h.session);
  assert.equal(h.node("v-login").classList.contains("oculto"), false);
  assert.equal(h.node("v-auth-error").classList.contains("oculto"), true);
  assert.equal(h.opens(), 0);
});

test("permisos denegados siguen bloqueando el panel aunque la identidad sea valida", async () => {
  const h = harness({ membership: async () => { throw new Error("permission-denied"); } });
  await h.ctx.iniciarConSesion(h.session);
  assert.equal(h.node("app").classList.contains("oculto"), true);
  assert.equal(h.opens(), 0);
  assert.equal(h.state().sesionOk, false);
  assert.match(h.node("authValidationErr").textContent, /no tiene permiso/);
});

test("una restauracion lenta presenta recuperacion y limpia ambos temporizadores", async () => {
  const membership = deferred(), h = harness({ membership: () => membership.promise });
  const pending = h.ctx.restaurarSesion();
  await h.flush(); h.expire(); await pending;
  assert.equal(h.node("v-auth-error").classList.contains("oculto"), false);
  assert.equal(h.node("v-login").classList.contains("oculto"), true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.opens(), 0);
});

test("una restauracion autorizada abre el modulo una vez sin dejar un timeout pendiente", async () => {
  const h = harness(); await h.ctx.restaurarSesion();
  assert.equal(h.opens(), 1);
  assert.equal(h.state().sesionOk, true);
  assert.equal(h.node("app").classList.contains("oculto"), false);
  assert.equal(h.timers.size, 0);
});

test("Reintentar acceso recarga para revalidar sin reutilizar roles ni ejecutar signIn", () => {
  assert.match(html, /id="v-auth-error"/);
  assert.match(html, /id="authValidationErr"[\s\S]*id="btnReintentarAcceso"/);
  assert.match(source, /on\("btnReintentarAcceso", "click", \(\) => location\.reload\(\)\)/);
  const loginStart = source.indexOf('on("btnEntrar", "click", async () =>');
  const login = source.slice(loginStart, source.indexOf('on("pass", "keydown"', loginStart));
  assert.doesNotMatch(login, /if \(!sesionOk\) await window\.DcarelaFirebase\.signOut/);
});

test("el formulario no desconecta Firebase si la validacion posterior al login vence", async () => {
  const membership = deferred(), h = harness({ membership: () => membership.promise });
  let submit;
  h.ctx.on = (_id, _event, handler) => { submit = handler; };
  h.ctx.window.DcarelaFirebase.signIn = async () => ({ user: { uid: "owner", email: "fixture@example.test" } });
  h.node("email").value = "fixture@example.test";
  h.node("pass").value = "fixture-only-not-a-secret";
  const loginStart = source.indexOf('    on("btnEntrar", "click", async () =>');
  const loginEnd = source.indexOf('    on("pass", "keydown"', loginStart);
  vm.runInContext(source.slice(loginStart, loginEnd), h.ctx);
  const pending = submit(); await h.flush(); h.expire(); await pending;
  assert.equal(h.signOuts(), 0);
  assert.equal(h.node("btnEntrar").disabled, false);
  assert.equal(h.node("btnEntrar").textContent, "Entrar");
  assert.equal(h.node("v-auth-error").classList.contains("oculto"), false);
  assert.equal(h.opens(), 0);
});

test("otro intento o cierre de sesion invalida la respuesta anterior antes de abrir datos", async () => {
  const membership = deferred(), h = harness({ membership: () => membership.promise });
  const pending = h.ctx.iniciarConSesion(h.session);
  vm.runInContext('authGeneration++;session=null;sesionOk=false;activeUserId="";authProvider="none";', h.ctx);
  membership.resolve(); await pending;
  assert.equal(h.opens(), 0);
  assert.equal(h.state().sesionOk, false);
  assert.equal(h.timers.size, 0);
});

test("un HTML antiguo sin la nueva vista mantiene el acceso bloqueado sin romper el arranque", async () => {
  const h = harness({ membership: async () => { throw new Error("Tiempo de espera"); } });
  h.ctx.$ = id => ["v-auth-error", "authValidationErr"].includes(id) ? null : h.node(id);
  await h.ctx.iniciarConSesion(h.session);
  assert.equal(h.node("v-login").classList.contains("oculto"), false);
  assert.equal(h.node("app").classList.contains("oculto"), true);
  assert.match(h.node("loginErr").textContent, /tardó/);
  assert.equal(h.opens(), 0);
});

function notifyFirebase(h, user) {
  // Ejecuta el callback de producción, no una mutación manual de authGeneration.
  h.setIdentity(user);
  if (h.ctx.manejarEstadoFirebase) return h.ctx.manejarEstadoFirebase(user);
  const callbackStart = source.indexOf("    window.DcarelaFirebase.onAuthStateChanged(user => {");
  const callbackEnd = source.indexOf("    await restaurarSesion();", callbackStart);
  h.ctx.window.DcarelaFirebase.onAuthStateChanged = callback => callback(user);
  vm.runInContext(source.slice(callbackStart, callbackEnd), h.ctx);
}

test("SIGNED_OUT real durante validacion invalida el intento y su respuesta tardia", async () => {
  const membership = deferred(), h = harness({ membership: () => membership.promise });
  const pending = h.ctx.iniciarConSesion(h.session);
  notifyFirebase(h, null);
  membership.resolve(); await pending;
  assert.equal(h.opens(), 0);
  assert.equal(h.state().session, null);
  assert.equal(h.node("v-login").classList.contains("oculto"), false);
});

test("SIGNED_OUT real abandona la recuperacion sin mantener una identidad que ya termino", async () => {
  const h = harness({ membership: async () => { throw new Error("Tiempo de espera"); } });
  await h.ctx.iniciarConSesion(h.session);
  notifyFirebase(h, null);
  assert.equal(h.node("v-auth-error").classList.contains("oculto"), true);
  assert.equal(h.node("v-login").classList.contains("oculto"), false);
  assert.equal(h.node("app").classList.contains("oculto"), true);
});

test("un cambio real de identidad mientras se validan permisos no abre el usuario anterior", async () => {
  const membership = deferred(), h = harness({ membership: () => membership.promise });
  const pending = h.ctx.iniciarConSesion(h.session);
  notifyFirebase(h, { uid: "other-user" });
  membership.resolve(); await pending;
  assert.equal(h.opens(), 0);
  assert.equal(h.state().session, null);
  assert.equal(h.node("app").classList.contains("oculto"), true);
});

test("el estado inicial sin usuario no cancela ni fabrica una validacion", () => {
  const h = harness({ identity: null }); notifyFirebase(h, null);
  assert.equal(h.state().authGeneration, 1);
  assert.equal(h.opens(), 0);
  assert.equal(h.state().sesionOk, false);
});

test("el mismo usuario conserva su sesion y SIGNED_OUT detiene la escucha y la edicion", async () => {
  const h = harness(); let stopped = 0;
  await h.ctx.restaurarSesion();
  h.ctx.stopLive = () => { stopped++; };
  vm.runInContext('canEdit=true;liveChannel=stopLive;', h.ctx);
  notifyFirebase(h, { uid: "owner" });
  assert.equal(h.state().sesionOk, true);
  assert.equal(stopped, 0);
  notifyFirebase(h, null);
  assert.equal(stopped, 1);
  assert.equal(vm.runInContext('canEdit', h.ctx), false);
  assert.equal(h.node("app").classList.contains("oculto"), true);
  assert.equal(h.node("v-login").classList.contains("oculto"), false);
  assert.match(source, /DcarelaFirebase\.onAuthStateChanged\(manejarEstadoFirebase\)/);
});
