(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DcarelaSalePending = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const CURRENT_VERSION = 3;
  const LEGACY_VERSION = 2;

  const storageKey = business => `dcarela.sale.pending.v${CURRENT_VERSION}.${business}`;
  const legacyKey = business => `dcarela.sale.pending.v${LEGACY_VERSION}.${business}`;
  const safeArray = value => Array.isArray(value) ? value : [];
  const normalizeName = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const fallbackId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeLower = value => {
    try { return normalizeName(value).toLocaleLowerCase("es"); }
    catch { return normalizeName(value).toLowerCase(); }
  };
  const nameKey = value => safeLower(value);

  function readJson(storage, key) {
    if (!storage?.getItem) return null;
    const raw = storage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch { return null; }
  }

  function writeJson(storage, key, value) {
    if (!storage?.setItem) return;
    storage.setItem(key, JSON.stringify(value));
  }

  function removeKey(storage, key) {
    if (!storage?.removeItem) return;
    storage.removeItem(key);
  }

  function totalOfCart(cart) {
    return safeArray(cart).reduce((sum, line) => {
      const quantity = Number(String(line?.cantidad ?? 0).replace(",", "."));
      const unitPrice = Number(line?.precioUnitarioCentavos) || 0;
      const discountPct = Math.max(0, Math.min(100, Number(line?.descuentoPct) || 0));
      const gross = Math.round(Math.max(0, quantity) * unitPrice);
      return sum + Math.max(0, Math.round(gross * (1 - discountPct / 100)));
    }, 0);
  }

  function normalizeAccount(raw, index = 0) {
    const baseName = normalizeName(raw?.name) || `Cuenta ${index + 1}`;
    const cart = safeArray(raw?.cart)
      .filter(line => line && typeof line === "object")
      .map(line => ({ ...line }));
    const payments = safeArray(raw?.payments)
      .filter(payment => payment && typeof payment === "object")
      .map(payment => ({ ...payment }));
    const totalCentavos = Number(raw?.totalCentavos);
    const savedAt = String(raw?.savedAt || raw?.updatedAt || raw?.createdAt || new Date().toISOString());

    return {
      ...raw,
      id: String(raw?.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : fallbackId())),
      name: baseName,
      nameKey: nameKey(baseName),
      cart,
      payments,
      clientId: String(raw?.clientId || ""),
      rounding: String(raw?.rounding || "exacto"),
      tip: String(raw?.tip ?? "0.00"),
      note: String(raw?.note ?? ""),
      priceReason: String(raw?.priceReason ?? ""),
      totalCentavos: Number.isFinite(totalCentavos) ? Math.round(totalCentavos) : totalOfCart(cart),
      lineCount: Math.max(0, Number(raw?.lineCount) || cart.length),
      savedAt,
    };
  }

  function sortAccounts(accounts) {
    return [...accounts].sort((a, b) =>
      String(b.savedAt || "").localeCompare(String(a.savedAt || ""))
      || safeLower(a.name).localeCompare(safeLower(b.name))
    );
  }

  function distinctAccounts(accounts) {
    const used = new Set();
    return accounts.map((account, index) => {
      const baseName = normalizeName(account.name) || `Cuenta ${index + 1}`;
      let candidate = baseName;
      let suffix = 2;
      while (used.has(nameKey(candidate))) candidate = `${baseName} (${suffix++})`;
      used.add(nameKey(candidate));
      return { ...account, name: candidate, nameKey: nameKey(candidate) };
    });
  }

  function normalizeAccounts(rows) {
    return distinctAccounts(sortAccounts(safeArray(rows).map(normalizeAccount).filter(account => account.cart.length)));
  }

  function legacyAccounts(storage, business) {
    const legacy = readJson(storage, legacyKey(business));
    if (!legacy?.cart?.length) return [];
    return normalizeAccounts([{
      ...legacy,
      name: normalizeName(legacy.name) || "Cuenta en espera",
      savedAt: legacy.savedAt || new Date().toISOString(),
    }]);
  }

  function list(storage, business) {
    const parsed = readJson(storage, storageKey(business));
    const rows = Array.isArray(parsed) ? parsed : safeArray(parsed?.accounts);
    const accounts = normalizeAccounts(rows);
    return accounts.length ? accounts : legacyAccounts(storage, business);
  }

  function save(storage, business, accounts) {
    const normalized = normalizeAccounts(accounts);
    if (!normalized.length) {
      removeKey(storage, storageKey(business));
      removeKey(storage, legacyKey(business));
      return [];
    }
    writeJson(storage, storageKey(business), { version: CURRENT_VERSION, accounts: normalized });
    removeKey(storage, legacyKey(business));
    return normalized;
  }

  function upsert(storage, business, account) {
    const current = list(storage, business);
    const name = normalizeName(account?.name);
    if (!name) throw new Error("Escribe un nombre para la cuenta en espera.");
    const duplicate = current.find(item => item.nameKey === nameKey(name) && item.id !== account?.id);
    if (duplicate) throw new Error("Ya existe una cuenta en espera con ese nombre.");
    const nextAccount = normalizeAccount({
      ...account,
      id: account?.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : fallbackId()),
      name,
      savedAt: new Date().toISOString(),
    });
    const next = [nextAccount, ...current.filter(item => item.id !== nextAccount.id)];
    return { account: nextAccount, accounts: save(storage, business, next) };
  }

  function remove(storage, business, id) {
    const current = list(storage, business);
    const next = current.filter(item => item.id !== id);
    save(storage, business, next);
    return next.length !== current.length;
  }

  function take(storage, business, id) {
    const current = list(storage, business);
    const found = current.find(item => item.id === id) || null;
    if (!found) return null;
    save(storage, business, current.filter(item => item.id !== id));
    return found;
  }

  return {
    storageKey,
    normalizeName,
    list,
    save,
    upsert,
    remove,
    take,
  };
});
