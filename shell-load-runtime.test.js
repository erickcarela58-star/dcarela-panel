const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
for (const entry of ['index.html', 'mobile/index.html']) {
  const html = fs.readFileSync(path.join(__dirname, entry), 'utf8');
  const asset = html.match(/(?:shell-assets|assets)\/(index-[^?"']+\.js)/)[0];
  const bundle = fs.readFileSync(path.join(__dirname, entry.startsWith('mobile') ? 'mobile' : '', asset), 'utf8');
  const start = bundle.indexOf('()=>{let n=!0,shellReadToken=');
  const end = bundle.indexOf('},[c,e,ae,re]);', start);
  assert.ok(start > 0 && end > start);
  function harness({ business = 'fixture', snapshot = { current: null }, pending = { current: null }, delayed = defer() } = {}) {
    const updates = [], loading = [], refreshing = [], errors = [];
    const adapter = { isAvailable: true, waitForAuthState: async () => ({ uid: 'fixture-admin' }),
      getMembershipsForUser: async () => [{ business_id: business, active: true }],
      getBusinessesByIds: async () => [{ id: business, name: 'Fixture' }], getSyncEvents: async () => [],
      getFinanceAccountState: async () => ({ accounts: [{ id: 'bank', nombre: 'Fixture bank', tipo: 'banco' }], balances: [{ id: 'bank', balance: 4200 }] }),
      getCollection: async name => name === 'system_alerts' ? delayed.promise : [],
    };
    const context = { e: business, re: false, h: value => loading.push(value), y: value => errors.push(value),
      setShellRefreshing: value => refreshing.push(value), shellSnapshotRef: snapshot, shellReadPendingRef: pending,
      commitShellSnapshot: (scope, data) => { snapshot.current = { business: scope, at: new Date().toISOString() }; updates.push(data); },
      iw: () => adapter, _: () => {}, s: () => {}, _w: () => [], ge: () => { throw Error('unexpected scope'); },
      window: { DcarelaFinanceCore: require('./finance-core.js') }, mw: (...values) => values.find(v => Number.isFinite(v)), vw: (value, fallback) => value || fallback,
    };
    const run = vm.runInNewContext(`(${bundle.slice(start, end + 1)})`, context);
    return { run, updates, loading, refreshing, errors, snapshot, pending, delayed };
  }
  test(`${entry}: inicial espera todas las fuentes y una actualización conserva la instantánea previa`, async () => {
    const initial = harness(); const stop = initial.run(); await flush();
    assert.equal(initial.loading[0], true); assert.equal(initial.refreshing[0], false);
    assert.equal(initial.updates.length, 0); assert.ok(initial.pending.current);
    initial.delayed.resolve([]); await flush();
    assert.equal(initial.updates.length, 1, initial.errors.at(-1)); assert.equal(initial.updates[0].accounts[0].balanceCents, 4200);
    assert.equal(initial.snapshot.current.business, 'fixture'); assert.equal(initial.pending.current, null); stop();
    const refresh = harness({ snapshot: initial.snapshot }); refresh.run(); await flush();
    assert.equal(refresh.loading[0], false); assert.equal(refresh.refreshing[0], true);
    assert.equal(refresh.updates.length, 0, 'no publica cuentas parciales aunque cuentas ya terminó');
    refresh.delayed.resolve([]); await flush();
    assert.equal(refresh.updates.length, 1); assert.equal(refresh.refreshing.at(-1), false);
  });
  test(`${entry}: fallo inicial no crea cifras; fallo posterior conserva datos expresamente sin verificar`, async () => {
    for (const hasSnapshot of [false, true]) {
      const before = hasSnapshot ? { business: 'fixture', at: '2026-10-02T10:00:00Z' } : null;
      const h = harness({ snapshot: { current: before } }); h.run(); await flush();
      h.delayed.reject(new Error('fixture network failure')); await flush();
      assert.equal(h.updates.length, 0); assert.equal(h.snapshot.current, before); assert.equal(h.pending.current, null);
      assert.match(h.errors.at(-1), hasSnapshot ? /cifras anteriores estan sin verificar/ : /No se pudieron consultar los datos/);
      assert.equal(h.refreshing.at(-1), false);
    }
    assert.match(bundle, /v&&shellSnapshotRef\.current\?\.business!==e\?\(0,C\.jsx\)\(`button`/,
      'un fallo sin instantánea ofrece reintento antes de las tarjetas y gráficos');
    assert.ok(bundle.includes('m||(!v&&shellSnapshotRef.current?.business!==e)?'),
      'cambiar de sucursal oculta las cifras previas incluso antes de comenzar el efecto de carga');
  });
  test(`${entry}: una respuesta de sucursal anterior no reemplaza datos ni libera una nueva consulta pendiente`, async () => {
    const pending = { current: null }, snapshot = { current: null };
    const old = harness({ business: 'fixture-old', pending, snapshot }); const stopOld = old.run(); await flush(); stopOld();
    const current = harness({ business: 'fixture-new', pending, snapshot }); current.run(); await flush();
    const token = pending.current; old.delayed.resolve([]); await flush();
    assert.equal(pending.current, token); assert.equal(old.updates.length, 0); assert.equal(snapshot.current, null);
    current.delayed.resolve([]); await flush();
    assert.equal(current.updates.length, 1); assert.equal(snapshot.current.business, 'fixture-new');
  });
  test(`${entry}: temporizador no solapa lecturas ni consulta mientras otra pantalla o pestaña está activa`, () => {
    const a = bundle.indexOf('()=>{let e=window.setInterval(()=>{document.visibilityState');
    const b = bundle.indexOf('},[n])', a);
    assert.ok(a > 0 && b > a);
    let tick, calls = 0, cancelled = 0;
    const context = { n: 'dashboard', document: { visibilityState: 'visible' }, shellReadPendingRef: { current: null },
      oe: () => { calls++; }, window: { setInterval: cb => { tick = cb; return 42; }, clearInterval: id => { assert.equal(id, 42); cancelled++; } } };
    const effect = vm.runInNewContext(`(${bundle.slice(a, b + 1)})`, context); const stop = effect();
    tick(); assert.equal(calls, 1);
    context.shellReadPendingRef.current = {}; tick(); assert.equal(calls, 1);
    context.shellReadPendingRef.current = null; context.document.visibilityState = 'hidden'; tick(); assert.equal(calls, 1);
    context.document.visibilityState = 'visible'; context.n = 'finanzas'; tick(); assert.equal(calls, 1);
    context.n = 'dashboard'; tick(); assert.equal(calls, 2); stop(); assert.equal(cancelled, 1);
  });
}
