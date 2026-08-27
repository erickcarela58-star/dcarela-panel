"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "panel.js"), "utf8");
const marker = "// DCARELA_SESSION_GUARD_FINAL_1_0_30";
const helperSource = source.slice(source.indexOf(marker));
const context = { setTimeout, Date };
vm.createContext(context);
vm.runInContext(helperSource, context);

test("restaura una sesion vigente sin refrescarla", async () => {
  let refreshCalls = 0;
  const session = { user: { id: "user-1" }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      refreshSession: async () => { refreshCalls++; return { data: { session }, error: null }; },
    },
  };

  assert.equal(await context.dcWaitForAuthenticatedSession(client, 100, true), session);
  assert.equal(refreshCalls, 0);
});

test("refresca una sesion proxima a expirar antes de abrir el panel", async () => {
  const stale = { user: { id: "user-1" }, expires_at: Math.floor(Date.now() / 1000) + 10 };
  const fresh = { user: { id: "user-1" }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: stale }, error: null }),
      refreshSession: async () => ({ data: { session: fresh }, error: null }),
    },
  };

  assert.equal(await context.dcWaitForAuthenticatedSession(client, 100, true), fresh);
});

test("permite mostrar login inmediatamente cuando no existe sesion", async () => {
  const client = { auth: { getSession: async () => ({ data: { session: null }, error: null }) } };
  assert.equal(await context.dcWaitForAuthenticatedSession(client, 100, true), null);
});

test("propaga el error de autenticacion en vez de fabricar acceso", async () => {
  const expected = new Error("RLS denied");
  const client = { auth: { getSession: async () => ({ data: null, error: expected }) } };
  await assert.rejects(
    () => context.dcWaitForAuthenticatedSession(client, 100, true),
    /RLS denied/,
  );
});

test("el formulario de acceso abandona Validando cuando Firebase no responde", () => {
  assert.match(source, /async function esperarConLimite\(promise, timeoutMs, message\)/);
  assert.match(source, /window\.DcarelaFirebase\.signIn\(email, password\),\s*12000,/);
  assert.match(source, /finally \{\s*button\.disabled = false;\s*button\.textContent = "Entrar";/);
});
