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
    const payload = event?.payload || {};
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

  return {
    BUSINESS_TIME_ZONE,
    businessDay,
    eventDay,
    normalizeMovementType,
    normalizeMovement,
    isActiveMovement,
    movementInRange,
    summarizeMovements,
  };
});
