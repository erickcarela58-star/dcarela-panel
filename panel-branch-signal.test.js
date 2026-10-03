const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'panel.js'), 'utf8');

function loadSignalHelpers() {
  const start = source.indexOf('  function estadoSenalTerminal(');
  const end = source.indexOf('  function saludDispositivos(', start);
  assert.ok(start >= 0 && end > start, 'No se encontro el clasificador de señal de sucursal');
  const waveStart = source.indexOf('  function waveMetric(');
  const waveEnd = source.indexOf('  function reportWaveChart(', waveStart);
  assert.ok(waveStart >= 0 && waveEnd > waveStart, 'No se encontro el render del indicador');
  const context = {
    Date,
    fecha: value => value ? new Date(value).toISOString() : '--',
    esc: value => String(value),
    waveSvg: (...args) => `<svg>${args[0]}</svg>`,
  };
  return vm.runInNewContext(`${source.slice(start, end)}\n${source.slice(waveStart, waveEnd)}\n({ estadoSenalTerminal, waveMetric })`, context);
}

test('la tarjeta de sucursal describe la ultima señal sin estimar salud operativa', () => {
  assert.doesNotMatch(source, /Salud operativa/);
  assert.doesNotMatch(source, /Math\.max\(0, 100 - Math\.min\(90, item\.alerts \* 3\)\)/);
  assert.match(source, /waveMetric\("Pulso de ventas", money\(item\.total\), "mes actual", item\.salesSeries\)/);
  assert.match(source, /metricSenalTerminal\(item\.device, item\.connected\)/);
});

test('estado de señal distingue registros recientes, vencidos, inválidos e inactivos', () => {
  const { estadoSenalTerminal } = loadSignalHelpers();
  const now = Date.parse('2026-10-03T12:00:00Z');
  assert.equal(estadoSenalTerminal(null, false, now).value, 'Sin terminal');
  assert.equal(estadoSenalTerminal({ status: 'activa' }, false, now).value, 'Fecha no verificable');
  assert.equal(estadoSenalTerminal({ status: 'activa', last_seen_at: '2026-10-03T11:59:00Z' }, true, now).value, 'Señal reciente');
  assert.equal(estadoSenalTerminal({ status: 'activa', last_seen_at: '2026-10-03T11:40:00Z' }, false, now).value, 'Señal vencida');
  assert.equal(estadoSenalTerminal({ status: 'bloqueada', last_seen_at: '2026-10-03T11:59:00Z' }, false, now).value, 'Terminal inactiva');
  assert.equal(estadoSenalTerminal({ status: 'activa', last_seen_at: '2026-10-03T12:01:00Z' }, false, now).value, 'Fecha no verificable');
});

test('el indicador de señal no dibuja una curva histórica ficticia', () => {
  const { waveMetric } = loadSignalHelpers();
  const html = waveMetric('Señal de terminal', 'Señal reciente', 'Último registro 12:00', null);
  assert.match(html, /Señal reciente/);
  assert.doesNotMatch(html, /<svg>/);
  assert.match(waveMetric('Pulso de ventas', 'RD$1', 'mes actual', [1, 2]), /<svg>/);
});
