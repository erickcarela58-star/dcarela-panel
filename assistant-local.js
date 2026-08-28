/**
 * Cerebro local del panel D' Carela.
 *
 * Resuelve consultas operativas con datos Firebase ya autorizados. No depende
 * de Supabase, OpenRouter, Gemini ni de una API generativa. Las conversaciones
 * se conservan primero en el navegador y, cuando las reglas lo permiten, en la
 * ruta privada Firestore del usuario. Ninguna respuesta inventa saldos, ventas,
 * stock o gastos para completar una pantalla.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DcarelaLocalAssistant = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';

  const MEMORY = new Map();
  const MAX_CONVERSATIONS = 80;
  const MAX_MESSAGES = 160;
  const MAX_CONTENT = 16000;

  const nowIso = () => new Date().toISOString();
  const uuid = () => root?.crypto?.randomUUID?.()
    || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  const text = (value, max = MAX_CONTENT) => String(value ?? '').trim().slice(0, max);
  const number = (...values) => {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };
  const normalize = value => text(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
  const money = cents => new Intl.NumberFormat('es-DO', {
    style: 'currency', currency: 'DOP', minimumFractionDigits: 2
  }).format(number(cents) / 100);
  const dayOf = value => text(value, 40).slice(0, 10);
  const today = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  const roleAdmin = role => ['owner', 'admin'].includes(normalize(role));
  const capabilities = role => ({
    can_use: true,
    can_read_sales: true,
    can_read_finance: true,
    can_write_catalog: roleAdmin(role),
    can_adjust_inventory: roleAdmin(role),
    can_manage_finance: roleAdmin(role),
    can_manage_business: roleAdmin(role),
    can_manage_users: roleAdmin(role),
  });

  function ensureContext(raw = {}) {
    const adapter = raw.adapter || root?.DcarelaFirebase;
    const user = raw.user || adapter?.getCurrentUser?.();
    const businessId = text(raw.businessId || raw.business_id, 120);
    if (!adapter) throw new Error('El cerebro local no encuentra el adaptador Firebase.');
    if (!user?.uid && !user?.id) throw new Error('La sesion Firebase vencio. Inicia sesion nuevamente.');
    if (!businessId) throw new Error('Selecciona una sucursal antes de usar el asistente.');
    return {
      adapter,
      user: { uid: user.uid || user.id, email: user.email || '' },
      businessId,
      role: text(raw.role || 'viewer', 40).toLowerCase(),
      storage: raw.storage || root?.localStorage || null,
      remoteAssistant: typeof raw.remoteAssistant === 'function' ? raw.remoteAssistant : null,
    };
  }

  function storageKey(ctx) {
    return `dcarela.local-assistant.v1.${ctx.businessId}.${ctx.user.uid}`;
  }

  function remotePath(ctx) {
    return `assistant_users/${ctx.user.uid}/conversations`;
  }

  function sanitizeMessage(message) {
    const metadata = message?.metadata && typeof message.metadata === 'object'
      ? { ...message.metadata } : {};
    if (Array.isArray(metadata.attachments)) {
      metadata.attachments = metadata.attachments.map(file => ({
        name: text(file?.name, 180), mime: text(file?.mime, 120), size: number(file?.size)
      }));
    }
    return {
      id: text(message?.id, 120) || uuid(),
      role: message?.role === 'user' ? 'user' : 'assistant',
      content: text(message?.content),
      metadata,
      created_at: text(message?.created_at, 40) || nowIso(),
    };
  }

  function sanitizeAction(action) {
    return {
      id: text(action?.id, 120) || uuid(),
      action: text(action?.action, 120),
      summary: text(action?.summary, 800),
      status: ['pending', 'executed', 'cancelled', 'error'].includes(action?.status)
        ? action.status : 'pending',
      risk_level: text(action?.risk_level, 20) || 'high',
      required_capability: text(action?.required_capability, 80) || null,
      requires_admin_approval: action?.requires_admin_approval !== false,
      reversible: action?.reversible === true,
      payload: action?.payload && typeof action.payload === 'object' ? action.payload : {},
      result: action?.result && typeof action.result === 'object' ? action.result : null,
      created_at: text(action?.created_at, 40) || nowIso(),
      resolved_at: text(action?.resolved_at, 40) || null,
    };
  }

  function sanitizeConversation(conversation, ctx) {
    return {
      id: text(conversation?.id, 120) || uuid(),
      business_id: ctx.businessId,
      created_by_uid: ctx.user.uid,
      created_by_email: ctx.user.email,
      title: text(conversation?.title, 120) || 'Nueva conversacion',
      model: 'local-pos',
      engine: 'local-firebase',
      messages: (conversation?.messages || []).slice(-MAX_MESSAGES).map(sanitizeMessage),
      actions: (conversation?.actions || []).slice(-80).map(sanitizeAction),
      created_at: text(conversation?.created_at, 40) || nowIso(),
      updated_at: text(conversation?.updated_at, 40) || nowIso(),
      archived_at: text(conversation?.archived_at, 40) || null,
    };
  }

  function readLocal(ctx) {
    const key = storageKey(ctx);
    if (!ctx.storage && MEMORY.has(key)) return MEMORY.get(key);
    let parsed = [];
    try {
      const raw = ctx.storage?.getItem?.(key);
      const value = raw ? JSON.parse(raw) : [];
      if (Array.isArray(value)) parsed = value.map(item => sanitizeConversation(item, ctx));
    } catch {}
    if (!ctx.storage) MEMORY.set(key, parsed);
    return parsed;
  }

  function writeLocal(ctx, conversations) {
    const clean = conversations
      .map(item => sanitizeConversation(item, ctx))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, MAX_CONVERSATIONS);
    if (!ctx.storage) MEMORY.set(storageKey(ctx), clean);
    try { ctx.storage?.setItem?.(storageKey(ctx), JSON.stringify(clean)); } catch {}
    return clean;
  }

  async function readConversations(ctx) {
    const local = readLocal(ctx);
    try {
      const remote = await ctx.adapter.getCollection(remotePath(ctx), []);
      const merged = new Map(local.map(item => [item.id, item]));
      (remote || [])
        .filter(item => item.business_id === ctx.businessId && item.created_by_uid === ctx.user.uid)
        .forEach(item => {
          const clean = sanitizeConversation(item, ctx);
          const previous = merged.get(clean.id);
          if (!previous || String(clean.updated_at) >= String(previous.updated_at)) merged.set(clean.id, clean);
        });
      return writeLocal(ctx, [...merged.values()]);
    } catch {
      return local;
    }
  }

  async function saveConversation(ctx, conversation) {
    const clean = sanitizeConversation({ ...conversation, updated_at: nowIso() }, ctx);
    const conversations = readLocal(ctx).filter(item => item.id !== clean.id);
    writeLocal(ctx, [clean, ...conversations]);
    try {
      await ctx.adapter.setDocument(remotePath(ctx), clean.id, clean, false);
      clean.synced = true;
    } catch {
      clean.synced = false;
    }
    return clean;
  }

  const saleTotal = sale => number(
    sale?.totalCobradoCentavos, sale?.total_cobrado_centavos,
    sale?.totalCalculadoCentavos, sale?.total_centavos, sale?.total
  );
  const saleDate = sale => dayOf(sale?.vendidaEn || sale?.created_at || sale?.created_at_local);
  const movementAmount = item => number(
    item?.monto_centavos, item?.montoCentavos,
    item?.importe_dop_centavos, item?.importeDopCentavos,
    item?.amount_cents
  );
  const movementDate = item => dayOf(item?.fecha || item?.created_at || item?.updated_at);
  const isExpense = item => ['gasto', 'egreso', 'salida', 'ajuste_negativo'].includes(normalize(item?.tipo));

  async function loadSummary(ctx, requestedDay = today()) {
    const settled = await Promise.allSettled([
      ctx.adapter.getSales(ctx.businessId, 2000),
      ctx.adapter.getFinanceMovements(ctx.businessId),
      ctx.adapter.getFinanceAccounts(ctx.businessId),
      ctx.adapter.getCashShifts(ctx.businessId, 80),
    ]);
    const value = index => settled[index].status === 'fulfilled' ? (settled[index].value || []) : [];
    const sales = value(0).filter(item => saleDate(item) === requestedDay && normalize(item.status) !== 'cancelled');
    const financeRows = value(1);
    const expenses = financeRows.filter(item => movementDate(item) === requestedDay && isExpense(item) && normalize(item.estado) !== 'anulado');
    const accounts = value(2).filter(item => item.oculta !== true && normalize(item.estado || 'activa') !== 'inactiva');
    const shifts = value(3);
    const salesCents = sales.reduce((sum, item) => sum + saleTotal(item), 0);
    const expenseCents = expenses.reduce((sum, item) => sum + movementAmount(item), 0);
    const accountCents = accounts.reduce((sum, item) => sum + number(item.saldo_actual_centavos, item.saldoActualCentavos, item.saldo_inicial_centavos), 0);
    const openShift = shifts.find(item => normalize(item.status) === 'open') || null;
    return `### Resumen real del ${requestedDay}\n\n`
      + `- Ventas confirmadas: **${sales.length}** por **${money(salesCents)}**.\n`
      + `- Gastos registrados: **${expenses.length}** por **${money(expenseCents)}**.\n`
      + `- Saldo visible en ${accounts.length} cuenta(s): **${money(accountCents)}**.\n`
      + `- Caja web: **${openShift ? 'turno abierto' : 'sin turno abierto'}**.\n`
      + (financeRows.partial_error ? '- Advertencia: **consulta financiera parcial**; Firebase no entregó el ledger Windows.\n' : '')
      + '\n'
      + 'Los valores provienen de Firebase y no incluyen datos inventados ni estimaciones.';
  }

  async function auditProducts(ctx) {
    const rows = await ctx.adapter.getProducts(ctx.businessId);
    const active = (rows || []).filter(item => item.activo !== false);
    const noPrice = active.filter(item => number(item.precioFinalCentavos, item.precio_final_centavos) <= 0);
    const noCategory = active.filter(item => !text(item.categoriaId || item.categoria_id || item.categoriaNombre));
    const negative = active.filter(item => item.usaInventario !== false && number(item.stock) < 0);
    const low = active.filter(item => item.usaInventario !== false && number(item.stock) >= 0 && number(item.stock) <= 2);
    const examples = [...new Set([...negative, ...noPrice, ...noCategory, ...low].map(item => text(item.nombre, 100)).filter(Boolean))].slice(0, 8);
    return `### Auditoria local de catalogo\n\n`
      + `- Productos activos: **${active.length}**.\n`
      + `- Sin precio valido: **${noPrice.length}**.\n`
      + `- Sin categoria: **${noCategory.length}**.\n`
      + `- Stock negativo: **${negative.length}**.\n`
      + `- Stock entre 0 y 2: **${low.length}**.\n`
      + (examples.length ? `\nRevisar primero: ${examples.join(', ')}.` : '\nNo encontre incidencias en esos controles.');
  }

  async function auditClients(ctx) {
    const rows = await ctx.adapter.getClients(ctx.businessId);
    const clients = (rows || []).filter(item => item.activo !== false);
    const debtors = clients.filter(item => number(item.saldoCentavos, item.saldo_centavos) > 0)
      .sort((a, b) => number(b.saldoCentavos, b.saldo_centavos) - number(a.saldoCentavos, a.saldo_centavos));
    const debt = debtors.reduce((sum, item) => sum + number(item.saldoCentavos, item.saldo_centavos), 0);
    const top = debtors.slice(0, 5).map(item => `- ${text(item.nombre, 100)}: **${money(number(item.saldoCentavos, item.saldo_centavos))}**`).join('\n');
    return `### Creditos y clientes\n\n- Clientes activos: **${clients.length}**.\n- Deudores: **${debtors.length}**.\n- Cuentas por cobrar: **${money(debt)}**.`
      + (top ? `\n\nMayores balances:\n${top}` : '');
  }

  async function auditCash(ctx) {
    const shifts = await ctx.adapter.getCashShifts(ctx.businessId, 100);
    const open = (shifts || []).find(item => normalize(item.status) === 'open');
    const latest = (shifts || [])[0];
    if (!latest) return 'No hay turnos de caja sincronizados para esta sucursal.';
    const current = open || latest;
    const state = open ? 'abierto' : 'cerrado';
    const difference = number(current.diferenciaCentavos, current.diferencia_centavos);
    return `### Estado de caja\n\n- Turno: **${state}**.\n- Caja: **${text(current.cajaNombre || current.caja_nombre || 'Caja web')}**.\n- Apertura: **${text(current.abiertoEn || current.opened_at || '--')}**.\n`
      + (open ? '- El efectivo esperado permanece protegido hasta cerrar el arqueo.'
        : `- Diferencia del ultimo cierre: **${money(difference)}**.`);
  }

  async function searchFinance(ctx, query) {
    const ignored = new Set([
      'busca', 'buscar', 'gasto', 'gastos', 'pago', 'pagos', 'movimiento',
      'solo', 'consulta', 'consultar', 'registra', 'registrar', 'registres',
      'nada', 'crea', 'crear', 'crees', 'favor'
    ]);
    const terms = normalize(query).split(' ').filter(word => word.length > 2 && !ignored.has(word));
    const rows = await ctx.adapter.getFinanceMovements(ctx.businessId);
    const matches = (rows || []).filter(item => {
      const haystack = normalize([item.payee, item.descripcion, item.nota, item.referencia, item.tipo, item.fecha].join(' '));
      return terms.length && terms.every(term => haystack.includes(term));
    }).slice(0, 12);
    const hasWindowsLedger = (rows || []).some(item => item?.source === 'pos_sync_event');
    if (!matches.length && (rows.partial_error || !hasWindowsLedger)) return 'No pude completar la búsqueda: **Firebase no entregó una vista verificable del ledger Windows**. El evento puede estar sincronizado aunque la lectura esté limitada o todavía no sea visible para el panel; vuelve a intentar después de restablecerse la cuota. No crearé un gasto duplicado.';
    if (!matches.length) return `No encontre movimientos confirmados que coincidan con **${text(query, 160)}**. No creare un gasto para rellenar ese vacio.`;
    return `### Movimientos encontrados (${matches.length})\n\n` + matches.map(item =>
      `- ${movementDate(item) || '--'} · ${text(item.descripcion || item.payee || item.tipo, 140)} · **${money(movementAmount(item))}**`
    ).join('\n');
  }

  function parseMoneyCents(raw) {
    let value = String(raw || '').replace(/\s+/g, '').replace(/^(?:RD\$|DOP\$?)/i, '');
    if (!/^\d[\d.,]*$/.test(value)) return null;
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    const separator = Math.max(lastComma, lastDot);
    let integer = value;
    let fraction = '';
    if (separator >= 0) {
      const tail = value.slice(separator + 1);
      const separatorCount = (value.match(/[.,]/g) || []).length;
      const decimal = tail.length >= 1 && tail.length <= 2;
      if (decimal) {
        integer = value.slice(0, separator).replace(/[.,]/g, '');
        fraction = tail.padEnd(2, '0');
      } else if (separatorCount >= 1) {
        integer = value.replace(/[.,]/g, '');
      }
    }
    const units = Number(integer || '0');
    const cents = Number(fraction || '0');
    if (!Number.isSafeInteger(units) || !Number.isInteger(cents)) return null;
    const total = units * 100 + cents;
    return Number.isSafeInteger(total) && total > 0 ? total : null;
  }

  function extractMoneyAmounts(prompt) {
    return [...text(prompt).matchAll(/(?:RD\$\s*|DOP\s*)?(\d[\d.,]*)/gi)]
      .map(match => ({ raw: match[0], index: match.index || 0, cents: parseMoneyCents(match[1]) }))
      .filter(item => item.cents !== null);
  }

  function activeFinanceAccounts(rows) {
    return (rows || []).filter(item => item.oculta !== true
      && normalize(item.estado || 'activa') !== 'inactiva');
  }

  function accountScore(account, prompt) {
    const query = normalize(prompt);
    const name = normalize(account.nombre || account.name);
    const kind = normalize(`${account.tipo || ''} ${account.subtipo || ''} ${name}`);
    let score = 0;
    for (const token of name.split(' ').filter(word => word.length >= 3)) {
      if (query.split(' ').includes(token)) score += 8;
    }
    if (/\bqik\b/.test(query) && /\bqik\b/.test(name)) score += 100;
    if (/\bpopular\b/.test(query) && /\bpopular\b/.test(name)) score += 100;
    if (/tarjeta( de)? credito/.test(query) && /tarjeta|credito/.test(kind)) score += 35;
    if (/cuenta corriente/.test(query) && /corriente/.test(kind)) score += 35;
    if (/\befectivo\b|\bcaja\b/.test(query) && /efectivo|caja/.test(kind)) score += 35;
    if (/transferencia/.test(query) && /banco|corriente|ahorro/.test(kind)) score += 15;
    return score;
  }

  async function resolveExpenseAccount(ctx, prompt) {
    const accounts = activeFinanceAccounts(await ctx.adapter.getFinanceAccounts(ctx.businessId));
    const ranked = accounts.map(account => ({ account, score: accountScore(account, prompt) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0]?.score > 0 && ranked[0].score > (ranked[1]?.score || 0)) return ranked[0].account;
    if (accounts.length === 1) return accounts[0];
    return null;
  }

  function expenseDescription(prompt, amountRaw, account) {
    const explicit = String(prompt).match(/(?:con\s+motivo\s+de|por\s+concepto\s+de|concepto\s*:?|motivo\s*:?)\s+(.+)$/i)
      || String(prompt).match(/\bpor\s+(?!RD\$|DOP|\d)(.+)$/i);
    if (explicit?.[1]) return text(explicit[1], 500).replace(/[.\s]+$/g, '').trim();
    let cleaned = String(prompt).replace(amountRaw, ' ');
    if (account?.nombre) cleaned = cleaned.replace(new RegExp(String(account.nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
    return text(cleaned
      .replace(/\b(registra(?:r)?|anota(?:r)?|un|una|gasto|de|en|hoy|pesos?|rd|dop|tarjeta|credito|cuenta|efectivo|con|motivo|concepto)\b/gi, ' ')
      .replace(/\s+/g, ' '), 500).trim();
  }

  async function revisePendingExpense(ctx, prompt, conversation) {
    const normalized = normalize(prompt);
    if (!/no fue|fue (con|en)|cambia|corrige|correcto|realmente|tarjeta|cuenta/.test(normalized)) return null;
    const action = [...(conversation?.actions || [])].reverse()
      .find(item => item.status === 'pending' && item.action === 'fin.movement.create');
    if (!action) return null;
    const account = await resolveExpenseAccount(ctx, prompt);
    if (!account) return null;
    action.payload.cuentaId = account.id;
    action.payload.cuentaNombre = text(account.nombre, 120);
    action.summary = `Registrar gasto de ${money(action.payload.montoCentavos)} desde ${text(account.nombre, 120)}: ${text(action.payload.descripcion, 300)}`;
    return {
      content: `Corregi la propuesta pendiente: **${money(action.payload.montoCentavos)}** se registrara desde **${text(account.nombre, 120)}** por “${text(action.payload.descripcion, 300)}”. No se aplico ningun movimiento; revisa y pulsa Aplicar solo si ahora esta correcto.`,
      action,
      revised: true,
    };
  }

  async function buildExpenseProposal(ctx, prompt) {
    if (!roleAdmin(ctx.role)) return null;
    const normalized = normalize(prompt);
    if (!/registr(ar|a).*gasto|anota.*gasto/.test(normalized)) return null;
    const amounts = extractMoneyAmounts(prompt);
    if (amounts.length !== 1) return { message: 'Para registrar un gasto necesito **un solo monto**, una descripcion y la cuenta. Si son varios, los reviso como lote antes de proponer cambios.', action: null };
    const account = await resolveExpenseAccount(ctx, prompt);
    if (!account) return { message: 'No pude identificar una sola cuenta. Indica el nombre exacto, por ejemplo **Efectivo**, **Popular** o **Tarjeta de credito Qik**, antes de preparar el gasto.', action: null };
    const description = expenseDescription(prompt, amounts[0].raw, account);
    if (description.length < 3) return { message: 'Indica el concepto del gasto antes de registrarlo.', action: null };
    const amountCents = amounts[0].cents;
    const id = uuid();
    return {
      message: `Prepare una propuesta reversible antes de aplicar: **${money(amountCents)}** desde **${text(account.nombre, 100)}** por “${description}”. Revisa y pulsa Aplicar solo si los datos son correctos.`,
      action: sanitizeAction({
        id, action: 'fin.movement.create', status: 'pending', risk_level: 'high',
        required_capability: 'can_manage_finance', requires_admin_approval: true,
        reversible: false,
        summary: `Registrar gasto de ${money(amountCents)} desde ${text(account.nombre, 120)}: ${description}`,
        payload: {
          cuentaId: account.id, cuentaNombre: text(account.nombre, 120), tipo: 'gasto', montoCentavos: amountCents,
          fecha: today(), descripcion: description, nota: 'Propuesto por cerebro local; aprobado manualmente.',
          conciliado: false, afectaResultado: true,
        }
      })
    };
  }

  async function answer(ctx, prompt, conversation = null, data = {}) {
    const query = normalize(prompt);
    const revised = await revisePendingExpense(ctx, prompt, conversation);
    if (revised) return revised;
    const proposal = await buildExpenseProposal(ctx, prompt);
    if (proposal) return { content: proposal.message, action: proposal.action };
    if (/consumo.*api|api.*consumo|que motor|motor.*usas|modulos.*consult|que.*puedes/.test(query)) {
      return {
        content: 'Uso el **cerebro local del POS** y requiero **cero consumo de API generativa** para estas consultas. Leo datos reales de Firebase en los modulos de ventas, finanzas y gastos, cuentas, clientes y creditos, productos e inventario, caja, turnos y cortes. Las escrituras nunca son automaticas: preparo una propuesta auditable y exijo aprobacion antes de aplicarla.',
      };
    }
    if (/varias ordenes|ordenes juntas|lote.*orden|multiples ordenes/.test(query)) {
      return {
        content: 'Para **varias ordenes juntas**, preparo un lote revisable con una clave unica por orden, valido cliente, conceptos, montos y forma de pago, y marco duplicados antes de escribir. Luego presento el resumen completo para aprobacion. No aplico lotes incompletos ni invento campos ausentes.',
      };
    }
    if (/resumen|venta.*hoy|hoy.*venta|saldo.*cuenta/.test(query)) return { content: await loadSummary(ctx) };
    if (/producto|catalogo|inventario|stock|precio/.test(query)) return { content: await auditProducts(ctx) };
    if (/cliente|credito|deud|cuenta por cobrar/.test(query)) return { content: await auditClients(ctx) };
    if (/caja|turno|corte|arqueo|efectivo esperado/.test(query)) return { content: await auditCash(ctx) };
    if (/pion|motor|gasto|pago|movimiento|factura/.test(query)) return { content: await searchFinance(ctx, prompt) };
    if (data.model && data.model !== 'local-pos' && ctx.remoteAssistant) {
      const recent = (conversation?.messages || []).slice(-8).map(item => ({ role: item.role, content: text(item.content, 1800) }));
      const remote = await ctx.remoteAssistant({ action: 'assistantGenerate', message: prompt, model: data.model, history: recent });
      if (remote?.content) return { content: text(remote.content), effectiveModel: text(remote.effective_model, 120) || 'Google Gemini' };
    }
    return {
      content: 'Estoy funcionando con el **cerebro local del POS**, sin depender de una API generativa. Puedo consultar ventas, gastos, cuentas, clientes, creditos, inventario, caja y turnos con datos reales. Para escribir, preparo una propuesta y exijo aprobacion antes de afectar Finanzas.',
    };
  }

  async function request(mode, rawContext = {}, data = {}) {
    const ctx = ensureContext(rawContext);
    const all = await readConversations(ctx);
    if (mode === 'status') {
      let remote = null;
      try { remote = ctx.remoteAssistant ? await ctx.remoteAssistant({ action: 'assistantStatus' }) : null; } catch {}
      const models = [{ id: 'local-pos', label: 'Cerebro local POS', level: 'Sin consumo de API' }];
      if (remote?.configured) models.push({ id: 'google-gemini', label: 'Google Gemini', level: 'API protegida del servidor' });
      return {
        ok: true, configured: true, local_engine: true,
        role: ctx.role, full_admin_access: roleAdmin(ctx.role),
        capabilities: capabilities(ctx.role), providers_down: {}, claves: {},
        models,
        active_documents: [{
          id: 'local-pos-contract', name: 'Reglas operativas POS 1.0.54',
          kind: 'system_rules', version: '1.0.54', active: true, persisted: true,
        }]
      };
    }
    if (mode === 'conversations') {
      return { ok: true, conversations: all.filter(item => !item.archived_at).map(item => ({
        id: item.id, title: item.title, model: item.model,
        created_at: item.created_at, updated_at: item.updated_at,
      })) };
    }
    if (mode === 'history') {
      const conversation = all.find(item => item.id === data.conversation_id && !item.archived_at);
      if (!conversation) throw new Error('La conversacion ya no existe o fue archivada.');
      return { ok: true, conversation, messages: conversation.messages, actions: conversation.actions, active_documents: [] };
    }
    if (mode === 'archive_conversation') {
      const conversation = all.find(item => item.id === data.conversation_id);
      if (!conversation) return { ok: true };
      conversation.archived_at = nowIso();
      await saveConversation(ctx, conversation);
      return { ok: true };
    }
    if (mode === 'chat') {
      let conversation = all.find(item => item.id === data.conversation_id && !item.archived_at);
      if (!conversation) conversation = sanitizeConversation({
        id: uuid(), title: text(data.message, 70) || 'Nueva conversacion', messages: [], actions: []
      }, ctx);
      const userMessage = sanitizeMessage({
        role: 'user', content: text(data.message) || 'Analiza los archivos adjuntos.',
        metadata: { attachments: data.attachments || [] }
      });
      const response = await answer(ctx, userMessage.content, conversation, data);
      if (response.action && !response.revised) conversation.actions.push(response.action);
      const assistantMessage = sanitizeMessage({
        role: 'assistant', content: response.content,
        metadata: {
          action_ids: response.action ? [response.action.id] : [],
          quick_actions: [
            { label: 'Abrir Finanzas', destination: 'finanzas' },
            { label: 'Abrir Caja virtual', destination: 'caja-virtual' },
          ]
        }
      });
      conversation.messages.push(userMessage, assistantMessage);
      conversation.messages = conversation.messages.slice(-MAX_MESSAGES);
      if (conversation.title === 'Nueva conversacion') conversation.title = text(userMessage.content, 70);
      conversation = await saveConversation(ctx, conversation);
      return { ok: true, conversation, message: assistantMessage, effective_model: response.effectiveModel || 'Cerebro local POS · Firebase' };
    }
    if (mode === 'pending_approvals') {
      return { ok: true, actions: all.flatMap(item => item.actions || []).filter(item => item.status === 'pending') };
    }
    if (mode === 'confirm_action' || mode === 'cancel_action') {
      const conversation = all.find(item => (item.actions || []).some(action => action.id === data.action_id));
      const action = conversation?.actions?.find(item => item.id === data.action_id);
      if (!action) throw new Error('La propuesta ya no existe.');
      if (action.status !== 'pending') return { ok: true, message: 'La propuesta ya fue resuelta.' };
      if (mode === 'cancel_action') {
        action.status = 'cancelled'; action.resolved_at = nowIso();
        await saveConversation(ctx, conversation);
        return { ok: true, message: 'Propuesta cancelada sin modificar datos.' };
      }
      if (!roleAdmin(ctx.role)) throw new Error('Se requiere un rol administrativo para aplicar esta propuesta.');
      try {
        const result = await ctx.adapter.adminAction(action.action, ctx.businessId, ctx.role, action.id, action.payload);
        action.status = 'executed'; action.result = result; action.resolved_at = nowIso();
        await saveConversation(ctx, conversation);
        return { ok: true, message: result?.message || 'Cambio aplicado y auditado.' };
      } catch (error) {
        action.status = 'error'; action.result = { error: text(error?.message || error, 800) }; action.resolved_at = nowIso();
        await saveConversation(ctx, conversation);
        throw error;
      }
    }
    if (mode === 'undo_action') throw new Error('Esta accion financiera no admite deshacer automatico; usa un asiento compensatorio auditado.');
    if (mode === 'permissions_list') {
      return { ok: true, members: [{
        user_id: ctx.user.uid, email: ctx.user.email, role: ctx.role,
        inherited_full_access: roleAdmin(ctx.role), capabilities: capabilities(ctx.role),
      }] };
    }
    if (mode === 'permissions_set') throw new Error('Los permisos se administran mediante la membresia Firebase, no desde el navegador.');
    if (mode === 'set_api_key') throw new Error('El cerebro local no guarda ni necesita claves de proveedores externos.');
    throw new Error(`Operacion del asistente local no admitida: ${mode}.`);
  }

  return { request, _test: { normalize, money, parseMoneyCents, answer, sanitizeConversation, readLocal, writeLocal } };
});
