// Mismo adaptador y libro del panel; fixtures solo con ?mode=demo.
export const isLive = new URLSearchParams(location.search).get('mode') !== 'demo';
const isIsolatedEmulator = () => ['localhost','127.0.0.1'].includes(location.hostname)
  && String(window.__DCARELA_FIREBASE_CONFIG?.projectId||'').startsWith('demo-')
  && window.__DCARELA_FINANCE_STAGING_WRITE__ === true;
const OFFICIAL_FINANCE_HOSTS = new Set([
  'panel.dcarelacompufoto.com',
  'crm.dcarelacompufoto.com',
  'erikccarela.web.app',
  'erikccarela.firebaseapp.com',
]);
const isOfficialFinance = () => OFFICIAL_FINANCE_HOSTS.has(location.hostname)
  && location.protocol === 'https:'
  && window.__DCARELA_FIREBASE_CONFIG?.projectId === 'erikccarela';
export const canRegister = () => isLive && (isIsolatedEmulator() || isOfficialFinance());
// Caja 1.0.77 no aplica revisiones de estado del mismo ledgerId. Hasta que la
// terminal activa confirme una versión compatible, una anulación dejaría
// Firebase y el libro físico en estados distintos.
export const canCancelMovement = () => !isLive || isIsolatedEmulator();

export async function fiscalReadIsProvisional() {
  if (!isLive || !window.DCARELA_NUBE_URL) return false;
  try {
    const url = new URL('/healthz', window.DCARELA_NUBE_URL);
    const response = await fetch(url, { cache:'no-store', redirect:'error', signal:AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    const status = await response.json();
    return status.productionCutover === false && status.financeFiscalRead === true && status.primaryConnected === true;
  } catch { return false; }
}

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

export async function loadFinance(requestedBusinessId, options = {}) {
  if (!isLive) {
    const {fixture} = await import('./demo-data.js');
    const businessId = requestedBusinessId || 'sucursal-a';
    return {...fixture(businessId), authorizedBusinesses:[
      {id:'sucursal-a',name:'Sucursal A · Demo'}, {id:'sucursal-b',name:'Sucursal B · Demo'}
    ], businessId, fullHistoryLoaded: true};
  }
  const api = adapter();
  const {user, allowed} = await sessionBusinesses(api);
  const chosen = requestedBusinessId || allowed[0].id;
  if (!allowed.some(b => b.id === chosen)) {
    throw new Error('Acceso denegado: esta sucursal no pertenece a tu sesión.');
  }
  const optionalCollection = (name) => typeof api.getCollection === 'function'
    ? Promise.resolve(api.getCollection(name, [['business_id', '==', chosen]]))
        .then(rows => Array.isArray(rows) ? rows.filter(r => !r?.business_id || r.business_id === chosen) : [])
        .catch(() => [])
    : Promise.resolve([]);
  const [accounts, categories, budgets, cards, commitments, commitmentPayments, preferences,
    costObligations, costPayments, costRecurrents, posObligaciones, suppliers] = await Promise.all([
    api.getFinanceAccounts(chosen), api.getFinanceCategories(chosen), api.getFinanceBudgets(chosen),
    api.getFinanceCards(chosen), api.getFinanceCommitments(chosen), api.getFinanceCommitmentPayments(chosen), api.getFinancePreferences(chosen),
    api.getCollection('cost_obligations', [['business_id', '==', chosen]]),
    api.getCollection('cost_payments', [['business_id', '==', chosen]]),
    api.getCollection('cost_recurrents', [['business_id', '==', chosen]]),
    optionalCollection('pos_obligaciones'),
    optionalCollection('suppliers'),
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
  const normText = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const seenObligationIds = new Set(costObligations.map(o => String(o?.id || o?.obligacionId || '').trim()).filter(Boolean));
  const mergedObligations = costObligations.slice();
  for (const ob of posObligaciones) {
    if (!ob || (ob.business_id && ob.business_id !== chosen)) continue;
    const oid = String(ob.id || ob.obligacionId || '').trim();
    if (oid && seenObligationIds.has(oid)) continue;
    const st = normText(ob.estado);
    const bal = Number(ob.saldoCentavos ?? ob.saldo_centavos ?? ob.saldoPendienteCentavos ?? ob.saldo_pendiente_centavos ?? ob.montoCentavos ?? ob.monto_centavos);
    if (['pagada', 'pagado', 'anulada', 'anulado', 'cancelada', 'cancelado', 'eliminada', 'eliminado'].includes(st) || !(Number.isSafeInteger(bal) && bal > 0)) continue;
    if (oid) seenObligationIds.add(oid);
    mergedObligations.push({
      ...ob,
      id: oid || `pos-ob-${mergedObligations.length}`,
      business_id: ob.business_id || chosen,
      concepto: ob.concepto || ob.descripcion || ob.proveedor || 'Obligación',
      saldoCentavos: bal,
      montoCentavos: Number(ob.montoCentavos ?? ob.monto_centavos) || bal,
      venceEn: ob.venceEn || ob.vence_en || ob.fechaVencimiento || '',
    });
  }
  const openSupplierNames = mergedObligations
    .filter(o => Number(o?.saldoCentavos ?? o?.saldo_centavos ?? o?.montoCentavos ?? o?.monto_centavos) > 0 && !['pagada', 'pagado', 'anulada', 'anulado', 'eliminada', 'eliminado'].includes(normText(o?.estado)))
    .map(o => ({
      supplierId: String(o?.supplierId || o?.proveedorId || o?.proveedor_id || '').trim(),
      label: normText(o?.concepto || o?.descripcion || o?.proveedor),
    }));
  for (const sup of suppliers) {
    if (!sup || (sup.business_id && sup.business_id !== chosen)) continue;
    if (sup.activo === false || sup.active === false) continue;
    const rawBal = sup.saldoPendienteCentavos ?? sup.saldo_pendiente_centavos ?? sup.saldoCentavos ?? sup.saldo_centavos ?? sup.deudaCentavos ?? sup.deuda_centavos;
    const bal = Number(rawBal);
    if (!(Number.isSafeInteger(bal) && bal > 0)) continue;
    const supName = String(sup.nombre || sup.name || sup.razonSocial || sup.razon_social || sup.empresa || sup.id || '').trim();
    const normSup = normText(supName);
    const sid = String(sup.id || '').trim();
    const alreadyOpen = openSupplierNames.some(o => (sid && o.supplierId === sid) || (normSup && o.label && (o.label.includes(normSup) || normSup.includes(o.label))));
    if (alreadyOpen || !supName) continue;
    mergedObligations.push({
      id: `supplier:${sid || normSup}`,
      obligacionId: `supplier:${sid || normSup}`,
      supplierId: sid || undefined,
      business_id: chosen,
      concepto: supName,
      descripcion: supName,
      proveedor: supName,
      tipo: 'proveedor',
      estado: 'pendiente',
      saldoCentavos: bal,
      montoCentavos: bal,
      venceEn: sup.proximo_vencimiento || sup.proximoVencimiento || sup.venceEn || sup.vence_en || sup.fechaVencimiento || '',
      fechaVencimiento: sup.proximo_vencimiento || sup.proximoVencimiento || sup.venceEn || sup.vence_en || sup.fechaVencimiento || '',
      emitidaEn: sup.updated_at || sup.ultima_compra_at || '',
      source: 'supplier_balance',
    });
  }
  if (preferences && preferences.business_id !== chosen) {
    throw new Error('Las preferencias pertenecen a otra sucursal.');
  }
  const journalOpts = { accounts, preferences };
  const historyFrom = options.fullHistory ? (options.historyFrom || '2018-01-01T00:00:00.000Z') : options.historyFrom;
  if (historyFrom) journalOpts.historyFrom = historyFrom;
  // El diario canónico une archivo, sync_events, ventas y movimientos.
  const movements = scopedRows(await api.getFinanceJournal(chosen, journalOpts), chosen, 'diario');
  if (api.getCurrentUser()?.uid !== user.uid) {
    throw new Error('La sesión cambió durante la lectura. Vuelve a intentarlo.');
  }
  // CostoPagoRegistrado acredita una deuda, pero no demuestra por sí solo una
  // salida de cuenta. El diario ya registra la salida contable una sola vez.
  const sales = scopedRows(movements.sales || [], chosen, 'detalle de ventas');
  return {accounts, categories, movements, sales, budgets, cards, commitments, commitmentPayments,
    costObligations: mergedObligations, costPayments, costRecurrents,
    preferences, authorizedBusinesses:allowed, businessId:chosen, demo:false, fullHistoryLoaded: Boolean(historyFrom)};
}

export async function loadFullFinanceHistory(requestedBusinessId, { accounts = [], preferences = null, historyFrom = '2018-01-01T00:00:00.000Z' } = {}) {
  if (!isLive) {
    const {fixture} = await import('./demo-data.js');
    const res = fixture(requestedBusinessId || 'sucursal-a');
    return { movements: res.movements || [], sales: res.sales || [], fullHistoryLoaded: true };
  }
  const api = adapter();
  const { user, allowed } = await sessionBusinesses(api);
  const chosen = requestedBusinessId || allowed[0].id;
  if (!allowed.some(b => b.id === chosen)) {
    throw new Error('Acceso denegado: esta sucursal no pertenece a tu sesión.');
  }
  const movements = scopedRows(await api.getFinanceJournal(chosen, { accounts, preferences, historyFrom }), chosen, 'diario histórico');
  if (api.getCurrentUser()?.uid !== user.uid) {
    throw new Error('La sesión cambió durante la lectura. Vuelve a intentarlo.');
  }
  const sales = scopedRows(movements.sales || [], chosen, 'detalle de ventas');
  return { movements, sales, fullHistoryLoaded: true };
}

// El perfil Facturador conserva un libro separado. Esta lectura no incorpora
// sus e-CF al diario de Caja ni a los saldos financieros de la PWA.
export async function loadFacturadorSales(requestedBusinessId, api = adapter()) {
  if (!isLive) return { businessId: requestedBusinessId || '', sales: [], demo: true };
  const { user, allowed } = await sessionBusinesses(api);
  const chosen = requestedBusinessId || allowed[0].id;
  if (!allowed.some(b => b.id === chosen)) {
    throw new Error('Acceso denegado: esta sucursal no pertenece a tu sesión.');
  }
  const rows = scopedRows(await api.getCollection('facturador_ventas', [['business_id', '==', chosen]], { complete: true }), chosen, 'ventas del Facturador');
  if (api.getCurrentUser()?.uid !== user.uid) {
    throw new Error('La sesión cambió durante la lectura. Vuelve a intentarlo.');
  }
  const sales = rows.map(row => {
    if (['total_centavos','itbis_centavos','subtotal_centavos'].some(k=>row[k]===null||row[k]===undefined||row[k]===''||typeof row[k]==='boolean')) {
      throw new Error('Un e-CF tiene importes no verificables; no se mostrarán cifras.');
    }
    const total = Number(row.total_centavos);
    const itbis = Number(row.itbis_centavos);
    const subtotal = Number(row.subtotal_centavos);
    if (![total, itbis, subtotal].every(Number.isSafeInteger) || total < 0 || itbis < 0 || subtotal < 0 || subtotal + itbis !== total) {
      throw new Error('Un e-CF tiene importes no verificables; no se mostrarán cifras.');
    }
    return { ...row, total_centavos: total, itbis_centavos: itbis, subtotal_centavos: subtotal };
  }).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.encf || '').localeCompare(String(a.encf || '')));
  return { businessId: chosen, sales, demo: false };
}

// Descarga el archivo fiscal original desde un snapshot privado de Firebase.
// La accion del servidor vuelve a validar sesion, rol y business_id.
export async function loadFiscalBookDownload(businessId, book, api = adapter()) {
  if (!isLive) throw new Error('La descarga del libro requiere una sesión real.');
  if (!['active', 'template'].includes(book)) throw new Error('Archivo fiscal no admitido.');
  if (typeof api.assistantRequest !== 'function') throw new Error('La descarga fiscal no está disponible.');
  const { user, allowed } = await sessionBusinesses(api);
  const member = allowed.find(branch => branch.id === businessId);
  if (!member || !['owner', 'admin'].includes(member.role)) {
    throw new Error('Tu cuenta no puede descargar los libros de esta sucursal.');
  }
  const result = await api.assistantRequest({ action: 'pwaFiscalBookDownload', book, sucursal_de_trabajo: businessId });
  if (api.getCurrentUser()?.uid !== user.uid) throw new Error('La sesión cambió durante la descarga. Vuelve a iniciar sesión.');
  if (!result || result.ok !== true) throw new Error('Firebase no entregó el libro fiscal.');
  return result;
}

export async function commitAction(action, businessId, entityId, data) {
  if (!isLive) return {preview:true};
  if (action === 'fin.movement.cancel' && !canCancelMovement()) {
    throw new Error('La anulación desde la PWA está pausada hasta verificar la actualización de Caja. No se modificó el movimiento.');
  }
  if (!['fin.movement.create','fin.transfer.create','fin.movement.cancel','fin.account.reconcile','fin.commitment.deactivate','cost.obligation.cancel','fin.books.request','cost.recurring.upsert','cost.obligation.upsert','fin.card.upsert'].includes(action) ||
      !data?.requestId || typeof data.requestId !== 'string') {
    throw new Error('Operación financiera no admitida o sin identificador estable.');
  }
  if (!canRegister()) throw new Error('Registra desde la PWA oficial o usa el panel central.');
  const api = adapter();
  const {allowed} = await sessionBusinesses(api);
  const member = allowed.find(b => b.id === businessId);
  if (!member || !['owner','admin'].includes(member.role)) throw new Error('No tienes permiso de escritura en esta sucursal.');
  return api.adminAction(action, businessId, member.role, entityId, data);
}

export async function loadLiveConnectivity(businessId) {
  if (!isLive) return { connected: false, mode: 'demo', businessId, devices: [], shifts: [] };
  const api = adapter();
  const user = api.getCurrentUser?.();
  if (!user) return { connected: false, reason: 'AUTH_REQUIRED', businessId, devices: [], shifts: [] };
  const [devices, shifts] = await Promise.all([
    typeof api.getCollection === 'function'
      ? api.getCollection('devices', [['business_id', '==', businessId]]).catch(() => [])
      : Promise.resolve([]),
    typeof api.getCashShifts === 'function'
      ? api.getCashShifts(businessId, 10).catch(() => [])
      : Promise.resolve([]),
  ]);
  const cleanDevices = Array.isArray(devices) ? devices.filter((d) => !d.business_id || d.business_id === businessId) : [];
  const cleanShifts = Array.isArray(shifts) ? shifts.filter((s) => !s.business_id || s.business_id === businessId) : [];
  return {
    connected: true,
    projectId: window.__DCARELA_FIREBASE_CONFIG?.projectId || 'erikccarela',
    businessId,
    userEmail: user.email || '',
    devices: cleanDevices,
    shifts: cleanShifts,
    openShifts: cleanShifts.filter((s) => ['open', 'abierta', 'activo'].includes(String(s.status || s.estado || '').toLowerCase())),
  };
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
