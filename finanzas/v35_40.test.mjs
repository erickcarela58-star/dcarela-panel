import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

test('v35.40 removes whole-page left-sweep on day change and enables per-element stagger + text rebound CSS', () => {
  const appJs = read('app.js');
  const glassCss = read('monochrome-glass-v35.css');
  const motionCss = read('v35-26-motion.css');

  assert.doesNotMatch(appJs, /slide-\$\{direction>0\?'forward':'back'\}/);
  assert.doesNotMatch(appJs, /pageSlideExit/);
  assert.match(appJs, /function choreographElements\(/);
  assert.match(appJs, /const subKey=state\.financeView==='diario'\?`d:\$\{state\.day\}`:state\.financeView==='calendario'\?`c:\$\{state\.day\}`:/);
  assert.match(appJs, /class="shell \$\{viewIsNew\?'view-enter':''\} \$\{dayChangedOnly\?'dc-day-shift':''\}"/);

  assert.doesNotMatch(glassCss, /animation:\s*pageSlideForward/);
  assert.doesNotMatch(glassCss, /\.slide-forward\.view-enter \.page>\*/);

  const appleCss = read('apple-motion.css');
  const appleMjs = read('apple-motion.mjs');

  assert.match(appJs, /\.\/apple-motion\.mjs\?v=35\.64/);
  assert.match(appJs, /function wrapMotionWords\(/);
  assert.match(appJs, /function applyApplePress\(/);
  assert.match(appJs, /function stopScopeAnimations\(/);

  for (const token of ['--motion-smooth', '--motion-ease', '--motion-fast', '\\[data-motion-unit\\]', '\\.apple-press', '\\.toast-host']) {
    assert.match(appleCss, new RegExp(token), `apple-motion.css missing ${token}`);
  }
  for (const preset of ['smooth:', 'snappy:', 'bouncy:', 'glass:', 'press:']) {
    assert.match(appleMjs, new RegExp(preset), `apple-motion.mjs missing preset ${preset}`);
  }
  for (const fn of ['springProgress', 'presets', 'stop', 'motion', 'reveal', 'pop', 'glassExpand', 'revealText', 'enterScreen', 'openDialog', 'closeDialog', 'count']) {
    assert.match(appleMjs, new RegExp(`\\b${fn}\\b`), `apple-motion.mjs missing ${fn}`);
  }
  for (const legacyKeyframe of ['dcCardSpring', 'dcTextBounce', 'dcKickerRebound', 'dcSublineBounce', 'dcPillElastic', 'dcRowCascade', 'dcAmountSpring', 'dcCountLand']) {
    assert.doesNotMatch(motionCss, new RegExp(`@keyframes\\s+${legacyKeyframe}\\b`), `Legacy keyframe ${legacyKeyframe} must be replaced by Apple Motion physics`);
  }
  assert.doesNotMatch(motionCss, /cubic-bezier\([^)]*1\.(2[0-9]|3[0-9]|5[0-9])/);
  assert.doesNotMatch(glassCss, /cubic-bezier\([^)]*1\.56/);
  assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none\s*!important/);
  assert.match(motionCss, /--motion-smooth/);
});

test('v35.40 count-up animator starts money values at 0 and lands on exact formatted final string', () => {
  const appJs = read('app.js');
  assert.match(appJs, /function animMoney\(/);
  assert.match(appJs, /function animInt\(/);
  assert.match(appJs, /function animateCountUps\(/);

  // Extract pure moneyText, animMoney, animInt, animateCountUps into an isolated VM sandbox to exercise runtime behavior
  const fnSlice = (name) => {
    const idx = appJs.indexOf(`function ${name}(`);
    assert.notEqual(idx, -1, `Function ${name} not found`);
    const bodyStart = appJs.indexOf('){', idx);
    assert.notEqual(bodyStart, -1, `Function body for ${name} not found`);
    let depth = 0, end = -1;
    for (let i = bodyStart + 1; i < appJs.length; i++) {
      if (appJs[i] === '{') depth++;
      else if (appJs[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    return appJs.slice(idx, end);
  };

  let nowMs = 0;
  let queuedFrame = null;
  let elState = null;
  const fakeEl = {
    dataset: {
      countTarget: '184525',
      countKind: 'money',
      countCurr: 'DOP',
      countCompact: '0',
      countPrefix: '+ ',
      countFinal: '+ RD$1,845.25'
    },
    textContent: '+ RD$0.00',
    isConnected: true,
    classes: new Set(),
    classList: { add: (c) => fakeEl.classes.add(c) },
    removeAttribute(attr) { if (attr === 'data-count-target') delete this.dataset.countTarget; }
  };
  elState = fakeEl;

  const sandbox = {
    Number, String, Math, Boolean, Date,
    countRafId: 0,
    reducedMotion: () => false,
    esc: (x) => String(x ?? ''),
    performance: { now: () => nowMs },
    requestAnimationFrame: (cb) => { queuedFrame = cb; return 1; },
    cancelAnimationFrame: () => { queuedFrame = null; },
    document: { querySelectorAll: () => [elState] }
  };
  vm.createContext(sandbox);
  vm.runInContext([fnSlice('moneyText'), fnSlice('animMoney'), fnSlice('animInt'), fnSlice('animateCountUps')].join('\n'), sandbox);

  const html = sandbox.animMoney(184525, 'DOP', { prefix: '+ ' });
  assert.match(html, />\+ RD\$0\.00<\/span>/);
  assert.match(html, /data-count-target="184525"/);
  assert.match(html, /data-count-final="\+ RD\$1,845\.25"/);

  const negHtml = sandbox.animMoney(-5000, 'USD');
  assert.match(negHtml, />US\$0\.00<\/span>/);
  assert.match(negHtml, /data-count-final="−US\$50\.00"/);

  const pctHtml = sandbox.animInt(42, '%');
  assert.match(pctHtml, />0%<\/span>/);
  assert.match(pctHtml, /data-count-final="42%"/);

  sandbox.animateCountUps(sandbox.document);
  assert.equal(fakeEl.textContent, '+ RD$0.00');
  assert.equal(typeof queuedFrame, 'function');

  // Midpoint frame: strictly between 0 and final target
  nowMs = 240;
  queuedFrame(nowMs);
  assert.notEqual(fakeEl.textContent, '+ RD$0.00');
  assert.notEqual(fakeEl.textContent, '+ RD$1,845.25');

  // Final frame after full duration: lands cleanly on exact final text
  nowMs = 1500;
  queuedFrame(nowMs);
  assert.equal(fakeEl.textContent, '+ RD$1,845.25');
  assert.equal(fakeEl.classes.has('is-counted'), true);
});

test('v35.54 animateCountUps on child host does not cancel ancestor main count-ups (Compromisos Fotoquimsa RD$0.00 fix)', () => {
  const appJs = read('app.js');
  const fnSlice = (name) => {
    const idx = appJs.indexOf(`function ${name}(`);
    const bodyStart = appJs.indexOf('){', idx);
    let depth = 0, end = -1;
    for (let i = bodyStart + 1; i < appJs.length; i++) {
      if (appJs[i] === '{') depth++;
      else if (appJs[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    return appJs.slice(idx, end);
  };
  let nowMs = 0;
  let nextId = 1;
  const frames = new Map();
  const makeCountEl = (target, finalStr) => {
    const el = {
      dataset: { countTarget: String(target), countKind: 'money', countCurr: 'DOP', countCompact: '0', countPrefix: '', countFinal: finalStr },
      textContent: 'RD$0.00',
      isConnected: true,
      classes: new Set(),
      closest: () => null,
      classList: { add: (c) => el.classes.add(c) },
      removeAttribute(attr) { if (attr === 'data-count-target') delete this.dataset.countTarget; },
    };
    return el;
  };
  const fotoEl = makeCountEl(1960000, 'RD$19,600.00');
  const subEl = makeCountEl(146731, 'RD$1,467.31');
  const childHost = {
    isConnected: true,
    contains: (node) => node === childHost || node === subEl,
    querySelectorAll: () => [subEl],
  };
  const mainEl = {
    isConnected: true,
    contains: (node) => node === mainEl || node === fotoEl || node === childHost || node === subEl,
    querySelectorAll: () => [fotoEl],
  };
  const docEl = {
    isConnected: true,
    contains: (node) => node === docEl || mainEl.contains(node),
    querySelectorAll: () => [fotoEl, subEl],
  };
  const sandbox = {
    Number, String, Math, Boolean, Date, Set, WeakMap,
    countRafId: 0,
    reducedMotion: () => false,
    esc: (x) => String(x ?? ''),
    performance: { now: () => nowMs },
    requestAnimationFrame: (cb) => { const id = nextId++; frames.set(id, cb); return id; },
    cancelAnimationFrame: (id) => { frames.delete(id); },
    document: docEl,
  };
  vm.createContext(sandbox);
  vm.runInContext([fnSlice('moneyText'), fnSlice('animMoney'), fnSlice('animateCountUps')].join('\n'), sandbox);

  sandbox.animateCountUps(mainEl);
  sandbox.animateCountUps(childHost);
  nowMs = 1200;
  for (const [, cb] of [...frames.entries()]) cb(nowMs);
  assert.equal(fotoEl.textContent, 'RD$19,600.00');
  assert.equal(subEl.textContent, 'RD$1,467.31');

  // Also verify full-document runner (first mount) is NOT cancelled when child host refreshes
  const fotoEl2 = makeCountEl(1960000, 'RD$19,600.00');
  const subEl2 = makeCountEl(146731, 'RD$1,467.31');
  mainEl.contains = (node) => node === mainEl || node === fotoEl2 || node === childHost || node === subEl2;
  mainEl.querySelectorAll = () => [fotoEl2];
  childHost.contains = (node) => node === childHost || node === subEl2;
  childHost.querySelectorAll = () => [subEl2];
  docEl.querySelectorAll = () => [fotoEl2, subEl2];
  frames.clear();
  nowMs = 2000;
  sandbox.animateCountUps(docEl);
  sandbox.animateCountUps(childHost);
  nowMs = 3400;
  for (const [, cb] of [...frames.entries()]) cb(nowMs);
  assert.equal(fotoEl2.textContent, 'RD$19,600.00');
  assert.equal(subEl2.textContent, 'RD$1,467.31');
});

test('v35.40 wires Refresh button next to Sun/Moon to SW/cache update & reload flow', () => {
  const appJs = read('app.js');
  const swJs = read('sw.js');

  assert.match(appJs, /const APP_VERSION='35\.64'/);
  assert.match(appJs, /navigator\.serviceWorker\.register\('\.\/sw\.js',\{updateViaCache:'none'\}\)/);
  assert.match(appJs, /async function checkAndApplyAppUpdate\(\)/);
  assert.match(appJs, /if\(action==='refresh'\)\{await checkAndApplyAppUpdate\(\);return\}/);
  assert.match(appJs, /fetch\(`\.\/sw\.js\?chk=\$\{Date\.now\(\)\}`,\{cache:'no-store'\}\)/);
  assert.match(appJs, /waitingWorker\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
  assert.match(appJs, /location\.reload\(\)/);

  assert.match(swJs, /const CACHE = 'dcarela-finanzas-v35-64'/);
  assert.match(swJs, /event\.data\?\.type === 'SKIP_WAITING'/);
  assert.match(swJs, /url\.pathname\.endsWith\('\/sw\.js'\)/);
});
