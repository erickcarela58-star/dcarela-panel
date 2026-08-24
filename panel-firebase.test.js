const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const firebaseConfigJs = fs.readFileSync(path.join(root, "firebase-config.js"), "utf8");
const firebaseJson = fs.readFileSync(path.join(root, "firebase.json"), "utf8");
const firestoreRules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const firebaseAdapter = fs.readFileSync(path.join(root, "firebase-adapter.js"), "utf8");
const panelHtml = fs.readFileSync(path.join(root, "panel.html"), "utf8");
const panelJs = fs.readFileSync(path.join(root, "panel.js"), "utf8");

test("firebase-config.js contiene la configuracion oficial del proyecto erikccarela", () => {
  assert.match(firebaseConfigJs, /projectId:\s*"erikccarela"/);
  assert.match(firebaseConfigJs, /authDomain:\s*"erikccarela\.firebaseapp\.com"/);
  assert.match(firebaseConfigJs, /storageBucket:\s*"erikccarela\.firebasestorage\.app"/);
});

test("firebase.json define reglas de hosting y rewrite hacia index.html", () => {
  const parsed = JSON.parse(firebaseJson);
  assert.equal(parsed.firestore.rules, "firestore.rules");
  assert.equal(parsed.hosting.public, ".");
  assert.ok(Array.isArray(parsed.hosting.rewrites));
  assert.equal(parsed.hosting.rewrites[0].destination, "/index.html");
});

test("firebase-adapter.js exporta DcarelaFirebase y métodos para Auth y Firestore", () => {
  assert.match(firebaseAdapter, /window\.DcarelaFirebase\s*=/);
  assert.match(firebaseAdapter, /signInWithEmailAndPassword/);
  assert.match(firebaseAdapter, /getCollection/);
  assert.match(firebaseAdapter, /onSnapshot/);
  assert.match(firebaseAdapter, /getMembershipsForUser/);
  assert.match(firebaseAdapter, /waitForAuthState/);
  assert.doesNotMatch(firebaseAdapter, /apiKey:\s*["'][^"']+/);
});

test("las consultas Firebase no dependen de índices compuestos no publicados", () => {
  const source = fs.readFileSync(path.join(root, "firebase-adapter.js"), "utf8");
  assert.doesNotMatch(source, /collection\('fin_movements'\)[\s\S]{0,500}orderBy\(/);
  assert.doesNotMatch(source, /collection\('sales'\)[\s\S]{0,400}orderBy\(/);
  assert.doesNotMatch(source, /collection\('cash_shifts'\)[\s\S]{0,400}orderBy\(/);
  assert.match(source, /startsWith\(`\$\{month\}-`\)/);
});

test("Firestore limita lectura y escritura al negocio, membresia y rol autenticados", () => {
  assert.match(firestoreRules, /request\.auth != null/);
  assert.match(firestoreRules, /business_members/);
  assert.match(firestoreRules, /userId == request\.auth\.uid/);
  assert.match(firestoreRules, /businessId in .*business_ids/);
  assert.match(firestoreRules, /function isAdmin/);
  assert.match(firestoreRules, /match \/sync_events\/\{eventId\}/);
  assert.match(firestoreRules, /allow create: if request\.resource\.data\.business_id is string[\s\S]{0,100}canSell\(request\.resource\.data\.business_id\)/);
  assert.match(firestoreRules, /allow update, delete: if false/);
  assert.match(firestoreRules, /match \/fin_accounts\/\{documentId\}/);
  assert.match(firestoreRules, /match \/fin_accounts\/[\s\S]{0,350}allow create:[\s\S]{0,100}isAdmin/);
  assert.doesNotMatch(firestoreRules, /allow (?:read|write): if true/);
});

test("Caja web y conciliacion usan operaciones Firebase transaccionales y auditables", () => {
  assert.match(firebaseAdapter, /async webSaleAction\(/);
  assert.match(firebaseAdapter, /async adminAction\(/);
  assert.match(firebaseAdapter, /action === 'sale\.create'/);
  assert.match(firebaseAdapter, /action === 'sale\.cancel'/);
  assert.match(firebaseAdapter, /action === 'fin\.account\.reconcile'/);
  assert.match(firebaseAdapter, /Conciliacion de saldo/);
  assert.match(firebaseAdapter, /saldo_anterior_centavos/);
  assert.match(firebaseAdapter, /saldo_resultante_centavos/);
  assert.doesNotMatch(firebaseAdapter, /collection\('fin_movements'\)[\s\S]{0,250}\.delete\(/);
  assert.match(panelJs, /DcarelaFirebase\.webSaleAction/);
  assert.match(panelJs, /DcarelaFirebase\.adminAction/);
  assert.doesNotMatch(firebaseAdapter, /transaction\.create\(/);
  assert.match(firebaseAdapter, /transaction\.set\(/);
});

test("una anulacion administrativa no exige turno abierto y acepta ventas sincronizadas desde Windows", () => {
  const start = firebaseAdapter.indexOf("async webSaleAction");
  const end = firebaseAdapter.indexOf("async adminAction", start);
  const action = firebaseAdapter.slice(start, end);
  const cancelStart = action.indexOf("if (action === 'sale.cancel')");
  const cancelAction = action.slice(cancelStart);
  assert.match(action, /requiresOpenShift = action === 'cash\.move' \|\| action === 'shift\.close'/);
  assert.match(action, /if \(requiresOpenShift && !shift\)/);
  assert.match(cancelAction, /sourceEventRef \? await sourceEventRef\.get\(\) : null/);
  assert.match(cancelAction, /source\.event_type !== 'VentaCobrada'/);
  assert.match(cancelAction, /sourceIsWebSale = source\.source === 'caja_web_firebase'/);
  assert.match(cancelAction, /shouldReadSaleDocument = !sourceEventRef \|\| sourceIsWebSale/);
  assert.doesNotMatch(cancelAction, /transaction\.get\(eventRef\)/);
  assert.doesNotMatch(cancelAction, /transaction\.get\(sourceEventRef\)/);
  assert.match(cancelAction, /materializedWebSale \? sale\.lineas \|\| \[\] : \[\]/);
  assert.match(cancelAction, /transaction\.set\(eventRef, eventDocument/);
  assert.match(cancelAction, /previous = await eventRef\.get\(\)/);
  assert.match(cancelAction, /row\.event_type === 'VentaCancelada'/);
  assert.match(panelJs, /motivo: reason, sourceEventId/);
  assert.match(panelJs, /data-cancel-event=/);
});

test("todas las herramientas administrativas visibles tienen implementacion Firebase", () => {
  const actions = [...panelJs.matchAll(/"((?:expense|cost|receipt|fin|device|business|product|category|client|combo|inventory|sale)[a-z_.]+)":\s*"/g)]
    .map(match => match[1]);
  assert.ok(actions.length >= 25);
  for (const action of actions) {
    assert.match(firebaseAdapter, new RegExp(`action === ['"]${action.replaceAll('.', '\\.')}['"]`), action);
  }
  assert.match(firebaseAdapter, /sync_event_archives/);
  assert.match(firebaseAdapter, /events:\s*chunks\.flatMap/);
});

test("el sitio no publica respaldos comerciales ni datos personales como archivos seed", () => {
  for (const name of ["firestore-seed.json", "catalog-seed.json", "events-seed.json", "finance-seed.json"]) {
    assert.equal(fs.existsSync(path.join(root, name)), false, `${name} no debe publicarse`);
    assert.doesNotMatch(panelJs, new RegExp(name.replace(".", "\\.")));
  }
});

test("la autenticacion no fabrica administradores ni persiste tokens manuales", () => {
  assert.doesNotMatch(panelJs, /dcarela-firebase-authenticated-token/);
  assert.doesNotMatch(panelJs, /dcarela\.fb_session/);
  assert.doesNotMatch(panelJs, /password\.length\s*>?=/);
  assert.doesNotMatch(panelJs, /email\.includes\(["']carela["']\)/);
  assert.doesNotMatch(panelJs, /Operando en Firebase|Local verificado/);
  assert.match(panelJs, /getMembershipsForUser\(session\.user\.id\)/);
  assert.match(panelJs, /Firebase Auth · reglas verificadas/);
  assert.match(panelJs, /Firebase · acceso seguro/);
  assert.match(panelJs, /if \(!sesionOk\) await window\.DcarelaFirebase\.signOut/);
});

test("panel.html vincula firebase-config y firebase-adapter", () => {
  assert.match(panelHtml, /firebase-config\.js/);
  assert.match(panelHtml, /firebase-adapter\.js/);
  assert.match(panelHtml, /id="btnTemaAcceso"/);
  assert.match(panelJs, /on\("btnTemaAcceso", "click", cambiarTema\)/);
  assert.match(fs.readFileSync(path.join(root, "panel-theme.css"), "utf8"), /html\.is-embedded \.auth-theme-toggle \{ display: none; \}/);
});
