import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const linker = require('./v35-26-category-emojis.js');

test('resolveClientExpenseCategory links digital, transport and utilities and avoids Otros when matched', () => {
  const cats = [
    { id: 'c-otros', nombre: 'Otros gastos', tipo: 'gasto' },
    { id: 'c-soft', nombre: 'Software e IA', tipo: 'gasto' },
    { id: 'c-trans', nombre: 'Transporte y combustible', tipo: 'gasto' },
    { id: 'c-serv', nombre: 'Servicios y energía', tipo: 'gasto' }
  ];

  const ai = linker.resolveClientExpenseCategory({ categoria_id: 'c-otros', descripcion: 'OPENAI *CHATGPT PLUS' }, cats);
  assert.equal(ai.categoria_id, 'c-soft');

  const ride = linker.resolveClientExpenseCategory({ categoria_id: '', descripcion: 'UBER TRIP SANTO DOMINGO' }, cats);
  assert.equal(ride.categoria_id, 'c-trans');

  const fiber = linker.resolveClientExpenseCategory({ categoria_id: '', descripcion: 'Pago Claro Fibra' }, cats);
  assert.equal(fiber.categoria_id, 'c-serv');
});

test('emoji helpers assign distinct expressive emojis per category, account and merchant', () => {
  assert.equal(linker.emojiForCategory('Sesiones fotográficas'), '📸');
  assert.equal(linker.emojiForCategory('Software e IA'), '💻');
  assert.equal(linker.emojiForCategory('Servicios y energía'), '⚡');
  assert.equal(linker.emojiForAccount({ tipo: 'tarjeta_credito', nombre: 'Visa Popular' }), '💳');
  assert.equal(linker.emojiForAccount({ tipo: 'banco', nombre: 'Banco BHD' }), '🏦');
  assert.equal(linker.emojiForAccount({ tipo: 'efectivo', nombre: 'Caja del estudio' }), '💵');
  assert.equal(linker.emojiForMerchant('Tu Código Cash Banreservas RD$8,000'), '🏧');
  assert.equal(linker.emojiForMerchant('Transferencia LBTR emitida'), '🔁');
  assert.equal(linker.emojiForMerchant('ANTHROPIC CLAUDE PRO'), '🤖');
});

test('PALETTES and buildDemoInboxData expose complete Demo Inbox, Mail/Cash-Codes, FX and Fiscal structures', () => {
  assert.equal(Array.isArray(linker.PALETTES), true);
  assert.equal(linker.PALETTES.length, 6);

  const demo = linker.buildDemoInboxData();
  assert.equal(demo.ok, true);
  assert.ok(demo.cuts.length >= 2);
  assert.ok(demo.consumptions.some((c) => c.currency === 'USD' && c.isDigital));
  assert.ok(demo.fx.banks.length >= 3);
  assert.ok(demo.paymentAlerts.length >= 1);
  assert.ok(demo.mail.accounts.some((a) => a.email === 'erickcarela91@gmail.com'));
  assert.ok(demo.mail.accounts.some((a) => a.email === 'erickcarela58@gmail.com'));
  assert.ok(demo.mail.movements.some((m) => m.kind === 'retiro_codigo_cash'));
  assert.ok(demo.mail.movements.some((m) => m.kind === 'transferencia_salida'));
  assert.ok(demo.fiscal.compras.length >= 1);
  assert.ok(demo.fiscal.ventas.length >= 1);
  assert.ok(demo.fiscal.revisar.length >= 1);
});
