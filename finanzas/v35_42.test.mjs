import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8');

test('v35.42 service worker avoids mid-session skipWaiting when active worker already exists', async () => {
  const swCode = read('sw.js');
  assert.match(swCode, /const CACHE = 'dcarela-finanzas-v35-63'/);

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

test('v35.51 eliminates unsolicited reloads and scopes button updates cleanly in app.js', () => {
  const appJs = read('app.js');
  assert.match(appJs, /const APP_VERSION='35\.63';/);

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

test('v35.49 muestra cuota de alquiler sin Saldo no verificado, separa 2 Adobe y expone Antigravity en compromisos y correo', () => {
  const appJs = read('app.js');
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const emojiJs = read('v35-26-category-emojis.js');
  const demoJs = read('demo-data.js');

  assert.match(appJs, /function debtDisplayInfo\(item\)/);
  assert.match(appJs, /id="v3526DebtsSubsHost"/);
  assert.match(inboxJs, /function renderDebtsSubsHost\(\)/);
  assert.match(inboxJs, /data-mfilter="suscripcion"/);
  assert.match(inboxJs, /subscriptions,/);
  assert.match(emojiJs, /antigravity/);
  assert.match(emojiJs, /tarjeta-adobe-1/);
  assert.match(emojiJs, /tarjeta-adobe-2/);
  assert.match(emojiJs, /tarjeta-antigravity/);
  assert.match(demoJs, /Alquiler del local/);
  assert.match(demoJs, /Genesis J Estevez · Nomina/);
  assert.match(demoJs, /Denni Gil Carela · Pago mes Octubre contabilidad/);
});

test('v35.51 confirma cortes de forma optimista + force-reload sin raza de concurrencia y avisa cuando hay SW esperando', async () => {
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const appJs = read('app.js');
  const css = read('v35-26-motion.css');

  assert.match(inboxJs, /inboxInFlight:\s*null/);
  assert.match(inboxJs, /resolvedCuts:\s*new Map\(\)/);
  assert.match(inboxJs, /loadInbox\(false,\s*\{\s*force:\s*true\s*\}\)/);
  assert.match(inboxJs, /if \(decision === 'mismatch' && !root\.querySelector\('#v3526CutReviewed'\)\?\.checked\)/);
  assert.match(appJs, /function watchAppUpdate\(reg\)/);
  assert.match(css, /\.round-button\[data-do="refresh"\]\.has-update::after/);

  const startIdx = inboxJs.indexOf('async function loadInbox(');
  const endIdx = inboxJs.indexOf('function getEcosystemSummary()');
  assert.ok(startIdx >= 0 && endIdx > startIdx, 'loadInbox function bounds not found');
  const loadInboxSrc = inboxJs.slice(startIdx, endIdx);

  function harness({ mode = 'demo', user = null, apiDelayMs = 0 } = {}) {
    let apiCount = 0;
    let ribbonUpdates = 0;
    let scheduleCount = 0;
    const uiState = {
      mode,
      loading: false,
      ecosystemLoading: false,
      error: '',
      ecosystemError: '',
      inboxInFlight: null,
      data: null,
      ecosystem: null,
      pushConfig: null,
      pushSubscribed: false,
    };
    const ctx = {
      Promise,
      setTimeout,
      uiState,
      normalizeInbox: (v) => v,
      linker: () => ({ buildDemoInboxData: () => ({ ok: true, ecosystem: { database: { connected: true } } }) }),
      window: { DcarelaFirebase: { getCurrentUser: () => user } },
      apiCall: async ({ action }) => {
        apiCount += 1;
        if (apiDelayMs) await new Promise((r) => setTimeout(r, apiDelayMs));
        if (action === 'pwaFinanceInbox') return { ok: true, cuts: [], call: apiCount };
        return { ok: true };
      },
      updateLiveRibbonDOM: () => { ribbonUpdates += 1; },
      scheduleSync: () => { scheduleCount += 1; },
    };
    vm.runInNewContext(loadInboxSrc, ctx);
    return { ctx, uiState, stats: () => ({ apiCount, ribbonUpdates, scheduleCount }) };
  }

  // 1) Synchronous demo path must not hit TDZ or leave inboxInFlight dangling
  const demo = harness({ mode: 'demo' });
  await demo.ctx.loadInbox();
  assert.equal(demo.uiState.inboxInFlight, null);
  assert.equal(demo.uiState.loading, false);
  assert.equal(demo.uiState.error, '');
  await demo.ctx.loadInbox(false, { force: true });
  assert.equal(demo.stats().scheduleCount, 2);

  // 2) Synchronous live !user path must return cleanly without TDZ error
  const noUser = harness({ mode: 'live', user: null });
  await noUser.ctx.loadInbox();
  assert.equal(noUser.uiState.inboxInFlight, null);
  assert.equal(noUser.uiState.loading, false);
  assert.equal(noUser.uiState.error, '');

  // 3) Live concurrent + forced reloads serialize cleanly without duplicate fetches
  const live = harness({ mode: 'live', user: { uid: 'u1' }, apiDelayMs: 25 });
  const p1 = live.ctx.loadInbox(false);
  const inflightAfterFirst = live.uiState.inboxInFlight;
  assert.ok(inflightAfterFirst, 'in-flight promise stored for live fetch');
  const p2 = live.ctx.loadInbox(false);
  assert.equal(live.uiState.inboxInFlight, inflightAfterFirst, 'non-forced call keeps the same in-flight promise');
  const p3 = live.ctx.loadInbox(false, { force: true });
  await Promise.all([p1, p2, p3]);
  assert.equal(live.uiState.inboxInFlight, null);
  assert.equal(live.uiState.loading, false);
  assert.equal(live.stats().apiCount, 6, 'p1 sent 3 calls and forced p3 sent 3 fresh calls (p2 reused p1)');
});

test('v35.52 formatea COP como Col$, convierte COP/EUR a DOP sin 1:1 y filtra notificaciones de consumo fuera de Pendientes de Correo', () => {
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const coreJs = fs.readFileSync(path.join(DIR, '..', 'money-manager-core.js'), 'utf8');
  const appJs = read('app.js');

  assert.match(coreJs, /excludeCoveredByMovements\s*=\s*false/);
  assert.match(appJs, /excludeCoveredByMovements:\s*true/);

  const startFn = inboxJs.indexOf('function resolveLinkedAccountBank(');
  const endFn = inboxJs.indexOf('function getPalette()');
  const fmtStart = inboxJs.indexOf('const ACTIONABLE_MAIL_KINDS = new Set');
  const fmtEnd = inboxJs.indexOf('function relTime(');
  const dopStart = inboxJs.indexOf('function getActiveBankRate(');
  const dopEnd = inboxJs.indexOf('function appSnapshot(');
  assert.ok(startFn >= 0 && endFn > startFn);
  assert.ok(fmtStart >= 0 && fmtEnd > fmtStart);
  assert.ok(dopStart >= 0 && dopEnd > dopStart);

  const snippet = [
    'const DEFAULT_BANKS = [{ key: "qik", label: "Qik", rateSell: 61.25 }];',
    'const uiState = { data: { fx: { banks: [{ key: "qik", label: "Qik", rateSell: 61.25 }], market: { cop_por_usd: 4150, usd_por_eur: 1.08 } } } };',
    'function getBankUrl() { return "https://qik.do/"; }',
    'function inferBankKeyFromText(t) { return /qik/i.test(String(t || "")) ? "qik" : ""; }',
    inboxJs.slice(startFn, endFn),
    inboxJs.slice(fmtStart, fmtEnd),
    inboxJs.slice(dopStart, dopEnd),
  ].join('\n');

  const ctx = { Math, Number, String, Array, Object, Set, RegExp, Boolean, uiState: undefined };
  vm.runInNewContext(snippet, ctx);

  assert.equal(ctx.fmtMoney(9305800, 'COP'), 'Col$93,058.00');
  assert.equal(ctx.fmtMoney(1999, 'USD'), 'US$19.99');
  assert.equal(ctx.fmtMoney(10000, 'EUR'), '€100.00');
  assert.equal(ctx.fmtMoney(101629, 'DOP'), 'RD$1,016.29');
  assert.equal(ctx.normalizeClientCurrency('DOP', 9305800, 'ADOBE'), 'COP');
  assert.equal(ctx.normalizeClientCurrency('COL$', 9305800, 'ADOBE'), 'COP');

  const dopFromCop = ctx.computeDopCentavos(9305800, 'COP', 'qik');
  assert.equal(dopFromCop, 137345, 'Col$93,058.00 convierte a RD$1,373.45 y no RD$93,058.00');
  const dopFromEur = ctx.computeDopCentavos(10000, 'EUR', 'qik');
  assert.equal(dopFromEur, 661500);

  const noFakeBank = ctx.findLinkedBankAccountForMail(
    { kind: 'suscripcion', bank: 'adobe', subject: 'Notificación de Consumo', currency: 'COP' },
    [{ id: 'qik-1', nombre: 'Cuenta Corriente Qik', tipo: 'banco', moneda: 'DOP', bankKey: 'qik' }]
  );
  assert.equal(noFakeBank, null, 'no asigna Cuenta Corriente Qik arbitrariamente a un comercio');

  assert.equal(ctx.isNonActionableMailNoise({ kind: 'consumo_bancario', subject: 'Consumo bancario · claro' }), true);
  assert.equal(ctx.isNonActionableMailNoise({ kind: 'suscripcion', subject: 'Notificación de Consumo' }), true);
  assert.equal(ctx.isNonActionableMailNoise({ kind: 'retiro_codigo_cash', subject: 'Código Cash' }), false);
  assert.equal(ctx.isActionableMailMovement({ kind: 'transferencia_salida' }), true);
  assert.equal(ctx.isActionableMailMovement({ kind: 'suscripcion' }), false);
});

test('v35.55 evita descargas/recargas en bucle y protege memoria GPU en iOS PWA', async () => {
  const appJs = read('app.js');
  const swJs = read('sw.js');
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const motionCss = read('v35-26-motion.css');
  const glassCss = read('monochrome-glass-v35.css');

  // 1) Boot load() no longer fires eager 77MB historical backfill at 1500ms
  const loadStart = appJs.indexOf('async function load(opts={}){');
  const loadEnd = appJs.indexOf('function liveRibbonText(');
  const loadBody = appJs.slice(loadStart, loadEnd);
  assert.doesNotMatch(loadBody, /setTimeout\(\(\)\s*=>\s*ensureFullHistory\(\)/);
  assert.match(loadBody, /if\(isLive\)\{const activeUid=window\.DcarelaFirebase\?\.getCurrentUser\?\.\(\)\?\.uid;if\(activeUid\)seenAuthUid=activeUid;\}/);

  // 2) Auth null -> uid hydration during boot does not wipe state and reload
  assert.match(appJs, /if \(seenAuthUid === null && uid && \(state\.loading \|\| state\.data\) && !state\.authRequired\)\s*\{\s*seenAuthUid=uid;\s*return;\s*\}/);

  // 3) Single-shot update reload guard prevents double location.reload() on controllerchange
  let reloadCalls = 0;
  const reloadCtx = {
    appUpdateReloading: true,
    location: { reload: () => { reloadCalls += 1; } },
  };
  const trigStart = appJs.indexOf('function triggerSingleUpdateReload(');
  const trigEnd = appJs.indexOf('async function checkAndApplyAppUpdate(');
  vm.runInNewContext(appJs.slice(trigStart, trigEnd), reloadCtx);
  reloadCtx.triggerSingleUpdateReload();
  reloadCtx.triggerSingleUpdateReload();
  assert.equal(reloadCalls, 1, 'location.reload executes at most once per update cycle');

  // 4) iOS touch screens drop dynamic orb blur and nested backdrop-filters; background tab pauses orbs
  assert.match(motionCss, /html\.dc-bg-paused \.v3526-orb-track-x[\s\S]*?animation-play-state:\s*paused\s*!important/);
  assert.match(motionCss, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.v3526-orb\s*\{[\s\S]*?filter:\s*none\s*!important/);
  assert.match(motionCss, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.quick-action \.quick-icon[\s\S]*?backdrop-filter:\s*none\s*!important/);
  const keypadBlock = glassCss.slice(glassCss.indexOf('.keypad button{'), glassCss.indexOf('.keypad button:active{'));
  assert.doesNotMatch(keypadBlock, /backdrop-filter/);
  assert.match(inboxJs, /dc-bg-paused/);
  assert.match(inboxJs, /function renderConnectionHost\(\)\s*\{[\s\S]*?host\.dataset\.renderedSig === nextSig/);

  // 5) sw.js precaches in batches and falls back cleanly on ?source=pwa navigations
  assert.match(swJs, /async function precacheShellInBatches\(/);
  assert.match(swJs, /ignoreSearch:\s*true/);
  assert.match(swJs, /url\.pathname\.endsWith\('\/plaza\.html'\)\s*\?\s*'\.\/plaza\.html'\s*:\s*'\.\/index\.html'/);
});

test('v35.56 corrige colisión de Fecha/Concepto, grids con date en iPhone 15, despeje de FAB y punto verde SW', async () => {
  const appJs = read('app.js');
  const appCss = read('app.css');
  const glassCss = read('monochrome-glass-v35.css');
  const motionCss = read('v35-26-motion.css');
  const inboxJs = read('v35-26-inbox-fiscal.js');

  // 1) CSS grids clamp columns via minmax(0, 1fr), stack date grids on <=480px, and clamp date inputs on WebKit
  assert.match(appCss, /\.filter-grid\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(appCss, /\.filter-grid>\*\{min-width:0;max-width:100%\}/);
  assert.match(appCss, /-webkit-appearance:none;appearance:none;box-sizing:border-box;overflow:hidden/);
  assert.match(appCss, /@media\(max-width:480px\)\{\.filter-grid\.filter-grid-dates,\.filter-grid:has\(input\[type="date"\]\)\{grid-template-columns:minmax\(0,1fr\)\}\}/);
  assert.match(motionCss, /@media \(max-width: 480px\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);

  // 2) modalEntry gives Fecha and Concepto dedicated full-width rows; date pairs use filter-grid-dates
  const entryStart = appJs.indexOf('function modalEntry(');
  const entryEnd = appJs.indexOf('const INTERACTIVE_PRESS_SEL=');
  const entryBody = appJs.slice(entryStart, entryEnd);
  assert.doesNotMatch(entryBody, /<div class="filter-grid">/);
  assert.match(entryBody, /id="entry-date"[^>]*type="date"/);
  assert.match(entryBody, /id="entry-note"/);
  assert.match(appJs, /renderCustomRange[\s\S]*?<div class="filter-grid filter-grid-dates">/);
  assert.match(appJs, /renderSearch[\s\S]*?<div class="filter-grid filter-grid-dates">/);
  assert.match(inboxJs, /v3526NewTaskForm[\s\S]*?<div class="filter-grid filter-grid-dates">/);
  assert.match(inboxJs, /v3526FiscalForm[\s\S]*?<div class="filter-grid filter-grid-dates">/);

  // 3) Shell padding clears both bottom-nav and floating + FAB; KPI labels wrap cleanly without truncation
  assert.match(glassCss, /\.shell\{padding-bottom:calc\(136px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(motionCss, /\.v3526-kpi strong\s*\{[\s\S]*?white-space:\s*normal;/);

  // 4) Waiting SW matching already-loaded APP_VERSION promotes cleanly without leaving persistent false green dot
  assert.match(appJs, /function clearAppUpdateWaiting\(\)/);
  assert.match(appJs, /async function inspectWaitingWorker\(waiting\)/);
  assert.match(appJs, /if\(remote && remote===APP_VERSION\)\{[\s\S]*?clearAppUpdateWaiting\(\)/);
});

test('v35.57 aplica desenfoque gaussiano centrado en los orbes sin costo GPU de filter:blur en iPhone', () => {
  const motionCss = read('v35-26-motion.css');
  const inboxJs = read('v35-26-inbox-fiscal.js');

  assert.match(motionCss, /closest-side at 50% 50%[\s\S]*?--v3526-orb-s1[\s\S]*?--v3526-orb-s4[\s\S]*?transparent 100%/);
  assert.match(motionCss, /--v3526-orb-blur-scale/);
  assert.match(inboxJs, /rootStyle\.setProperty\('--v3526-orb-blur-scale'/);
  assert.match(inboxJs, /rootStyle\.setProperty\('--v3526-orb-s1'/);
  assert.match(inboxJs, /rootStyle\.setProperty\('--v3526-orb-peak'/);
});

// 23/11/2026: gasto en otra moneda desde una cuenta en pesos (flujo con tipo de cambio).
test('el registro manual ofrece moneda del importe y tasa, y envía el importe original en vez de pesos', () => {
  const app = read('app.js');
  assert.match(app, /name="entry-currency"/);
  assert.match(app, /name="entry-rate"/);
  assert.match(app, /id="entry-fx-preview"/);
  assert.match(app, /core\.convertToDopCents\(\{moneda:state\.entryCurrency,importeCentavos:Number\(state\.entryDigits\|\|0\),tasa:state\.entryRate\}\)/);
  assert.match(app, /conversion\?\{monedaOriginal:conversion\.monedaOriginal,importeOriginalCentavos:conversion\.importeOriginalCentavos,tipoCambio:conversion\.tipoCambio\}:\{montoCentavos:cents\}/);
  // La transferencia entre cuentas sigue siendo solo en la moneda de las cuentas.
  assert.match(app, /function entryForeign\(\)\{return state\.entryType!=='transferencia'/);
  // El interruptor de escrituras no cambia con este flujo.
  const ds = read('data-source.js');
  assert.match(ds, /export const canRegister = \(\) => isLive && \(isIsolatedEmulator\(\) \|\|\s+isOfficialFinance\(\) && \(!window\.DCARELA_NUBE_URL \|\| localWritesEnabled\)\);/);
});
