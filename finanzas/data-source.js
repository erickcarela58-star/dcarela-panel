// Mismo adaptador y libro del panel; fixtures solo con ?mode=demo.
export const isLive = new URLSearchParams(location.search).get('mode') !== 'demo';
const isIsolatedEmulator = () => ['localhost','127.0.0.1'].includes(location.hostname)
  && String(window.__DCARELA_FIREBASE_CONFIG?.projectId||'').startsWith('demo-')
  && window.__DCARELA_FINANCE_STAGING_WRITE__ === true;
const isOfficialFinance = () => location.hostname === 'panel.dcarelacompufoto.com'
  && location.protocol === 'https:'
  && window.__DCARELA_FIREBASE_CONFIG?.projectId === 'erikccarela';
export const canRegister = () => isLive && (isIsolatedEmulator() || isOfficialFinance());

function adapter() {
  const api = window.DcarelaFirebase;
  if (!api?.isAvailable || !api.waitForAuthState || !api.getMembershipsForUser ||
      !api.getBusinessesByIds || !api.getFinanceJournal) {
    throw new Error('El adaptador Firebase del CRM no está disponible.');
  }
  return api;
}

export function authorizedBusinesses(memberships, businesses) {
  if (!Array.isArray(memberships) || !Array.isArray(businesses)) {
    throw new Error('No se pudo verificar la pertenencia a las sucursales.');
  }
  const byId = new Map(businesses.filter(b => b && b.active !== false).map(b => [b.id, b]));
  return memberships.filter(m => m && m.active === true && byId.has(m.business_id))
    .map(m => ({id:m.business_id, name:byId.get(m.business_id).nombre ||
      byId.get(m.business_id).name || m.business_id, role:m.role || 'viewer'}));
}

export async function sessionBusinesses(api = adapter()) {
  const user = await api.waitForAuthState(8000);
  if (!user?.uid || api.getCurrentUser()?.uid !== user.uid) {
    throw Object.assign(new Error('Inicia sesión para consultar Finanzas.'), {code:'AUTH_REQUIRED'});
  }
  const memberships = await api.getMembershipsForUser(user.uid);
  const ids = [...new Set((memberships || []).filter(m => m?.active === true).map(m => m.business_id))];
  const businesses = ids.length ? await api.getBusinessesByIds(ids) : [];
  const allowed = authorizedBusinesses(memberships, businesses);
  if (!allowed.length) throw new Error('Tu usuario no tiene una sucursal financiera autorizada.');
  return {user, allowed};
}

function scopedRows(rows, businessId, label) {
  if (!Array.isArray(rows) || rows.partial_error) {
    throw new Error(`La lectura de ${label} está incompleta; no se mostrarán saldos.`);
  }
  for (const row of rows) {
    if (!row || row.business_id !== businessId) {
      throw new Error(`La lectura de ${label} contiene un registro fuera de la sucursal.`);
    }
  }
  return rows;
}

export async function loadFinance(requestedBusinessId) {
  if (!isLive) {
    const {fixture} = await import('./demo-data.js');
    const businessId = requestedBusinessId || 'sucursal-a';
    return {...fixture(businessId), authorizedBusinesses:[
      {id:'sucursal-a',name:'Sucursal A · Demo'}, {id:'sucursal-b',name:'Sucursal B · Demo'}
    ], businessId};
  }
  const api = adapter();
  const {user, allowed} = await sessionBusinesses(api);
  const chosen = requestedBusinessId || allowed[0].id;
  if (!allowed.some(b => b.id === chosen)) {
    throw new Error('Acceso denegado: esta sucursal no pertenece a tu sesión.');
  }
  const [accounts, categories, budgets, cards, commitments, commitmentPayments, preferences,
    costObligations, costPayments, costRecurrents] = await Promise.all([
    api.getFinanceAccounts(chosen), api.getFinanceCategories(chosen), api.getFinanceBudgets(chosen),
    api.getFinanceCards(chosen), api.getFinanceCommitments(chosen), api.getFinanceCommitmentPayments(chosen), api.getFinancePreferences(chosen),
    api.getCollection('cost_obligations', [['business_id', '==', chosen]]),
    api.getCollection('cost_payments', [['business_id', '==', chosen]]),
    api.getCollection('cost_recurrents', [['business_id', '==', chosen]])
  ]);
  scopedRows(accounts, chosen, 'cuentas');
  if (!accounts.length) throw new Error('Esta sucursal no tiene cuentas verificadas; no se mostrará un saldo cero.');
  for (const account of accounts) {
    const base = account.reconciled_balance_centavos ?? account.saldo_actual_centavos ?? account.saldo_inicial_centavos;
    if (!Number.isSafeInteger(base)) {
      throw new Error('Una cuenta carece de saldo base verificable; no se mostrarán cifras.');
    }
  }
  scopedRows(categories, chosen, 'categorías');
  scopedRows(budgets, chosen, 'presupuestos');
  scopedRows(cards, chosen, 'tarjetas');
  scopedRows(commitments, chosen, 'compromisos');
  scopedRows(commitmentPayments, chosen, 'pagos de compromisos');
  scopedRows(costObligations, chosen, 'obligaciones de Caja');
  scopedRows(costPayments, chosen, 'pagos de Caja');
  scopedRows(costRecurrents, chosen, 'costos recurrentes');
  if (preferences && preferences.business_id !== chosen) {
    throw new Error('Las preferencias pertenecen a otra sucursal.');
  }
  // El diario canónico une archivo, sync_events, ventas y movimientos.
  const movements = scopedRows(await api.getFinanceJournal(chosen, {accounts, preferences}), chosen, 'diario');
  if (api.getCurrentUser()?.uid !== user.uid) {
    throw new Error('La sesión cambió durante la lectura. Vuelve a intentarlo.');
  }
  // CostoPagoRegistrado acredita una deuda, pero no demuestra por sí solo una
  // salida de cuenta. El diario ya registra la salida contable una sola vez.
  const sales = scopedRows(movements.sales || [], chosen, 'detalle de ventas');
  return {accounts, categories, movements, sales, budgets, cards, commitments, commitmentPayments,
    costObligations, costPayments, costRecurrents,
    preferences, authorizedBusinesses:allowed, businessId:chosen, demo:false};
}

export async function commitAction(action, businessId, entityId, data) {
  if (!isLive) return {preview:true};
  if (!['fin.movement.create','fin.transfer.create','fin.movement.cancel','fin.account.reconcile','fin.books.request','cost.recurring.upsert','cost.obligation.upsert'].includes(action) ||
      !data?.requestId || typeof data.requestId !== 'string') {
    throw new Error('Operación financiera no admitida o sin identificador estable.');
  }
  if (!canRegister()) throw new Error('Registra desde la PWA oficial o usa el panel central.');
  // 13/11/2026: «fin.books.request» (libros fiscales 606/607), «cost.recurring.upsert» y «cost.obligation.upsert» no alteran saldos directos y Caja recibe los costos via sync_events.
  if (isOfficialFinance() && !['fin.movement.create','fin.transfer.create','fin.books.request','cost.recurring.upsert','cost.obligation.upsert'].includes(action)) {
    throw new Error('Esta operación requiere comprobar primero la Caja activa.');
  }
  const api = adapter();
  const {allowed} = await sessionBusinesses(api);
  const member = allowed.find(b => b.id === businessId);
  if (!member || !['owner','admin'].includes(member.role)) throw new Error('No tienes permiso de escritura en esta sucursal.');
  return api.adminAction(action, businessId, member.role, entityId, data);
}

// Consulta bajo demanda: el asiento en Firebase y su aplicación en una Caja
// son hechos distintos. Un resultado vacío no confirma que la terminal falló.
export async function getTerminalReceipt(businessId, movement) {
  if (!isLive) return {status:'demo'};
  const eventId = String(movement?.sync_event_id || '');
  const movementId = String(movement?.id || '');
  const createdAt = String(movement?.created_at || '');
  const historicalCashRepair = /^owner-repair-20261105-cash-(entrada|comida|regalos|desayuno|viajante|intermediarios)$/.test(movementId);
  if ((!eventId && !historicalCashRepair) || !movementId || !Number.isFinite(Date.parse(createdAt))) {
    return {status:'unavailable'};
  }
  const api = adapter();
  if (typeof api.getSyncEvents !== 'function') throw new Error('No se puede consultar el acuse de Caja.');
  const {user, allowed} = await sessionBusinesses(api);
  if (!allowed.some(branch => branch.id === businessId) || movement.business_id !== businessId) {
    throw new Error('Movimiento fuera de la sucursal autorizada.');
  }
  let sourceEventId = eventId;
  let from = createdAt;
  if (historicalCashRepair) {
    if (typeof api.getDocument !== 'function') throw new Error('No se puede verificar el evento de reparación.');
    const repairId = `projection-repair-20261111-${movementId}`;
    const repair = await api.getDocument('sync_events', repairId);
    const repairAt = String(repair?.received_at_cloud || '');
    const accountId = String(movement.cuenta_id || '');
    const amount = Number(movement.monto_centavos);
    const payload = repair?.payload || {};
    const accountMatches = movement.tipo === 'ingreso'
      ? payload.cuentaDestinoId === accountId
      : payload.cuentaOrigenId === accountId;
    if (repair?.id !== repairId || repair.business_id !== businessId
      || repair.event_type !== 'LedgerMovimientoRegistrado'
      || repair.projection_repair_only !== true || repair.entity_id !== movementId
      || payload.ledgerId !== movementId || !Number.isSafeInteger(amount)
      || payload.importeDopCentavos !== amount || !accountId || !accountMatches
      || !Number.isFinite(Date.parse(repairAt))) return {status:'unavailable'};
    sourceEventId = repairId;
    from = repairAt;
  }
  const limit = 500;
  const events = await api.getSyncEvents(businessId, {
    from, eventTypes:['EventoNubeAplicado'], includeArchives:false, limit
  });
  if (!Array.isArray(events) || api.getCurrentUser()?.uid !== user.uid) {
    throw new Error('No se pudo verificar la lectura del acuse con tu sesión.');
  }
  const receipt = events.find(event => event?.business_id === businessId
    && event.event_type === 'EventoNubeAplicado'
    && event.source === 'pos_local_firebase'
    && event.payload?.sourceEventId === sourceEventId
    && event.payload?.sourceEventType === 'LedgerMovimientoRegistrado'
    && event.payload?.sourceEntityId === movementId
    && event.device_id === event.payload?.appliedByDeviceId
    && typeof event.payload?.appliedByDeviceId === 'string'
    && event.payload.appliedByDeviceId.trim());
  if (receipt) return {status:'applied', deviceId:receipt.payload.appliedByDeviceId,
    appliedAt:receipt.payload.appliedAt || receipt.received_at_cloud || '',
    ...(historicalCashRepair ? {historicalRepair:true} : {})};
  return {status:events.length >= limit ? 'inconclusive' : 'not_observed'};
}
