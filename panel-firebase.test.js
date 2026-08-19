const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const firebaseConfigJs = fs.readFileSync(path.join(root, "firebase-config.js"), "utf8");
const firebaseJson = fs.readFileSync(path.join(root, "firebase.json"), "utf8");
const firebaseAdapter = fs.readFileSync(path.join(root, "firebase-adapter.js"), "utf8");
const firestoreSeed = JSON.parse(fs.readFileSync(path.join(root, "firestore-seed.json"), "utf8"));
const panelHtml = fs.readFileSync(path.join(root, "panel.html"), "utf8");

test("firebase-config.js contiene la configuracion oficial del proyecto erikccarela", () => {
  assert.match(firebaseConfigJs, /projectId:\s*"erikccarela"/);
  assert.match(firebaseConfigJs, /authDomain:\s*"erikccarela\.firebaseapp\.com"/);
  assert.match(firebaseConfigJs, /storageBucket:\s*"erikccarela\.firebasestorage\.app"/);
});

test("firebase.json define reglas de hosting y rewrite hacia index.html", () => {
  const parsed = JSON.parse(firebaseJson);
  assert.equal(parsed.hosting.public, ".");
  assert.ok(Array.isArray(parsed.hosting.rewrites));
  assert.equal(parsed.hosting.rewrites[0].destination, "/index.html");
});

test("firebase-adapter.js exporta DcarelaFirebase y métodos para Auth y Firestore", () => {
  assert.match(firebaseAdapter, /window\.DcarelaFirebase\s*=/);
  assert.match(firebaseAdapter, /signInWithEmailAndPassword/);
  assert.match(firebaseAdapter, /getCollection/);
  assert.match(firebaseAdapter, /onSnapshot/);
});

test("firestore-seed.json incluye sucursales, miembros y cuentas financieras reales", () => {
  assert.ok(firestoreSeed.businesses.some(b => b.id === "dcarela"));
  assert.ok(firestoreSeed.businesses.some(b => b.id === "plaza-artesanal"));
  assert.ok(firestoreSeed.business_members.some(m => m.user_id === "admin"));
  assert.ok(firestoreSeed.fin_accounts.some(a => a.nombre === "Banco Popular"));
  assert.ok(firestoreSeed.fin_accounts.some(a => a.nombre === "Tarjeta de Credito Qik"));
  assert.ok(firestoreSeed.fin_accounts.some(a => a.nombre === "Efectivo"));
});

test("panel.html vincula firebase-config y firebase-adapter", () => {
  assert.match(panelHtml, /firebase-config\.js/);
  assert.match(panelHtml, /firebase-adapter\.js/);
});
