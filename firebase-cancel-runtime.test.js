const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAdapterForWindowsSale() {
  const documents = new Map([
    ['sync_events/source-win', {
      business_id: 'dcarela',
      device_id: 'pos-windows-01',
      event_id: 'source-win',
      event_type: 'VentaCobrada',
      entity_id: 'sale-win',
      source: 'pos_windows',
      payload: {
        ventaId: 'sale-win',
        folio: 27353,
        turnoId: 'turno-windows-cerrado',
        totalCobradoCentavos: 125000,
        lineas: [],
        pagos: [{ metodo: 'efectivo', montoCentavos: 125000 }]
      }
    }]
  ]);
  const transactionReads = [];
  const transactionWrites = [];
  const snapshot = value => ({ exists: value !== undefined, data: () => value });
  const db = {
    enablePersistence: async () => {},
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return { key, get: async () => snapshot(documents.get(key)) };
        }
      };
    },
    async runTransaction(callback) {
      return callback({
        async get(ref) {
          transactionReads.push(ref.key);
          if (!documents.has(ref.key)) throw new Error(`Lectura Firestore inexistente: ${ref.key}`);
          return snapshot(documents.get(ref.key));
        },
        set(ref, value) {
          transactionWrites.push({ key: ref.key, value });
          documents.set(ref.key, value);
        },
        update() {
          throw new Error('Una venta Windows no debe actualizar proyecciones web.');
        }
      });
    }
  };
  const auth = { currentUser: { uid: 'admin-uid', email: 'admin@dcarela.test' } };
  const firebase = {
    apps: [],
    initializeApp: () => ({}),
    app: () => ({}),
    auth: () => auth,
    firestore: () => db
  };
  firebase.firestore.FieldValue = { increment: value => value };
  const window = { __DCARELA_FIREBASE_CONFIG: { projectId: 'test' } };
  const context = vm.createContext({ window, firebase, console, Date, Math, Map, Promise, String, Number, Error });
  const source = fs.readFileSync(path.join(__dirname, 'firebase-adapter.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'firebase-adapter.js' });
  return { api: window.DcarelaFirebase, transactionReads, transactionWrites };
}

test('anula una venta Windows sin leer sales/ ni el futuro sync_event', async () => {
  const harness = loadAdapterForWindowsSale();
  const result = await harness.api.webSaleAction('sale.cancel', 'dcarela', 'admin', {
    ventaId: 'sale-win',
    motivo: 'devolucion',
    sourceEventId: 'source-win'
  }, 'cancel-win');

  assert.equal(result.ok, true);
  assert.equal(result.deduplicated, false);
  assert.deepEqual(harness.transactionReads, []);
  assert.equal(harness.transactionWrites.length, 1);
  assert.equal(harness.transactionWrites[0].key, 'sync_events/cancel-win');
  assert.equal(harness.transactionWrites[0].value.event_type, 'VentaCancelada');
  assert.equal(harness.transactionWrites[0].value.entity_id, 'sale-win');
  assert.equal(harness.transactionWrites[0].value.payload.sourceEventId, 'source-win');
});
