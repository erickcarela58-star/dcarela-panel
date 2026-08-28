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

function localDay() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function adapter(overrides = {}) {
  const remote = new Map();
  const day = localDay();
  return {
    getCurrentUser: () => ({ uid: 'user-1', email: 'owner@example.test' }),
    getCollection: async path => [...remote.values()].filter(item => item.__path === path),
    setDocument: async (path, id, data) => { remote.set(id, { ...data, id, __path: path }); },
    getSales: async () => [{ id: 'sale-1', vendidaEn: `${day}T12:00:00`, totalCobradoCentavos: 125000, status: 'closed' }],
    getFinanceMovements: async () => [{ id: 'expense-1', fecha: day, tipo: 'gasto', monto_centavos: 25000, descripcion: 'Comida' }],
    getFinanceAccounts: async () => [{ id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa', saldo_actual_centavos: 461500 }],
    getCashShifts: async () => [{ id: 'shift-1', status: 'open', abiertoEn: `${day}T08:00:00`, cajaNombre: 'Caja web' }],
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

test('conserva los centavos y selecciona la tarjeta Qik indicada por el usuario', async () => {
  const ctx = context(adapter({
    getFinanceAccounts: async () => [
      { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
      { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
    ]
  }));
  const proposed = await assistant.request('chat', ctx, {
    message: 'registra un gasto de 3712.63 en la tarjeta de credito qik con motivo de comida'
  });
  const action = proposed.conversation.actions[0];
  assert.equal(action.payload.montoCentavos, 371263);
  assert.equal(action.payload.cuentaId, 'qik-card');
  assert.equal(action.payload.descripcion, 'comida');
  assert.match(proposed.message.content, /RD\$3,712\.63/);
  assert.match(proposed.message.content, /Tarjeta de credito Qik/);
});

test('una correccion cambia la cuenta de la propuesta pendiente sin desviarse a creditos', async () => {
  const ctx = context(adapter({
    getFinanceAccounts: async () => [
      { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
      { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
    ]
  }));
  const first = await assistant.request('chat', ctx, {
    message: 'registra un gasto de 3712.63 en efectivo con motivo de comida'
  });
  const corrected = await assistant.request('chat', ctx, {
    conversation_id: first.conversation.id,
    message: 'no fue en efectivo. claramente fue con la tarjeta de credito qik'
  });
  assert.equal(corrected.conversation.actions.length, 1);
  assert.equal(corrected.conversation.actions[0].payload.cuentaId, 'qik-card');
  assert.equal(corrected.conversation.actions[0].payload.montoCentavos, 371263);
  assert.match(corrected.message.content, /Corregi la propuesta pendiente/);
  assert.doesNotMatch(corrected.message.content, /Creditos y clientes/);
});

test('ofrece Google cuando el servidor confirma la API y conserva el cerebro local', async () => {
  const ctx = { ...context(), remoteAssistant: async body => body.action === 'assistantStatus'
    ? { ok: true, configured: true }
    : { ok: true, content: 'Respuesta real de Gemini.', effective_model: 'Google Gemini 2.5 Flash' } };
  const status = await assistant.request('status', ctx);
  assert.deepEqual(status.models.map(item => item.id), ['local-pos', 'google-gemini']);
  const reply = await assistant.request('chat', ctx, { message: 'Hola, ayudame a planificar mi semana.', model: 'google-gemini' });
  assert.equal(reply.message.content, 'Respuesta real de Gemini.');
  assert.match(reply.effective_model, /Google Gemini/);
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

test('una colección vacía sin evidencia del ledger Windows tampoco afirma ausencia', async () => {
  const ctx = context(adapter({ getFinanceMovements: async () => [] }));
  const result = await assistant.request('chat', ctx, { message: 'Busca el gasto Ladron amigo de Carela.' });
  assert.match(result.message.content, /vista verificable del ledger Windows/i);
  assert.match(result.message.content, /no crearé un gasto duplicado/i);
});

test('la consulta financiera ignora instrucciones de solo lectura y encuentra el gasto', async () => {
  const ctx = context(adapter({
    getFinanceMovements: async () => [{
      id: 'ledger-01', source: 'pos_sync_event', tipo: 'GASTO',
      descripcion: 'Ladron amigo de carela', importe_dop_centavos: 250000,
      fecha: '2026-08-23T03:59:00Z'
    }]
  }));
  const result = await assistant.request('chat', ctx, {
    message: 'Busca el gasto Ladron amigo de Carela. Solo consulta, no registres nada.'
  });
  assert.match(result.message.content, /Ladron amigo de carela/i);
  assert.match(result.message.content, /RD\$2,500\.00/);
  assert.doesNotMatch(result.message.content, /No encontre|No pude completar/i);
});

test('una correccion sin nombrar la tarjeta usa la unica cuenta que queda viva', async () => {
  const ctx = context(adapter({
    getFinanceAccounts: async () => [
      { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
      { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
    ]
  }));
  const first = await assistant.request('chat', ctx, {
    message: 'registra un gasto de 3712.63 en efectivo con motivo de comida'
  });
  const corrected = await assistant.request('chat', ctx, {
    conversation_id: first.conversation.id,
    message: 'no fue en efectivo. claramente fue con la tarjeta de credito'
  });
  assert.equal(corrected.conversation.actions.length, 1);
  assert.equal(corrected.conversation.actions[0].payload.cuentaId, 'qik-card');
  assert.equal(corrected.conversation.actions[0].payload.montoCentavos, 371263);
  assert.doesNotMatch(corrected.message.content, /Creditos y clientes/);
});

test('con varias tarjetas la correccion ambigua pregunta y jamas conserva la cuenta negada', async () => {
  const ctx = context(adapter({
    getFinanceAccounts: async () => [
      { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
      { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
      { id: 'visa-card', nombre: 'Tarjeta de credito Visa Popular', tipo: 'tarjeta_credito', estado: 'activa' },
    ]
  }));
  const first = await assistant.request('chat', ctx, {
    message: 'registra un gasto de 3712.63 en efectivo con motivo de comida'
  });
  const corrected = await assistant.request('chat', ctx, {
    conversation_id: first.conversation.id,
    message: 'no fue en efectivo. claramente fue con la tarjeta de credito'
  });
  const pending = corrected.conversation.actions[0];
  assert.equal(corrected.conversation.actions.length, 1);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.payload.cuentaId, 'cash');
  assert.match(corrected.message.content, /no era la cuenta correcta/);
  assert.match(corrected.message.content, /pendiente y sin aplicar/);
  assert.match(corrected.message.content, /Tarjeta de credito Qik/);
  assert.doesNotMatch(corrected.message.content, /Creditos y clientes/);
});

test('una negacion sin alternativa nunca reconfirma la cuenta rechazada', async () => {
  const ctx = context(adapter({
    getFinanceAccounts: async () => [
      { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
      { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
      { id: 'visa-card', nombre: 'Tarjeta de credito Visa Popular', tipo: 'tarjeta_credito', estado: 'activa' },
    ]
  }));
  const first = await assistant.request('chat', ctx, {
    message: 'registra un gasto de 3712.63 en efectivo con motivo de comida'
  });
  const corrected = await assistant.request('chat', ctx, {
    conversation_id: first.conversation.id,
    message: 'no fue efectivo'
  });
  assert.equal(corrected.conversation.actions[0].payload.cuentaId, 'cash');
  assert.equal(corrected.conversation.actions[0].status, 'pending');
  assert.match(corrected.message.content, /Dime el nombre exacto de la cuenta/);
});
