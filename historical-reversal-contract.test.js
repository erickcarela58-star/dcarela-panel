const test = require('node:test');
const assert = require('node:assert/strict');
const revisions = require('./finance-revision-core');

const cash = { id: 'cash', reconciled_at: '2026-09-05T03:59:59.999Z', reconciled_balance_centavos: 100000, saldo_actual_centavos: 50000 };
const bank = { id: 'bank', reconciled_at: cash.reconciled_at, reconciled_balance_centavos: 40000 };
const expense = { id: 'fixture-expense', business_id: 'fixture', tipo: 'gasto', estado: 'registrado', cuenta_id: 'cash', monto_centavos: 10000, fecha: '2026-09-02' };
const revise = (before, next, revisionId, createdAt = '2026-09-09T18:00:00Z') => revisions.reviseMovement(before, { ...before, ...next }, { revisionId, createdAt });
const balance = (account, row) => account.reconciled_balance_centavos + revisions.accountRevisionDelta(account, row);

test('anular un gasto previo al cuadre devuelve dinero sin modificar la base; restaurar conserva identidad', () => {
  const cancelled = revise(expense, { estado: 'anulado' }, 'cancel');
  assert.equal(balance(cash, cancelled), 110000);
  assert.equal(cash.reconciled_balance_centavos, 100000);
  const restored = revise(cancelled, { estado: 'registrado' }, 'restore', '2026-09-10T18:00:00Z');
  assert.equal(balance(cash, restored), 100000);
  assert.equal(restored.id, expense.id);
  assert.equal(restored.balance_effects.length, 3);
});

test('editar importe y cuenta de un gasto histórico aplica solamente las diferencias por cuenta', () => {
  const edited = revise(expense, { cuenta_id: 'bank', monto_centavos: 15000, fecha: '2026-09-10' }, 'edit');
  assert.equal(balance(cash, edited), 110000);
  assert.equal(balance(bank, edited), 25000);
  const cancelled = revise(edited, { estado: 'anulado' }, 'cancel', '2026-09-11T18:00:00Z');
  assert.equal(balance(cash, cancelled), 110000);
  assert.equal(balance(bank, cancelled), 40000);
});

test('un cuadre posterior absorbe la primera reversa y la restauracion posterior sigue descontando una vez', () => {
  const cancelled = revise(expense, { estado: 'anulado' }, 'cancel');
  const reconciled = { ...cash, reconciled_at: '2026-09-10T03:59:59.999Z', reconciled_balance_centavos: 110000 };
  assert.equal(balance(reconciled, cancelled), 110000);
  const restored = revise(cancelled, { estado: 'registrado' }, 'restore', '2026-09-11T18:00:00Z');
  assert.equal(balance(reconciled, restored), 100000);
});

test('movimientos posteriores al corte incluyen origen y deltas, sin sumar el importe nuevo otra vez', () => {
  const recent = { ...expense, fecha: '2026-09-06' };
  const edited = revise(recent, { monto_centavos: 15000 }, 'edit');
  assert.equal(balance(cash, edited), 85000);
  assert.equal(balance(cash, revise(edited, { estado: 'anulado' }, 'cancel', '2026-09-10T18:00:00Z')), 100000);
});

test('anulacion de transferencia historica invierte origen, destino y comision exactos', () => {
  const transfer = { ...expense, tipo: 'transferencia', cuenta_destino_id: 'bank', monto_centavos: 10000, comision_centavos: 500 };
  const cancelled = revise(transfer, { estado: 'anulado' }, 'cancel');
  assert.equal(balance(cash, cancelled), 110500);
  assert.equal(balance(bank, cancelled), 30000);
  const standaloneFee = { ...expense, id: 'fixture-fee', transferencia_id: transfer.id, monto_centavos: 500 };
  assert.equal(revisions.movementAccountEffects(transfer, [standaloneFee])[0].delta_centavos, -10000);
});

test('capital e intereses conservan efectos separados pero reversa total de cuenta exacta', () => {
  const capital = { ...expense, id: 'capital', monto_centavos: 8000, afecta_resultado: false };
  const interest = { ...expense, id: 'interest', monto_centavos: 2000, afecta_resultado: true };
  const cancelled = [capital, interest].map(row => revise(row, { estado: 'anulado' }, 'payment-cancel'));
  assert.equal(cancelled.reduce((sum, row) => sum + revisions.accountRevisionDelta(cash, row), 0), 10000);
  assert.equal(cancelled[0].afecta_resultado, false);
  assert.equal(cancelled[1].afecta_resultado, true);
});

test('datos sin fecha, cuenta, identidad o efectos seguros no producen una reversa inventada', () => {
  assert.throws(() => revise({ ...expense, fecha: '' }, { estado: 'anulado' }, 'cancel'), /fecha valida/);
  assert.throws(() => revise({ ...expense, cuenta_id: null }, { estado: 'anulado' }, 'cancel'), /cuenta contable/);
  assert.throws(() => revise(expense, { id: 'different' }, 'cancel'), /identidad/);
  assert.throws(() => revise(expense, { monto_centavos: 1.5 }, 'edit'), /entero seguro/);
  const cancelled = revise(expense, { estado: 'anulado' }, 'cancel');
  assert.throws(() => revise(cancelled, { estado: 'registrado' }, 'cancel'), /revision ya existe/);
  assert.equal(revisions.accountRevisionDelta(cash, expense), null);
});

test('repetir el estado confirmado no agrega efectos y una fecha de informe no genera dinero', () => {
  const cancelled = revise(expense, { estado: 'anulado' }, 'cancel');
  const repeated = revise(cancelled, { estado: 'anulado' }, 'cancel');
  assert.deepEqual(repeated.balance_effects, cancelled.balance_effects);
  const dateOnly = revise(expense, { fecha: '2026-09-10' }, 'redate');
  assert.equal(balance(cash, dateOnly), 100000);
});

// Los cuadres reales no se hacen a medianoche: las cuatro cuentas del negocio quedaron
// cuadradas el 10/09/2026 a las 12:39Z y 12:08Z, o sea a media manana. Y la mayoria de los
// movimientos traen fecha de SOLO DIA. Con el ancla de las 23:59:59, el importe original de un
// movimiento fechado ese mismo dia caia "despues del corte" y se volvia a sumar sobre un saldo
// que el dueno acababa de dar por bueno: 12000 donde debian entrar 2000.
test('con fecha de solo dia y corte el mismo dia no se inventa una cifra', () => {
  const cuentaCuadradaPorLaManana = { id: 'cash', reconciled_at: '2026-09-10T12:39:44.298Z' };
  const gastoDeEseDia = { ...expense, fecha: '2026-09-10' };
  const corregido = revise(gastoDeEseDia, { monto_centavos: 12000 }, 'edita-mismo-dia', '2026-10-01T18:00:00Z');

  // null significa "usa el contrato anterior": no se puede saber si ese importe ya estaba
  // dentro del saldo cuadrado, y ninguna de las dos suposiciones es gratis --contarlo inventa
  // dinero, descartarlo lo pierde si de verdad ocurrio despues del corte--.
  assert.equal(revisions.accountRevisionDelta(cuentaCuadradaPorLaManana, corregido), null,
    'sumar el origen otra vez seria dinero que no existe sobre un saldo ya conciliado');

  // El dia queda guardado en el efecto: si se pierde por el camino, "no se puede saber" vuelve
  // a convertirse en "ocurrio a las 23:59:59" y el fallo regresa.
  const origen = corregido.balance_effects.find(effect => effect.id.startsWith('origin:'));
  assert.equal(origen.source_day, '2026-09-10');

  // Con el corte en OTRO dia no hay ambiguedad y se sigue calculando igual que antes.
  // Cuadrada DESPUES del gasto: el gasto ya estaba dentro, solo entra la correccion.
  const cuadradaDespues = { id: 'cash', reconciled_at: '2026-09-12T12:00:00Z' };
  assert.equal(revisions.accountRevisionDelta(cuadradaDespues, corregido), -2000,
    'el gasto ya estaba dentro del saldo cuadrado; solo falta la diferencia');
  // Cuadrada ANTES del gasto: entra el gasto entero mas su correccion.
  const cuadradaAntes = { id: 'cash', reconciled_at: '2026-09-05T03:59:59.999Z' };
  assert.equal(revisions.accountRevisionDelta(cuadradaAntes, corregido), -12000);
});
