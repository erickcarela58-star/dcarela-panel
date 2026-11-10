// Mismo adaptador y libro del panel; fixtures solo con ?mode=demo.
export const isLive = new URLSearchParams(location.search).get('mode') !== 'demo';

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
    throw new Error('Inicia sesión en el panel del CRM para consultar Finanzas.');
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
  const [accounts, categories, budgets, cards, commitments, preferences,
    costObligations, costPayments] = await Promise.all([
    api.getFinanceAccounts(chosen), api.getFinanceCategories(chosen), api.getFinanceBudgets(chosen),
    api.getFinanceCards(chosen), api.getFinanceCommitments(chosen), api.getFinancePreferences(chosen),
    api.getCollection('cost_obligations', [['business_id', '==', chosen]]),
    api.getCollection('cost_payments', [['business_id', '==', chosen]])
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
  scopedRows(costObligations, chosen, 'obligaciones de Caja');
  scopedRows(costPayments, chosen, 'pagos de Caja');
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
  return {accounts, categories, movements, budgets, cards, commitments,
    costObligations, costPayments,
    preferences, authorizedBusinesses:allowed, businessId:chosen, demo:false};
}

export async function commitAction(action, businessId, entityId, data) {
  if (!isLive) return {preview:true};
  // Compuerta temporal: ninguna escritura en el proyecto de producción.
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    throw new Error('Las escrituras de V3.3 están bloqueadas hasta completar la validación financiera.');
  }
  const projectId = window.__DCARELA_FIREBASE_CONFIG?.projectId || '';
  if (!projectId.startsWith('demo-') || window.__DCARELA_FINANCE_STAGING_WRITE__ !== true) {
    throw new Error('Las escrituras solo están disponibles en el emulador financiero aislado.');
  }
  if (!['fin.movement.create','fin.transfer.create','fin.movement.cancel','fin.account.reconcile'].includes(action) ||
      !data?.requestId || typeof data.requestId !== 'string') {
    throw new Error('Operación financiera no admitida o sin identificador estable.');
  }
  const api = adapter();
  const {allowed} = await sessionBusinesses(api);
  const member = allowed.find(b => b.id === businessId);
  if (!member || !['owner','admin'].includes(member.role)) throw new Error('No tienes permiso de escritura en esta sucursal.');
  return api.adminAction(action, businessId, member.role, entityId, data);
}
