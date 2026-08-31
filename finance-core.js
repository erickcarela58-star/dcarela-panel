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
    const represented = new Set(current.flatMap(movementSaleIdentifiers));
    const additions = projectSalesAsMovements(sales, options).filter(movement => {
      const ids = [...movementSaleIdentifiers(movement), ...(movement.metadata?.sale_identifiers || [])];
      if (ids.some(id => represented.has(id))) return false;
      ids.forEach(id => represented.add(id));
      return true;
    });
    return [...current, ...additions].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  }

  return {
    BUSINESS_TIME_ZONE,
    businessDay,
    eventDay,
    normalizeMovementType,
    normalizeMovement,
    isActiveMovement,
    movementInRange,
    summarizeMovements,
    eventPayload,
    saleIdentifiers,
    saleAmount,
    projectSalesAsMovements,
    mergeSalesIntoMovements,
  };
});
