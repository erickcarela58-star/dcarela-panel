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

function quotaStorage() {
  return {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
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

test('el resumen integra las ventas Windows del ledger y excluye sus anulaciones', async () => {
  const day = localDay();
  const ctx = context(adapter({
    getSales: async () => [],
    getSyncEvents: async (_businessId, options) => {
      assert.match(options.from, new RegExp(`^${day}T`));
      assert.ok(new Date(options.to).getTime() > new Date(options.from).getTime());
      assert.equal(options.limit, 2000);
      return [
        { event_id: 'event-1', entity_id: 'sale-1', event_type: 'VentaCobrada', created_at_local: `${day}T10:00:00`, payload: { ventaId: 'sale-1', totalCobradoCentavos: 15000 } },
        { event_id: 'event-2', entity_id: 'sale-2', event_type: 'VentaCobrada', created_at_local: `${day}T11:00:00`, payload: { ventaId: 'sale-2', totalCobradoCentavos: 25000 } },
        { event_id: 'event-3', entity_id: 'sale-2', event_type: 'VentaCancelada', created_at_local: `${day}T12:00:00`, payload: { ventaId: 'sale-2' } },
      ];
    },
  }));
  const summary = await assistant.request('chat', ctx, { message: 'Dame el resumen de ventas de hoy.' });
  assert.match(summary.message.content, /Ventas confirmadas: \*\*1\*\*/);
  assert.match(summary.message.content, /RD\$\s?150\.00/);
  assert.doesNotMatch(summary.message.content, /consulta de ventas parcial/i);
});

test('el resumen advierte cuando no puede verificar el ledger POS Windows', async () => {
  const ctx = context(adapter({
    getSales: async () => [],
    getSyncEvents: async () => { throw new Error('offline'); },
  }));
  const summary = await assistant.request('chat', ctx, { message: 'Dame el resumen de ventas de hoy.' });
  assert.match(summary.message.content, /consulta de ventas parcial/i);
  assert.match(summary.message.content, /ledger POS Windows/i);
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

test('convierte una conciliacion larga en un lote financiero completo y revisable', async () => {
  const executed = [];
  const ctx = context(adapter({
    getFinanceAccounts: async () => [
      { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
      { id: 'popular', nombre: 'Banco Popular', tipo: 'banco', estado: 'activa' },
      { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
      { id: 'current', nombre: 'Cuenta corriente', tipo: 'cuenta_corriente', estado: 'activa' },
    ],
    getFinanceCards: async () => [{ cuenta_id: 'qik-card', limite_credito_centavos: 1000000 }],
    adminAction: async (action, businessId, role, entityId, payload) => {
      executed.push({ action, businessId, role, entityId, payload });
      return { ok: true, message: 'Aplicado.' };
    },
  }));
  const message = 'gaste en efectivo las siguientes cantidades>>> 260 en cafe, 500 en comida, 500 en pasaje para comida y todos los gastos del mes, solo quedando pendiente el viajante. pague las vacaciones de genesis que en total hicieron 9,900 pesos. pague la nomina pendiente de 8500. pague la luz edeeste de 4755.53. el internet wind telecom de 2981.05. transferi 3mil pesos a la cuenta del popular, de el dinero transferido y ventas abone 5mil pesos a la tarjeta de credito qik desde el popular. he realizado multiples gastos pero esta es la conciliacion total de mis cuentas> en el banco popular 3,329.13. en efectivo tengo la cantidad de 12,820. en qik tengo la suma de 5814.09 disponible en la tarjeta de credito, en la cuenta corriente tengo 33.83.';
  const proposed = await assistant.request('chat', ctx, { message });
  const actions = proposed.conversation.actions;
  assert.equal(actions.length, 13);
  assert.match(proposed.message.content, /13 propuestas pendientes/i);
  assert.match(proposed.message.content, /No aplique ningun movimiento/i);

  const expenses = actions.filter(item => item.action === 'fin.movement.create');
  assert.equal(expenses.length, 7);
  assert.deepEqual(expenses.map(item => item.payload.montoCentavos), [26000, 50000, 50000, 990000, 850000, 475553, 298105]);
  assert.ok(expenses.some(item => /Internet Wind Telecom/i.test(item.payload.descripcion)));

  const transfer = actions.find(item => item.action === 'fin.transfer.create');
  assert.equal(transfer.payload.montoCentavos, 300000);
  assert.equal(transfer.payload.cuentaOrigenId, 'cash');
  assert.equal(transfer.payload.cuentaDestinoId, 'popular');
  const cardPayment = actions.find(item => item.action === 'fin.card.payment');
  assert.equal(cardPayment.payload.montoCentavos, 500000);
  assert.equal(cardPayment.payload.cuentaOrigenId, 'popular');
  assert.equal(cardPayment.payload.cuentaDestinoId, 'qik-card');

  const reconciliations = actions.filter(item => item.action === 'fin.account.reconcile');
  assert.equal(reconciliations.length, 4);
  assert.equal(reconciliations.find(item => item.payload.cuentaId === 'popular').payload.saldoObjetivoCentavos, 332913);
  assert.equal(reconciliations.find(item => item.payload.cuentaId === 'cash').payload.saldoObjetivoCentavos, 1282000);
  assert.equal(reconciliations.find(item => item.payload.cuentaId === 'qik-card').payload.saldoObjetivoCentavos, -418591);
  assert.equal(reconciliations.find(item => item.payload.cuentaId === 'current').payload.saldoObjetivoCentavos, 3383);

  await assistant.request('confirm_action', ctx, { action_id: transfer.id });
  assert.equal(executed.length, 1);
  assert.equal(executed[0].action, 'fin.transfer.create');
  assert.equal(executed[0].payload.montoCentavos, 300000);
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

test('si Gemini agota cuota informa la caida y responde con el cerebro local', async () => {
  const ctx = { ...context(), remoteAssistant: async () => {
    throw new Error('RESOURCE_EXHAUSTED: quota exceeded');
  } };
  const status = await assistant.request('status', ctx);
  assert.deepEqual(status.models.map(item => item.id), ['local-pos']);
  assert.match(status.providers_down.google, /limite temporal/i);
  const reply = await assistant.request('chat', ctx, {
    message: 'Hola, ayudame a planificar mi semana.', model: 'google-gemini'
  });
  assert.match(reply.message.content, /Google Gemini alcanzo su limite temporal/i);
  assert.match(reply.message.content, /Puedo seguir trabajando localmente/i);
  assert.match(reply.effective_model, /Cerebro local POS/i);
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

test('si localStorage agota cuota, la memoria mantiene chats nuevos separados y actuales', async () => {
  const offline = adapter({
    getCollection: async () => { throw new Error('offline'); },
    setDocument: async () => { throw new Error('offline'); },
  });
  const ctx = { ...context(offline), storage: quotaStorage() };
  const first = await assistant.request('chat', ctx, { message: 'Primer chat independiente.' });
  const second = await assistant.request('chat', ctx, { message: 'Segundo chat independiente.' });
  assert.notEqual(first.conversation.id, second.conversation.id);
  const conversations = await assistant.request('conversations', ctx);
  assert.equal(conversations.conversations.length, 2);
  const firstHistory = await assistant.request('history', ctx, { conversation_id: first.conversation.id });
  const secondHistory = await assistant.request('history', ctx, { conversation_id: second.conversation.id });
  assert.match(firstHistory.messages[0].content, /Primer chat/);
  assert.match(secondHistory.messages[0].content, /Segundo chat/);
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
