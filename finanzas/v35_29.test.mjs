import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

test('dual branch PWAs (Central & Plaza) have distinct manifests, icons, SVG symbols and v35.35 cache busting', () => {
  const indexHtml = read('index.html');
  const plazaHtml = read('plaza.html');
  const manifestCentral = JSON.parse(read('manifest.webmanifest'));
  const manifestPlaza = JSON.parse(read('manifest-plaza.webmanifest'));
  const swJs = read('sw.js');

  assert.match(indexHtml, /<meta name="dcarela-branch-app" content="central">/);
  assert.match(plazaHtml, /<meta name="dcarela-branch-app" content="plaza">/);
  assert.match(indexHtml, /href="\.\/manifest\.webmanifest"/);
  assert.match(plazaHtml, /href="\.\/manifest-plaza\.webmanifest"/);

  assert.notEqual(manifestCentral.id, manifestPlaza.id);
  assert.notEqual(manifestCentral.start_url, manifestPlaza.start_url);
  assert.match(manifestCentral.name, /Central/);
  assert.match(manifestPlaza.name, /Plaza/);

  const inboxJs = read('v35-26-inbox-fiscal.js');

  for (const html of [indexHtml, plazaHtml]) {
    assert.match(html, /monochrome-glass-v35\.css\?v=35\.35/);
    assert.match(html, /v35-26-motion\.css\?v=35\.35/);
    assert.match(html, /firebase-adapter\.js\?v=35\.35/);
    assert.match(html, /app\.js\?v=35\.35/);
    assert.match(html, /v35-26-inbox-fiscal\.js\?v=35\.35/);
    assert.match(html, /<symbol id="ic-inflow"/);
    assert.match(html, /<symbol id="ic-outflow"/);
    assert.match(html, /<symbol id="ic-arrows"/);
    assert.match(html, /<symbol id="ic-receipt"/);
  }
  assert.match(inboxJs, /v35-26-category-emojis\.js\?v=35\.35/);

  assert.match(swJs, /dcarela-finanzas-v35-35/);
  assert.match(swJs, /'\.\/plaza\.html'/);
  assert.match(swJs, /'\.\/manifest-plaza\.webmanifest'/);
  assert.match(swJs, /'\.\/icons\/icon-plaza-192\.png'/);
});

test('chart SVGs use full-width 360px viewBox and responsive aspect-ratio without side letterboxing', () => {
  const appJs = read('app.js');
  const glassCss = read('monochrome-glass-v35.css');

  assert.match(appJs, /const left=3,right=357,top=12,bottom=106/);
  assert.match(appJs, /viewBox="0 0 360 138"/);
  assert.match(appJs, /const w=360,h=88,padL=2,padR=2,top=8,baseY=68/);
  assert.match(glassCss, /\.flow-svg\{[^}]*width:100%[^}]*height:auto[^}]*aspect-ratio:360\s*\/\s*138/);
  assert.match(glassCss, /\.mini-svg\{[^}]*width:100%[^}]*height:auto[^}]*aspect-ratio:360\s*\/\s*88/);
});

test('Resumen quick actions stay frameless vector medallions without emoji replacement', () => {
  const appJs = read('app.js');
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const motionCss = read('v35-26-motion.css');

  assert.match(appJs, /b\('gasto','outflow','Gasto','expense'\)/);
  assert.match(appJs, /b\('ingreso','inflow','Ingreso','income'\)/);
  assert.match(appJs, /b\('transferencia','arrows','Transferir','transfer'\)/);
  assert.doesNotMatch(inboxJs, /emojiByType\s*=\s*\{\s*gasto:/);
  assert.match(motionCss, /background:\s*transparent\s*!important;\s*border:\s*0\s*!important/);
});

test('mail bank linking never offers cash as bank origin and keeps both branch PWAs independent', () => {
  const inboxJs = read('v35-26-inbox-fiscal.js');
  const appJs = read('app.js');

  assert.match(inboxJs, /function isCashFinAccount\(a\)/);
  assert.match(inboxJs, /function findLinkedBankAccountForMail\(m,\s*allAccounts/);
  assert.match(inboxJs, /allAccounts\.filter\(\(a\)\s*=>\s*!isCashFinAccount\(a\)\)/);
  assert.match(inboxJs, /allAccounts\.filter\(\(a\)\s*=>\s*isCashFinAccount\(a\)/);
  assert.match(inboxJs, /sucursal_de_trabajo:\s*biz/);
  assert.doesNotMatch(appJs, /pwaBranchBridge|Entre sucursales|entryScope|openInterbranchTransfer|v3526-branch-switcher/);
  assert.doesNotMatch(inboxJs, /renderToolsBridgeHost|Transferir entre sucursales|v3526BridgeTransferBtn/);
});
