import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

test('v35.31 adapta financeLedgerPayload para ajustes contables compatibles con POS desktop C#', () => {
  const adapterSrc = fs.readFileSync(path.join(rootDir, 'firebase-adapter.js'), 'utf8');
  assert.match(adapterSrc, /const isAdjustment = type === 'ajuste_positivo' \|\| type === 'ajuste_negativo';/);
  assert.match(adapterSrc, /tipo: isAdjustment \? 'AJUSTE' : type\.toUpperCase\(\),/);
  assert.match(adapterSrc, /\.\.\.\(isAdjustment \? \{tipoCrm: type\.toUpperCase\(\)\} : \{\}\),/);
  assert.match(adapterSrc, /cuentaOrigenId: \['gasto', 'retiro', 'salida', 'comision', 'ajuste_negativo', 'transferencia'\]\.includes\(type\) \? accountId : null,/);
  assert.match(adapterSrc, /: \['ingreso', 'deposito', 'entrada', 'ajuste_positivo'\]\.includes\(type\) \? accountId : null,/);
});

test('v35.31 expone fixtures demo separados por sucursal para Base de datos, Caja y CRM', () => {
  const emojiSrc = read('v35-26-category-emojis.js');
  let activeMeta = 'central';
  const sandbox = {
    location: { pathname: '/finanzas/index.html', search: '?mode=demo' },
    document: { querySelector: (sel) => (sel.includes('dcarela-branch-app') ? { content: activeMeta } : null) },
    Date,
    Math,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
    JSON
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(emojiSrc, sandbox);

  const centralDemo = sandbox.DcarelaCategoryLinker.buildDemoInboxData();
  activeMeta = 'plaza';
  const plazaDemo = sandbox.DcarelaCategoryLinker.buildDemoInboxData();

  assert.equal(centralDemo.ecosystem.businessId, 'dcarela');
  assert.equal(centralDemo.ecosystem.database.connected, true);
  assert.equal(centralDemo.ecosystem.caja.devices[0].id, 'pos-dcarela-1');
  assert.match(centralDemo.ecosystem.crm.recentQuotes[0].folio, /COT-104/);

  assert.equal(plazaDemo.ecosystem.businessId, 'plaza-artesanal');
  assert.equal(plazaDemo.ecosystem.caja.devices[0].id, 'pos-plaza-artesanal-1');
  assert.match(plazaDemo.ecosystem.crm.recentQuotes[0].folio, /COT-P19/);
  assert.notEqual(
    JSON.stringify(centralDemo.ecosystem.crm.recentClients),
    JSON.stringify(plazaDemo.ecosystem.crm.recentClients)
  );
});

test('v35.31 integra Caja y CRM en vivo sin romper la barra de 4 tabs ni el aislamiento de sucursales', () => {
  const appJs = read('app.js');
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const motionCss = read('v35-26-motion.css');

  assert.doesNotMatch(appJs, /Caja pendiente de confirmar/);
  assert.match(appJs, /function liveRibbonText\(\)/);
  assert.match(appJs, /\['caja_crm','users','Caja y CRM en vivo','Base de datos, turnos POS, chats y clientes'\]/);
  assert.match(appJs, /function renderCajaCrm\(\)/);
  assert.match(appJs, /id="v3526ConnectionHost"/);
  assert.match(appJs, /\[\['home','house','Resumen'\],\['finance','bars','Finanzas'\],\['debts','clock','Compromisos'\],\['more','tools','Herramientas'\]\]/);

  assert.match(inboxJs, /action:\s*'pwaEcosystemStatus'/);
  assert.match(inboxJs, /action:\s*'cotizacionEstado'/);
  assert.match(inboxJs, /action:\s*'tareaCrear'/);
  assert.match(inboxJs, /action:\s*'tareaEstado'/);
  assert.match(inboxJs, /action:\s*'posClienteDetalle'/);
  assert.match(inboxJs, /getEcosystemSummary/);

  assert.match(motionCss, /\.v3526-seg-tabs\s*\{/);
  assert.match(motionCss, /\.v3526-kpi-row\s*\{/);
  assert.match(motionCss, /\.v3526-kpi\s*\{/);
  assert.match(motionCss, /\.v3526-tag\.danger\s*\{/);
});
