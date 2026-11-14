import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { assessCut } = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(new URL('./cut-review.js', import.meta.url), 'utf8')));

const base = { kind: 'cash_cut', systemCentavos: 231000, reportedCentavos: 231000, differenceCentavos: 0, transferCentavos: 11000, amountsComplete: true, status: 'awaiting_confirmation', updatedAt: '2026-11-13T17:01:49.884Z' };

test('cut review permits only a complete, current and balanced cut', () => {
  assert.equal(assessCut(base).canConfirm, true);
  assert.equal(assessCut(base, 'sucursal-a').canConfirm, true);
  assert.equal(assessCut({ ...base, reportedCentavos: 232000, differenceCentavos: 1000 }).canConfirm, false);
  assert.equal(assessCut({ ...base, reportedCentavos: 232000, differenceCentavos: 0 }).consistent, false);
  assert.equal(assessCut({ ...base, status: 'mismatch_reported' }).canConfirm, false);
  assert.equal(assessCut({ ...base, status: 'mismatch_reported' }).canReport, false);
  assert.equal(assessCut({ ...base, updatedAt: '' }).canConfirm, false);
  assert.equal(assessCut({ ...base, amountsComplete: false }).canConfirm, false);
  assert.equal(assessCut(base, 'plaza-artesanal').canConfirm, false);
});

test('POS cut is a review without a transfer', () => {
  const result = assessCut({ ...base, kind: 'pos_cut', status: 'pending_review', transferCentavos: 0 });
  assert.equal(result.canConfirm, true);
  assert.equal(result.transfer, 0);
});
