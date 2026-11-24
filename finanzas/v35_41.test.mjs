import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

function extractFunction(src, name) {
  const sig = `function ${name}(`;
  const idx = src.indexOf(sig);
  assert.notEqual(idx, -1, `Function ${name} not found`);
  let pDepth = 0;
  let paramEnd = -1;
  for (let i = src.indexOf('(', idx); i < src.length; i++) {
    if (src[i] === '(') pDepth++;
    else if (src[i] === ')') {
      pDepth--;
      if (pDepth === 0) { paramEnd = i; break; }
    }
  }
  assert.notEqual(paramEnd, -1, `Parameter list end for ${name} not found`);
  const braceStart = src.indexOf('{', paramEnd);
  assert.notEqual(braceStart, -1, `Function body for ${name} not found`);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.notEqual(end, -1, `Closing brace for ${name} not found`);
  return src.slice(idx, end);
}

test('v35.41 fixed-center loupe metrics enlarge only inside the white center box and interpolate smoothly', () => {
  const appJs = read('app.js');
  const fnCode = extractFunction(appJs, 'computeLoupeSlotMetrics');
  const sandbox = { result: null };
  vm.createContext(sandbox);
  vm.runInContext(`${fnCode}\nresult = { m0: computeLoupeSlotMetrics(0), mMid: computeLoupeSlotMetrics(0.45), m1: computeLoupeSlotMetrics(1), m2: computeLoupeSlotMetrics(2), mNeg: computeLoupeSlotMetrics(-0.1) };`, sandbox);

  const { m0, mMid, m1, m2, mNeg } = sandbox.result;
  assert.equal(m0.inLens, true);
  assert.equal(m0.lensRatio, 1);
  assert.equal(mNeg.inLens, true);
  assert.equal(m1.inLens, false);
  assert.equal(m1.lensRatio, 0);
  assert.equal(m2.inLens, false);

  assert.ok(m0.scale > mMid.scale && mMid.scale > m1.scale && m1.scale > m2.scale, 'slot scale should peak at center lens and taper smoothly');
  assert.ok(m0.numScale > mMid.numScale && mMid.numScale > m1.numScale, 'date number should grow larger inside the center white box');
  assert.ok(mMid.lensRatio > 0 && mMid.lensRatio < 1, 'midpoint slot crossing into lens edge should blend text color smoothly');
});

test('v35.41 day loupe shell stays stationary centered, renders 31 sliding slots, and isolates gestures from page swipe', () => {
  const appJs = read('app.js');
  const glassCss = read('monochrome-glass-v35.css');

  assert.match(appJs, /const DAY_LOUPE_RADIUS=15,DAY_SLOT_WIDTH=52;/);
  assert.match(appJs, /class="daily-loupe-shell"[^>]*data-swipe="day-loupe"/);
  assert.match(appJs, /<div class="daily-loupe-lens" aria-hidden="true"><\/div><div class="daily-loupe-track"/);
  assert.match(appJs, /function initDayLoupes\(/);
  assert.match(appJs, /function glideLoupeTo\(/);
  assert.match(appJs, /target\.closest\([^)]*\.daily-loupe-shell[^)]*\)\)return;/);

  assert.match(glassCss, /\.daily-loupe-shell\{/);
  assert.match(glassCss, /\.daily-loupe-lens\{[^}]*left:50%;[^}]*transform:translate\(-50%,-50%\);[^}]*pointer-events:none;/);
  assert.match(glassCss, /\.daily-loupe-track\{[^}]*left:50%;/);
  assert.match(glassCss, /\.daily-day strong\{[^}]*var\(--loupe-num,1\)/);
  assert.match(glassCss, /\.daily-day\.in-lens\{/);
});

test('v35.46 switches days in-place with Apple WAAPI ticks without re-animating static page chrome or using cartoonish overshoots', () => {
  const appJs = read('app.js');
  const motionCss = read('v35-26-motion.css');

  assert.match(appJs, /function commitDaySelectionInPlace\(/);
  assert.match(appJs, /commitDaySelectionInPlace\(targetDay,\{recenterLoupe:true\}\)/);
  assert.match(appJs, /function replayTick\(el\)/);
  assert.match(appJs, /replayTick\(dayHead\)/);
  assert.match(appJs, /choreographElements\(newMain,\{dayOnly:dayChangedOnly\}\)/);

  assert.match(motionCss, /\.shell\.dc-day-shift \.topbar,[\s\S]*\.shell\.dc-day-shift \.finance-filter,[\s\S]*animation:\s*none\s*!important;/);
  assert.doesNotMatch(motionCss, /@keyframes dcDateTick\b/);
  assert.match(motionCss, /\.v3526-cut-action-card\s*\{/);
  assert.match(motionCss, /\.v3526-cut-sum-banner\s*\{/);
  assert.doesNotMatch(motionCss, /scale\(1\.(35|46|58)\)/);
  assert.doesNotMatch(motionCss, /letter-spacing:\s*\.0[23]em/);
});

test('v35.41 surfaces visible cut confirmation card, batch/direct confirm buttons, and demo balance summing', () => {
  const appJs = read('app.js');
  const inboxJs = read('v35-26-inbox-fiscal.js');

  assert.match(inboxJs, /id = 'v3526CutActionCard'/);
  assert.match(inboxJs, /document\.getElementById\('v3526DayCutSlot'\)/);
  assert.match(inboxJs, /v3526-cut-sum-banner/);
  assert.match(inboxJs, /data-confirm-all-cuts="1"/);
  assert.match(inboxJs, /data-quick-confirm-cut=/);
  assert.match(inboxJs, /Se suma a Efectivo/);
  assert.match(inboxJs, /applyDemoCut\?\.\(/);
  assert.match(inboxJs, /window\.DcarelaFinanzasReload\?\.\(\)/);

  // Exercise real applyDemoCut() logic in VM sandbox
  const demoCutFn = extractFunction(appJs, 'applyDemoCut');
  const cashAcct = { id: 'sucursal-a-cash', tipo: 'efectivo', moneda: 'DOP', incluir_en_total: true, saldo_actual_centavos: 1000000 };
  const pettyAcct = { id: 'sucursal-a-petty', tipo: 'efectivo', moneda: 'DOP', incluir_en_total: false, saldo_actual_centavos: 500000 };
  let renderCalls = 0;
  const sandbox = {
    isLive: false,
    today: '2026-11-15',
    state: { business: 'dcarela', data: { movements: [] } },
    accounts: () => [cashAcct, pettyAcct],
    accountBalance: (a) => a.saldo_actual_centavos,
    render: () => { renderCalls++; }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${demoCutFn}`, sandbox);

  // Confirming cash_cut transfers transferCentavos from petty to Efectivo and logs a single movement
  const resCash = sandbox.applyDemoCut({ id: 'cut-1', kind: 'cash_cut', title: 'Cierre Caja', date: '2026-11-15', transferCentavos: 250000 });
  assert.equal(resCash.ok, true);
  assert.equal(cashAcct.saldo_actual_centavos, 1250000);
  assert.equal(pettyAcct.saldo_actual_centavos, 250000);
  assert.equal(sandbox.state.data.movements.length, 1);
  assert.equal(sandbox.state.data.movements[0].origen, 'cash_cut');

  // Re-applying same cut id must not duplicate movement, and pos_cut must not double-sum Efectivo
  const resPos = sandbox.applyDemoCut({ id: 'pos-1', kind: 'pos_cut', title: 'Cierre Plaza', date: '2026-11-15', transferCentavos: 999999 });
  assert.equal(resPos.ok, true);
  assert.equal(resPos.transferCentavos, 0);
  assert.equal(cashAcct.saldo_actual_centavos, 1250000);
  assert.equal(sandbox.state.data.movements.length, 1);
  assert.equal(renderCalls, 2);
});

test('v35.65 updates service worker and asset query strings consistently across Central and Plaza including Apple Motion assets and Plaza demo cuts', () => {
  const indexHtml = read('index.html');
  const plazaHtml = read('plaza.html');
  const swJs = read('sw.js');
  const appJs = read('app.js');
  const inboxJs = read('v35-26-inbox-fiscal.js');

  assert.match(appJs, /const APP_VERSION='35\.65'/);
  assert.match(appJs, /\.\/apple-motion\.mjs\?v=35\.65/);
  assert.match(appJs, /\.\/data-source\.js\?v=35\.65/);
  assert.match(appJs, /\.\/demo-data\.js\?v=35\.65/);
  assert.match(inboxJs, /\.\/apple-motion\.mjs\?v=35\.65/);
  assert.match(inboxJs, /\.\/cut-review\.js\?v=35\.65/);
  assert.match(inboxJs, /\.\/data-source\.js\?v=35\.65/);
  assert.match(inboxJs, /v35-26-category-emojis\.js\?v=35\.65/);
  assert.match(inboxJs, /uiState\.mode === 'demo' \? normalizeInbox\(linker\(\)\.buildDemoInboxData\(\)\) : normalizeInbox\(/);
  assert.match(swJs, /\/\/ DCARELA_PWA_VERSION: 35\.65/);
  assert.match(swJs, /const CACHE = 'dcarela-finanzas-v35-65'/);
  for (const file of ['app.css', 'apple-motion.css', 'apple-motion.mjs', 'monochrome-glass-v35.css', 'v35-26-motion.css', 'app.js', 'data-source.js', 'demo-data.js', 'v35-26-category-emojis.js', 'v35-26-inbox-fiscal.js', 'cut-review.js']) {
    assert.ok(swJs.includes(`'./${file}?v=35.65'`), `sw.js missing cache bust for ${file}`);
  }
  for (const html of [indexHtml, plazaHtml]) {
    assert.ok(html.includes('v=35.65'), 'HTML missing v=35.65 query params');
    assert.doesNotMatch(html, /\?v=35\.56\b/);
  }
});
