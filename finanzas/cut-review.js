export function assessCut(cut = {}, businessId = 'dcarela') {
  const expected = Number(cut.systemCentavos);
  const counted = Number(cut.reportedCentavos);
  const declared = Number(cut.differenceCentavos);
  const transfer = cut.kind === 'cash_cut' ? Number(cut.transferCentavos) : 0;
  const complete = cut.amountsComplete === true && [expected, counted, declared, transfer].every(Number.isSafeInteger)
    && expected >= 0 && counted >= 0 && transfer >= 0;
  const difference = complete ? counted - expected : null;
  const consistent = complete && difference === declared;
  const status = String(cut.status || '');
  const reviewable = cut.kind === 'cash_cut' ? status === 'awaiting_confirmation' : status === 'pending_review';
  return {
    expected, counted, difference, transfer,
    complete, consistent,
    canConfirm: consistent && difference === 0 && reviewable && Boolean(cut.updatedAt)
      && (cut.kind !== 'cash_cut' || businessId === 'dcarela'),
    canReport: reviewable && Boolean(cut.updatedAt),
    needsReview: !consistent || difference !== 0 || !reviewable,
  };
}
