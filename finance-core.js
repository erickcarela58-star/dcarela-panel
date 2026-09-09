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
  const normalizePaymentMethod = value => {
    const normalized = normalizeText(value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
    return {
      transferencia_bancaria: "transferencia",
      deposito_bancario: "deposito",
      tarjeta_de_debito: "tarjeta_debito",
      tarjeta_de_credito: "tarjeta_credito",
    }[normalized] || normalized;
  };
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
      compra_tarjeta: "gasto", pago_proveedor: "gasto", comision: "gasto",
      pago_tarjeta: "transferencia",
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

  function isActiveMovement(item) {
    const state = normalizeText(item?.estado || "registrado");
    if (INACTIVE_STATES.has(state)) return false;
    return ACTIVE_STATES.has(state) || !state;
  }

  function movementInRange(item, from, to) {
    const day = businessDay(item?.fecha || item?.created_at || item?.updated_at);
    return Boolean(day) && (!from || day >= from) && (!to || day <= to);
  }

  function movementIdentity(item) {
    // Cobros mixtos comparten sync_event_id: su id incluye el lado del pago.
    if (item?.origen === "pos_venta") return item.id ? `venta:${item.id}` : "";
    let id = String(item?.ledger_id || item?.ledgerId || item?.idempotency_key || item?.idempotencyKey || item?.metadata?.idempotency_key
      || item?.id || item?.sync_event_id || "").trim().toLowerCase();
    while (/^(sync-ledger-|ledger-|fin-)/.test(id)) id = id.replace(/^(sync-ledger-|ledger-|fin-)/, "");
    return id;
  }

  function deduplicateMovements(items) {
    const rows = new Map();
    (items || []).map(normalizeMovement).forEach((item, index) => {
      const identity = movementIdentity(item);
      const key = identity ? `${item.business_id || ""}:${identity}` : `anonymous:${index}`;
      const existing = rows.get(key);
      // El documento web contiene estado/anulacion y ya afecto la cuenta.
      // Tiene prioridad sobre su sobre original de sincronizacion.
      if (existing && existing.source !== "pos_sync_event" && item.source === "pos_sync_event") return;
      if (existing && existing.source === item.source) {
        const previousTime = Date.parse(existing.updated_at || existing.created_at || existing.source_timestamp || "");
        const nextTime = Date.parse(item.updated_at || item.created_at || item.source_timestamp || "");
        if (Number.isFinite(previousTime) && Number.isFinite(nextTime) && previousTime > nextTime) return;
      }
      rows.set(key, item);
    });
    return [...rows.values()];
  }

  function transferCommissionCents(item, movements = []) {
    if (normalizeMovementType(item?.tipo) !== "transferencia") return 0;
    const fee = Math.abs(finiteNumber(item?.comision_centavos ?? item?.comisionCentavos));
    if (!fee) return 0;
    // Los nuevos asientos guardan la comision como gasto independiente. Las
    // transferencias legacy aun la llevan dentro de su propio documento.
    const feeId = item.comision_movimiento_id || item.fee_movement_id
      || item.metadata?.comision_movimiento_id || item.metadata?.fee_movement_id;
    if (feeId) return 0;
    const transferId = movementIdentity(item);
    const linkedExpense = transferId && movements.some(row => {
      const parentId = row.transferencia_id || row.transfer_id
        || row.metadata?.transferencia_id || row.metadata?.transfer_id;
      return parentId && movementIdentity({ id: parentId }) === transferId
        && normalizeMovementType(row.tipo) === "gasto";
    });
    return linkedExpense ? 0 : fee;
  }

  function summarizeMovements(items, from = "", to = "") {
    const allMovements = deduplicateMovements(items);
    const movements = allMovements
      .filter(item => isActiveMovement(item) && movementInRange(item, from, to));
    const ingresos_centavos = movements.filter(item => item.tipo === "ingreso" && item.afecta_resultado !== false)
      .reduce((sum, item) => sum + item.monto_centavos, 0);
    const gastos_centavos = movements.filter(item => item.tipo === "gasto" && item.afecta_resultado !== false)
      .reduce((sum, item) => sum + item.monto_centavos, 0)
      + movements.reduce((sum, item) => sum + transferCommissionCents(item, allMovements), 0);
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
      movement?.ventaId, movement?.ventaFolio, metadata.ventaId, metadata.venta_id, metadata.saleId,
      metadata.sale_id, metadata.folio, ...(Array.isArray(metadata.sale_identifiers) ? metadata.sale_identifiers : [])]
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
      method: normalizePaymentMethod(payment?.metodo || payment?.metodoPago || payment?.metodo_pago
        || payment?.method || payment?.tipo || payload.metodo || payload.metodoPago
        || payload.metodo_pago || payload.formaPago || "otro"),
      amount_cents: Math.abs(finiteNumber(payment?.montoCentavos ?? payment?.monto_centavos
        ?? payment?.amountCents ?? payment?.amount_cents ?? payment?.monto)),
      account_id: payment?.cuentaFinancieraId || payment?.cuenta_financiera_id
        || payment?.accountId || payment?.account_id || payment?.cuentaId || payment?.cuenta_id || null,
      account_name: payment?.cuentaFinancieraNombre || payment?.cuenta_financiera_nombre
        || payment?.accountName || payment?.account_name || payment?.cuentaNombre || payment?.cuenta_nombre || null,
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
      method: normalizePaymentMethod(payload.metodo || payload.metodoPago || payload.metodo_pago
        || payload.paymentMethod || payload.formaPago || "otro"),
      amount_cents: amount,
      account_id: payload.cuentaFinancieraId || payload.cuenta_financiera_id || null,
      account_name: payload.cuentaFinancieraNombre || payload.cuenta_financiera_nombre || null,
    }] : [];
  }

  function salePaymentAccount(payment, accounts, options = {}) {
    const active = (accounts || []).filter(account => !account?.oculta && account?.estado !== "eliminada");
    const method = normalizePaymentMethod(payment?.method);
    if (method === "credito" || method === "sin_asignar") return null;
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
    if (["transferencia", "cheque", "deposito", "tarjeta", "tarjeta_debito", "tarjeta_credito", "debito"].includes(method)) {
      const preferred = String(options.transferAccountId || options.cardAccountId || options.saleAccountId || "").trim();
      if (preferred && active.some(account => String(account.id) === preferred && account.tipo === "banco")) return preferred;
      return active.find(account => account.tipo === "banco" && /popular/i.test(String(account.nombre || "")))?.id
        || active.find(account => account.tipo === "banco")?.id || null;
    }
    // El credito queda pendiente en la cuenta del cliente; no entra al banco
    // hasta que se cobre como abono. Las tarjetas/cheques ya se liquidan en
    // el banco de ventas arriba, para que Caja y Finanzas compartan el mismo motor.
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
        metadata: { sale_identifiers: ids, sale_keys: saleDeduplicationIdentifiers(event), payment_index: payment.index ?? paymentIndex },
        solo_lectura: true,
      }));
    }).filter(item => item.fecha && item.monto_centavos > 0);
  }

  function projectedSalesDeltaForAccount(account, movements) {
    if (!account?.id) return 0;
    const cutoffText = account.reconciled_at || account.reconciledAt || account.created_at || account.createdAt || "";
    const cutoff = cutoffText ? new Date(cutoffText).getTime() : Number.NaN;
    if (!Number.isFinite(cutoff)) return 0;
    return (movements || []).map(normalizeMovement).filter(item => {
      if (item.origen !== "pos_venta" || item.cuenta_id !== account.id || !isActiveMovement(item)) return false;
      const timestamp = new Date(item.source_timestamp || `${item.fecha}T23:59:59-04:00`).getTime();
      return Number.isFinite(timestamp) && timestamp > cutoff;
    }).reduce((sum, item) => sum + item.monto_centavos, 0);
  }

  function unrepresentedSalePayments(movements) {
    const unique = deduplicateMovements(movements);
    const strongKeys = item => {
      if (Array.isArray(item.metadata?.sale_keys)) return item.metadata.sale_keys;
      // A folio alone is local to its terminal and cannot identify a sale.
      return [item.venta_id, item.ventaId, item.sale_id, item.saleId,
        item.metadata?.venta_id, item.metadata?.ventaId, item.sync_event_id]
        .filter(value => value != null && String(value).trim())
        .map(value => 'id:' + String(value).trim().toLocaleLowerCase('es'));
    };
    const materialized = unique.filter(item => item.origen !== 'pos_venta' && item.tipo === 'ingreso');
    const consumed = new Set();
    return unique.filter(item => {
      if (item.origen !== 'pos_venta') return true;
      const keys = new Set(strongKeys(item));
      const match = materialized.findIndex((row, index) => !consumed.has(index)
        && row.cuenta_id === item.cuenta_id && row.monto_centavos === item.monto_centavos
        && (row.metadata?.payment_index == null || item.metadata?.payment_index == null
          || row.metadata.payment_index === item.metadata.payment_index)
        && strongKeys(row).some(key => keys.has(key)));
      if (match < 0) return true;
      consumed.add(match);
      return false;
    });
  }

  function projectedLedgerDeltaForAccount(account, movements) {
    if (!account?.id) return 0;
    const cutoffText = account.reconciled_at || account.reconciledAt || account.created_at || account.createdAt || "";
    const cutoff = cutoffText ? new Date(cutoffText).getTime() : Number.NaN;
    if (!Number.isFinite(cutoff)) return 0;
    const uniqueMovements = unrepresentedSalePayments(movements);
    const fromCheckpoint = Number.isFinite(account.reconciled_balance_centavos);
    return uniqueMovements.filter(item => {
      if (!isActiveMovement(item)) return false;
      // fin_movements ya fue materializado en saldo_actual_centavos. Solo se
      // proyectan ventas y eventos del ledger Windows que aun no viven en la
      // cuenta remota; asi una escritura web y su sync_event no se duplican.
      if (fromCheckpoint) return true;
      const materializedOrigin = ["panel", "asistente", "movil", "caja_web", "conciliacion_propietario"]
        .includes(String(item.origen || "").toLowerCase());
      return item.origen === "pos_venta" || item.source === "pos_operation"
        || (item.source === "pos_sync_event" && !materializedOrigin);
    }).reduce((sum, item) => {
      const timestamp = new Date(item.source_timestamp || (item.fecha ? `${item.fecha}T23:59:59-04:00` : item.created_at)
        || `${item.fecha}T23:59:59-04:00`).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= cutoff) return sum;
      const amount = Math.abs(finiteNumber(item.monto_centavos));
      const fee = transferCommissionCents(item, uniqueMovements);
      // Windows reconstruye el saldo por origen/destino para TODOS los tipos
      // confirmados (incluye compras/pagos de tarjeta, proveedor y ajustes).
      const sourceId = item.cuenta_origen_id || item.cuentaOrigenId
        || (["gasto", "transferencia", "ajuste_negativo"].includes(item.tipo) ? item.cuenta_id : null);
      const targetId = item.cuenta_destino_id || item.cuentaDestinoId
        || (["ingreso", "ajuste_positivo"].includes(item.tipo) ? item.cuenta_id : null);
      if (String(sourceId || "") === String(account.id)) sum -= amount + fee;
      if (String(targetId || "") === String(account.id)) sum += amount;
      return sum;
    }, 0);
  }

  function effectiveAccountBalance(account, movements) {
    // Un cuadre es una base inmutable, no un acumulado que pueda contener ya
    // parte de las ventas. Todos los consumidores suman el mismo diario.
    return finiteNumber(account?.reconciled_balance_centavos ?? account?.saldo_actual_centavos ?? account?.saldo_inicial_centavos)
      + projectedLedgerDeltaForAccount(account, movements);
  }

  const OPERATION_EVENT_TYPES = ["GastoRegistrado", "GastoEditado", "GastoAnulado", "GastoEliminado",
    "AbonoClienteRegistrado", "EntradaEfectivo", "SalidaEfectivo"];

  function projectOperationsAsMovements(events, accounts, represented = [], options = {}) {
    const latest = new Map();
    const links = row => [row.gasto_id, row.gastoId, row.caja_movimiento_id, row.cajaMovimientoId,
      row.movimientoCajaId, row.abono_id, row.abonoId, row.metadata?.gasto_id,
      row.metadata?.caja_movimiento_id, row.metadata?.abono_id].filter(Boolean).map(String);
    const representedIds = new Set(represented.flatMap(links));
    const ordered = [...(events || [])].sort((a, b) => String(a.created_at_local || "").localeCompare(String(b.created_at_local || "")));
    ordered.filter(event => OPERATION_EVENT_TYPES.includes(event.event_type)).forEach(event => {
      const p = eventPayload(event);
      const expense = event.event_type.startsWith("Gasto");
      const id = expense ? p.gastoId || event.entity_id : p.movimientoId || event.event_id || event.id;
      latest.set(`${expense ? "expense" : "cash"}:${id}`, { event, p, expense, id });
    });
    const expenseCashIds = new Set([...latest.values()].filter(x => x.expense).map(x => x.p.movimientoCajaId).filter(Boolean));
    return [...latest.values()].flatMap(({ event, p, expense, id }) => {
      if ([id, p.movimientoCajaId].filter(Boolean).some(key => representedIds.has(String(key)))) return [];
      if (!expense && expenseCashIds.has(id)) return [];
      const entry = event.event_type === "EntradaEfectivo";
      if (entry && p.origenEntrada !== "dinero_cliente") return [];
      const abono = event.event_type === "AbonoClienteRegistrado";
      const type = expense || event.event_type === "SalidaEfectivo" ? "gasto" : "ingreso";
      const accountId = salePaymentAccount({ method: p.metodo || p.metodoPago || "efectivo",
        account_id: p.cuentaFinancieraId || p.cuentaId, account_name: p.cuentaFinancieraNombre }, accounts, options);
      const timestamp = p.fecha || p.registradoEn || event.created_at_local;
      return [normalizeMovement({ id: `operation-${expense ? "expense" : "cash"}-${id}`,
        business_id: event.business_id || options.businessId || "", tipo: type,
        estado: /Anulado|Eliminado/.test(event.event_type) || p.activo === false ? "anulado" : "registrado",
        monto_centavos: p.montoCentavos, cuenta_id: accountId, fecha: businessDay(timestamp),
        source_timestamp: timestamp, source: "pos_operation", origen: "caja_operacion",
        descripcion: p.descripcion || p.motivo || (abono ? "Abono de cliente" : "Movimiento de caja"),
        payee: p.clienteNombre || null, nota: p.nota || null, categoria_id: p.categoriaId || null,
        afecta_resultado: type === "gasto", gasto_id: expense ? id : null,
        caja_movimiento_id: expense ? p.movimientoCajaId : !abono ? id : null,
        abono_id: abono ? id : null, sync_event_id: event.event_id || event.id, solo_lectura: true,
      })];
    });
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

  function planCommitmentPayment(commitment, data) {
    const cents = (value, label, minimum = 0) => {
      if (!Number.isSafeInteger(value) || value < minimum) throw new Error(label + ' debe ser un entero valido en centavos.');
      return value;
    };
    const amount = cents(data.montoCentavos, 'El pago', 1);
    const loan = ['prestamo', 'prestamos', 'loan'].includes(normalizeText(commitment.tipo).normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const interest = cents(data.interesCentavos ?? 0, 'El interes');
    const charges = cents(data.cargosCentavos ?? 0, 'Los cargos');
    if (loan && data.capitalCentavos == null) throw new Error('Indica el capital del prestamo, incluso si es cero.');
    const capital = cents(data.capitalCentavos ?? 0, 'El capital');
    if (capital + interest + charges > amount || (loan && capital + interest + charges !== amount)) {
      throw new Error('Capital, interes y cargos deben sumar exactamente el pago del prestamo.');
    }
    const patch = {};
    const reduceKnown = (field, paid) => {
      if (commitment[field] == null) return;
      const balance = cents(commitment[field], 'El saldo registrado');
      if (loan && paid > balance) throw new Error('El pago supera el saldo registrado de ' + field + '. Revisa el contrato antes de pagar.');
      patch[field] = Math.max(0, balance - paid);
    };
    reduceKnown('saldo_pendiente_centavos', amount);
    if (loan) {
      reduceKnown('capital_pendiente_centavos', capital);
      reduceKnown('cargos_intereses_pendientes_centavos', interest + charges);
      const installments = cents(data.cuotasAplicadas ?? 1, 'Las cuotas', 0);
      patch.cuotas_pagadas = cents(commitment.cuotas_pagadas ?? 0, 'Las cuotas pagadas') + installments;
      if (commitment.cuotas_totales != null && patch.cuotas_pagadas > commitment.cuotas_totales) throw new Error('Las cuotas aplicadas superan el total del contrato.');
      if (commitment.cuota_actual != null) patch.cuota_actual = commitment.cuota_actual + installments;
    }
    const mainAmount = loan && capital > 0 ? capital : amount;
    return { amount, capital, interest, charges, loan, patch, mainAmount,
      mainAffectsResult: loan ? capital === 0 : data.afectaResultado !== false,
      expenseAmount: loan && capital > 0 ? interest + charges : 0 };
  }

  return {
    BUSINESS_TIME_ZONE,
    planCommitmentPayment,
    businessDay,
    eventDay,
    normalizeMovementType,
    normalizeMovement,
    deduplicateMovements,
    transferCommissionCents,
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
    unrepresentedSalePayments,
    effectiveAccountBalance,
    OPERATION_EVENT_TYPES,
    projectOperationsAsMovements,
    projectSalesAsMovements,
    mergeSalesIntoMovements,
  };
});
