'use strict';
// 13/11/2026 · dueño: «se deben arreglar los compromisos y pagos recurrentes para usar mas seguido en pwa».
// La ficha del compromiso tiene «Pagar este compromiso»: abre el gasto con el saldo y el concepto, y el movimiento viaja con
// el id del compromiso (obligacionId / compromisoId / recurrenteId) para que el servidor lo enlace y baje el saldo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, 'finanzas', 'app.js'), 'utf8');
const adapter = fs.readFileSync(path.join(__dirname, 'firebase-adapter.js'), 'utf8');

test('la ficha del compromiso ofrece pagarlo y el formulario lo dice', () => {
  assert.match(app, /data-do="debt-pay" data-id="\$\{esc\(item\.id\)\}"/);
  assert.match(app, /if\(action==='debt-pay'\)/);
  assert.match(app, /'Pagar compromiso':'Registrar movimiento'/);
  // El registro normal no hereda un enlace viejo.
  assert.match(app, /if\(action==='entry'\|\|action==='quick'\)\{const type=action==='quick'\?btn\.dataset\.type:'gasto';state\.entryType=type;state\.entryDigits='';state\.entryNote='';state\.entryLink=null;/);
});

test('el gasto viaja con el enlace al compromiso y el adaptador lo guarda y lo publica', () => {
  assert.match(app, /state\.entryType==='gasto'&&state\.entryLink\?\{obligacionId:/);
  assert.match(adapter, /type === 'gasto' && text\(data\.obligacionId, 160\) \? \{ obligacion_id:/);
  assert.match(adapter, /type === 'gasto' && text\(data\.compromisoId, 160\) \? \{ compromiso_id:/);
  assert.match(adapter, /obligacionId: movement\.obligacion_id \|\| null,/);
});

test('la versión 35.23 se sirve sin caché vieja', () => {
  const html = fs.readFileSync(path.join(__dirname, 'finanzas', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, 'finanzas', 'sw.js'), 'utf8');
  assert.match(html, /app\.js\?v=35.23/); assert.match(html, /firebase-adapter\.js\?v=35.23/);
  assert.match(sw, /dcarela-finanzas-ui-v35-monochrome-23/); assert.match(sw, /'\.\/app\.js\?v=35.23'/);
});

test('Libros fiscales: pantalla en Más, interruptor y «Anotar ahora» con la acción fin.books.request', () => {
  const ds = fs.readFileSync(path.join(__dirname, 'finanzas', 'data-source.js'), 'utf8');
  assert.match(app, /\['books','book','Libros fiscales'/); assert.match(app, /if\(state\.route==='books'\)return renderBooks\(\)/);
  assert.match(app, /await commit\('fin\.books\.request',state\.business,\{requestId:state\.pendingRequestId,\.\.\.\(action==='books-toggle'\?\{auto:!cfg\.auto\}:\{\}\)\}\)/);
  assert.match(ds, /'fin\.account\.reconcile','fin\.books\.request'\]\.includes\(action\)/);
  assert.match(adapter, /if \(action === 'fin\.books\.request'\) \{/);
  assert.match(fs.readFileSync(path.join(__dirname, 'finanzas', 'index.html'), 'utf8'), /<symbol id="ic-book"/);
});

test('35.23 reanimada: accesos rápidos, próximos pagos, íconos por categoría, repetir y cuenta recordada', () => {
  assert.match(app, /function quickActions\(\)/); assert.match(app, /function upcomingPayments\(\)/);
  assert.match(app, /\$\{summaryCard\(\)\}\$\{quickActions\(\)\}/); assert.match(app, /\$\{upcomingPayments\(\)\}\$\{flowChart/);
  assert.match(app, /<span class="cat-bubble \$\{esc\(m\.tipo\)\}" aria-hidden="true">\$\{ico\(catIcon\(m\),'sm'\)\}<\/span>/);
  assert.match(app, /if\(action==='movement-repeat'\)/); assert.match(app, /rememberAccount\(state\.entryType,a\.id\)/);
  const html = fs.readFileSync(path.join(__dirname, 'finanzas', 'index.html'), 'utf8');
  for (const id of ['camera', 'printer', 'box', 'users', 'megaphone', 'home', 'bolt', 'tag', 'cart', 'food', 'car', 'receipt', 'gift', 'repeat', 'income', 'expense'])
    assert.match(html, new RegExp(`<symbol id="ic-${id}"`), id);
  // Cada ícono que pide catIcon existe en el sprite.
  const bloque = app.slice(app.indexOf('const CAT_ICONS='), app.indexOf('const sinAcento='));
  for (const [, id] of [...bloque.matchAll(/,'([a-z-]+)'\]/g)]) assert.match(html, new RegExp(`<symbol id="ic-${id}"`), 'falta ic-' + id);
});
