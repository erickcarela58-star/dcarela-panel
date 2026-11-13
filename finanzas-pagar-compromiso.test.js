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

test('la versión 35.32 renueva caché y conserva el vidrio translúcido para iPhone 15', () => {
  const html = fs.readFileSync(path.join(__dirname, 'finanzas', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, 'finanzas', 'sw.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'finanzas', 'monochrome-glass-v35.css'), 'utf8');
  assert.match(html, /app\.js\?v=35.32/); assert.match(html, /firebase-adapter\.js\?v=35.32/);
  assert.match(html, /monochrome-glass-v35\.css\?v=35.32/);
  assert.match(sw, /dcarela-finanzas-v35-32/); assert.match(sw, /'\.\/app\.js\?v=35.32'/);
  assert.match(css, /backdrop-filter:blur\(32px\)/); assert.match(css, /\.keypad button/);
  assert.match(app, /cashAccountOptions\(state\.entryAccount,'',type==='gasto'\)/);
});

test('Libros fiscales: pantalla en Más, interruptor y «Anotar ahora» con la acción fin.books.request', () => {
  const ds = fs.readFileSync(path.join(__dirname, 'finanzas', 'data-source.js'), 'utf8');
  assert.match(app, /\['books','book','Libros fiscales/); assert.match(app, /if\(state\.route==='books'\)return renderBooks\(\)/);
  assert.match(app, /await commit\('fin\.books\.request',state\.business,\{requestId:state\.pendingRequestId,\.\.\.\(action==='books-toggle'\?\{auto:!cfg\.auto\}:\{\}\)\}\)/);
  assert.match(ds, /'fin\.books\.request','cost\.recurring\.upsert','cost\.obligation\.upsert'\]\.includes\(action\)/);
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

test('35.24 segunda ola: íconos en barras y estadísticas, chips de búsqueda, gráfica de cuenta, tarjetas/presupuestos y nuevo compromiso para Caja', () => {
  const ds = fs.readFileSync(path.join(__dirname, 'finanzas', 'data-source.js'), 'utf8');
  assert.match(app, /const catBadge=/);
  assert.match(app, /categoryChart[\s\S]*catBadge\(item,'gasto'\)/);
  assert.match(app, /statList[\s\S]*catBadge\(x,state\.statsType\)/);
  assert.match(app, /function searchChips\(\)/);
  assert.match(app, /data-do="search-chip"/);
  assert.match(app, /function accountMiniChart\(/);
  assert.match(app, /modalAccount[\s\S]*accountMiniChart\(a\)/);
  assert.match(app, /function modalCommitment\(\)/);
  assert.match(app, /data-do="debt-new"/);
  assert.match(app, /function renderBudgets\(\)[\s\S]*budget-search/);
  assert.match(app, /function renderCards\(\)[\s\S]*card-pay/);
  assert.match(app, /cost\.recurring\.upsert/);
  assert.match(app, /cost\.obligation\.upsert/);
  assert.match(adapter, /'CostoRecurrenteGuardado'/);
  assert.match(adapter, /'CostoObligacionGuardada'/);
  assert.match(ds, /cost\.recurring\.upsert/);
  assert.match(ds, /cost\.obligation\.upsert/);
});
