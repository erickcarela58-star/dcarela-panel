(function(root, factory) {
  const finance = typeof module === "object" && module.exports
    ? require("./finance-core.js")
    : root?.DcarelaFinanceCore;
  const api = factory(finance);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DcarelaMoneyManagerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(financeCore) {
  "use strict";

  if (!financeCore) throw new Error("Money Manager necesita finance-core.js.");

  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const text = value => String(value ?? "").trim();
  const lower = value => text(value).toLocaleLowerCase("es");
  const monthKey = value => financeCore.businessDay(value).slice(0, 7);
  const activeState = value => !["anulada", "anulado", "cancelada", "cancelado", "pagada", "pagado", "saldada", "saldado", "liquidada", "liquidado", "inactiva", "inactivo", "eliminada", "eliminado"]
    .includes(lower(value));

  function monthBounds(month) {
    const safe = /^\d{4}-\d{2}$/.test(text(month)) ? text(month) : financeCore.businessDay(new Date()).slice(0, 7);
    const [year, monthNumber] = safe.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return { month: safe, from: `${safe}-01`, to: `${safe}-${String(lastDay).padStart(2, "0")}` };
  }

  function sourceOf(movement) {
    if (movement?.origen === "pos_venta") return "venta_automatica";
    if (movement?.tipo === "transferencia") return "transferencia";
    if (["conciliacion", "reconciliacion", "ajuste"].includes(lower(movement?.origen))
      || /^ajuste(?:_|$)/.test(lower(movement?.tipo))) return "conciliacion";
    if (["asistente", "ia"].includes(lower(movement?.origen))) return "asistente";
    if (["pos", "windows", "caja"].includes(lower(movement?.origen))) return "caja_windows";
    return "manual";
  }

  function activeMovements(rows) {
    return financeCore.deduplicateMovements(rows)
      .filter(financeCore.isActiveMovement)
      .sort((left, right) => `${right.fecha || ""} ${right.hora || ""}`.localeCompare(`${left.fecha || ""} ${left.hora || ""}`));
  }

  function summarizeMovements(rows, month) {
    const range = monthBounds(month);
    const totals = financeCore.summarizeMovements(rows, range.from, range.to);
    const movements = totals.movements;
    const income = totals.ingresos_centavos;
    const expenses = totals.gastos_centavos;
    const transfers = movements.filter(item => item.tipo === "transferencia").reduce((sum, item) => sum + number(item.monto_centavos), 0);
    const sales = movements.filter(item => sourceOf(item) === "venta_automatica").reduce((sum, item) => sum + number(item.monto_centavos), 0);
    const manualIncome = movements.filter(item => item.tipo === "ingreso" && item.afecta_resultado !== false && sourceOf(item) !== "venta_automatica")
      .reduce((sum, item) => sum + number(item.monto_centavos), 0);
    return { ...range, movements, income, expenses, transfers, sales, manualIncome, result: income - expenses };
  }

  function accountSummary(accounts, projectedMovements) {
    const rows = (accounts || []).filter(item => item.estado !== "eliminada");
    const balances = rows.map(account => ({
      ...account,
      effective_balance_cents: financeCore.effectiveAccountBalance(account, projectedMovements || []),
    }));
    const netWorth = balances.filter(item => item.incluir_en_total)
      .reduce((sum, item) => sum + item.effective_balance_cents, 0);
    const cardDebt = balances.filter(item => item.tipo === "tarjeta_credito")
      .reduce((sum, item) => sum + Math.max(0, -item.effective_balance_cents), 0);
    const available = balances.filter(item => item.tipo !== "tarjeta_credito" && item.incluir_en_total)
      .reduce((sum, item) => sum + item.effective_balance_cents, 0);
    return { rows: balances, netWorth, cardDebt, available };
  }

  function legacyObligation(item) {
    const state = lower(item?.estado || "pendiente");
    const due = financeCore.businessDay(item?.venceEn || item?.vence_en || item?.fechaVencimiento || item?.proximo_vencimiento || "");
    const balance = number(item?.saldoCentavos ?? item?.saldo_centavos ?? item?.montoCentavos ?? item?.monto_centavos);
    return {
      id: `legacy:${item?.id || item?.obligacionId || item?.concepto || due}`,
      legacyId: item?.id || item?.obligacionId || null,
      source: "factura",
      name: item?.concepto || item?.descripcion || "Obligacion",
      type: lower(item?.tipo || item?.categoria),
      due,
      periodAmount: balance,
      outstanding: balance,
      active: balance > 0 && activeState(state),
      state,
      raw: item,
    };
  }

  function nativeCommitment(item) {
    const state = lower(item?.estado || (item?.activo === false ? "inactivo" : "activo"));
    const outstanding = item?.saldo_pendiente_centavos == null ? null : number(item.saldo_pendiente_centavos);
    const loan = isLoanType(item?.tipo);
    const complete = number(item?.cuotas_totales) > 0 && number(item?.cuotas_pagadas) >= number(item.cuotas_totales);
    const settled = loan && (outstanding === 0 || (complete && outstanding == null));
    const periodAmount = number(item?.monto_centavos);
    return {
      id: text(item?.id),
      source: "compromiso",
      name: item?.nombre || "Compromiso",
      type: lower(item?.tipo),
      due: financeCore.businessDay(item?.proximo_vencimiento || item?.fecha_inicio || ""),
      periodAmount: loan && outstanding != null ? Math.min(periodAmount, Math.max(0, outstanding)) : periodAmount,
      outstanding,
      capital: item?.capital_pendiente_centavos == null ? null : number(item.capital_pendiente_centavos),
      active: item?.activo !== false && activeState(state) && !settled,
      needsReview: loan && complete && outstanding > 0,
      state,
      raw: item,
    };
  }

  function isLoanType(value) {
    // "Deuda de internet" o "cuota de servicio" no clasifican un prestamo.
    return ["prestamo", "prestamos", "loan"].includes(lower(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  }

  function plannedObligation(item) {
    return {
      id: `plan:${item?.id || item?.recurrenteId || item?.nombre}`,
      recurringId: item?.id || item?.recurrenteId || null,
      source: "planificado",
      name: item?.nombre || item?.descripcion || "Pago planificado",
      type: lower(item?.categoria || item?.tipo || "servicio"),
      due: financeCore.businessDay(item?.proximaFecha || item?.proxima_fecha || ""),
      periodAmount: number(item?.montoEstimadoCentavos ?? item?.monto_estimado_centavos),
      outstanding: number(item?.montoEstimadoCentavos ?? item?.monto_estimado_centavos),
      active: item?.activo !== false,
      state: "previsto",
      raw: item,
    };
  }

  function obligationSummary({ commitments = [], costObligations = [], costRecurrents = [], month } = {}) {
    const range = monthBounds(month);
    const native = commitments.map(nativeCommitment);
    const nativeIds = new Set(native.map(item => item.id).filter(Boolean));
    const legacy = costObligations.map(legacyObligation)
      .filter(item => !nativeIds.has(text(item.legacyId)));
    const materializedRecurringKeys = new Set(costObligations.flatMap(item => {
      const recurringId = text(item?.recurrenteId || item?.recurrente_id);
      const due = financeCore.businessDay(item?.venceEn || item?.vence_en || item?.fechaVencimiento || "");
      return [text(item?.periodoClave || item?.periodo_clave), recurringId && due ? `${recurringId}:${due}` : ""];
    }).filter(Boolean));
    const planned = costRecurrents.map(plannedObligation).filter(item => {
      if (!item.active || !item.due || item.periodAmount <= 0) return false;
      if (item.recurringId && materializedRecurringKeys.has(`${text(item.recurringId)}:${item.due}`)) return false;
      return item.due <= range.to;
    });
    const rows = [...native, ...legacy, ...planned].filter(item => item.active);
    const current = rows.filter(item => item.due >= range.from && item.due <= range.to);
    const overdue = rows.filter(item => item.due && item.due < range.from);
    const dueNow = [...overdue, ...current];
    const isLoan = item => isLoanType(item.type);
    const nativeLoans = native.filter(item => item.active && isLoan(item));
    const legacyLoans = legacy.filter(item => item.active && isLoan(item));
    const loanDebt = nativeLoans.reduce((sum, item) => sum + Math.max(0,
      item.outstanding == null ? item.periodAmount : item.outstanding), 0);
    // Los compromisos viejos viven como cuotas materializadas. Se suman sus
    // saldos pendientes una sola vez; no se confunden servicios o nomina con
    // deuda, ni se agrega de nuevo el plan recurrente que las genero.
    const legacyLoanDebt = legacyLoans.reduce((sum, item) => sum + Math.max(0, item.outstanding || 0), 0);
    const loanCapital = nativeLoans.reduce((sum, item) => sum + Math.max(0, item.capital || 0), 0);
    return {
      ...range,
      rows,
      current,
      overdue,
      dueNow,
      currentDue: current.reduce((sum, item) => sum + Math.max(0, item.periodAmount || item.outstanding || 0), 0),
      overdueDue: overdue.reduce((sum, item) => sum + Math.max(0, item.periodAmount || item.outstanding || 0), 0),
      payableNow: dueNow.reduce((sum, item) => sum + Math.max(0, item.periodAmount || item.outstanding || 0), 0),
      loanDebt: loanDebt + legacyLoanDebt,
      loanCapital,
      plannedMissing: planned,
    };
  }

  function calendar(rows, month) {
    const range = monthBounds(month);
    const [year, monthNumber] = range.month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1, 12);
    const leading = (first.getDay() + 6) % 7;
    const daysInMonth = Number(range.to.slice(-2));
    const byDay = new Map();
    const allMovements = financeCore.deduplicateMovements(rows);
    activeMovements(allMovements).filter(item => monthKey(item.fecha) === range.month).forEach(item => {
      const day = item.fecha;
      const summary = byDay.get(day) || { income: 0, expenses: 0, transfers: 0, count: 0 };
      if (item.tipo === "ingreso" && item.afecta_resultado !== false) summary.income += number(item.monto_centavos);
      if (item.tipo === "gasto" && item.afecta_resultado !== false) summary.expenses += number(item.monto_centavos);
      summary.expenses += financeCore.transferCommissionCents(item, allMovements);
      if (item.tipo === "transferencia") summary.transfers += number(item.monto_centavos);
      summary.count += 1;
      byDay.set(day, summary);
    });
    const cells = [];
    for (let index = 0; index < leading; index++) cells.push({ outside: true });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${range.month}-${String(day).padStart(2, "0")}`;
      cells.push({ outside: false, day, date, ...(byDay.get(date) || { income: 0, expenses: 0, transfers: 0, count: 0 }) });
    }
    while (cells.length % 7) cells.push({ outside: true });
    return { ...range, cells };
  }

  function filterMovements(rows, filters = {}) {
    const query = lower(filters.query);
    return activeMovements(rows).filter(item => {
      if (filters.type && item.tipo !== filters.type) return false;
      if (filters.accountId && item.cuenta_id !== filters.accountId && item.cuenta_destino_id !== filters.accountId) return false;
      if (filters.source && sourceOf(item) !== filters.source) return false;
      if (filters.day && item.fecha !== filters.day) return false;
      if (!query) return true;
      return [item.descripcion, item.payee, item.nota, item.venta_folio].some(value => lower(value).includes(query));
    });
  }

  return {
    monthBounds,
    sourceOf,
    activeMovements,
    summarizeMovements,
    accountSummary,
    obligationSummary,
    calendar,
    filterMovements,
  };
});
