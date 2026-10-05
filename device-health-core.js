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
  function project(data, live, businessId, now = Date.now()) {
    const snapshot = data?.deviceHealthSnapshot;
    const scopedLive = live?.businessId === businessId ? live : null;
    const snapshotAt = Date.parse(snapshot?.checkedAt || '');
    const liveAt = Date.parse(scopedLive?.checkedAt || '');
    const verifiedSnapshot = snapshot?.businessId === businessId && snapshot.status === 'server'
      && Array.isArray(snapshot.rows) && Number.isFinite(snapshotAt) && snapshotAt <= now;
    let selected = scopedLive;
    // A server read started after an old listener result is the newer evidence.
    // Use the read's START, not its completion, so a slow request cannot undo a
    // later blocking/deletion received by the listener. Cache/errors stay unknown.
    if (verifiedSnapshot && (!selected || (selected.status === 'server'
      && (!Number.isFinite(liveAt) || snapshotAt > liveAt)))) selected = snapshot;
    if (!selected) return data;
    if (selected.status !== 'server') return { ...data, onlineDevices: null,
      lastDeviceSeenAt: null, deviceHealthStatus: selected.status };
    return { ...data, ...summarize(selected.rows, now), deviceHealthStatus: 'server' };
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
  return { summarize, observe, project };
});
