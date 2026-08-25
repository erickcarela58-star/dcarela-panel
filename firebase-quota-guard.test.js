const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adapter = fs.readFileSync(path.join(__dirname, 'firebase-adapter.js'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, 'panel.js'), 'utf8');
const firestoreIndexes = JSON.parse(fs.readFileSync(path.join(__dirname, 'firestore.indexes.json'), 'utf8'));

test('Firebase limita sync_events en servidor y usa el indice temporal publicado', () => {
  const start = adapter.indexOf("async getSyncEvents");
  const end = adapter.indexOf("async getSales", start);
  assert.ok(start >= 0 && end > start);
  const method = adapter.slice(start, end);
  assert.match(adapter, /const SYNC_EVENT_MAX_BATCH = 5000/);
  assert.match(adapter, /const SYNC_EVENT_DELTA_BATCH = 250/);
  assert.match(adapter, /const SYNC_EVENT_QUERY_TTL_MS = 2 \* 60 \* 1000/);
  assert.match(method, /where\('business_id', '==', businessId\)/);
  assert.match(method, /where\('received_at_cloud', '>=', from\)/);
  assert.match(method, /orderBy\('received_at_cloud', 'desc'\)\.limit\(maximum\)/);
  assert.match(method, /Math\.min\(SYNC_EVENT_MAX_BATCH/);
  assert.match(method, /syncEventQueryCache\.get\(queryKey\)/);
  assert.match(method, /cachedQuery\.promise/);
  assert.match(method, /syncEventQueryCache\.delete\(queryKey\)/);
  assert.match(method, /query\.get\(\{ source: 'cache' \}\)/);
  assert.match(method, /hasSyncQueryMarker\(queryKey\)/);
  assert.match(method, /Math\.min\(SYNC_EVENT_DELTA_BATCH, maximum\)/);
  assert.match(method, /if \(!cached\.length\) throw error/);
  assert.doesNotMatch(method, /this\.getCollection\('sync_events'/);

  const temporalIndex = firestoreIndexes.indexes.find(index =>
    index.collectionGroup === 'sync_events'
    && index.queryScope === 'COLLECTION'
    && index.fields.some(field => field.fieldPath === 'business_id' && field.order === 'ASCENDING')
    && index.fields.some(field => field.fieldPath === 'received_at_cloud' && field.order === 'DESCENDING'));
  assert.ok(temporalIndex, 'el índice versionado debe coincidir con orderBy desc');
});

test('las vistas Firebase nunca solicitan el historial completo sin ventana ni limite', () => {
  assert.doesNotMatch(panel, /DcarelaFirebase\.getSyncEvents\((?:branchId|BUSINESS)\)/);
  assert.match(panel, /getSyncEvents\(branchId, \{[\s\S]{0,220}limit: 1600/);
  assert.match(panel, /getSyncEvents\(BUSINESS, \{[\s\S]{0,180}limit: fetchLimit/);
  assert.match(panel, /fetchLimit = Math\.min\(5000/);
  assert.match(panel, /sourceEvents = await eventos\(null, extendedFrom, queryTo, 5000\)/);
  assert.match(panel, /ventasActivas\(from, to, 1600, sourceEvents\)/);
  assert.match(panel, /turnosDelRango\(from, to, active, sourceEvents\)/);
});

test('el cierre de caja limita sus eventos al turno abierto', () => {
  const start = adapter.indexOf("if (action === 'shift.close')");
  const end = adapter.indexOf("if (action === 'sale.cancel')", start);
  const method = adapter.slice(start, end);
  assert.match(method, /from: shift\.abiertoEn \|\| shift\.opened_at/);
  assert.match(method, /limit: 1600/);
});
