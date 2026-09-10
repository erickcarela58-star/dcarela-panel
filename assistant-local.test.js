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
    getFinanceAccountState: async () => ({ balances: [{id:'cash',balance:461500}] }),
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
  assert.equal(status.models[0].id, 'auto');
  assert.match(status.models[0].level, /Local primero/i);
  assert.equal(status.models[1].id, 'local-pos');
  assert.match(status.models[1].level, /Sin consumo de API/);
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
  assert.deepEqual(status.models.map(item => item.id), ['auto', 'local-pos', 'google-gemini']);
  const reply = await assistant.request('chat', ctx, { message: 'Hola, ayudame a planificar mi semana.', model: 'google-gemini' });
  assert.equal(reply.message.content, 'Respuesta real de Gemini.');
  assert.match(reply.effective_model, /Google Gemini/);
});

test('si Gemini agota cuota informa la caida y responde con el cerebro local', async () => {
  const ctx = { ...context(), remoteAssistant: async () => {
    throw new Error('RESOURCE_EXHAUSTED: quota exceeded');
  } };
  const status = await assistant.request('status', ctx);
  assert.deepEqual(status.models.map(item => item.id), ['auto', 'local-pos']);
  assert.match(status.providers_down.google, /limite temporal/i);
  const reply = await assistant.request('chat', ctx, {
    message: 'Hola, ayudame a planificar mi semana.', model: 'google-gemini'
  });
  assert.match(reply.message.content, /Google Gemini alcanzo su limite temporal/i);
  assert.match(reply.message.content, /Puedo seguir trabajando localmente/i);
  assert.match(reply.effective_model, /Cerebro local POS/i);
});

test('automatico entrega a Gemini una pregunta que el buscador local no puede contestar', async () => {
  const requests = [];
  const ctx = { ...context(adapter({
    getFinanceJournal: async () => [
      { id: 'food', fecha: `${localDay().slice(0, 7)}-01`, tipo: 'gasto', monto_centavos: 50000, categoria: 'Comida' },
      { id: 'sale', fecha: `${localDay().slice(0, 7)}-02`, tipo: 'ingreso', monto_centavos: 125000, descripcion: 'Venta POS' },
    ],
    getFinanceAccounts: async () => [{ id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa', saldo_actual_centavos: 75000 }],
  })), remoteAssistant: async body => {
    requests.push(body);
    if (body.action === 'assistantStatus') return { ok: true, configured: true };
    return { ok: true, content: 'Los gastos altos se concentran en Comida.', effective_model: 'Google Gemini 2.5 Flash' };
  } };
  const reply = await assistant.request('chat', ctx, {
    message: '¿Por qué mis gastos están altos este mes y qué debo hacer?',
    model: 'auto',
    custom_rules: '- No recomendar deuda nueva.',
  });
  assert.match(reply.message.content, /se concentran en Comida/);
  assert.doesNotMatch(reply.message.content, /No encontre movimientos/);
  const generation = requests.find(item => item.action === 'assistantGenerate');
  assert.ok(generation);
  assert.match(generation.operational_context, /CONTEXTO FINANCIERO VERIFICADO/);
  assert.match(generation.operational_context, /Comida: RD\$500\.00/);
  assert.match(generation.operational_context, /No recomendar deuda nueva/);
  assert.equal(reply.conversation.model, 'auto');
});

test('migra conversaciones antiguas que dejaban el modelo local predeterminado', async () => {
  const storage = memoryStorage();
  storage.setItem('dcarela.local-assistant.v1.dcarela.user-1', JSON.stringify([{
    id: 'legacy', business_id: 'dcarela', created_by_uid: 'user-1',
    title: 'Conversacion vieja', model: 'local-pos', messages: [], actions: [],
    created_at: '2026-08-28T00:00:00.000Z', updated_at: '2026-08-28T00:00:00.000Z',
  }]));
  const ctx = { ...context(), storage };
  const history = await assistant.request('history', ctx, { conversation_id: 'legacy' });
  assert.equal(history.conversation.model, 'auto');
  assert.equal(history.conversation.model_selection_version, 3);
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

const SEPTEMBER_EXPENSE_BATCH = 'gaste 765+425 en pizza y salchipapa. 200 en costos del mecanico. desde Qik: 979 en gasolina motor. 2,200 Aceite Hummer H3. 1,250 Aceite tucan RR 200. todos esos movimientos fueron hechos ayer 5';

function septemberBatchContext(accounts) {
  let writes = 0;
  const ctx = context(adapter({
    getFinanceAccounts: async () => accounts,
    adminAction: async () => { writes += 1; throw new Error('El lote no tiene aprobacion.'); },
  }));
  ctx.now = () => new Date('2026-09-06T15:00:00.000Z');
  return { ctx, writes: () => writes };
}

test('el lote real suma expresiones, conserva H3 y RR 200, hereda Qik y fecha ayer', async () => {
  const harness = septemberBatchContext([
    { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
    { id: 'qik-current', nombre: 'Cuenta corriente Qik', tipo: 'cuenta_corriente', estado: 'activa' },
  ]);
  const reply = await assistant.request('chat', harness.ctx, { message: SEPTEMBER_EXPENSE_BATCH });
  const actions = reply.conversation.actions;
  assert.equal(actions.length, 5);
  assert.deepEqual(actions.map(item => item.payload.montoCentavos), [119000, 20000, 97900, 220000, 125000]);
  assert.deepEqual(actions.map(item => item.payload.cuentaId), ['cash', 'cash', 'qik-current', 'qik-current', 'qik-current']);
  assert.deepEqual(actions.map(item => item.payload.descripcion), [
    'Pizza y salchipapa', 'Costos del mecanico', 'Gasolina motor', 'Aceite Hummer H3', 'Aceite tucan RR 200',
  ]);
  assert.ok(actions.every(item => item.action === 'fin.movement.create' && item.status === 'pending'
    && item.payload.fecha === '2026-09-05' && item.requires_admin_approval));
  assert.match(reply.message.content, /2026-09-05/);
  assert.match(reply.message.content, /inferencia pendiente/i);
  assert.equal(harness.writes(), 0);
});

test('Qik ambiguo no se asigna por defecto ni a efectivo ni a la tarjeta', async () => {
  const harness = septemberBatchContext([
    { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
    { id: 'qik-current', nombre: 'Cuenta corriente Qik', tipo: 'cuenta_corriente', estado: 'activa' },
    { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
  ]);
  const reply = await assistant.request('chat', harness.ctx, { message: SEPTEMBER_EXPENSE_BATCH });
  assert.equal(reply.conversation.actions.length, 2);
  assert.match(reply.message.content, /Falta precisar \*\*Qik\*\*/);
  assert.match(reply.message.content, /Cuenta corriente Qik/);
  assert.match(reply.message.content, /Tarjeta de credito Qik/);
  assert.match(reply.message.content, /Aceite Hummer H3/);
  assert.equal(harness.writes(), 0);
});

test('aclarar Qik retoma solo gastos incompletos y conserva efectivo y fecha original', async () => {
  const harness = septemberBatchContext([
    { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
    { id: 'qik-current', nombre: 'Cuenta corriente Qik', tipo: 'cuenta_corriente', estado: 'activa' },
    { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
  ]);
  const first = await assistant.request('chat', harness.ctx, { message: SEPTEMBER_EXPENSE_BATCH });
  const previousIds = first.conversation.actions.map(item => item.id);
  harness.ctx.now = () => new Date('2026-09-07T15:00:00.000Z');
  const resumed = await assistant.request('chat', harness.ctx, {
    conversation_id: first.conversation.id, message: 'Tarjeta de credito Qik',
  });
  const actions = resumed.conversation.actions;
  assert.equal(actions.length, 5);
  assert.deepEqual(actions.slice(0, 2).map(item => item.id), previousIds);
  assert.deepEqual(actions.map(item => item.payload.cuentaId), ['cash', 'cash', 'qik-card', 'qik-card', 'qik-card']);
  assert.deepEqual(actions.map(item => item.payload.montoCentavos), [119000, 20000, 97900, 220000, 125000]);
  assert.ok(actions.every(item => item.payload.fecha === '2026-09-05' && item.status === 'pending'));
  assert.equal(harness.writes(), 0);
});

test('una cabecera explicita elige la tarjeta Qik y conserva los centavos del lote', async () => {
  const harness = septemberBatchContext([
    { id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' },
    { id: 'qik-current', nombre: 'Cuenta corriente Qik', tipo: 'cuenta_corriente', estado: 'activa' },
    { id: 'qik-card', nombre: 'Tarjeta de credito Qik', tipo: 'tarjeta_credito', estado: 'activa' },
  ]);
  const reply = await assistant.request('chat', harness.ctx, {
    message: 'gaste en efectivo 765.25+425.50 en comida. desde Tarjeta de credito Qik: 2,200 Aceite Hummer H3. 1,250 Aceite tucan RR 200. todos fueron hechos ayer 5',
  });
  assert.deepEqual(reply.conversation.actions.map(item => item.payload.montoCentavos), [119075, 220000, 125000]);
  assert.deepEqual(reply.conversation.actions.map(item => item.payload.cuentaId), ['cash', 'qik-card', 'qik-card']);
  assert.equal(harness.writes(), 0);
});

test('una fecha ayer contradictoria detiene propuestas en lugar de cambiar silenciosamente el dia', async () => {
  const harness = septemberBatchContext([{ id: 'cash', nombre: 'Efectivo', tipo: 'efectivo', estado: 'activa' }]);
  const reply = await assistant.request('chat', harness.ctx, {
    message: 'gaste 100 en comida. 200 en cafe. todos esos movimientos fueron hechos ayer 4',
  });
  assert.equal(reply.conversation.actions.length, 0);
  assert.match(reply.message.content, /2026-09-05/);
  assert.match(reply.message.content, /Aclara la fecha/i);
  assert.equal(harness.writes(), 0);
});

test('el resumen excluye capital y conserva intereses como gasto sin escribir dinero', async () => {
  const day = localDay();
  const ctx = context(adapter({
    getFinanceMovements: async () => [
      { fecha: day, tipo: 'gasto', monto_centavos: 100000, afecta_resultado: false },
      { fecha: day, tipo: 'gasto', monto_centavos: 15000, afecta_resultado: true },
      { fecha: day, tipo: 'gasto', monto_centavos: 2000 },
      { fecha: day, tipo: 'gasto', monto_centavos: 5000, estado: 'anulado' },
    ],
    adminAction: async () => { throw new Error('La consulta no puede escribir'); },
  }));
  const result = await assistant.request('chat', ctx, { message: 'Dame el resumen de ventas de hoy, gastos y saldo en cuentas.' });
  assert.match(result.message.content, /Gastos registrados: \*\*2\*\* por \*\*RD\$\s?170\.00/);
});

test('resumen consulta el diario unico sin repetir ventas ni sumar capital o abonos al resultado',async()=>{
  const day=localDay();
  const rows=[{id:'principal',fecha:day,tipo:'gasto',monto_centavos:100000,afecta_resultado:false},
    {id:'interes',fecha:day,tipo:'gasto',monto_centavos:10000},
    {id:'abono',fecha:day,tipo:'ingreso',monto_centavos:15000,afecta_resultado:false}];
  Object.defineProperty(rows,'sales',{value:[{event_type:'VentaCobrada',payload:{vendidaEn:day,totalCobradoCentavos:30000}}]});
  const ctx=context(adapter({getFinanceJournal:async()=>rows,
    getSales:async()=>{throw new Error('no usar fuente paralela');},
    getSyncEvents:async()=>{throw new Error('no usar lectura parcial');},
    getFinanceMovements:async()=>{throw new Error('no usar fuente parcial');}}));
  const result=await assistant.request('chat',ctx,{message:'Dame el resumen de ventas de hoy, gastos y saldo en cuentas.'});
  assert.match(result.message.content,/Ventas confirmadas: \*\*1\*\* por \*\*RD\$300\.00/);
  assert.match(result.message.content,/Gastos registrados: \*\*1\*\* por \*\*RD\$100\.00/);
  assert.doesNotMatch(result.message.content,/consulta financiera parcial/);
});

test('resumen no presenta cero cuando falla el diario ni usa acumulador como saldo efectivo',async()=>{
  const ctx=context(adapter({getFinanceJournal:async()=>{throw new Error('offline');},getFinanceAccountState:async()=>{throw new Error('offline');}}));
  const result=await assistant.request('chat',ctx,{message:'Dame el resumen de ventas de hoy, gastos y saldo en cuentas.'});
  assert.match(result.message.content,/Ventas confirmadas: \*\*no disponibles/);
  assert.match(result.message.content,/Gastos registrados: \*\*no disponibles/);
  assert.match(result.message.content,/Saldo de cuentas: \*\*no disponible/);
});
