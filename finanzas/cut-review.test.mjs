import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { assessCut, effectiveCutTransferCentavos } = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(new URL('./cut-review.js', import.meta.url), 'utf8')));

const base = { kind: 'cash_cut', systemCentavos: 231000, reportedCentavos: 231000, differenceCentavos: 0, transferCentavos: 11000, amountsComplete: true, status: 'awaiting_confirmation', updatedAt: '2026-11-13T17:01:49.884Z' };

test('cut review permits only a complete, current and balanced cut', () => {
  assert.equal(assessCut(base).canConfirm, true);
  assert.equal(assessCut(base, 'sucursal-a').canConfirm, true);
  assert.equal(assessCut(base, 'sucursal-b').canConfirm, true);
  assert.equal(assessCut(base, 'sucursal-b').transferSupported, true);
  assert.equal(assessCut({ ...base, reportedCentavos: 232000, differenceCentavos: 1000 }).canConfirm, false);
  assert.equal(assessCut({ ...base, reportedCentavos: 232000, differenceCentavos: 0 }).consistent, false);
  assert.equal(assessCut({ ...base, status: 'mismatch_reported' }).canConfirm, false);
  assert.equal(assessCut({ ...base, status: 'mismatch_reported' }).canReport, false);
  assert.equal(assessCut({ ...base, updatedAt: '' }).canConfirm, false);
  assert.equal(assessCut({ ...base, amountsComplete: false }).canConfirm, false);
  assert.equal(assessCut(base, 'plaza-artesanal').canConfirm, false);
  assert.equal(assessCut(base, 'plaza-artesanal').transferSupported, false);
});

test('POS cut is a review without a transfer', () => {
  const result = assessCut({ ...base, kind: 'pos_cut', status: 'pending_review', transferCentavos: 0 });
  assert.equal(result.canConfirm, true);
  assert.equal(result.transfer, 0);
});

test('consistent cash_cut with difference allows owner confirmation and custom Otra cantidad', () => {
  const nightCut = { ...base, systemCentavos: 740000, reportedCentavos: 671000, differenceCentavos: -69000, transferCentavos: 451000 };
  const rv = assessCut(nightCut, 'dcarela');
  assert.equal(rv.canConfirm, false);
  assert.equal(rv.canConfirmWithReview, true);
  assert.equal(rv.canConfirmCustom, true);
  assert.equal(effectiveCutTransferCentavos(nightCut, null), 451000);
  assert.equal(effectiveCutTransferCentavos(nightCut, 200000), 200000);
  assert.equal(effectiveCutTransferCentavos(nightCut, 0), 0);

  const mismatchCut = { ...nightCut, status: 'mismatch_reported' };
  const rvMismatch = assessCut(mismatchCut, 'dcarela');
  assert.equal(rvMismatch.canConfirmCustom, true);
  assert.equal(assessCut(nightCut, 'sucursal-b').canConfirmCustom, true);
  assert.equal(assessCut(nightCut, 'plaza-artesanal').canConfirmCustom, false);
});
