(function(root, factory) {
  const finance = typeof module === "object" && module.exports
    ? require("./finance-core.js")
    : root?.DcarelaFinanceCore;
  const api = factory(finance);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DcarelaMoneyManagerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(financeCore) {
  "use strict";

  if (!financeCore) throw new Error("Money Manager necesita finance-core.js.");

  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const text = value => String(value ?? "").trim();
  const lower = value => text(value).toLocaleLowerCase("es");
  const monthKey = value => financeCore.businessDay(value).slice(0, 7);
  const activeState = value => !["anulada", "anulado", "cancelada", "cancelado", "pagada", "pagado", "saldada", "saldado", "liquidada", "liquidado", "inactiva", "inactivo", "eliminada", "eliminado"]
    .includes(lower(value));

  function monthBounds(month) {
    const safe = /^\d{4}-\d{2}$/.test(text(month)) ? text(month) : financeCore.businessDay(new Date()).slice(0, 7);
    const [year, monthNumber] = safe.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return { month: safe, from: `${safe}-01`, to: `${safe}-${String(lastDay).padStart(2, "0")}` };
  }

  function sourceOf(movement) {
    if (movement?.origen === "pos_venta") return "venta_automatica";
    if (movement?.tipo === "transferencia") return "transferencia";
    if (["conciliacion", "reconciliacion", "ajuste"].includes(lower(movement?.origen))
      || /^ajuste(?:_|$)/.test(lower(movement?.tipo))) return "conciliacion";
    if (["asistente", "ia"].includes(lower(movement?.origen))) return "asistente";
    if (["pos", "windows", "caja"].includes(lower(movement?.origen))) return "caja_windows";
    return "manual";
  }

  function activeMovements(rows) {
    return financeCore.deduplicateMovements(rows)
      .filter(financeCore.isActiveMovement)
      .sort((left, right) => `${right.fecha || ""} ${right.hora || ""}`.localeCompare(`${left.fecha || ""} ${left.hora || ""}`));
  }

  function summarizeMovements(rows, month) {
    const range = monthBounds(month);
    const totals = financeCore.summarizeMovements(rows, range.from, range.to);
    const movements = totals.movements;
    const income = totals.ingresos_centavos;
    const expenses = totals.gastos_centavos;
    const transfers = movements.filter(item => item.tipo === "transferencia").reduce((sum, item) => sum + number(item.monto_centavos), 0);
    const sales = movements.filter(item => sourceOf(item) === "venta_automatica").reduce((sum, item) => sum + number(item.monto_centavos), 0);
    const manualIncome = movements.filter(item => item.tipo === "ingreso" && item.afecta_resultado !== false && sourceOf(item) !== "venta_automatica")
      .reduce((sum, item) => sum + number(item.monto_centavos), 0);
    return { ...range, movements, income, expenses, transfers, sales, manualIncome, result: income - expenses };
  }

  function accountSummary(accounts, projectedMovements) {
    const rows = (accounts || []).filter(item => item.estado !== "eliminada");
    const balances = rows.map(account => ({
      ...account,
      effective_balance_cents: financeCore.effectiveAccountBalance(account, projectedMovements || []),
    }));
    const netWorth = balances.filter(item => item.incluir_en_total && financeCore.accountCurrency(item) === 'DOP')
      .reduce((sum, item) => sum + item.effective_balance_cents, 0);
    const cardDebt = balances.filter(item => item.tipo === "tarjeta_credito" && financeCore.accountCurrency(item) === 'DOP')
      .reduce((sum, item) => sum + Math.max(0, -item.effective_balance_cents), 0);
    const available = balances.filter(item => item.tipo !== "tarjeta_credito" && item.incluir_en_total && financeCore.accountCurrency(item) === 'DOP')
      .reduce((sum, item) => sum + item.effective_balance_cents, 0);
    const availableByCurrency = financeCore.accountTotalsByCurrency(rows, projectedMovements || [], item => item.tipo !== 'tarjeta_credito' && item.incluir_en_total);
    return { rows: balances, netWorth, cardDebt, available, availableByCurrency };
  }

  const KEYWORD_STOPWORDS = new Set([
    "para", "como", "desde", "hasta", "entre", "sobre", "tras", "bajo", "pago", "pagos",
    "cuota", "cuotas", "factura", "facturas", "recibo", "consumo", "banco", "popular",
    "banreservas", "transferencia", "efectivo", "cheque", "pendiente", "abono", "mensual", "quincenal",
    "semanal", "estudio", "central", "plaza", "artesanal", "carela", "dcarela", "local",
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
    "octubre", "noviembre", "diciembre", "prestamo", "prestamos", "deuda", "servicio",
    "servicios", "suscripcion", "compra", "cargo", "credito", "debito", "identificar",
    "motor", "medico", "viajante", "gasto", "proveedor",
    "por", "con", "sin", "del", "las", "los", "una", "uno", "unos", "unas", "the", "and",
    "com", "net", "org", "www", "dop", "usd", "eirl", "srl", "inc", "corp"
  ]);

  const KEYWORD_SYNONYM_GROUPS = [
    { key: "fotoquimsa", phrases: ["fotoquimsa", "ramon martinez", "viajante fotoquimsa", "quimsa"], tokens: ["fotoquimsa", "quimsa"] },
    { key: "alquiler", phrases: ["alquiler", "renta", "arrendamiento", "factura local", "pago local", "pago del local", "alquiler local", "renta local", "local comercial"], tokens: ["alquiler", "renta", "arrendamiento"] },
    { key: "pion", phrases: ["pion", "motoprestamo", "motoprestamos", "motoprestamos pion"], tokens: ["pion", "motoprestamo", "motoprestamos"] },
    { key: "paredes", phrases: ["paredes", "adrian paredes", "adrian paredes prestamos"], tokens: ["paredes", "adrian"] },
    { key: "edeeste", phrases: ["edeeste", "edeste", "energia electrica", "factura luz"], tokens: ["edeeste", "edeste"] },
    { key: "wind", phrases: ["wind", "wind telecom", "windtelecom"], tokens: ["wind", "windtelecom"] },
    { key: "claro", phrases: ["claro", "codetel", "claro dominicana"], tokens: ["claro", "codetel"] },
    { key: "altice", phrases: ["altice", "tricom"], tokens: ["altice", "tricom"] },
    { key: "adobe", phrases: ["adobe", "creative cloud", "lightroom", "photoshop", "acrobat"], tokens: ["adobe", "lightroom", "photoshop", "acrobat"] },
    { key: "antigravity", phrases: ["google antigravity", "google ai pro", "google ai ultra", "google one"], tokens: ["antigravity", "googleone"] },
    { key: "chatgpt", phrases: ["chatgpt", "openai", "codex"], tokens: ["chatgpt", "openai", "codex"] },
    { key: "claude", phrases: ["claude", "anthropic", "antropic"], tokens: ["claude", "anthropic", "antropic"] },
    { key: "viegas", phrases: ["viegas", "viegas academy", "skool", "skool.com"], tokens: ["viegas", "skool"] },
    { key: "contable", phrases: ["contable", "contabilidad", "contador", "iguala contable", "auditoria"], tokens: ["contable", "contabilidad", "contador", "auditoria"] },
    { key: "nomina", phrases: ["nomina", "salario", "salarios", "sueldo", "sueldos", "quincena", "empleada", "empleados", "empleado"], tokens: ["nomina", "salario", "salarios", "sueldo", "sueldos", "quincena"] },
    { key: "genesis", phrases: ["genesis", "genesis brito"], tokens: ["genesis"] },
    { key: "google", phrases: ["google", "google cloud", "google workspace", "gsuite", "gemini"], tokens: ["google", "gsuite", "gemini"] },
    { key: "apple", phrases: ["apple", "icloud", "apple.com", "itunes", "app store"], tokens: ["apple", "icloud", "itunes"] },
    { key: "meta", phrases: ["meta", "facebook", "facebk", "instagram"], tokens: ["meta", "facebook", "facebk", "instagram"] },
    { key: "microsoft", phrases: ["microsoft", "office 365", "microsoft 365", "onedrive"], tokens: ["microsoft", "onedrive"] },
    { key: "agua", phrases: ["inapa", "caasd", "coraasan", "botellon", "botellones"], tokens: ["inapa", "caasd", "coraasan", "botellon", "botellones"] },
    { key: "basura", phrases: ["basura", "ayuntamiento", "recogida de basura"], tokens: ["basura", "ayuntamiento"] }
  ];

  function normalizeKeywordText(value) {
    return lower(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function parseExplicitKeywords(rawValue) {
    const items = Array.isArray(rawValue)
      ? rawValue
      : typeof rawValue === "string"
        ? rawValue.split(/[,;\n|]+/)
        : [];
    return [...new Set(items.map(v => normalizeKeywordText(v).replace(/\./g, " ").replace(/\s+/g, " ").trim()).filter(v => v.length >= 2))];
  }

  function extractLineNumbers(value) {
    const matches = String(value || "").match(/\b\d{4}\b/g) || [];
    return [...new Set(matches.filter(n => {
      const y = Number(n);
      return !(y >= 2020 && y <= 2035);
    }))];
  }

  function isSyntheticTaxMovement(movement) {
    const id = text(movement?.id);
    const desc = normalizeKeywordText(movement?.descripcion);
    return id.endsWith("-tax") || text(movement?.subtipo) === "impuesto_dgii_020" || desc.startsWith("impuesto dgii 0.20");
  }

  function extractCommitmentKeywords(item) {
    const raw = item?.raw && typeof item.raw === "object" ? item.raw : (item || {});
    const meta = raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : {};
    // Nota libre suele mencionar bancos ("Popular") o fechas y generaría falsos positivos.
    const headingParts = [
      item?.name,
      raw?.nombre,
      raw?.concepto,
      raw?.descripcion,
      raw?.acreedor,
      raw?.proveedor,
      raw?.grupo_factura,
      raw?.recurrenteNombre,
      raw?.recurrente_nombre,
      meta?.acreedor,
      meta?.proveedor
    ].filter(Boolean);
    const explicitList = [
      ...parseExplicitKeywords(item?.palabras_clave ?? item?.palabrasClave ?? item?.keywords),
      ...parseExplicitKeywords(raw?.palabras_clave ?? raw?.palabrasClave ?? raw?.keywords),
      ...parseExplicitKeywords(meta?.palabras_clave ?? meta?.palabrasClave ?? meta?.keywords)
    ];
    const headingNorm = normalizeKeywordText(headingParts.join(" "));
    const baseWords = headingNorm
      .replace(/\./g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 4 && !KEYWORD_STOPWORDS.has(w) && !/^\d+$/.test(w));

    const phrases = new Set(explicitList.filter(k => k.includes(" ")));
    const tokens = new Set([...baseWords, ...explicitList.filter(k => !k.includes(" "))]);
    const groups = new Set();
    const paddedHeading = ` ${headingNorm} ${explicitList.join(" ")} `;

    for (const grp of KEYWORD_SYNONYM_GROUPS) {
      const hitPhrase = grp.phrases.some(p => paddedHeading.includes(` ${p} `));
      const hitToken = grp.tokens.some(t => tokens.has(t));
      if (hitPhrase || hitToken) {
        groups.add(grp.key);
        grp.phrases.forEach(p => { if (p.includes(" ")) phrases.add(p); });
        grp.tokens.forEach(t => tokens.add(t));
      }
    }

    const lineNumbers = extractLineNumbers(`${headingParts.join(" ")} ${explicitList.join(" ")}`);
    return {
      phrases: [...phrases],
      tokens: [...tokens],
      explicit: [...new Set(explicitList)],
      lineNumbers,
      groups: [...groups],
      headingNorm
    };
  }

  function targetKeywordContext(target) {
    if (typeof target === "string") {
      const norm = normalizeKeywordText(target);
      return { norm, tokens: norm.replace(/\./g, " ").split(/\s+/).filter(Boolean), lineNumbers: extractLineNumbers(target), rawText: target };
    }
    const meta = target?.metadata && typeof target.metadata === "object" ? target.metadata : {};
    const fields = [
      target?.name,
      target?.nombre,
      target?.concepto,
      target?.descripcion,
      target?.payee,
      target?.proveedor,
      target?.acreedor,
      target?.recurrenteNombre,
      target?.recurrente_nombre,
      target?.referencia,
      meta?.acreedor,
      meta?.proveedor,
      meta?.merchant,
      ...(Array.isArray(target?.palabras_clave) ? target.palabras_clave : []),
      ...(Array.isArray(target?.raw?.palabras_clave) ? target.raw.palabras_clave : []),
      target?.raw?.nombre,
      target?.raw?.concepto,
      target?.raw?.acreedor,
      target?.raw?.proveedor
    ].filter(Boolean);
    const rawText = fields.join(" ");
    const norm = normalizeKeywordText(rawText);
    return { norm, tokens: norm.replace(/\./g, " ").split(/\s+/).filter(Boolean), lineNumbers: extractLineNumbers(rawText), rawText };
  }

  function matchesCommitmentKeywords(commitmentOrKw, target) {
    if (!target) return { matched: false, score: 0, matchedTerms: [] };
    if (typeof target === "object" && isSyntheticTaxMovement(target)) {
      return { matched: false, score: 0, matchedTerms: [] };
    }
    const kw = Array.isArray(commitmentOrKw?.tokens) ? commitmentOrKw : extractCommitmentKeywords(commitmentOrKw);
    if (!kw.phrases.length && !kw.tokens.length && !kw.explicit.length) {
      return { matched: false, score: 0, matchedTerms: [] };
    }
    const ctx = targetKeywordContext(target);
    if (!ctx.norm) return { matched: false, score: 0, matchedTerms: [] };

    if (kw.groups.includes("edeeste")) {
      const descNorm = normalizeKeywordText(typeof target === "object" ? (target?.descripcion || target?.name || "") : target);
      const descTokens = descNorm.replace(/\./g, " ").split(/\s+/).filter(Boolean);
      const hasCasa = ctx.tokens.includes("casa") || descTokens.includes("casa");
      const hasCommercial = descTokens.some(t => t === "estudio" || t === "local" || t === "dcarela") ||
        (!hasCasa && ctx.tokens.some(t => t === "edeeste" || t === "edeste" || t === "estudio" || t === "local"));
      if (hasCasa && !hasCommercial) return { matched: false, score: 0, matchedTerms: [] };
    }

    if (kw.groups.includes("alquiler")) {
      const idText = normalizeKeywordText(typeof target === "object"
        ? [target?.descripcion, target?.name, target?.nombre, target?.concepto, target?.payee, target?.proveedor, target?.acreedor].filter(Boolean).join(" ")
        : target);
      const hasOtherDomain = /\b(nomina|salario|salarios|sueldo|sueldos|contable|contabilidad|contador|auditoria|prestaciones|vacaciones|genesis|ashley|denni)\b/.test(idText);
      const hasExplicitRent = /\b(alquiler|renta|arrendamiento|local)\b/.test(idText);
      if (hasOtherDomain && !hasExplicitRent) return { matched: false, score: 0, matchedTerms: [] };
    }

    if (kw.groups.includes("contable")) {
      const idText = normalizeKeywordText(typeof target === "object"
        ? [target?.descripcion, target?.name, target?.nombre, target?.concepto, target?.payee, target?.proveedor, target?.acreedor].filter(Boolean).join(" ")
        : target);
      const hasOtherDomain = /\b(alquiler|renta|arrendamiento|nomina|sueldo|sueldos|salario|salarios|genesis|ashley)\b/.test(idText);
      const hasExplicitAccounting = /\b(contable|contabilidad|contador|auditoria|denni)\b/.test(idText);
      if (hasOtherDomain && !hasExplicitAccounting) return { matched: false, score: 0, matchedTerms: [] };
    }

    if (kw.lineNumbers.length > 0 && ctx.lineNumbers.length > 0) {
      const commonLine = kw.lineNumbers.some(n => ctx.lineNumbers.includes(n));
      if (!commonLine) return { matched: false, score: 0, matchedTerms: [] };
    }

    const padded = ` ${ctx.norm.replace(/\./g, " ")} `;
    const paddedRawNorm = ` ${ctx.norm} `;
    const targetTokenSet = new Set(ctx.tokens);
    let score = 0;
    const matchedTerms = [];

    for (const phrase of kw.phrases) {
      if (padded.includes(` ${phrase} `) || paddedRawNorm.includes(` ${phrase} `)) {
        score += 3;
        matchedTerms.push(phrase);
      }
    }

    for (const token of kw.tokens) {
      if (targetTokenSet.has(token)) {
        score += 2;
        if (!matchedTerms.includes(token)) matchedTerms.push(token);
      } else if (token.length >= 5) {
        const stemHit = ctx.tokens.some(t => t.length >= 5 && (t.startsWith(token) || token.startsWith(t)) && Math.min(t.length, token.length) >= 5);
        if (stemHit) {
          score += 1;
          if (!matchedTerms.includes(token)) matchedTerms.push(token);
        }
      }
    }

    if (kw.lineNumbers.some(n => ctx.lineNumbers.includes(n))) {
      score += 2;
    }

    return { matched: score >= 2, score, matchedTerms };
  }

  function itemPreferenceRank(item) {
    const loanBonus = isLoanType(item?.type) || item?.capital != null || Number(item?.raw?.cuotas_totales) > 0 ? 4 : 0;
    const sourceScore = item?.source === "factura" ? 3 : item?.source === "compromiso" ? 2 : 1;
    const keywordBonus = Array.isArray(item?.raw?.palabras_clave) && item.raw.palabras_clave.length > 0 ? 1 : 0;
    return loanBonus + sourceScore + keywordBonus;
  }

  function duplicateRefFrom(item) {
    const raw = item?.raw || {};
    return {
      id: item.id,
      legacyId: item.legacyId || (item.source === "factura" ? text(raw.id || raw.obligacionId) : "") || null,
      recurringId: item.recurringId || (item.source === "planificado" ? text(raw.id || raw.recurrenteId) : "") || null,
      nativeId: item.source === "compromiso" ? text(item.id || raw.id) : null,
      source: item.source,
      name: item.name
    };
  }

  function deduplicateObligationItems(items) {
    const ordered = items.slice().sort((a, b) => itemPreferenceRank(b) - itemPreferenceRank(a));
    const kept = [];
    for (const item of ordered) {
      if (!item?.active) {
        kept.push(item);
        continue;
      }
      const amtA = number(item.outstanding ?? item.periodAmount);
      const dueA = text(item.due);
      const monthA = dueA.slice(0, 7);
      const existing = kept.find(prev => {
        if (!prev?.active) return false;
        // Solo colapsa duplicados entre colecciones distintas y con mismo monto/vencimiento.
        if (prev.source === item.source) return false;
        const dueB = text(prev.due);
        const monthB = dueB.slice(0, 7);
        const sameDue = Boolean(dueA && dueB && dueA === dueB);
        const amtB = number(prev.outstanding ?? prev.periodAmount);
        if (amtA > 0 && amtB > 0 && Math.abs(amtA - amtB) > 100) return false;
        const sameMonthAndAmount = Boolean(monthA && monthB && monthA === monthB && amtA > 0 && amtB > 0 && Math.abs(amtA - amtB) <= 100);
        if (!sameDue && !sameMonthAndAmount) return false;
        const hit = matchesCommitmentKeywords(prev, item);
        return hit.matched;
      });
      if (!existing) {
        kept.push(item);
      } else {
        const refs = Array.isArray(existing.duplicateRefs) ? existing.duplicateRefs : [];
        refs.push(duplicateRefFrom(item));
        existing.duplicateRefs = refs;
      }
    }
    return kept;
  }

  function linkedPaymentsForCommitment(item, { commitmentPayments = [], costPayments = [], movements = [], costObligations = [] } = {}) {
    if (!item) return [];
    const raw = item.raw || {};
    const dupRefs = Array.isArray(item.duplicateRefs) ? item.duplicateRefs : [];
    const facturaIds = new Set([
      item.source === "factura" ? text(raw.id || raw.obligacionId || item.legacyId) : "",
      ...dupRefs.map(d => text(d.legacyId))
    ].filter(Boolean));
    const nativeIds = new Set([
      item.source === "compromiso" ? text(raw.id || item.id) : "",
      ...dupRefs.map(d => text(d.nativeId))
    ].filter(Boolean));
    const recurringIds = new Set([
      item.recurringId,
      raw.recurrente_id,
      raw.recurrenteId,
      ...dupRefs.map(d => text(d.recurringId))
    ].map(text).filter(Boolean));

    const siblingFacturaIds = new Set();
    for (const ob of costObligations) {
      const recId = text(ob?.recurrenteId || ob?.recurrente_id);
      const obId = text(ob?.id || ob?.obligacionId);
      if (recId && recurringIds.has(recId) && obId && !facturaIds.has(obId)) {
        siblingFacturaIds.add(obId);
      }
    }

    const out = [];
    const seenIds = new Set();
    const seenMovementIds = new Set();
    const seenDayAmount = new Set();

    const pushRow = row => {
      const key = `${row.linkedBy}:${row.id}`;
      if (seenIds.has(key)) return;
      seenIds.add(key);
      if (row.movimientoId) seenMovementIds.add(text(row.movimientoId));
      const dayAmt = row.fecha && Number.isSafeInteger(row.monto_centavos) ? `${row.fecha}|${row.monto_centavos}` : "";
      if (dayAmt) seenDayAmount.add(dayAmt);
      out.push(row);
    };

    for (const p of costPayments) {
      const obId = text(p?.obligacionId || p?.obligacion_id);
      if (!obId || (!facturaIds.has(obId) && !siblingFacturaIds.has(obId))) continue;
      const isDirect = facturaIds.has(obId);
      pushRow({
        id: text(p?.id || p?.pagoId || `${obId}:${p?.pagadoEn || p?.fecha}`),
        fecha: financeCore.businessDay(p?.pagadoEn || p?.fecha || p?.created_at || "") || text(p?.pagadoEn || p?.fecha),
        monto_centavos: number(p?.montoCentavos ?? p?.monto_centavos),
        descripcion: text(p?.nota || p?.referencia || item.name),
        estado: text(p?.estado || "Registrado"),
        metodoPago: text(p?.metodoPago || p?.metodo_pago),
        referencia: text(p?.referencia),
        movimientoId: text(p?.movimientoId || p?.movimiento_id) || null,
        linkedBy: isDirect ? "direct" : "sibling",
        matchedTerms: []
      });
    }

    for (const p of commitmentPayments) {
      const cId = text(p?.compromiso_id || p?.compromisoId);
      if (!cId || !nativeIds.has(cId)) continue;
      pushRow({
        id: text(p?.id || `${cId}:${p?.fecha}`),
        fecha: financeCore.businessDay(p?.fecha || p?.created_at || "") || text(p?.fecha),
        monto_centavos: number(p?.monto_centavos ?? p?.montoCentavos),
        descripcion: text(p?.nota || item.name),
        estado: text(p?.estado || "Registrado"),
        metodoPago: text(p?.metodo_pago || p?.metodoPago),
        referencia: text(p?.referencia),
        movimientoId: text(p?.movimiento_id || p?.movimientoId) || null,
        linkedBy: "direct",
        matchedTerms: []
      });
    }

    const kw = extractCommitmentKeywords(item);
    const claimedByOtherIds = new Set();
    for (const p of costPayments || []) {
      const oid = text(p?.obligacionId || p?.obligacion_id);
      if (oid && !facturaIds.has(oid) && !siblingFacturaIds.has(oid)) {
        const pMid = text(p?.movimientoId || p?.movimiento_id);
        if (pMid) claimedByOtherIds.add(pMid);
      }
    }
    for (const o of costObligations || []) {
      const oid = text(o?.id || o?.obligacionId);
      if (oid && !facturaIds.has(oid) && !siblingFacturaIds.has(oid)) {
        const pMid = text(o?.ultimo_pago_movimiento_id || o?.ultimoPagoMovimientoId);
        if (pMid) claimedByOtherIds.add(pMid);
      }
    }
    for (const p of commitmentPayments || []) {
      const cid = text(p?.compromiso_id || p?.compromisoId);
      if (cid && !nativeIds.has(cid)) {
        for (const cand of [p?.movimiento_id, p?.movimientoId, ...(Array.isArray(p?.ledger_ids) ? p.ledger_ids : [])]) {
          const pMid = text(cand);
          if (pMid) claimedByOtherIds.add(pMid);
        }
      }
    }

    for (const m of activeMovements(movements)) {
      if (m?.tipo && m.tipo !== "gasto") continue;
      if (isSyntheticTaxMovement(m)) continue;
      const mid = text(m?.id);
      if (mid && seenMovementIds.has(mid)) continue;
      const mDate = financeCore.businessDay(m?.fecha || m?.created_at || "") || text(m?.fecha);
      const mCents = number(m?.monto_centavos ?? m?.montoCentavos);
      const directOb = text(m?.obligacion_id || m?.obligacionId);
      const directComp = text(m?.compromiso_id || m?.compromisoId);
      const directRec = text(m?.recurrente_id || m?.recurrenteId);
      const explicitMatch =
        (directOb && (facturaIds.has(directOb) || siblingFacturaIds.has(directOb))) ||
        (directComp && nativeIds.has(directComp)) ||
        (directRec && recurringIds.has(directRec));

      if (!explicitMatch) {
        if (directOb || directComp) continue;
        if (mid && claimedByOtherIds.has(mid)) continue;
        if (mDate && mCents > 0 && seenDayAmount.has(`${mDate}|${mCents}`)) continue;
      }

      const hit = explicitMatch ? { matched: true, matchedTerms: [] } : matchesCommitmentKeywords(kw, m);
      if (!hit.matched) continue;

      pushRow({
        id: mid || `${mDate}:${mCents}`,
        fecha: mDate,
        monto_centavos: mCents,
        descripcion: text(m?.descripcion || m?.payee || m?.categoria || item.name),
        estado: explicitMatch ? "Vinculado en libro" : "Asociado por palabras clave",
        metodoPago: text(m?.metodo_pago || m?.metodoPago),
        referencia: text(m?.referencia),
        movimientoId: mid || null,
        linkedBy: explicitMatch ? "direct" : "keyword",
        matchedTerms: hit.matchedTerms || []
      });
    }

    return out.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  }

  function matchFixedCommitmentForMovement(movementOrText, items = []) {
    const activeItems = (items || []).filter(item => item && item.active !== false);
    if (!activeItems.length) return null;
    const target = typeof movementOrText === "string" ? { descripcion: movementOrText } : (movementOrText || {});
    if (isSyntheticTaxMovement(target)) return null;
    const expectedCents = number(target?.monto_centavos ?? target?.montoCentavos);
    const scored = [];
    for (const item of activeItems) {
      const hit = matchesCommitmentKeywords(item, target);
      if (!hit.matched) continue;
      let bonus = 0;
      const refCents = number(item.periodAmount || item.outstanding);
      if (expectedCents > 0 && refCents > 0 && Math.abs(expectedCents - refCents) <= Math.max(100, Math.round(refCents * 0.1))) {
        bonus = 1;
      }
      scored.push({ item, score: hit.score + bonus, matchedTerms: hit.matchedTerms });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    if (scored.length > 1 && scored[0].score === scored[1].score) return null;
    return scored[0];
  }

  function legacyObligation(item) {
    const state = lower(item?.estado || "pendiente");
    const due = financeCore.businessDay(item?.venceEn || item?.vence_en || item?.fechaVencimiento || item?.proximo_vencimiento || "");
    const balance = number(item?.saldoCentavos ?? item?.saldo_centavos ?? item?.montoCentavos ?? item?.monto_centavos);
    return {
      id: `legacy:${item?.id || item?.obligacionId || item?.concepto || due}`,
      legacyId: item?.id || item?.obligacionId || null,
      source: "factura",
      name: item?.concepto || item?.descripcion || "Obligacion",
      type: lower(item?.tipo || item?.categoria),
      due,
      periodAmount: balance,
      outstanding: balance,
      active: balance > 0 && state !== "pago_por_verificar" && activeState(state),
      state,
      raw: item,
    };
  }

  function nativeCommitment(item) {
    const state = lower(item?.estado || (item?.activo === false ? "inactivo" : "activo"));
    const outstanding = item?.saldo_pendiente_centavos == null ? null : number(item.saldo_pendiente_centavos);
    const loan = isLoanType(item?.tipo);
    const complete = number(item?.cuotas_totales) > 0 && number(item?.cuotas_pagadas) >= number(item.cuotas_totales);
    const settled = loan && (outstanding === 0 || (complete && outstanding == null));
    const periodAmount = number(item?.monto_centavos);
    return {
      id: text(item?.id),
      source: "compromiso",
      name: item?.nombre || "Compromiso",
      type: lower(item?.tipo),
      due: financeCore.businessDay(item?.proximo_vencimiento || item?.fecha_inicio || ""),
      periodAmount: loan && outstanding != null ? Math.min(periodAmount, Math.max(0, outstanding)) : periodAmount,
      outstanding,
      capital: item?.capital_pendiente_centavos == null ? null : number(item.capital_pendiente_centavos),
      active: item?.activo !== false && activeState(state) && !settled,
      needsReview: loan && complete && outstanding > 0,
      state,
      raw: item,
    };
  }

  function isLoanType(value) {
    // "Deuda de internet" o "cuota de servicio" no clasifican un prestamo.
    return ["prestamo", "prestamos", "loan"].includes(lower(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  }

  function plannedObligation(item) {
    return {
      id: `plan:${item?.id || item?.recurrenteId || item?.nombre}`,
      recurringId: item?.id || item?.recurrenteId || null,
      source: "planificado",
      name: item?.nombre || item?.descripcion || "Pago planificado",
      type: lower(item?.categoria || item?.tipo || "servicio"),
      due: financeCore.businessDay(item?.proximaFecha || item?.proxima_fecha || ""),
      periodAmount: number(item?.montoEstimadoCentavos ?? item?.monto_estimado_centavos),
      outstanding: number(item?.montoEstimadoCentavos ?? item?.monto_estimado_centavos),
      active: item?.activo !== false && item?.activo !== 0,
      state: "previsto",
      raw: item,
    };
  }

  function obligationSummary({ commitments = [], costObligations = [], costRecurrents = [], month } = {}) {
    const range = monthBounds(month);
    const native = commitments.map(nativeCommitment);
    const nativeIds = new Set(native.map(item => item.id).filter(Boolean));
    const legacy = costObligations.map(legacyObligation)
      .filter(item => !nativeIds.has(text(item.legacyId)));
    const materializedRecurringKeys = new Set(costObligations.flatMap(item => {
      const recurringId = text(item?.recurrenteId || item?.recurrente_id);
      const due = financeCore.businessDay(item?.venceEn || item?.vence_en || item?.fechaVencimiento || "");
      return [text(item?.periodoClave || item?.periodo_clave), recurringId && due ? `${recurringId}:${due}` : ""];
    }).filter(Boolean));
    // Algunas facturas anteriores no guardaron recurrenteId. El mismo concepto
    // y vencimiento ya materializados representan esa cuota, incluso si fue
    // pagada parcialmente. No se infiere un pago ni se modifica su saldo.
    const materializedNames = new Set(costObligations.map(item => {
      const name = lower(item?.concepto || item?.descripcion).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
      const due = financeCore.businessDay(item?.venceEn || item?.vence_en || item?.fechaVencimiento || "");
      return name && due ? `${name}|${due}` : "";
    }).filter(Boolean));
    const planned = costRecurrents.map(plannedObligation).filter(item => {
      if (!item.active || !item.due || item.periodAmount <= 0) return false;
      if (item.recurringId && materializedRecurringKeys.has(`${text(item.recurringId)}:${item.due}`)) return false;
      const name = lower(item.name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
      if (materializedNames.has(`${name}|${item.due}`)) return false;
      return item.due <= range.to;
    });
    const rows = deduplicateObligationItems([...native, ...legacy, ...planned].filter(item => item.active));
    // Un pago declarado pero sin conciliación no equivale a una deuda saldada.
    // Se muestra para revisión, fuera de los totales pagaderos, sin reabrirlo.
    const review = legacy.filter(item => item.state === "pago_por_verificar" && item.outstanding > 0);
    const current = rows.filter(item => item.due >= range.from && item.due <= range.to);
    const overdue = rows.filter(item => item.due && item.due < range.from);
    const dueNow = [...overdue, ...current];
    const isLoan = item => isLoanType(item.type);
    const nativeLoans = rows.filter(item => item.source === "compromiso" && isLoan(item));
    const legacyLoans = rows.filter(item => item.source === "factura" && isLoan(item));
    const unknownLoanBalances = nativeLoans.filter(item => item.outstanding == null).length;
    const unknownLoanCapitals = nativeLoans.filter(item => item.capital == null).length;
    const loanDebt = nativeLoans.reduce((sum, item) => sum + Math.max(0, item.outstanding || 0), 0);
    // Los compromisos viejos viven como cuotas materializadas. Se suman sus
    // saldos pendientes una sola vez; no se confunden servicios o nomina con
    // deuda, ni se agrega de nuevo el plan recurrente que las genero.
    const legacyLoanDebt = legacyLoans.reduce((sum, item) => sum + Math.max(0, item.outstanding || 0), 0);
    const loanCapital = nativeLoans.reduce((sum, item) => sum + Math.max(0, item.capital || 0), 0);
    return {
      ...range,
      rows,
      review,
      current,
      overdue,
      dueNow,
      currentDue: current.reduce((sum, item) => sum + Math.max(0, item.periodAmount || item.outstanding || 0), 0),
      overdueDue: overdue.reduce((sum, item) => sum + Math.max(0, item.periodAmount || item.outstanding || 0), 0),
      payableNow: dueNow.reduce((sum, item) => sum + Math.max(0, item.periodAmount || item.outstanding || 0), 0),
      loanDebt: unknownLoanBalances ? null : loanDebt + legacyLoanDebt,
      loanCapital: unknownLoanCapitals || legacyLoans.length ? null : loanCapital,
      unknownLoanBalances,
      unknownLoanCapitals: unknownLoanCapitals + legacyLoans.length,
      plannedMissing: planned,
    };
  }

  function calendar(rows, month) {
    const range = monthBounds(month);
    const [year, monthNumber] = range.month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1, 12);
    const leading = (first.getDay() + 6) % 7;
    const daysInMonth = Number(range.to.slice(-2));
    const byDay = new Map();
    const allMovements = financeCore.deduplicateMovements(rows);
    activeMovements(allMovements).filter(item => monthKey(item.fecha) === range.month).forEach(item => {
      const day = item.fecha;
      const summary = byDay.get(day) || { income: 0, expenses: 0, transfers: 0, count: 0 };
      if (item.tipo === "ingreso" && item.afecta_resultado !== false) summary.income += number(item.monto_centavos);
      if (item.tipo === "gasto" && item.afecta_resultado !== false) summary.expenses += number(item.monto_centavos);
      summary.expenses += financeCore.transferCommissionCents(item, allMovements);
      if (item.tipo === "transferencia") summary.transfers += number(item.monto_centavos);
      summary.count += 1;
      byDay.set(day, summary);
    });
    const cells = [];
    for (let index = 0; index < leading; index++) cells.push({ outside: true });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${range.month}-${String(day).padStart(2, "0")}`;
      cells.push({ outside: false, day, date, ...(byDay.get(date) || { income: 0, expenses: 0, transfers: 0, count: 0 }) });
    }
    while (cells.length % 7) cells.push({ outside: true });
    return { ...range, cells };
  }

  function filterMovements(rows, filters = {}) {
    const query = lower(filters.query);
    return activeMovements(rows).filter(item => {
      if (filters.type && item.tipo !== filters.type) return false;
      if (filters.accountId && item.cuenta_id !== filters.accountId && item.cuenta_destino_id !== filters.accountId) return false;
      if (filters.source && sourceOf(item) !== filters.source) return false;
      if (filters.day && item.fecha !== filters.day) return false;
      if (!query) return true;
      return [item.descripcion, item.payee, item.nota, item.venta_folio].some(value => lower(value).includes(query));
    });
  }

  function obligationDisplayAmount(item) {
    if (!item || typeof item !== "object") return { amount: null, verified: false, kind: "unverified" };
    if (Number.isSafeInteger(item.outstanding)) {
      return { amount: item.outstanding, verified: true, kind: "balance" };
    }
    const period = Number(item.periodAmount);
    if (!isLoanType(item.type) && Number.isSafeInteger(period) && period > 0) {
      return { amount: period, verified: true, kind: "installment" };
    }
    return { amount: null, verified: false, kind: "unverified" };
  }

  return {
    monthBounds,
    sourceOf,
    activeMovements,
    summarizeMovements,
    accountSummary,
    obligationSummary,
    obligationDisplayAmount,
    isLoanType,
    normalizeKeywordText,
    parseExplicitKeywords,
    extractCommitmentKeywords,
    matchesCommitmentKeywords,
    deduplicateObligationItems,
    linkedPaymentsForCommitment,
    matchFixedCommitmentForMovement,
    calendar,
    filterMovements,
  };
});
