(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DcarelaFinanceRevisions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const inactive = new Set(['anulado', 'anulada', 'cancelado', 'cancelada', 'cancelled', 'inactivo', 'inactiva', 'eliminado', 'eliminada']);
  const outgoing = new Set(['gasto', 'egreso', 'salida', 'compra', 'retiro', 'compra_tarjeta', 'pago_proveedor', 'comision', 'ajuste_negativo']);
  const incoming = new Set(['ingreso', 'entrada', 'deposito', 'venta', 'ajuste_positivo']);
  const normalize = value => String(value ?? '').trim().toLowerCase();
  function integer(value, label) {
    if (!Number.isSafeInteger(value)) throw new Error(label + ' debe ser un entero seguro en centavos.');
    return value;
  }
  function instant(value, label) {
    const time = Date.parse(String(value || ''));
    if (!Number.isFinite(time)) throw new Error(label + ' no tiene fecha valida.');
    return new Date(time).toISOString();
  }
  // Muchos movimientos llegan con fecha de SOLO DIA. Anclarla al final del dia sirve para
  // ordenar, pero no dice a que hora ocurrio: si el cuadre de la cuenta cayo ese mismo dia
  // --y los cuadres reales se hacen a media manana, no a medianoche-- no hay forma de saber
  // si el importe original ya estaba dentro del saldo cuadrado. Por eso el dia se conserva
  // aparte: quien reconstruye el saldo tiene que poder distinguir "antes del corte" de "no
  // se puede saber", y no son lo mismo.
  function sourceInstant(row) {
    const date = row.source_timestamp || row.fecha || row.created_at;
    const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''));
    return {
      occurred_at: instant(dayOnly ? date + 'T23:59:59-04:00' : date, 'El movimiento original'),
      source_day: dayOnly ? String(date) : null,
    };
  }
  // El dia del negocio en UTC-4. Es un desplazamiento fijo a proposito: Republica Dominicana
  // no cambia la hora, y es la misma zona con la que se ancla la fecha de solo dia arriba.
  function businessDay(value, label) {
    const time = Date.parse(String(value || ''));
    if (!Number.isFinite(time)) throw new Error(label + ' no tiene fecha valida.');
    return new Date(time - 4 * 3600000).toISOString().slice(0, 10);
  }
  function identity(row) {
    return normalize(row?.ledger_id || row?.ledgerId || row?.id).replace(/^(?:(?:sync-ledger-|ledger-|fin-))+/, '');
  }

  // Signed account effect of the current state, separate from profit/loss.
  function movementAccountEffects(row, movements = []) {
    if (!row || inactive.has(normalize(row.estado))) return [];
    const amount = Math.abs(integer(Number(row.monto_centavos ?? row.importeDopCentavos ?? 0), 'El importe'));
    const type = normalize(row.tipo);
    const transfer = type === 'transferencia' || type === 'pago_tarjeta';
    const source = row.cuenta_origen_id || row.cuentaOrigenId || ((outgoing.has(type) || transfer) ? row.cuenta_id : null);
    const target = row.cuenta_destino_id || row.cuentaDestinoId || (incoming.has(type) ? row.cuenta_id : null);
    if (amount && !source && !target) throw new Error('El movimiento no tiene una cuenta contable identificada.');
    let fee = transfer ? Math.abs(integer(Number(row.comision_centavos ?? row.comisionCentavos ?? 0), 'La comision')) : 0;
    const feeId = row.comision_movimiento_id || row.fee_movement_id || row.metadata?.comision_movimiento_id || row.metadata?.fee_movement_id;
    const linkedFee = movements.some(item => {
      const parent = item.transferencia_id || item.transfer_id || item.metadata?.transferencia_id || item.metadata?.transfer_id;
      return parent && identity({ id: parent }) === identity(row) && outgoing.has(normalize(item.tipo));
    });
    if (feeId || linkedFee) fee = 0;
    const effects = new Map();
    const add = (account, delta) => {
      if (account) effects.set(String(account), integer((effects.get(String(account)) || 0) + delta, 'El efecto de cuenta'));
    };
    add(source, -(amount + fee));
    add(target, amount);
    return [...effects].filter(([, delta]) => delta).map(([account_id, delta_centavos]) => ({ account_id, delta_centavos }));
  }

  function validateBalanceEffects(effects) {
    if (!Array.isArray(effects)) throw new Error('El historial de efectos de saldo no es valido.');
    const ids = new Set();
    return effects.map(effect => {
      const id = String(effect?.id || '').trim();
      const account_id = String(effect?.account_id || '').trim();
      if (!id || !account_id || ids.has(id)) throw new Error('El historial tiene un efecto sin identidad o duplicado.');
      ids.add(id);
      const day = effect.source_day == null ? null : String(effect.source_day);
      if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('El historial tiene un dia de origen invalido.');
      return { id, account_id, delta_centavos: integer(effect.delta_centavos, 'El efecto de saldo'),
        occurred_at: instant(effect.occurred_at, 'La revision'),
        // Se conserva tal cual: perderlo por el camino convertiria "no se puede saber" en
        // "ocurrio a las 23:59:59", que es justo el error que se quiere evitar.
        ...(day === null ? {} : { source_day: day }) };
    });
  }

  function movementBalanceEffects(row, movements = []) {
    if (row?.balance_effects != null) return validateBalanceEffects(row.balance_effects);
    const effects = movementAccountEffects(row, movements);
    if (!effects.length) return [];
    const { occurred_at, source_day } = sourceInstant(row);
    return effects.map(effect => ({ id: 'origin:' + effect.account_id, ...effect, occurred_at,
      ...(source_day === null ? {} : { source_day }) }));
  }

  // The original checkpoint is immutable. An edit moves only its difference,
  // at the time of the correction, regardless of the reporting date entered.
  function reviseMovement(previous, next, { revisionId, createdAt, movements = [] } = {}) {
    if (!previous || !next) throw new Error('La revision necesita el estado anterior y el siguiente.');
    if (identity(previous) && identity(next) && identity(previous) !== identity(next)) throw new Error('Una revision no puede cambiar la identidad del movimiento.');
    if (previous.business_id && next.business_id && previous.business_id !== next.business_id) throw new Error('La revision no puede cambiar de negocio.');
    const revision = String(revisionId || '').trim();
    if (!revision) throw new Error('La revision necesita un identificador estable.');
    const occurred_at = instant(createdAt, 'La correccion');
    const history = movementBalanceEffects(previous, movements);
    const before = new Map(movementAccountEffects(previous, movements).map(effect => [effect.account_id, effect.delta_centavos]));
    const after = new Map(movementAccountEffects(next, movements).map(effect => [effect.account_id, effect.delta_centavos]));
    const additions = [...new Set([...before.keys(), ...after.keys()])].flatMap(account_id => {
      const delta_centavos = integer((after.get(account_id) || 0) - (before.get(account_id) || 0), 'La diferencia de la revision');
      return delta_centavos ? [{ id: 'revision:' + revision + ':' + account_id, account_id, delta_centavos, occurred_at }] : [];
    });
    if (additions.some(effect => history.some(old => old.id === effect.id))) throw new Error('La revision ya existe; recarga el movimiento antes de cambiarlo.');
    if (additions.length && history.some(effect => effect.id.startsWith('revision:') && effect.occurred_at > occurred_at)) {
      throw new Error('La correccion no puede preceder a una revision ya registrada.');
    }
    return { ...next, balance_effect_version: 1, balance_effects: [...history, ...additions] };
  }

  // null means the caller must use the previous projection contract. The
  // caller still owns deduplication and materialized/unmaterialized selection.
  function accountRevisionDelta(account, movement) {
    if (movement?.balance_effects == null) return null;
    const corte = account?.reconciled_at || account?.reconciledAt || account?.created_at || account?.createdAt || '';
    const cutoff = Date.parse(corte);
    if (!Number.isFinite(cutoff)) throw new Error('La cuenta no tiene corte valido para reconstruir revisiones.');
    const diaDelCorte = businessDay(corte, 'El corte de la cuenta');
    const efectos = validateBalanceEffects(movement.balance_effects)
      .filter(effect => effect.account_id === String(account?.id));
    // Origen con fecha de solo dia y corte el MISMO dia: no se puede saber si ese importe ya
    // estaba dentro del saldo cuadrado. Contarlo lo sumaria por segunda vez sobre un saldo que
    // el dueno acaba de dar por bueno --dinero que no existe-- y descartarlo lo perderia si en
    // realidad ocurrio despues. Devolver null deja al llamador en el contrato anterior, que es
    // lo que hace hoy: no se inventa una cifra para un instante que nadie registro.
    if (efectos.some(effect => effect.source_day && effect.source_day === diaDelCorte)) return null;
    return efectos.reduce((sum, effect) => {
      if (Date.parse(effect.occurred_at) <= cutoff) return sum;
      return integer(sum + effect.delta_centavos, 'El saldo por revisiones');
    }, 0);
  }

  return { movementAccountEffects, movementBalanceEffects, reviseMovement, accountRevisionDelta, validateBalanceEffects };
});
