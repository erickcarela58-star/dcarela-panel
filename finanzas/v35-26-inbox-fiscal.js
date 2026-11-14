import { assessCut } from './cut-review.js';

/* ==========================================================================
   v35.26 Unified Inbox, Mail/Cash-Codes, Theme Palettes, Web Push & Fiscal UI
   D' Carela Studio & Events · Finanzas PWA (iPhone 15 393x852)
   ========================================================================== */

const PALETTE_KEY = 'dcarela-mm-palette';
const CUSTOM_ACCENT_KEY = 'dcarela-mm-accent';
const GLASS_CFG_KEY = 'dcarela-mm-glass-config';

const DEFAULT_GLASS_CFG = Object.freeze({
  visualStyle: 'glass',
  solidBg: 'default',
  accentHue: 218,
  accentSat: 84,
  accentLight: 53,
  orbMode: 'sync',
  orbHues: [218, 190, 245],
  orbColors: ['#2563eb', '#06b6d4', '#6366f1'],
  orbBlur: 52,
  orbOpacity: 78,
  orbScale: 100,
  orbSpeed: 1.0,
  glassAlpha: 54
});

const SOLID_BG_PRESETS = Object.freeze([
  { id: 'default', name: 'Sistema', darkBg: '#090b10', darkSurface: '#121620', lightBg: '#f3f5f8', lightSurface: '#ffffff' },
  { id: 'midnight', name: 'Medianoche', darkBg: '#070b14', darkSurface: '#101829', lightBg: '#eef3fb', lightSurface: '#ffffff' },
  { id: 'slate', name: 'Pizarra', darkBg: '#0e131b', darkSurface: '#18202c', lightBg: '#f1f5f9', lightSurface: '#ffffff' },
  { id: 'emerald', name: 'Bosque', darkBg: '#071310', darkSurface: '#0f211c', lightBg: '#eff8f4', lightSurface: '#ffffff' },
  { id: 'amethyst', name: 'Noche Uva', darkBg: '#100a19', darkSurface: '#1b1229', lightBg: '#f6f2fc', lightSurface: '#ffffff' },
  { id: 'pureblack', name: 'OLED Puro', darkBg: '#000000', darkSurface: '#101014', lightBg: '#f8fafc', lightSurface: '#ffffff' }
]);

const BANK_URLS = Object.freeze({
  banreservas: 'https://www.banreservas.com/calculadoras/divisas',
  bhd: 'https://www.infodolar.com.do/',
  popular: 'https://www.infodolar.com.do/',
  scotiabank: 'https://www.infodolar.com.do/',
  qik: 'https://www.infodolar.com.do/',
  promedio_bancos: 'https://www.infodolar.com.do/'
});

function getBankUrl(bankKey) {
  const key = String(bankKey || '').trim().toLowerCase();
  return BANK_URLS[key] || BANK_URLS.promedio_bancos;
}

const DEFAULT_BANKS = [
  { key: 'banreservas', label: 'Banreservas', rateSell: 61.10, usdCompra: 58.40, confirmedToday: true, bankUrl: BANK_URLS.banreservas },
  { key: 'bhd', label: 'Banco BHD', rateSell: 61.35, usdCompra: 58.20, confirmedToday: true, bankUrl: BANK_URLS.bhd },
  { key: 'popular', label: 'Banco Popular', rateSell: 61.25, usdCompra: 58.15, confirmedToday: true, bankUrl: BANK_URLS.popular },
  { key: 'scotiabank', label: 'Scotiabank', rateSell: 61.40, usdCompra: 58.10, confirmedToday: true, bankUrl: BANK_URLS.scotiabank }
];

const uiState = {
  data: null,
  loading: false,
  error: '',
  ecosystem: null,
  ecosystemLoading: false,
  ecosystemError: '',
  cajaCrmTab: 'overview',
  clientSearch: '',
  mode: new URLSearchParams(location.search).get('mode') === 'demo' ? 'demo' : 'live',
  activeModal: null,
  autoCutPrompted: false,
  mailFilter: 'pending',
  fiscalTab: 'revisar',
  searchMoreFilters: false,
  pushConfig: null,
  pushSubscribed: false,
  pushBusy: false,
  busy: false,
  toastTimer: null,
  renderQueued: false,
  mountedHooks: false
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function linker() {
  return window.DcarelaCategoryLinker || {
    PALETTES: [
      { id: 'obsidian', name: 'Grafito', swatch: 'linear-gradient(135deg,#334155,#64748b)' },
      { id: 'sapphire', name: 'Zafiro', swatch: 'linear-gradient(135deg,#2563eb,#06b6d4)' },
      { id: 'emerald', name: 'Esmeralda', swatch: 'linear-gradient(135deg,#059669,#14b8a6)' },
      { id: 'amber', name: 'Ámbar', swatch: 'linear-gradient(135deg,#d97706,#f97316)' },
      { id: 'amethyst', name: 'Amatista', swatch: 'linear-gradient(135deg,#7c3aed,#ec4899)' },
      { id: 'crimson', name: 'Carmín', swatch: 'linear-gradient(135deg,#dc2626,#f43f5e)' }
    ],
    appleEmojiHtml: (e) => esc(e),
    emojiForCategory: () => '🏷️',
    emojiForAccount: () => '💳',
    emojiForMerchant: () => '💳',
    resolveClientExpenseCategory: () => ({ categoria_id: '', categoria: '' }),
    buildDemoInboxData: () => ({ ok: true, counts: {}, cuts: [], consumptions: [], paymentAlerts: [], fx: { banks: DEFAULT_BANKS, confirmedToday: true }, mail: { accounts: [], movements: [] }, fiscal: { compras: [], revisar: [], ventas: [] } })
  };
}

function ae(emoji, size = 16, cls = '') {
  const fn = linker().appleEmojiHtml;
  if (typeof fn === 'function') return fn(emoji, size, cls);
  return `<span>${esc(emoji)}</span>`;
}

function hslToHex(h, s = 84, l = 53) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, Number(s))) / 100;
  const light = Math.max(0, Math.min(100, Number(l))) / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => Math.round(255 * (light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function getGlassConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(GLASS_CFG_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        ...DEFAULT_GLASS_CFG,
        ...raw,
        orbHues: Array.isArray(raw.orbHues) && raw.orbHues.length === 3 ? raw.orbHues.map((n) => Number(n) || 0) : [...DEFAULT_GLASS_CFG.orbHues],
        orbColors: Array.isArray(raw.orbColors) && raw.orbColors.length === 3 ? [...raw.orbColors] : [...DEFAULT_GLASS_CFG.orbColors]
      };
    }
  } catch {}
  return { ...DEFAULT_GLASS_CFG, orbHues: [...DEFAULT_GLASS_CFG.orbHues], orbColors: [...DEFAULT_GLASS_CFG.orbColors] };
}

function applyGlassConfig(patch, persist = true) {
  const cfg = { ...getGlassConfig(), ...(patch || {}) };
  if (Array.isArray(patch?.orbHues)) {
    cfg.orbHues = patch.orbHues.slice(0, 3).map((n) => Number(n) || 0);
    cfg.orbColors = cfg.orbHues.map((h) => hslToHex(h, 86, 54));
  }
  const visualStyle = cfg.visualStyle === 'solid' ? 'solid' : 'glass';
  cfg.visualStyle = visualStyle;
  const solidPreset = SOLID_BG_PRESETS.find((p) => p.id === cfg.solidBg) || SOLID_BG_PRESETS[0];
  cfg.solidBg = solidPreset.id;
  const isDark = document.documentElement.dataset.theme === 'dark';

  const rootStyle = document.documentElement.style;
  document.documentElement.dataset.visualStyle = visualStyle;
  document.documentElement.dataset.solidBg = solidPreset.id;
  document.documentElement.dataset.orbMode = cfg.orbMode === 'custom' ? 'custom' : 'sync';
  rootStyle.setProperty('--v3526-solid-bg-custom', isDark ? solidPreset.darkBg : solidPreset.lightBg);
  rootStyle.setProperty('--v3526-solid-surface-custom', isDark ? solidPreset.darkSurface : solidPreset.lightSurface);
  cfg.orbColors.forEach((col, i) => {
    if (/^#[0-9a-f]{6}$/i.test(col || '')) rootStyle.setProperty(`--v3526-orb-custom-${i + 1}`, col);
  });
  rootStyle.setProperty('--v3526-orb-blur', `${Math.max(12, Math.min(96, Number(cfg.orbBlur || 52)))}px`);
  rootStyle.setProperty('--v3526-orb-alpha', String(Math.max(0.12, Math.min(1, Number(cfg.orbOpacity || 78) / 100))));
  rootStyle.setProperty('--v3526-orb-scale', String(Math.max(0.55, Math.min(1.6, Number(cfg.orbScale || 100) / 100))));
  rootStyle.setProperty('--v3526-orb-speed', String(Math.max(0.35, Math.min(2.5, Number(cfg.orbSpeed || 1)))));
  rootStyle.setProperty('--v3526-glass-alpha', String(Math.max(0.18, Math.min(0.9, Number(cfg.glassAlpha || 54) / 100))));
  if (persist) {
    try { localStorage.setItem(GLASS_CFG_KEY, JSON.stringify(cfg)); } catch {}
  }
  return cfg;
}

function inferBankKeyFromText(text) {
  const s = String(text || '').toLowerCase();
  if (/popular|\bbpd\b/.test(s)) return 'popular';
  if (/banreservas|reservas|\bbrrd\b/.test(s)) return 'banreservas';
  if (/\bbhd\b|le[oó]n/.test(s)) return 'bhd';
  if (/scotia/.test(s)) return 'scotiabank';
  if (/\bqik\b/.test(s)) return 'qik';
  return '';
}

function resolveLinkedAccountBank(item, allAccounts = [], cardLinks = {}) {
  const links = cardLinks || {};
  const last4 = String(item?.cardLast4 || '').trim();
  const linkByCard = last4 ? (links[last4] || Object.values(links).find((cl) => String(cl?.cardLast4 || '') === last4)) : null;
  const matchedAcc = allAccounts.find((a) => a.id === (item?.accountId || linkByCard?.accountId)) || null;
  const bankKey = String(
    item?.bankKey
    || linkByCard?.bankKey
    || linkByCard?.bank_key
    || matchedAcc?.bankKey
    || inferBankKeyFromText(matchedAcc?.nombre || linkByCard?.accountName || linkByCard?.account_name || item?.bankName || item?.bank || '')
    || ''
  ).toLowerCase();
  const bankLabel = matchedAcc?.nombre || linkByCard?.accountName || linkByCard?.account_name || item?.bankName || item?.bank || '';
  const bankUrl = getBankUrl(bankKey);
  return { matchedAcc, bankKey, bankLabel, bankUrl };
}

function isCashFinAccount(a) {
  if (!a) return false;
  const t = String(a.tipo || '').toLowerCase();
  return t === 'efectivo' || /\b(caja|efectivo|petty)\b/i.test(String(a.nombre || ''));
}

function findLinkedBankAccountForMail(m, allAccounts = []) {
  const nonCash = allAccounts.filter((a) => !isCashFinAccount(a));
  if (!nonCash.length) return null;
  if (m?.suggestedAccountId) {
    const direct = nonCash.find((a) => a.id === m.suggestedAccountId);
    if (direct) return direct;
  }
  const mailCur = String(m?.currency || 'DOP').toUpperCase();
  const curMatches = nonCash.filter((a) => String(a.moneda || 'DOP').toUpperCase() === mailCur);
  const pool = curMatches.length ? curMatches : nonCash;
  const textKey = inferBankKeyFromText(`${m?.bank || ''} ${m?.subject || ''}`);
  if (textKey) {
    const byBank = pool.find((a) => (a.bankKey || inferBankKeyFromText(a.nombre)) === textKey);
    if (byBank) return byBank;
  }
  if (m?.kind === 'retiro_codigo_cash') {
    return pool.find((a) => a.tipo === 'banco') || pool[0] || null;
  }
  return pool[0] || null;
}

function getPalette() {
  try { return localStorage.getItem(PALETTE_KEY) || 'sapphire'; } catch { return 'sapphire'; }
}

function getCustomAccent() {
  try { return localStorage.getItem(CUSTOM_ACCENT_KEY) || '#2563eb'; } catch { return '#2563eb'; }
}

function applyPalette(paletteId, customHex, skipSync = false) {
  const id = String(paletteId || 'sapphire').trim() || 'sapphire';
  const hex = /^#[0-9a-f]{6}$/i.test(String(customHex || '')) ? String(customHex) : getCustomAccent();
  try {
    localStorage.setItem(PALETTE_KEY, id);
    if (customHex && /^#[0-9a-f]{6}$/i.test(customHex)) {
      localStorage.setItem(CUSTOM_ACCENT_KEY, hex);
    }
  } catch {}
  document.documentElement.dataset.palette = id;
  document.documentElement.style.setProperty('--v3526-accent-custom', hex);
  if (!skipSync) scheduleSync();
}

function fmtMoney(centavos, currency = 'DOP') {
  const n = Number(centavos || 0) / 100;
  const prefix = String(currency || 'DOP').toUpperCase() === 'USD' ? 'US$' : 'RD$';
  return `${prefix}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function relTime(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return 'Reciente';
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 2) return 'Justo ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return String(iso).slice(0, 10);
}

function showToast(msg, isWarn = false, iconEmoji = '') {
  let el = document.getElementById('v3526Toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'v3526Toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:120;max-width:360px;width:calc(100% - 32px);padding:11px 14px;border-radius:16px;font-size:13px;font-weight:600;text-align:center;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 12px 28px rgba(0,0,0,.32);transition:opacity .25s ease;display:flex;align-items:center;justify-content:center;gap:7px;';
    document.body.appendChild(el);
  }
  el.innerHTML = `${iconEmoji ? ae(iconEmoji, 16) : ''}<span>${esc(msg)}</span>`;
  el.style.background = isWarn ? 'rgba(217,119,6,0.92)' : 'rgba(15,23,42,0.90)';
  el.style.color = '#ffffff';
  el.style.opacity = '1';
  clearTimeout(uiState.toastTimer);
  uiState.toastTimer = setTimeout(() => { if (el) el.style.opacity = '0'; }, 3600);
}

function normalizeInbox(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawFx = src.fx || {};
  let banksList = [];
  if (Array.isArray(rawFx.banks)) {
    banksList = rawFx.banks.map((b) => ({
      ...b,
      bankUrl: b.bankUrl || b.bank_url || getBankUrl(b.key)
    }));
  } else if (rawFx.banks && typeof rawFx.banks === 'object') {
    banksList = Object.entries(rawFx.banks).map(([key, val]) => ({
      key,
      label: val?.bank_name || val?.label || key,
      rateSell: Number(val?.usd_venta || val?.dop_por_usd || val?.rateSell || 61.25),
      usdCompra: Number(val?.usd_compra || 58.3),
      source: val?.fuente || val?.source || 'web_banco',
      bankUrl: val?.bank_url || val?.bankUrl || getBankUrl(key),
      confirmedDate: val?.confirmed_date || rawFx.confirmed_date || rawFx.confirmedDate || '',
      confirmedToday: Boolean(val?.confirmed_today ?? rawFx.confirmed_today ?? rawFx.confirmedToday)
    }));
  }
  if (!banksList.length) banksList = DEFAULT_BANKS.map((b) => ({ ...b }));

  const cuts = Array.isArray(src.cuts) ? src.cuts.map((c) => ({
    id: String(c.id || ''),
    kind: c.kind || 'pos_cut',
    title: c.title || (c.kind === 'cash_cut' ? 'Cierre de Caja' : `Corte TPV POS ${c.report_code || ''}`),
    date: String(c.date || c.day || c.created_at || '').slice(0, 10),
    systemCentavos: Number(c.systemCentavos ?? c.expected_centavos ?? 0),
    reportedCentavos: Number(c.reportedCentavos ?? c.counted_centavos ?? c.expected_centavos ?? 0),
    differenceCentavos: Number(c.differenceCentavos ?? c.difference_centavos ?? ((c.counted_centavos ?? 0) - (c.expected_centavos ?? 0))),
    transferCentavos: Number(c.transferCentavos ?? c.transfer_centavos ?? 0),
    amountsComplete: (c.systemCentavos ?? c.expected_centavos) != null && (c.reportedCentavos ?? c.counted_centavos) != null,
    updatedAt: String(c.updatedAt || c.updated_at || ''),
    turnoId: String(c.turno_id || ''),
    cashier: String(c.cashier || ''),
    shift: String(c.shift || ''),
    salesCashCentavos: Number(c.salesCashCentavos ?? c.ventas_efectivo_centavos ?? c.sales_centavos ?? 0),
    depositsCashCentavos: Number(c.depositsCashCentavos ?? c.abonos_efectivo_centavos ?? 0),
    entriesCentavos: Number(c.entriesCentavos ?? c.entradas_centavos ?? c.entries_centavos ?? 0),
    exitsCentavos: Number(c.exitsCentavos ?? c.salidas_centavos ?? c.exits_centavos ?? 0),
    pettyCashRemainingCentavos: Number(c.pettyCashRemainingCentavos ?? c.petty_cash_remaining_centavos ?? 0),
    currency: c.currency || 'DOP',
    status: c.status || 'pending_review',
    summary: c.summary || `${c.cashier ? `Cajero: ${c.cashier} · ` : ''}${c.branch_name || 'Estudio'}`
  })) : [];

  const rawCardLinks = src.cardLinks || src.card_links || {};
  const cardLinks = Array.isArray(rawCardLinks)
    ? Object.fromEntries(rawCardLinks.map((cl) => [cl.last4 || cl.id, cl]))
    : rawCardLinks;
  const srcAccounts = Array.isArray(src.accounts) ? src.accounts : [];

  const consumptions = Array.isArray(src.consumptions) ? src.consumptions.map((c) => {
    const merchant = c.merchant || c.comercio || 'Consumo tarjeta';
    const isDigital = Boolean(c.isDigital ?? c.is_digital ?? /openai|claude|anthropic|google|apple|meta|adobe|canva|netflix|cursor|github|spotify/i.test(merchant));
    const resolved = resolveLinkedAccountBank({
      accountId: c.accountId || c.selected_account_id || '',
      cardLast4: c.cardLast4 ?? c.last4 ?? '',
      bankKey: c.bankKey || c.bank_key || '',
      bankName: c.bankName || c.bank || ''
    }, srcAccounts, cardLinks);
    return {
      id: String(c.id || ''),
      merchant,
      cardLast4: String(c.cardLast4 ?? c.last4 ?? ''),
      bankName: c.bankName || c.bank || resolved.bankLabel || 'Cuenta vinculada',
      bankKey: resolved.bankKey || '',
      accountId: c.accountId || c.selected_account_id || resolved.matchedAcc?.id || '',
      currency: String(c.currency || 'DOP').toUpperCase(),
      originalCentavos: Number(c.originalCentavos ?? c.amount_minor ?? 0),
      computedDopMinor: Number(c.computedDopMinor ?? c.computed_dop_minor ?? 0),
      date: String(c.date || c.transaction_date || c.received_at || '').slice(0, 10),
      isDigital,
      autoDebitSuggested: Boolean(c.autoDebitSuggested ?? c.auto_debit_suggested ?? isDigital),
      suggestedCategoryId: c.suggestedCategoryId || c.suggested_category_id || '',
      suggestedCategoryName: c.suggestedCategoryName || c.suggested_category_name || '',
      status: c.status || 'pending_review',
      reference: c.reference || ''
    };
  }) : [];

  const paymentAlerts = Array.isArray(src.paymentAlerts) ? src.paymentAlerts.map((a) => ({
    id: String(a.id || ''),
    title: a.title || a.concepto || a.nombre || 'Pago pendiente',
    dueDate: String(a.dueDate || a.vence_en || a.proxima_fecha || '').slice(0, 10),
    amountCentavos: Number(a.amountCentavos ?? a.saldo_centavos ?? a.monto_centavos ?? 0),
    currency: a.currency || 'DOP',
    severity: a.severity || 'hoy',
    categoryName: a.categoryName || a.categoria || 'Servicios',
    raw: a
  })) : [];

  const rawMail = src.mail || {};
  const mailAccounts = Array.isArray(rawMail.accounts) ? rawMail.accounts.map((acc) => ({
    email: acc.email || acc.cuenta || '',
    label: acc.label || 'Correo conectado',
    solo_servicios: Boolean(acc.solo_servicios),
    include_transfers: acc.include_transfers !== false,
    include_cash_codes: acc.include_cash_codes !== false,
    lastHeartbeatAt: acc.lastHeartbeatAt || acc.last_seen_at || acc.visto_en || acc.updated_at || null,
    status: acc.status || 'activo'
  })) : [];

  const mailMovements = Array.isArray(rawMail.movements) ? rawMail.movements.map((m) => {
    const rawCls = String(m.kind || m.clasificacion || '').toLowerCase();
    const kind = (rawCls === 'retiro_cajero' || rawCls === 'retiro_codigo_cash' || /codigo cash|cash code/i.test(`${m.asunto || ''} ${m.subject || ''}`))
      ? 'retiro_codigo_cash'
      : (rawCls.includes('transferencia') ? rawCls : (rawCls || 'otro'));
    return {
      id: String(m.id || ''),
      kind,
      bank: m.bank || m.proveedor || 'Banco',
      accountEmail: m.accountEmail || m.cuenta_gmail || m.cuenta || '',
      subject: m.subject || m.asunto || m.motivo || 'Notificación bancaria',
      amountCentavos: Number(m.amountCentavos ?? m.monto_centavos ?? 0),
      currency: String(m.currency || m.moneda || 'DOP').toUpperCase(),
      reference: m.reference || m.referencia || '',
      date: String(m.date || m.recibido_en || m.creado_en || m.procesado_en || '').slice(0, 10),
      registered: Boolean(m.registered ?? m.pwa_registered ?? m.conciliado),
      suggestedAccountId: String(m.suggested_account_id || m.suggestedAccountId || ''),
      suggestedAccountName: String(m.suggested_account_name || m.suggestedAccountName || ''),
      suggestedAccountMoneda: String(m.suggested_account_moneda || m.suggestedAccountMoneda || '')
    };
  }) : [];

  const rawFiscal = src.fiscal || {};
  const mapCompra = (x) => ({
    id: String(x.id || ''),
    ncf: x.ncf || 'Sin NCF',
    rnc: x.rnc || 'Sin RNC',
    proveedor: x.proveedor || x.supplier || 'Proveedor',
    fecha: String(x.fecha || x.invoice_date || '').slice(0, 10),
    montoCentavos: Number(x.montoCentavos ?? x.total_centavos ?? 0),
    itbisCentavos: Number(x.itbisCentavos ?? x.itbis_centavos ?? 0),
    estado: x.estado || x.status || 'por_revisar',
    motivo: x.motivo || x.problema || '',
    origen: x.origen || '606'
  });
  const mapVenta = (x) => ({
    id: String(x.id || ''),
    ncf: x.ncf || 'Sin e-CF',
    rncCliente: x.rncCliente || x.rnc_cliente || '000000000',
    cliente: x.cliente || x.client || 'Consumidor Final',
    fecha: String(x.fecha || x.date || '').slice(0, 10),
    montoCentavos: Number(x.montoCentavos ?? x.total_centavos ?? (Number(x.monto || 0) * 100)),
    itbisCentavos: Number(x.itbisCentavos ?? x.itbis_centavos ?? 0),
    estado: (x.estado === 'validado' || x.validada) ? 'validado' : 'pendiente_validar',
    origen: x.origen || x.source || 'Hermes'
  });

  const compras = Array.isArray(rawFiscal.compras) ? rawFiscal.compras.map(mapCompra) : [];
  const revisar = Array.isArray(rawFiscal.revisar) ? rawFiscal.revisar.map(mapCompra) : [];
  const ventas = Array.isArray(rawFiscal.ventas) ? rawFiscal.ventas.map(mapVenta) : [];

  const pendingMailCount = mailMovements.filter((m) => !m.registered && ['retiro_codigo_cash', 'transferencia_salida', 'transferencia_enviada', 'transferencia_entrada', 'transferencia_recibida'].includes(m.kind)).length;
  const pendingFiscalCount = revisar.length + ventas.filter((v) => v.estado !== 'validado').length;
  const pendingCutsCount = cuts.filter((c) => c.status !== 'validated' && c.status !== 'confirmed').length;
  const pendingConsCount = consumptions.filter((c) => c.status !== 'registered' && c.status !== 'rejected').length;

  const counts = {
    cuts: Array.isArray(src.cuts) ? pendingCutsCount : Number(src.counts?.cuts || 0),
    consumptions: Array.isArray(src.consumptions) ? pendingConsCount : Number(src.counts?.consumptions || 0),
    paymentAlerts: Array.isArray(src.paymentAlerts) ? paymentAlerts.length : Number(src.counts?.paymentAlerts || 0),
    mailAttention: Array.isArray(src.mail?.movements) ? pendingMailCount : Number(src.counts?.mailAttention || 0),
    fiscalReview: (Array.isArray(src.fiscal?.revisar) || Array.isArray(src.fiscal?.ventas)) ? pendingFiscalCount : Number(src.counts?.fiscalReview || 0)
  };
  counts.totalPending = counts.cuts + counts.consumptions + counts.paymentAlerts + counts.mailAttention + counts.fiscalReview;

  const confirmedDate = rawFx.confirmedDate || rawFx.confirmed_date || new Date().toISOString().slice(0, 10);
  const confirmedToday = rawFx.confirmedToday ?? rawFx.confirmed_today ?? banksList.some((b) => Boolean(b.confirmedToday));

  return {
    ok: true,
    counts,
    cuts,
    consumptions,
    paymentAlerts,
    fx: {
      confirmedDate,
      confirmedToday: Boolean(confirmedToday),
      updatedAt: rawFx.updatedAt || rawFx.actualizado_en || new Date().toISOString(),
      banks: banksList
    },
    cardLinks,
    categories: Array.isArray(src.categories) ? src.categories : [],
    accounts: srcAccounts,
    mail: {
      endpointUrl: rawMail.endpointUrl || 'https://crmfacturasgmail-o2uqjp6fra-uc.a.run.app',
      accounts: mailAccounts,
      movements: mailMovements,
      summary: {
        total: mailMovements.length,
        pending: pendingMailCount,
        registered: mailMovements.filter((m) => m.registered).length
      }
    },
    fiscal: {
      compras,
      revisar,
      ventas,
      hermes: rawFiscal.hermes || { keepaliveActive: false, sessionState: 'idle' },
      summary: { compras: compras.length, ventas: ventas.length, revisar: revisar.length }
    }
  };
}

async function apiCall(payload) {
  if (uiState.mode === 'demo') {
    throw new Error('demo_local_only');
  }
  const fn = window.DcarelaFirebase?.assistantRequest;
  if (typeof fn !== 'function') {
    throw new Error('Adaptador de Firebase no disponible.');
  }
  const biz = appSnapshot().business || appSnapshot().state?.business;
  const body = (payload && typeof payload === 'object' && !payload.sucursal_de_trabajo && biz)
    ? { ...payload, sucursal_de_trabajo: biz }
    : payload;
  return fn(body);
}

async function loadInbox(forceRefreshRates = false) {
  if (uiState.loading) return;
  uiState.loading = true;
  uiState.ecosystemLoading = true;
  uiState.error = '';
  uiState.ecosystemError = '';
  try {
    if (uiState.mode === 'demo') {
      if (!uiState.data) {
        uiState.data = normalizeInbox(linker().buildDemoInboxData());
      }
      uiState.ecosystem = linker().buildDemoInboxData().ecosystem || null;
    } else {
      const user = window.DcarelaFirebase?.getCurrentUser?.();
      if (!user) {
        uiState.loading = false;
        uiState.ecosystemLoading = false;
        return;
      }
      const [inboxSettled, ecoSettled, pushSettled] = await Promise.allSettled([
        apiCall({ action: 'pwaFinanceInbox', refresh_rates: forceRefreshRates }),
        apiCall({ action: 'pwaEcosystemStatus' }),
        apiCall({ action: 'pwaPushConfig' }),
      ]);
      if (inboxSettled.status === 'fulfilled') {
        uiState.data = normalizeInbox(inboxSettled.value);
      } else {
        uiState.error = inboxSettled.reason?.message || 'No se pudo consultar el buzón.';
      }
      if (ecoSettled.status === 'fulfilled' && ecoSettled.value?.ok) {
        uiState.ecosystem = ecoSettled.value;
      } else {
        uiState.ecosystemError = ecoSettled.reason?.message || 'Estado en vivo pendiente de sincronizar.';
      }
      if (pushSettled.status === 'fulfilled') {
        uiState.pushConfig = pushSettled.value;
        uiState.pushSubscribed = Boolean(pushSettled.value?.mySubscriptions?.length);
      }
    }
  } catch (err) {
    uiState.error = err?.message || 'No se pudo consultar el buzón.';
  } finally {
    uiState.loading = false;
    uiState.ecosystemLoading = false;
    updateLiveRibbonDOM();
    scheduleSync();
  }
}

function getEcosystemSummary() {
  const eco = uiState.ecosystem;
  const liveConn = appSnapshot().state?.liveConn;
  const connDevices = (liveConn?.devices || []).filter((d) => d?.status === 'activa' && d?.last_seen_at && (Date.now() - Date.parse(d.last_seen_at)) < 600000);
  return {
    connected: Boolean(eco?.database?.connected || liveConn?.connected || uiState.mode === 'demo'),
    onlineDevices: eco?.caja ? Number(eco.caja.onlineDevices || 0) : connDevices.length,
    hasOpenShift: Boolean(eco?.caja?.activeShift || liveConn?.openShifts?.length),
    bridgeOnline: Boolean(eco?.crm?.bridgeStatus?.online),
    unreadConversations: Number(eco?.crm?.unreadConversations || 0),
    pendingCutsCount: Number(eco?.caja?.pendingCutsCount || 0)
  };
}

function updateLiveRibbonDOM() {
  const rightEl = document.getElementById('v3526LiveRibbonRight');
  if (!rightEl || uiState.mode === 'demo') return;
  const s = getEcosystemSummary();
  if (s.onlineDevices > 0 && s.bridgeOnline) {
    rightEl.textContent = `Base + Caja (${s.onlineDevices} PC) + CRM`;
  } else if (s.onlineDevices > 0) {
    rightEl.textContent = `Base + Caja POS (${s.onlineDevices} PC)`;
  } else if (s.hasOpenShift) {
    rightEl.textContent = 'Base + Turno abierto + CRM';
  } else if (s.bridgeOnline) {
    rightEl.textContent = 'Base Firebase + CRM en línea';
  } else if (s.connected) {
    rightEl.textContent = 'Base Firebase · Caja y CRM listos';
  }
}

function getActiveBankRate(bankKey) {
  const banks = uiState.data?.fx?.banks || DEFAULT_BANKS;
  const key = String(bankKey || '').trim().toLowerCase();
  if (key) {
    const exact = banks.find((b) => String(b.key || '').toLowerCase() === key);
    if (exact) return exact;
  }
  const avg = banks.length
    ? banks.reduce((sum, b) => sum + Number(b.rateSell || 0), 0) / banks.length
    : 61.25;
  return {
    key: '',
    label: 'Promedio bancario RD',
    rateSell: Number(avg.toFixed(2)),
    usdCompra: Number((avg - 2.4).toFixed(2)),
    confirmedToday: Boolean(uiState.data?.fx?.confirmedToday ?? banks[0]?.confirmedToday),
    confirmedDate: uiState.data?.fx?.confirmedDate || banks[0]?.confirmedDate || ''
  };
}

function computeDopCentavos(amountMinor, currency, bankKey) {
  const cur = String(currency || 'DOP').toUpperCase();
  if (cur === 'DOP') return Math.round(Number(amountMinor || 0));
  const rate = Number(getActiveBankRate(bankKey)?.rateSell || 61.25);
  return Math.round(Number(amountMinor || 0) * rate);
}

function appSnapshot() {
  return window.DcarelaFinanzasActions?.getSnapshot?.() || { state: {}, isLive: uiState.mode === 'live', accounts: [], categories: [], business: 'dcarela' };
}

function openNativeRoute(route) {
  window.DcarelaFinanzasActions?.openRoute?.(route);
}

function openNativePrefilled(opts) {
  closeModal();
  window.DcarelaFinanzasActions?.openPrefilledEntry?.(opts);
}

function closeModal() {
  uiState.activeModal = null;
  document.getElementById('v3526ModalRoot')?.remove();
}

function openModal(type, payload = null) {
  uiState.activeModal = { type, payload };
  renderModalRoot();
}

/* ==========================================================================
   DOM Sync Hooks (Header Bell, Apple PNG Icons, Auto Cuts Popup, Routes)
   ========================================================================== */

function currentViewKey() {
  return document.documentElement.dataset.activeView || '';
}

function enhanceHeaderAndQuickActions() {
  const topActions = document.querySelector('.topbar .top-actions');
  if (topActions) {
    let bell = document.getElementById('v3526BellBtn');
    if (!bell) {
      bell = document.createElement('button');
      bell.id = 'v3526BellBtn';
      bell.type = 'button';
      bell.className = 'round-button v3526-bell-btn';
      bell.setAttribute('aria-label', 'Centro de alertas y confirmaciones');
      bell.innerHTML = `<svg class="ico"><use href="#ic-bell"/></svg><span class="v3526-bell-badge" hidden>0</span>`;
      bell.addEventListener('click', () => openModal('alerts-hub'));
      topActions.prepend(bell);
    }
    const total = Number(uiState.data?.counts?.totalPending || 0);
    const badge = bell.querySelector('.v3526-bell-badge');
    if (badge) {
      badge.hidden = total <= 0;
      badge.textContent = total > 9 ? '9+' : String(total);
    }
  }

  // Preserve crisp SF-style SVG vector medallions in Resumen quick actions
  document.querySelectorAll('.quick-actions .quick-action .quick-icon').forEach((iconBox) => {
    delete iconBox.dataset.v3526Emoji;
  });

  // Replace category/movement SVGs with Apple PNG icons (circular ring stays ONLY on Resumen)
  const inHome = currentViewKey() === 'home';
  const catLinker = linker();
  document.querySelectorAll('main.page .cat-bubble').forEach((bubble) => {
    if (bubble.querySelector('.v3526-apple-emoji')) return;
    const row = bubble.closest('.movement-row, .category-bar-head, .budget-head, .stat-row, .account-row') || bubble.parentElement;
    const titleNode = row?.querySelector('.movement-title, .movement-copy b, .category-bar-label span:nth-child(2), .budget-head-copy b, b');
    const titleText = (titleNode?.textContent || row?.textContent || '').trim();
    const emoji = bubble.closest('.account-row')
      ? catLinker.emojiForAccount({ nombre: titleText })
      : (catLinker.emojiForMerchant(titleText) || catLinker.emojiForCategory(titleText));
    if (emoji) {
      bubble.innerHTML = ae(emoji, inHome ? 18 : 15);
    }
  });
}

function renderInboxStrip() {
  // Never render the horizontal pill button strip on Resumen; remove any stale element
  document.getElementById('v3526InboxStrip')?.remove();

  // Cuts only appear automatically as a popup modal ("ventana emergente"), never as a home button
  if (
    currentViewKey() === 'home'
    && !uiState.autoCutPrompted
    && !uiState.activeModal
    && Number(uiState.data?.counts?.cuts || 0) > 0
  ) {
    uiState.autoCutPrompted = true;
    setTimeout(() => {
      if (!uiState.activeModal && currentViewKey() === 'home' && Number(uiState.data?.counts?.cuts || 0) > 0) {
        openModal('cuts');
      }
    }, 360);
  }
}

function simplifyHistoryFilters() {
  if (currentViewKey() !== 'route:search') return;
  const searchPage = document.querySelector('[data-v3526-page="search"]');
  if (!searchPage) return;
  const chipsRow = searchPage.querySelector('.search-chips');
  if (!chipsRow) return;

  const extraNodes = searchPage.querySelectorAll('.search-advanced-fields, .filter-grid, .search-accounts');
  extraNodes.forEach((n) => {
    n.style.display = uiState.searchMoreFilters ? '' : 'none';
  });

  const labelHtml = `<svg class="ico ico-14" style="width:14px;height:14px"><use href="#ic-filter"/></svg><span>${uiState.searchMoreFilters ? 'Menos filtros' : 'Más filtros'}</span>`;
  let btn = document.getElementById('v3526MoreFiltersBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'v3526MoreFiltersBtn';
    btn.type = 'button';
    btn.onclick = () => {
      uiState.searchMoreFilters = !uiState.searchMoreFilters;
      simplifyHistoryFilters();
    };
    chipsRow.appendChild(btn);
  }
  btn.className = `chip ${uiState.searchMoreFilters ? 'is-active' : ''}`;
  btn.innerHTML = labelHtml;
}

function renderFiscalHost() {
  document.getElementById('v3526FinanceFiscalShortcut')?.remove();
  const host = document.getElementById('v3526FiscalHost');
  if (!host) return;
  const fiscal = uiState.data?.fiscal || { compras: [], revisar: [], ventas: [], hermes: {}, summary: {} };
  const hermes = fiscal.hermes || {};
  const tab = uiState.fiscalTab;
  const rows = tab === 'revisar' ? fiscal.revisar : tab === 'compras' ? fiscal.compras : fiscal.ventas;

  host.innerHTML = `
    <div class="v3526-card">
      <div class="v3526-card-head">
        <h3>${ae('🖥️', 17)} Hermes Facturador DGII</h3>
        <span class="v3526-tag ${hermes.keepaliveActive ? 'ok' : 'warn'}">${hermes.keepaliveActive ? 'Sincronizado' : 'En espera de sesión'}</span>
      </div>
      <p class="soft-note" style="margin:0 0 8px">${esc(hermes.notes || 'Copia 1:1 del historial de ventas del Facturador al Libro 607 tal y como está.')}</p>
      <div class="search-chips" style="margin:6px 0 10px">
        <button type="button" class="chip ${tab === 'revisar' ? 'is-active' : ''}" data-ftab="revisar">${ae('⚠️', 13)} Por revisar (${fiscal.revisar.length})</button>
        <button type="button" class="chip ${tab === 'compras' ? 'is-active' : ''}" data-ftab="compras">${ae('🛒', 13)} Compras 606 (${fiscal.compras.length})</button>
        <button type="button" class="chip ${tab === 'ventas' ? 'is-active' : ''}" data-ftab="ventas">${ae('🧾', 13)} Ventas 607 (${fiscal.ventas.length})</button>
      </div>
      ${rows.length ? rows.map((row) => {
        const isSale = tab === 'ventas';
        const statusOk = row.estado === 'validado';
        return `
          <div class="v3526-list-row">
            <div style="min-width:0;flex:1">
              <div style="font-size:13px;font-weight:700">${ae(isSale ? '🧾' : '🛒', 15)} ${esc(isSale ? row.cliente : row.proveedor)}</div>
              <div style="font-size:12px;opacity:.78">NCF: <b>${esc(row.ncf)}</b> · RNC: ${esc(isSale ? row.rncCliente : row.rnc)}</div>
              <div style="font-size:11px;opacity:.68">${esc(row.fecha)} · ${esc(row.origen)}${row.motivo ? ` · ${esc(row.motivo)}` : ''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:13px;font-weight:700">${fmtMoney(row.montoCentavos, 'DOP')}</div>
              <div class="v3526-btn-row" style="justify-content:flex-end;margin-top:4px">
                <span class="v3526-tag ${statusOk ? 'ok' : 'warn'}">${statusOk ? 'Validado' : 'Validar'}</span>
                <button type="button" class="secondary-btn compact" data-fval="${esc(row.id)}" data-fkind="${isSale ? '607' : '606'}">${statusOk ? 'Editar' : 'Validar'}</button>
              </div>
            </div>
          </div>
        `;
      }).join('') : '<p class="soft-note" style="margin:6px 0">Sin comprobantes en esta pestaña.</p>'}
    </div>
  `;
  host.querySelectorAll('[data-ftab]').forEach((b) => {
    b.onclick = () => { uiState.fiscalTab = b.dataset.ftab; renderFiscalHost(); };
  });
  host.querySelectorAll('[data-fval]').forEach((b) => {
    b.onclick = () => {
      const list = b.dataset.fkind === '607' ? fiscal.ventas : [...fiscal.revisar, ...fiscal.compras];
      const item = list.find((x) => x.id === b.dataset.fval);
      if (item) openModal('fiscal-validate', { kind: b.dataset.fkind, item });
    };
  });
}

function renderMailHost() {
  const host = document.getElementById('v3526MailHost');
  if (!host) return;
  const mail = uiState.data?.mail || { accounts: [], movements: [], summary: {} };
  const f = uiState.mailFilter;

  const filtered = mail.movements.filter((m) => {
    if (f === 'pending') return !m.registered;
    if (f === 'retiro_codigo_cash') return m.kind === 'retiro_codigo_cash';
    if (f === 'transferencia') return m.kind.includes('transferencia');
    if (f === 'consumo') return m.kind.includes('consumo');
    return true;
  });

  const kindLabel = (k) => k === 'retiro_codigo_cash' ? `${ae('🏧', 14)} Código Cash`
    : k.includes('entrada') || k.includes('recibida') ? `${ae('📥', 14)} Transferencia recibida`
      : k.includes('transferencia') ? `${ae('🔁', 14)} Transferencia enviada`
        : `${ae('💳', 14)} Consumo bancario`;

  host.innerHTML = `
    <div class="v3526-card">
      <div class="v3526-card-head">
        <h3>${ae('✉️', 17)} Correos Gmail conectados</h3>
        <button type="button" class="primary-btn compact" id="v3526AddMailBtn">+ Agregar correo</button>
      </div>
      ${mail.accounts.length ? mail.accounts.map((a) => `
        <div class="v3526-list-row">
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:700;word-break:break-word">${esc(a.email)}</div>
            <div style="font-size:11px;opacity:.75">${esc(a.label)} · ${esc(relTime(a.lastHeartbeatAt))}</div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              <span class="v3526-tag ok">Activo</span>
              ${a.include_cash_codes ? `<span class="v3526-tag">${ae('🏧', 12)} Códigos Cash</span>` : ''}
              ${a.include_transfers ? `<span class="v3526-tag">${ae('🔁', 12)} Transferencias</span>` : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
            <button type="button" class="secondary-btn compact" data-mail-script="${esc(a.email)}">${ae('📋', 13)} Script .gs</button>
            ${mail.accounts.length > 1 ? `<button type="button" class="secondary-btn compact" data-mail-remove="${esc(a.email)}">Quitar</button>` : ''}
          </div>
        </div>
      `).join('') : '<p class="soft-note">Agrega tus cuentas Gmail para leer transferencias y Códigos Cash.</p>'}
    </div>

    <div class="v3526-card">
      <div class="v3526-card-head">
        <h3>${ae('🏧', 17)} Códigos Cash y Transferencias</h3>
        <span class="v3526-tag warn">${mail.movements.filter((m) => !m.registered).length} pendientes</span>
      </div>
      <div class="search-chips" style="margin:6px 0 10px">
        <button type="button" class="chip ${f === 'pending' ? 'is-active' : ''}" data-mfilter="pending">Pendientes</button>
        <button type="button" class="chip ${f === 'retiro_codigo_cash' ? 'is-active' : ''}" data-mfilter="retiro_codigo_cash">${ae('🏧', 13)} Códigos Cash</button>
        <button type="button" class="chip ${f === 'transferencia' ? 'is-active' : ''}" data-mfilter="transferencia">${ae('🔁', 13)} Transferencias</button>
        <button type="button" class="chip ${f === 'all' ? 'is-active' : ''}" data-mfilter="all">Todos</button>
      </div>
      ${filtered.length ? filtered.map((m) => {
        const mailAccountsList = appSnapshot().accounts?.length ? appSnapshot().accounts : (uiState.data?.accounts || []);
        const linkedAcc = findLinkedBankAccountForMail(m, mailAccountsList);
        const linkedLabel = linkedAcc?.nombre || m.suggestedAccountName || '';
        return `
        <div class="v3526-list-row">
          <div style="min-width:0;flex:1">
            <div style="font-size:12px;font-weight:700">${kindLabel(m.kind)} · ${esc(m.bank)}</div>
            <div style="font-size:13px;font-weight:600;margin:2px 0">${esc(m.subject)}</div>
            <div style="font-size:11px;opacity:.72">${esc(m.accountEmail)} · ${esc(m.date)}${m.reference ? ` · Ref: ${esc(m.reference)}` : ''}</div>
            ${linkedLabel ? `<div style="font-size:11px;opacity:.84;margin-top:2px">${ae('🏦', 11)} Cuenta vinculada: <b>${esc(linkedLabel)}</b></div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:14px;font-weight:700">${fmtMoney(m.amountCentavos, m.currency)}</div>
            ${m.registered
              ? `<span class="v3526-tag ok" style="margin-top:5px">${ae('✅', 12)} Registrado</span>`
              : `<button type="button" class="primary-btn compact" style="margin-top:5px" data-mail-reg="${esc(m.id)}">${ae('⚡', 13)} Anotar</button>`}
          </div>
        </div>
      `; }).join('') : '<p class="soft-note">No hay movimientos en este filtro.</p>'}
    </div>
  `;

  host.querySelector('#v3526AddMailBtn').onclick = () => openModal('mail-add');
  host.querySelectorAll('[data-mfilter]').forEach((b) => {
    b.onclick = () => { uiState.mailFilter = b.dataset.mfilter; renderMailHost(); };
  });
  host.querySelectorAll('[data-mail-script]').forEach((b) => {
    b.onclick = () => openMailScriptModal(b.dataset.mailScript);
  });
  host.querySelectorAll('[data-mail-remove]').forEach((b) => {
    b.onclick = () => handleRemoveMailAccount(b.dataset.mailRemove);
  });
  host.querySelectorAll('[data-mail-reg]').forEach((b) => {
    b.onclick = () => {
      const mov = mail.movements.find((x) => x.id === b.dataset.mailReg);
      if (mov) openModal('mail-register', mov);
    };
  });
}

function getEffectiveEcosystem() {
  if (uiState.mode === 'demo') {
    return uiState.ecosystem || linker().buildDemoInboxData().ecosystem || null;
  }
  if (uiState.ecosystem) return uiState.ecosystem;
  const snap = appSnapshot();
  const st = snap.state || {};
  const conn = st.liveConn || null;
  const biz = snap.business || 'dcarela';
  const devices = (conn?.devices || []).map((d) => ({
    id: d.id,
    name: d.nombre || d.name || d.id,
    status: d.status || 'activa',
    version: d.app_version || d.version || null,
    lastSeenAt: d.last_seen_at || null,
    online: Boolean(d.status === 'activa' && d.last_seen_at && (Date.now() - Date.parse(d.last_seen_at)) < 600000)
  }));
  return {
    ok: false,
    fallbackOnly: true,
    businessId: biz,
    branchName: snap.branchDisplayName || biz,
    checkedAt: null,
    database: {
      projectId: window.__DCARELA_FIREBASE_CONFIG?.projectId || 'erikccarela',
      connected: Boolean(conn?.connected || st.data),
      accountsCount: (snap.accounts || []).filter((a) => a.estado !== 'eliminada').length,
      movementsCount: (st.data?.movements || []).length,
      obligationsCount: (st.data?.costObligations || []).length + (st.data?.commitments || []).length,
      syncedAt: null
    },
    caja: {
      activeShift: conn?.openShifts?.[0] || null,
      openShifts: conn?.openShifts || [],
      recentClosings: [],
      devices,
      onlineDevices: devices.filter((d) => d.online).length,
      totalDevices: devices.length,
      salesTodayCount: 0,
      salesTodayCentavos: 0,
      recentSales: [],
      pendingCutsCount: Number(uiState.data?.counts?.cuts || 0)
    },
    crm: null
  };
}

function crmUrlForCurrentBranch() {
  const snap = appSnapshot();
  const isPlaza = Boolean(snap.isPlazaBranch);
  const base = location.hostname.includes('panel.dcarelacompufoto.com') ? 'https://crm.dcarelacompufoto.com/' : '../panel.html';
  return isPlaza ? `${base}?sucursal=plaza-artesanal` : base;
}

function renderConnectionHost() {
  const host = document.getElementById('v3526ConnectionHost');
  if (!host) return;
  const snap = appSnapshot();
  const eco = getEffectiveEcosystem();
  const userEmail = uiState.mode === 'demo' ? 'demo@dcarelacompufoto.com' : (window.DcarelaFirebase?.getCurrentUser?.()?.email || 'Sesión activa');
  const dbInfo = eco?.database || {};
  const cajaInfo = eco?.caja || {};
  const crmInfo = eco?.crm || {};
  const bridge = crmInfo.bridgeStatus || {};

  host.innerHTML = `
    <div class="section-head"><h2>Base de datos · Caja · CRM</h2></div>
    <div class="v3526-card">
      <div class="v3526-card-head">
        <h3>${ae('🔗', 17)} Ecosistema en vivo</h3>
        <span class="v3526-tag ${uiState.mode === 'demo' ? 'warn' : dbInfo.connected ? 'ok' : 'warn'}">${uiState.mode === 'demo' ? 'Vista Demo' : dbInfo.connected ? 'Conectado' : 'Verificando'}</span>
      </div>
      <div class="v3526-list-row">
        <div>
          <b>${ae('🗄️', 14)} Base de datos (${esc(dbInfo.projectId || 'erikccarela')})</b>
          <div style="font-size:11px;opacity:.74">${esc(userEmail)} · ${Number(dbInfo.accountsCount || 0)} cuentas · ${Number(dbInfo.movementsCount || 0)}${dbInfo.movementsSampled ? '+' : ''} mov.</div>
        </div>
        <span class="v3526-tag ${dbInfo.connected ? 'ok' : 'warn'}">${dbInfo.syncedAt ? relTime(dbInfo.syncedAt) : (uiState.mode === 'demo' ? 'Demo' : 'Activa')}</span>
      </div>
      <div class="v3526-list-row">
        <div>
          <b>${ae('🖥️', 14)} Caja POS · Terminales y Turnos</b>
          <div style="font-size:11px;opacity:.74">${cajaInfo.activeShift ? `Turno abierto: ${esc(cajaInfo.activeShift.cajaNombre || 'Caja')}` : 'Sin turno abierto ahora'} · ${Number(cajaInfo.onlineDevices || 0)}/${Number(cajaInfo.totalDevices || 0)} PC activas</div>
        </div>
        <span class="v3526-tag ${cajaInfo.onlineDevices > 0 || cajaInfo.activeShift ? 'ok' : ''}">${cajaInfo.lastAppliedEventAt ? `Acuse ${relTime(cajaInfo.lastAppliedEventAt)}` : (cajaInfo.onlineDevices > 0 ? 'En línea' : 'En espera')}</span>
      </div>
      <div class="v3526-list-row">
        <div>
          <b>${ae('💬', 14)} CRM · Chats, Cotizaciones y Clientes</b>
          <div style="font-size:11px;opacity:.74">${eco?.crm ? `${Number(crmInfo.unreadConversations || 0)} sin leer · ${Number(crmInfo.quotesPending || 0)} cotiz. · ${Number(crmInfo.clientsCount || 0)} clientes` : (uiState.ecosystemError || 'Consulta en espera')}</div>
        </div>
        <span class="v3526-tag ${bridge.online ? 'ok' : ''}">${bridge.online ? 'WA Online' : (eco?.crm ? 'CRM Activo' : 'Sincronizar')}</span>
      </div>
      <div class="v3526-btn-row">
        <button type="button" class="primary-btn compact" id="v3526EcoSyncBtn" ${uiState.ecosystemLoading ? 'disabled' : ''}>${ae('🔄', 13)} ${uiState.ecosystemLoading ? 'Sincronizando…' : 'Probar y sincronizar'}</button>
        <button type="button" class="secondary-btn compact" id="v3526OpenCajaCrmBtn">${ae('🖥️', 13)} Abrir Caja y CRM</button>
      </div>
    </div>
  `;

  host.querySelector('#v3526EcoSyncBtn').onclick = async () => {
    await window.DcarelaFinanzasReload?.();
    await loadInbox(false);
    showToast('Base de datos, Caja y CRM actualizados.', false, '✅');
  };
  host.querySelector('#v3526OpenCajaCrmBtn').onclick = () => openNativeRoute('caja_crm');
}

function renderCajaCrmHost() {
  const host = document.getElementById('v3526CajaCrmHost');
  if (!host) return;
  const activeFocusedId = document.activeElement?.id || '';
  const activeSelStart = document.activeElement?.selectionStart;
  const activeSelEnd = document.activeElement?.selectionEnd;

  const snap = appSnapshot();
  const eco = getEffectiveEcosystem();
  const sub = uiState.cajaCrmTab || 'overview';
  const dbInfo = eco?.database || {};
  const caja = eco?.caja || {};
  const crm = eco?.crm || null;
  const bridge = crm?.bridgeStatus || {};
  const crmHref = crmUrlForCurrentBranch();
  const isPlaza = Boolean(snap.isPlazaBranch);

  const subTabs = [
    ['overview', '📊', 'Resumen'],
    ['caja', '🖥️', 'Caja POS'],
    ['crm', '💬', 'CRM y Chats'],
    ['clients', '👥', 'Clientes y Tareas']
  ];

  let sectionHtml = '';

  if (sub === 'overview') {
    sectionHtml = `
      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('🗄️', 17)} Base de datos · Firestore</h3>
          <span class="v3526-tag ${dbInfo.connected ? 'ok' : 'warn'}">${esc(dbInfo.projectId || 'erikccarela')}</span>
        </div>
        <div class="v3526-kpi-row">
          <div class="v3526-kpi"><small>Sucursal aislada</small><strong>${esc(snap.branchDisplayName || (isPlaza ? 'Plaza Artesanal' : 'Central'))}</strong></div>
          <div class="v3526-kpi"><small>Cuentas activas</small><strong>${Number(dbInfo.accountsCount || 0)}</strong></div>
          <div class="v3526-kpi"><small>Obligaciones</small><strong>${Number(dbInfo.obligationsCount || 0)}</strong></div>
        </div>
        <div class="v3526-btn-row">
          <button type="button" class="primary-btn compact" data-eco-action="refresh" ${uiState.ecosystemLoading ? 'disabled' : ''}>${ae('🔄', 13)} ${uiState.ecosystemLoading ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
          <a class="secondary-btn compact" href="${esc(crmHref)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-flex;align-items:center;gap:5px">${ae('🔗', 13)} Abrir CRM web</a>
        </div>
      </div>

      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('🖥️', 17)} Caja POS en tiempo real</h3>
          <span class="v3526-tag ${caja.onlineDevices > 0 || caja.activeShift ? 'ok' : ''}">${caja.onlineDevices > 0 ? `${caja.onlineDevices} PC en línea` : caja.activeShift ? 'Turno abierto' : 'En espera'}</span>
        </div>
        <div class="v3526-kpi-row">
          <div class="v3526-kpi"><small>Ventas de hoy</small><strong>${fmtMoney(caja.salesTodayCentavos || 0, 'DOP')}</strong><span>${Number(caja.salesTodayCount || 0)} ticket(s)</span></div>
          <div class="v3526-kpi"><small>Cortes pendientes</small><strong>${Number(caja.pendingCutsCount || 0)}</strong><span>${caja.lastAppliedEventAt ? `Acuse ${relTime(caja.lastAppliedEventAt)}` : 'POS sincronizado'}</span></div>
        </div>
        ${caja.activeShift ? `
          <div class="v3526-list-row" style="margin-top:6px">
            <div>
              <b>${ae('🟢', 13)} ${esc(caja.activeShift.cajaNombre || 'Caja activa')}</b>
              <div style="font-size:11px;opacity:.75">Abierta ${esc(relTime(caja.activeShift.openedAt))} · Base ${fmtMoney(caja.activeShift.montoAperturaCentavos || 0, 'DOP')}</div>
            </div>
            <button type="button" class="secondary-btn compact" data-eco-sub="caja">Ver POS</button>
          </div>
        ` : `<p class="soft-note" style="margin:6px 0 0">No hay turno de Caja abierto en este momento.</p>`}
        ${Number(caja.pendingCutsCount || 0) > 0 ? `<div class="v3526-btn-row"><button type="button" class="primary-btn compact" data-eco-open-cuts="1">${ae('🧾', 13)} Confirmar ${Number(caja.pendingCutsCount)} corte(s)</button></div>` : ''}
      </div>

      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('💬', 17)} CRM, Clientes y Tareas</h3>
          <span class="v3526-tag ${bridge.online ? 'ok' : ''}">${bridge.online ? 'WhatsApp conectado' : 'Canal CRM'}</span>
        </div>
        ${crm ? `
          <div class="v3526-kpi-row">
            <div class="v3526-kpi"><small>Chats sin leer</small><strong>${Number(crm.unreadConversations || 0)}</strong><span>${Number(crm.handoffPending || 0)} atención humana</span></div>
            <div class="v3526-kpi"><small>Por cobrar POS</small><strong>${fmtMoney(crm.clientsReceivableCentavos || 0, 'DOP')}</strong><span>${Number(crm.clientsCount || 0)} clientes · ${Number(crm.quotesPending || 0)} cotiz.</span></div>
          </div>
          <div class="v3526-btn-row">
            <button type="button" class="secondary-btn compact" data-eco-sub="crm">Ver chats y cotizaciones</button>
            <button type="button" class="secondary-btn compact" data-eco-sub="clients">Clientes (${Number(crm.clientsCount || 0)}) y Tareas (${Number(crm.tasksPending || 0)})</button>
          </div>
        ` : `<div class="notice warning">${esc(uiState.ecosystemError || 'Pulsa Sincronizar ahora para consultar métricas del CRM.')}</div>`}
      </div>
    `;
  } else if (sub === 'caja') {
    const devs = caja.devices || [];
    const closings = caja.recentClosings || [];
    const sales = caja.recentSales || [];
    sectionHtml = `
      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('🖥️', 17)} Terminales POS conectadas</h3>
          <span class="v3526-tag ${caja.onlineDevices > 0 ? 'ok' : ''}">${Number(caja.onlineDevices || 0)} activa(s)</span>
        </div>
        ${devs.length ? devs.map((d) => `
          <div class="v3526-list-row">
            <div>
              <b>${ae(d.online ? '🟢' : '⚪', 13)} ${esc(d.name)}</b>
              <div style="font-size:11px;opacity:.75">${d.version ? `v${esc(d.version)} · ` : ''}Último latido: ${d.lastSeenAt ? esc(relTime(d.lastSeenAt)) : 'Sin señal reciente'}</div>
            </div>
            <span class="v3526-tag ${d.online ? 'ok' : ''}">${d.online ? 'Online <10m' : esc(d.status || 'Inactiva')}</span>
          </div>
        `).join('') : '<p class="soft-note">No hay terminales registradas aún para esta sucursal.</p>'}
        ${caja.lastAppliedEventAt ? `<div class="soft-note" style="margin-top:8px">Último evento sincronizado hacia Caja POS: <b>${esc(relTime(caja.lastAppliedEventAt))}</b></div>` : ''}
      </div>

      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('🧾', 17)} Turno actual y últimos cierres</h3>
          <span class="v3526-tag">${Number(caja.salesTodayCount || 0)} ventas hoy</span>
        </div>
        ${caja.activeShift ? `
          <div class="v3526-list-row">
            <div>
              <b>${ae('🟢', 13)} Turno abierto · ${esc(caja.activeShift.cajaNombre || 'Caja')}</b>
              <div style="font-size:11px;opacity:.75">Apertura: ${fmtMoney(caja.activeShift.montoAperturaCentavos || 0, 'DOP')} · Ventas turno: ${Number(caja.activeShift.saleCount || 0)}</div>
            </div>
            <strong class="income-text">${fmtMoney(caja.activeShift.grossSalesCentavos || 0, 'DOP')}</strong>
          </div>
        ` : '<div class="soft-note">Ningún turno abierto ahora.</div>'}
        ${closings.length ? closings.slice(0, 4).map((cl) => `
          <div class="v3526-list-row">
            <div>
              <b>${esc(cl.cajaNombre || 'Cierre POS')}</b>
              <div style="font-size:11px;opacity:.72">Cerrado ${esc(relTime(cl.closedAt))} · ${Number(cl.saleCount || 0)} ventas</div>
            </div>
            <div style="text-align:right">
              <strong>${fmtMoney(cl.efectivoAEntregarCentavos || cl.grossSalesCentavos || 0, 'DOP')}</strong>
              <div style="font-size:10px;opacity:.7">Efectivo cierre</div>
            </div>
          </div>
        `).join('') : ''}
      </div>

      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('🛍️', 17)} Ventas recientes de Caja</h3>
          <strong>${fmtMoney(caja.salesTodayCentavos || 0, 'DOP')} hoy</strong>
        </div>
        ${sales.length ? sales.map((s) => `
          <div class="v3526-list-row">
            <div style="min-width:0;flex:1">
              <b>${esc(s.cliente || 'Consumidor Final')}</b>
              <div style="font-size:11px;opacity:.74">${s.folio ? `#${esc(s.folio)} · ` : ''}${esc(s.origen || 'POS')} · ${esc(s.metodo || 'Pago')} · ${s.at ? esc(relTime(s.at)) : esc(s.fecha || '')}</div>
            </div>
            <strong class="income-text">${fmtMoney(s.totalCentavos || 0, 'DOP')}</strong>
          </div>
        `).join('') : '<p class="soft-note">Sin ventas recientes registradas en este corte.</p>'}
      </div>
    `;
  } else if (sub === 'crm') {
    const convs = crm?.recentConversations || [];
    const quotes = crm?.recentQuotes || [];
    sectionHtml = `
      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('📱', 17)} Línea WhatsApp CRM (${esc(snap.branchDisplayName || 'Sucursal')})</h3>
          <span class="v3526-tag ${bridge.online ? 'ok' : 'warn'}">${bridge.online ? 'Conectada' : esc(bridge.status || 'En espera')}</span>
        </div>
        <div class="info-line"><span>Número vinculado</span><strong>${esc(bridge.connectedPhone || 'No configurado')}</strong></div>
        <div class="info-line"><span>Asistente automático</span><strong>${bridge.botEnabled ? 'Activo' : 'Manual'}</strong></div>
        <div class="info-line"><span>Conversaciones activas / sin leer</span><strong>${Number(crm?.conversationsTotal || 0)} · ${Number(crm?.unreadConversations || 0)} sin leer</strong></div>
        <div class="v3526-btn-row">
          <a class="primary-btn compact" href="${esc(crmHref)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">${ae('💬', 13)} Responder en CRM completo</a>
        </div>
      </div>

      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('🧾', 17)} Cotizaciones recientes</h3>
          <span class="v3526-tag">${Number(crm?.quotesPending || 0)} pendientes</span>
        </div>
        ${quotes.length ? quotes.map((q) => `
          <div class="v3526-list-row">
            <div style="min-width:0;flex:1">
              <b>${esc(q.cliente || 'Cliente')} · ${esc(q.folio || 'COT')}</b>
              <div style="font-size:11px;opacity:.74">${esc(q.titulo || 'Cotización')} · ${esc(q.creada ? String(q.creada).slice(0, 10) : '')}</div>
              <span class="v3526-tag ${q.estado === 'aprobada' || q.estado === 'en_caja' ? 'ok' : ''}" style="margin-top:4px">${esc(q.estado)}</span>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-weight:750">${fmtMoney(q.totalCentavos || 0, 'DOP')}</div>
              ${q.estado === 'enviada' ? `<div class="v3526-btn-row" style="margin-top:5px;justify-content:flex-end"><button type="button" class="primary-btn compact" data-eco-quote-approve="${esc(q.id)}">${ae('✅', 12)} Aprobar</button></div>` : ''}
            </div>
          </div>
        `).join('') : '<p class="soft-note">No hay cotizaciones registradas en esta sucursal.</p>'}
      </div>

      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('💬', 17)} Últimos chats del CRM</h3>
          <span class="v3526-tag ${Number(crm?.handoffPending || 0) > 0 ? 'warn' : ''}">${Number(crm?.handoffPending || 0)} atención</span>
        </div>
        ${convs.length ? convs.map((c) => `
          <div class="v3526-list-row">
            <div style="min-width:0;flex:1">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <b>${esc(c.name)}</b>
                ${c.unreadCount > 0 ? `<span class="v3526-tag warn">${c.unreadCount} nuevo(s)</span>` : ''}
                ${c.handoff ? `<span class="v3526-tag danger">Atender</span>` : ''}
              </div>
              <div style="font-size:12px;opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.preview || c.phone || 'Conversación')}</div>
            </div>
            <div style="font-size:11px;opacity:.7;flex-shrink:0">${esc(relTime(c.lastMessageAt))}</div>
          </div>
        `).join('') : '<p class="soft-note">Sin conversaciones recientes para esta sucursal.</p>'}
      </div>
    `;
  } else {
    const q = String(uiState.clientSearch || '').trim().toLocaleLowerCase('es');
    const clients = (crm?.recentClients || []).filter((c) => !q || `${c.nombre} ${c.telefono}`.toLocaleLowerCase('es').includes(q));
    const tasks = crm?.pendingTasks || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    sectionHtml = `
      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('👥', 17)} Clientes de Caja y Saldos</h3>
          <span class="v3526-tag">${Number(crm?.clientsCount || 0)} total</span>
        </div>
        <input type="search" class="field-control" id="v3526ClientSearchInput" value="${esc(uiState.clientSearch || '')}" placeholder="Buscar cliente o teléfono..." autocomplete="off" style="margin-bottom:8px">
        ${clients.length ? clients.map((cl) => `
          <div class="v3526-list-row">
            <div style="min-width:0;flex:1">
              <b>${esc(cl.nombre)}</b>
              <div style="font-size:11px;opacity:.74">${esc(cl.telefono || 'Sin teléfono')}${cl.diasCredito ? ` · Crédito ${cl.diasCredito}d` : ''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div class="${cl.saldoCentavos > 0 ? 'expense-text' : ''}" style="font-weight:750">${cl.saldoCentavos > 0 ? `Debe ${fmtMoney(cl.saldoCentavos, 'DOP')}` : 'Al día'}</div>
              <button type="button" class="secondary-btn compact" style="margin-top:4px" data-eco-client="${esc(cl.id)}" data-eco-client-name="${esc(cl.nombre)}">Ver compras</button>
            </div>
          </div>
        `).join('') : '<p class="soft-note">Sin coincidencias en clientes recientes de esta sucursal.</p>'}
      </div>

      <div class="v3526-card">
        <div class="v3526-card-head">
          <h3>${ae('✅', 17)} Tareas del equipo (${esc(snap.branchDisplayName || 'Sucursal')})</h3>
          <span class="v3526-tag ${Number(crm?.tasksOverdue || 0) > 0 ? 'warn' : ''}">${Number(crm?.tasksPending || 0)} pend.</span>
        </div>
        <form id="v3526NewTaskForm" style="display:grid;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
          <input type="text" class="field-control" name="task-title" placeholder="Nueva tarea rápida para el equipo..." maxlength="140" required>
          <div class="filter-grid">
            <input type="date" class="field-control" name="task-date" value="${esc(todayStr)}" aria-label="Fecha límite">
            <button type="submit" class="primary-btn compact">${ae('➕', 13)} Crear tarea</button>
          </div>
        </form>
        ${tasks.length ? tasks.map((t) => `
          <div class="v3526-list-row">
            <div style="min-width:0;flex:1">
              <b>${esc(t.titulo)}</b>
              <div style="font-size:11px;opacity:.74">${esc(t.empleadoNombre || 'Equipo')} · ${esc(t.fechaLimite || 'Sin fecha')}${t.horaLimite ? ` ${esc(t.horaLimite)}` : ''}${t.vencida ? ' · Vencida' : ''}</div>
            </div>
            <button type="button" class="secondary-btn compact" data-eco-task-done="${esc(t.id)}">${ae('✔️', 12)} Listo</button>
          </div>
        `).join('') : '<p class="soft-note">No hay tareas pendientes en esta sucursal.</p>'}
      </div>
    `;
  }

  host.innerHTML = `
    <div class="v3526-seg-tabs v3526-eco-tabs" role="tablist" aria-label="Vistas de Base de datos, Caja y CRM">
      ${subTabs.map(([id, em, label]) => `<button type="button" class="chip ${sub === id ? 'is-active' : ''}" data-eco-tab="${id}">${ae(em, 13)} ${label}</button>`).join('')}
    </div>
    ${sectionHtml}
  `;

  if (activeFocusedId === 'v3526ClientSearchInput') {
    const inp = host.querySelector('#v3526ClientSearchInput');
    if (inp) {
      inp.focus();
      if (typeof activeSelStart === 'number') inp.setSelectionRange(activeSelStart, activeSelEnd ?? activeSelStart);
    }
  }

  host.querySelectorAll('[data-eco-tab], [data-eco-sub]').forEach((b) => {
    b.onclick = () => {
      uiState.cajaCrmTab = b.dataset.ecoTab || b.dataset.ecoSub || 'overview';
      renderCajaCrmHost();
    };
  });
  host.querySelectorAll('[data-eco-action="refresh"]').forEach((b) => {
    b.onclick = async () => {
      await loadInbox(false);
      showToast('Base de datos, Caja y CRM actualizados.', false, '🔄');
    };
  });
  host.querySelectorAll('[data-eco-open-cuts]').forEach((b) => {
    b.onclick = () => openModal('cuts');
  });
  host.querySelector('#v3526ClientSearchInput')?.addEventListener('input', (ev) => {
    uiState.clientSearch = ev.target.value || '';
    renderCajaCrmHost();
  });
  host.querySelectorAll('[data-eco-quote-approve]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.ecoQuoteApprove;
      if (uiState.mode === 'demo') {
        const qItem = uiState.ecosystem?.crm?.recentQuotes?.find((x) => x.id === id);
        if (qItem) qItem.estado = 'aprobada';
        renderCajaCrmHost();
        showToast('Cotización aprobada en simulación Demo.', false, '✅');
        return;
      }
      try {
        await apiCall({ action: 'cotizacionEstado', id, estado: 'aprobada' });
        await loadInbox(false);
        showToast('Cotización aprobada en CRM.', false, '✅');
      } catch (err) { showToast(err.message || 'No se pudo aprobar la cotización.', true); }
    };
  });
  host.querySelectorAll('[data-eco-task-done]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.ecoTaskDone;
      if (uiState.mode === 'demo') {
        if (uiState.ecosystem?.crm?.pendingTasks) {
          uiState.ecosystem.crm.pendingTasks = uiState.ecosystem.crm.pendingTasks.filter((t) => t.id !== id);
          uiState.ecosystem.crm.tasksPending = uiState.ecosystem.crm.pendingTasks.length;
        }
        renderCajaCrmHost();
        showToast('Tarea completada en simulación Demo.', false, '✔️');
        return;
      }
      try {
        await apiCall({ action: 'tareaEstado', id, estado: 'completada' });
        await loadInbox(false);
        showToast('Tarea marcada como completada.', false, '✔️');
      } catch (err) { showToast(err.message || 'No se pudo completar la tarea.', true); }
    };
  });
  host.querySelector('#v3526NewTaskForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const titulo = String(fd.get('task-title') || '').trim();
    const fecha = String(fd.get('task-date') || '').trim() || null;
    if (!titulo) return;
    if (uiState.mode === 'demo') {
      uiState.ecosystem?.crm?.pendingTasks?.unshift({
        id: `demo-task-${Date.now()}`,
        titulo,
        fechaLimite: fecha,
        empleadoNombre: 'Erick',
        estado: 'pendiente',
        vencida: false
      });
      if (uiState.ecosystem?.crm) uiState.ecosystem.crm.tasksPending = uiState.ecosystem.crm.pendingTasks.length;
      renderCajaCrmHost();
      showToast('Tarea creada en simulación Demo.', false, '✅');
      return;
    }
    try {
      await apiCall({ action: 'tareaCrear', titulo, fecha, prioridad: 'normal' });
      ev.target.reset();
      await loadInbox(false);
      showToast('Tarea guardada en CRM de la sucursal.', false, '✅');
    } catch (err) { showToast(err.message || 'No se pudo crear la tarea.', true); }
  });
  host.querySelectorAll('[data-eco-client]').forEach((b) => {
    b.onclick = async () => {
      const cid = b.dataset.ecoClient;
      const cname = b.dataset.ecoClientName || 'Cliente';
      if (uiState.mode === 'demo') {
        const cl = uiState.ecosystem?.crm?.recentClients?.find((x) => x.id === cid) || { nombre: cname, saldoCentavos: 0, diasCredito: 15 };
        openModal('client-pos-detail', {
          nombre: cl.nombre,
          telefono: cl.telefono || '809-555-0000',
          balance_centavos: cl.saldoCentavos || 0,
          credit_days: cl.diasCredito || 0,
          compras: [{ fecha: new Date().toISOString().slice(0, 10), total_centavos: 480000, folio: 'DEMO-41', lineas: [{ nombre: 'Sesión / Impresión Demo', cantidad: 1 }] }]
        });
        return;
      }
      try {
        showToast(`Consultando historial POS de ${cname}…`, false, '🔍');
        const det = await apiCall({ action: 'posClienteDetalle', customer_id: cid });
        openModal('client-pos-detail', det);
      } catch (err) { showToast(err.message || 'No se pudo cargar el cliente.', true); }
    };
  });
}

function renderSettingsHost() {
  const host = document.getElementById('v3526SettingsTopHost');
  if (!host) return;

  const snap = appSnapshot();
  const isDark = snap.state?.theme === 'dark';
  const curPalette = getPalette();
  const gCfg = getGlassConfig();
  const isSolid = gCfg.visualStyle === 'solid';
  const banks = uiState.data?.fx?.banks || DEFAULT_BANKS;
  const fxConfirmedToday = Boolean(uiState.data?.fx?.confirmedToday ?? banks.some((b) => b.confirmedToday));
  const fxDate = uiState.data?.fx?.confirmedDate || new Date().toISOString().slice(0, 10);
  const cardLinks = Object.values(uiState.data?.cardLinks || {});
  const isIosBrowser = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone;
  const palettes = linker().PALETTES || [];

  host.innerHTML = `
    <div class="v3526-card">
      <div class="v3526-card-head">
        <h3>${ae('🎨', 17)} Estilo y Apariencia Apple</h3>
        <button type="button" class="secondary-btn compact" id="v3526ThemeQuickBtn">${ae(isDark ? '☀️' : '🌙', 14)} ${isDark ? 'Claro' : 'Oscuro'}</button>
      </div>

      <div class="v3526-solid-mode-tabs" role="tablist" aria-label="Estilo visual">
        <button type="button" class="chip ${!isSolid ? 'is-active' : ''}" data-visual-style="glass">${ae('✨', 13)} Estilo Glass y Orbes</button>
        <button type="button" class="chip ${isSolid ? 'is-active' : ''}" data-visual-style="solid">${ae('🎨', 13)} Colores Sólidos</button>
      </div>

      <div class="v3526-palette-grid">
        ${palettes.map((p) => `
          <button type="button" class="v3526-swatch ${curPalette === p.id ? 'active' : ''}" data-pal="${esc(p.id)}">
            <span class="v3526-swatch-dot" style="background:${esc(p.swatch)}"></span>
            <span>${esc(p.name)}</span>
          </button>
        `).join('')}
      </div>

      <div class="v3526-studio-group" style="margin-bottom:10px">
        <div class="v3526-slider-row">
          <div class="v3526-slider-head">
            <span>${ae('🖌️', 14)} Espectro personalizado Apple</span>
            <span class="v3526-slider-val" id="v3526AccentPreview"><i class="v3526-orb-dot-preview" style="background:${esc(getCustomAccent())};color:${esc(getCustomAccent())}"></i> ${esc(curPalette === 'custom' ? 'Activo' : 'Toca deslizador')}</span>
          </div>
          <input type="range" class="v3526-hue-slider" id="v3526AccentHue" min="0" max="360" value="${Number(gCfg.accentHue || 218)}" aria-label="Color principal en espectro Apple">
        </div>
      </div>

      <div id="v3526SolidBgGroup" class="v3526-studio-group" ${isSolid ? '' : 'hidden'} style="display:${isSolid ? 'grid' : 'none'}">
        <div class="v3526-slider-head">
          <span>${ae('🎨', 14)} Fondo de pantalla sólido</span>
          <span class="v3526-slider-val">${isDark ? 'Modo Oscuro' : 'Modo Claro'}</span>
        </div>
        <div class="v3526-palette-grid">
          ${SOLID_BG_PRESETS.map((sp) => {
            const dotBg = isDark ? sp.darkBg : sp.lightBg;
            const dotSurf = isDark ? sp.darkSurface : sp.lightSurface;
            return `
              <button type="button" class="v3526-swatch ${gCfg.solidBg === sp.id ? 'active' : ''}" data-solid-bg="${esc(sp.id)}">
                <span class="v3526-swatch-dot" style="background:linear-gradient(135deg,${esc(dotBg)},${esc(dotSurf)});border:1px solid rgba(148,163,184,.4)"></span>
                <span>${esc(sp.name)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <div id="v3526GlassOrbGroup" class="v3526-studio-group" ${!isSolid ? '' : 'hidden'} style="display:${!isSolid ? 'grid' : 'none'}">
        <div class="v3526-slider-row" style="margin-top:4px">
          <div class="v3526-slider-head">
            <span>${ae('✨', 14)} Círculos Glass de fondo</span>
            <span class="v3526-slider-val" id="v3526OrbModeLabel">${gCfg.orbMode === 'custom' ? 'Personalizados' : 'Con el tema'}</span>
          </div>
          <div class="v3526-orb-mode-row">
            <button type="button" class="chip ${gCfg.orbMode !== 'custom' ? 'is-active' : ''}" data-orb-mode="sync">Sincronizados</button>
            <button type="button" class="chip ${gCfg.orbMode === 'custom' ? 'is-active' : ''}" data-orb-mode="custom">Colores por círculo</button>
            <button type="button" class="chip" id="v3526GlassResetBtn">Restaurar</button>
          </div>
        </div>

        <div id="v3526CustomOrbRows" ${gCfg.orbMode === 'custom' ? '' : 'hidden'} style="display:${gCfg.orbMode === 'custom' ? 'grid' : 'none'};gap:8px">
          ${[0, 1, 2].map((idx) => `
            <div class="v3526-slider-row">
              <div class="v3526-slider-head">
                <span>Círculo ${idx + 1}</span>
                <span class="v3526-slider-val"><i class="v3526-orb-dot-preview" id="v3526OrbDot${idx}" style="background:${esc(gCfg.orbColors[idx])};color:${esc(gCfg.orbColors[idx])}"></i> ${Number(gCfg.orbHues[idx] || 0)}°</span>
              </div>
              <input type="range" class="v3526-hue-slider" data-orb-hue="${idx}" min="0" max="360" value="${Number(gCfg.orbHues[idx] || 0)}" aria-label="Color círculo ${idx + 1}">
            </div>
          `).join('')}
        </div>

        <div class="v3526-slider-row">
          <div class="v3526-slider-head"><span>Desenfoque Glass</span><span class="v3526-slider-val" id="v3526BlurVal">${Number(gCfg.orbBlur || 52)} px</span></div>
          <input type="range" class="v3526-range" id="v3526OrbBlur" min="16" max="92" value="${Number(gCfg.orbBlur || 52)}">
        </div>
        <div class="v3526-slider-row">
          <div class="v3526-slider-head"><span>Intensidad de luces</span><span class="v3526-slider-val" id="v3526AlphaVal">${Number(gCfg.orbOpacity || 78)}%</span></div>
          <input type="range" class="v3526-range" id="v3526OrbOpacity" min="15" max="100" value="${Number(gCfg.orbOpacity || 78)}">
        </div>
        <div class="v3526-slider-row">
          <div class="v3526-slider-head"><span>Tamaño y velocidad de rebote</span><span class="v3526-slider-val" id="v3526ScaleVal">${Number(gCfg.orbScale || 100)}% · ${Number(gCfg.orbSpeed || 1).toFixed(1)}×</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <input type="range" class="v3526-range" id="v3526OrbScale" min="55" max="150" value="${Number(gCfg.orbScale || 100)}" aria-label="Tamaño de círculos">
            <input type="range" class="v3526-range" id="v3526OrbSpeed" min="0.4" max="2.2" step="0.1" value="${Number(gCfg.orbSpeed || 1)}" aria-label="Velocidad de círculos">
          </div>
        </div>
        <div class="v3526-slider-row">
          <div class="v3526-slider-head"><span>Translucidez de paneles</span><span class="v3526-slider-val" id="v3526GlassVal">${Number(gCfg.glassAlpha || 54)}%</span></div>
          <input type="range" class="v3526-range" id="v3526GlassAlpha" min="20" max="85" value="${Number(gCfg.glassAlpha || 54)}">
        </div>
      </div>
    </div>

    <div class="v3526-card">
      <div class="v3526-card-head">
        <h3>${ae('🔔', 17)} Alertas Push en iPhone</h3>
        <span class="v3526-tag ${uiState.pushSubscribed ? 'ok' : 'warn'}">${uiState.pushSubscribed ? 'Activas' : 'Pendiente'}</span>
      </div>
      ${isIosBrowser ? '<div class="notice warning" style="margin-bottom:8px">En iPhone, toca <b>Compartir → Añadir a pantalla de inicio</b> y abre la app desde el ícono para activar avisos nativos.</div>' : ''}
      <p class="soft-note" style="margin:0 0 8px">Recibe avisos de cortes TPV, consumos en USD, Códigos Cash y transferencias sin WhatsApp.</p>
      <div class="v3526-btn-row">
        <button type="button" class="primary-btn compact" id="v3526PushEnableBtn" ${uiState.pushBusy ? 'disabled' : ''}>${ae(uiState.pushSubscribed ? '🔄' : '🔔', 14)} ${uiState.pushSubscribed ? 'Renovar Push' : 'Activar alertas'}</button>
        <button type="button" class="secondary-btn compact" id="v3526PushTestBtn" ${uiState.pushBusy ? 'disabled' : ''}>${ae('🧪', 14)} Probar alerta</button>
      </div>
    </div>

    <div class="v3526-card">
      <div class="v3526-card-head">
        <h3>${ae('💱', 17)} Tasas USD del Día</h3>
        <span class="v3526-tag ${fxConfirmedToday ? 'ok' : 'warn'}">${fxConfirmedToday ? `Confirmado ${esc(fxDate)}` : 'Verificando web'}</span>
      </div>
      <p class="soft-note" style="margin:0 0 8px">Al confirmar cualquier movimiento en USD, la app investiga automáticamente la URL del banco vinculado de la cuenta para aplicar la tasa del día.</p>
      <div>
        ${banks.map((b) => `
          <div class="v3526-list-row" style="padding:7px 0">
            <div>
              <div style="font-size:12px;font-weight:700">${ae('🏦', 14)} ${esc(b.label)}</div>
              <div style="font-size:11px;opacity:.7">${esc(String(b.bankUrl || getBankUrl(b.key)).replace(/^https?:\/\//, '').replace(/\/$/, ''))}</div>
            </div>
            <div style="text-align:right;font-variant-numeric:tabular-nums">
              <div style="font-size:13px;font-weight:750">Venta RD$${Number(b.rateSell).toFixed(2)}</div>
              ${b.usdCompra ? `<div style="font-size:11px;opacity:.7">Compra RD$${Number(b.usdCompra).toFixed(2)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="v3526-btn-row">
        <button type="button" class="secondary-btn compact" id="v3526FxRefreshBtn">${ae('🔄', 13)} Confirmar tasas en web ahora</button>
      </div>
      ${cardLinks.length ? `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:700;margin-bottom:6px">${ae('⚡', 14)} Auto-débito digital por tarjeta vinculada</div>
          ${cardLinks.map((cl) => `
            <div class="v3526-list-row" style="align-items:center">
              <div style="font-size:12px">
                <b>${esc(cl.accountName || `Tarjeta ****${cl.cardLast4 || cl.last4 || ''}`)}</b>
                <div style="opacity:.72">Débito automático al detectar compras digitales</div>
              </div>
              <button type="button" class="switch ${cl.auto_debit_digital ? 'on' : ''}" role="switch" aria-checked="${cl.auto_debit_digital ? 'true' : 'false'}" data-autodebit="${esc(cl.id || cl.cardLast4 || cl.last4 || '')}"><span></span></button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  host.querySelector('#v3526ThemeQuickBtn').onclick = () => {
    window.DcarelaFinanzasActions?.setTheme?.(isDark ? 'light' : 'dark');
    requestAnimationFrame(() => applyGlassConfig({}, false));
  };
  host.querySelectorAll('[data-visual-style]').forEach((b) => {
    b.onclick = () => {
      const styleMode = b.dataset.visualStyle === 'solid' ? 'solid' : 'glass';
      applyGlassConfig({ visualStyle: styleMode }, true);
      renderSettingsHost();
      showToast(styleMode === 'solid' ? 'Estilo Colores Sólidos activado.' : 'Estilo Glass y Orbes activado.', false, styleMode === 'solid' ? '🎨' : '✨');
    };
  });
  host.querySelectorAll('[data-solid-bg]').forEach((b) => {
    b.onclick = () => {
      applyGlassConfig({ visualStyle: 'solid', solidBg: b.dataset.solidBg }, true);
      renderSettingsHost();
    };
  });
  host.querySelectorAll('[data-pal]').forEach((b) => {
    b.onclick = () => applyPalette(b.dataset.pal);
  });
  host.querySelector('#v3526AccentHue').oninput = (ev) => {
    const hue = Number(ev.target.value || 0);
    const hex = hslToHex(hue, 84, isDark ? 60 : 50);
    applyGlassConfig({ accentHue: hue }, true);
    applyPalette('custom', hex, true);
    const prev = host.querySelector('#v3526AccentPreview');
    if (prev) prev.innerHTML = `<i class="v3526-orb-dot-preview" style="background:${hex};color:${hex}"></i> ${hue}° · Activo`;
  };
  host.querySelectorAll('[data-orb-mode]').forEach((b) => {
    b.onclick = () => {
      const mode = b.dataset.orbMode;
      const cfg = applyGlassConfig({ orbMode: mode }, true);
      host.querySelectorAll('[data-orb-mode]').forEach((x) => x.classList.toggle('is-active', x.dataset.orbMode === mode));
      const rowsBox = host.querySelector('#v3526CustomOrbRows');
      if (rowsBox) {
        rowsBox.hidden = mode !== 'custom';
        rowsBox.style.display = mode === 'custom' ? 'grid' : 'none';
      }
      const modeLbl = host.querySelector('#v3526OrbModeLabel');
      if (modeLbl) modeLbl.textContent = cfg.orbMode === 'custom' ? 'Personalizados' : 'Con el tema';
    };
  });
  host.querySelectorAll('[data-orb-hue]').forEach((sl) => {
    sl.oninput = () => {
      const idx = Number(sl.dataset.orbHue || 0);
      const cur = getGlassConfig();
      const hues = [...cur.orbHues];
      hues[idx] = Number(sl.value || 0);
      const next = applyGlassConfig({ orbMode: 'custom', orbHues: hues }, true);
      const dot = host.querySelector(`#v3526OrbDot${idx}`);
      if (dot) {
        dot.style.background = next.orbColors[idx];
        dot.style.color = next.orbColors[idx];
        if (dot.parentElement) dot.parentElement.lastChild.textContent = ` ${hues[idx]}°`;
      }
    };
  });
  host.querySelector('#v3526OrbBlur').oninput = (ev) => {
    const val = Number(ev.target.value || 52);
    applyGlassConfig({ orbBlur: val }, true);
    const lbl = host.querySelector('#v3526BlurVal');
    if (lbl) lbl.textContent = `${val} px`;
  };
  host.querySelector('#v3526OrbOpacity').oninput = (ev) => {
    const val = Number(ev.target.value || 78);
    applyGlassConfig({ orbOpacity: val }, true);
    const lbl = host.querySelector('#v3526AlphaVal');
    if (lbl) lbl.textContent = `${val}%`;
  };
  const updateScaleSpeed = () => {
    const sc = Number(host.querySelector('#v3526OrbScale')?.value || 100);
    const sp = Number(host.querySelector('#v3526OrbSpeed')?.value || 1);
    applyGlassConfig({ orbScale: sc, orbSpeed: sp }, true);
    const lbl = host.querySelector('#v3526ScaleVal');
    if (lbl) lbl.textContent = `${sc}% · ${sp.toFixed(1)}×`;
  };
  host.querySelector('#v3526OrbScale').oninput = updateScaleSpeed;
  host.querySelector('#v3526OrbSpeed').oninput = updateScaleSpeed;
  host.querySelector('#v3526GlassAlpha').oninput = (ev) => {
    const val = Number(ev.target.value || 54);
    applyGlassConfig({ glassAlpha: val }, true);
    const lbl = host.querySelector('#v3526GlassVal');
    if (lbl) lbl.textContent = `${val}%`;
  };
  host.querySelector('#v3526GlassResetBtn').onclick = () => {
    applyGlassConfig({ ...DEFAULT_GLASS_CFG, orbHues: [...DEFAULT_GLASS_CFG.orbHues], orbColors: [...DEFAULT_GLASS_CFG.orbColors] }, true);
    renderSettingsHost();
    showToast('Luces y vidrio restaurados.', false, '✨');
  };
  host.querySelector('#v3526FxRefreshBtn').onclick = async () => {
    await loadInbox(true);
    showToast('Tasas USD confirmadas para hoy.', false, '💱');
  };
  host.querySelector('#v3526PushEnableBtn').onclick = () => handleEnablePush();
  host.querySelector('#v3526PushTestBtn').onclick = () => handleTestPush();
  host.querySelectorAll('[data-autodebit]').forEach((b) => {
    b.onclick = () => handleToggleAutoDebit(b.dataset.autodebit);
  });
}

/* ==========================================================================
   Modal Renderers & Interactive Flows
   ========================================================================== */

function investigateBankRateForMovement(bankKey, isFxMovement = true) {
  const rateObj = getActiveBankRate(bankKey);
  const resolvedKey = String(bankKey || rateObj?.key || '').trim().toLowerCase();
  const bankUrl = rateObj?.bankUrl || getBankUrl(resolvedKey);
  const shortUrl = String(bankUrl).replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!isFxMovement) {
    return { ok: true, bankKey: resolvedKey, label: rateObj?.label || '', rateSell: 1, bankUrl, shortUrl };
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (rateObj && typeof rateObj === 'object') {
    rateObj.confirmedToday = true;
    rateObj.confirmedDate = todayStr;
    rateObj.bankUrl = bankUrl;
  }
  if (uiState.data?.fx) {
    uiState.data.fx.confirmedToday = true;
    uiState.data.fx.confirmedDate = todayStr;
  }
  return {
    ok: true,
    bankKey: resolvedKey,
    label: rateObj?.label || 'Promedio bancario RD',
    rateSell: Number(rateObj?.rateSell || 61.25),
    bankUrl,
    shortUrl
  };
}

function renderModalRoot() {
  document.getElementById('v3526ModalRoot')?.remove();
  if (!uiState.activeModal) return;

  const { type, payload } = uiState.activeModal;
  const data = uiState.data || normalizeInbox(linker().buildDemoInboxData());
  const snap = appSnapshot();
  const expenseCats = (snap.categories || []).filter((c) => c.tipo === 'gasto');
  const allAccounts = (snap.accounts || []).filter((a) => a.estado !== 'eliminada');

  let titleHtml = '';
  let titleText = '';
  let bodyHtml = '';

  if (type === 'alerts-hub') {
    titleText = 'Centro de avisos financieros';
    titleHtml = `${ae('🔔', 18)} <span>Centro de avisos financieros</span>`;
    const c = data.counts || {};
    bodyHtml = `
      <div class="v3526-list-row"><div><b>${ae('🧾', 14)} Cortes TPV y Caja</b><div style="font-size:12px;opacity:.75">Cuadres pendientes de validar</div></div><button type="button" class="primary-btn" data-jump-modal="cuts">${c.cuts || 0} revisar</button></div>
      <div class="v3526-list-row"><div><b>${ae('💳', 14)} Consumos y compras USD</b><div style="font-size:12px;opacity:.75">Tasa web del banco vinculado + auto-débito</div></div><button type="button" class="primary-btn" data-jump-modal="consumptions">${c.consumptions || 0} revisar</button></div>
      <div class="v3526-list-row"><div><b>${ae('⏰', 14)} Alertas de pagos</b><div style="font-size:12px;opacity:.75">Vencimientos de hoy y próximos</div></div><button type="button" class="primary-btn" data-jump-modal="alerts">${c.paymentAlerts || 0} ver</button></div>
      <div class="v3526-list-row"><div><b>${ae('✉️', 14)} Correos y Códigos Cash</b><div style="font-size:12px;opacity:.75">Transferencias y retiros detectados</div></div><button type="button" class="secondary-btn" data-jump-route="mail">${c.mailAttention || 0} abrir</button></div>
      <div class="v3526-list-row"><div><b>${ae('📑', 14)} Libros Fiscales y Hermes</b><div style="font-size:12px;opacity:.75">Compras 606 y Ventas 607</div></div><button type="button" class="secondary-btn" data-jump-route="books">${c.fiscalReview || 0} abrir</button></div>
    `;
  } else if (type === 'cuts') {
    titleText = 'Confirmación de Cortes';
    titleHtml = `${ae('🧾', 18)} <span>Confirmación de Cortes</span>`;
    const pendingCuts = data.cuts.filter((x) => x.status !== 'validated' && x.status !== 'confirmed');
    bodyHtml = pendingCuts.length ? pendingCuts.map((cut) => {
      const review = assessCut(cut, snap.business);
      return `
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div style="font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px">${ae(cut.kind === 'cash_cut' ? '💵' : '🖥️', 16)} ${esc(cut.title)}</div>
        <div style="font-size:12px;opacity:.78;margin:4px 0">${esc(cut.summary)} · ${esc(cut.date)}${cut.shift ? ` · ${esc(cut.shift)}` : ''}</div>
        <div class="info-line"><span>Esperado</span><strong>${fmtMoney(cut.systemCentavos, cut.currency)}</strong></div>
        <div class="info-line"><span>Contado / Reportado</span><strong>${fmtMoney(cut.reportedCentavos, cut.currency)}</strong></div>
        <div class="info-line"><span>Diferencia</span><strong class="${review.difference ? 'expense-text' : ''}">${review.consistent ? fmtMoney(review.difference, cut.currency) : 'Requiere revisión'}</strong></div>
        <div class="v3526-btn-row">
          <button type="button" class="secondary-btn" data-review-cut="${esc(cut.id)}">Revisar corte</button>
        </div>
      </div>
    `; }).join('') : `<div class="notice">No hay cortes pendientes de revisión en esta sucursal.</div>`;
  } else if (type === 'cut-review') {
    const cut = data.cuts.find((x) => x.id === payload?.id);
    if (!cut) { closeModal(); return; }
    const review = assessCut(cut, snap.business);
    titleText = 'Revisar corte antes de confirmar';
    titleHtml = '<span>Revisar corte</span>';
    bodyHtml = `
      <div class="card v3526-cut-review">
        <b>${esc(cut.title)} · ${esc(cut.date)}${cut.shift ? ` · ${esc(cut.shift)}` : ''}</b>
        <p class="soft-note">${esc(cut.summary)}${cut.cashier ? ` · ${esc(cut.cashier)}` : ''}</p>
        <div class="info-line"><span>Esperado por Caja</span><strong>${fmtMoney(cut.systemCentavos, cut.currency)}</strong></div>
        <div class="info-line"><span>${cut.kind === 'cash_cut' ? 'Efectivo contado' : 'Reportado por terminal'}</span><strong>${fmtMoney(cut.reportedCentavos, cut.currency)}</strong></div>
        <div class="info-line"><span>Diferencia</span><strong class="${review.difference ? 'expense-text' : ''}">${review.consistent ? fmtMoney(review.difference, cut.currency) : 'Datos inconsistentes'}</strong></div>
        ${cut.kind === 'cash_cut' ? `
          <div class="info-line"><span>Ventas en efectivo</span><strong>${fmtMoney(cut.salesCashCentavos, cut.currency)}</strong></div>
          <div class="info-line"><span>Abonos en efectivo</span><strong>${fmtMoney(cut.depositsCashCentavos, cut.currency)}</strong></div>
          <div class="info-line"><span>Entradas / Salidas</span><strong>${fmtMoney(cut.entriesCentavos, cut.currency)} / ${fmtMoney(cut.exitsCentavos, cut.currency)}</strong></div>
          <div class="info-line"><span>Fondo que queda en Caja Chica</span><strong>${fmtMoney(cut.pettyCashRemainingCentavos, cut.currency)}</strong></div>` : ''}
        ${cut.kind === 'cash_cut' ? `<div class="info-line"><span>Transferencia interna al confirmar</span><strong>${fmtMoney(review.transfer, cut.currency)}</strong></div>` : ''}
        ${review.canConfirm ? (cut.kind === 'cash_cut'
          ? '<p class="soft-note">Al confirmar, se transferirá el importe indicado de Caja Chica a Efectivo una sola vez.</p>'
          : '<p class="soft-note">Al confirmar, se validará el reporte de la terminal. No se moverá dinero.</p>')
          : `<p class="soft-note expense-text">${review.canReport ? 'Este corte requiere revisión. Reportar la diferencia no moverá dinero.' : 'Este corte ya está enviado a revisión. Actualiza la bandeja para ver su estado.'}</p>`}
        <label class="v3526-cut-check"><input type="checkbox" id="v3526CutReviewed"> Revisé la fecha, el importe reportado, la diferencia${cut.kind === 'cash_cut' ? ' y la transferencia interna' : ''}.</label>
        <label class="v3526-cut-note-label" for="v3526CutNote">Si reportas una diferencia, explica el motivo</label>
        <textarea id="v3526CutNote" class="field-control" rows="2" maxlength="300" placeholder="Explica lo que falta verificar"></textarea>
        <div class="v3526-btn-row">
          ${review.canConfirm ? `<button type="button" class="primary-btn" data-submit-cut="confirm" data-cut-id="${esc(cut.id)}">Confirmar corte</button>` : ''}
          ${review.canReport ? `<button type="button" class="secondary-btn" data-submit-cut="mismatch" data-cut-id="${esc(cut.id)}">Reportar diferencia</button>` : ''}
          <button type="button" class="secondary-btn" data-back-cuts="1">Volver</button>
        </div>
      </div>`;
  } else if (type === 'consumptions') {
    titleText = 'Confirmar consumos bancarios';
    titleHtml = `${ae('💳', 18)} <span>Confirmar consumos bancarios</span>`;
    const pending = data.consumptions.filter((x) => x.status !== 'registered' && x.status !== 'rejected');
    bodyHtml = pending.length ? pending.map((item) => {
      const matchedAcc = allAccounts.find((a) => a.id === item.accountId)
        || allAccounts.find((a) => item.bankKey && inferBankKeyFromText(a.nombre) === item.bankKey)
        || allAccounts[0];
      const resolved = resolveLinkedAccountBank({
        accountId: matchedAcc?.id || item.accountId,
        cardLast4: item.cardLast4,
        bankKey: item.bankKey || matchedAcc?.bankKey || '',
        bankName: item.bankName || matchedAcc?.nombre || ''
      }, allAccounts, data.cardLinks);
      const bankKey = resolved.bankKey || '';
      const bankUrl = resolved.bankUrl || getBankUrl(bankKey);
      const shortUrl = String(bankUrl).replace(/^https?:\/\//, '').replace(/\/$/, '');
      const rateObj = getActiveBankRate(bankKey);
      const isUsd = item.currency === 'USD';
      const dopMinor = isUsd ? computeDopCentavos(item.originalCentavos, 'USD', bankKey) : item.originalCentavos;
      const autoCat = linker().resolveClientExpenseCategory({ descripcion: `${item.merchant} ${item.suggestedCategoryName}` }, expenseCats);
      const chosenCatId = item.suggestedCategoryId || autoCat.categoria_id || '';
      return `
        <div class="card v3526-cons-card" data-cid="${esc(item.id)}" data-currency="${esc(item.currency)}" data-amount="${Number(item.originalCentavos || 0)}" data-bank-key="${esc(bankKey)}" data-bank-url="${esc(bankUrl)}" style="padding:12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <div>
              <div style="font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px">${ae(linker().emojiForMerchant(item.merchant), 16)} ${esc(item.merchant)}</div>
              <div style="font-size:12px;opacity:.78">${esc(resolved.bankLabel || item.bankName)}${item.cardLast4 ? ` · ****${esc(item.cardLast4)}` : ''} · ${esc(item.date)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:15px;font-weight:700">${fmtMoney(item.originalCentavos, item.currency)}</div>
              ${item.isDigital ? `<span class="v3526-tag">${ae('🌐', 12)} Digital / App</span>` : ''}
            </div>
          </div>
          ${isUsd ? `
            <div class="notice v3526-cons-rate-box" style="margin:8px 0">
              <div style="font-size:12px;opacity:.86">Banco vinculado: <b class="v3526-cons-bank-label">${esc(rateObj.label)}</b> · Tasa <b class="v3526-cons-rate-val">RD$${Number(rateObj.rateSell).toFixed(2)}</b></div>
              <div style="font-size:11px;opacity:.68">URL del día: <span class="v3526-cons-bank-url">${esc(shortUrl)}</span> (se verifica al confirmar)</div>
              <div style="margin-top:3px">Débito calculado: <b class="v3526-cons-dop">${fmtMoney(dopMinor, 'DOP')}</b></div>
            </div>
          ` : ''}
          <label class="field-label">Cuenta / Tarjeta a debitar</label>
          <select class="field-select v3526-cons-acc">
            ${allAccounts.map((a) => `<option value="${esc(a.id)}" ${matchedAcc?.id === a.id ? 'selected' : ''}>${esc(a.nombre)} (${esc(a.moneda)})</option>`).join('')}
          </select>
          <label class="field-label">Categoría</label>
          <select class="field-select v3526-cons-cat">
            ${expenseCats.map((c) => `<option value="${esc(c.id)}" ${chosenCatId === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
          </select>
          ${item.isDigital ? `
            <label class="check-line" style="margin-top:8px">
              <input type="checkbox" class="v3526-cons-autodebit" checked>
              <span>${ae('⚡', 13)} Auto-debitar futuras compras digitales de esta tarjeta (Google / Apps Script)</span>
            </label>
          ` : ''}
          <div class="v3526-btn-row">
            <button type="button" class="primary-btn" data-cons-accept="${esc(item.id)}">${ae('✅', 14)} Confirmar y debitar ${isUsd ? '<span class="v3526-cons-btn-dop">' + fmtMoney(dopMinor, 'DOP') + '</span>' : fmtMoney(dopMinor, 'DOP')}</button>
            <button type="button" class="secondary-btn" data-cons-reject="${esc(item.id)}">Omitir</button>
          </div>
        </div>
      `;
    }).join('') : `<div class="notice">${ae('✅', 14)} No hay consumos bancarios pendientes de confirmar.</div>`;
  } else if (type === 'alerts') {
    titleText = 'Alertas de pago';
    titleHtml = `${ae('⏰', 18)} <span>Alertas de pago</span>`;
    bodyHtml = data.paymentAlerts.length ? data.paymentAlerts.map((al) => `
      <div class="v3526-list-row">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:5px">${ae(al.severity === 'vencido' ? '🚨' : '⏰', 14)} ${esc(al.title)}</div>
          <div style="font-size:12px;opacity:.75">Vence: ${esc(al.dueDate)} · ${esc(al.categoryName)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:700">${fmtMoney(al.amountCentavos, al.currency)}</div>
          <button type="button" class="primary-btn" style="padding:5px 9px;font-size:11px;margin-top:4px" data-pay-alert="${esc(al.id)}">${ae('💸', 12)} Pagar</button>
        </div>
      </div>
    `).join('') : `<div class="notice">${ae('✅', 14)} No hay pagos urgentes pendientes.</div>`;
  } else if (type === 'fiscal-validate' && payload?.item) {
    const it = payload.item;
    const is607 = payload.kind === '607';
    titleText = is607 ? 'Validar Venta 607 / Hermes' : 'Corregir y Validar Compra 606';
    titleHtml = `${ae(is607 ? '🧾' : '🛒', 18)} <span>${esc(titleText)}</span>`;
    bodyHtml = `
      <form id="v3526FiscalForm">
        <label class="field-label" style="margin-top:0">${is607 ? 'Cliente' : 'Proveedor'}</label>
        <input class="field-control" name="f-party" required value="${esc(is607 ? it.cliente : it.proveedor)}">
        <div class="filter-grid">
          <div><label class="field-label">NCF / e-CF</label><input class="field-control" name="f-ncf" required value="${esc(it.ncf)}"></div>
          <div><label class="field-label">RNC</label><input class="field-control" name="f-rnc" value="${esc(is607 ? it.rncCliente : it.rnc)}"></div>
        </div>
        <div class="filter-grid">
          <div><label class="field-label">Fecha</label><input class="field-control" type="date" name="f-date" value="${esc(it.fecha)}"></div>
          <div><label class="field-label">Monto RD$</label><input class="field-control" type="number" step="0.01" name="f-amount" value="${(Number(it.montoCentavos || 0) / 100).toFixed(2)}"></div>
        </div>
        <div class="v3526-btn-row">
          <button type="submit" class="primary-btn">${ae('✅', 14)} Validar en libro ${is607 ? '607' : '606'}</button>
          <button type="button" class="secondary-btn" id="v3526FiscalVoidBtn">Descartar</button>
        </div>
      </form>
    `;
  } else if (type === 'mail-add') {
    titleText = 'Conectar otra cuenta Gmail';
    titleHtml = `${ae('✉️', 18)} <span>Conectar otra cuenta Gmail</span>`;
    bodyHtml = `
      <form id="v3526MailAddForm">
        <label class="field-label" style="margin-top:0">Correo Gmail</label>
        <input class="field-control" type="email" name="m-email" required placeholder="tucorreo@gmail.com">
        <label class="field-label">Etiqueta descriptiva</label>
        <input class="field-control" name="m-label" placeholder="Ej. Cuenta personal · Transferencias">
        <label class="check-line"><input type="checkbox" name="m-cash" checked><span>Detectar Códigos Cash y retiros</span></label>
        <label class="check-line"><input type="checkbox" name="m-trans" checked><span>Detectar Transferencias (LBTR, ACH, Toke)</span></label>
        <div class="v3526-btn-row">
          <button type="submit" class="primary-btn full">Guardar cuenta y generar script .gs</button>
        </div>
      </form>
    `;
  } else if (type === 'mail-script' && payload) {
    titleText = `Script Gmail (${payload.email})`;
    titleHtml = `${ae('📋', 18)} <span>${esc(titleText)}</span>`;
    bodyHtml = `
      <div class="notice">En el Gmail de <b>${esc(payload.email)}</b>, abre <b>script.google.com</b>, pega este código y ejecuta <code>instala()</code>.</div>
      <textarea class="v3526-code-box" readonly id="v3526GsCode">${esc(payload.script || '')}</textarea>
      <div class="v3526-btn-row">
        <button type="button" class="primary-btn full" id="v3526CopyGsBtn">${ae('📋', 14)} Copiar código completo</button>
      </div>
    `;
  } else if (type === 'mail-register' && payload) {
    const m = payload;
    const isCash = m.kind === 'retiro_codigo_cash';
    const isIn = m.kind.includes('entrada') || m.kind.includes('recibida');
    const titleEmoji = isCash ? '🏧' : isIn ? '📥' : '🔁';
    titleText = isCash ? 'Anotar Código Cash' : isIn ? 'Anotar Transferencia Recibida' : 'Anotar Transferencia';
    titleHtml = `${ae(titleEmoji, 18)} <span>${esc(titleText)}</span>`;
    const mailCurrency = String(m.currency || 'DOP').toUpperCase();
    const nonCashAccounts = allAccounts.filter((a) => !isCashFinAccount(a));
    const bankPool = isCash
      ? (nonCashAccounts.filter((a) => a.tipo === 'banco').length ? nonCashAccounts.filter((a) => a.tipo === 'banco') : nonCashAccounts)
      : nonCashAccounts;
    const curBankPool = bankPool.filter((a) => String(a.moneda || 'DOP').toUpperCase() === mailCurrency);
    const accPool = curBankPool.length ? curBankPool : bankPool;
    const linkedAcc = findLinkedBankAccountForMail(m, accPool.length ? accPool : nonCashAccounts);
    const mBankKey = inferBankKeyFromText(`${linkedAcc?.nombre || ''} ${m.bank || ''} ${m.subject || ''}`);
    const strictMatches = mBankKey
      ? accPool.filter((a) => (a.bankKey || inferBankKeyFromText(a.nombre)) === mBankKey || a.id === linkedAcc?.id)
      : (linkedAcc ? [linkedAcc] : accPool);
    const finalBankOptions = strictMatches.length ? strictMatches : accPool;
    const cashDestPool = (() => {
      const sameCur = allAccounts.filter((a) => isCashFinAccount(a) && String(a.moneda || 'DOP').toUpperCase() === mailCurrency);
      return sameCur.length ? sameCur : allAccounts.filter((a) => isCashFinAccount(a));
    })();
    const modalCats = (snap.categories || []).filter((c) => c.tipo === (isIn ? 'ingreso' : 'gasto'));
    const lockedSingleBank = finalBankOptions.length === 1 ? finalBankOptions[0] : null;
    bodyHtml = `
      <div class="card" style="padding:11px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700">${esc(m.subject)}</div>
        <div style="font-size:12px;opacity:.78">${esc(m.bank)} · ${fmtMoney(m.amountCentavos, m.currency)} · ${esc(m.date)}</div>
      </div>
      <form id="v3526MailRegForm">
        <label class="field-label" style="margin-top:0">Tipo de registro</label>
        <select class="field-select" name="mr-mode" id="v3526MrMode">
          ${isCash ? '<option value="transfer_cash">Retiro Código Cash: Banco → Caja / Efectivo</option>' : ''}
          ${isCash ? '' : `<option value="${isIn ? 'ingreso' : 'gasto'}">${isIn ? 'Registrar como Ingreso en banco' : 'Registrar como Gasto desde banco'}</option>`}
          ${isCash ? '<option value="gasto">Registrar retiro como Gasto bancario</option>' : ''}
          <option value="mark_registered">Solo marcar como ya anotado</option>
        </select>
        <label class="field-label">${lockedSingleBank ? 'Banco vinculado (bloqueado)' : (isCash ? 'Banco origen (sin efectivo)' : 'Cuenta bancaria vinculada')}</label>
        ${lockedSingleBank ? `
          <div class="v3526-locked-field">
            <span>${ae('🏦', 14)} <b>${esc(lockedSingleBank.nombre)}</b> (${esc(lockedSingleBank.moneda || 'DOP')})</span>
            <span class="v3526-tag ok">Vinculada</span>
          </div>
          <input type="hidden" name="mr-acc" value="${esc(lockedSingleBank.id)}">
        ` : finalBankOptions.length ? `
          <select class="field-select" name="mr-acc">
            ${finalBankOptions.map((a) => `<option value="${esc(a.id)}" ${linkedAcc?.id === a.id ? 'selected' : ''}>${esc(a.nombre)} (${esc(a.moneda || 'DOP')})</option>`).join('')}
          </select>
        ` : '<div class="notice warning">No se encontró una cuenta bancaria en esta sucursal. Crea o vincula el banco antes de anotar.</div>'}
        ${isCash ? `
          <div id="v3526MrDestWrap">
            <label class="field-label">Caja / Efectivo destino</label>
            ${cashDestPool.length ? `
              <select class="field-select" name="mr-dest">
                ${cashDestPool.map((a) => `<option value="${esc(a.id)}">${esc(a.nombre)} (${esc(a.moneda || 'DOP')})</option>`).join('')}
              </select>
            ` : '<div class="notice warning">No hay caja de efectivo activa en esta sucursal.</div>'}
          </div>
        ` : ''}
        <div id="v3526MrCatWrap" ${isCash ? 'style="display:none"' : ''}>
          <label class="field-label">${isIn ? 'Categoría de ingreso' : 'Categoría de gasto'}</label>
          <select class="field-select" name="mr-cat">
            ${(modalCats.length ? modalCats : expenseCats).map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="v3526-btn-row">
          <button type="submit" class="primary-btn full" ${!finalBankOptions.length || (isCash && !cashDestPool.length) ? 'disabled' : ''}>Confirmar y anotar (${fmtMoney(m.amountCentavos, m.currency)})</button>
        </div>
      </form>
    `;
  } else if (type === 'client-pos-detail' && payload) {
    titleText = `Cliente POS · ${payload.nombre || 'Detalle'}`;
    titleHtml = `${ae('👥', 18)} <span>${esc(payload.nombre || 'Cliente POS')}</span>`;
    const compras = Array.isArray(payload.compras) ? payload.compras : [];
    bodyHtml = `
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div class="info-line"><span>Teléfono</span><strong>${esc(payload.telefono || 'Sin teléfono')}</strong></div>
        <div class="info-line"><span>Saldo por cobrar</span><strong class="${Number(payload.balance_centavos || 0) > 0 ? 'expense-text' : ''}">${fmtMoney(payload.balance_centavos || 0, 'DOP')}</strong></div>
        <div class="info-line"><span>Días de crédito</span><strong>${Number(payload.credit_days || 0)} días</strong></div>
      </div>
      <h4 style="margin:8px 0;font-size:13px">Compras registradas en Caja (${compras.length})</h4>
      ${compras.length ? compras.map((c) => `
        <div class="v3526-list-row">
          <div>
            <b>${c.folio ? `Ticket #${esc(c.folio)}` : 'Venta POS'}</b>
            <div style="font-size:11px;opacity:.75">${esc(String(c.fecha || c.at || '').slice(0, 10))}${Array.isArray(c.lineas) && c.lineas.length ? ` · ${esc(c.lineas.map((l) => l.nombre || l.descripcion || '').filter(Boolean).slice(0, 2).join(', '))}` : ''}</div>
          </div>
          <strong>${fmtMoney(c.total_centavos || c.totalCentavos || 0, 'DOP')}</strong>
        </div>
      `).join('') : '<p class="soft-note">Sin compras POS recientes asociadas.</p>'}
    `;
  }

  const root = document.createElement('div');
  root.id = 'v3526ModalRoot';
  root.className = 'v3526-modal-backdrop';
  root.innerHTML = `
    <section class="v3526-modal-sheet" role="dialog" aria-modal="true" aria-label="${esc(titleText)}">
      <div class="sheet-grab"></div>
      <div class="sheet-header">
        <h2 style="margin:0;font-size:17px;display:flex;align-items:center;gap:7px">${titleHtml}</h2>
        <button type="button" class="round-button" id="v3526CloseModalBtn" aria-label="Cerrar">✕</button>
      </div>
      <div style="margin-top:8px">${bodyHtml}</div>
    </section>
  `;
  root.addEventListener('click', (ev) => {
    if (ev.target === root) closeModal();
  });
  document.body.appendChild(root);
  root.querySelector('#v3526CloseModalBtn').onclick = closeModal;

  bindModalEvents(root, payload);
}

function bindModalEvents(root, payload) {
  root.querySelectorAll('[data-jump-modal]').forEach((b) => {
    b.onclick = () => openModal(b.dataset.jumpModal);
  });
  root.querySelectorAll('[data-jump-route]').forEach((b) => {
    b.onclick = () => { closeModal(); openNativeRoute(b.dataset.jumpRoute); };
  });

  root.querySelectorAll('[data-review-cut]').forEach((btn) => {
    btn.onclick = () => openModal('cut-review', { id: btn.dataset.reviewCut });
  });
  root.querySelectorAll('[data-back-cuts]').forEach((btn) => {
    btn.onclick = () => openModal('cuts');
  });
  root.querySelectorAll('[data-submit-cut]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.cutId;
      const decision = btn.dataset.submitCut;
      const cut = uiState.data?.cuts?.find((x) => x.id === id);
      if (!cut || !root.querySelector('#v3526CutReviewed')?.checked) {
        showToast('Revisa los importes y marca la casilla antes de continuar.', true);
        return;
      }
      const review = assessCut(cut, appSnapshot().business);
      const note = root.querySelector('#v3526CutNote')?.value?.trim() || '';
      if (decision === 'confirm' && !review.canConfirm) { showToast('Hay una diferencia: no se puede confirmar este corte.', true); return; }
      if (decision === 'mismatch' && !note) { showToast('Indica el motivo de la diferencia.', true); return; }
      if (!review.complete || !review.consistent || !cut.updatedAt) { showToast('Los datos del corte están incompletos. Actualiza la bandeja.', true); return; }
      btn.disabled = true;
      if (uiState.mode === 'demo') {
        const target = uiState.data.cuts.find((x) => x.id === id);
        if (target) target.status = decision === 'confirm' ? 'validated' : 'mismatch';
        uiState.data = normalizeInbox(uiState.data);
        showToast(decision === 'confirm' ? 'Corte confirmado.' : 'Descuadre reportado.', decision !== 'confirm', decision === 'confirm' ? '✅' : '⚠️');
        openModal('cuts');
        scheduleSync();
        return;
      }
      try {
        await apiCall({ action: 'pwaConfirmCut', kind: cut.kind, id, decision, note,
          observed_updated_at: cut.updatedAt,
          observed_expected_centavos: cut.systemCentavos,
          observed_counted_centavos: cut.reportedCentavos,
          observed_transfer_centavos: review.transfer });
        await loadInbox();
        showToast(decision === 'confirm' ? 'Corte confirmado.' : 'Diferencia enviada a revisión. No se movió dinero.', false, '✅');
        openModal('cuts');
        window.DcarelaFinanzasReload?.();
      } catch (err) { btn.disabled = false; showToast(err.message, true); }
    };
  });

  root.querySelectorAll('.v3526-cons-acc').forEach((sel) => {
    sel.onchange = () => {
      const card = sel.closest('.v3526-cons-card');
      if (!card) return;
      const snap = appSnapshot();
      const allAccounts = (snap.accounts || []).filter((a) => a.estado !== 'eliminada');
      const acc = allAccounts.find((a) => a.id === sel.value);
      const origBank = card.dataset.bankKey || '';
      const accBank = inferBankKeyFromText(acc?.nombre || '') || acc?.bankKey || origBank;
      const bankUrl = getBankUrl(accBank);
      const shortUrl = String(bankUrl).replace(/^https?:\/\//, '').replace(/\/$/, '');
      const rateObj = getActiveBankRate(accBank);
      const currency = card.dataset.currency || 'DOP';
      const minor = Number(card.dataset.amount || 0);
      const dop = currency === 'USD' ? computeDopCentavos(minor, 'USD', accBank) : minor;
      const formatted = fmtMoney(dop, 'DOP');
      card.dataset.bankKey = accBank;
      card.dataset.bankUrl = bankUrl;
      const bankLbl = card.querySelector('.v3526-cons-bank-label');
      const rateVal = card.querySelector('.v3526-cons-rate-val');
      const urlSpan = card.querySelector('.v3526-cons-bank-url');
      const dopLabel = card.querySelector('.v3526-cons-dop');
      const btnSpan = card.querySelector('.v3526-cons-btn-dop');
      if (bankLbl) bankLbl.textContent = rateObj.label;
      if (rateVal) rateVal.textContent = `RD$${Number(rateObj.rateSell).toFixed(2)}`;
      if (urlSpan) urlSpan.textContent = shortUrl;
      if (dopLabel) dopLabel.textContent = formatted;
      if (btnSpan) btnSpan.textContent = formatted;
    };
  });

  root.querySelectorAll('[data-cons-accept], [data-cons-reject]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.consAccept || btn.dataset.consReject;
      const decision = btn.dataset.consReject ? 'reject' : 'accept';
      const card = btn.closest('.v3526-cons-card');
      const accId = card?.querySelector('.v3526-cons-acc')?.value || '';
      const snap = appSnapshot();
      const chosenAcc = (snap.accounts || []).find((a) => a.id === accId);
      const resolvedBankKey = inferBankKeyFromText(chosenAcc?.nombre || '') || chosenAcc?.bankKey || card?.dataset.bankKey || '';
      const catId = card?.querySelector('.v3526-cons-cat')?.value || '';
      const autoDebit = Boolean(card?.querySelector('.v3526-cons-autodebit')?.checked);
      const isFx = (card?.dataset.currency || 'DOP').toUpperCase() !== 'DOP';

      if (uiState.mode === 'demo') {
        const target = uiState.data.consumptions.find((x) => x.id === id);
        if (target) target.status = decision === 'reject' ? 'rejected' : 'registered';
        let toastMsg = 'Consumo omitido.';
        if (decision !== 'reject') {
          const fxCheck = investigateBankRateForMovement(resolvedBankKey, isFx);
          toastMsg = isFx
            ? `Consumo debitado (${fxCheck.shortUrl} · RD$${fxCheck.rateSell.toFixed(2)}).`
            : 'Consumo debitado y categorizado.';
        }
        uiState.data = normalizeInbox(uiState.data);
        showToast(toastMsg, false, decision === 'reject' ? '' : '✅');
        openModal('consumptions');
        scheduleSync();
        return;
      }
      try {
        const res = await apiCall({
          action: 'pwaResolveConsumption',
          consumption_id: id,
          decision,
          account_id: accId,
          bank_key: resolvedBankKey || null,
          investigate_bank_url: isFx,
          category_id: catId,
          enable_auto_debit_digital: card?.querySelector('.v3526-cons-autodebit') ? autoDebit : null
        });
        await loadInbox();
        const checkedHost = res?.bank_url_checked ? String(res.bank_url_checked).replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
        showToast(
          decision === 'reject'
            ? 'Consumo rechazado.'
            : (checkedHost ? `Debitado vía ${checkedHost} (RD$${Number(res.rate_applied || 0).toFixed(2)}).` : 'Consumo debitado.'),
          false,
          decision === 'reject' ? '' : '✅'
        );
        openModal('consumptions');
        window.DcarelaFinanzasReload?.();
      } catch (err) { showToast(err.message, true); }
    };
  });

  root.querySelectorAll('[data-pay-alert]').forEach((btn) => {
    btn.onclick = () => {
      const al = uiState.data.paymentAlerts.find((x) => x.id === btn.dataset.payAlert);
      if (!al) return;
      openNativePrefilled({
        type: 'gasto',
        cents: al.amountCentavos,
        note: `Pago ${al.title}`,
        date: al.dueDate
      });
    };
  });

  const fiscalForm = root.querySelector('#v3526FiscalForm');
  if (fiscalForm && payload?.item) {
    fiscalForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(fiscalForm);
      const amountCentavos = Math.round(Number(fd.get('f-amount') || 0) * 100);
      const patch = payload.kind === '607'
        ? { cliente: fd.get('f-party'), ncf: fd.get('f-ncf'), rnc_cliente: fd.get('f-rnc'), fecha: fd.get('f-date'), total_centavos: amountCentavos }
        : { supplier: fd.get('f-party'), ncf: fd.get('f-ncf'), rnc: fd.get('f-rnc'), invoice_date: fd.get('f-date'), total_centavos: amountCentavos, fecha_confirmada: true };

      if (uiState.mode === 'demo') {
        const it = payload.item;
        it.ncf = String(fd.get('f-ncf') || it.ncf);
        it.fecha = String(fd.get('f-date') || it.fecha);
        it.montoCentavos = amountCentavos || it.montoCentavos;
        it.estado = 'validado';
        if (payload.kind === '606') {
          it.proveedor = String(fd.get('f-party') || it.proveedor);
          uiState.data.fiscal.revisar = uiState.data.fiscal.revisar.filter((x) => x.id !== it.id);
          if (!uiState.data.fiscal.compras.some((x) => x.id === it.id)) uiState.data.fiscal.compras.unshift(it);
        } else {
          it.cliente = String(fd.get('f-party') || it.cliente);
        }
        uiState.data = normalizeInbox(uiState.data);
        closeModal();
        showToast('Comprobante fiscal validado.', false, '✅');
        renderFiscalHost();
        scheduleSync();
        return;
      }
      try {
        await apiCall({ action: 'pwaValidateFiscal', kind: payload.kind, id: payload.item.id, decision: 'validate', patch });
        await loadInbox();
        closeModal();
        showToast('Comprobante fiscal guardado.', false, '✅');
      } catch (err) { showToast(err.message, true); }
    };
    root.querySelector('#v3526FiscalVoidBtn').onclick = async () => {
      if (uiState.mode === 'demo') {
        uiState.data.fiscal.revisar = uiState.data.fiscal.revisar.filter((x) => x.id !== payload.item.id);
        uiState.data = normalizeInbox(uiState.data);
        closeModal();
        showToast('Comprobante descartado.');
        renderFiscalHost();
        return;
      }
      try {
        await apiCall({ action: 'pwaValidateFiscal', kind: payload.kind, id: payload.item.id, decision: 'anular' });
        await loadInbox();
        closeModal();
        showToast('Comprobante anulado.');
      } catch (err) { showToast(err.message, true); }
    };
  }

  const mailAddForm = root.querySelector('#v3526MailAddForm');
  if (mailAddForm) {
    mailAddForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(mailAddForm);
      const email = String(fd.get('m-email') || '').trim().toLowerCase();
      const label = String(fd.get('m-label') || 'Cuenta adicional').trim();
      const includeCash = Boolean(fd.get('m-cash'));
      const includeTrans = Boolean(fd.get('m-trans'));
      if (uiState.mode === 'demo') {
        uiState.data.mail.accounts.push({
          email,
          label,
          solo_servicios: false,
          include_transfers: includeTrans,
          include_cash_codes: includeCash,
          lastHeartbeatAt: new Date().toISOString(),
          status: 'activo'
        });
        uiState.data = normalizeInbox(uiState.data);
        renderMailHost();
        openMailScriptModal(email);
        return;
      }
      try {
        await apiCall({ action: 'pwaSaveMailAccount', email, label, solo_servicios: false, include_transfers: includeTrans, include_cash_codes: includeCash });
        await loadInbox();
        openMailScriptModal(email);
      } catch (err) { showToast(err.message, true); }
    };
  }

  const copyBtn = root.querySelector('#v3526CopyGsBtn');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const text = root.querySelector('#v3526GsCode')?.value || '';
      try { await navigator.clipboard.writeText(text); showToast('Script copiado al portapapeles.', false, '📋'); }
      catch { showToast('Selecciona y copia el código manualmente.', true); }
    };
  }

  const mailRegForm = root.querySelector('#v3526MailRegForm');
  if (mailRegForm && payload) {
    const modeSel = mailRegForm.querySelector('#v3526MrMode');
    const destWrap = mailRegForm.querySelector('#v3526MrDestWrap');
    const catWrap = mailRegForm.querySelector('#v3526MrCatWrap');
    const syncMrFields = () => {
      const mVal = String(modeSel?.value || '');
      if (destWrap) destWrap.style.display = mVal === 'transfer_cash' ? '' : 'none';
      if (catWrap) catWrap.style.display = (mVal === 'transfer_cash' || mVal === 'mark_registered') ? 'none' : '';
    };
    if (modeSel) {
      modeSel.addEventListener('change', syncMrFields);
      syncMrFields();
    }
    mailRegForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(mailRegForm);
      const mode = String(fd.get('mr-mode') || 'mark_registered');
      const accountId = String(fd.get('mr-acc') || '');
      const destId = String(fd.get('mr-dest') || '');
      const catId = String(fd.get('mr-cat') || '');
      const snapAccounts = (appSnapshot().accounts || []).filter((a) => a.estado !== 'eliminada');
      const chosenAcc = snapAccounts.find((a) => a.id === accountId);
      const destAcc = snapAccounts.find((a) => a.id === destId);

      if (mode !== 'mark_registered' && (!chosenAcc || isCashFinAccount(chosenAcc))) {
        showToast('Este movimiento bancario debe vincularse a un banco real, nunca a efectivo.', true);
        return;
      }
      if (mode === 'transfer_cash' && (!destAcc || !isCashFinAccount(destAcc) || destId === accountId)) {
        showToast('Elige una cuenta de Caja / Efectivo destino válida.', true);
        return;
      }

      const isFx = String(payload.currency || 'DOP').toUpperCase() !== 'DOP';
      const resolvedBankKey = inferBankKeyFromText(chosenAcc?.nombre || payload.bank || '') || chosenAcc?.bankKey || '';

      if (uiState.mode === 'demo') {
        payload.registered = true;
        const fxCheck = investigateBankRateForMovement(resolvedBankKey, isFx && mode !== 'transfer_cash' && mode !== 'mark_registered');
        uiState.data = normalizeInbox(uiState.data);
        closeModal();
        showToast(
          mode === 'transfer_cash'
            ? `Código Cash transferido (${chosenAcc.nombre} → ${destAcc.nombre}).`
            : isFx
              ? `Movimiento registrado (${fxCheck.shortUrl} · RD$${fxCheck.rateSell.toFixed(2)}).`
              : 'Movimiento de correo registrado.',
          false,
          '✅'
        );
        renderMailHost();
        scheduleSync();
        return;
      }
      try {
        await apiCall({
          action: 'pwaRegisterMailMovement',
          id: payload.id,
          mode,
          account_id: accountId || null,
          dest_account_id: mode === 'transfer_cash' ? destId : null,
          category_id: (mode === 'transfer_cash' || mode === 'mark_registered') ? null : (catId || null),
          bank_key: resolvedBankKey || null,
          investigate_bank_url: isFx
        });
        await loadInbox();
        closeModal();
        showToast(mode === 'transfer_cash' ? 'Código Cash transferido de banco a Caja.' : 'Movimiento de correo registrado.', false, '✅');
        window.DcarelaFinanzasReload?.();
      } catch (err) { showToast(err.message, true); }
    };
  }
}

async function openMailScriptModal(email) {
  if (uiState.mode === 'demo') {
    openModal('mail-script', {
      email,
      script: `// Google Apps Script — ${email}\nvar CFG = {\n  URL: 'https://crmfacturasgmail-o2uqjp6fra-uc.a.run.app',\n  TOKEN: 'DEMO-TOKEN-ACTIVO',\n  CUENTA: '${email}',\n  PERMITIR_TODO: true\n};\n// Incluye transferencias, LBTR, ACH, Toke y Códigos Cash.\nfunction instala() { /* Configura trigger cada 15 min */ }`
    });
    return;
  }
  try {
    const res = await apiCall({ action: 'pwaGetMailSetupScript', email, solo_servicios: false });
    openModal('mail-script', { email, script: res.script || '' });
  } catch (err) { showToast(err.message, true); }
}

async function handleRemoveMailAccount(email) {
  if (uiState.mode === 'demo') {
    uiState.data.mail.accounts = uiState.data.mail.accounts.filter((a) => a.email !== email);
    uiState.data = normalizeInbox(uiState.data);
    renderMailHost();
    showToast('Correo desconectado (demo).');
    return;
  }
  try {
    await apiCall({ action: 'pwaRemoveMailAccount', email });
    await loadInbox();
    showToast('Correo desconectado.');
  } catch (err) { showToast(err.message, true); }
}

async function handleToggleAutoDebit(linkId) {
  const link = uiState.data?.cardLinks?.[linkId];
  const nextVal = !(link?.auto_debit_digital);
  if (uiState.mode === 'demo') {
    if (link) link.auto_debit_digital = nextVal;
    renderSettingsHost();
    showToast(nextVal ? 'Auto-débito digital activado.' : 'Auto-débito digital pausado.', false, nextVal ? '⚡' : '');
    return;
  }
  try {
    await apiCall({ action: 'pwaToggleAutoDebitRule', id: linkId, link_id: linkId, enabled: nextVal, auto_debit_digital: nextVal });
    await loadInbox();
    showToast(nextVal ? 'Auto-débito digital activado.' : 'Auto-débito pausado.', false, nextVal ? '⚡' : '');
  } catch (err) { showToast(err.message, true); }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function handleEnablePush() {
  if (uiState.mode === 'demo') {
    uiState.pushSubscribed = true;
    renderSettingsHost();
    showToast('Simulación: Alertas Push iPhone activadas en Demo.', false, '🔔');
    return;
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Tu navegador no soporta Web Push. Usa Safari en iPhone instalado en Pantalla de Inicio.', true);
    return;
  }
  uiState.pushBusy = true;
  renderSettingsHost();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado.');
    const reg = await navigator.serviceWorker.ready;
    const cfg = uiState.pushConfig || await apiCall({ action: 'pwaPushConfig' });
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.publicKey)
    });
    const subJson = sub.toJSON ? sub.toJSON() : sub;
    await apiCall({
      action: 'pwaPushSubscribe',
      subscription: subJson,
      device_label: /iphone/i.test(navigator.userAgent) ? 'iPhone de Erick' : 'PWA Finanzas',
      platform: /iphone|ipad/i.test(navigator.userAgent) ? 'ios_pwa' : 'web_pwa'
    });
    uiState.pushSubscribed = true;
    showToast('¡Alertas Push activadas para este iPhone!', false, '🔔');
  } catch (err) {
    showToast(err.message || 'No se pudo suscribir a Web Push.', true);
  } finally {
    uiState.pushBusy = false;
    renderSettingsHost();
  }
}

async function handleTestPush() {
  if (uiState.mode === 'demo') {
    showToast('Alerta Push simulada recibida.', false, '🧪');
    return;
  }
  try {
    const r = await apiCall({ action: 'pwaPushTest' });
    showToast(r?.sent > 0 ? `Push enviado a ${r.sent} dispositivo(s).` : 'Sin suscripciones Push activas aún.', false, '🧪');
  } catch (err) { showToast(err.message, true); }
}

function handleDeepLink(rawUrl) {
  try {
    const u = new URL(rawUrl, location.href);
    const tab = u.searchParams.get('tab');
    const inbox = u.searchParams.get('inbox');
    if (tab && ['caja_crm', 'mail', 'books', 'settings', 'cards', 'budgets', 'search'].includes(tab)) {
      openNativeRoute(tab);
    } else if (tab === 'debts') {
      window.DcarelaFinanzasActions?.openTab?.('debts');
    } else if (inbox) {
      openModal(inbox === 'all' ? 'alerts-hub' : inbox);
    }
  } catch {}
}

function syncDom() {
  uiState.renderQueued = false;
  applyGlassConfig({}, false);
  updateLiveRibbonDOM();
  enhanceHeaderAndQuickActions();
  renderInboxStrip();
  simplifyHistoryFilters();
  renderCajaCrmHost();
  renderFiscalHost();
  renderMailHost();
  renderSettingsHost();
  renderConnectionHost();
}

function scheduleSync() {
  if (uiState.renderQueued) return;
  uiState.renderQueued = true;
  requestAnimationFrame(syncDom);
}

async function ensureCategoryLinker() {
  if (window.DcarelaCategoryLinker) return;
  await new Promise((resolve) => {
    const sc = document.createElement('script');
    sc.src = './v35-26-category-emojis.js?v=35.33';
    sc.onload = resolve;
    sc.onerror = resolve;
    document.head.appendChild(sc);
  });
}

async function init() {
  applyPalette(getPalette(), getCustomAccent());
  await ensureCategoryLinker();

  if (!uiState.mountedHooks) {
    uiState.mountedHooks = true;
    let lastBiz = appSnapshot().business || '';
    window.addEventListener('dcarela:finanzas-rendered', () => {
      const snapBiz = appSnapshot().business || '';
      const bizChanged = Boolean(snapBiz && snapBiz !== lastBiz);
      if (bizChanged) lastBiz = snapBiz;
      if (uiState.mode === 'live' && (!uiState.data || bizChanged) && !uiState.loading && window.DcarelaFirebase?.getCurrentUser?.()) {
        loadInbox(false);
      }
      scheduleSync();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && uiState.activeModal) closeModal();
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev.data?.type === 'DCARELA_PUSH_OPEN' && ev.data.url) handleDeepLink(ev.data.url);
      });
    }
    const appNode = document.getElementById('app');
    if (appNode && typeof MutationObserver === 'function') {
      let timer = null;
      const obs = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(scheduleSync, 40);
      });
      obs.observe(appNode, { childList: true });
    }
  }

  await loadInbox(false);
  scheduleSync();
  handleDeepLink(location.href);
}

window.DcarelaInboxFiscal = {
  init,
  loadInbox,
  openModal,
  applyPalette,
  getEcosystemSummary,
  getState: () => uiState
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
