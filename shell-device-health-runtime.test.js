const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./device-health-core.js');
for (const entry of ['index.html', 'mobile/index.html']) {
  test(`la escucha de ${entry} actualiza su estado y cancela sin consultar dinero`, () => {
    const html = fs.readFileSync(path.join(__dirname, entry), 'utf8');
    assert.match(html, /device-health-core\.js/);
    const asset = html.match(/(?:shell-assets|assets)\/(index-[^?"']+\.js)/)[0];
    const bundle = fs.readFileSync(path.join(__dirname, entry.startsWith('mobile') ? 'mobile' : '', asset), 'utf8');
    const start = bundle.indexOf('()=>{setDeviceHealth(null);');
    const end = bundle.indexOf('},[c,e,g,re]);', start);
    assert.ok(start > 0 && end > start, 'efecto real de la entrada publicada');
    let next, stopped = 0;
    const updates = [];
    const adapter = { isAvailable: true, listenCollection(name, conditions, callback) {
      assert.equal(name, 'devices'); assert.deepEqual(Array.from(conditions, row => Array.from(row)), [['business_id', '==', 'fixture-plaza']]);
      next = callback; return () => { stopped++; };
    }, getFinanceAccountState() { throw Error('la señal no consulta dinero'); }, getSyncEvents() { throw Error('la señal no consulta ventas'); } };
    const effect = vm.runInNewContext(`(${bundle.slice(start, end + 1)})`, {
      re: false, g: false, e: 'fixture-plaza', iw: () => adapter,
      setDeviceHealth: value => updates.push(value),
      window: { DcarelaDeviceHealth: { observe: (...args) => core.observe(...args, { setInterval: () => 1, clearInterval() {} }) } },
    });
    const stop = effect();
    assert.equal(updates[0], null);
    const rows = [{ status: 'activa', last_seen_at: new Date().toISOString() }];
    next(rows, { fromCache: true }); assert.equal(updates.at(-1).onlineDevices, null);
    next(rows, { fromCache: false }); assert.equal(updates.at(-1).onlineDevices, 1);
    stop(); const count = updates.length; next([], { fromCache: false });
    assert.equal(updates.length, count); assert.equal(stopped, 1);
    assert.match(bundle, /children:f\.onlineDevices\?\?`--`/, 'una lectura sin verificar no muestra cero');
  });
}
