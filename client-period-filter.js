(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DcarelaClientPeriodFilter = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const payloadOf = item => {
    if (item?.payload && typeof item.payload === 'object') return item.payload;
    if (typeof item?.payload === 'string') {
      try { return JSON.parse(item.payload) || {}; } catch { return {}; }
    }
    return item || {};
  };
  const dateOnly = value => {
    const raw = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  };
  const number = (...values) => {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };

  function saleRecord(item) {
    const payload = payloadOf(item);
    const status = normalize(payload.status || item?.status || payload.estado);
    const eventType = String(item?.event_type || '');
    return {
      key: String(payload.ventaId || payload.venta_id || payload.saleId || payload.sale_id
        || item?.entity_id || payload.id || item?.id || item?.event_id || ''),
      clientId: String(payload.clienteId || payload.cliente_id || payload.clientId || payload.customer_id || '').trim(),
      clientName: String(payload.clienteNombre || payload.cliente_nombre || payload.customerName || payload.customer_name || '').trim(),
      day: dateOnly(payload.vendidaEn || payload.fecha || item?.created_at_local || item?.received_at_cloud || item?.created_at),
      totalCents: number(payload.totalCobradoCentavos, payload.total_cobrado_centavos, payload.totalCentavos, payload.total_centavos, payload.total),
      cancelled: eventType === 'VentaCancelada' || ['cancelled', 'anulado', 'anulada'].includes(status),
    };
  }

  function analyze({ clients = [], sales = [], query = '', balance = 'all', from = '', to = '', requirePeriod = false } = {}) {
    const clientRows = Array.isArray(clients) ? clients : [];
    const names = new Map();
    clientRows.forEach(client => {
      const key = normalize(client.nombre || client.name);
      if (key) names.set(key, (names.get(key) || 0) + 1);
    });
    const activity = new Map();
    const seenSales = new Set();
    for (const raw of Array.isArray(sales) ? sales : []) {
      const sale = saleRecord(raw);
      if (sale.cancelled || !sale.day || (from && sale.day < from) || (to && sale.day > to)) continue;
      const unique = sale.key || `${sale.clientId}|${normalize(sale.clientName)}|${sale.day}|${sale.totalCents}`;
      if (seenSales.has(unique)) continue;
      seenSales.add(unique);
      let clientKey = sale.clientId ? `id:${sale.clientId}` : '';
      const nameKey = normalize(sale.clientName);
      if (!clientKey && nameKey && names.get(nameKey) === 1) clientKey = `name:${nameKey}`;
      if (!clientKey) continue;
      const current = activity.get(clientKey) || { purchases: 0, totalCents: 0, lastSale: '' };
      current.purchases += 1;
      current.totalCents += sale.totalCents;
      if (sale.day > current.lastSale) current.lastSale = sale.day;
      activity.set(clientKey, current);
    }

    const term = normalize(query);
    const rows = clientRows.map(client => {
      const idKey = `id:${String(client.id || client.clienteId || client.cliente_id || '').trim()}`;
      const nameKey = `name:${normalize(client.nombre || client.name)}`;
      const clientActivity = activity.get(idKey) || activity.get(nameKey)
        || { purchases: 0, totalCents: 0, lastSale: '' };
      return { ...client, _periodPurchases: clientActivity.purchases, _periodTotalCentavos: clientActivity.totalCents, _periodLastSale: clientActivity.lastSale };
    }).filter(client => {
      const debt = number(client.saldoCentavos, client.saldo_centavos);
      if (balance === 'debt' && debt <= 0) return false;
      if (balance === 'no-debt' && debt > 0) return false;
      if (requirePeriod && client._periodPurchases <= 0) return false;
      if (!term) return true;
      return [client.nombre, client.name, client.telefono, client.phone, client.rnc, client.email, client.folio]
        .some(value => normalize(value).includes(term));
    });

    return {
      rows,
      periodCustomers: rows.filter(client => client._periodPurchases > 0).length,
      noDebtCustomers: rows.filter(client => number(client.saldoCentavos, client.saldo_centavos) <= 0).length,
      periodSales: rows.reduce((sum, client) => sum + client._periodPurchases, 0),
      periodTotalCents: rows.reduce((sum, client) => sum + client._periodTotalCentavos, 0),
    };
  }

  return { analyze, _test: { normalize, saleRecord, dateOnly } };
});
