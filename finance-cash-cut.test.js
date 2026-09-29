const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./finance-core');

const cuenta = { id: 'cash', nombre: 'Efectivo', reconciled_balance_centavos: 3342500, reconciled_at: '2026-09-29T16:16:51.000Z' };
const base = { business_id: 'dcarela', estado: 'registrado', fecha: '2026-09-29' };
const venta = { ...base, id: 'pos-sale:1:0', tipo: 'ingreso', origen: 'pos_venta', estado: 'confirmado', cuenta_id: 'cash', metodo_pago: 'efectivo', monto_centavos: 150000, source_timestamp: '2026-09-29T17:00:00.000Z' };
const abono = { ...base, id: 'operation-cash-1', tipo: 'ingreso', origen: 'caja_operacion', cuenta_id: 'cash', monto_centavos: 50000, source_timestamp: '2026-09-29T17:10:00.000Z' };
const gastoCaja = { ...base, id: 'operation-expense-1', tipo: 'gasto', origen: 'caja_operacion', cuenta_id: 'cash', monto_centavos: 7000, source_timestamp: '2026-09-29T17:20:00.000Z' };
const corte = { ...base, id: 'transf-cut-1', tipo: 'transferencia', origen: 'cash_cut', cuenta_id: 'caja_chica', cuenta_destino_id: 'cash', monto_centavos: 193000, source_timestamp: '2026-09-29T17:30:00.000Z' };
const gastoDueno = { ...base, id: 'wa-batch-1', tipo: 'gasto', origen: 'whatsapp_owner', cuenta_id: 'cash', monto_centavos: 40000, source_timestamp: '2026-09-29T18:00:00.000Z' };

test('una cuenta que recibe cortes cuenta el dinero de la caja una sola vez (por el corte)', () => {
  assert.equal(core.effectiveAccountBalance(cuenta, [venta, abono, gastoCaja, corte]), 3342500 + 193000);
});

test('el gasto que el dueno paga de su efectivo si resta', () => {
  assert.equal(core.effectiveAccountBalance(cuenta, [venta, abono, gastoCaja, corte, gastoDueno]), 3342500 + 193000 - 40000);
});

test('antes de que llegue el corte, lo de la caja aun no esta en Efectivo (la cuenta ya recibio cortes antes)', () => {
  const anterior = { ...corte, id: 'transf-cut-0', source_timestamp: '2026-09-28T23:14:00.000Z', fecha: '2026-09-28' };
  assert.equal(core.effectiveAccountBalance(cuenta, [anterior, venta, abono, gastoCaja]), 3342500);
});

test('un corte anulado no cambia el modo de la cuenta ni suma dinero', () => {
  assert.equal(core.effectiveAccountBalance(cuenta, [venta, { ...corte, estado: 'anulado' }]), 3342500 + 150000);
});

test('una cuenta sin cortes (otra sucursal) sigue contando sus ventas directo', () => {
  assert.equal(core.effectiveAccountBalance(cuenta, [venta, abono]), 3342500 + 150000 + 50000);
});

test('lo anterior al cuadre nunca entra', () => {
  const vieja = { ...corte, id: 'transf-cut-0', source_timestamp: '2026-09-29T10:00:00.000Z', fecha: '2026-09-29' };
  assert.equal(core.effectiveAccountBalance(cuenta, [vieja]), 3342500);
});

test('las ventas por tarjeta o transferencia a otra cuenta no se tocan', () => {
  const banco = { id: 'bank', reconciled_balance_centavos: 100000, reconciled_at: '2026-09-29T16:16:51.000Z' };
  const ventaBanco = { ...venta, id: 'pos-sale:2:0', cuenta_id: 'bank', metodo_pago: 'tarjeta', monto_centavos: 25000 };
  assert.equal(core.effectiveAccountBalance(banco, [ventaBanco, corte]), 125000);
});

test('un movimiento con la hora como Timestamp de Firestore si cuenta (no se descarta en silencio)', () => {
  const banco = { id: 'bank', reconciled_balance_centavos: 100000, reconciled_at: '2026-09-29T16:16:51.000Z' };
  const seconds = Date.parse('2026-09-29T17:00:00.000Z') / 1000;
  const gasto = { ...base, id: 'wa-fiscal-1-tax', tipo: 'gasto', origen: 'whatsapp_fiscal_media', cuenta_id: 'bank', monto_centavos: 200, source_timestamp: { _seconds: seconds, _nanoseconds: 0 } };
  const conToDate = { ...gasto, id: 'wa-fiscal-2-tax', source_timestamp: { toDate: () => new Date(seconds * 1000) } };
  assert.equal(core.effectiveAccountBalance(banco, [gasto]), 99800);
  assert.equal(core.effectiveAccountBalance(banco, [gasto, conToDate]), 99600);
  assert.equal(core.isoTime({ seconds }), '2026-09-29T17:00:00.000Z');
});
