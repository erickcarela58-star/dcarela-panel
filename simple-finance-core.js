(function(root, factory) {
  const money = typeof module === "object" && module.exports
    ? require("./money-manager-core.js") : root?.DcarelaMoneyManagerCore;
  const finance = typeof module === "object" && module.exports
    ? require("./finance-core.js") : root?.DcarelaFinanceCore;
  const api = factory(money, finance);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DcarelaSimpleFinanceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(money, finance) {
  "use strict";
  if (!money || !finance) throw new Error("Falta el libro financiero compartido.");

  const dayOf = row => String(row?.fecha || "").slice(0, 10);
  const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
  function mondayOf(day) {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  }
  function group(rows, month, period = "day", accountCurrencies = {}) {
    if (!/^\d{4}-\d{2}$/.test(month)) return [];
    const groups = new Map();
    for (const row of money.activeMovements(rows || [])) {
      const day = dayOf(row);
      if (!validDay(day) || !day.startsWith(`${month}-`)) continue;
      const key = period === "week" ? mondayOf(day) : period === "month" ? `${month}-01` : day;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([key, items]) => {
      const byCurrency = {};
      for (const item of items) {
        const currency = String(item.moneda || accountCurrencies[item.cuenta_id] || "DOP").toUpperCase();
        (byCurrency[currency] ||= []).push(item);
      }
      const currencies = Object.fromEntries(Object.entries(byCurrency).map(([currency, currencyRows]) => {
        const totals = finance.summarizeMovements(currencyRows, `${month}-01`, `${month}-31`);
        return [currency, { income: totals.ingresos_centavos, expenses: totals.gastos_centavos,
          result: totals.ingresos_centavos - totals.gastos_centavos }];
      }));
      const dop = currencies.DOP || { income: 0, expenses: 0, result: 0 };
      return { key, items, currencies, income: dop.income, expenses: dop.expenses,
        result: dop.result,
        transfers: items.filter(item => item.tipo === "transferencia").length };
    });
  }
  // Estadísticas al estilo Money Manager: reparto por categoría de un mes para UNA moneda (sin convertir).
  // `tipo` es «ingreso» o «gasto»; cada categoría trae su importe y su porcentaje del total del tipo.
  function breakdown(rows, month, tipo = "gasto", currency = "DOP", categories = {}, accountCurrencies = {}) {
    if (!/^\d{4}-\d{2}$/.test(month) || !["ingreso", "gasto"].includes(tipo)) return { total: 0, items: [] };
    const wanted = String(currency || "DOP").toUpperCase();
    const inMonth = (rows || []).filter(row => {
      const day = dayOf(row);
      return validDay(day) && day.startsWith(`${month}-`)
        && String(row.moneda || accountCurrencies[row.cuenta_id] || "DOP").toUpperCase() === wanted;
    });
    const unique = finance.summarizeMovements(inMonth, `${month}-01`, `${month}-31`).movements
      .filter(item => item.tipo === tipo && item.afecta_resultado !== false);
    const byCategory = new Map();
    for (const item of unique) {
      const id = item.categoria_id || "";
      const name = categories[id] || item.categoria || "Sin categoría";
      const key = id || name;
      const current = byCategory.get(key) || { id, nombre: name, centavos: 0, movimientos: 0 };
      current.centavos += Number(item.monto_centavos) || 0; current.movimientos += 1;
      byCategory.set(key, current);
    }
    const total = [...byCategory.values()].reduce((sum, item) => sum + item.centavos, 0);
    const items = [...byCategory.values()].sort((a, b) => b.centavos - a.centavos)
      .map(item => ({ ...item, porcentaje: total ? Math.round(item.centavos / total * 1000) / 10 : 0 }));
    return { total, items };
  }
  return { group, mondayOf, breakdown };
});
