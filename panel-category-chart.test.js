const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/panel.js', 'utf8');
const start = source.indexOf('  function agruparCategoriasGrafica(');
const end = source.indexOf('  function renderFinCategoryChart(', start);
const group = vm.runInNewContext(source.slice(start, end) + '\nagruparCategoriasGrafica', { numero: Number });

test('grafica conserva todas las categorias en cinco segmentos sin mutar filas', () => {
  const rows = Array.from({length: 10}, (_, i) => ({categoria_id: 'c' + i, nombre: 'Categoria ' + i, total_centavos: (i + 1) * 100}));
  const snapshot = JSON.stringify(rows);
  const result = group(rows);
  assert.equal(result.length, 5);
  assert.equal(result[0].categoria_id, 'c9');
  assert.equal(result[4].nombre, 'Otros');
  assert.equal(result[4].agrupada, true);
  assert.equal(result.reduce((sum, r) => sum + r.total_centavos, 0), 5500);
  assert.equal(JSON.stringify(rows), snapshot);
});

test('cinco categorias conservan sus filtros individuales', () => {
  const rows = Array.from({length: 5}, (_, i) => ({categoria_id: 'c' + i, total_centavos: 100}));
  assert.equal(group(rows).filter(r => r.agrupada).length, 0);
  assert.equal(group([]).length, 0);
});
