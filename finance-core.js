(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DcarelaFinanceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const BUSINESS_TIME_ZONE = "America/Santo_Domingo";
  const ACTIVE_STATES = new Set(["", "activo", "activa", "confirmado", "confirmada", "registrado", "registrada", "received"]);
  const INACTIVE_STATES = new Set(["anulado", "anulada", "cancelado", "cancelada", "cancelled", "inactivo", "inactiva", "eliminado", "eliminada"]);

  const normalizeText = value => String(value ?? "").trim().toLocaleLowerCase("es");
  const finiteNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const eventPayload = event => {
    const value = event?.payload;
    if (value && typeof value === "object") return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) { return {}; }
    }
    return {};
  };

  function businessDay(value, timeZone = BUSINESS_TIME_ZONE) {
    if (!value) return "";
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text.slice(0, 10);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function eventDay(event, timeZone = BUSINESS_TIME_ZONE) {
    const payload = eventPayload(event);
    return businessDay(
      payload.vendidaEn || payload.vendida_en || payload.fecha || payload.fechaEfectiva
        || event?.created_at_local || event?.received_at_cloud || event?.created_at,
      timeZone
    );
  }

  function normalizeMovementType(value) {
    const type = normalizeText(value).replace(/\s+/g, "_");
    const aliases = {
      egreso: "gasto", salida: "gasto", compra: "gasto", retiro: "gasto",
      entrada: "ingreso", deposito: "ingreso", venta: "ingreso"
    };
    return aliases[type] || type || "otro";
  }

  function normalizeMovement(item) {
    const normalized = { ...(item || {}) };
    normalized.tipo = normalizeMovementType(normalized.tipo);
    normalized.estado = normalizeText(normalized.estado || "registrado");
    normalized.fecha = businessDay(normalized.fecha || normalized.created_at || normalized.updated_at);
    normalized.monto_centavos = Math.abs(finiteNumber(
      normalized.monto_centavos ?? normalized.montoCentavos
        ?? normalized.importe_dop_centavos ?? normalized.importeDopCentavos
    ));
    normalized.comision_centavos = Math.abs(finiteNumber(normalized.comision_centavos ?? normalized.comisionCentavos));
    return normalized;
  }

  function ledgerEventMovement(event) {
    const payload = eventPayload(event);
    const type = normalizeMovementType(payload.tipo || "gasto");
    const sourceAccount = payload.cuentaOrigenId || payload.cuenta_origen_id || null;
    const targetAccount = payload.cuentaDestinoId || payload.cuenta_destino_id || null;
    const explicitAccount = payload.cuentaId || payload.cuenta_id || null;
    const accountId = explicitAccount || (["ingreso", "ajuste_positivo"].includes(type)
      ? targetAccount || sourceAccount
      : sourceAccount || targetAccount);
    const timestamp = payload.fechaEfectiva || payload.fecha_efectiva || payload.fecha
      || event?.created_at_local || event?.received_at_cloud || event?.created_at || "";
    return normalizeMovement({
      id: payload.ledgerId || payload.ledger_id || event?.entity_id || event?.event_id || event?.id,
      ledger_id: payload.ledgerId || payload.ledger_id || event?.entity_id || null,
      business_id: event?.business_id || payload.business_id || "",
      tipo: type,
      categoria: payload.categoria || "",
      descripcion: payload.descripcion || event?.event_type || "Movimiento de caja Windows",
      monto_centavos: payload.importeDopCentavos ?? payload.importe_dop_centavos ?? 0,
      importe_dop_centavos: payload.importeDopCentavos ?? payload.importe_dop_centavos ?? 0,
      comision_centavos: payload.comisionCentavos ?? payload.comision_centavos ?? 0,
      moneda: payload.monedaOriginal || payload.moneda_original || "DOP",
      estado: payload.estado || "confirmado",
      fecha: timestamp,
      cuenta_id: accountId,
      cuenta_destino_id: type === "transferencia" ? targetAccount : null,
      categoria_id: payload.categoriaId || payload.categoria_id || null,
      payee: payload.payee || null,
      nota: payload.observaciones || "",
      origen: payload.origen || "pos",
      sync_event_id: event?.event_id || event?.id || "",
      source_timestamp: timestamp,
      source: normalizeText(payload.origen) === "panel" ? "web_sync_event" : "pos_sync_event",
      observaciones: payload.observaciones || "",
    });
  }

  function isActiveMovement(item) {
    const state = normalizeText(item?.estado || "registrado");
    if (INACTIVE_STATES.has(state)) return false;
    return ACTIVE_STATES.has(state) || !state;
  }

  function movementInRange(item, from, to) {
    const day = businessDay(item?.fecha || item?.created_at || item?.updated_at);
    return Boolean(day) && (!from || day >= from) && (!to || day <= to);
  }

  function summarizeMovements(items, from = "", to = "") {
    const movements = (items || []).map(normalizeMovement)
      .filter(item => isActiveMovement(item) && movementInRange(item, from, to));
    const ingresos_centavos = movements.filter(item => item.tipo === "ingreso")
      .reduce((sum, item) => sum + item.monto_centavos, 0);
    const gastos_centavos = movements.filter(item => item.tipo === "gasto")
      .reduce((sum, item) => sum + item.monto_centavos, 0);
    return { movements, ingresos_centavos, gastos_centavos };
  }

  function saleIdentifiers(event) {
    const payload = eventPayload(event);
    return [event?.id, event?.event_id, event?.entity_id, payload.id, payload.ventaId,
      payload.venta_id, payload.saleId, payload.sale_id, payload.folio]
      .filter(value => value !== null && value !== undefined && String(value).trim())
      .map(value => String(value).trim().toLocaleLowerCase("es"));
  }

  function saleDeduplicationIdentifiers(event) {
    const payload = eventPayload(event);
    const keys = [event?.id, event?.event_id, event?.entity_id, payload.id, payload.ventaId,
      payload.venta_id, payload.saleId, payload.sale_id]
      .filter(value => value !== null && value !== undefined && String(value).trim())
      .map(value => `id:${String(value).trim().toLocaleLowerCase("es")}`);
    const device = String(event?.device_id || payload.deviceId || payload.device_id
      || payload.cajaId || payload.caja_id || payload.cajaNombre || "").trim().toLocaleLowerCase("es");
    const folio = String(payload.folio ?? payload.numero ?? payload.ticket ?? "").trim().toLocaleLowerCase("es");
    if (device && folio) keys.push(`folio:${device}:${folio}`);
    return [...new Set(keys)];
  }

  function deduplicateSales(sales) {
    const items = Array.isArray(sales) ? sales : [];
    if (items.length < 2) return [...items];
    const parents = items.map((_, index) => index);
    const find = index => {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };
    const union = (left, right) => {
      const a = find(left);
      const b = find(right);
      if (a !== b) parents[b] = a;
    };
    const owner = new Map();
    items.forEach((event, index) => saleDeduplicationIdentifiers(event).forEach(key => {
      if (owner.has(key)) union(index, owner.get(key));
      else owner.set(key, index);
    }));
    const groups = new Map();
    items.forEach((event, index) => {
      const root = find(index);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(event);
    });
    const quality = event => {
      const payload = eventPayload(event);
      return Object.keys(payload || {}).length
        + (payload.clienteNombre || payload.cliente_nombre ? 10 : 0)
        + (Array.isArray(payload.lineas) ? payload.lineas.length : 0)
        + (Array.isArray(payload.pagos) ? payload.pagos.length : 0);
    };
    return [...groups.values()].map(group => group.reduce((best, event) =>
      quality(event) > quality(best) ? event : best, group[0]));
  }

  function movementSaleIdentifiers(movement) {
    const metadata = movement?.metadata || {};
    return [movement?.sync_event_id, movement?.venta_id, movement?.sale_id, movement?.venta_folio,
      metadata.ventaId, metadata.venta_id, metadata.saleId, metadata.sale_id, metadata.folio]
      .filter(value => value !== null && value !== undefined && String(value).trim())
      .map(value => String(value).trim().toLocaleLowerCase("es"));
  }

  function saleAmount(event) {
    const payload = eventPayload(event);
    return Math.abs(finiteNumber(payload.totalCobradoCentavos ?? payload.total_cobrado_centavos
      ?? payload.totalCentavos ?? payload.total_centavos ?? payload.total));
  }

  function saleTimestamp(event) {
    const payload = eventPayload(event);
    return payload.vendidaEn || payload.vendida_en || payload.fecha || payload.fechaEfectiva
      || event?.created_at_local || event?.received_at_cloud || event?.created_at || "";
  }

  function salePayments(event) {
    const payload = eventPayload(event);
    const rows = Array.isArray(payload.pagos) ? payload.pagos : Array.isArray(payload.payments) ? payload.payments : [];
    const payments = rows.map((payment, index) => ({
      index,
      method: normalizeText(payment?.metodo || payment?.method || payload.metodo || "otro").replace(/\s+/g, "_"),
      amount_cents: Math.abs(finiteNumber(payment?.montoCentavos ?? payment?.monto_centavos
        ?? payment?.amountCents ?? payment?.amount_cents ?? payment?.monto)),
      account_id: payment?.cuentaFinancieraId || payment?.cuenta_financiera_id
        || payment?.accountId || payment?.account_id || null,
      account_name: payment?.cuentaFinancieraNombre || payment?.cuenta_financiera_nombre
        || payment?.accountName || payment?.account_name || null,
    })).filter(payment => payment.amount_cents > 0);
    const amount = saleAmount(event);
    if (payments.length) {
      const assigned = payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
      if (amount > assigned) {
        payments.push({
          index: payments.length,
          method: "sin_asignar",
          amount_cents: amount - assigned,
          account_id: null,
          account_name: null,
        });
      }
      return payments;
    }
    return amount > 0 ? [{
      index: 0,
      method: normalizeText(payload.metodo || payload.metodo_pago || payload.paymentMethod || "otro").replace(/\s+/g, "_"),
      amount_cents: amount,
      account_id: payload.cuentaFinancieraId || payload.cuenta_financiera_id || null,
      account_name: payload.cuentaFinancieraNombre || payload.cuenta_financiera_nombre || null,
    }] : [];
  }

  function salePaymentAccount(payment, accounts, options = {}) {
    const active = (accounts || []).filter(account => !account?.oculta && account?.estado !== "eliminada");
    const method = normalizeText(payment?.method).replace(/\s+/g, "_");
    const explicitId = String(payment?.account_id || "").trim();
    const explicitAccount = explicitId ? active.find(account => String(account.id) === explicitId) : null;
    if (explicitAccount && !(explicitAccount.tipo === "tarjeta_credito"
      && ["tarjeta", "credito", "debito", "tarjeta_credito", "tarjeta_debito"].includes(method))) return explicitId;
    const explicitName = normalizeText(payment?.account_name);
    if (explicitName) {
      const exact = active.find(account => normalizeText(account.nombre) === explicitName);
      if (exact && !(exact.tipo === "tarjeta_credito"
        && ["tarjeta", "credito", "debito", "tarjeta_credito", "tarjeta_debito"].includes(method))) return exact.id;
    }
    if (method === "efectivo") {
      return active.find(account => account.tipo === "efectivo" && account.ligada_ventas)?.id
        || active.find(account => account.tipo === "efectivo")?.id || null;
    }
    if (["transferencia", "cheque", "deposito"].includes(method)) {
      const preferred = String(options.transferAccountId || "").trim();
      if (preferred && active.some(account => String(account.id) === preferred && account.tipo === "banco")) return preferred;
      return active.find(account => account.tipo === "banco" && /popular/i.test(String(account.nombre || "")))?.id
        || active.find(account => account.tipo === "banco")?.id || null;
    }
    // Una tarjeta de credito es una deuda, no la cuenta donde el adquirente
    // deposita una venta. Sin cuenta de liquidacion explicita no se inventa.
    return null;
  }

  function projectSalePaymentsAsMovements(sales, accounts, options = {}) {
    return (sales || []).flatMap((event, saleIndex) => {
      const payload = eventPayload(event);
      const ids = saleIdentifiers(event);
      const folio = payload.folio ?? payload.numero ?? payload.ticket ?? "";
      const timestamp = saleTimestamp(event);
      return salePayments(event).map((payment, paymentIndex) => normalizeMovement({
        id: `pos-sale:${ids[0] || `${eventDay(event)}-${saleIndex}`}:${payment.index ?? paymentIndex}`,
        business_id: event?.business_id || options.businessId || "",
        tipo: "ingreso",
        estado: "confirmado",
        fecha: eventDay(event),
        monto_centavos: payment.amount_cents,
        cuenta_id: salePaymentAccount(payment, accounts, options),
        descripcion: folio ? `Venta POS #${folio}` : "Venta sincronizada del POS",
        nota: payload.clienteNombre || payload.cliente_nombre || "Venta confirmada en la caja Windows",
        origen: "pos_venta",
        metodo_pago: payment.method,
        source_timestamp: timestamp,
        venta_folio: folio ? String(folio) : "",
        sync_event_id: event?.event_id || event?.id || "",
        metadata: { sale_identifiers: ids },
        solo_lectura: true,
      }));
    }).filter(item => item.fecha && item.monto_centavos > 0);
  }

  function projectionCutoff(account) {
    const cutoffText = account?.reconciled_at || account?.reconciledAt
      || account?.created_at || account?.createdAt || "";
    const cutoff = cutoffText ? new Date(cutoffText).getTime() : Number.NaN;
    return Number.isFinite(cutoff) ? cutoff : Number.NaN;
  }

  function movementAfterCutoff(account, item) {
    const cutoff = projectionCutoff(account);
    if (!Number.isFinite(cutoff)) return false;
    const normalized = normalizeMovement(item);
    const timestamp = new Date(normalized.source_timestamp || normalized.created_at
      || normalized.updated_at || `${normalized.fecha}T23:59:59-04:00`).getTime();
    return Number.isFinite(timestamp) && timestamp > cutoff;
  }

  function projectedSalesDeltaForAccount(account, movements) {
    if (!account?.id) return 0;
    return (movements || []).map(normalizeMovement).filter(item => {
      if (item.origen !== "pos_venta" || item.cuenta_id !== account.id || !isActiveMovement(item)) return false;
      return movementAfterCutoff(account, item);
    }).reduce((sum, item) => sum + item.monto_centavos, 0);
  }

  function projectedLedgerDeltaForAccount(account, movements) {
    if (!account?.id) return 0;
    return (movements || []).map(normalizeMovement).filter(item =>
      item.source === "pos_sync_event" && isActiveMovement(item) && movementAfterCutoff(account, item)
    ).reduce((sum, item) => {
      const amount = item.monto_centavos;
      if (item.tipo === "transferencia") {
        let delta = 0;
        if (item.cuenta_id === account.id) delta -= amount + item.comision_centavos;
        if (item.cuenta_destino_id === account.id) delta += amount;
        return sum + delta;
      }
      if (item.cuenta_id !== account.id) return sum;
      if (["ingreso", "ajuste_positivo"].includes(item.tipo)) return sum + amount;
      if (["gasto", "ajuste_negativo", "comision"].includes(item.tipo)) return sum - amount;
      return sum;
    }, 0);
  }

  function projectedAccountDeltaForAccount(account, movements) {
    return projectedSalesDeltaForAccount(account, movements)
      + projectedLedgerDeltaForAccount(account, movements);
  }

  function effectiveAccountBalance(account, movements) {
    return finiteNumber(account?.saldo_actual_centavos ?? account?.saldo_inicial_centavos)
      + projectedAccountDeltaForAccount(account, movements);
  }

  function projectSalesAsMovements(sales, options = {}) {
    const accountId = options.accountId || null;
    return (sales || []).map((event, index) => {
      const payload = eventPayload(event);
      const ids = saleIdentifiers(event);
      const folio = payload.folio ?? payload.numero ?? payload.ticket ?? "";
      return normalizeMovement({
        id: `pos-sale:${ids[0] || `${eventDay(event)}-${index}`}`,
        business_id: event?.business_id || options.businessId || "",
        tipo: "ingreso",
        estado: "confirmado",
        fecha: eventDay(event),
        monto_centavos: saleAmount(event),
        cuenta_id: accountId,
        descripcion: folio ? `Venta POS #${folio}` : "Venta sincronizada del POS",
        nota: payload.clienteNombre || payload.cliente_nombre || "Venta confirmada en la caja Windows",
        origen: "pos_venta",
        venta_folio: folio ? String(folio) : "",
        sync_event_id: event?.event_id || event?.id || "",
        metadata: { sale_identifiers: ids },
        solo_lectura: true,
      });
    }).filter(item => item.fecha && item.monto_centavos > 0);
  }

  function mergeSalesIntoMovements(movements, sales, options = {}) {
    const current = (movements || []).map(normalizeMovement).filter(item => item.origen !== "pos_venta");
    const projected = projectSalesAsMovements(sales, options);
    const projectedIds = new Set(projected.flatMap(movement => [
      ...movementSaleIdentifiers(movement), ...(movement.metadata?.sale_identifiers || [])
    ]));
    const base = current.filter(movement => {
      const collidesWithSale = movementSaleIdentifiers(movement).some(id => projectedIds.has(id));
      return !collidesWithSale || (movement.tipo === "ingreso" && movement.monto_centavos > 0);
    });
    const represented = new Set(base
      .filter(movement => movement.tipo === "ingreso" && movement.monto_centavos > 0)
      .flatMap(movementSaleIdentifiers));
    const additions = projected.filter(movement => {
      const ids = [...movementSaleIdentifiers(movement), ...(movement.metadata?.sale_identifiers || [])];
      if (ids.some(id => represented.has(id))) return false;
      ids.forEach(id => represented.add(id));
      return true;
    });
    return [...base, ...additions].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  }

  return {
    BUSINESS_TIME_ZONE,
    businessDay,
    eventDay,
    normalizeMovementType,
    normalizeMovement,
    ledgerEventMovement,
    isActiveMovement,
    movementInRange,
    summarizeMovements,
    eventPayload,
    saleIdentifiers,
    saleDeduplicationIdentifiers,
    deduplicateSales,
    saleAmount,
    saleTimestamp,
    salePayments,
    salePaymentAccount,
    projectSalePaymentsAsMovements,
    projectedSalesDeltaForAccount,
    projectedLedgerDeltaForAccount,
    projectedAccountDeltaForAccount,
    effectiveAccountBalance,
    projectSalesAsMovements,
    mergeSalesIntoMovements,
  };
});
