import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8');

test('v35.42 service worker avoids mid-session skipWaiting when active worker already exists', async () => {
  const swCode = read('sw.js');
  assert.match(swCode, /const CACHE = 'dcarela-finanzas-v35-48'/);

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

test('v35.48 eliminates unsolicited reloads and scopes button updates cleanly in app.js', () => {
  const appJs = read('app.js');
  assert.match(appJs, /const APP_VERSION='35\.48';/);

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
  assert.match(motionCss, /\.shell\.view-enter:not\(\.dc-quiet-update\)\s+\.flow-panel,[\s\S]*\.finance-view-body\.dc-sub-enter\s+\.flow-panel/);
  assert.match(motionCss, /\.shell\.view-enter:not\(\.dc-quiet-update\)\s+\.donut,[\s\S]*\.finance-view-body\.dc-sub-enter\s+\.donut/);
  assert.doesNotMatch(glassCss, /@keyframes\s+glassRise\b/);

  // Compositor fixes: no permanent will-change on list rows/cards or contain:strict backdrop
  assert.doesNotMatch(motionCss, /#v3526GlassBackdrop\s*\{[^}]*contain:\s*strict/);
  assert.doesNotMatch(motionCss, /\.dc-anim-card[\s\S]{0,120}will-change:\s*transform,\s*opacity/);
  assert.match(motionCss, /\.shell\.dc-quiet-update\s+main\.page,[\s\S]{0,120}animation:\s*none\s*!important/);
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

test('v35.46 enforces Apple Motion WAAPI physics, staggered words/cards, toast panel isolation, and damped modals without full-panel sweeps', () => {
  const appJs = read('app.js');
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const motionCss = read('v35-26-motion.css');
  const appleCss = read('apple-motion.css');
  const appleMjs = read('apple-motion.mjs');

  assert.match(appleMjs, /export function springProgress\(/);
  assert.match(appleMjs, /export function revealText\(/);
  assert.match(appleMjs, /export function glassExpand\(/);
  assert.match(appleMjs, /export function enterScreen\(/);
  assert.match(appleCss, /\[data-motion-unit\]/);
  assert.match(appleCss, /\.toast-host,\s*\.v3526-toast-host/);
  assert.match(appJs, /motionGlassExpand\(/);
  assert.match(appJs, /motionRevealText\(/);
  assert.match(appJs, /motionEnterScreen\(/);
  assert.match(appJs, /stopScopeAnimations\(/);
  assert.match(appJs, /staggerList\(/);
  assert.match(appJs, /choreographElements\(body\)/);
  assert.match(inboxJs, /motionReveal\(card,/);
  assert.match(inboxJs, /motionGlassExpand\(/);
  assert.match(inboxJs, /motionStop\(/);
  assert.match(inboxJs, /v3526-toast-host/);
  assert.match(motionCss, /\.v3526-cut-action-card\s*\{/);
  assert.match(appleCss, /\.apple-press\s*\{/);
  assert.match(appJs, /applyApplePress\(/);
  assert.doesNotMatch(motionCss, /@keyframes dcCardSpring\b/);
  assert.doesNotMatch(motionCss, /@keyframes dcRowCascade\b/);
});

test('v35.45 excludes pre-reconciliation cuts and supports Otra cantidad live sum + submission', () => {
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const appJs = read('app.js');
  const css = read('v35-26-motion.css');

  assert.match(inboxJs, /function resolveCashReconciledMs\(/);
  assert.match(inboxJs, /function isCutSupersededClient\(/);
  assert.match(inboxJs, /isCutSupersededClient\(c, cashReconciledMs\)/);
  assert.match(inboxJs, /data-toggle-custom-cut=/);
  assert.match(inboxJs, /data-custom-cut-input=/);
  assert.match(inboxJs, /manual_amount_centavos = manualAmountCentavos/);
  assert.match(inboxJs, /accept_discrepancy:/);
  assert.match(appJs, /function applyDemoCut\(cut=\{\},opts=\{\}\)/);
  assert.match(appJs, /opts\.manualAmountCentavos!==null/);
  assert.match(css, /\.v3526-cut-custom-box\s*\{/);
});
