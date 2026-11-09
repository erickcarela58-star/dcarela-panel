const test = require('node:test');
const assert = require('node:assert/strict');
const simple = require('./simple-finance-core.js');

test('la vista simple agrupa por fecha comercial y excluye traslados del resultado', () => {
  const rows = [
    {id:'a', fecha:'2026-11-03', tipo:'ingreso', monto_centavos:300000, estado:'registrado'},
    {id:'b', fecha:'2026-11-03', tipo:'gasto', monto_centavos:45000, estado:'registrado'},
    {id:'c', fecha:'2026-11-03', tipo:'transferencia', monto_centavos:200000, estado:'registrado'},
    {id:'d', fecha:'2026-10-31', tipo:'ingreso', monto_centavos:1000, estado:'registrado'},
  ];
  const groups = simple.group(rows, '2026-11');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].income, 300000);
  assert.equal(groups[0].expenses, 45000);
  assert.equal(groups[0].result, 255000);
  assert.equal(groups[0].transfers, 1);
  assert.equal(simple.group(rows, '2026-11', 'week')[0].key, '2026-11-02');
});

test('separa dólares de pesos sin inventar conversión', () => {
  const rows = [
    {id:'dop', fecha:'2026-11-03', tipo:'ingreso', monto_centavos:10000, estado:'registrado', cuenta_id:'cash'},
    {id:'usd', fecha:'2026-11-03', tipo:'ingreso', monto_centavos:5000, estado:'registrado', cuenta_id:'dollars'},
  ];
  const [day] = simple.group(rows, '2026-11', 'day', {cash:'DOP', dollars:'USD'});
  assert.equal(day.income, 10000);
  assert.equal(day.currencies.USD.income, 5000);
});
