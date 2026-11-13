/* ==========================================================================
   v35.26 Unified Inbox, Mail/Cash-Codes, Theme Palettes, Web Push & Fiscal UI
   D' Carela Studio & Events · Finanzas PWA (iPhone 15 393x852)
   ========================================================================== */

const PALETTE_KEY = 'dcarela-mm-palette';
const CUSTOM_ACCENT_KEY = 'dcarela-mm-accent';
const FX_BANK_KEY = 'dcarela-mm-fx-bank';

const DEFAULT_BANKS = [
  { key: 'popular', label: 'Banco Popular', rateSell: 61.25 },
  { key: 'banreservas', label: 'Banreservas', rateSell: 61.10 },
  { key: 'bhd', label: 'Banco BHD', rateSell: 61.35 },
  { key: 'scotiabank', label: 'Scotiabank', rateSell: 61.40 }
];

const uiState = {
  data: null,
  loading: false,
  error: '',
  mode: new URLSearchParams(location.search).get('mode') === 'demo' ? 'demo' : 'live',
  activeModal: null,
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
      { id: 'obsidian', name: 'Grafito Glass', swatch: 'linear-gradient(135deg,#334155,#64748b)' },
      { id: 'sapphire', name: 'Zafiro Real', swatch: 'linear-gradient(135deg,#2563eb,#06b6d4)' },
      { id: 'emerald', name: 'Esmeralda Studio', swatch: 'linear-gradient(135deg,#059669,#14b8a6)' },
      { id: 'amber', name: 'Ámbar Dorado', swatch: 'linear-gradient(135deg,#d97706,#f97316)' },
      { id: 'amethyst', name: 'Amatista Silk', swatch: 'linear-gradient(135deg,#7c3aed,#ec4899)' },
      { id: 'crimson', name: 'Carmín Editorial', swatch: 'linear-gradient(135deg,#dc2626,#f43f5e)' }
    ],
    emojiForCategory: () => '🏷️',
    emojiForAccount: () => '💳',
    emojiForMerchant: () => '💳',
    resolveClientExpenseCategory: () => ({ categoria_id: '', categoria: '' }),
    buildDemoInboxData: () => ({ ok: true, counts: {}, cuts: [], consumptions: [], paymentAlerts: [], fx: { banks: DEFAULT_BANKS }, mail: { accounts: [], movements: [] }, fiscal: { compras: [], revisar: [], ventas: [] } })
  };
}

function getPalette() {
  try { return localStorage.getItem(PALETTE_KEY) || 'sapphire'; } catch { return 'sapphire'; }
}

function getCustomAccent() {
  try { return localStorage.getItem(CUSTOM_ACCENT_KEY) || '#2563eb'; } catch { return '#2563eb'; }
}

function applyPalette(paletteId, customHex) {
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
  scheduleSync();
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

function showToast(msg, isWarn = false) {
  let el = document.getElementById('v3526Toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'v3526Toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:120;max-width:360px;width:calc(100% - 32px);padding:11px 14px;border-radius:16px;font-size:13px;font-weight:600;text-align:center;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 12px 28px rgba(0,0,0,.32);transition:opacity .25s ease;';
    document.body.appendChild(el);
  }
  el.textContent = String(msg || '');
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
    banksList = rawFx.banks;
  } else if (rawFx.banks && typeof rawFx.banks === 'object') {
    banksList = Object.entries(rawFx.banks).map(([key, val]) => ({
      key,
      label: val?.bank_name || val?.label || key,
      rateSell: Number(val?.usd_venta || val?.dop_por_usd || val?.rateSell || 61.25),
      usdCompra: Number(val?.usd_compra || 58.5),
      source: val?.fuente || val?.source || 'banco'
    }));
  }
  if (!banksList.length) banksList = DEFAULT_BANKS.map((b) => ({ ...b }));

  const cuts = Array.isArray(src.cuts) ? src.cuts.map((c) => ({
    id: String(c.id || ''),
    kind: c.kind || 'pos_cut',
    title: c.title || (c.kind === 'cash_cut' ? 'Cierre de Caja' : `Corte TPV POS ${c.report_code || ''}`),
    date: String(c.date || c.created_at || '').slice(0, 10),
    systemCentavos: Number(c.systemCentavos ?? c.expected_centavos ?? 0),
    reportedCentavos: Number(c.reportedCentavos ?? c.counted_centavos ?? c.expected_centavos ?? 0),
    differenceCentavos: Number(c.differenceCentavos ?? c.difference_centavos ?? 0),
    currency: c.currency || 'DOP',
    status: c.status || 'pending_review',
    summary: c.summary || `${c.cashier ? `Cajero: ${c.cashier} · ` : ''}${c.branch_name || 'Estudio'}`
  })) : [];

  const consumptions = Array.isArray(src.consumptions) ? src.consumptions.map((c) => {
    const merchant = c.merchant || c.comercio || 'Consumo tarjeta';
    const isDigital = Boolean(c.isDigital ?? c.is_digital ?? /openai|claude|anthropic|google|apple|meta|adobe|canva|netflix|cursor|github|spotify/i.test(merchant));
    return {
      id: String(c.id || ''),
      merchant,
      cardLast4: String(c.cardLast4 ?? c.last4 ?? ''),
      bankName: c.bankName || c.bank || 'Banco',
      bankKey: c.bankKey || c.bank_key || 'popular',
      accountId: c.accountId || c.selected_account_id || '',
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

  const rawCardLinks = src.cardLinks || src.card_links || {};
  const cardLinks = Array.isArray(rawCardLinks)
    ? Object.fromEntries(rawCardLinks.map((cl) => [cl.last4 || cl.id, cl]))
    : rawCardLinks;

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
      registered: Boolean(m.registered ?? m.pwa_registered ?? m.conciliado)
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

  let storedBank = '';
  try { storedBank = localStorage.getItem(FX_BANK_KEY) || ''; } catch {}
  const selectedBankKey = storedBank || rawFx.selectedBankKey || rawFx.selected_bank_key || banksList[0]?.key || 'popular';

  return {
    ok: true,
    counts,
    cuts,
    consumptions,
    paymentAlerts,
    fx: {
      selectedBankKey,
      updatedAt: rawFx.updatedAt || rawFx.actualizado_en || new Date().toISOString(),
      banks: banksList
    },
    cardLinks,
    categories: Array.isArray(src.categories) ? src.categories : [],
    accounts: Array.isArray(src.accounts) ? src.accounts : [],
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
  return fn(payload);
}

async function loadInbox(forceRefreshRates = false) {
  if (uiState.loading) return;
  uiState.loading = true;
  uiState.error = '';
  try {
    if (uiState.mode === 'demo') {
      if (!uiState.data) {
        uiState.data = normalizeInbox(linker().buildDemoInboxData());
      }
    } else {
      const user = window.DcarelaFirebase?.getCurrentUser?.();
      if (!user) {
        uiState.loading = false;
        return;
      }
      const res = await apiCall({ action: 'pwaFinanceInbox', refresh_rates: forceRefreshRates });
      uiState.data = normalizeInbox(res);
      try {
        const pcfg = await apiCall({ action: 'pwaPushConfig' });
        uiState.pushConfig = pcfg;
        uiState.pushSubscribed = Boolean(pcfg?.mySubscriptions?.length);
      } catch {}
    }
  } catch (err) {
    uiState.error = err?.message || 'No se pudo consultar el buzón.';
  } finally {
    uiState.loading = false;
    scheduleSync();
  }
}

function getActiveBankRate(bankKey) {
  const banks = uiState.data?.fx?.banks || DEFAULT_BANKS;
  return banks.find((b) => b.key === bankKey) || banks[0] || { key: 'popular', label: 'Banco Popular', rateSell: 61.25 };
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
   DOM Sync Hooks (Header Bell, Quick Icons Emoji, Inbox Strip, Routes)
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

  // Expressive emojis ONLY on Resumen quick actions — leave .bottom-nav SVGs untouched!
  const emojiByType = { gasto: '💸', ingreso: '💰', transferencia: '🔁', debts: '⏰', pagos: '⏰' };
  document.querySelectorAll('.quick-actions .quick-action').forEach((btn) => {
    const iconBox = btn.querySelector('.quick-icon');
    if (!iconBox) return;
    const key = String(btn.dataset.type || btn.dataset.tab || '').toLowerCase();
    const labelText = (btn.textContent || '').toLowerCase();
    const emoji = emojiByType[key]
      || (labelText.includes('gasto') ? '💸'
        : labelText.includes('ingreso') ? '💰'
          : labelText.includes('transfer') ? '🔁'
            : labelText.includes('pago') ? '⏰' : '');
    if (emoji && iconBox.textContent.trim() !== emoji) {
      iconBox.textContent = emoji;
    }
  });
}

function renderInboxStrip() {
  const view = currentViewKey();
  const existing = document.getElementById('v3526InboxStrip');
  if (view !== 'home') {
    existing?.remove();
    return;
  }
  const homePage = document.querySelector('[data-v3526-page="home"]') || document.querySelector('main.page');
  if (!homePage) return;
  const quickActions = homePage.querySelector('.quick-actions');
  if (!quickActions) return;

  const counts = uiState.data?.counts || { cuts: 0, consumptions: 0, paymentAlerts: 0, mailAttention: 0, fiscalReview: 0 };
  const strip = existing || document.createElement('div');
  strip.id = 'v3526InboxStrip';
  strip.className = 'v3526-strip';
  strip.innerHTML = `
    <button type="button" class="v3526-pill" data-v3526-open="cuts">
      <span>🧾 Cortes</span>
      <span class="v3526-pill-count">${counts.cuts || 0}</span>
    </button>
    <button type="button" class="v3526-pill" data-v3526-open="consumptions">
      <span>💳 Consumos</span>
      <span class="v3526-pill-count">${counts.consumptions || 0}</span>
    </button>
    <button type="button" class="v3526-pill" data-v3526-open="alerts">
      <span>⏰ Pagos</span>
      <span class="v3526-pill-count">${counts.paymentAlerts || 0}</span>
    </button>
    <button type="button" class="v3526-pill" data-v3526-route="mail">
      <span>✉️ Correos / Cash</span>
      <span class="v3526-pill-count">${counts.mailAttention || 0}</span>
    </button>
    <button type="button" class="v3526-pill" data-v3526-route="books">
      <span>📑 Fiscal</span>
      <span class="v3526-pill-count">${counts.fiscalReview || 0}</span>
    </button>
  `;
  if (!strip.isConnected) {
    quickActions.after(strip);
  }
  strip.querySelectorAll('[data-v3526-open]').forEach((b) => {
    b.onclick = () => openModal(b.dataset.v3526Open);
  });
  strip.querySelectorAll('[data-v3526-route]').forEach((b) => {
    b.onclick = () => openNativeRoute(b.dataset.v3526Route);
  });
}

function simplifyHistoryFilters() {
  if (currentViewKey() !== 'route:search') return;
  const searchPage = document.querySelector('[data-v3526-page="search"]');
  if (!searchPage) return;
  const chipsRow = searchPage.querySelector('.search-chips');
  if (!chipsRow) return;

  const extraNodes = searchPage.querySelectorAll('.filter-grid, .search-accounts');
  extraNodes.forEach((n) => {
    n.style.display = uiState.searchMoreFilters ? '' : 'none';
  });

  if (!document.getElementById('v3526MoreFiltersBtn')) {
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'v3526MoreFiltersBtn';
    toggleBtn.type = 'button';
    toggleBtn.className = `chip ${uiState.searchMoreFilters ? 'active' : ''}`;
    toggleBtn.textContent = uiState.searchMoreFilters ? '🎛️ Menos filtros' : '🎛️ Más filtros';
    toggleBtn.onclick = () => {
      uiState.searchMoreFilters = !uiState.searchMoreFilters;
      simplifyHistoryFilters();
    };
    chipsRow.appendChild(toggleBtn);
  } else {
    const btn = document.getElementById('v3526MoreFiltersBtn');
    btn.className = `chip ${uiState.searchMoreFilters ? 'active' : ''}`;
    btn.textContent = uiState.searchMoreFilters ? '🎛️ Menos filtros' : '🎛️ Más filtros';
  }
}

function renderFiscalHost() {
  const host = document.getElementById('v3526FiscalHost');
  if (host) {
    const fiscal = uiState.data?.fiscal || { compras: [], revisar: [], ventas: [], hermes: {}, summary: {} };
    const hermes = fiscal.hermes || {};
    const tab = uiState.fiscalTab;
    const rows = tab === 'revisar' ? fiscal.revisar : tab === 'compras' ? fiscal.compras : fiscal.ventas;

    host.innerHTML = `
      <div class="card v3526-card">
        <div class="v3526-card-head">
          <h3>🖥️ Hermes Facturador DGII</h3>
          <span class="v3526-tag ${hermes.keepaliveActive ? 'ok' : 'warn'}">${hermes.keepaliveActive ? 'Sincronizado' : 'En espera de sesión'}</span>
        </div>
        <p class="soft-note" style="margin:0 0 8px">${esc(hermes.notes || 'Lectura automática desde la PC y XML en Drive')}</p>
        <div class="v3526-strip" style="margin:6px 0 10px">
          <button type="button" class="v3526-pill ${tab === 'revisar' ? 'active' : ''}" data-ftab="revisar">⚠️ Por revisar (${fiscal.revisar.length})</button>
          <button type="button" class="v3526-pill ${tab === 'compras' ? 'active' : ''}" data-ftab="compras">🛒 Compras 606 (${fiscal.compras.length})</button>
          <button type="button" class="v3526-pill ${tab === 'ventas' ? 'active' : ''}" data-ftab="ventas">🧾 Ventas 607 (${fiscal.ventas.length})</button>
        </div>
        ${rows.length ? rows.map((row) => {
          const isSale = tab === 'ventas';
          const statusOk = row.estado === 'validado';
          return `
            <div class="v3526-list-row">
              <div style="min-width:0;flex:1">
                <div style="font-size:13px;font-weight:700">${isSale ? '🧾' : '🛒'} ${esc(isSale ? row.cliente : row.proveedor)}</div>
                <div style="font-size:12px;opacity:.78">NCF: <b>${esc(row.ncf)}</b> · RNC: ${esc(isSale ? row.rncCliente : row.rnc)}</div>
                <div style="font-size:11px;opacity:.68">${esc(row.fecha)} · ${esc(row.origen)}${row.motivo ? ` · ${esc(row.motivo)}` : ''}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:13px;font-weight:700">${fmtMoney(row.montoCentavos, 'DOP')}</div>
                <div class="v3526-btn-row" style="justify-content:flex-end;margin-top:4px">
                  <span class="v3526-tag ${statusOk ? 'ok' : 'warn'}">${statusOk ? 'Validado' : 'Validar'}</span>
                  <button type="button" class="secondary-btn" style="padding:4px 9px;font-size:11px" data-fval="${esc(row.id)}" data-fkind="${isSale ? '607' : '606'}">${statusOk ? 'Editar' : 'Validar'}</button>
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

  // Optional jump pill inside Finanzas view
  if (currentViewKey() === 'finance') {
    const main = document.querySelector('main.page');
    if (main && !document.getElementById('v3526FinanceFiscalShortcut')) {
      const card = document.createElement('div');
      card.id = 'v3526FinanceFiscalShortcut';
      card.className = 'card v3526-card';
      card.style.marginTop = '12px';
      const fSum = uiState.data?.fiscal?.summary || { compras: 0, ventas: 0, revisar: 0 };
      card.innerHTML = `
        <div class="v3526-card-head" style="margin-bottom:6px">
          <h3>📑 Libros Fiscales (606 / 607) & Hermes</h3>
          <span class="v3526-tag">${fSum.revisar ? `${fSum.revisar} por revisar` : 'Al día'}</span>
        </div>
        <div style="font-size:12px;opacity:.8;margin-bottom:8px">Compras 606: ${fSum.compras || 0} · Ventas 607: ${fSum.ventas || 0}</div>
        <button type="button" class="secondary-btn full" id="v3526OpenBooksBtn">Abrir libros y validar comprobantes</button>
      `;
      main.appendChild(card);
      card.querySelector('#v3526OpenBooksBtn').onclick = () => openNativeRoute('books');
    }
  }
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

  const kindLabel = (k) => k === 'retiro_codigo_cash' ? '🏧 Código Cash'
    : k.includes('entrada') || k.includes('recibida') ? '📥 Transferencia recibida'
      : k.includes('transferencia') ? '🔁 Transferencia enviada'
        : '💳 Consumo bancario';

  host.innerHTML = `
    <div class="card v3526-card">
      <div class="v3526-card-head">
        <h3>✉️ Correos Gmail conectados</h3>
        <button type="button" class="primary-btn" style="padding:7px 11px;font-size:12px" id="v3526AddMailBtn">+ Agregar correo</button>
      </div>
      ${mail.accounts.length ? mail.accounts.map((a) => `
        <div class="v3526-list-row">
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:700;word-break:break-word">${esc(a.email)}</div>
            <div style="font-size:11px;opacity:.75">${esc(a.label)} · ${esc(relTime(a.lastHeartbeatAt))}</div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              <span class="v3526-tag ok">Activo</span>
              ${a.include_cash_codes ? '<span class="v3526-tag">🏧 Códigos Cash</span>' : ''}
              ${a.include_transfers ? '<span class="v3526-tag">🔁 Transferencias</span>' : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
            <button type="button" class="secondary-btn" style="padding:5px 9px;font-size:11px" data-mail-script="${esc(a.email)}">📋 Script .gs</button>
            ${mail.accounts.length > 1 ? `<button type="button" class="secondary-btn" style="padding:5px 9px;font-size:11px" data-mail-remove="${esc(a.email)}">Quitar</button>` : ''}
          </div>
        </div>
      `).join('') : '<p class="soft-note">Agrega tus cuentas Gmail para leer transferencias y Códigos Cash.</p>'}
    </div>

    <div class="card v3526-card">
      <div class="v3526-card-head">
        <h3>🏧 Códigos Cash y Transferencias</h3>
        <span class="v3526-tag warn">${mail.movements.filter((m) => !m.registered).length} pendientes</span>
      </div>
      <div class="v3526-strip" style="margin:6px 0 10px">
        <button type="button" class="v3526-pill ${f === 'pending' ? 'active' : ''}" data-mfilter="pending">Pendientes</button>
        <button type="button" class="v3526-pill ${f === 'retiro_codigo_cash' ? 'active' : ''}" data-mfilter="retiro_codigo_cash">🏧 Códigos Cash</button>
        <button type="button" class="v3526-pill ${f === 'transferencia' ? 'active' : ''}" data-mfilter="transferencia">🔁 Transferencias</button>
        <button type="button" class="v3526-pill ${f === 'all' ? 'active' : ''}" data-mfilter="all">Todos</button>
      </div>
      ${filtered.length ? filtered.map((m) => `
        <div class="v3526-list-row">
          <div style="min-width:0;flex:1">
            <div style="font-size:12px;font-weight:700">${kindLabel(m.kind)} · ${esc(m.bank)}</div>
            <div style="font-size:13px;font-weight:600;margin:2px 0">${esc(m.subject)}</div>
            <div style="font-size:11px;opacity:.72">${esc(m.accountEmail)} · ${esc(m.date)}${m.reference ? ` · Ref: ${esc(m.reference)}` : ''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:14px;font-weight:700">${fmtMoney(m.amountCentavos, m.currency)}</div>
            ${m.registered
              ? '<span class="v3526-tag ok" style="margin-top:5px">✅ Registrado</span>'
              : `<button type="button" class="primary-btn" style="padding:6px 10px;font-size:11px;margin-top:5px" data-mail-reg="${esc(m.id)}">⚡ Anotar</button>`}
          </div>
        </div>
      `).join('') : '<p class="soft-note">No hay movimientos en este filtro.</p>'}
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

function renderSettingsHost() {
  const host = document.getElementById('v3526SettingsTopHost');
  if (!host) return;

  const snap = appSnapshot();
  const isDark = snap.state?.theme === 'dark';
  const curPalette = getPalette();
  const customHex = getCustomAccent();
  const banks = uiState.data?.fx?.banks || DEFAULT_BANKS;
  const selectedBank = uiState.data?.fx?.selectedBankKey || 'popular';
  const cardLinks = Object.values(uiState.data?.cardLinks || {});
  const isIosBrowser = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone;
  const palettes = linker().PALETTES || [];

  host.innerHTML = `
    <div class="card v3526-card">
      <div class="v3526-card-head">
        <h3>🎨 Paleta de Color y Estilo Glass</h3>
        <button type="button" class="secondary-btn" style="padding:6px 10px;font-size:12px" id="v3526ThemeQuickBtn">${isDark ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}</button>
      </div>
      <div class="v3526-palette-grid">
        ${palettes.map((p) => `
          <button type="button" class="v3526-swatch ${curPalette === p.id ? 'active' : ''}" data-pal="${esc(p.id)}">
            <span class="v3526-swatch-dot" style="background:${esc(p.swatch)}"></span>
            <span>${esc(p.name)}</span>
          </button>
        `).join('')}
      </div>
      <div class="v3526-custom-color-row">
        <div>
          <div style="font-size:13px;font-weight:600">🖌️ Color personalizado</div>
          <div style="font-size:11px;opacity:.75">Aplica a luces de fondo, gráficas y acentos</div>
        </div>
        <input type="color" id="v3526CustomHex" value="${esc(customHex)}" aria-label="Elegir color personalizado">
      </div>
    </div>

    <div class="card v3526-card">
      <div class="v3526-card-head">
        <h3>🔔 Alertas Push en iPhone (PWA)</h3>
        <span class="v3526-tag ${uiState.pushSubscribed ? 'ok' : 'warn'}">${uiState.pushSubscribed ? 'Activas' : 'Pendiente'}</span>
      </div>
      ${isIosBrowser ? '<div class="notice warning" style="margin-bottom:8px">En iPhone, toca <b>Compartir → Añadir a pantalla de inicio</b> y abre la app desde el ícono para recibir notificaciones push nativas.</div>' : ''}
      <p class="soft-note" style="margin:0 0 8px">Recibe avisos instantáneos de cortes TPV, consumos en USD, Códigos Cash y transferencias sin depender de WhatsApp.</p>
      <div class="v3526-btn-row">
        <button type="button" class="primary-btn" id="v3526PushEnableBtn" ${uiState.pushBusy ? 'disabled' : ''}>${uiState.pushSubscribed ? '🔄 Renovar Push' : '🔔 Activar alertas Push'}</button>
        <button type="button" class="secondary-btn" id="v3526PushTestBtn" ${uiState.pushBusy ? 'disabled' : ''}>🧪 Probar alerta</button>
      </div>
    </div>

    <div class="card v3526-card">
      <div class="v3526-card-head">
        <h3>💱 Tasa USD por Banco</h3>
        <button type="button" class="secondary-btn" style="padding:5px 10px;font-size:11px;flex-shrink:0;white-space:nowrap" id="v3526FxRefreshBtn">↻ Actualizar</button>
      </div>
      <label class="field-label" for="v3526FxBankSelect" style="margin-top:0">Banco predeterminado para compras en USD</label>
      <select class="field-select" id="v3526FxBankSelect">
        ${banks.map((b) => `<option value="${esc(b.key)}" ${b.key === selectedBank ? 'selected' : ''}>${esc(b.label)} · RD$${Number(b.rateSell).toFixed(2)}</option>`).join('')}
      </select>
      ${cardLinks.length ? `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:700;margin-bottom:6px">⚡ Compras digitales (Google Apps Script)</div>
          ${cardLinks.map((cl) => `
            <div class="v3526-list-row" style="align-items:center">
              <div style="font-size:12px">
                <b>${esc(cl.accountName || `Tarjeta ****${cl.last4 || ''}`)}</b>
                <div style="opacity:.72">Débito automático en compras digitales</div>
              </div>
              <button type="button" class="switch ${cl.auto_debit_digital ? 'on' : ''}" role="switch" aria-checked="${cl.auto_debit_digital ? 'true' : 'false'}" data-autodebit="${esc(cl.id || cl.last4 || '')}"><span></span></button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  host.querySelector('#v3526ThemeQuickBtn').onclick = () => {
    window.DcarelaFinanzasActions?.setTheme?.(isDark ? 'light' : 'dark');
  };
  host.querySelectorAll('[data-pal]').forEach((b) => {
    b.onclick = () => applyPalette(b.dataset.pal);
  });
  host.querySelector('#v3526CustomHex').oninput = (ev) => {
    applyPalette('custom', ev.target.value);
  };
  host.querySelector('#v3526FxBankSelect').onchange = (ev) => {
    const key = ev.target.value;
    if (uiState.data?.fx) uiState.data.fx.selectedBankKey = key;
    try { localStorage.setItem(FX_BANK_KEY, key); } catch {}
    showToast(`Banco predeterminado actualizado: ${getActiveBankRate(key).label}`);
  };
  host.querySelector('#v3526FxRefreshBtn').onclick = async () => {
    await loadInbox(true);
    showToast('Tasas de cambio actualizadas.');
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

function renderModalRoot() {
  document.getElementById('v3526ModalRoot')?.remove();
  if (!uiState.activeModal) return;

  const { type, payload } = uiState.activeModal;
  const data = uiState.data || normalizeInbox(linker().buildDemoInboxData());
  const banks = data.fx?.banks || DEFAULT_BANKS;
  const snap = appSnapshot();
  const expenseCats = (snap.categories || []).filter((c) => c.tipo === 'gasto');
  const allAccounts = (snap.accounts || []).filter((a) => a.estado !== 'eliminada');

  let title = '';
  let bodyHtml = '';

  if (type === 'alerts-hub') {
    title = '🔔 Centro de avisos financieros';
    const c = data.counts || {};
    bodyHtml = `
      <div class="v3526-list-row"><div><b>🧾 Cortes TPV y Caja</b><div style="font-size:12px;opacity:.75">Cuadres pendientes de validar</div></div><button type="button" class="primary-btn" data-jump-modal="cuts">${c.cuts || 0} revisar</button></div>
      <div class="v3526-list-row"><div><b>💳 Consumos y compras USD</b><div style="font-size:12px;opacity:.75">Tasa de banco elegido + auto-débito</div></div><button type="button" class="primary-btn" data-jump-modal="consumptions">${c.consumptions || 0} revisar</button></div>
      <div class="v3526-list-row"><div><b>⏰ Alertas de pagos</b><div style="font-size:12px;opacity:.75">Vencimientos de hoy y próximos</div></div><button type="button" class="primary-btn" data-jump-modal="alerts">${c.paymentAlerts || 0} ver</button></div>
      <div class="v3526-list-row"><div><b>✉️ Correos y Códigos Cash</b><div style="font-size:12px;opacity:.75">Transferencias y retiros detectados</div></div><button type="button" class="secondary-btn" data-jump-route="mail">${c.mailAttention || 0} abrir</button></div>
      <div class="v3526-list-row"><div><b>📑 Libros Fiscales y Hermes</b><div style="font-size:12px;opacity:.75">Compras 606 y Ventas 607</div></div><button type="button" class="secondary-btn" data-jump-route="books">${c.fiscalReview || 0} abrir</button></div>
    `;
  } else if (type === 'cuts') {
    title = '🧾 Confirmación de Cortes';
    const pendingCuts = data.cuts.filter((x) => x.status !== 'validated' && x.status !== 'confirmed');
    bodyHtml = pendingCuts.length ? pendingCuts.map((cut) => `
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div style="font-size:14px;font-weight:700">${cut.kind === 'cash_cut' ? '💵' : '🖥️'} ${esc(cut.title)}</div>
        <div style="font-size:12px;opacity:.78;margin:4px 0">${esc(cut.summary)} · ${esc(cut.date)}</div>
        <div class="info-line"><span>Esperado</span><strong>${fmtMoney(cut.systemCentavos, cut.currency)}</strong></div>
        <div class="info-line"><span>Contado / Reportado</span><strong>${fmtMoney(cut.reportedCentavos, cut.currency)}</strong></div>
        <div class="v3526-btn-row">
          <button type="button" class="primary-btn" data-confirm-cut="${esc(cut.id)}" data-cut-kind="${esc(cut.kind)}">✅ Confirmar corte</button>
          <button type="button" class="secondary-btn" data-mismatch-cut="${esc(cut.id)}" data-cut-kind="${esc(cut.kind)}">⚠️ Descuadre</button>
        </div>
      </div>
    `).join('') : '<div class="notice">✅ Todos los cortes TPV y Caja están confirmados.</div>';
  } else if (type === 'consumptions') {
    title = '💳 Confirmar consumos bancarios';
    const pending = data.consumptions.filter((x) => x.status !== 'registered' && x.status !== 'rejected');
    bodyHtml = pending.length ? pending.map((item) => {
      const defBank = item.bankKey || data.fx?.selectedBankKey || 'popular';
      const isUsd = item.currency === 'USD';
      const dopMinor = isUsd ? computeDopCentavos(item.originalCentavos, 'USD', defBank) : item.originalCentavos;
      const autoCat = linker().resolveClientExpenseCategory({ descripcion: `${item.merchant} ${item.suggestedCategoryName}` }, expenseCats);
      const chosenCatId = item.suggestedCategoryId || autoCat.categoria_id || '';
      const matchedAcc = allAccounts.find((a) => a.id === item.accountId) || allAccounts[0];
      return `
        <div class="card v3526-cons-card" data-cid="${esc(item.id)}" style="padding:12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <div>
              <div style="font-size:14px;font-weight:700">${linker().emojiForMerchant(item.merchant)} ${esc(item.merchant)}</div>
              <div style="font-size:12px;opacity:.78">${esc(item.bankName)}${item.cardLast4 ? ` · ****${esc(item.cardLast4)}` : ''} · ${esc(item.date)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:15px;font-weight:700">${fmtMoney(item.originalCentavos, item.currency)}</div>
              ${item.isDigital ? '<span class="v3526-tag">🌐 Digital / App</span>' : ''}
            </div>
          </div>
          ${isUsd ? `
            <label class="field-label" style="margin-top:8px">Banco para tasa USD → DOP</label>
            <select class="field-select v3526-cons-bank" data-amount="${item.originalCentavos}">
              ${banks.map((b) => `<option value="${esc(b.key)}" ${b.key === defBank ? 'selected' : ''}>${esc(b.label)} · RD$${Number(b.rateSell).toFixed(2)}</option>`).join('')}
            </select>
            <div class="notice" style="margin:6px 0">Débito calculado: <b class="v3526-cons-dop">${fmtMoney(dopMinor, 'DOP')}</b></div>
          ` : ''}
          <label class="field-label">Cuenta / Tarjeta a debitar</label>
          <select class="field-select v3526-cons-acc">
            ${allAccounts.map((a) => `<option value="${esc(a.id)}" ${matchedAcc?.id === a.id ? 'selected' : ''}>${linker().emojiForAccount(a)} ${esc(a.nombre)} (${esc(a.moneda)})</option>`).join('')}
          </select>
          <label class="field-label">Categoría</label>
          <select class="field-select v3526-cons-cat">
            ${expenseCats.map((c) => `<option value="${esc(c.id)}" ${chosenCatId === c.id ? 'selected' : ''}>${linker().emojiForCategory(c.nombre)} ${esc(c.nombre)}</option>`).join('')}
          </select>
          ${item.isDigital ? `
            <label class="check-line" style="margin-top:8px">
              <input type="checkbox" class="v3526-cons-autodebit" checked>
              <span>⚡ Auto-debitar futuras compras digitales de esta tarjeta (Google / Apps Script)</span>
            </label>
          ` : ''}
          <div class="v3526-btn-row">
            <button type="button" class="primary-btn" data-cons-accept="${esc(item.id)}">✅ Debitar ${isUsd ? '<span class="v3526-cons-btn-dop">' + fmtMoney(dopMinor, 'DOP') + '</span>' : fmtMoney(dopMinor, 'DOP')}</button>
            <button type="button" class="secondary-btn" data-cons-reject="${esc(item.id)}">Omitir</button>
          </div>
        </div>
      `;
    }).join('') : '<div class="notice">✅ No hay consumos bancarios pendientes de confirmar.</div>';
  } else if (type === 'alerts') {
    title = '⏰ Alertas de pago';
    bodyHtml = data.paymentAlerts.length ? data.paymentAlerts.map((al) => `
      <div class="v3526-list-row">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${al.severity === 'vencido' ? '🚨' : '⏰'} ${esc(al.title)}</div>
          <div style="font-size:12px;opacity:.75">Vence: ${esc(al.dueDate)} · ${esc(al.categoryName)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:700">${fmtMoney(al.amountCentavos, al.currency)}</div>
          <button type="button" class="primary-btn" style="padding:5px 9px;font-size:11px;margin-top:4px" data-pay-alert="${esc(al.id)}">💸 Pagar</button>
        </div>
      </div>
    `).join('') : '<div class="notice">✅ No hay pagos urgentes pendientes.</div>';
  } else if (type === 'fiscal-validate' && payload?.item) {
    const it = payload.item;
    const is607 = payload.kind === '607';
    title = is607 ? '🧾 Validar Venta 607 / Hermes' : '🛒 Corregir y Validar Compra 606';
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
          <button type="submit" class="primary-btn">✅ Validar en libro ${is607 ? '607' : '606'}</button>
          <button type="button" class="secondary-btn" id="v3526FiscalVoidBtn">Descartar</button>
        </div>
      </form>
    `;
  } else if (type === 'mail-add') {
    title = '✉️ Conectar otra cuenta Gmail';
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
    title = `📋 Script Gmail (${payload.email})`;
    bodyHtml = `
      <div class="notice">En el Gmail de <b>${esc(payload.email)}</b>, abre <b>script.google.com</b>, pega este código y ejecuta <code>instala()</code>.</div>
      <textarea class="v3526-code-box" readonly id="v3526GsCode">${esc(payload.script || '')}</textarea>
      <div class="v3526-btn-row">
        <button type="button" class="primary-btn full" id="v3526CopyGsBtn">📋 Copiar código completo</button>
      </div>
    `;
  } else if (type === 'mail-register' && payload) {
    const m = payload;
    const isCash = m.kind === 'retiro_codigo_cash';
    const isIn = m.kind.includes('entrada') || m.kind.includes('recibida');
    title = isCash ? '🏧 Anotar Código Cash' : isIn ? '📥 Anotar Transferencia Recibida' : '🔁 Anotar Transferencia';
    bodyHtml = `
      <div class="card" style="padding:11px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700">${esc(m.subject)}</div>
        <div style="font-size:12px;opacity:.78">${esc(m.bank)} · ${fmtMoney(m.amountCentavos, m.currency)} · ${esc(m.date)}</div>
      </div>
      <form id="v3526MailRegForm">
        <label class="field-label" style="margin-top:0">Tipo de registro</label>
        <select class="field-select" name="mr-mode">
          ${isCash ? '<option value="transfer_cash">🔁 Transferir Banco → Caja / Efectivo (recomendado)</option>' : ''}
          <option value="${isIn ? 'ingreso' : 'gasto'}">${isIn ? '💰 Registrar como Ingreso' : '💸 Registrar como Gasto'}</option>
          <option value="mark_registered">✅ Solo marcar como ya anotado</option>
        </select>
        <label class="field-label">${isCash ? 'Banco origen' : 'Cuenta del estudio'}</label>
        <select class="field-select" name="mr-acc">
          ${allAccounts.map((a) => `<option value="${esc(a.id)}">${linker().emojiForAccount(a)} ${esc(a.nombre)} (${esc(a.moneda)})</option>`).join('')}
        </select>
        ${isCash ? `
          <label class="field-label">Caja / Efectivo destino</label>
          <select class="field-select" name="mr-dest">
            ${allAccounts.filter((a) => a.tipo === 'efectivo' || /caja|efectivo/i.test(a.nombre || '')).concat(allAccounts).slice(0, 4).map((a) => `<option value="${esc(a.id)}">${linker().emojiForAccount(a)} ${esc(a.nombre)}</option>`).join('')}
          </select>
        ` : ''}
        <label class="field-label">Categoría (para gastos/ingresos)</label>
        <select class="field-select" name="mr-cat">
          ${expenseCats.map((c) => `<option value="${esc(c.id)}">${linker().emojiForCategory(c.nombre)} ${esc(c.nombre)}</option>`).join('')}
        </select>
        <div class="v3526-btn-row">
          <button type="submit" class="primary-btn full">Confirmar y anotar (${fmtMoney(m.amountCentavos, m.currency)})</button>
        </div>
      </form>
    `;
  }

  const root = document.createElement('div');
  root.id = 'v3526ModalRoot';
  root.className = 'v3526-modal-backdrop';
  root.innerHTML = `
    <section class="v3526-modal-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-header">
        <h2 style="margin:0;font-size:17px">${esc(title)}</h2>
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

  root.querySelectorAll('[data-confirm-cut], [data-mismatch-cut]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.confirmCut || btn.dataset.mismatchCut;
      const decision = btn.dataset.mismatchCut ? 'mismatch' : 'confirm';
      const kind = btn.dataset.cutKind || 'pos_cut';
      if (uiState.mode === 'demo') {
        const target = uiState.data.cuts.find((x) => x.id === id);
        if (target) target.status = decision === 'confirm' ? 'validated' : 'mismatch';
        uiState.data = normalizeInbox(uiState.data);
        showToast(decision === 'confirm' ? '✅ Corte confirmado.' : '⚠️ Descuadre reportado.');
        openModal('cuts');
        scheduleSync();
        return;
      }
      try {
        await apiCall({ action: 'pwaConfirmCut', kind, id, decision });
        await loadInbox();
        showToast('✅ Corte actualizado.');
        openModal('cuts');
        window.DcarelaFinanzasReload?.();
      } catch (err) { showToast(err.message, true); }
    };
  });

  root.querySelectorAll('.v3526-cons-bank').forEach((sel) => {
    sel.onchange = () => {
      const card = sel.closest('.v3526-cons-card');
      const minor = Number(sel.dataset.amount || 0);
      const dop = computeDopCentavos(minor, 'USD', sel.value);
      const formatted = fmtMoney(dop, 'DOP');
      const label = card?.querySelector('.v3526-cons-dop');
      const btnSpan = card?.querySelector('.v3526-cons-btn-dop');
      if (label) label.textContent = formatted;
      if (btnSpan) btnSpan.textContent = formatted;
    };
  });

  root.querySelectorAll('[data-cons-accept], [data-cons-reject]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.consAccept || btn.dataset.consReject;
      const decision = btn.dataset.consReject ? 'reject' : 'accept';
      const card = btn.closest('.v3526-cons-card');
      const bankKey = card?.querySelector('.v3526-cons-bank')?.value || uiState.data?.fx?.selectedBankKey || 'popular';
      const accId = card?.querySelector('.v3526-cons-acc')?.value || '';
      const catId = card?.querySelector('.v3526-cons-cat')?.value || '';
      const autoDebit = Boolean(card?.querySelector('.v3526-cons-autodebit')?.checked);

      if (uiState.mode === 'demo') {
        const target = uiState.data.consumptions.find((x) => x.id === id);
        if (target) target.status = decision === 'reject' ? 'rejected' : 'registered';
        uiState.data = normalizeInbox(uiState.data);
        showToast(decision === 'reject' ? 'Consumo omitido.' : '✅ Consumo debitado y categorizado.');
        openModal('consumptions');
        scheduleSync();
        return;
      }
      try {
        await apiCall({
          action: 'pwaResolveConsumption',
          consumption_id: id,
          decision,
          account_id: accId,
          bank_key: bankKey,
          category_id: catId,
          enable_auto_debit_digital: card?.querySelector('.v3526-cons-autodebit') ? autoDebit : null
        });
        await loadInbox();
        showToast(decision === 'reject' ? 'Consumo rechazado.' : '✅ Consumo debitado.');
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
        showToast('✅ Comprobante fiscal validado.');
        renderFiscalHost();
        scheduleSync();
        return;
      }
      try {
        await apiCall({ action: 'pwaValidateFiscal', kind: payload.kind, id: payload.item.id, decision: 'validate', patch });
        await loadInbox();
        closeModal();
        showToast('✅ Comprobante fiscal guardado.');
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
      try { await navigator.clipboard.writeText(text); showToast('📋 Script copiado al portapapeles.'); }
      catch { showToast('Selecciona y copia el código manualmente.', true); }
    };
  }

  const mailRegForm = root.querySelector('#v3526MailRegForm');
  if (mailRegForm && payload) {
    mailRegForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(mailRegForm);
      const mode = String(fd.get('mr-mode') || 'mark_registered');
      const accountId = String(fd.get('mr-acc') || '');
      const destId = String(fd.get('mr-dest') || '');
      const catId = String(fd.get('mr-cat') || '');

      if (mode === 'transfer_cash') {
        if (uiState.mode === 'demo') {
          payload.registered = true;
          uiState.data = normalizeInbox(uiState.data);
          renderMailHost();
        }
        openNativePrefilled({
          type: 'transferencia',
          cents: payload.amountCentavos,
          accountId,
          destId: destId && destId !== accountId ? destId : undefined,
          note: `Código Cash ${payload.bank}${payload.reference ? ' · ' + payload.reference : ''}`,
          date: payload.date
        });
        return;
      }

      if (uiState.mode === 'demo') {
        payload.registered = true;
        uiState.data = normalizeInbox(uiState.data);
        closeModal();
        showToast('✅ Movimiento de correo registrado.');
        renderMailHost();
        scheduleSync();
        return;
      }
      try {
        await apiCall({
          action: 'pwaRegisterMailMovement',
          id: payload.id,
          mode,
          account_id: accountId,
          category_id: catId,
          bank_key: uiState.data?.fx?.selectedBankKey || 'popular'
        });
        await loadInbox();
        closeModal();
        showToast('✅ Movimiento de correo registrado.');
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
    showToast(nextVal ? '⚡ Auto-débito digital activado.' : 'Auto-débito digital pausado.');
    return;
  }
  try {
    await apiCall({ action: 'pwaToggleAutoDebitRule', id: linkId, link_id: linkId, enabled: nextVal, auto_debit_digital: nextVal });
    await loadInbox();
    showToast(nextVal ? '⚡ Auto-débito digital activado.' : 'Auto-débito pausado.');
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
    showToast('🔔 Simulación: Alertas Push iPhone activadas en Demo.');
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
    showToast('🔔 ¡Alertas Push activadas para este iPhone!');
  } catch (err) {
    showToast(err.message || 'No se pudo suscribir a Web Push.', true);
  } finally {
    uiState.pushBusy = false;
    renderSettingsHost();
  }
}

async function handleTestPush() {
  if (uiState.mode === 'demo') {
    showToast('🧪 Alerta Push simulada recibida.');
    return;
  }
  try {
    const r = await apiCall({ action: 'pwaPushTest' });
    showToast(r?.sent > 0 ? `🧪 Push enviado a ${r.sent} dispositivo(s).` : 'Sin suscripciones Push activas aún.');
  } catch (err) { showToast(err.message, true); }
}

function handleDeepLink(rawUrl) {
  try {
    const u = new URL(rawUrl, location.href);
    const tab = u.searchParams.get('tab');
    const inbox = u.searchParams.get('inbox');
    if (tab && ['mail', 'books', 'settings', 'cards', 'budgets', 'search'].includes(tab)) {
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
  enhanceHeaderAndQuickActions();
  renderInboxStrip();
  simplifyHistoryFilters();
  renderFiscalHost();
  renderMailHost();
  renderSettingsHost();
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
    sc.src = './v35-26-category-emojis.js?v=35.26';
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
    window.addEventListener('dcarela:finanzas-rendered', () => {
      if (uiState.mode === 'live' && !uiState.data && !uiState.loading && window.DcarelaFirebase?.getCurrentUser?.()) {
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
  getState: () => uiState
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
