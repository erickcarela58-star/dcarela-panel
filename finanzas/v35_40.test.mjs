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

  for (const keyframe of ['dcCardSpring', 'dcTextBounce', 'dcKickerRebound', 'dcSublineBounce', 'dcPillElastic', 'dcActiveDayBounce', 'dcRowCascade', 'dcIconPop', 'dcAmountSpring', 'dcCountLand', 'dcMiniBarGrow', 'dcRefreshSpin']) {
    assert.match(motionCss, new RegExp(`@keyframes\\s+${keyframe}\\b`), `Missing keyframe ${keyframe}`);
  }
  assert.match(motionCss, /--dc-stagger-step:\s*\d+ms/);
  assert.match(motionCss, /\.shell \.dc-anim-row \.row-copy small[\s\S]*dcSublineBounce/);
  assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.shell \.dc-anim-row[\s\S]*animation:\s*none\s*!important/);
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

test('v35.40 wires Refresh button next to Sun/Moon to SW/cache update & reload flow', () => {
  const appJs = read('app.js');
  const swJs = read('sw.js');

  assert.match(appJs, /const APP_VERSION='35\.45'/);
  assert.match(appJs, /navigator\.serviceWorker\.register\('\.\/sw\.js',\{updateViaCache:'none'\}\)/);
  assert.match(appJs, /async function checkAndApplyAppUpdate\(\)/);
  assert.match(appJs, /if\(action==='refresh'\)\{await checkAndApplyAppUpdate\(\);return\}/);
  assert.match(appJs, /fetch\(`\.\/sw\.js\?chk=\$\{Date\.now\(\)\}`,\{cache:'no-store'\}\)/);
  assert.match(appJs, /waitingWorker\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
  assert.match(appJs, /location\.reload\(\)/);

  assert.match(swJs, /const CACHE = 'dcarela-finanzas-v35-45'/);
  assert.match(swJs, /event\.data\?\.type === 'SKIP_WAITING'/);
  assert.match(swJs, /url\.pathname\.endsWith\('\/sw\.js'\)/);
});
