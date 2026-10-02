(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DcarelaDeviceHealth = api;
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  function summarize(rows, now = Date.now()) {
    const dates = (rows || []).map(row => typeof row.last_seen_at === 'string' ? Date.parse(row.last_seen_at) : NaN);
    const recent = (rows || []).filter((row, i) => row.status === 'activa' && Number.isFinite(dates[i]) && now >= dates[i] && now - dates[i] < 600000);
    const validDates = dates.filter(date => Number.isFinite(date) && date <= now);
    return { onlineDevices: recent.length, lastDeviceSeenAt: validDates.length ? new Date(Math.max(...validDates)).toISOString() : null };
  }
  function observe(adapter, businessId, callback, options = {}) {
    const clock = options.clock || Date.now;
    const schedule = options.setInterval || setInterval;
    const cancel = options.clearInterval || clearInterval;
    let active = true, rows = [], status = 'pending', checkedAt = '', unsubscribe;
    const emit = () => {
      if (!active || status === 'pending') return;
      const verified = status === 'server';
      callback({ status, rows, businessId, checkedAt: verified ? checkedAt : '',
        ...(verified ? summarize(rows, clock()) : { onlineDevices: null, lastDeviceSeenAt: null }) });
    };
    const fail = () => { if (active) { status = 'error'; emit(); } };
    try {
      unsubscribe = adapter.listenCollection('devices', [['business_id', '==', businessId]], (items, metadata) => {
        if (!active) return;
        rows = items;
        status = metadata?.fromCache === false && !metadata.hasPendingWrites ? 'server' : 'cache';
        checkedAt = status === 'server' ? new Date(clock()).toISOString() : '';
        emit();
      }, { includeMetadataChanges: true, onError: fail });
    } catch { fail(); }
    const timer = schedule(emit, 60000);
    return () => { active = false; cancel(timer); unsubscribe?.(); };
  }
  return { summarize, observe };
});
