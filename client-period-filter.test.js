const test = require('node:test');
const assert = require('node:assert/strict');
const filter = require('./client-period-filter.js');

test('encuentra clientes sin deuda que compraron dentro de un periodo', () => {
  const result = filter.analyze({
    clients: [
      { id: 'ana', nombre: 'Ana', saldoCentavos: 0, activo: true },
      { id: 'beto', nombre: 'Beto', saldoCentavos: 5000, activo: true },
      { id: 'carla', nombre: 'Carla', saldoCentavos: 0, activo: true },
    ],
    sales: [
      { event_id: 'sale-1', event_type: 'VentaCobrada', created_at_local: '2026-08-12T10:00:00', payload: { clienteId: 'ana', totalCobradoCentavos: 15000 } },
      { event_id: 'sale-2', event_type: 'VentaCobrada', created_at_local: '2026-08-14T10:00:00', payload: { clienteId: 'beto', totalCobradoCentavos: 22000 } },
      { event_id: 'old', event_type: 'VentaCobrada', created_at_local: '2026-07-01T10:00:00', payload: { clienteId: 'carla', totalCobradoCentavos: 9000 } },
    ],
    balance: 'no-debt', from: '2026-08-01', to: '2026-08-31', requirePeriod: true,
  });
  assert.deepEqual(result.rows.map(client => client.id), ['ana']);
  assert.equal(result.rows[0]._periodPurchases, 1);
  assert.equal(result.rows[0]._periodTotalCentavos, 15000);
  assert.equal(result.noDebtCustomers, 1);
});

test('deduplica una venta repetida y excluye anuladas', () => {
  const result = filter.analyze({
    clients: [{ id: 'ana', nombre: 'Ana', saldoCentavos: 0 }],
    sales: [
      { event_id: 'sale-1', event_type: 'VentaCobrada', created_at_local: '2026-08-12T10:00:00', payload: { clienteId: 'ana', totalCobradoCentavos: 15000 } },
      { event_id: 'sale-1', event_type: 'VentaCobrada', created_at_local: '2026-08-12T10:00:00', payload: { clienteId: 'ana', totalCobradoCentavos: 15000 } },
      { event_id: 'sale-2', event_type: 'VentaCancelada', created_at_local: '2026-08-13T10:00:00', payload: { clienteId: 'ana', totalCobradoCentavos: 8000 } },
    ],
    from: '2026-08-01', to: '2026-08-31', requirePeriod: true,
  });
  assert.equal(result.periodSales, 1);
  assert.equal(result.periodTotalCents, 15000);
});

test('sin periodo conserva el directorio completo y filtra por deuda de forma independiente', () => {
  const clients = [
    { id: 'ana', nombre: 'Ana', saldoCentavos: 0 },
    { id: 'beto', nombre: 'Beto', saldoCentavos: 5000 },
  ];
  assert.deepEqual(filter.analyze({ clients, balance: 'no-debt' }).rows.map(client => client.id), ['ana']);
  assert.deepEqual(filter.analyze({ clients, balance: 'debt' }).rows.map(client => client.id), ['beto']);
  assert.equal(filter.analyze({ clients }).rows.length, 2);
});
