export function effectiveCutTransferCentavos(cut = {}, customCentavos = null) {
  if (cut?.kind !== 'cash_cut') return 0;
  if (customCentavos !== null && customCentavos !== undefined && Number.isSafeInteger(Number(customCentavos)) && Number(customCentavos) >= 0) {
    return Math.round(Number(customCentavos));
  }
  const transfer = Number(cut?.transferCentavos ?? cut?.transfer ?? 0);
  return Number.isFinite(transfer) && transfer >= 0 ? Math.round(transfer) : 0;
}

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
  const ownerCashConfirmableStatus = cut.kind === 'cash_cut'
    && ['awaiting_confirmation', 'discrepancy', 'mismatch_reported', 'awaiting_panel_reconciliation'].includes(status);
  const transferSupported = cut.kind !== 'cash_cut' || businessId === 'dcarela' || businessId === 'sucursal-a';
  const canConfirm = consistent && difference === 0 && reviewable && Boolean(cut.updatedAt) && transferSupported;
  const canConfirmWithReview = cut.kind === 'cash_cut'
    ? (consistent && ownerCashConfirmableStatus && Boolean(cut.updatedAt) && transferSupported)
    : canConfirm;
  const canConfirmCustom = cut.kind === 'cash_cut'
    && consistent
    && ownerCashConfirmableStatus
    && Boolean(cut.updatedAt)
    && transferSupported;
  return {
    expected, counted, difference, transfer,
    complete, consistent, transferSupported,
    canConfirm,
    canConfirmWithReview,
    canConfirmCustom,
    canReport: reviewable && Boolean(cut.updatedAt),
    needsReview: !consistent || difference !== 0 || !reviewable,
  };
}
