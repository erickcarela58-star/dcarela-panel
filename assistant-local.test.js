const assert = require('node:assert/strict');
const test = require('node:test');

const assistant = require('./assistant-local.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function adapter(overrides = {}) {
  const remote = new Map();
  return {
    getCurrentUser: () => ({ uid: 'user-1', email: 'owner@example.test' }),
    getCollection: async path => [...remote.values()].filter(item => item.__path === path),
    setDocument: async (path, id, data) => { remote.set(id, { ...data, id, __path: path }); },
    getSales: async () => [{ id: 'sale-1', vendidaEn: new Date().toISOString(), totalCobradoCentavos: 125000, status: 'closed' }],
    getFinanceMovements: async () => [{ id: 'expense-1', fecha: new Date().toISOString().slice(0, 10), tipo: 'gasto', monto_centavos: 25000, descripcion: 'Comida' }],
    getFinanceAccounts: async () => [{ id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa', saldo_actual_centavos: 461500 }],
    getCashShifts: async () => [{ id: 'shift-1', status: 'open', abiertoEn: new Date().toISOString(), cajaNombre: 'Caja web' }],
    getProducts: async () => [
      { id: 'p1', nombre: 'Producto correcto', activo: true, precioFinalCentavos: 5000, categoriaId: 'c1', stock: 8 },
      { id: 'p2', nombre: 'Producto sin precio', activo: true, precioFinalCentavos: 0, categoriaId: null, stock: -1 },
    ],
    getClients: async () => [{ id: 'c1', nombre: 'Cliente real', activo: true, saldoCentavos: 32000 }],
    adminAction: async () => ({ ok: true, message: 'Movimiento financiero registrado.' }),
    ...overrides,
  };
}

function context(customAdapter = adapter()) {
  return {
    adapter: customAdapter,
    businessId: 'dcarela',
    role: 'owner',
    user: { uid: 'user-1', id: 'user-1', email: 'owner@example.test' },
    storage: memoryStorage(),
  };
}

test('el cerebro local funciona sin proveedor HTTP y anuncia consumo cero de API', async () => {
  const status = await assistant.request('status', context());
  assert.equal(status.ok, true);
  assert.equal(status.local_engine, true);
  assert.equal(status.models[0].id, 'local-pos');
  assert.match(status.models[0].level, /Sin consumo de API/);
});

test('resumen y auditorias usan exclusivamente datos entregados por Firebase', async () => {
  const ctx = context();
  const summary = await assistant.request('chat', ctx, { message: 'Dame el resumen de ventas de hoy, gastos y saldo en cuentas.' });
  assert.match(summary.message.content, /RD\$\s?1,250\.00/);
  assert.match(summary.message.content, /RD\$\s?250\.00/);
  assert.match(summary.message.content, /RD\$\s?4,615\.00/);
  assert.match(summary.message.content, /no incluyen datos inventados/i);

  const stock = await assistant.request('chat', ctx, { message: 'Audita productos, precios e inventario.' });
  assert.match(stock.message.content, /Sin precio valido: \*\*1\*\*/);
  assert.match(stock.message.content, /Stock negativo: \*\*1\*\*/);
});

test('explica el motor local y el flujo seguro de varias ordenes sin confundirlos con gastos', async () => {
  const ctx = context();
  const engine = await assistant.request('chat', ctx, { message: 'Que motor usas, cuanto consumo de API y que modulos puedes consultar?' });
  assert.match(engine.message.content, /cero consumo de API generativa/i);
  assert.match(engine.message.content, /ventas, finanzas y gastos/i);
  const batch = await assistant.request('chat', ctx, { message: 'Explicame como registrar varias ordenes juntas.' });
  assert.match(batch.message.content, /clave unica por orden/i);
  assert.match(batch.message.content, /marco duplicados/i);
});

test('una escritura financiera queda pendiente hasta aprobacion explicita', async () => {
  const ctx = context();
  const proposed = await assistant.request('chat', ctx, { message: 'Registra un gasto de RD$375 en efectivo hoy por comida.' });
  assert.equal(proposed.conversation.actions.length, 1);
  assert.equal(proposed.conversation.actions[0].status, 'pending');
  assert.equal(proposed.conversation.actions[0].payload.montoCentavos, 37500);

  const resolved = await assistant.request('confirm_action', ctx, { action_id: proposed.conversation.actions[0].id });
  assert.equal(resolved.ok, true);
  const history = await assistant.request('history', ctx, { conversation_id: proposed.conversation.id });
  assert.equal(history.actions[0].status, 'executed');
});

test('si Firestore no permite guardar, conserva el historial local sin pantalla en blanco', async () => {
  const offline = adapter({
    getCollection: async () => { throw new Error('offline'); },
    setDocument: async () => { throw new Error('offline'); },
  });
  const ctx = context(offline);
  const result = await assistant.request('chat', ctx, { message: 'Revisa clientes y creditos.' });
  assert.match(result.message.content, /Cliente real/);
  const conversations = await assistant.request('conversations', ctx);
  assert.equal(conversations.conversations.length, 1);
});

test('una cuota agotada se informa como consulta parcial y no como dato inexistente', async () => {
  const rows = [];
  rows.partial_error = 'ledger no disponible';
  const ctx = context(adapter({ getFinanceMovements: async () => rows }));
  const result = await assistant.request('chat', ctx, { message: 'Busca el gasto de enmarcado.' });
  assert.match(result.message.content, /no pude completar la búsqueda/i);
  assert.match(result.message.content, /no crearé un gasto duplicado/i);
});
