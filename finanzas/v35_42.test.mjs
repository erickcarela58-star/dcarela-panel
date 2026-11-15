import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8');

test('v35.42 service worker avoids mid-session skipWaiting when active worker already exists', async () => {
  const swCode = read('sw.js');
  assert.match(swCode, /const CACHE = 'dcarela-finanzas-v35-44'/);

  function bootSw(hasActiveWorker) {
    const handlers = {};
    let skipWaitingCalls = 0;
    const context = {
      URL,
      Request,
      Response,
      caches: {
        open: async () => ({ add: async () => {}, addAll: async () => {} }),
        keys: async () => [],
        delete: async () => true,
        match: async () => undefined
      },
      fetch: async () => new Response('ok', { status: 200 }),
      self: null
    };
    context.self = {
      location: { origin: 'https://erikccarela.web.app' },
      registration: { active: hasActiveWorker ? { state: 'activated' } : null },
      clients: { claim: async () => {} },
      skipWaiting() { skipWaitingCalls += 1; return Promise.resolve(); },
      addEventListener(type, fn) { handlers[type] = fn; }
    };
    vm.runInNewContext(swCode, context);
    return { handlers, getSkipWaitingCalls: () => skipWaitingCalls };
  }

  // Active session already running: installing new SW must wait until explicit SKIP_WAITING
  const existing = bootSw(true);
  let waitPromise = Promise.resolve();
  existing.handlers.install({ waitUntil(p) { waitPromise = p; } });
  await waitPromise;
  assert.equal(existing.getSkipWaitingCalls(), 0, 'must NOT call skipWaiting automatically during active session');

  existing.handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(existing.getSkipWaitingCalls(), 1, 'SKIP_WAITING message triggers skipWaiting explicitly');

  // Fresh install with no active worker: immediate activation allowed
  const fresh = bootSw(false);
  let freshWait = Promise.resolve();
  fresh.handlers.install({ waitUntil(p) { freshWait = p; } });
  await freshWait;
  assert.equal(fresh.getSkipWaitingCalls(), 1, 'first install with no active SW activates immediately');
});

test('v35.42 HTML pre-paint theme script reads dcarela-mm-theme correctly for Central & Plaza', () => {
  for (const htmlFile of ['index.html', 'plaza.html']) {
    const html = read(htmlFile);
    assert.ok(!html.includes('dcarela-finanzas-theme'), `${htmlFile} should use dcarela-mm-theme`);
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(match, `${htmlFile} missing boot script`);
    const scriptBody = match[1];

    for (const storedTheme of ['dark', 'light']) {
      const rootEl = { dataset: {}, style: {} };
      vm.runInNewContext(scriptBody, {
        localStorage: {
          getItem: (k) => (k === 'dcarela-mm-theme' ? storedTheme : k === 'dcarela-mm-glass-config' ? '{"visualStyle":"glass"}' : null)
        },
        document: { documentElement: rootEl }
      });
      assert.equal(rootEl.dataset.theme, storedTheme, `${htmlFile} failed early theme=${storedTheme}`);
      assert.equal(rootEl.dataset.visualStyle, 'glass');
    }
  }
});

test('v35.44 eliminates unsolicited reloads and scopes button updates cleanly in app.js', () => {
  const appJs = read('app.js');
  assert.match(appJs, /const APP_VERSION='35\.44';/);

  // 1) No automatic visibilitychange background reload
  assert.doesNotMatch(appJs, /addEventListener\('visibilitychange'/);

  // 2) Auth blip protection via waitForAuthState before wiping state.data
  assert.match(appJs, /onAuthStateChanged\(user\s*=>[\s\S]*?waitForAuthState\(1500\)/);

  // 3) Silent load preserves state.data and state.currency instead of wiping to null/'DOP'
  assert.match(appJs, /async function load\(opts=\{\}\)\{[\s\S]*?const silent=opts\.silent!==false&&hadData;[\s\S]*?if\(!hadData\|\|opts\.reset\)state\.currency='DOP';/);
  assert.match(appJs, /window\.DcarelaFinanzasReload=\(\)=>load\(\{silent:Boolean\(state\.data\)\}\);/);

  // 4) ensureFullHistory never renders over an open modal or active input focus
  assert.match(appJs, /function isEditingField\(\)/);
  assert.match(appJs, /!state\.modal&&!isEditingField\(\)/);

  // 5) In-place handlers avoid full render() on filter-toggle, stats-type, setTheme, search-chip, receipt, calendar day
  const setThemeBlock = appJs.slice(appJs.indexOf('function setTheme(theme)'), appJs.indexOf('let loadSerial=0'));
  assert.match(setThemeBlock, /themeOnly:true/);
  assert.doesNotMatch(setThemeBlock, /\brender\(/);
  assert.match(appJs, /if\(action==='filter-toggle'\)\{state\.financeFilterOpen=!state\.financeFilterOpen;updateFilterMenuInPlace\(\);return\}/);
  assert.match(appJs, /if\(action==='stats-type'\)\{state\.statsType=btn\.dataset\.type;updateStatsTypeInPlace\(\);return\}/);
  assert.match(appJs, /if\(action==='check-terminal-receipt'\)[\s\S]*?render\(\{modalOnly:true\}\)/);
  assert.match(appJs, /if\(action==='search-chip'\)[\s\S]*?updateSearchResultsInPlace\(\);return/);
  assert.match(appJs, /updateCalendarDayInPlace\(nextDay\)/);
  assert.match(appJs, /updateFinancePeriodInPlace\(\{subBodyOnly:true,animateSub:true\}\)/);

  // 6) Persistent chrome render updates main.page without replacing .topbar/.bottom-nav and finishes counts quietly
  assert.match(appJs, /function syncHeaderAndNavChrome\(\)/);
  assert.match(appJs, /function finishCountUpsImmediately\(scope=document\)/);
  assert.match(appJs, /dc-boot-enter/);
  assert.match(appJs, /dc-quiet-update/);
});

test('v35.42 inbox/fiscal observer ignores modal/theme/filter updates and deduplicates host renders', () => {
  const inboxJs = read('v35-26-inbox-fiscal.js');
  assert.match(inboxJs, /if\s*\(\s*!uiState\.activeModal\s*&&\s*!appSnapshot\(\)\.state\?\.modal/);
  assert.match(inboxJs, /host\.dataset\.renderedSig\s*===\s*nextSig/);
  assert.match(inboxJs, /if\s*\(d\.modalOnly\s*\|\|\s*d\.themeOnly\s*\|\|\s*d\.filterOnly\s*\|\|\s*d\.statsTypeOnly\s*\|\|\s*d\.searchResultsOnly\)\s*return;/);
  assert.match(inboxJs, /!h\.dataset\.dcHostAnimated/);
  assert.match(inboxJs, /!n\.classList\?\.contains\('overlay'\)/);
});

test('v35.42 CSS removes GPU layer bloat, fixed viewport bugs, and unscoped panel re-animations', () => {
  const appCss = read('app.css');
  const glassCss = read('monochrome-glass-v35.css');
  const motionCss = read('v35-26-motion.css');

  // app.css no longer animates every .page unconditionally
  assert.doesNotMatch(appCss, /\.page\{[^}]*animation:/);

  // monochrome-glass-v35.css sets html base background and drops iOS-buggy fixed attachment
  assert.match(glassCss, /html\{background:var\(--bg\)/);
  assert.doesNotMatch(glassCss, /background-attachment:\s*fixed/);

  // Chart animations are gated under .view-enter:not(.dc-quiet-update) or .dc-sub-enter
  assert.match(glassCss, /\.shell\.view-enter:not\(\.dc-quiet-update\)\s+\.flow-panel,\.finance-view-body\.dc-sub-enter\s+\.flow-panel/);
  assert.match(glassCss, /\.shell\.view-enter:not\(\.dc-quiet-update\)\s+\.donut,\.finance-view-body\.dc-sub-enter\s+\.donut/);

  // Compositor fixes: no permanent will-change on list rows/cards or contain:strict backdrop
  assert.doesNotMatch(motionCss, /#v3526GlassBackdrop\s*\{[^}]*contain:\s*strict/);
  assert.doesNotMatch(motionCss, /\.dc-anim-card[\s\S]{0,120}will-change:\s*transform,\s*opacity/);
  assert.match(motionCss, /\.shell\.dc-boot-enter\s+\.topbar/);
  assert.match(motionCss, /\.shell\.dc-quiet-update\s+main\.page \*[\s\S]{0,120}animation:\s*none\s*!important/);
});

test('v35.44 ensures initial loading->ready transition never triggers dayChangedOnly / dc-day-shift', () => {
  const appJs = read('app.js');
  assert.match(
    appJs,
    /const isDayPeriodView=state\.tab==='finance'&&!state\.route&&\(state\.financeView==='diario'\|\|state\.financeView==='calendario'\)/,
  );
  assert.match(
    appJs,
    /const dayChangedOnly=Boolean\(viewIsNew && isDayPeriodView && String\(previousViewKey\|\|''\)\.endsWith\('\/ready'\) && viewKey\.endsWith\('\/ready'\) && rootKey===previousRootKey\)/,
  );
});

test('v35.44 enforces noticeable elastic bounces and clear per-element stagger without full-panel sweeps', () => {
  const appJs = read('app.js');
  const motionCss = read('v35-26-motion.css');

  const stepMatch = motionCss.match(/--dc-stagger-step:\s*(\d+)ms/);
  assert.ok(stepMatch && Number(stepMatch[1]) >= 50, 'stagger step must be >= 50ms so element delays are clearly visible');

  // Every primary element keyframe must have intermediate bounce overshoot stops and opacity >= 0.55
  for (const kf of ['dcCardSpring', 'dcTextBounce', 'dcKickerRebound', 'dcSublineBounce', 'dcPillElastic', 'dcRowCascade', 'dcIconPop', 'dcAmountSpring', 'dcCountLand']) {
    const m = motionCss.match(new RegExp(`@keyframes\\s+${kf}\\s*\\{([\\s\\S]*?)\\n\\}`));
    assert.ok(m, `Missing keyframe ${kf}`);
    assert.match(m[1], /\b5[0-9]%|\b4[0-9]%|\b6[0-5]%/, `${kf} must include mid-flight elastic overshoot stop`);
    const opMatch = m[1].match(/0%\s*\{[^}]*opacity:\s*([0-9.]+)/);
    if (opMatch) assert.ok(Number(opMatch[1]) >= 0.55, `${kf} starting opacity must stay >= 0.55 to avoid black flash`);
  }

  // Distinct per-sub-element offsets inside cards/rows and sequential triple-summary stagger in JS
  assert.match(motionCss, /\.shell \.dc-anim-row \.row-amount[\s\S]*138ms/);
  assert.match(motionCss, /\.shell \.hero\.dc-anim-card \.hero-main[\s\S]*118ms/);
  assert.match(motionCss, /\.shell:not\(\.dc-quiet-update\) \.v3526-cut-action-card/);
  assert.match(appJs, /function staggerList\(/);
  assert.match(appJs, /staggerList\(triple\.children,'dc-anim-card'/);
  assert.match(appJs, /choreographElements\(body\)/);
  assert.match(appJs, /const delay=Math\.min\(720,idx\*62\);/);
});
