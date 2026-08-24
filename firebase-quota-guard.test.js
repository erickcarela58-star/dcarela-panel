const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adapter = fs.readFileSync(path.join(__dirname, 'firebase-adapter.js'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, 'panel.js'), 'utf8');

test('Firebase limita sync_events en servidor y usa el indice temporal publicado', () => {
  const start = adapter.indexOf("async getSyncEvents");
  const end = adapter.indexOf("async getSales", start);
  assert.ok(start >= 0 && end > start);
  const method = adapter.slice(start, end);
  assert.match(method, /where\('business_id', '==', businessId\)/);
  assert.match(method, /where\('received_at_cloud', '>=', String\(options\.from\)\)/);
  assert.match(method, /orderBy\('received_at_cloud', 'desc'\)\.limit\(maximum\)/);
  assert.doesNotMatch(method, /this\.getCollection\('sync_events'/);
});

test('las vistas Firebase nunca solicitan el historial completo sin ventana ni limite', () => {
  assert.doesNotMatch(panel, /DcarelaFirebase\.getSyncEvents\((?:branchId|BUSINESS)\)/);
  assert.match(panel, /getSyncEvents\(branchId, \{[\s\S]{0,220}limit: 5000/);
  assert.match(panel, /getSyncEvents\(BUSINESS, \{[\s\S]{0,180}limit: fetchLimit/);
  assert.match(panel, /fetchLimit = Math\.min\(5000/);
});

test('el cierre de caja limita sus eventos al turno abierto', () => {
  const start = adapter.indexOf("if (action === 'shift.close')");
  const end = adapter.indexOf("if (action === 'sale.cancel')", start);
  const method = adapter.slice(start, end);
  assert.match(method, /from: shift\.abiertoEn \|\| shift\.opened_at/);
  assert.match(method, /limit: 5000/);
});
