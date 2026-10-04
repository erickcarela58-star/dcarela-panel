const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

for (const entry of ['index.html', 'mobile/index.html']) {
  test(`${entry}: el Resumen informa señales de terminales sin estimar salud ni dibujar tendencia ficticia`, () => {
    const html = fs.readFileSync(path.join(__dirname, entry), 'utf8');
    const asset = html.match(/(?:shell-assets|assets)\/(index-[^?"']+\.js)/)?.[1];
    assert.ok(asset, 'la entrada carga un bundle del Resumen');
    const bundle = fs.readFileSync(path.join(__dirname, entry.startsWith('mobile') ? 'mobile' : '', entry.startsWith('mobile') ? 'assets' : 'shell-assets', asset), 'utf8');
    assert.doesNotMatch(bundle, /label:`Salud operativa`/);
    assert.doesNotMatch(bundle, /Estado consolidado/);
    assert.doesNotMatch(bundle, /points:\[0,f\.onlineDevices,f\.onlineDevices,Math\.max\(0,f\.onlineDevices-1\),f\.onlineDevices\]/);
    assert.match(bundle, /senal reciente < 10 min/);
    assert.match(bundle, /f\.onlineDevices\?\?`--`/);
    assert.match(bundle, /children:`Estado de consulta`/);
  });
}
