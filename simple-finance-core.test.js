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

test('breakdown reparte un mes por categoria, solo una moneda y sin contar traslados', () => {
  const rows = [
    {id:'a', fecha:'2026-11-03', tipo:'gasto', monto_centavos:30000, estado:'registrado', categoria_id:'c1', cuenta_id:'cash'},
    {id:'b', fecha:'2026-11-04', tipo:'gasto', monto_centavos:10000, estado:'registrado', categoria_id:'c2', cuenta_id:'cash'},
    {id:'c', fecha:'2026-11-05', tipo:'gasto', monto_centavos:10000, estado:'registrado', categoria_id:'c1', cuenta_id:'cash'},
    {id:'d', fecha:'2026-11-06', tipo:'gasto', monto_centavos:9999, estado:'registrado', categoria_id:'c1', cuenta_id:'dollars'},
    {id:'e', fecha:'2026-11-06', tipo:'transferencia', monto_centavos:50000, estado:'registrado', cuenta_id:'cash'},
    {id:'f', fecha:'2026-10-06', tipo:'gasto', monto_centavos:70000, estado:'registrado', categoria_id:'c1', cuenta_id:'cash'},
    {id:'g', fecha:'2026-11-07', tipo:'ingreso', monto_centavos:100000, estado:'registrado', categoria_id:'c3', cuenta_id:'cash'},
  ];
  const monedas = {cash:'DOP', dollars:'USD'}, nombres = {c1:'Materiales', c2:'Local', c3:'Ventas'};
  const g = simple.breakdown(rows, '2026-11', 'gasto', 'DOP', nombres, monedas);
  assert.equal(g.total, 50000);
  assert.deepEqual(g.items.map(i => [i.nombre, i.centavos, i.porcentaje]), [['Materiales', 40000, 80], ['Local', 10000, 20]]);
  assert.equal(simple.breakdown(rows, '2026-11', 'gasto', 'USD', nombres, monedas).total, 9999);
  assert.deepEqual(simple.breakdown(rows, '2026-11', 'ingreso', 'DOP', nombres, monedas).items.map(i => i.nombre), ['Ventas']);
  assert.deepEqual(simple.breakdown(rows, 'mal', 'gasto'), {total:0, items:[]});
  assert.deepEqual(simple.breakdown(rows, '2026-11', 'transferencia'), {total:0, items:[]});
});
