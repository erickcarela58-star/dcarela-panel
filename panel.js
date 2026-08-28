(() => {
  "use strict";

  document.documentElement.dataset.panelModule = "started";
  const $ = id => document.getElementById(id);
  const cfg = JSON.parse(localStorage.getItem("dcarela.cfg") || "null") || window.__DCARELA_DEFAULT || null;
  // Sucursal por URL (?b=<business_id>) para paneles divididos con una sola
  // publicacion. El parametro manda; sin el, la publicacion usa su negocio por
  // defecto. Cada sucursal se abre con su propia direccion y ve solo sus datos.
  const _urlBiz = (() => {
    try {
      const raw = new URLSearchParams(location.search).get("b") || "";
      return /^[a-z0-9][a-z0-9-]{1,60}$/i.test(raw) ? raw : "";
    } catch { return ""; }
  })();
  const BUSINESS = _urlBiz || window.__DCARELA_DEFAULT?.business || cfg?.business || "dcarela";
  const EMBEDDED = new URLSearchParams(location.search).get("embedded") === "1";
  document.documentElement.classList.add("embedded-panel");
  if (EMBEDDED) {
    document.documentElement.classList.add("is-embedded");
    document.body?.classList.add("is-embedded");
  }
  const THEME_KEY = "dcarela.ui.theme";
  const APP_BUILD = "1.0.50";

  window.cargarFinanzas = async function(force = false) {
    try {
      if (typeof cargarProveedores === "function") await cargarProveedores(force);
      if (typeof cargarCuentasFin === "function") {
        const m = document.getElementById("provMes")?.value || new Date().toISOString().slice(0, 7);
        await cargarCuentasFin(m);
      }
    } catch (err) {
      console.warn("cargarFinanzas:", err);
    }
  };
  async function cargarFinanzas(force = false) {
    return window.cargarFinanzas(force);
  }
  let currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  let installPrompt = null;
  let updateReloading = false;
  function applyTheme(theme, persist = true) {
    currentTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.classList.toggle("dark", currentTheme === "dark");
    document.documentElement.style.colorScheme = currentTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", currentTheme === "dark" ? "#09090b" : "#fafafa");
    if (persist) {
      try { localStorage.setItem(THEME_KEY, currentTheme); } catch {}
    }
    [$("btnTema"), $("btnTemaAcceso")].filter(Boolean).forEach(button => {
      const label = currentTheme === "dark" ? "Usar modo claro" : "Usar modo oscuro";
      button.title = label;
      button.setAttribute("aria-label", label);
    });
  }
  applyTheme(currentTheme, false);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    const button = $("btnInstallPwa");
    if (button) {
      button.disabled = false;
      button.textContent = "Instalar como aplicación";
    }
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    const button = $("btnInstallPwa");
    if (button) button.textContent = "Aplicación instalada";
  });
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (updateReloading) return;
    updateReloading = true;
    location.reload();
  });
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.data?.type !== "dcarela:theme") return;
    applyTheme(event.data.theme, true);
  });
  const READ_KEY = `dcarela.alertas.leidas.${BUSINESS}`;
  const RELEVANT_EVENTS = [
    "CierreConDiferencia", "ErrorSincronizacion", "BackupSnapshotFallido", "VentaCancelada",
    "DevolucionRegistrada", "InventarioBajo", "ProductoAgotado", "DispositivoBloqueado",
    "CajaAbierta", "CajaCerrada", "CompraCreditoProveedorRegistrada", "PagoProveedorRegistrado",
    "GastoRegistrado", "GastoEditado", "GastoEliminado", "CostoRecurrenteGuardado",
    "CostoObligacionGenerada", "CostoObligacionGuardada", "CostoPagoRegistrado",
    "CostoObligacionAnulada", "ReciboPagoEmitido", "ReciboPagoFirmaActualizada",
    "ReciboPagoAnulado", "ActualizacionDisponible", "ErrorCajonDinero", "ErrorImpresionCorte",
    "TransferenciaPendiente", "TransferenciaConfirmada"
  ];

  let sb = null;
  let session = null;
  let authProvider = "none";
  let sesionOk = false;
  let authGeneration = 0;
  let activeUserId = "";
  let startupPromise = null;
  let liveChannel = null;
  let cancelCache = { at: 0, ids: new Set() };
  let alertasCache = null;
  let toastTimer = null;
  let liveRefreshTimer = null;
  let canEdit = false;
  let memberRole = "viewer";
  let editorSubmit = null;
  let productCatalog = null;
  let categoryCatalog = null;
  let comboCatalog = null;
  let clientCatalog = null;
  let userCatalog = null;
  let businessConfig = null;
  let costStateCache = null;
  let finStateCache = null;
  let costTab = "resumen";
  let finDashboardPeriod = "mes";
  let finReferenceDate = new Date().toISOString().slice(0, 10);
  let finFilteredMovements = [];
  let finRealtimeChannel = null;
  let costAlertsAt = 0;
  let lastReportExport = null;
  let lastTurnExport = null;
  let lastReconciliation = null;
  let iaStatusCache = null;
  let iaConversationId = null;
  let iaConversations = [];
  let iaAttachments = [];
  let iaBusy = false;
  let iaRecognition = null;
  let businessCatalog = [];
  let businessMemberships = [];
  let saleShift = null;
  let saleCart = [];
  let salePayments = [];
  let saleBankAccounts = [];
  let saleLastReceipt = null;
  let saleReceiptPreview = false;
  let saleRequestId = null;
  let saleSubmitting = false;
  let saleStage = "catalog";
  let saleSelectedLineIndex = -1;
  let saleAccess = {
    role: "viewer",
    canUse: false,
    canOpenShift: false,
    canCreateSale: false,
    canCloseShift: false,
    canCancelSale: false,
    canOverridePrice: false,
    canForceInventory: false,
    canOpenCommonSale: false,
    canParkSale: false,
    canVerifyPrice: false,
    loaded: false,
  };

  const textoSeguro = value => {
    let texto = String(value ?? "")
      .replaceAll("Ã¡", "á").replaceAll("Ã©", "é").replaceAll("Ã­", "í")
      .replaceAll("Ã³", "ó").replaceAll("Ãº", "ú").replaceAll("Ã±", "ñ")
      .replaceAll("Ã", "Á").replaceAll("Ã‰", "É").replaceAll("Ã", "Í")
      .replaceAll("Ã“", "Ó").replaceAll("Ãš", "Ú").replaceAll("Ã‘", "Ñ")
      .replaceAll("Â¿", "¿").replaceAll("Â¡", "¡").replaceAll("Â", "");

    const repararPalabra = (patron, correcta) => {
      texto = texto.replace(patron, encontrada => {
        if (encontrada === encontrada.toUpperCase()) return correcta.toUpperCase();
        if (encontrada[0] === encontrada[0]?.toUpperCase()) {
          return correcta[0].toUpperCase() + correcta.slice(1).toLowerCase();
        }
        return correcta.toLowerCase();
      });
    };

    // Las fuentes Firebird antiguas ya perdieron algunos bytes y dejaron U+FFFD.
    // Esta reparación solo afecta la presentación, no los datos ni sus IDs.
    repararPalabra(/navide�o/gi, "navideño");
    repararPalabra(/navide�a/gi, "navideña");
    repararPalabra(/impresi�n/gi, "impresión");
    repararPalabra(/dise�o/gi, "diseño");
    repararPalabra(/quincea�era/gi, "quinceañera");
    repararPalabra(/peque�o/gi, "pequeño");
    repararPalabra(/ni�o/gi, "niño");
    repararPalabra(/ni�a/gi, "niña");
    repararPalabra(/a�os/gi, "años");
    repararPalabra(/avi�n/gi, "avión");
    repararPalabra(/�guila/gi, "águila");
    return texto;
  };

  const esc = value => textoSeguro(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const P = event => event?.payload || {};
  const numero = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };
  const money = cents => new Intl.NumberFormat("es-DO", {
    style: "currency", currency: "DOP", minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(numero(cents) / 100).replace("DOP", "RD$");
  const fecha = value => value ? new Date(value).toLocaleString("es-DO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }) : "--";
  const fechaCorta = value => {
    if (!value) return "--";
    const text = String(value);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text);
    return parsed.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit" });
  };
  const inputDate = date => {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const inicioDia = value => {
    const d = value ? new Date(`${value}T00:00:00`) : new Date();
    if (!value) d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };
  const finDia = value => {
    const d = value ? new Date(`${value}T23:59:59.999`) : new Date();
    return d.toISOString();
  };
  const fechaEventoIso = event => event?.created_at_local || P(event).vendidaEn || P(event).fecha || event?.received_at_cloud || event?.created_at;
  const totalDe = payload => numero(payload?.totalCobradoCentavos, payload?.total_cobrado_centavos, payload?.totalCentavos, payload?.total_centavos, payload?.total);
  const itbisDe = payload => numero(payload?.itbisCentavos, payload?.itbis_centavos, payload?.impuestoCentavos, payload?.impuesto_centavos);
  const montoDe = payload => numero(payload?.montoCentavos, payload?.monto_centavos, payload?.totalCentavos, payload?.total_centavos, payload?.efectivoContadoCentavos);
  const metodoDe = payload => String(payload?.metodo || payload?.metodoPago || payload?.metodo_pago || payload?.formaPago || "otro").toLowerCase();
  const cuentasTransferenciaDe = payload => {
    const pagos = Array.isArray(payload?.pagos) ? payload.pagos : [];
    const nombres = pagos
      .filter(pago => String(pago?.metodo || pago?.metodoPago || "").toLowerCase() === "transferencia")
      .map(pago => pago?.cuentaFinancieraNombre || pago?.cuenta_financiera_nombre
        || payload?.cuentaFinancieraNombre || payload?.cuenta_financiera_nombre)
      .filter(Boolean);
    if (!nombres.length && metodoDe(payload) === "transferencia") {
      const nombre = payload?.cuentaFinancieraNombre || payload?.cuenta_financiera_nombre;
      if (nombre) nombres.push(nombre);
    }
    return [...new Set(nombres.map(nombre => String(nombre).trim()).filter(Boolean))];
  };
  const metodoConCuentaDe = payload => {
    const pagos = Array.isArray(payload?.pagos) ? payload.pagos : [];
    if (pagos.length > 1) {
      return pagos.map(pago => {
        const metodo = String(pago?.metodo || pago?.metodoPago || "otro").toLowerCase();
        const nombre = metodo === "transferencia"
          ? pago?.cuentaFinancieraNombre || pago?.cuenta_financiera_nombre
            || payload?.cuentaFinancieraNombre || payload?.cuenta_financiera_nombre
          : null;
        return `${metodo}${nombre ? ` · ${nombre}` : ""}`;
      }).join(" + ");
    }
    const metodo = metodoDe(payload);
    const cuentas = cuentasTransferenciaDe(payload);
    return `${metodo}${cuentas.length ? ` · ${cuentas.join(" / ")}` : ""}`;
  };
  const efectivoDe = payload => {
    const pagos = Array.isArray(payload?.pagos) ? payload.pagos : [];
    if (pagos.length) return pagos
      .filter(pago => String(pago?.metodo || "").toLowerCase() === "efectivo")
      .reduce((sum, pago) => sum + numero(pago?.montoCentavos, pago?.monto_centavos), 0);
    return metodoDe(payload) === "efectivo" ? totalDe(payload) : 0;
  };
  const lineasDe = payload => {
    const value = payload?.lineas ?? payload?.detalle ?? payload?.items ?? [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? Object.values(parsed) : [];
      } catch { return []; }
    }
    return value && typeof value === "object" ? Object.values(value) : [];
  };

  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.remove("oculto");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.add("oculto"), 4200);
  }

  function verEstado(online, detail = "") {
    $("dot").className = `status-dot ${online ? "on" : "off"}`;
    $("estadoTxt").textContent = online ? "Conectado" : "Sin conexion";
    $("estadoDetalle").textContent = detail || (online ? "Sincronizacion activa" : "Revisa internet o la sesion");
  }

  function mostrarAcceso(view) {
    $("access").classList.remove("oculto");
    $("app").classList.add("oculto");
    ["v-restoring", "v-config", "v-login"].forEach(id => $(id).classList.toggle("oculto", id !== view));
  }

  function mensajeAutenticacion(error, fallback = "No se pudo validar la sesion.") {
    const message = String(error?.message || error || "").toLowerCase();
    if (message.includes("timeout") || message.includes("tiempo")) return "La nube tardÃ³ demasiado. Revisa internet e intenta de nuevo.";
    if (message.includes("jwt") || message.includes("token") || message.includes("session")) return "Tu sesion expiro. Inicia sesion nuevamente.";
    if (message.includes("permission") || message.includes("policy") || message.includes("row-level") || message.includes("rls")) return "Tu cuenta esta autenticada, pero no tiene permiso para consultar esta sucursal.";
    if (message.includes("membres") || message.includes("acceso activo")) return "Tu cuenta no tiene una membresia activa para esta sucursal.";
    if (message.includes("quota") || message.includes("restricted") || message.includes("spend caps") || message.includes("egress") || message.includes("storage_size")) {
      return "El proyecto Supabase esta restringido por limite de cuota (egress/almacenamiento). Revisa el panel de Supabase.";
    }
    if (message.includes("fetch") || message.includes("network")) return "No se pudo contactar la nube. Revisa la conexion e intenta de nuevo.";
    return fallback;
  }

  async function esperarConLimite(promise, timeoutMs, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  const loaders = {
    dashboard: cargarDashboard,
    sucursales: cargarSucursales,
    ventas: cargarVentas,
    "caja-virtual": cargarCajaVirtual,
    caja: cargarCaja,
    turnos: cargarTurnos,
    recalcular: cargarRecalculador,
    reportes: cargarReporte,
    inventario: cargarInventario,
    clientes: cargarClientes,
    finanzas: cargarProveedores,
    asistente: cargarAsistente,
    notificaciones: cargarNotificaciones,
    dispositivos: cargarDispositivos,
    respaldos: cargarRespaldos,
    descargar: cargarDescargar,
    recursos: cargarRecursos,
    configuracion: cargarConfiguracion
  };

  function mostrarVista(name) {
    if (name === "proveedores") {
      name = "finanzas";
      history.replaceState(null, "", `${location.pathname}${location.search}#finanzas`);
    }
    const selected = loaders[name] ? name : "dashboard";
    document.querySelectorAll(".vista").forEach(view => view.classList.add("oculto"));
    $("v-" + selected).classList.remove("oculto");
    document.querySelectorAll("#menu a").forEach(link => {
      const active = link.getAttribute("href") === `#${selected}`;
      link.classList.toggle("act", active);
      if (active) $("pageTitle").textContent = link.dataset.title || link.textContent.trim();
    });
    $("updateBanner")?.classList.toggle("oculto", selected !== "descargar");
    if (EMBEDDED && window.parent !== window) {
      window.parent.postMessage({ type: "dcarela:panel-route", view: selected, businessId: BUSINESS }, location.origin);
    }
    const loading = loaders[selected]().catch(error => { mostrarError(selected, error); throw error; });
    if (selected === "caja-virtual") {
      loading.then(() => {
        if ($("saleOverlay")?.classList.contains("oculto")) return openSaleConsole(false);
      }).catch(() => {});
    }
  }

  function mostrarError(module, error) {
    const msg = String(error?.message || error || "").toLowerCase();
    if (msg.includes("quota") || msg.includes("restricted") || msg.includes("spend caps") || msg.includes("egress") || msg.includes("storage_size") || msg.includes("violat")) {
      console.warn(`[${module}] backend restringido; no se muestran datos estáticos como si fueran actuales.`);
      verEstado(false, "Nube temporalmente restringida");
    }
    else verEstado(false, "Error al consultar datos");
    const target = document.querySelector(`#v-${module} .surface:last-child`) || $("v-" + module);
    if (target) {
      target.querySelectorAll("p.error").forEach(el => el.remove());
      const detail = msg.includes("quota") || msg.includes("restricted") || msg.includes("egress")
        ? "La nube está temporalmente restringida. Los datos no se sustituyeron por copias antiguas."
        : (error?.message || error);
      target.insertAdjacentHTML("afterbegin", `<p class="error">${esc(detail)}</p>`);
    }
  }

  function nombreSucursal(id = BUSINESS) {
    return businessCatalog.find(item => item.id === id)?.name || id;
  }

  function abrirSucursal(businessId, view = location.hash.slice(1) || "dashboard") {
    if (!businessId || businessId === BUSINESS) {
      location.hash = view;
      return;
    }
    const next = new URL(location.href);
    next.searchParams.set("b", businessId);
    next.hash = view;
    // La sucursal viaja solamente en la URL. Nunca se guarda como negocio
    // predeterminado global: abrir Plaza Artesanal no puede cambiar la central
    // para la proxima sesion ni contaminar otro panel abierto.
    location.assign(next.toString());
  }

  async function cargarSucursalesDisponibles() {
    if (!session?.user?.id) throw new Error("La sesión no contiene un usuario válido.");
    if (authProvider === "firebase") {
      if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
      businessMemberships = await window.DcarelaFirebase.getMembershipsForUser(session.user.id);
      if (!businessMemberships.length) throw new Error("Tu cuenta no tiene una membresía activa para ninguna sucursal.");
      const ids = businessMemberships.map(item => item.business_id).filter(Boolean);
      const businesses = await window.DcarelaFirebase.getBusinessesByIds(ids);
      businessCatalog = businesses.map(item => ({
        ...item,
        role: businessMemberships.find(member => member.business_id === item.id)?.role || "viewer"
      }));
    } else {
      try {
        if (sb) {
        const { data: memberships, error: membershipError } = await sb.from("pos_business_members")
          .select("business_id,role,active")
          .eq("user_id", session.user.id)
          .eq("active", true);
        if (membershipError) throw membershipError;
        if (memberships?.length) {
          businessMemberships = memberships;
          const ids = [...new Set(businessMemberships.map(item => item.business_id).filter(Boolean))];
          const { data: businesses, error: businessError } = await sb.from("pos_businesses")
            .select("id,name,parent_business_id,catalog_source_business_id,branch_type,active")
            .in("id", ids)
            .eq("active", true)
            .order("parent_business_id", { ascending: true, nullsFirst: true })
            .order("name");
          if (!businessError && businesses?.length) {
            businessCatalog = businesses.map(item => ({
              ...item,
              role: businessMemberships.find(member => member.business_id === item.id)?.role || "owner",
            }));
          }
        }
        }
      } catch (e) {
        console.warn("cargarSucursalesDisponibles:", e.message);
        throw e;
      }
    }

    if (!businessCatalog?.length) {
      throw new Error("Tu cuenta no tiene una membresía activa para esta instalación.");
    }
    if (!businessCatalog.some(item => item.id === BUSINESS)) throw new Error("Tu cuenta no tiene acceso a esta sucursal.");

    const selector = $("branchSelector");
    selector.innerHTML = businessCatalog.map(item =>
      `<option value="${esc(item.id)}"${selected(BUSINESS, item.id)}>${esc(item.name)}</option>`).join("");
    selector.disabled = businessCatalog.length < 2;
    $("branchEyebrow").textContent = nombreSucursal();
    $("branchCount").textContent = `${businessCatalog.length} sucursal${businessCatalog.length === 1 ? "" : "es"}`;
    const mobile = document.querySelector(".mobile-panel-link");
    if (mobile) mobile.href = `./mobile/?b=${encodeURIComponent(BUSINESS)}`;
    document.querySelector('a[href="#sucursales"]')?.classList.toggle("oculto", businessCatalog.length < 2);
  }

  function clavesVentaSucursal(event) {
    const payload = P(event);
    return [event?.entity_id, payload.id, payload.ventaId, payload.venta_id, payload.saleId, payload.sale_id]
      .filter(Boolean).map(value => String(value).trim().toLowerCase());
  }

  function gananciaDocumentada(payload) {
    const directa = [
      payload?.gananciaCentavos, payload?.ganancia_centavos,
      payload?.gananciaEstimadaCentavos, payload?.ganancia_estimada_centavos,
    ].find(value => value !== null && value !== undefined && value !== "");
    if (directa !== undefined) return { amount: numero(directa), revenue: totalDe(payload), complete: true };
    // Eleventa no conserva un costo historico confiable: algunas importaciones
    // traen el precio actual del catalogo o valores escalados como si fueran el
    // costo de la venta original. La venta sigue siendo valida, pero no debe
    // contaminar la ganancia documentada de la sucursal.
    const origin = String(payload?.origen || payload?.source || "").toLowerCase();
    if (origin.includes("migracion") || origin.includes("eleventa")) {
      return { amount: 0, revenue: 0, complete: false };
    }
    let amount = 0;
    let revenue = 0;
    let complete = true;
    const lines = lineasDe(payload);
    if (!lines.length) return { amount: 0, revenue: 0, complete: false };
    lines.forEach(line => {
      const lineRevenue = numero(line.importeFinalCentavos, line.importe_final_centavos, line.totalCentavos, line.total_centavos);
      const rawCost = line.costoUnitarioCentavos ?? line.costo_unitario_centavos;
      const quantity = numero(line.cantidad, line.quantity, 1);
      if (rawCost === null || rawCost === undefined || rawCost === "") {
        complete = false;
        return;
      }
      const unitCost = numero(rawCost);
      const lineCost = Math.round(unitCost * quantity);
      if (quantity <= 0 || unitCost < 0 || lineRevenue <= 0 || lineCost > lineRevenue * 4) {
        complete = false;
        return;
      }
      revenue += lineRevenue;
      amount += lineRevenue - lineCost;
    });
    return { amount: Math.round(amount), revenue, complete };
  }

  async function resumenSucursal(branch) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const branchId = branch.id;
    if (authProvider === "firebase") {
      if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
      const [rawEvents, rawDevices, rawAlerts, products] = await Promise.all([
        window.DcarelaFirebase.getSyncEvents(branchId, {
          from: start.toISOString(),
          to: new Date().toISOString(),
          limit: 1600,
        }),
        window.DcarelaFirebase.getCollection("devices", [["business_id", "==", branchId]]),
        window.DcarelaFirebase.getCollection("system_alerts", [["business_id", "==", branchId]]),
        window.DcarelaFirebase.getProducts(branchId),
      ]);
      const allowed = new Set(["VentaCobrada", "VentaCancelada", "CajaAbierta", "CajaCerrada", "CierreConDiferencia", "GastoRegistrado"]);
      const all = (rawEvents || []).filter(item => allowed.has(item.event_type)
        && new Date(item.created_at_local || item.received_at_cloud || 0) >= start);
      const cancellations = new Set();
      all.filter(item => item.event_type === "VentaCancelada")
        .forEach(item => clavesVentaSucursal(item).forEach(key => cancellations.add(key)));
      const sales = all.filter(item => item.event_type === "VentaCobrada"
        && !clavesVentaSucursal(item).some(key => cancellations.has(key)));
      const total = sales.reduce((sum, item) => sum + totalDe(P(item)), 0);
      const profits = sales.map(item => gananciaDocumentada(P(item)));
      const profit = profits.reduce((sum, item) => sum + item.amount, 0);
      const profitCoverage = total > 0
        ? Math.round(profits.reduce((sum, item) => sum + item.revenue, 0) / total * 100)
        : 100;
      const devices = (rawDevices || []).sort((a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")));
      const latestDevice = devices[0] || null;
      const connected = latestDevice?.last_seen_at
        ? Date.now() - new Date(latestDevice.last_seen_at).getTime() < 10 * 60 * 1000
        : false;
      return {
        ...branch,
        total,
        sales: sales.length,
        profit,
        profitCoverage: Math.max(0, Math.min(100, profitCoverage)),
        movements: all.length,
        alerts: (rawAlerts || []).filter(item => !item.acknowledged_at).length,
        products: new Set((products || []).map(item => item.id).filter(Boolean)).size,
        device: latestDevice,
        connected,
        salesSeries: seriesDiaria(sales, item => totalDe(P(item))),
        profitSeries: seriesDiaria(sales, item => gananciaDocumentada(P(item)).amount),
      };
    }
    const [eventsResult, devicesResult, alertsResult, catalogResult] = await Promise.all([
      sb.from("sync_events")
        .select("event_id,event_type,entity_id,payload,created_at_local,received_at_cloud,device_id")
        .eq("business_id", branchId)
        .in("event_type", ["VentaCobrada", "VentaCancelada", "CajaAbierta", "CajaCerrada", "CierreConDiferencia", "GastoRegistrado"])
        .gte("created_at_local", start.toISOString())
        .order("created_at_local", { ascending: false })
        .limit(5000),
      sb.from("devices")
        .select("id,device_name,status,last_seen_at,installed_version")
        .eq("business_id", branchId)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(20),
      sb.from("system_alerts")
        .select("id", { count: "exact", head: true })
        .eq("business_id", branchId)
        .is("acknowledged_at", null),
      sb.from("sync_events")
        .select("entity_id")
        .eq("business_id", branchId)
        .eq("event_type", "ProductoCreado")
        .limit(5000),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (devicesResult.error) throw devicesResult.error;
    if (alertsResult.error) throw alertsResult.error;
    if (catalogResult.error) throw catalogResult.error;

    const all = eventsResult.data || [];
    const cancellations = new Set();
    all.filter(item => item.event_type === "VentaCancelada")
      .forEach(item => clavesVentaSucursal(item).forEach(key => cancellations.add(key)));
    const sales = all.filter(item => item.event_type === "VentaCobrada"
      && !clavesVentaSucursal(item).some(key => cancellations.has(key)));
    const total = sales.reduce((sum, item) => sum + totalDe(P(item)), 0);
    const profits = sales.map(item => gananciaDocumentada(P(item)));
    const profit = profits.reduce((sum, item) => sum + item.amount, 0);
    const profitCoverage = total > 0
      ? Math.round(profits.reduce((sum, item) => sum + item.revenue, 0) / total * 100)
      : 100;
    const devices = devicesResult.data || [];
    const latestDevice = devices[0] || null;
    const connected = latestDevice?.last_seen_at
      ? Date.now() - new Date(latestDevice.last_seen_at).getTime() < 10 * 60 * 1000
      : false;
    return {
      ...branch,
      total,
      sales: sales.length,
      profit,
      profitCoverage: Math.max(0, Math.min(100, profitCoverage)),
      movements: all.length,
      alerts: alertsResult.count || 0,
      products: new Set((catalogResult.data || []).map(item => item.entity_id).filter(Boolean)).size,
      device: latestDevice,
      connected,
      salesSeries: seriesDiaria(sales, item => totalDe(P(item))),
      profitSeries: seriesDiaria(sales, item => gananciaDocumentada(P(item)).amount),
    };
  }

  async function cargarSucursales() {
    if (!businessCatalog.length) await cargarSucursalesDisponibles();
    $("branchCards").innerHTML = `<div class="loading">Calculando cada sucursal sin mezclar sus movimientos...</div>`;
    const summaries = await Promise.all(businessCatalog.map(resumenSucursal));
    const total = summaries.reduce((sum, item) => sum + item.total, 0);
    const profit = summaries.reduce((sum, item) => sum + item.profit, 0);
    const sales = summaries.reduce((sum, item) => sum + item.sales, 0);
    const alerts = summaries.reduce((sum, item) => sum + item.alerts, 0);
    $("branchSummary").innerHTML = `
      <div class="branch-overview-metric"><span>Venta neta del mes</span><strong>${money(total)}</strong></div>
      <div class="branch-overview-metric"><span>Ganancia documentada</span><strong>${money(profit)}</strong></div>
      <div class="branch-overview-metric"><span>Ventas validas</span><strong>${sales}</strong></div>
      <div class="branch-overview-metric${alerts ? " warn" : ""}"><span>Alertas abiertas</span><strong>${alerts}</strong></div>`;
    $("branchCards").innerHTML = summaries.map(item => `
      <article class="branch-ledger-row${item.id === BUSINESS ? " current" : ""}">
        <header class="branch-identity"><div><span>${esc(item.branch_type === "principal" ? "Sucursal principal" : "Sucursal de fotografia")}</span><h3>${esc(item.name)}</h3></div><i class="${item.connected ? "online" : ""}"></i></header>
        <div class="branch-ledger-metrics">
          <div><span>Venta del mes</span><strong>${money(item.total)}</strong></div>
          <div><span>Ganancia</span><strong>${money(item.profit)}</strong><small>${item.profitCoverage}% del ingreso con costo documentado</small></div>
          <div><span>Tickets</span><strong>${item.sales}</strong></div>
          <div><span>Catalogo</span><strong>${item.products}</strong><small>productos vinculados</small></div>
        </div>
        <div class="branch-ledger-waves">
          ${waveMetric("Pulso de ventas", money(item.total), "mes actual", item.salesSeries)}
          ${waveMetric("Salud operativa", `${item.connected ? Math.max(0, 100 - Math.min(90, item.alerts * 3)) : 10}%`, item.connected ? "terminal conectada" : "sin conexion reciente", item.profitSeries.length ? item.profitSeries : item.salesSeries)}
        </div>
        <div class="branch-ledger-status">
          <span><b>${item.connected ? "Conectada" : "Sin conexion reciente"}</b>${item.device ? ` &middot; ${esc(item.device.device_name)}` : ""}</span>
          <small>${item.device?.last_seen_at ? `Ultima conexion ${esc(fecha(item.device.last_seen_at))}` : "Sin terminal registrada"} &middot; ${item.alerts} alerta(s)</small>
        </div>
        <footer>
          <button type="button" class="primary" data-open-branch="${esc(item.id)}">Abrir sucursal</button>
          <button type="button" class="secondary" data-branch-finance="${esc(item.id)}">Ver finanzas</button>
        </footer>
      </article>`).join("");
    $("branchCards").querySelectorAll("[data-open-branch]").forEach(button =>
      button.addEventListener("click", () => abrirSucursal(button.dataset.openBranch, "dashboard")));
    $("branchCards").querySelectorAll("[data-branch-finance]").forEach(button =>
      button.addEventListener("click", () => abrirSucursal(button.dataset.branchFinance, "finanzas")));
  }

  async function eventos(types, from, to, limit = 400) {
    if (authProvider === "firebase") {
      if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
      const requested = Math.max(1, Number(limit || 400));
      const fetchLimit = Math.min(5000, types?.length ? Math.max(400, requested * 2) : requested);
      let items = await window.DcarelaFirebase.getSyncEvents(BUSINESS, {
        from: from || null,
        to: to || null,
        limit: fetchLimit,
      });
      if (types?.length) items = items.filter(item => types.includes(item.event_type));
      if (from) items = items.filter(item => String(item.created_at_local || "") >= from);
      if (to) items = items.filter(item => String(item.created_at_local || "") <= to);
      items.sort((a, b) => String(b.created_at_local || "").localeCompare(String(a.created_at_local || "")));
      verEstado(true, "Firebase autenticado");
      return items.slice(0, Math.max(1, limit));
    }
    try {
      if (sb) {
        const output = [];
        const maximum = Math.max(1, limit);
        const pageSize = Math.min(1000, maximum);
        for (let offset = 0; offset < maximum; offset += pageSize) {
          const end = Math.min(offset + pageSize, maximum) - 1;
          let query = sb.from("sync_events")
            .select("event_id,event_type,entity_type,entity_id,payload,created_at_local,received_at_cloud,device_id")
            .eq("business_id", BUSINESS)
            .order("created_at_local", { ascending: false })
            .range(offset, end);
          if (types?.length) query = query.in("event_type", types);
          if (from) query = query.gte("created_at_local", from);
          if (to) query = query.lte("created_at_local", to);
          const { data, error } = await query;
          if (error) throw error;
          output.push(...(data || []));
          if (!data || data.length < end - offset + 1) break;
        }
        verEstado(true, "Supabase autenticado");
        return output;
      }
    } catch (e) {
      console.warn("eventos():", e.message);
      throw e;
    }
    throw new Error("No existe un backend autenticado para consultar eventos.");
  }

  function eventosDesde(items, types, from, to, limit = 1600) {
    let output = Array.isArray(items) ? [...items] : [];
    if (types?.length) output = output.filter(item => types.includes(item.event_type));
    if (from) output = output.filter(item => String(item.created_at_local || "") >= from);
    if (to) output = output.filter(item => String(item.created_at_local || "") <= to);
    output.sort((a, b) => String(b.created_at_local || "").localeCompare(String(a.created_at_local || "")));
    return output.slice(0, Math.max(1, limit));
  }

  async function cargarRolEdicion() {
    if (authProvider === "firebase") {
      const membership = businessMemberships.find(item => item.business_id === BUSINESS && item.active !== false);
      if (!membership) throw new Error("Tu cuenta no tiene una membresía activa para esta sucursal.");
      memberRole = membership.role || "viewer";
      canEdit = ["owner", "admin"].includes(memberRole);
      document.querySelectorAll(".admin-only").forEach(element => element.classList.toggle("oculto", !canEdit));
      return;
    }
    try {
      if (sb) {
        const { data, error } = await sb.from("pos_business_members")
          .select("role,active")
          .eq("business_id", BUSINESS)
          .eq("user_id", session.user.id)
          .eq("active", true)
          .maybeSingle();
        if (!error && data?.role) {
          memberRole = data.role;
          canEdit = ["owner", "admin"].includes(memberRole);
          document.querySelectorAll(".admin-only").forEach(element => element.classList.toggle("oculto", !canEdit));
          return;
        }
      }
    } catch (e) {
      console.warn("cargarRolEdicion:", e.message);
      throw e;
    }
    throw new Error("Tu cuenta no tiene una membresía activa para esta sucursal.");
  }

  async function authenticatedHeaders(includeJson = false) {
    if (authProvider === "firebase") {
      const token = await window.DcarelaFirebase?.getIdToken?.();
      if (!token) throw new Error("La sesion Firebase vencio. Inicia sesion nuevamente.");
      return {
        Authorization: `Bearer ${token}`,
        ...(includeJson ? { "Content-Type": "application/json" } : {})
      };
    }
    if (authProvider !== "supabase") throw new Error("No hay una sesión autenticada.");
    const { data, error } = await sb.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error("La sesion vencio. Inicia sesion nuevamente.");
    session = data.session;
    return {
      Authorization: `Bearer ${session.access_token}`,
      apikey: cfg.anon,
      ...(includeJson ? { "Content-Type": "application/json" } : {})
    };
  }

  async function adminWrite(action, entityId, data) {
    if (!canEdit) throw new Error("Tu cuenta no tiene permiso de administracion para editar datos.");
    if (authProvider === "firebase") {
      if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
      const result = await window.DcarelaFirebase.adminAction(action, BUSINESS, memberRole, entityId, data);
      productCatalog = null;
      categoryCatalog = null;
      comboCatalog = null;
      clientCatalog = null;
      businessConfig = null;
      costStateCache = null;
      finStateCache = null;
      alertasCache = null;
      if (action !== "ui.preference.upsert") toast(result.message || "Cambio guardado en Firebase.");
      return result;
    }
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-admin-write`, {
      method: "POST",
      headers: await authenticatedHeaders(true),
      body: JSON.stringify({ business_id: BUSINESS, action, entity_id: entityId || null, data })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `No se pudo guardar el cambio (HTTP ${response.status}).`);
    productCatalog = null;
    categoryCatalog = null;
    comboCatalog = null;
    clientCatalog = null;
    businessConfig = null;
    costStateCache = null;
    finStateCache = null;
    alertasCache = null;
    if (action !== "ui.preference.upsert") toast(result.message || "Cambio guardado y enviado a sincronizacion.");
    return result;
  }

  async function cargarTemaUsuario() {
    if (!session?.user?.id) return;
    const { data, error } = await sb.from("ui_preferences")
      .select("theme")
      .eq("business_id", BUSINESS)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (data?.theme === "light" || data?.theme === "dark") applyTheme(data.theme, true);
  }

  async function guardarTemaUsuario(theme) {
    if (!session?.user?.id) return;
    if (authProvider === "firebase") {
      if (canEdit) {
        await adminWrite("ui.preference.upsert", session.user.id, {
          theme, density: "normal", sidebarMode: "expanded", animationsEnabled: true
        });
      }
      return;
    }
    if (canEdit) {
      await adminWrite("ui.preference.upsert", session.user.id, {
        theme,
        density: "normal",
        sidebarMode: "expanded",
        animationsEnabled: true
      });
      return;
    }
    const scope = sb.from("ui_preferences");
    const { data: existing, error: readError } = await scope.select("id")
      .eq("business_id", BUSINESS).eq("user_id", session.user.id).maybeSingle();
    if (readError) throw readError;
    const values = { business_id: BUSINESS, user_id: session.user.id, theme, updated_at: new Date().toISOString() };
    const result = existing?.id ? await scope.update(values).eq("id", existing.id) : await scope.insert(values);
    if (result.error) throw result.error;
  }

  async function iaRequest(mode, data = {}) {
    if (authProvider === "firebase") {
      if (!window.DcarelaLocalAssistant?.request) {
        throw new Error("El cerebro local no termino de cargar. Recarga el panel e intentalo nuevamente.");
      }
      return window.DcarelaLocalAssistant.request(mode, {
        adapter: window.DcarelaFirebase,
        businessId: BUSINESS,
        role: memberRole,
        user: { id: session?.user?.id, uid: session?.user?.id, email: session?.user?.email || "" },
        storage: localStorage,
        remoteAssistant: body => window.DcarelaFirebase.assistantRequest(body),
      }, data);
    }
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-assistant`, {
      method: "POST",
      headers: await authenticatedHeaders(true),
      body: JSON.stringify({ business_id: BUSINESS, mode, ...data })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `El asistente no respondio (HTTP ${response.status}).`);
    return result;
  }

  const IA_CAPABILITY_LABELS = {
    can_use: "Usar el asistente",
    can_read_sales: "Consultar ventas",
    can_read_finance: "Consultar finanzas y creditos",
    can_write_catalog: "Modificar catalogo",
    can_adjust_inventory: "Ajustar inventario",
    can_manage_finance: "Gestionar gastos, deudas y clientes",
    can_manage_business: "Gestionar negocio, dispositivos y auditoria",
    can_manage_users: "Gestionar usuarios y permisos"
  };

  const IA_ACTION_LABELS = {
    "category.upsert": "Guardar categoria",
    "product.upsert": "Guardar producto",
    "inventory.set": "Ajustar inventario",
    "combo.components.set": "Cambiar componentes del combo",
    "client.upsert": "Guardar cliente",
    "business.update": "Actualizar negocio",
    "expense_category.upsert": "Guardar categoria de gasto",
    "expense.upsert": "Guardar gasto",
    "expense.delete": "Anular gasto",
    "cost.recurring.upsert": "Guardar costo recurrente",
    "cost.obligation.upsert": "Guardar factura o deuda",
    "cost.obligation.cancel": "Anular factura o deuda",
    "cost.payment.create": "Registrar pago",
    "receipt.create": "Crear recibo",
    "receipt.signature": "Actualizar firma de recibo",
    "receipt.cancel": "Anular recibo",
    "fin.account.upsert": "Guardar cuenta financiera",
    "fin.account.reconcile": "Conciliar saldo de cuenta",
    "fin.category.upsert": "Guardar categoria financiera",
    "fin.movement.create": "Registrar movimiento financiero",
    "fin.movement.cancel": "Anular movimiento financiero",
    "fin.movement.restore": "Restaurar movimiento financiero",
    "fin.transfer.create": "Registrar transferencia",
    "fin.card.upsert": "Configurar tarjeta",
    "fin.card.payment": "Registrar pago de tarjeta",
    "fin.budget.upsert": "Guardar presupuesto",
    "fin.preferences.upsert": "Guardar preferencias financieras",
    "fin.currency.upsert": "Guardar divisa",
    "device.status": "Cambiar estado del dispositivo",
    "assistant.permissions.set": "Actualizar permisos del asistente"
  };

  function iaInline(text) {
    return esc(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function iaMarkdown(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const html = [];
    let list = null;
    const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { closeList(); continue; }
      if (/^-{3,}$/.test(line)) { closeList(); html.push("<hr>"); continue; }
      const heading = line.match(/^#{1,3}\s+(.+)$/);
      if (heading) { closeList(); html.push(`<h3>${iaInline(heading[1])}</h3>`); continue; }
      const bullet = line.match(/^[-*]\s+(.+)$/);
      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      if (bullet || numbered) {
        const wanted = bullet ? "ul" : "ol";
        if (list !== wanted) { closeList(); list = wanted; html.push(`<${wanted}>`); }
        html.push(`<li>${iaInline((bullet || numbered)[1])}</li>`);
        continue;
      }
      closeList();
      html.push(`<p>${iaInline(line)}</p>`);
    }
    closeList();
    return html.join("");
  }

  function iaStatusLabel(status) {
    return ({ pending: "Pendiente de confirmacion", confirmed: "Confirmando", executed: "Aplicada", undone: "Deshecha", cancelled: "Cancelada", error: "Error" })[status] || status;
  }

  function iaActionHtml(action) {
    const status = action.status || "pending";
    const terminalSync = action?.result?.terminal_sync || null;
    const terminalState = terminalSync?.state || "";
    const terminalLabel = terminalState === "applied"
      ? `Aplicada en terminal${terminalSync.applied_by_device_id ? ` ${terminalSync.applied_by_device_id}` : ""}${terminalSync.applied_at ? ` · ${fecha(terminalSync.applied_at)}` : ""}.`
      : terminalState === "pending"
        ? "Guardada en la nube y enviada; pendiente de confirmacion de una terminal."
        : terminalState === "not_required"
          ? "Guardada y verificada en la nube; no requiere modificar una terminal."
          : "Guardada y verificada por el servicio.";
    const actionError = status === "error"
      ? String(action?.result?.error || action?.result?.message || "La accion fallo sin un detalle registrado.")
      : "";
    const canResolve = status === "pending" && (canEdit || !action.requires_admin_approval);
    const canUndo = status === "executed" && action.reversible && (canEdit || !action.requires_admin_approval);
    const approval = action.requires_admin_approval && status === "pending"
      ? "Espera aprobacion administrativa."
      : status === "pending" && action.risk_level === "high"
        ? "Confirmacion requerida por seguridad."
        : status === "executed"
          ? terminalLabel
          : iaStatusLabel(status);
    return `<article class="assistant-action-card ${esc(status)}" data-ia-action="${esc(action.id)}">
      <strong>${esc(IA_ACTION_LABELS[action.action] || action.action || "Cambio propuesto")}</strong>
      <p>${esc(action.summary || "Revisa esta propuesta antes de aplicarla.")}</p>
      <small>${esc(approval)}${action.required_capability ? ` · ${esc(IA_CAPABILITY_LABELS[action.required_capability] || action.required_capability)}` : ""}</small>
      ${actionError ? `<div class="assistant-action-error"><strong>Detalle del error</strong><span>${esc(actionError)}</span></div>` : ""}
      ${canResolve ? `<div class="assistant-action-buttons"><button class="primary" type="button" data-ia-confirm="${esc(action.id)}">Aplicar</button><button class="secondary" type="button" data-ia-cancel="${esc(action.id)}">Cancelar</button></div>` : ""}
      ${canUndo ? `<div class="assistant-action-buttons"><button class="secondary assistant-undo" type="button" data-ia-undo="${esc(action.id)}">Deshacer cambio</button></div>` : ""}
    </article>`;
  }

  function iaQuickActionsHtml(message) {
    const actions = Array.isArray(message?.metadata?.quick_actions) ? message.metadata.quick_actions : [];
    if (!actions.length) return "";
    return `<div class="assistant-context-actions">${actions.slice(0, 4).map(action => {
      const tone = action.tone === "primary" ? "primary" : "secondary";
      if (action.destination) return `<button class="${tone}" type="button" data-ia-destination="${esc(action.destination)}">${esc(action.label)}</button>`;
      return `<button class="${tone}" type="button" data-ia-next-prompt="${esc(action.prompt || "")}">${esc(action.label)}</button>`;
    }).join("")}</div>`;
  }

  function iaFileSize(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function iaDocumentLabel(file) {
    const kind = file.document_kind || file.kind || "reference";
    if (kind === "system_rules") return "Reglas activas";
    if (kind === "invoice") return "Factura";
    if (kind === "dataset") return "Datos";
    if (kind === "image") return "Imagen";
    return "Documento";
  }

  function iaDocumentCards(files) {
    if (!files.length) return "";
    return `<div class="assistant-document-list">${files.map(file => {
      const details = [
        file.version_label || file.version ? `v${file.version_label || file.version}` : "",
        file.size || file.size_bytes ? iaFileSize(file.size || file.size_bytes) : "",
        file.character_count ? `${Number(file.character_count).toLocaleString("es-DO")} caracteres` : "",
      ].filter(Boolean).join(" / ");
      const verified = file.persisted || file.id || file.document_id;
      const state = file.active === false ? "Archivado" : verified ? iaDocumentLabel(file) : "Preparando";
      return `<article class="assistant-document-card">
        <strong>${esc(file.name || file.original_name || "documento")}</strong>
        <small>${esc(details || file.mime || file.mime_type || "Archivo adjunto")}</small>
        <span class="assistant-document-state">${esc(state)}</span>
      </article>`;
    }).join("")}</div>`;
  }

  function iaAttachmentsMeta(message) {
    const files = Array.isArray(message?.metadata?.attachments) ? message.metadata.attachments : [];
    return iaDocumentCards(files);
  }

  function iaMessageBody(message) {
    const content = String(message.content || "");
    const collapseAt = message.role === "user" ? 1800 : 12000;
    if (content.length <= collapseAt) return `<div class="message-body">${iaMarkdown(content)}</div>`;
    const title = content.split(/\r?\n/).find(Boolean)?.trim().slice(0, 90) || "Documento extenso";
    const preview = content.replace(/\s+/g, " ").trim().slice(0, 320);
    return `<details class="assistant-long-message">
      <summary><span>${esc(title)}</span><small>${content.length.toLocaleString("es-DO")} caracteres</small></summary>
      <p class="assistant-long-preview">${esc(preview)}...</p>
      <div class="message-body assistant-long-content">${iaMarkdown(content)}</div>
    </details>`;
  }

  const IA_MEMORY_KEY = "dcarela.ia.memory.v2";

  function getIaLearnedRules() {
    try {
      const raw = localStorage.getItem(IA_MEMORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          const real = parsed.filter(rule => !["mem_seed_1", "mem_seed_2", "mem_seed_3"].includes(String(rule?.id || "")));
          if (real.length !== parsed.length) saveIaLearnedRules(real);
          if (real.length) return real;
        }
      }
    } catch {}
    // La memoria comienza vacia. Las versiones antiguas sembraban proveedores,
    // suscripciones y cuentas de ejemplo que podian parecer datos comerciales
    // reales. Solo se conserva lo que el operador ensena de forma explicita.
    saveIaLearnedRules([]);
    return [];
  }

  function saveIaLearnedRules(rules) {
    try {
      localStorage.setItem(IA_MEMORY_KEY, JSON.stringify(rules));
    } catch {}
  }

  function addIaLearnedRule(content, summary = "", category = "manual_rule") {
    if (!content || !content.trim()) return null;
    const rules = getIaLearnedRules();
    const existing = rules.find(r => r.content.toLowerCase().trim() === content.toLowerCase().trim());
    if (existing) return existing;
    const newRule = {
      id: "mem_" + Math.random().toString(36).substring(2, 10),
      content: content.trim(),
      summary: summary.trim() || content.trim().slice(0, 45),
      category,
      created_at: new Date().toISOString()
    };
    rules.unshift(newRule);
    saveIaLearnedRules(rules);
    renderIaLearnings();
    return newRule;
  }

  function deleteIaLearnedRule(id) {
    const rules = getIaLearnedRules().filter(r => r.id !== id);
    saveIaLearnedRules(rules);
    renderIaLearnings();
  }

  function extractLearningsFromMessage(text) {
    if (!text || text.length < 6) return [];
    const discovered = [];
    const t = text.trim();

    const p1 = t.match(/(?:compras?\s+en|pago\s+a|gastos?\s+en|proveedor)\s+([A-Za-z0-9\sÁÉÍÓÚáéíóúñÑ]+?)\s+(?:se\s+paga|hech[ao]s?|pagad[ao]s?)\s+con\s+(?:la\s+)?(tarjeta|efectivo|transferencia|popular|banco|qik)/i) ||
               t.match(/([A-Za-z0-9\sÁÉÍÓÚáéíóúñÑ]{3,30})\s+(?:siempre\s+)?se\s+paga\s+con\s+(?:la\s+)?(tarjeta|efectivo|transferencia|popular|banco|qik)/i);
    if (p1 && p1[1].length > 2 && !/^(este|esta|estos|estas|un|una|el|la|los|las)$/i.test(p1[1].trim())) {
      const entity = p1[1].trim();
      const method = p1[2].trim();
      const r = addIaLearnedRule(`Regla de pago: '${entity}' se paga habitualmente con ${method}.`, `${entity} ➔ ${method}`, "supplier_rule");
      if (r) discovered.push(r);
    }

    const p2 = t.match(/([A-Za-z0-9\sÁÉÍÓÚáéíóúñÑ]{3,30})\s+(?:es\s+un\s+)?(?:suscripci[oó]n|cuota\s+mensual|costo\s+recurrente|compromiso)/i);
    if (p2 && p2[1].length > 2 && !/^(este|esta|estos|estas)$/i.test(p2[1].trim())) {
      const name = p2[1].trim();
      const r = addIaLearnedRule(`Compromiso recurrente: '${name}' es una suscripción o costo periódico.`, `Recurrente: ${name}`, "recurring_rule");
      if (r) discovered.push(r);
    }

    const p3 = t.match(/(?:no,\s+eso\s+no\s+fue\s+|correcci[oó]n:\s*|en\s+realidad\s+fue\s+)(.+)/i);
    if (p3 && p3[1].length > 5) {
      const corr = p3[1].trim();
      const r = addIaLearnedRule(`Corrección del operador: ${corr}`, `Corrección: ${corr.slice(0, 30)}`, "correction_rule");
      if (r) discovered.push(r);
    }

    return discovered;
  }

  function renderIaLearnings() {
    const rules = getIaLearnedRules();
    const countEl = $("iaLearningCount");
    const listEl = $("iaLearningList");
    if (countEl) countEl.textContent = `${rules.length} activa${rules.length === 1 ? "" : "s"}`;
    if (listEl) {
      listEl.innerHTML = rules.length ? rules.map(rule => `
        <div class="assistant-learning-card" data-rule-id="${esc(rule.id)}">
          <div>
            <strong>${esc(rule.summary || "Regla aprendida")}</strong>
            <p>${esc(rule.content)}</p>
          </div>
          <button class="delete-btn" type="button" data-delete-rule="${esc(rule.id)}" title="Eliminar regla" aria-label="Eliminar regla">&#215;</button>
        </div>
      `).join("") : `<div class="empty-state compact"><p>Aún no hay reglas aprendidas.</p></div>`;

      listEl.querySelectorAll("[data-delete-rule]").forEach(btn => {
        btn.addEventListener("click", () => {
          deleteIaLearnedRule(btn.dataset.deleteRule);
          toast("Regla eliminada de la memoria.");
        });
      });
    }
  }

  const IA_EMPTY_HTML = `<div class="assistant-empty">
    <div class="assistant-empty-icon">✦</div>
    <strong>Asistente Operativo D' Carela POS</strong>
    <p>Aprende de tus instrucciones en cada conversación. Puedes consultar ventas, conciliar bancos, registrar compras con tarjeta o pedir auditorías.</p>
    <div class="assistant-empty-starters">
      <button type="button" class="starter-card" data-prompt="Dame un resumen de las ventas de hoy, los gastos registrados y el saldo en cuentas.">
        <span class="starter-icon">📊</span>
        <strong>Resumen integral del día</strong>
        <small>Ventas, gastos y saldos en cuentas</small>
      </button>
      <button type="button" class="starter-card" data-prompt="Audita los productos sin precio, sin categoría o con inventario inconsistente.">
        <span class="starter-icon">🔍</span>
        <strong>Auditar catálogo y stock</strong>
        <small>Productos sin precio o stock bajo</small>
      </button>
    </div>
  </div>`;

  function iaMessageHtml(message) {
    const role = message.role === "user" ? "user" : "assistant";
    const label = role === "user" ? (session?.user?.email || "Operador") : "Asistente IA";
    const learnings = Array.isArray(message?.metadata?.learned_rules) ? message.metadata.learned_rules : [];
    const learningHtml = learnings.map(l => `<div class="assistant-learning-badge">🧠 Aprendido: ${esc(l.summary || l.content)}</div>`).join("");
    return `<article class="assistant-message ${role}" data-message-id="${esc(message.id || "")}">
      <span class="message-role">${esc(label)}</span>
      <button class="assistant-copy" type="button" data-copy-message="${esc(message.id || "")}" title="Copiar mensaje" aria-label="Copiar mensaje">&#10697;</button>
      ${iaMessageBody(message)}
      ${learningHtml}
      ${iaAttachmentsMeta(message)}
      ${role === "assistant" ? iaQuickActionsHtml(message) : ""}
      <div class="assistant-message-meta">${esc(fecha(message.created_at))}</div>
    </article>`;
  }

  function iaBindMessageActions(messages) {
    $("iaMessages").querySelectorAll("[data-copy-message]").forEach(button => button.addEventListener("click", async () => {
      const message = messages.find(item => String(item.id) === button.dataset.copyMessage);
      if (!message) return;
      try {
        await navigator.clipboard.writeText(message.content || "");
        toast("Mensaje copiado.");
      } catch {
        const area = document.createElement("textarea");
        area.value = message.content || "";
        document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
        toast("Mensaje copiado.");
      }
    }));
    $("iaMessages").querySelectorAll("[data-ia-confirm]").forEach(button => button.addEventListener("click", () => resolverAccionIa(button.dataset.iaConfirm, true)));
    $("iaMessages").querySelectorAll("[data-ia-cancel]").forEach(button => button.addEventListener("click", () => resolverAccionIa(button.dataset.iaCancel, false)));
    $("iaMessages").querySelectorAll("[data-ia-undo]").forEach(button => button.addEventListener("click", () => deshacerAccionIa(button.dataset.iaUndo)));
    $("iaMessages").querySelectorAll("[data-ia-destination]").forEach(button => button.addEventListener("click", () => {
      location.hash = `#${button.dataset.iaDestination}`;
    }));
    $("iaMessages").querySelectorAll("[data-ia-next-prompt]").forEach(button => button.addEventListener("click", () => {
      const prompt = button.dataset.iaNextPrompt || "";
      if (!prompt || iaBusy) return;
      $("iaInput").value = prompt;
      enviarMensajeIa();
    }));
    $("iaMessages").querySelectorAll(".starter-card").forEach(card => card.addEventListener("click", () => {
      const prompt = card.dataset.prompt || "";
      if (!prompt || iaBusy) return;
      $("iaInput").value = prompt;
      enviarMensajeIa();
    }));
  }

  function renderIaHistory(history) {
    const messages = history?.messages || [];
    const actions = history?.actions || [];
    const actionMap = new Map(actions.map(action => [String(action.id), action]));
    const renderedActions = new Set();
    const chunks = [];
    messages.forEach(message => {
      chunks.push(iaMessageHtml(message));
      const ids = Array.isArray(message?.metadata?.action_ids) ? message.metadata.action_ids : [];
      ids.forEach(id => {
        const action = actionMap.get(String(id));
        if (action) { chunks.push(iaActionHtml(action)); renderedActions.add(String(id)); }
      });
    });
    const orphanedActions = actions.filter(action => !renderedActions.has(String(action.id)));
    orphanedActions.filter(action => action.status !== "error").forEach(action => chunks.push(iaActionHtml(action)));
    $("iaMessages").innerHTML = chunks.length ? chunks.join("") : IA_EMPTY_HTML;
    $("iaConversationTitle").textContent = history?.conversation?.title || "Nueva conversación";
    if (history?.conversation?.model) $("iaModel").value = history.conversation.model;
    renderIaDocuments(history?.active_documents || iaStatusCache?.active_documents || []);
    renderIaLearnings();
    iaBindMessageActions(messages);
    requestAnimationFrame(() => { $("iaMessages").scrollTop = $("iaMessages").scrollHeight; });
  }

  function renderIaDocuments(documents) {
    const active = (Array.isArray(documents) ? documents : []).filter(document => document.active !== false && document.is_active !== false);
    $("iaDocumentSummary").textContent = active.length ? `${active.length} vigente${active.length === 1 ? "" : "s"}` : "Sin documentos";
    $("iaDocuments").innerHTML = active.length ? iaDocumentCards(active) : `<div class="empty-state compact"><p>No hay reglas ni documentos activos.</p></div>`;
    const rules = active.find(document => (document.kind || document.document_kind) === "system_rules");
    $("iaContextHeadline").textContent = rules
      ? `Reglas ${rules.version || rules.version_label ? `v${rules.version || rules.version_label}` : "operativas"} activas`
      : "Contexto del negocio y memoria operativa";
  }

  function setIaDrawer(name, open) {
    const layout = $("iaLayout");
    const history = name === "history" && open;
    const control = name === "control" && open;
    layout.classList.toggle("history-open", history);
    layout.classList.toggle("control-open", control);
    $("btnIaHistorial").setAttribute("aria-expanded", String(history));
    $("btnIaControl").setAttribute("aria-expanded", String(control));
  }

  function renderIaConversations() {
    const query = ($("iaConversationSearch")?.value || "").trim().toLocaleLowerCase("es");
    const visible = query ? iaConversations.filter(conversation => String(conversation.title || "").toLocaleLowerCase("es").includes(query)) : iaConversations;
    $("iaConversations").innerHTML = visible.length ? visible.map(conversation => `
      <button class="assistant-conversation ${String(conversation.id) === String(iaConversationId) ? "act" : ""}" type="button" data-ia-conversation="${esc(conversation.id)}">
        <span><span>${esc(conversation.title || "Nueva conversacion")}</span><small>${esc(fecha(conversation.updated_at))}</small></span>
        <span class="archive" data-ia-archive="${esc(conversation.id)}" title="Archivar" aria-label="Archivar conversacion">&#215;</span>
      </button>`).join("") : `<div class="empty-state">Aun no hay conversaciones.</div>`;
    $("iaConversations").querySelectorAll("[data-ia-conversation]").forEach(button => button.addEventListener("click", event => {
      if (event.target.closest("[data-ia-archive]")) return;
      setIaDrawer("history", false);
      abrirConversacionIa(button.dataset.iaConversation).catch(error => { $("iaError").textContent = error.message; });
    }));
    $("iaConversations").querySelectorAll("[data-ia-archive]").forEach(button => button.addEventListener("click", async event => {
      event.stopPropagation();
      await iaRequest("archive_conversation", { conversation_id: button.dataset.iaArchive });
      if (String(iaConversationId) === String(button.dataset.iaArchive)) iaConversationId = null;
      await cargarConversacionesIa(false);
    }));
  }

  async function cargarConversacionesIa(openLatest = true) {
    const result = await iaRequest("conversations");
    iaConversations = result.conversations || [];
    if (openLatest && !iaConversationId && iaConversations.length) iaConversationId = iaConversations[0].id;
    renderIaConversations();
    if (openLatest && iaConversationId) await abrirConversacionIa(iaConversationId);
  }

  async function abrirConversacionIa(id) {
    iaConversationId = id;
    renderIaConversations();
    const history = await iaRequest("history", { conversation_id: id });
    renderIaHistory(history);
  }

  function renderIaStatus(status) {
    iaStatusCache = status;
    $("iaStatus").textContent = status.local_engine ? "Cerebro local activo" : status.configured ? "IA conectada" : "Falta configuracion";
    $("iaStatus").classList.toggle("bad", !status.configured || !status.capabilities?.can_use);
    $("iaRole").textContent = status.full_admin_access ? `${status.role} · control total` : status.role;
    $("iaAccessSummary").textContent = status.full_admin_access ? "Acceso completo por rol administrativo" : "Acceso delegado por capacidades";
    $("iaCapabilities").innerHTML = Object.entries(IA_CAPABILITY_LABELS).map(([key, label]) => {
      const enabled = Boolean(status.capabilities?.[key]);
      return `<div class="assistant-capability"><span>${esc(label)}</span><b class="${enabled ? "" : "off"}">${enabled ? "Si" : "No"}</b></div>`;
    }).join("");
    renderIaClaves(status);
    const current = $("iaModel").value;
    $("iaModel").innerHTML = (status.models || []).map(model => `<option value="${esc(model.id)}">${esc(model.label)} · ${esc(model.level)}</option>`).join("");
    const preferred = localStorage.getItem(`dcarela.ia.model.v2.${BUSINESS}`) || current || status.models?.[0]?.id;
    if (preferred && [...$("iaModel").options].some(option => option.value === preferred)) $("iaModel").value = preferred;
    else if ($("iaModel").options.length) $("iaModel").selectedIndex = 0;
    // El servidor ya no ofrece modelos de un proveedor caido. Si desaparecio
    // alguno, decir por que: antes el modelo muerto seguia en la lista y el
    // usuario no tenia forma de enterarse desde la interfaz.
    const caidos = Object.entries(status.providers_down || {});
    const avisoIa = $("iaProviderDown");
    if (avisoIa) {
      avisoIa.classList.toggle("oculto", caidos.length === 0);
      avisoIa.textContent = caidos.length
        ? caidos.map(([proveedor, motivo]) => `${proveedor}: ${motivo}`).join(" · ")
        : "";
    }
    $("iaInput").disabled = !status.configured || !status.capabilities?.can_use;
    $("btnIaEnviar").disabled = $("iaInput").disabled;
    $("btnIaAdjuntar").disabled = $("iaInput").disabled;
    $("btnIaMic").disabled = $("iaInput").disabled;
    renderIaDocuments(status.active_documents || []);
  }

  /** Refresca solo el estado de la IA (proveedores, modelos, claves). */
  async function cargarEstadoIa() {
    const status = await iaRequest("status");
    renderIaStatus(status);
    return status;
  }

  const IA_PROVEEDORES = [
    { id: "openrouter", nombre: "OpenRouter (DeepSeek y otros)", donde: "openrouter.ai/keys" },
    { id: "openai", nombre: "OpenAI", donde: "platform.openai.com/api-keys" },
    { id: "google", nombre: "Google AI (Gemini)", donde: "aistudio.google.com/apikey" },
    { id: "anthropic", nombre: "Anthropic (Claude)", donde: "console.anthropic.com" },
  ];

  /**
   * Claves de IA: cambiarlas desde aqui, sin entrar a Supabase ni redesplegar.
   *
   * Antes vivian solo en los Secrets del proyecto. Cuando Google denego la cuenta
   * por facturacion, el asistente se quedo sin IA y no habia forma de apuntarlo a
   * otro proveedor desde la aplicacion. La clave nunca se muestra: el servidor
   * solo devuelve de donde sale cada una.
   */
  function renderIaClaves(status) {
    const caja = $("iaClaves");
    if (!caja) return;
    if (!status.full_admin_access || status.local_engine) { caja.innerHTML = ""; caja.classList.add("oculto"); return; }
    caja.classList.remove("oculto");
    const origen = status.claves || {};
    const etiqueta = { panel: "puesta desde aqui", entorno: "en Supabase", "sin clave": "sin clave" };
    caja.innerHTML = IA_PROVEEDORES.map(p => {
      const estado = origen[p.id] || "sin clave";
      return `<div class="assistant-key" data-proveedor="${esc(p.id)}">
        <div class="assistant-key-head">
          <strong>${esc(p.nombre)}</strong>
          <b class="${estado === "sin clave" ? "off" : ""}">${esc(etiqueta[estado] || estado)}</b>
        </div>
        <div class="assistant-key-row">
          <input type="password" placeholder="Pega la clave de ${esc(p.donde)}" autocomplete="off" spellcheck="false">
          <button class="primary" type="button" data-guardar="${esc(p.id)}">Guardar</button>
          ${estado === "panel" ? `<button class="secondary" type="button" data-borrar="${esc(p.id)}">Quitar</button>` : ""}
        </div>
      </div>`;
    }).join("") + `<p class="assistant-key-nota">La clave se prueba contra el proveedor antes de guardarse. Nunca se vuelve a mostrar.</p>`;

    caja.querySelectorAll("[data-guardar]").forEach(boton => boton.addEventListener("click", async () => {
      const fila = boton.closest(".assistant-key");
      const campo = fila.querySelector("input");
      const clave = (campo.value || "").trim();
      if (!clave) { toast("Pega la clave primero."); return; }
      boton.disabled = true; boton.textContent = "Probando…";
      try {
        const r = await iaRequest("set_api_key", { provider: boton.dataset.guardar, api_key: clave });
        campo.value = "";
        toast(r.mensaje || "Clave guardada.");
        await cargarEstadoIa();
      } catch (error) {
        toast(error.message || "No se pudo guardar la clave.");
      } finally { boton.disabled = false; boton.textContent = "Guardar"; }
    }));

    caja.querySelectorAll("[data-borrar]").forEach(boton => boton.addEventListener("click", async () => {
      if (!confirm("¿Quitar esta clave del panel? Se volverá a usar la de Supabase si existe.")) return;
      boton.disabled = true;
      try {
        const r = await iaRequest("set_api_key", { provider: boton.dataset.borrar, api_key: "" });
        toast(r.mensaje || "Clave quitada.");
        await cargarEstadoIa();
      } catch (error) {
        toast(error.message || "No se pudo quitar la clave.");
      } finally { boton.disabled = false; }
    }));
  }

  async function renderIaApprovals() {
    if (!canEdit) return;
    const result = await iaRequest("pending_approvals");
    const actions = result.actions || [];
    $("navIaPending").textContent = actions.length > 99 ? "99+" : String(actions.length);
    $("navIaPending").classList.toggle("oculto", actions.length === 0);
    $("iaApprovals").innerHTML = actions.length ? actions.map(action => `<article class="assistant-approval"><strong>${esc(IA_ACTION_LABELS[action.action] || action.action)}</strong><small>${esc(action.summary)}<br>${esc(fecha(action.created_at))}</small><div class="assistant-action-buttons"><button class="primary" data-ia-confirm="${esc(action.id)}">Aprobar</button><button class="secondary" data-ia-cancel="${esc(action.id)}">Rechazar</button></div></article>`).join("") : `<div class="empty-state">No hay acciones pendientes.</div>`;
    $("iaApprovals").querySelectorAll("[data-ia-confirm]").forEach(button => button.addEventListener("click", () => resolverAccionIa(button.dataset.iaConfirm, true)));
    $("iaApprovals").querySelectorAll("[data-ia-cancel]").forEach(button => button.addEventListener("click", () => resolverAccionIa(button.dataset.iaCancel, false)));
  }

  async function resolverAccionIa(actionId, confirm) {
    if (!actionId || iaBusy) return;
    iaBusy = true;
    $("iaError").textContent = "";
    try {
      const result = await iaRequest(confirm ? "confirm_action" : "cancel_action", { action_id: actionId });
      toast(result.message || (confirm ? "Cambio ejecutado." : "Propuesta cancelada."));
      if (iaConversationId) await abrirConversacionIa(iaConversationId);
      if (canEdit) await renderIaApprovals();
    } catch (error) {
      $("iaError").textContent = error.message;
    } finally { iaBusy = false; }
  }

  async function deshacerAccionIa(actionId) {
    if (!actionId || iaBusy) return;
    iaBusy = true;
    $("iaError").textContent = "";
    try {
      const result = await iaRequest("undo_action", { action_id: actionId });
      toast(result.message || "Cambio deshecho y sincronizado.");
      if (iaConversationId) await abrirConversacionIa(iaConversationId);
      if (canEdit) await renderIaApprovals();
    } catch (error) {
      $("iaError").textContent = error.message;
      toast("No se pudo deshacer automaticamente. Revisa el cambio mas reciente.");
    } finally { iaBusy = false; }
  }

  async function renderIaPermissions() {
    if (!canEdit) return;
    const result = await iaRequest("permissions_list");
    const members = result.members || [];
    $("iaPermissions").innerHTML = members.map(member => {
      const locked = member.inherited_full_access;
      return `<article class="assistant-permission-user" data-ia-user="${esc(member.user_id)}">
        <strong>${esc(member.name || member.email || member.user_id)}</strong><small>${esc(member.role)}${locked ? " · acceso completo por rol" : ""}</small>
        <div class="assistant-permission-grid">${Object.entries(IA_CAPABILITY_LABELS).map(([key, label]) => `<label><input type="checkbox" data-capability="${esc(key)}"${member.capabilities?.[key] ? " checked" : ""}${locked ? " disabled" : ""}><span>${esc(label)}</span></label>`).join("")}</div>
        ${locked ? "" : `<button class="secondary" type="button" data-save-permissions="${esc(member.user_id)}">Guardar permisos</button>`}
      </article>`;
    }).join("");
    $("iaPermissions").querySelectorAll("[data-save-permissions]").forEach(button => button.addEventListener("click", async () => {
      const card = button.closest("[data-ia-user]");
      const capabilities = {};
      card.querySelectorAll("[data-capability]").forEach(input => { capabilities[input.dataset.capability] = input.checked; });
      button.disabled = true;
      try {
        const saved = await iaRequest("permissions_set", { user_id: button.dataset.savePermissions, capabilities });
        toast(saved.message);
        await renderIaPermissions();
      } catch (error) { toast(error.message); }
      finally { button.disabled = false; }
    }));
  }

  function renderIaAttachments() {
    $("iaAttachments").classList.toggle("oculto", iaAttachments.length === 0);
    $("iaAttachments").innerHTML = iaAttachments.map((file, index) => `<span class="assistant-file-chip"><span>${esc(file.name)}</span><button type="button" data-remove-attachment="${index}" aria-label="Quitar adjunto">&#215;</button></span>`).join("");
    $("iaAttachments").querySelectorAll("[data-remove-attachment]").forEach(button => button.addEventListener("click", () => {
      iaAttachments.splice(Number(button.dataset.removeAttachment), 1);
      renderIaAttachments();
    }));
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  async function agregarAdjuntosIa(fileList) {
    const files = [...fileList].slice(0, 4 - iaAttachments.length);
    const allowed = /^(image\/|application\/pdf$|text\/plain$|text\/csv$|application\/json$)/;
    for (const file of files) {
      const extensionMime = /\.csv$/i.test(file.name) ? "text/csv"
        : /\.json$/i.test(file.name) ? "application/json"
        : /\.(txt|md|log)$/i.test(file.name) ? "text/plain"
        : "application/octet-stream";
      const mime = file.type || extensionMime;
      if (!allowed.test(mime)) { toast(`Formato no compatible: ${file.name}`); continue; }
      if (file.size > 6 * 1024 * 1024) { toast(`${file.name} supera 6 MB.`); continue; }
      iaAttachments.push({ name: file.name, mime, data: await fileToBase64(file), size: file.size });
    }
    if (iaAttachments.reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024) {
      iaAttachments.pop();
      toast("Los adjuntos no pueden superar 8 MB en total.");
    }
    renderIaAttachments();
  }

  async function enviarMensajeIa() {
    if (iaBusy) return;
    const input = $("iaInput");
    const originalDraft = input.value;
    const message = originalDraft.trim();
    if (!message && !iaAttachments.length) return;
    const attachmentDraft = iaAttachments;
    iaBusy = true;
    $("iaError").textContent = "";
    $("btnIaEnviar").disabled = true;

    // Extracción proactiva de aprendizajes en tiempo real
    const discovered = extractLearningsFromMessage(message);
    const optimistic = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: message || "Analiza los archivos adjuntos.",
      metadata: { attachments: attachmentDraft, learned_rules: discovered },
      created_at: new Date().toISOString()
    };

    const empty = $("iaMessages").querySelector(".assistant-empty");
    if (empty) empty.remove();
    $("iaMessages").insertAdjacentHTML("beforeend", iaMessageHtml(optimistic) + `<div id="iaThinking" class="assistant-thinking"><span>Pensando y consultando datos</span><i></i><i></i><i></i></div>`);
    $("iaMessages").scrollTop = $("iaMessages").scrollHeight;
    const attachments = attachmentDraft.map(({ name, mime, data }) => ({ name, mime, data }));
    input.value = "";
    input.style.height = "";
    iaAttachments = [];
    renderIaAttachments();
    $("iaActiveTool").textContent = "";
    $("iaActiveTool").classList.add("oculto");
    input.focus();
    try {
      const activeRules = getIaLearnedRules().map(r => `- ${r.content}`).join("\n");
      const result = await iaRequest("chat", {
        conversation_id: iaConversationId,
        message,
        model: $("iaModel").value,
        reasoning_mode: $("iaDepth").value || "deep",
        initiative: $("iaInitiative").value || "proactive",
        response_detail: $("iaDetail").value || "extended",
        attachments,
        custom_rules: activeRules
      });
      iaConversationId = result.conversation.id;
      $("iaModelEffective").textContent = `🧠 Aprendizaje activo · ${result.effective_model}`;
      await cargarConversacionesIa(false);
      await abrirConversacionIa(iaConversationId);
      renderIaLearnings();
      if (canEdit) await renderIaApprovals();
    } catch (error) {
      $("iaThinking")?.remove();
      $("iaMessages").querySelector(`[data-message-id="${optimistic.id}"]`)?.remove();
      if (!$("iaMessages").children.length) $("iaMessages").innerHTML = IA_EMPTY_HTML;
      if (!input.value) {
        input.value = originalDraft;
        input.dispatchEvent(new Event("input"));
      }
      if (!iaAttachments.length && attachmentDraft.length) {
        iaAttachments = attachmentDraft;
        renderIaAttachments();
      }
      $("iaError").textContent = error.message;
      toast("El asistente no pudo completar la solicitud.");
    } finally {
      iaBusy = false;
      $("btnIaEnviar").disabled = !iaStatusCache?.configured || !iaStatusCache?.capabilities?.can_use;
    }
  }

  async function cargarAsistente() {
    $("iaError").textContent = "";
    const status = await iaRequest("status");
    renderIaStatus(status);
    if (!status.capabilities?.can_use) {
      $("iaMessages").innerHTML = `<div class="assistant-empty"><strong>Acceso no habilitado</strong><p>Un administrador debe autorizar las capacidades de esta cuenta desde este mismo modulo.</p></div>`;
      return;
    }
    await cargarConversacionesIa(true);
    if (canEdit) await Promise.all([renderIaApprovals(), renderIaPermissions()]);
    const pendingKey = `dcarela.ia.pending.${BUSINESS}`;
    const pending = localStorage.getItem(pendingKey);
    if (pending) {
      localStorage.removeItem(pendingKey);
      iaConversationId = null;
      $("iaConversationTitle").textContent = "Nueva conversacion";
      $("iaMessages").innerHTML = "";
      $("iaInput").value = pending;
      $("iaInput").dispatchEvent(new Event("input"));
      await enviarMensajeIa();
    }
  }

  function cerrarEditor() {
    $("editorOverlay").classList.add("oculto");
    $("editorOverlay").classList.remove("editor-wide");
    $("editorOverlay").setAttribute("aria-hidden", "true");
    $("editorFields").innerHTML = "";
    $("editorError").textContent = "";
    $("btnGuardarEditor").textContent = "Guardar y sincronizar";
    editorSubmit = null;
  }

  function abrirEditor(title, subtitle, fields, onSubmit, submitLabel = "Guardar y sincronizar", wide = false) {
    if (!canEdit) { toast("Tu cuenta no tiene permiso para editar."); return; }
    $("editorTitle").textContent = title;
    $("editorSubtitle").textContent = subtitle || "El cambio quedara auditado y se aplicara en las cajas conectadas.";
    $("editorFields").innerHTML = fields;
    $("editorError").textContent = "";
    $("btnGuardarEditor").textContent = submitLabel;
    editorSubmit = onSubmit;
    $("editorOverlay").classList.toggle("editor-wide", wide);
    $("editorOverlay").classList.remove("oculto");
    $("editorOverlay").setAttribute("aria-hidden", "false");
    setTimeout(() => $("editorFields").querySelector("input:not([type=checkbox]), select, textarea")?.focus(), 0);
  }

  const pesoInput = cents => (numero(cents) / 100).toFixed(2);
  const centavosInput = value => {
    const parsed = Number(String(value ?? "").trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Escribe un monto valido.");
    return Math.round(parsed * 100);
  };
  const centavosConSignoInput = value => {
    const parsed = Number(String(value ?? "").trim().replace(",", "."));
    if (!Number.isFinite(parsed)) throw new Error("Escribe un monto valido.");
    return Math.round(parsed * 100);
  };
  const decimalInput = value => {
    const parsed = Number(String(value ?? "").trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Escribe una cantidad valida.");
    return String(parsed);
  };
  const checked = value => value ? " checked" : "";
  const selected = (value, expected) => String(value ?? "") === String(expected) ? " selected" : "";

  function mergeEvents(items, stateTypes) {
    const result = new Map();
    items.forEach(event => {
      const payload = P(event);
      const id = String(event.entity_id || payload.productoId || payload.clienteId || payload.categoriaId || "").trim();
      if (!id) return;
      if (!result.has(id)) result.set(id, { id, _latestAt: fechaEventoIso(event), _latestEvent: event.event_type });
      const current = result.get(id);
      Object.entries(payload).forEach(([key, value]) => {
        if (current[key] === undefined && value !== undefined) current[key] = value;
      });
      if (event.event_type === "InventarioAjustado" && current.stock === undefined) {
        current.stock = payload.cantidadNueva ?? payload.nuevoStock ?? payload.stock;
      }
      if (stateTypes.includes(event.event_type) && current._stateEvent === undefined) current._stateEvent = event.event_type;
    });
    return [...result.values()];
  }

  function normalizedKey(value) {
    return textoSeguro(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .toLowerCase();
  }

  function catalogKey(item) {
    return [normalizedKey(item.codigoBarras), normalizedKey(item.nombre), normalizedKey(item.tipo || "producto")].join("|");
  }

  function consolidateProducts(items) {
    const result = new Map();
    items
      .sort((a, b) => String(b._latestAt || "").localeCompare(String(a._latestAt || "")))
      .forEach(item => {
        const key = catalogKey(item);
        if (!key.replaceAll("|", "")) return;
        if (!result.has(key)) {
          result.set(key, { ...item });
          return;
        }
        const current = result.get(key);
        Object.entries(item).forEach(([property, value]) => {
          if ((current[property] === undefined || current[property] === null || current[property] === "")
              && value !== undefined && value !== null && value !== "") {
            current[property] = value;
          }
        });
      });
    return [...result.values()];
  }

  function consolidateNamed(items) {
    const result = new Map();
    items
      .sort((a, b) => String(b._latestAt || "").localeCompare(String(a._latestAt || "")))
      .forEach(item => {
        const key = normalizedKey(item.nombre);
        if (!key) return;
        if (!result.has(key)) {
          result.set(key, { ...item, _ids: [item.id] });
          return;
        }
        const current = result.get(key);
        if (item.id && !current._ids.includes(item.id)) current._ids.push(item.id);
        Object.entries(item).forEach(([property, value]) => {
          if ((current[property] === undefined || current[property] === null || current[property] === "")
              && value !== undefined && value !== null && value !== "") {
            current[property] = value;
          }
        });
      });
    return [...result.values()];
  }

  async function cargarCatalogoCloud(force = false) {
    if (!force && productCatalog && categoryCatalog && comboCatalog) {
      return { products: productCatalog, categories: categoryCatalog, combos: comboCatalog };
    }
    if (authProvider === "firebase") {
      if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
      const [products, categories, combos] = await Promise.all([
        window.DcarelaFirebase.getProducts(BUSINESS),
        window.DcarelaFirebase.getCategories(BUSINESS),
        window.DcarelaFirebase.getProductCombos(BUSINESS)
      ]);
      productCatalog = (products || []).sort((a, b) => String(a.nombre || a.name || "").localeCompare(String(b.nombre || b.name || ""), "es"));
      categoryCatalog = (categories || []).sort((a, b) => String(a.nombre || a.name || "").localeCompare(String(b.nombre || b.name || ""), "es"));
      comboCatalog = new Map((combos || []).map(item => [item.comboId || item.id, item]));
      return { products: productCatalog, categories: categoryCatalog, combos: comboCatalog };
    }
    try {
      const [productEvents, categoryEvents, comboEvents] = await Promise.all([
        eventos(["ProductoCreado", "ProductoEditado", "ProductoDesactivado", "InventarioAjustado"], null, null, 3000),
        eventos(["CategoriaCreada"], null, null, 1000),
        eventos(["KitEditado"], null, null, 3000)
      ]);
      const mergedProducts = consolidateProducts(
        mergeEvents(productEvents, ["ProductoCreado", "ProductoEditado", "ProductoDesactivado"])
      )
        .filter(item => item.nombre)
        .map(item => ({ ...item, activo: item._stateEvent !== "ProductoDesactivado" && item.activo !== false }))
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

      const mergedCategories = consolidateNamed(mergeEvents(categoryEvents, ["CategoriaCreada"]))
        .filter(item => item.nombre)
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

      if (mergedProducts.length) {
        productCatalog = mergedProducts;
        categoryCatalog = mergedCategories;
        comboCatalog = new Map();
        comboEvents.forEach(event => {
          const payload = P(event);
          const id = String(payload.comboId || event.entity_id || "").trim();
          if (id && !comboCatalog.has(id)) comboCatalog.set(id, {
            componentes: Array.isArray(payload.componentes) ? payload.componentes : [],
            costoCentavos: numero(payload.costoCentavos),
            fecha: fechaEventoIso(event)
          });
        });
        return { products: productCatalog, categories: categoryCatalog, combos: comboCatalog };
      }
    } catch (catErr) {
      console.warn("cargarCatalogoCloud Supabase notice:", catErr.message);
    }

    productCatalog = productCatalog || [];
    categoryCatalog = categoryCatalog || [];
    comboCatalog = comboCatalog || new Map();
    return { products: productCatalog, categories: categoryCatalog, combos: comboCatalog };
  }

  async function cargarClientesCloud(force = false) {
    if (!force && clientCatalog) return clientCatalog;
    if (authProvider === "firebase") {
      if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
      const clients = await window.DcarelaFirebase.getClients(BUSINESS);
      clientCatalog = (clients || []).sort((a, b) => String(a.nombre || a.name || "").localeCompare(String(b.nombre || b.name || ""), "es"));
      return clientCatalog;
    }
    try {
      const items = await eventos(["ClienteCreado", "ClienteEditado", "ClienteDesactivado"], null, null, 3000);
      const merged = mergeEvents(items, ["ClienteCreado", "ClienteEditado", "ClienteDesactivado"])
        .filter(item => item.nombre)
        .map(item => ({ ...item, activo: item._stateEvent !== "ClienteDesactivado" && item.activo !== false }))
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
      if (merged.length) {
        clientCatalog = merged;
        return clientCatalog;
      }
    } catch (cliErr) {
      console.warn("cargarClientesCloud notice:", cliErr.message);
    }

    clientCatalog = clientCatalog || [];
    return clientCatalog;
  }

  async function cargarUsuariosCloud(force = false) {
    if (!force && userCatalog) return userCatalog;
    const items = await eventos(["UsuarioCreado", "UsuarioEditado", "UsuarioActualizado", "UsuarioDesactivado"], null, null, 5000);
    userCatalog = new Map();
    items.forEach(event => {
      const payload = P(event);
      const id = String(payload.usuarioId || event.entity_id || "").trim();
      const nombre = String(payload.nombre || payload.usuarioNombre || payload.nombreUsuario || "").trim();
      if (id && nombre && !userCatalog.has(id)) userCatalog.set(id, nombre);
    });
    return userCatalog;
  }

  function nombreCajero(payload, usuarios) {
    const directo = String(payload?.cajeroNombre || payload?.usuarioNombre || "").trim();
    if (directo) return directo;
    const id = String(payload?.usuarioId || "").trim();
    return usuarios?.get(id) || (id ? `Usuario ${id.slice(0, 8)}` : "Cajero no identificado");
  }

  async function cargarNegocioCloud(force = false) {
    if (!force && businessConfig) return businessConfig;
    const changes = await eventos(["ConfiguracionActualizada"], null, null, 1000);
    const event = changes.find(item => P(item).seccion === "negocio");
    businessConfig = event ? { ...P(event) } : {
      nombre: "D' Carela Compufoto", rnc: "026-0075688-2",
      slogan: "Captamos tus mejores momentos...", direccion: "",
      whatsapp: "809-757-5644", telefono: "809-746-8651",
      instagram: "@dcarela_compufoto", tiktok: "@carelacompufoto",
      ticketPie: "Gracias por su compra", logoActivo: "1"
    };
    return businessConfig;
  }

  function clavesVenta(event) {
    const payload = P(event);
    return [event?.entity_id, payload.id, payload.ventaId, payload.venta_id, payload.saleId, payload.sale_id]
      .filter(Boolean).map(value => String(value).trim().toLowerCase());
  }

  async function idsVentasAnuladas(force = false, sourceEvents = null) {
    if (!sourceEvents && !force && Date.now() - cancelCache.at < 2 * 60 * 1000) return cancelCache.ids;
    const cancellations = sourceEvents
      ? eventosDesde(sourceEvents, ["VentaCancelada"], null, null, 1600)
      : await eventos(["VentaCancelada"], null, null, 1600);
    const ids = new Set();
    cancellations.forEach(event => clavesVenta(event).forEach(id => ids.add(id)));
    cancelCache = { at: Date.now(), ids };
    return ids;
  }

  async function ventasActivas(from, to, limit = 1600, sourceEvents = null) {
    const sales = sourceEvents
      ? eventosDesde(sourceEvents, ["VentaCobrada"], from, to, limit)
      : await eventos(["VentaCobrada"], from, to, limit);
    const cancelled = await idsVentasAnuladas(Boolean(sourceEvents), sourceEvents);
    const active = sales.filter(sale => !clavesVenta(sale).some(id => cancelled.has(id)));
    return { active, excluded: sales.length - active.length, raw: sales };
  }

  function identificadorTurno(event) {
    const payload = P(event);
    return String(payload.turnoId || payload.turno_id || event?.entity_id || "").trim();
  }

  async function turnosDelRango(from, to, ventas = null, sourceEvents = null) {
    const desdeExtendido = new Date(new Date(from).getTime() - 86400000).toISOString();
    const [resultadoVentas, eventosCaja, usuarios] = await Promise.all([
      ventas ? Promise.resolve({ active: ventas }) : ventasActivas(from, to, 1600, sourceEvents),
      sourceEvents
        ? Promise.resolve(eventosDesde(sourceEvents, ["CajaAbierta", "CajaCerrada", "CierreConDiferencia", "TurnoCambiado"], desdeExtendido, to, 1600))
        : eventos(["CajaAbierta", "CajaCerrada", "CierreConDiferencia", "TurnoCambiado"], desdeExtendido, to, 1600),
      cargarUsuariosCloud()
    ]);
    const grupos = new Map();
    const crear = id => {
      if (!grupos.has(id)) grupos.set(id, {
        id, inicio: null, fin: null, ultimaVenta: null, caja: "Caja", estado: "abierto",
        apertura: null, entregar: null, esperado: null, contado: null, diferencia: null, motivo: "",
        total: 0, efectivo: 0, itbis: 0, ventas: [], conteo: [], cajeros: new Set(), usuarios: new Set()
      });
      return grupos.get(id);
    };
    const opcional = (...values) => {
      for (const value of values) {
        if (value === null || value === undefined || value === "") continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return null;
    };

    [...eventosCaja].sort((a, b) => String(fechaEventoIso(a)).localeCompare(String(fechaEventoIso(b)))).forEach(event => {
      const id = identificadorTurno(event);
      if (!id) return;
      const payload = P(event);
      const grupo = crear(id);
      const nombre = nombreCajero(payload, usuarios);
      if (nombre && !nombre.startsWith("Usuario ") && nombre !== "Cajero no identificado") grupo.cajeros.add(nombre);
      if (payload.usuarioId) grupo.usuarios.add(String(payload.usuarioId));
      grupo.caja = payload.cajaNombre || grupo.caja;
      if (event.event_type === "CajaAbierta") {
        grupo.inicio = payload.abiertoEn || fechaEventoIso(event);
        grupo.apertura = opcional(payload.montoAperturaCentavos, payload.monto_apertura_centavos);
        grupo.estado = "abierto";
      }
      if (event.event_type === "CajaCerrada") {
        grupo.fin = payload.cerradoEn || fechaEventoIso(event);
        grupo.esperado = opcional(payload.efectivoEsperadoCentavos, payload.efectivo_esperado_centavos);
        grupo.entregar = opcional(payload.efectivoAEntregarCentavos, payload.efectivo_a_entregar_centavos);
        grupo.contado = opcional(payload.efectivoContadoCentavos, payload.efectivo_contado_centavos);
        grupo.diferencia = opcional(payload.diferenciaCentavos, payload.diferencia_centavos);
        grupo.conteo = Array.isArray(payload.conteoDenominaciones) ? payload.conteoDenominaciones : [];
        grupo.motivo = payload.nota || payload.motivo || grupo.motivo;
        grupo.estado = "cerrado";
      }
      if (event.event_type === "CierreConDiferencia") {
        grupo.diferencia = opcional(payload.diferenciaCentavos, payload.diferencia_centavos);
        grupo.motivo = payload.motivo || payload.explicacion || payload.nota || grupo.motivo;
      }
    });

    [...resultadoVentas.active].sort((a, b) => String(fechaEventoIso(a)).localeCompare(String(fechaEventoIso(b)))).forEach(event => {
      const payload = P(event);
      const id = identificadorTurno(event) || "sin-turno";
      const grupo = crear(id);
      const fechaVenta = fechaEventoIso(event);
      grupo.inicio ||= payload.turnoInicio || fechaVenta;
      grupo.ultimaVenta = fechaVenta;
      grupo.caja = payload.cajaNombre || grupo.caja;
      grupo.total += totalDe(payload);
      grupo.efectivo += efectivoDe(payload);
      grupo.itbis += itbisDe(payload);
      grupo.ventas.push(event);
      if (payload.usuarioId) grupo.usuarios.add(String(payload.usuarioId));
      const nombre = nombreCajero(payload, usuarios);
      if (nombre && !nombre.startsWith("Usuario ") && nombre !== "Cajero no identificado") grupo.cajeros.add(nombre);
    });

    const inicio = new Date(from).getTime();
    const fin = new Date(to).getTime();
    return [...grupos.values()]
      .filter(grupo => grupo.ventas.length || [grupo.inicio, grupo.fin].some(value => {
        const time = value ? new Date(value).getTime() : NaN;
        return Number.isFinite(time) && time >= inicio && time <= fin;
      }))
      .map(grupo => {
        grupo.cajero = grupo.cajeros.size
          ? [...grupo.cajeros].join(" / ")
          : [...grupo.usuarios].map(id => usuarios.get(id)).filter(Boolean).join(" / ") || "Cajero no identificado";
        return grupo;
      })
      .sort((a, b) => String(b.inicio || b.ultimaVenta || "").localeCompare(String(a.inicio || a.ultimaVenta || "")));
  }

  function pistaDiferencia(turno) {
    const diferencia = numero(turno?.diferencia);
    if (!diferencia) return "";
    const conteo = Array.isArray(turno?.conteo) ? turno.conteo : [];
    if (diferencia > 0 && conteo.length) {
      const opciones = [];
      conteo.forEach(item => {
        const valor = numero(item.valorCentavos, item.denominacionCentavos);
        const cantidad = Math.max(0, Math.trunc(numero(item.cantidad)));
        if (valor <= 0 || cantidad <= 0) return;
        const unidades = Math.max(1, Math.min(cantidad, Math.round(diferencia / valor)));
        opciones.push({ valor, unidades, restante: diferencia - valor * unidades });
      });
      opciones.sort((a, b) => Math.abs(a.restante) - Math.abs(b.restante));
      const mejor = opciones[0];
      if (mejor && Math.abs(mejor.restante) < Math.abs(diferencia)) {
        return `Revisa ${mejor.unidades} ${mejor.unidades === 1 ? "pieza" : "piezas"} de ${money(mejor.valor)}: sin ese conteo, el sobrante seria ${money(mejor.restante)}.`;
      }
    }
    return diferencia > 0
      ? `Sobrante de ${money(diferencia)}: revisa denominaciones, entradas y dinero ajeno al fondo de caja.`
      : `Faltante de ${money(Math.abs(diferencia))}: revisa devueltas, salidas y denominaciones omitidas.`;
  }

  async function cargarTurnos() {
    if (!$("turDesde").value) {
      const today = inputDate(new Date());
      $("turDesde").value = today;
      $("turHasta").value = today;
    }
    const from = inicioDia($("turDesde").value);
    const to = finDia($("turHasta").value);
    const { active } = await ventasActivas(from, to, 50000);
    const turnos = await turnosDelRango(from, to, active);
    lastTurnExport = { desde: $("turDesde").value, hasta: $("turHasta").value, turnos };
    const total = turnos.reduce((sum, turno) => sum + turno.total, 0);
    const efectivo = turnos.reduce((sum, turno) => sum + turno.efectivo, 0);
    const diferencias = turnos.filter(turno => turno.diferencia !== null && turno.diferencia !== 0);
    const diferenciaTotal = diferencias.reduce((sum, turno) => sum + turno.diferencia, 0);
    const sinTurno = turnos.find(turno => turno.id === "sin-turno")?.ventas.length || 0;
    $("turnosResumen").innerHTML = metric("Turnos", String(turnos.filter(t => t.id !== "sin-turno").length))
      + metric("Ventas validas", String(active.length))
      + metric("Total vendido", money(total))
      + metric("Ventas en efectivo", money(efectivo))
      + metric("Arqueos con diferencia", String(diferencias.length))
      + metric("Diferencia fisica", money(diferenciaTotal))
      + (sinTurno ? metric("Ventas sin turno", String(sinTurno)) : "");

    if (!turnos.length) {
      $("turnosTabla").innerHTML = '<div class="empty-state">No hay turnos ni ventas en el rango seleccionado.</div>';
      return;
    }
    const rows = turnos.map((turno, index) => {
      const diferencia = turno.diferencia;
      const diferenciaTexto = diferencia === null ? "Pendiente" : diferencia === 0 ? "Exacto" : money(diferencia);
      const diferenciaClase = diferencia === 0 ? "difference-ok" : diferencia === null
        ? "muted" : diferencia > 0 ? "difference-surplus" : "difference-bad";
      const pista = pistaDiferencia(turno);
      const detalle = turno.ventas.length
        ? turno.ventas.map(venta => {
            const payload = P(venta);
            const hora = new Date(fechaEventoIso(venta)).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
            return `<div class="turn-sale"><span>#${esc(payload.folio ?? "--")}</span><span>${esc(hora)}</span><span>${esc(nombreCajero(payload, userCatalog))}</span><span>${esc(metodoConCuentaDe(payload))}</span><strong>${money(totalDe(payload))}</strong></div>`;
          }).join("")
        : '<div class="empty-state">Este turno no tiene ventas sincronizadas.</div>';
      return `<tr class="turn-row" id="turn-${esc(turno.id)}"><td>${esc(fecha(turno.inicio))}</td><td>${turno.fin ? esc(fecha(turno.fin)) : "En curso"}</td><td>${esc(turno.cajero)}</td><td>${esc(turno.caja)}</td><td>${turno.ventas.length}</td><td class="amount">${money(turno.total)}</td><td class="amount">${money(turno.efectivo)}</td><td class="amount">${turno.apertura === null ? "--" : money(turno.apertura)}</td><td class="amount">${turno.entregar === null ? "--" : money(turno.entregar)}</td><td class="amount">${turno.esperado === null ? "--" : money(turno.esperado)}</td><td class="amount">${turno.contado === null ? "--" : money(turno.contado)}</td><td class="amount ${diferenciaClase}" title="${esc(turno.motivo)}">${esc(diferenciaTexto)}</td><td><span class="tag ${turno.estado === "cerrado" ? "ok" : "warn"}">${esc(turno.estado)}</span></td><td><button class="secondary turn-toggle" data-detail="turn-detail-${index}">Ventas</button></td></tr>
        <tr id="turn-detail-${index}" class="detail-row oculto"><td colspan="14"><div class="detail-box turn-detail"><div class="turn-detail-head"><strong>Folios de este turno</strong><span>${turno.motivo ? `Nota del arqueo: ${esc(turno.motivo)}` : "Sin nota de diferencia"}</span></div>${pista ? `<div class="cash-clue ${diferencia > 0 ? "surplus" : "shortage"}">${esc(pista)}</div>` : ""}${detalle}</div></td></tr>`;
    }).join("");
    $("turnosTabla").innerHTML = `<table><thead><tr><th>Entrada</th><th>Salida</th><th>Cajero(s)</th><th>Caja</th><th>Ventas</th><th class="amount">Total</th><th class="amount">Efectivo</th><th class="amount">Apertura</th><th class="amount">A entregar</th><th class="amount">Esperado fisico</th><th class="amount">Contado</th><th class="amount">Diferencia</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    document.querySelectorAll(".turn-toggle").forEach(button => button.addEventListener("click", () => $(button.dataset.detail).classList.toggle("oculto")));
    const focus = sessionStorage.getItem("dcarela.turno.focus");
    if (focus) {
      sessionStorage.removeItem("dcarela.turno.focus");
      const row = document.getElementById(`turn-${focus}`);
      row?.classList.add("focused");
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  const RECON_EVENT_TYPES = [
    "VentaCobrada", "VentaCancelada", "CajaAbierta", "CajaCerrada", "CierreConDiferencia",
    "EntradaEfectivo", "SalidaEfectivo", "DevolucionRegistrada", "AbonoClienteRegistrado"
  ];

  const folioVenta = event => {
    const value = Number.parseInt(String(P(event).folio ?? ""), 10);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  };

  const idVenta = event => String(P(event).ventaId || P(event).venta_id || event?.entity_id || event?.event_id || "").trim();

  function actualizarOpcionesRecalculo(selectId, options, emptyLabel) {
    const select = $(selectId);
    const previous = select.value;
    const unique = new Map(options.filter(item => item?.value).map(item => [String(item.value), String(item.label || item.value)]));
    select.innerHTML = `<option value="">${esc(emptyLabel)}</option>${[...unique.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "es"))
      .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}`;
    if (unique.has(previous)) select.value = previous;
  }

  function estadoRecalculo(text, tone = "") {
    const pill = $("recEstadoPill");
    pill.textContent = text;
    pill.className = `status-pill ${tone}`.trim();
  }

  function mostrarProgresoRecalculo(text) {
    $("recProgreso").classList.remove("oculto");
    $("recProgresoTexto").textContent = text;
    estadoRecalculo("Recalculando", "running");
  }

  function diferenciaIngresadaCentavos() {
    const raw = String($("recDiferencia").value || "").trim().replace(",", ".");
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error("La diferencia conocida no es un numero valido.");
    return Math.round(parsed * 100);
  }

  function diferenciaExplicadaCentavos() {
    const raw = String($("recDiferenciaExplicada").value || "").trim().replace(",", ".");
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error("La parte explicada no es un numero valido.");
    return Math.round(parsed * 100);
  }

  function terminalVenta(event, devices) {
    const payload = P(event);
    const deviceId = String(event.device_id || payload.deviceId || payload.device_id || "").trim();
    const device = devices.get(deviceId);
    return {
      id: deviceId || String(payload.cajaNombre || payload.caja || "sin-terminal"),
      label: device?.device_name || payload.cajaNombre || device?.cash_register_id || (deviceId ? `Terminal ${deviceId.slice(0, 8)}` : "Sin terminal")
    };
  }

  function sumatoriaPagos(payload) {
    const payments = Array.isArray(payload?.pagos) ? payload.pagos : [];
    return {
      detailed: payments.length > 0,
      total: payments.reduce((sum, payment) => sum + numero(payment?.montoCentavos, payment?.monto_centavos), 0)
    };
  }

  function sumatoriaLineas(payload) {
    const lines = lineasDe(payload);
    return {
      detailed: lines.length > 0,
      total: lines.reduce((sum, line) => sum + numero(line?.importeFinalCentavos, line?.importe_final_centavos, line?.totalCentavos, line?.total_centavos), 0)
    };
  }

  function combinacionesParaDiferencia(target, activeSales, cancelledSales, issues, label) {
    const amount = Math.abs(target);
    if (!amount) return [];
    const candidates = [];
    const add = (type, sales, value, reason, confidence = "Exacta") => {
      const key = `${target}|${type}|${sales.map(idVenta).join("+")}|${value}`;
      if (candidates.some(item => item.key === key)) return;
      candidates.push({ key, target, label, type, sales, value, reason, confidence });
    };

    cancelledSales.filter(sale => totalDe(P(sale)) === amount).slice(0, 4).forEach(sale =>
      add("Venta anulada", [sale], amount, "Una venta anulada coincide exactamente con la diferencia."));
    activeSales.filter(sale => totalDe(P(sale)) === amount).slice(0, 4).forEach(sale =>
      add("Venta individual", [sale], amount, "El total del ticket coincide; verifica si fue contado o registrado dos veces.", "Candidata"));
    activeSales.filter(sale => efectivoDe(P(sale)) === amount && totalDe(P(sale)) !== amount).slice(0, 4).forEach(sale =>
      add("Porcion en efectivo", [sale], amount, "La parte en efectivo de una venta mixta coincide con la diferencia.", "Candidata"));
    issues.filter(issue => Math.abs(issue.delta) === amount).slice(0, 4).forEach(issue =>
      add("Importe incongruente", [issue.event], amount, issue.detail));

    const seen = new Map();
    let pairCount = 0;
    for (const sale of activeSales.slice(0, 5000)) {
      const value = totalDe(P(sale));
      const complement = amount - value;
      if (complement > 0 && seen.has(complement)) {
        add("Combinacion de 2 ventas", [seen.get(complement), sale], amount,
          "La suma de estos dos tickets coincide exactamente con la diferencia.", "Candidata");
        pairCount += 1;
        if (pairCount >= 4) break;
      }
      if (value > 0 && !seen.has(value)) seen.set(value, sale);
    }
    return candidates.slice(0, 12);
  }

  async function ejecutarRecalculo() {
    const from = inicioDia($("recDesde").value);
    const to = finDia($("recHasta").value);
    const manualDifference = diferenciaIngresadaCentavos();
    const explainedDifference = diferenciaExplicadaCentavos();
    const unexplainedDifference = manualDifference
      ? Math.sign(manualDifference) * Math.max(0, Math.abs(manualDifference) - Math.abs(explainedDifference))
      : 0;
    mostrarProgresoRecalculo("Leyendo eventos y terminales de la nube...");
    await new Promise(resolve => setTimeout(resolve, 35));

    const extendedFrom = new Date(new Date(from).getTime() - 86400000).toISOString();
    const [rangeEvents, allCancellations, users, deviceRows] = await Promise.all([
      eventos(RECON_EVENT_TYPES, extendedFrom, to, 100000),
      eventos(["VentaCancelada"], null, null, 50000),
      cargarUsuariosCloud(),
      getDevices().catch(() => [])
    ]);
    const devices = new Map(deviceRows.map(device => [String(device.id), device]));
    const inRequestedRange = event => {
      const time = new Date(fechaEventoIso(event)).getTime();
      return Number.isFinite(time) && time >= new Date(from).getTime() && time <= new Date(to).getTime();
    };
    const salesBeforeFilters = rangeEvents.filter(event => event.event_type === "VentaCobrada" && inRequestedRange(event));
    actualizarOpcionesRecalculo("recDispositivo", salesBeforeFilters.map(event => {
      const terminal = terminalVenta(event, devices);
      return { value: terminal.id, label: terminal.label };
    }), "Todas las terminales");
    actualizarOpcionesRecalculo("recCajero", salesBeforeFilters.map(event => ({
      value: nombreCajero(P(event), users), label: nombreCajero(P(event), users)
    })), "Todos los cajeros");

    const currentDevice = $("recDispositivo").value;
    const currentCashier = $("recCajero").value;
    const matchDevice = event => !currentDevice || terminalVenta(event, devices).id === currentDevice;
    const matchCashier = event => !currentCashier || nombreCajero(P(event), users) === currentCashier;
    const sales = salesBeforeFilters.filter(event => matchDevice(event) && matchCashier(event));
    const eventScope = rangeEvents.filter(event => matchDevice(event));
    const cancelledIds = new Set();
    allCancellations.forEach(event => clavesVenta(event).forEach(id => cancelledIds.add(id)));
    const activeSales = sales.filter(sale => !clavesVenta(sale).some(id => cancelledIds.has(id)));
    const cancelledSales = sales.filter(sale => clavesVenta(sale).some(id => cancelledIds.has(id)));
    mostrarProgresoRecalculo("Verificando folios, pagos y productos de cada venta...");
    await new Promise(resolve => setTimeout(resolve, 35));

    const folioGroups = new Map();
    sales.forEach(event => {
      const folio = folioVenta(event);
      if (folio === null) return;
      const terminal = terminalVenta(event, devices);
      if (!folioGroups.has(terminal.id)) folioGroups.set(terminal.id, { terminal, byFolio: new Map() });
      const group = folioGroups.get(terminal.id);
      if (!group.byFolio.has(folio)) group.byFolio.set(folio, []);
      group.byFolio.get(folio).push(event);
    });
    const folioGaps = [];
    const sequenceBreaks = [];
    const duplicates = [];
    folioGroups.forEach(group => {
      const sequence = [...group.byFolio.keys()].sort((a, b) => a - b);
      sequence.forEach(folio => {
        const events = group.byFolio.get(folio);
        const uniqueSales = new Set(events.map(idVenta));
        if (events.length > 1 && uniqueSales.size > 1) duplicates.push({ terminal: group.terminal, folio, events });
      });
      for (let index = 1; index < sequence.length; index += 1) {
        const previous = sequence[index - 1];
        const next = sequence[index];
        if (next <= previous + 1) continue;
        const count = next - previous - 1;
        const explicit = count <= 80
          ? Array.from({ length: count }, (_, offset) => previous + offset + 1).join(", ")
          : `${previous + 1} a ${next - 1}`;
        const item = { terminal: group.terminal, previous, next, count, explicit,
          previousEvent: group.byFolio.get(previous)[0], nextEvent: group.byFolio.get(next)[0] };
        if (count > 100) sequenceBreaks.push(item);
        else folioGaps.push(item);
      }
    });

    const saleIssues = [];
    activeSales.forEach(event => {
      const payload = P(event);
      const total = totalDe(payload);
      const payment = sumatoriaPagos(payload);
      const lines = sumatoriaLineas(payload);
      const calculatedPresent = payload.totalCalculadoCentavos !== undefined || payload.total_calculado_centavos !== undefined;
      const calculated = numero(payload.totalCalculadoCentavos, payload.total_calculado_centavos);
      const adjustment = numero(payload.ajusteRedondeoCentavos, payload.ajuste_redondeo_centavos);
      const received = numero(payload.pagoConCentavos, payload.pago_con_centavos);
      const change = numero(payload.cambioCentavos, payload.cambio_centavos);
      const cash = efectivoDe(payload);
      const addIssue = (kind, expected, observed, detail) => saleIssues.push({
        event, kind, expected, observed, delta: observed - expected, detail
      });
      if (total <= 0) addIssue("Total no valido", 1, total, "La venta no tiene un total positivo.");
      if (payment.detailed && payment.total !== total)
        addIssue("Pagos no cuadran", total, payment.total, "La suma de los metodos de pago no coincide con el total cobrado.");
      if (lines.detailed && calculatedPresent && lines.total !== calculated)
        addIssue("Detalle no cuadra", calculated, lines.total, "La suma de productos no coincide con el total calculado antes del redondeo.");
      if (calculatedPresent && calculated + adjustment !== total)
        addIssue("Redondeo no cuadra", total, calculated + adjustment, "Total calculado + ajuste no coincide con el total cobrado.");
      if (received > 0 && cash > 0 && received - change !== cash)
        addIssue("Recibido / cambio", cash, received - change, "Efectivo recibido menos cambio no coincide con la porcion en efectivo de la venta.");
      if (!identificadorTurno(event)) addIssue("Venta sin turno", 1, 0, "La venta no esta asociada a una apertura de caja.");
    });

    const orphanCancellations = allCancellations.filter(cancellation => inRequestedRange(cancellation)
      && matchDevice(cancellation)
      && !sales.some(sale => clavesVenta(cancellation).some(id => clavesVenta(sale).includes(id))));
    mostrarProgresoRecalculo("Reconstruyendo el efectivo de cada turno...");
    await new Promise(resolve => setTimeout(resolve, 35));

    const turnMap = new Map();
    const turn = id => {
      if (!turnMap.has(id)) turnMap.set(id, {
        id, terminal: "Caja", cashier: "Cajero no identificado", opened: null, closed: null,
        opening: 0, sales: 0, cashSales: 0, entries: 0, exits: 0, refunds: 0,
        cashPayments: 0, cashPaymentsSummary: null,
        reportedExpected: null, counted: null, reportedDifference: null, saleCount: 0, names: new Set()
      });
      return turnMap.get(id);
    };
    eventScope.forEach(event => {
      const payload = P(event);
      const turnId = identificadorTurno(event);
      if (!turnId) return;
      const item = turn(turnId);
      item.terminal = terminalVenta(event, devices).label || item.terminal;
      const cashier = nombreCajero(payload, users);
      if (cashier && cashier !== "Cajero no identificado") item.names.add(cashier);
      if (event.event_type === "CajaAbierta") {
        item.opened = payload.abiertoEn || fechaEventoIso(event);
        item.opening = numero(payload.montoAperturaCentavos, payload.monto_apertura_centavos);
      } else if (event.event_type === "CajaCerrada") {
        item.closed = payload.cerradoEn || fechaEventoIso(event);
        item.reportedExpected = numero(payload.efectivoEsperadoCentavos, payload.efectivo_esperado_centavos);
        item.counted = numero(payload.efectivoContadoCentavos, payload.efectivo_contado_centavos);
        item.reportedDifference = numero(payload.diferenciaCentavos, payload.diferencia_centavos);
        if (payload.abonosEfectivoCentavos !== undefined || payload.abonos_efectivo_centavos !== undefined)
          item.cashPaymentsSummary = numero(payload.abonosEfectivoCentavos, payload.abonos_efectivo_centavos);
      } else if (event.event_type === "EntradaEfectivo") item.entries += montoDe(payload);
      else if (event.event_type === "SalidaEfectivo") item.exits += montoDe(payload);
      else if (event.event_type === "DevolucionRegistrada" && String(payload.metodoReembolso || "").toLowerCase() === "efectivo") item.refunds += montoDe(payload);
      else if (event.event_type === "AbonoClienteRegistrado" && metodoDe(payload) === "efectivo") item.cashPayments += montoDe(payload);
    });
    activeSales.forEach(event => {
      const turnId = identificadorTurno(event) || "sin-turno";
      const item = turn(turnId);
      item.sales += totalDe(P(event));
      item.cashSales += efectivoDe(P(event));
      item.saleCount += 1;
      item.names.add(nombreCajero(P(event), users));
      item.terminal = terminalVenta(event, devices).label || item.terminal;
    });
    const turns = [...turnMap.values()].map(item => {
      item.cashier = [...item.names].filter(Boolean).join(" / ") || item.cashier;
      item.reconciliationComplete = item.cashPaymentsSummary !== null;
      item.cashPaymentsUsed = item.cashPaymentsSummary ?? item.cashPayments;
      item.rebuiltExpected = item.opening + item.cashSales + item.cashPaymentsUsed + item.entries - item.exits - item.refunds;
      item.cloudDelta = item.reportedExpected === null || !item.reconciliationComplete
        ? null
        : item.rebuiltExpected - item.reportedExpected;
      item.legacyUnexplained = item.reportedExpected === null || item.reconciliationComplete
        ? null
        : item.reportedExpected - item.rebuiltExpected;
      return item;
    }).filter(item => (!currentCashier || item.names.has(currentCashier)) && (item.saleCount || item.opened || item.closed));
    const turnIssues = turns.filter(item => (item.cloudDelta !== null && item.cloudDelta !== 0) || numero(item.reportedDifference) !== 0);

    const targets = new Map();
    if (manualDifference) targets.set(Math.abs(manualDifference), `Diferencia manual ${manualDifference > 0 ? "+" : "-"}${money(Math.abs(manualDifference))}`);
    if (unexplainedDifference && Math.abs(unexplainedDifference) !== Math.abs(manualDifference)) {
      targets.set(Math.abs(unexplainedDifference), `Parte sin explicar ${unexplainedDifference > 0 ? "+" : "-"}${money(Math.abs(unexplainedDifference))}`);
    }
    turnIssues.forEach(item => {
      const value = Math.abs(numero(item.reportedDifference));
      if (value && !targets.has(value)) targets.set(value, `Turno ${String(item.id).slice(0, 8)} | ${money(value)}`);
      const cloudValue = Math.abs(numero(item.cloudDelta));
      if (item.reconciliationComplete && cloudValue && !targets.has(cloudValue))
        targets.set(cloudValue, `Recalculo nube ${String(item.id).slice(0, 8)} | ${money(cloudValue)}`);
    });
    const candidates = [...targets.entries()].flatMap(([target, label]) =>
      combinacionesParaDiferencia(target, activeSales, cancelledSales, saleIssues, label));
    const totalSales = activeSales.reduce((sum, event) => sum + totalDe(P(event)), 0);
    const paymentTotal = activeSales.reduce((sum, event) => {
      const payment = sumatoriaPagos(P(event));
      return sum + (payment.detailed ? payment.total : totalDe(P(event)));
    }, 0);
    const missingCount = folioGaps.reduce((sum, gap) => sum + gap.count, 0);
    const issueCount = saleIssues.length + duplicates.length + orphanCancellations.length + turnIssues.length;

    $("recResumen").innerHTML = [
      ["Ventas validas", String(activeSales.length), "accent-blue"], ["Total recalculado", money(totalSales), "accent-cyan"],
      ["Pagos sumados", money(paymentTotal), "accent-green"], ["Folios faltantes", String(missingCount), missingCount ? "accent-red" : "accent-green"],
      ["Incongruencias", String(issueCount), issueCount ? "accent-orange" : "accent-green"], ["Anuladas", String(cancelledSales.length), "accent-violet"]
    ].map(([label, value, cls]) => `<article class="kpi ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>rango y filtros actuales</small></article>`).join("");

    const findings = [
      ...(manualDifference ? [{
        tone: unexplainedDifference ? "critical" : "",
        title: unexplainedDifference
          ? `Quedan ${unexplainedDifference > 0 ? "+" : "-"}${money(Math.abs(unexplainedDifference))} sin explicar`
          : "La diferencia indicada quedo explicada",
        text: explainedDifference
          ? `Arqueo indicado: ${manualDifference > 0 ? "+" : "-"}${money(Math.abs(manualDifference))}. Parte reconocida: ${money(Math.abs(explainedDifference))}. La tabla de candidatas busca exactamente el residuo.`
          : "Indica cuanto de la diferencia ya reconoces para que el sistema busque solo el residuo.",
      }] : []),
      { tone: missingCount ? "critical" : "", title: missingCount ? `${missingCount} folio(s) faltante(s)` : "Secuencia de folios completa", text: missingCount ? "La tabla identifica cada numero ausente y las ventas anterior y posterior." : "No hay huecos operativos internos en las terminales consultadas." },
      { tone: saleIssues.length ? "critical" : "", title: `${saleIssues.length} problema(s) de importes`, text: saleIssues.length ? "Hay ventas cuyo pago, detalle, redondeo o cambio no coincide." : "Pagos, detalle y cambio cuadran con los totales disponibles." },
      { tone: turnIssues.length ? "warning" : "", title: `${turnIssues.length} turno(s) para revisar`, text: turnIssues.length ? "El arqueo o el efectivo reconstruido tiene diferencia; abre la tabla para ver el signo y el origen." : "Los cierres consultados no muestran diferencias." },
      { tone: duplicates.length || orphanCancellations.length ? "warning" : "", title: `${duplicates.length} duplicado(s), ${orphanCancellations.length} anulacion(es) huerfana(s)`, text: `${sequenceBreaks.length} salto(s) grande(s) se clasificaron como cambio de secuencia por migracion y no como ventas faltantes.` }
    ];
    $("recLectura").textContent = issueCount || missingCount
      ? `Se localizaron ${issueCount + missingCount} senales para revisar. Ninguna cifra se modifica desde esta calculadora.`
      : "La informacion sincronizada del rango cuadra. No se detectaron huecos ni diferencias.";
    $("recHallazgos").innerHTML = findings.map(item => `<article class="recon-finding ${item.tone}"><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></article>`).join("");

    const folioRows = [
      ...folioGaps.map(gap => ["<span class=\"tag bad\">Faltante</span>", esc(gap.terminal.label), `<span class="recon-code">${esc(gap.explicit)}</span>`, String(gap.count), `#${gap.previous} (${esc(fecha(fechaEventoIso(gap.previousEvent)))})`, `#${gap.next} (${esc(fecha(fechaEventoIso(gap.nextEvent)))})`]),
      ...sequenceBreaks.map(gap => ["<span class=\"tag\">Cambio de secuencia</span>", esc(gap.terminal.label), `<span class="recon-code">${esc(gap.explicit)}</span>`, String(gap.count), `#${gap.previous} (${esc(fecha(fechaEventoIso(gap.previousEvent)))})`, `#${gap.next} (${esc(fecha(fechaEventoIso(gap.nextEvent)))})`]),
      ...duplicates.map(item => ["<span class=\"tag warn\">Duplicado</span>", esc(item.terminal.label), `<span class="recon-code">#${item.folio}</span>`, String(item.events.length), esc(item.events.map(event => idVenta(event).slice(0, 12)).join(" / ")), "Mismo folio con ventas distintas"])
    ];
    $("recFolios").innerHTML = folioRows.length
      ? `<table><thead><tr><th>Estado</th><th>Terminal</th><th>Folio(s)</th><th>Cantidad</th><th>Venta anterior / IDs</th><th>Venta posterior / causa</th></tr></thead><tbody>${folioRows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : '<div class="empty-state">No hay folios faltantes ni duplicados dentro del rango.</div>';

    $("recVentas").innerHTML = saleIssues.length ? tabla(saleIssues, issue => {
      const payload = P(issue.event);
      const deltaClass = issue.delta > 0 ? "surplus" : "";
      return [fecha(fechaEventoIso(issue.event)), `<span class="recon-code">#${esc(payload.folio || "--")}</span>`, esc(nombreCajero(payload, users)), esc(issue.kind), money(issue.expected), money(issue.observed), `<span class="recon-delta ${deltaClass}">${issue.delta > 0 ? "+" : ""}${esc(money(issue.delta))}</span>`, esc(issue.detail)];
    }, ["Fecha", "Folio", "Cajero", "Prueba", "Esperado", "Observado", "Diferencia", "Explicacion"]) : '<div class="empty-state">Todas las ventas disponibles pasaron las pruebas de importe.</div>';

    $("recTurnos").innerHTML = turns.length ? tabla(turns, item => {
      const delta = item.cloudDelta;
      const actual = numero(item.reportedDifference);
      const cloudClass = delta === 0 ? "ok" : delta > 0 ? "surplus" : "";
      const actualClass = actual === 0 ? "ok" : actual > 0 ? "surplus" : "";
      const cloudText = delta === null
        ? item.legacyUnexplained === null ? "--" : `<span class="tag warn" title="Este cierre fue creado antes de sincronizar el desglose de abonos.">Historico: ${esc(money(item.legacyUnexplained))}</span>`
        : `<span class="recon-delta ${cloudClass}">${delta > 0 ? "+" : ""}${esc(money(delta))}</span>`;
      return [fecha(item.opened || item.closed), esc(item.cashier), esc(item.terminal), String(item.saleCount), money(item.cashSales), money(item.cashPaymentsUsed), money(item.entries), money(item.exits), item.reportedExpected === null ? "--" : money(item.reportedExpected), money(item.rebuiltExpected), cloudText, `<span class="recon-delta ${actualClass}">${actual > 0 ? "+" : ""}${esc(money(actual))}</span>`];
    }, ["Inicio", "Cajero", "Terminal", "Ventas", "Efectivo ventas", "Abonos", "Entradas", "Salidas", "Esperado cierre", "Reconstruido", "Delta nube", "Arqueo real"]) : '<div class="empty-state">No hay turnos para conciliar en el rango.</div>';

    $("recCandidatas").innerHTML = candidates.length ? tabla(candidates, item => {
      const folios = item.sales.map(sale => `#${folioVenta(sale) || "--"}`).join(" + ");
      const times = item.sales.map(sale => fecha(fechaEventoIso(sale))).join(" | ");
      return [esc(item.label), `<span class="recon-confidence">${esc(item.confidence)}</span>`, esc(item.type), `<span class="recon-code">${esc(folios)}</span>`, money(item.value), esc(times), esc(item.reason)];
    }, ["Diferencia", "Nivel", "Coincidencia", "Venta(s)", "Importe", "Fecha", "Por que aparece"]) : '<div class="empty-state">Escribe una diferencia conocida o consulta un rango con cierres descuadrados para buscar ventas candidatas.</div>';

    lastReconciliation = {
      desde: $("recDesde").value, hasta: $("recHasta").value, terminal: currentDevice || "Todas", cajero: currentCashier || "Todos",
      totalSales, paymentTotal, activeSales: activeSales.length, cancelled: cancelledSales.length,
      missingCount, issueCount, folioGaps, sequenceBreaks, duplicates, saleIssues, turns, candidates,
      manualDifference, explainedDifference, unexplainedDifference,
    };
    $("recProgreso").classList.add("oculto");
    estadoRecalculo(issueCount || missingCount ? "Requiere revision" : "Cuadra", issueCount || missingCount ? "bad" : "ok");
  }

  async function cargarRecalculador() {
    if (!$("recDesde").value) {
      $("recDesde").value = inputDate(new Date(Date.now() - 6 * 86400000));
      $("recHasta").value = inputDate(new Date());
    }
    try {
      await ejecutarRecalculo();
    } catch (error) {
      $("recProgreso").classList.add("oculto");
      estadoRecalculo("Error", "bad");
      $("recLectura").textContent = error?.message || String(error);
      throw error;
    }
  }

  function resumenEvento(event) {
    const payload = P(event);
    const type = event.event_type || "Evento";
    const definitions = {
      VentaCobrada: ["Venta", `Venta ${money(totalDe(payload))}`, `${payload.metodo || payload.metodoPago || "Metodo no indicado"}${payload.clienteNombre ? ` | ${payload.clienteNombre}` : ""}`],
      VentaCancelada: ["Anulacion", "Venta anulada", payload.motivo || `Venta ${event.entity_id || ""}`],
      DevolucionRegistrada: ["Devolucion", `Devolucion ${money(montoDe(payload))}`, payload.motivo || "Mercancia devuelta"],
      CajaAbierta: ["Caja", `Caja abierta con ${money(numero(payload.montoAperturaCentavos, payload.monto_apertura_centavos))}`, payload.usuarioNombre || ""],
      CajaCerrada: ["Caja", `Caja cerrada | contado ${money(payload.efectivoContadoCentavos)}`, `Diferencia ${money(payload.diferenciaCentavos)}`],
      CierreConDiferencia: ["Alerta", `Diferencia de caja ${money(payload.diferenciaCentavos)}`, payload.explicacion || payload.motivo || "Requiere revision"],
      EntradaEfectivo: ["Entrada", `Entrada ${money(payload.montoCentavos)}`, payload.motivo || ""],
      SalidaEfectivo: ["Salida", `Salida ${money(payload.montoCentavos)}`, payload.motivo || ""],
      GastoRegistrado: ["Gasto", `Gasto ${money(payload.montoCentavos)}`, payload.categoria || payload.descripcion || ""],
      GastoEditado: ["Gasto", `Gasto actualizado ${money(payload.montoCentavos)}`, payload.descripcion || ""],
      GastoEliminado: ["Gasto", "Gasto anulado", payload.motivo || event.entity_id || ""],
      CostoRecurrenteGuardado: ["Costos", "Plan recurrente guardado", payload.nombre || ""],
      CostoObligacionGenerada: ["Vencimiento", `Compromiso ${money(payload.montoCentavos)}`, payload.concepto || ""],
      CostoObligacionGuardada: ["CxP", `Factura o deuda ${money(payload.montoCentavos)}`, payload.concepto || ""],
      CostoPagoRegistrado: ["CxP", `Pago ${money(payload.montoCentavos)}`, payload.concepto || ""],
      CostoObligacionAnulada: ["CxP", "Factura o deuda anulada", payload.concepto || event.entity_id || ""],
      InventarioBajo: ["Inventario", "Inventario bajo", payload.nombre || event.entity_id || ""],
      ErrorSincronizacion: ["Sync", "Error de sincronizacion", payload.message || payload.error || ""],
      CajonDineroAbierto: ["Caja", "Cajon abierto", payload.motivo || "Apertura auditada"],
      ErrorCajonDinero: ["Alerta", "No se pudo abrir el cajon", payload.error || payload.motivo || "Revisa la impresora y el cable"],
      ErrorImpresionCorte: ["Alerta", "No se imprimio el corte", payload.motivo || "Revisa la impresora configurada"],
      BackupSnapshotCreado: ["Respaldo", "Snapshot creado", payload.storagePath || payload.storage_path || ""],
      BackupSnapshotFallido: ["Respaldo", "Fallo de respaldo", payload.message || payload.error || ""],
      CompraCreditoProveedorRegistrada: ["CxP", `Compra a credito ${money(montoDe(payload))}`, payload.proveedorNombre || ""],
      PagoProveedorRegistrado: ["CxP", `Pago a proveedor ${money(montoDe(payload))}`, payload.proveedorNombre || ""],
      ProductoCreado: ["Catalogo", "Producto creado", payload.nombre || event.entity_id || ""],
      ProductoEditado: ["Catalogo", "Producto actualizado", payload.nombre || event.entity_id || ""],
      ProductoDesactivado: ["Catalogo", "Producto desactivado", payload.nombre || event.entity_id || ""],
      InventarioAjustado: ["Inventario", "Existencia ajustada", `${payload.nombre || event.entity_id || ""} | ${payload.cantidadNueva ?? ""}`],
      ClienteCreado: ["Clientes", "Cliente creado", payload.nombre || event.entity_id || ""],
      ClienteEditado: ["Clientes", "Cliente actualizado", payload.nombre || event.entity_id || ""],
      ClienteDesactivado: ["Clientes", "Cliente desactivado", payload.nombre || event.entity_id || ""],
      CategoriaCreada: ["Catalogo", "Categoria guardada", payload.nombre || event.entity_id || ""],
      CategoriaGastoCreada: ["Gastos", "Categoria de gasto guardada", payload.nombre || event.entity_id || ""],
      ConfiguracionActualizada: ["Ajustes", "Configuracion actualizada", payload.seccion || event.entity_id || ""]
    };
    const value = definitions[type] || ["Evento", type.replace(/([a-z])([A-Z])/g, "$1 $2"), payload.nombre || payload.nota || event.entity_id || ""];
    return { category: value[0], title: value[1], detail: value[2] };
  }

  function renderFeed(items) {
    $("feed").innerHTML = items.length ? items.map(event => {
      const summary = resumenEvento(event);
      return `<article class="event-item"><span class="event-type">${esc(summary.category)}</span>
        <div class="event-copy"><strong>${esc(summary.title)}</strong><small>${esc(summary.detail)}</small></div>
        <time class="event-time">${esc(fecha(fechaEventoIso(event)))}</time></article>`;
    }).join("") : '<div class="empty-state">Todavia no hay actividad sincronizada.</div>';
  }

  function renderHourChart(sales) {
    const hours = Array.from({ length: 15 }, (_, index) => index + 8);
    const values = Object.fromEntries(hours.map(hour => [hour, 0]));
    sales.forEach(event => {
      const hour = new Date(fechaEventoIso(event)).getHours();
      if (values[hour] !== undefined) values[hour] += totalDe(P(event));
    });
    const maximum = Math.max(1, ...Object.values(values));
    $("chartHoras").innerHTML = hours.map(hour => {
      const value = values[hour];
      const height = value ? Math.max(5, Math.round(value * 145 / maximum)) : 3;
      return `<div class="hour-column" title="${hour}:00 | ${money(value)}"><div class="hour-bar" style="height:${height}px"></div><span>${hour}</span></div>`;
    }).join("");
    $("chartTotal").textContent = money(sales.reduce((sum, event) => sum + totalDe(P(event)), 0));
  }

  function dashboardBuckets(sales, valueOf) {
    const buckets = Array.from({ length: 7 }, () => []);
    const ordered = [...sales].sort((a, b) => fechaEventoIso(a).localeCompare(fechaEventoIso(b)));
    ordered.forEach((event, index) => {
      const bucket = Math.min(6, Math.floor(index * 7 / Math.max(1, ordered.length)));
      buckets[bucket].push(valueOf(event));
    });
    return buckets.map(items => items.reduce((sum, value) => sum + value, 0));
  }

  function seriesDiaria(events, valueOf) {
    const buckets = {};
    events.forEach(event => {
      const day = inputDate(new Date(fechaEventoIso(event)));
      buckets[day] = (buckets[day] || 0) + numero(valueOf(event));
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
      .slice(-42);
  }

  function renderKpiSparkline(id, points, color) {
    const host = $(id);
    if (!host) return;
    const values = points.length > 1 ? points : [0, 0];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const coordinates = values.map((value, index) => {
      const x = index * 150 / Math.max(1, values.length - 1);
      const y = 53 - ((value - min) * 43 / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const area = `0,60 ${coordinates} 150,60`;
    host.innerHTML = `<svg viewBox="0 0 150 60" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${esc(id)}Fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".38"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#${esc(id)}Fill)"/><polyline points="${coordinates}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function metric(label, value) {
    return `<div class="metric-chip"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function ondaDeterministica(value, seedText = "", length = 34) {
    const base = Math.max(0, Math.min(100, Math.round(numero(value))));
    let seed = 0;
    String(seedText).split("").forEach((char, index) => { seed += char.charCodeAt(0) * (index + 3); });
    return Array.from({ length }, (_, index) => {
      const pulse = Math.sin((index + seed % 9) * 1.45) * 16;
      const cut = Math.cos((index * 2.3) + seed) * 9;
      const spike = ((index + seed) % 7 === 0 ? 18 : 0) + ((index + seed) % 11 === 0 ? -15 : 0);
      return Math.max(1, Math.round(base + pulse + cut + spike));
    });
  }

  function waveSvg(points, label) {
    const values = (points || []).map(numero).filter(value => Number.isFinite(value));
    const series = values.length > 1 ? values.slice(-42) : ondaDeterministica(values[0] || 55, label, 36);
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = Math.max(1, max - min);
    const width = 230;
    const height = 86;
    const top = 8;
    const bottom = 78;
    const coordinates = series.map((value, index) => {
      const x = index * width / Math.max(1, series.length - 1);
      const y = bottom - ((value - min) * (bottom - top) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const inner = series.map((value, index) => {
      const x = index * width / Math.max(1, series.length - 1);
      const normalized = (value - min) / range;
      const y = bottom - (normalized * (bottom - top) * .46) - ((index % 3) * 2.2);
      return `${x.toFixed(1)},${Math.max(top + 8, Math.min(bottom - 2, y)).toFixed(1)}`;
    });
    const gradientHash = String(label).split("").reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
    const gradientId = `waveArea${gradientHash}`;
    return `<svg class="wave-metric-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--ui-text)" stop-opacity=".42"></stop><stop offset="58%" stop-color="var(--ui-text)" stop-opacity=".20"></stop><stop offset="100%" stop-color="var(--ui-text)" stop-opacity=".035"></stop></linearGradient></defs>
      <path class="wave-grid" d="M0 16H230M0 38H230M0 60H230"></path>
      <polygon class="wave-fill" style="--wave-fill:url(#${gradientId})" points="0,${height} ${coordinates.join(" ")} ${width},${height}"></polygon>
      <polyline class="wave-inner" points="${inner.join(" ")}"></polyline>
      <polyline class="wave-line" points="${coordinates.join(" ")}"></polyline>
    </svg>`;
  }

  function waveMetric(label, value, detail, points = []) {
    return `<div class="wave-metric">
      <div class="wave-metric-copy"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>
      ${waveSvg(points, `${label}-${value}`)}
    </div>`;
  }

  function reportWaveChart(days) {
    const width = 1000;
    const height = 285;
    const left = 22;
    const right = 978;
    const top = 22;
    const bottom = 244;
    const netValues = days.map(([, value]) => Math.max(0, numero(value.total) - numero(value.refunds)));
    const taxValues = days.map(([, value]) => Math.max(0, numero(value.tax)));
    const maxValue = Math.max(1, ...netValues, ...taxValues);
    const point = (value, index) => ({
      x: left + index * (right - left) / Math.max(1, days.length - 1),
      y: bottom - (value / maxValue) * (bottom - top),
    });
    const netPoints = netValues.map(point);
    const taxPoints = taxValues.map(point);
    const serialize = points => points.map(item => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ");
    const labelEvery = Math.max(1, Math.ceil(days.length / 7));
    const nodes = days.map(([day, value], index) => {
      const current = netValues[index];
      const item = netPoints[index];
      const showLabel = index === 0 || index === days.length - 1 || index % labelEvery === 0;
      return `<a class="report-wave-point" href="#ventas" data-report-day="${esc(day)}" aria-label="Abrir ventas del ${esc(fechaCorta(`${day}T12:00:00`))}, ${esc(money(current))}">
        <title>${esc(fechaCorta(`${day}T12:00:00`))}: ${esc(money(current))} · ${value.sales} venta(s)</title>
        <circle cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="3.5"></circle>
        ${showLabel ? `<text class="report-wave-label" x="${item.x.toFixed(1)}" y="268">${esc(fechaCorta(`${day}T12:00:00`))}</text>` : ""}
      </a>`;
    }).join("");
    return `<div class="report-wave-chart">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Tendencia diaria de ventas e ITBIS">
        <defs><linearGradient id="reportNetArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--ui-text)" stop-opacity=".36"></stop><stop offset="62%" stop-color="var(--ui-text)" stop-opacity=".16"></stop><stop offset="100%" stop-color="var(--ui-text)" stop-opacity=".025"></stop></linearGradient></defs>
        <path class="report-wave-grid" d="M${left} 55H${right}M${left} 110H${right}M${left} 165H${right}M${left} 220H${right}"></path>
        <polygon class="report-wave-fill" style="--report-wave-fill:url(#reportNetArea)" points="${left},${bottom} ${serialize(netPoints)} ${right},${bottom}"></polygon>
        <polyline class="report-wave-tax" points="${serialize(taxPoints)}"></polyline>
        <polyline class="report-wave-line" points="${serialize(netPoints)}"></polyline>
        ${nodes}
      </svg>
    </div>`;
  }

  async function getDevices() {
    const { data, error } = await sb.from("devices")
      .select("id,device_name,cash_register_id,status,last_seen_at,installed_version")
      .eq("business_id", BUSINESS).order("last_seen_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getBackups(limit = 60) {
    const { data, error } = await sb.from("backup_snapshots")
      .select("id,device_id,storage_path,backup_type,size,status,created_at,verified_at")
      .eq("business_id", BUSINESS).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function cargarDashboard() {
    try {
      let from = inicioDia();
      let to = finDia();
      let [{ active, excluded }, returns, activity, devices, backups] = await Promise.all([
        ventasActivas(from, to, 5000).catch(() => ({ active: [], excluded: 0 })),
        eventos(["DevolucionRegistrada"], from, to, 1000).catch(() => []),
        eventos(null, null, null, 45).catch(() => []),
        getDevices().catch(() => []),
        getBackups(5).catch(() => [])
      ]);

      let dayLabel = "hoy";
      if (!active.length) {
        const recentSalesEvents = await eventos(["VentaCobrada"], null, null, 200).catch(() => []);
        if (recentSalesEvents.length) {
          const latestDateIso = fechaEventoIso(recentSalesEvents[0]);
          if (latestDateIso) {
            const latestDay = latestDateIso.slice(0, 10);
            const latestActive = await ventasActivas(inicioDia(latestDay), finDia(latestDay), 5000).catch(() => null);
            if (latestActive?.active?.length) {
              active = latestActive.active;
              excluded = latestActive.excluded;
              dayLabel = `ultimo dia activo (${fechaCorta(latestDay + "T12:00:00")})`;
            }
          }
        }
      }

      const gross = active.reduce((sum, event) => sum + totalDe(P(event)), 0);
      const refunds = returns.reduce((sum, event) => sum + montoDe(P(event)), 0);
      const net = gross - refunds;
      const cash = active.reduce((sum, event) => sum + efectivoDe(P(event)), 0);
      const tax = active.reduce((sum, event) => sum + itbisDe(P(event)), 0);
      const cashEvents = activity.filter(event => ["CajaAbierta", "CajaCerrada"].includes(event.event_type));
      const cashState = cashEvents[0]?.event_type === "CajaAbierta" ? "Abierta" : "Cerrada";

      $("kVenta").textContent = money(net);
      $("kVentaDetalle").textContent = refunds ? `${money(refunds)} devuelto` : `${dayLabel}`;
      $("kNum").textContent = active.length;
      $("kNumDetalle").textContent = excluded ? `${excluded} anulada(s) fuera` : `${active.length} transacciones`;
      $("kProm").textContent = money(active.length ? Math.round(gross / active.length) : 0);
      $("kEfec").textContent = money(cash);
      $("kItbis").textContent = money(tax);
      $("kCaja").textContent = cashState;
      $("kCajaDetalle").textContent = cashEvents[0] ? fecha(fechaEventoIso(cashEvents[0])) : "sin eventos";
      const totalSeries = dashboardBuckets(active, event => totalDe(P(event)));
      const countSeries = dashboardBuckets(active, () => 1);
      const cashSeries = dashboardBuckets(active, event => efectivoDe(P(event)));
      const taxSeries = dashboardBuckets(active, event => itbisDe(P(event)));
      const averageSeries = totalSeries.map((value, index) => countSeries[index] ? Math.round(value / countSeries[index]) : 0);
      renderKpiSparkline("kSparkVenta", totalSeries, "#71717a");
      renderKpiSparkline("kSparkNum", countSeries, "#18181b");
      renderKpiSparkline("kSparkProm", averageSeries, "#ff7f03");
      renderKpiSparkline("kSparkEfec", cashSeries, "#15867b");
      renderKpiSparkline("kSparkItbis", taxSeries, "#7455a5");
      renderKpiSparkline("kSparkCaja", cashEvents.length ? [0, 1, 1, 2, 2, 3, 4] : [0, 0], cashState === "Abierta" ? "#15867b" : "#c93c3c");
      renderHourChart(active);
      renderFeed(activity);

      const latestEvent = activity[0];
      const latestBackup = backups[0];
      const activeDevices = devices.filter(device => device.status === "activa").length;
      const unread = (await obtenerAlertas().catch(() => [])).filter(alert => !alert.read).length;
      $("healthList").innerHTML = [
        ["Sincronizacion", latestEvent ? `Ultimo evento ${fecha(fechaEventoIso(latestEvent))}` : "Sin eventos disponibles", latestEvent ? "activa" : "sin datos", ""],
        ["Respaldo", latestBackup ? `${fecha(latestBackup.created_at)} | ${latestBackup.status}` : "Sin respaldo informado", latestBackup?.status || "sin datos", ""],
        ["Dispositivos", `${activeDevices || 1} activo(s)`, "en linea", ""],
        ["Alertas", `${unread} sin leer`, unread ? "atencion" : "al dia", unread ? "warn" : ""]
      ].map(([title, detail, value, tone]) => `<div class="health-row"><span class="health-dot ${tone}"></span><div><b>${esc(title)}</b><small>${esc(detail)}</small></div><span class="health-value">${esc(value)}</span></div>`).join("");
      renderAlertPreview();
      $("pillVivo").textContent = "en vivo";
    } catch (dashErr) {
      console.warn("cargarDashboard auto-recovery:", dashErr);
      $("kVenta").textContent = "$0.00";
      $("kNum").textContent = "0";
      $("kProm").textContent = "$0.00";
      $("kEfec").textContent = "$0.00";
      $("kItbis").textContent = "$0.00";
      $("kCaja").textContent = "Cerrada";
      $("pillVivo").textContent = "en vivo";
    }
  }

  const salePendingStore = window.DcarelaSalePending || null;
  const saleUuid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const saleStageNames = new Set(["catalog", "cart", "checkout"]);
  const salePendingList = () => {
    if (!salePendingStore) return [];
    try { return salePendingStore.list(localStorage, BUSINESS); }
    catch { return []; }
  };
  const salePendingCount = () => salePendingList().length;

  const defaultSaleAccess = () => ({
    role: "viewer",
    canUse: false,
    canOpenShift: false,
    canCreateSale: false,
    canCloseShift: false,
    canCancelSale: false,
    canOverridePrice: false,
    canForceInventory: false,
    canOpenCommonSale: false,
    canParkSale: false,
    canVerifyPrice: false,
    loaded: false,
  });

  function setSaleAccess(access = null) {
    saleAccess = { ...defaultSaleAccess(), ...(access && typeof access === "object" ? access : {}) };
    saleAccess.canUse = Boolean(saleAccess.canUse || saleAccess.canOpenShift || saleAccess.canCreateSale || saleAccess.canVerifyPrice);
    syncSalePermissionUi();
    return saleAccess;
  }

  function setSaleButtonState(id, allowed, blockedMessage, hide = false) {
    const button = $(id);
    if (!button) return;
    button.disabled = !allowed;
    if (hide) button.classList.toggle("oculto", !allowed);
    if (!allowed && blockedMessage) button.title = blockedMessage;
    else button.removeAttribute("title");
  }

  function syncSalePermissionUi() {
    const pendingCount = salePendingCount();
    document.querySelectorAll(".sale-web-access").forEach(element => element.classList.toggle("oculto", !saleAccess.canUse));
    setSaleButtonState("btnReanudarVenta", saleAccess.canUse && pendingCount > 0, saleAccess.canUse ? "No hay cuentas en espera guardadas." : "Tu cuenta no tiene permiso para usar la caja web.");
    setSaleButtonState("btnNuevaVentaWeb", saleAccess.canUse, "Tu cuenta no tiene permiso para usar la Caja virtual.");
    setSaleButtonState("btnVirtualNewSale", saleAccess.canUse, "Tu cuenta no tiene permiso para usar la Caja virtual.");
    setSaleButtonState("btnSaleOpenShift", saleAccess.canOpenShift, "Tu cuenta no puede abrir la caja web.");
    setSaleButtonState("btnSaleVerifyPrice", saleAccess.canVerifyPrice, "Tu cuenta no puede verificar precios en la caja web.");
    setSaleButtonState("btnSaleFocusSearch", saleAccess.canUse, "Tu cuenta no puede usar la caja web.");
    setSaleButtonState("btnSaleChange", saleAccess.canCreateSale, "Tu cuenta no puede modificar la venta.");
    setSaleButtonState("btnSaleCashIn", saleAccess.canUse, "Tu cuenta no puede registrar entradas.");
    setSaleButtonState("btnSaleCashOut", saleAccess.canUse, "Tu cuenta no puede registrar salidas.");
    setSaleButtonState("btnSaleWholesale", saleAccess.canCreateSale, "Tu cuenta no puede cambiar el precio de mayoreo.");
    setSaleButtonState("btnSaleCommon", saleAccess.canOpenCommonSale, "Tu cuenta no puede registrar ventas comunes.");
    setSaleButtonState("btnSalePark", saleAccess.canParkSale, "Tu cuenta no puede guardar ventas pendientes.");
    setSaleButtonState("btnSaleClear", saleAccess.canCreateSale, "Tu cuenta no puede modificar la cuenta actual.");
    setSaleButtonState("btnSaleCartClear", saleAccess.canCreateSale, "Tu cuenta no puede modificar la cuenta actual.");
    setSaleButtonState("btnSaleAddPayment", saleAccess.canCreateSale, "Tu cuenta no puede agregar pagos.");
    setSaleButtonState("btnSaleQuote", saleAccess.canCreateSale, "Tu cuenta no puede preparar cotizaciones desde la caja web.");
    setSaleButtonState("btnSaleSubmit", saleAccess.canCreateSale, "Tu cuenta no puede registrar ventas en la caja web.");
    setSaleButtonState("btnSaleSubmitPrint", saleAccess.canCreateSale, "Tu cuenta no puede registrar ventas en la caja web.");
    setSaleButtonState("btnSaleMobileCheckout", saleAccess.canCreateSale, "Tu cuenta no puede registrar ventas en la caja web.");
    setSaleButtonState("btnSaleCloseShift", saleAccess.canCloseShift, "Tu cuenta no puede cerrar la caja web.", true);
    $("salePriceReasonField")?.classList.toggle("oculto", !saleAccess.canOverridePrice || !saleHasCustomPrices());
  }

  async function cargarPermisosCajaWeb(force = false) {
    if (!force && saleAccess.loaded) return saleAccess;
    if (!session?.user || (authProvider !== "firebase" && !sb)) return saleAccess;
    const status = await saleApi("status");
    setSaleAccess({ role: status.role || memberRole, ...(status.permissions || {}), loaded: true });
    saleShift = status.shift || null;
    renderSaleShift();
    return saleAccess;
  }

  async function saleApi(action, data = {}, requestId = null) {
    if (authProvider === "firebase") {
      if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
      return window.DcarelaFirebase.webSaleAction(action, BUSINESS, memberRole, data, requestId);
    }
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-web-sale`, {
      method: "POST",
      headers: await authenticatedHeaders(true),
      body: JSON.stringify({ business_id: BUSINESS, action, request_id: requestId, data })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      const error = new Error(result.error || `La Caja virtual no respondio (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function setSaleStage(stage, focus = false) {
    saleStage = saleStageNames.has(stage) ? stage : "catalog";
    $("saleStageTabs")?.querySelectorAll("[data-sale-stage]").forEach(button => {
      const active = button.dataset.saleStage === saleStage;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $("saleWorkbench")?.querySelectorAll("[data-sale-pane]").forEach(pane => {
      pane.dataset.saleActive = String(pane.dataset.salePane === saleStage);
    });
    if (!focus) return;
    const target = saleStage === "catalog" ? $("saleSearch")
      : saleStage === "cart" ? $("saleCart")
        : $("salePaymentAmount");
    setTimeout(() => target?.focus(), 0);
  }

  function updateSalePendingButton() {
    const accounts = salePendingList();
    const count = accounts.length;
    const title = count
      ? `Cuentas en espera: ${accounts.map(item => item.name).join(", ")}`
      : "No hay cuentas en espera guardadas";
    const label = count ? `Cuentas en espera (${count})` : "Cuentas en espera";
    const button = $("btnReanudarVenta");
    if (!button) return;
    button.classList.toggle("has-pending", count > 0);
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.title = title;
  }

  function syncSaleMobileSummary() {
    const summary = $("saleMobileSummary");
    if (!summary) return;
    const visible = Boolean(saleShift?.id)
      && !$("saleWorkbench")?.classList.contains("oculto")
      && $("saleReceipt")?.classList.contains("oculto");
    summary.classList.toggle("oculto", !visible);
  }

  function saleExactTotals() {
    let base = 0, tax = 0, discount = 0, exact = 0;
    saleCart.forEach(line => {
      const quantity = Math.round(numero(line.cantidad) * 1000);
      const gross = Math.round(numero(line.precioUnitarioCentavos) * quantity / 1000);
      const lineDiscount = Math.round(gross * numero(line.descuentoPct) / 100);
      const final = Math.max(0, gross - lineDiscount);
      const rate = numero(line.tasaItbis, .18);
      const lineBase = rate > 0 ? Math.round(final / (1 + rate)) : final;
      base += lineBase;
      tax += final - lineBase;
      discount += lineDiscount;
      exact += final;
    });
    let total = exact;
    if ($("saleRounding")?.value === "abajo_5" && exact >= 500) total = Math.floor(exact / 500) * 500;
    return { base, tax, discount, exact, total, adjustment: total - exact };
  }

  function saleRemaining() {
    return Math.max(0, saleExactTotals().total - salePayments.reduce((sum, payment) => sum + payment.montoCentavos, 0));
  }

  function syncSalePaymentDraft(force = false) {
    const input = $("salePaymentAmount");
    if (!input) return;
    if (force || document.activeElement !== input) input.value = pesoInput(saleRemaining());
    updateSaleCashChange();
  }

  function updateSaleCashChange() {
    if (!$("saleCashReceivedField")) return;
    const noAddedPayments = salePayments.length === 0;
    const simpleCash = (noAddedPayments && $("salePaymentMethod").value === "efectivo")
      || (salePayments.length === 1 && salePayments[0].metodo === "efectivo" && saleRemaining() === 0);
    $("saleCashReceivedField").classList.toggle("oculto", !simpleCash);
    if (!simpleCash) return;
    const due = saleExactTotals().total + centavosInput($("saleTip").value || "0");
    if (document.activeElement !== $("saleCashReceived") && centavosInput($("saleCashReceived").value || "0") < due) {
      $("saleCashReceived").value = pesoInput(due);
    }
    const received = centavosInput($("saleCashReceived").value || "0");
    const change = received - due;
    $("saleChange").textContent = change >= 0 ? `Devuelta: ${money(change)}` : `Faltan: ${money(-change)}`;
    $("saleChange").classList.toggle("error", change < 0);
  }

  function saleHasCustomPrices() {
    return saleCart.some(line => numero(line.precioUnitarioCentavos) !== numero(line.mayoreo && line.precioMayoreoCentavos > 0
      ? line.precioMayoreoCentavos : line.precioNormalCentavos));
  }

  function saleHasDraft() {
    const tipText = String($("saleTip")?.value || "").trim();
    let tip = 0;
    try { tip = centavosInput(tipText || "0"); } catch {}
    return saleCart.length > 0
      || salePayments.length > 0
      || Boolean($("saleClient")?.value)
      || tip !== 0
      || Boolean(String($("saleNote")?.value || "").trim())
      || Boolean(String($("salePriceReason")?.value || "").trim());
  }

  function renderSaleCart() {
    const totals = saleExactTotals();
    const countText = `${saleCart.length} ${saleCart.length === 1 ? "producto" : "productos"}`;
    $("saleCartCount").textContent = countText;
    if ($("saleSideCount")) $("saleSideCount").textContent = `${saleCart.length} ${saleCart.length === 1 ? "articulo" : "articulos"}`;
    $("saleStageCartCount").textContent = String(saleCart.length);
    $("saleStageCheckoutCount").textContent = saleCart.length ? money(totals.total) : "0";
    $("saleMobileCount").textContent = countText;
    $("saleMobileTotal").textContent = money(totals.total);
    $("saleBase").textContent = money(totals.base);
    $("saleTax").textContent = money(totals.tax);
    $("saleDiscount").textContent = money(totals.discount);
    $("saleTotal").textContent = money(totals.total);
    $("salePriceReasonField").classList.toggle("oculto", !saleAccess.canOverridePrice || !saleHasCustomPrices());
    if (!saleCart.length) {
      $("saleCart").innerHTML = '<div class="sale-cart-empty"><strong>Cuenta vacia</strong><span>Busca, escanea o agrega una venta comun.</span></div>';
    } else {
      $("saleCart").innerHTML = saleCart.map((line, index) => {
        const quantity = numero(line.cantidad);
        const gross = Math.round(numero(line.precioUnitarioCentavos) * quantity);
        const final = Math.round(gross * (1 - numero(line.descuentoPct) / 100));
        return `<article class="sale-line${index === saleSelectedLineIndex ? " selected" : ""}" data-sale-line="${index}" tabindex="0">
          <div class="sale-line-name"><strong>${esc(line.nombre)}</strong><small>${line.comun ? "Venta comun" : esc(line.codigoBarras || line.unidadMedida || "Producto")}</small></div>
          <label><span>Cantidad</span><input data-sale-field="cantidad" inputmode="decimal" value="${esc(line.cantidad)}"${saleAccess.canCreateSale ? "" : " disabled"}></label>
          <label><span>Precio</span><input data-sale-field="precio" inputmode="decimal" value="${esc(pesoInput(line.precioUnitarioCentavos))}"${saleAccess.canOverridePrice ? "" : " disabled"}></label>
          <label><span>Desc. %</span><input data-sale-field="descuento" inputmode="decimal" value="${esc(line.descuentoPct || 0)}"${saleAccess.canOverridePrice ? "" : " disabled"}></label>
          <span class="sale-line-tax">${numero(line.tasaItbis) > 0 ? `${Math.round(numero(line.tasaItbis) * 100)}%` : "Exento"}</span>
          <strong class="sale-line-total">${money(final)}</strong>
          <span class="sale-line-stock">${line.usaInventario ? esc(line.stock ?? "--") : "--"}</span>
          <button class="sale-line-remove" data-sale-remove="${index}" type="button" aria-label="Quitar"${saleAccess.canCreateSale ? "" : " disabled"}>&#215;</button>
          <div class="sale-line-options">${line.precioMayoreoCentavos > 0 ? `<label><input data-sale-wholesale="${index}" type="checkbox"${line.mayoreo ? " checked" : ""}${saleAccess.canCreateSale ? "" : " disabled"}> Precio mayoreo (${money(line.precioMayoreoCentavos)})</label>` : `<span>${line.usaInventario ? "Controla existencia" : "No controla existencia"}</span>`}</div>
        </article>`;
      }).join("");
    }
    renderSalePayments();
    syncSalePaymentDraft();
    syncSaleMobileSummary();
    syncSalePermissionUi();
  }

  function renderSalePayments() {
    $("salePayments").innerHTML = salePayments.length ? salePayments.map((payment, index) => `<div class="sale-payment-row"><span>${esc(payment.metodo)}${payment.cuentaFinancieraNombre ? ` | ${esc(payment.cuentaFinancieraNombre)}` : ""}${payment.referencia ? ` | ${esc(payment.referencia)}` : ""}</span><strong>${money(payment.montoCentavos)}</strong><button class="sale-payment-remove" type="button" data-sale-payment-remove="${index}" aria-label="Quitar pago"${saleAccess.canCreateSale ? "" : " disabled"}>&#215;</button></div>`).join("") : '<div class="muted">Un solo pago puede cobrarse directamente. Para pago mixto agrega cada parte.</div>';
    $("salePayments").querySelectorAll("[data-sale-payment-remove]").forEach(button => button.addEventListener("click", () => {
      salePayments.splice(Number(button.dataset.salePaymentRemove), 1);
      renderSalePayments();
      syncSalePaymentDraft(true);
    }));
    updateSaleCashChange();
  }

  function saleProductsMatching(query = "", limit = 80) {
    const term = query.trim().toLowerCase();
    return (productCatalog || [])
      .filter(product => product.activo !== false && numero(product.precioFinalCentavos) > 0)
      .filter(product => !term || [product.nombre, product.codigoBarras, product.sku, product.categoriaNombre]
        .some(value => String(value || "").toLowerCase().includes(term)))
      .slice(0, limit);
  }

  function renderSaleProducts(query = "") {
    const products = saleProductsMatching(query, query.trim() ? 80 : 36);
    $("saleProductResults").innerHTML = products.length ? products.map(product => `<button type="button" class="sale-product-card" data-sale-product="${esc(product.id)}">
      <span class="sale-product-copy"><strong>${esc(product.nombre)}</strong><small>${esc(product.codigoBarras || product.sku || product.tipo || "Producto")}${product.usaInventario === false ? " | sin inventario" : product.stock !== undefined ? ` | stock ${esc(product.stock)}` : ""}</small></span>
      <span class="sale-product-price">${money(product.precioFinalCentavos)}</span>
    </button>`).join("") : '<div class="empty-state">No hay productos que coincidan.</div>';
    $("saleProductResults").querySelectorAll("[data-sale-product]").forEach(button => button.addEventListener("click", () => addSaleProduct(button.dataset.saleProduct)));
  }

  function addSaleProduct(productId) {
    const product = (productCatalog || []).find(item => item.id === productId);
    if (!product) return;
    const current = saleCart.find(line => line.productoId === productId && !line.mayoreo && numero(line.precioUnitarioCentavos) === numero(product.precioFinalCentavos));
    if (current) current.cantidad = String(numero(current.cantidad) + 1);
    else saleCart.push({
      localId: saleUuid(), productoId: product.id, nombre: product.nombre,
      codigoBarras: product.codigoBarras || "", unidadMedida: product.unidadMedida || "unidad",
      cantidad: "1", precioUnitarioCentavos: numero(product.precioFinalCentavos),
      precioNormalCentavos: numero(product.precioFinalCentavos), precioMayoreoCentavos: numero(product.precioMayoreoCentavos),
      descuentoPct: 0, mayoreo: false, tasaItbis: numero(product.tasaItbis, .18),
      usaInventario: product.usaInventario !== false, stock: product.stock, comun: false
    });
    saleSelectedLineIndex = saleCart.findIndex(line => line.productoId === productId);
    if (saleSelectedLineIndex < 0) saleSelectedLineIndex = saleCart.length - 1;
    renderSaleCart();
    selectSaleLine(saleSelectedLineIndex);
    $("saleSearch").value = "";
    renderSaleProducts();
    $("saleSearch").focus();
  }

  function renderSalePriceVerifier(query = "") {
    const results = saleProductsMatching(query, query.trim() ? 40 : 20);
    $("salePriceResults").innerHTML = results.length ? results.map(product => {
      const stock = product.usaInventario === false ? "Sin control de inventario" : `Existencia: ${esc(product.stock ?? "--")}`;
      const tax = numero(product.tasaItbis, .18) > 0 ? `ITBIS ${Math.round(numero(product.tasaItbis, .18) * 100)}%` : "Exento";
      return `<article class="sale-price-result">
        <div><strong>${esc(product.nombre)}</strong><small>${esc(product.codigoBarras || product.sku || product.categoriaNombre || "Producto")} | ${stock} | ${tax}</small></div>
        <div class="sale-price-values"><span>Precio <b>${money(product.precioFinalCentavos)}</b></span>${numero(product.precioMayoreoCentavos) > 0 ? `<span>Mayoreo <b>${money(product.precioMayoreoCentavos)}</b></span>` : ""}</div>
        <button class="secondary" type="button" data-sale-price-add="${esc(product.id)}">Agregar</button>
      </article>`;
    }).join("") : '<div class="empty-state">No hay coincidencias para consultar.</div>';
    $("salePriceResults").querySelectorAll("[data-sale-price-add]").forEach(button => button.addEventListener("click", () => {
      addSaleProduct(button.dataset.salePriceAdd);
      closeSalePriceVerifier();
    }));
  }

  function openSalePriceVerifier() {
    if (!saleAccess.canVerifyPrice) { toast("Tu cuenta no puede verificar precios en la caja web."); return; }
    const verifier = $("salePriceVerifier");
    verifier.classList.remove("oculto");
    verifier.setAttribute("aria-hidden", "false");
    $("salePriceSearch").value = $("saleSearch").value || "";
    renderSalePriceVerifier($("salePriceSearch").value);
    setTimeout(() => $("salePriceSearch").focus(), 0);
  }

  function closeSalePriceVerifier() {
    $("salePriceVerifier").classList.add("oculto");
    $("salePriceVerifier").setAttribute("aria-hidden", "true");
    setTimeout(() => $("saleSearch")?.focus(), 0);
  }

  async function loadSaleBankAccounts() {
    if (authProvider === "firebase") {
      const accounts = await window.DcarelaFirebase.getFinanceAccounts(BUSINESS);
      saleBankAccounts = (accounts || []).filter(account => {
        const type = String(account.tipo || "").toLowerCase();
        const state = String(account.estado || "activa").toLowerCase();
        return type === "banco" && state === "activa" && account.oculta !== true;
      }).sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
      $("saleBankAccount").innerHTML = '<option value="">Seleccionar</option>' + saleBankAccounts.map(account => `<option value="${esc(account.id)}">${esc(account.nombre)}</option>`).join("");
      return;
    }
    const { data, error } = await sb.from("fin_cuentas").select("id,nombre,tipo,estado,oculta")
      .eq("business_id", BUSINESS).eq("tipo", "banco").eq("estado", "activa").eq("oculta", false).order("nombre");
    saleBankAccounts = error ? [] : (data || []);
    $("saleBankAccount").innerHTML = '<option value="">Seleccionar</option>' + saleBankAccounts.map(account => `<option value="${esc(account.id)}">${esc(account.nombre)}</option>`).join("");
  }

  function renderSaleShift() {
    const open = Boolean(saleShift?.id);
    $("saleShiftGate").classList.toggle("oculto", open);
    $("saleWorkbench").classList.toggle("oculto", !open);
    $("saleCommandStrip")?.classList.toggle("sale-shift-closed", !open);
    $("saleShiftPill").textContent = open ? `Turno abierto | ${fecha(saleShift.abiertoEn || saleShift.openedAt)}` : "Caja cerrada";
    syncSaleMobileSummary();
  }

  async function refreshSaleShift() {
    const status = await saleApi("status");
    setSaleAccess({ role: status.role || saleAccess.role, ...(status.permissions || {}), loaded: true });
    saleShift = status.shift || null;
    renderSaleShift();
    return status;
  }

  function virtualCapabilityLabel(capability) {
    return ({
      ventas: "Ventas sincronizadas",
      pagos_mixtos: "Efectivo, tarjeta, transferencia, cheque y pago mixto",
      credito: "Ventas a credito con limite y cliente obligatorio",
      pendientes: "Multiples cuentas en espera por navegador",
      cotizaciones: "Cotizacion imprimible antes del cobro",
      anulaciones: "Anulacion auditada con motivo",
      entradas_salidas: "Entradas y salidas de efectivo",
      arqueo: "Cierre por denominacion, esperado, contado y diferencia",
      impresion: "Ticket termico validado para 80 mm",
      clientes: "Directorio, credito, abonos e historial de clientes",
      productos: "Productos, servicios, categorias y combos",
      inventario: "Existencias y movimientos sincronizados",
      reportes: "Reportes de ventas, impuestos, turnos y productos",
      finanzas: "Cuentas, gastos, compromisos y conciliacion",
      atajos_f1_f12: "Mapa F1-F12 igual a la caja local",
      seguimiento_transferencias: "Transferencias bancarias pendientes de confirmacion",
    })[capability] || capability;
  }

  async function cargarCajaVirtual() {
    const status = await saleApi("status");
    setSaleAccess({ role: status.role || saleAccess.role, ...(status.permissions || {}), loaded: true });
    saleShift = status.shift || null;
    const summary = status.summary || {};
    const open = Boolean(saleShift?.id);
    $("virtualShiftPill").textContent = open ? `Turno abierto | ${fecha(saleShift.abiertoEn || saleShift.openedAt)}` : "Caja cerrada";
    $("virtualShiftPill").classList.toggle("live", open);
    $("virtualMetrics").innerHTML = [
      ["Estado", open ? "Abierta" : "Cerrada", open ? "terminal disponible" : "abre un turno para vender"],
      ["Ventas", String(summary.saleCount || 0), money(summary.grossSalesCentavos || 0)],
      ["Efectivo vendido", money(summary.cashSalesCentavos || 0), "sin duplicar propinas"],
      ["Abonos de clientes", money(summary.customerCashPaymentsCentavos || 0), "incluidos una sola vez"],
      ["Entradas", money(summary.entriesCentavos || 0), "movimientos del turno"],
      ["Salidas", money(summary.exitsCentavos || 0), "movimientos del turno"],
      ["Devoluciones", money(summary.cashRefundsCentavos || 0), "reembolsos en efectivo"],
      ["A entregar", money(summary.cashToDeliverCentavos || 0), "sin contar el fondo de apertura"],
      ["Esperado fisico", money(summary.expectedCashCentavos || 0), "fondo + monto a entregar"],
    ].map(([label, value, detail]) => `<div class="metric-item"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join("");
    const capabilities = Array.isArray(status.capabilities) ? status.capabilities : [];
    $("virtualCapabilities").innerHTML = capabilities.map(item => `<div><span aria-hidden="true">&#10003;</span><strong>${esc(virtualCapabilityLabel(item))}</strong></div>`).join("");
    setSaleButtonState("btnVirtualNewSale", saleAccess.canUse, "Tu cuenta no puede usar la Caja virtual.");
    setSaleButtonState("btnVirtualResume", saleAccess.canUse && salePendingCount() > 0, saleAccess.canUse ? "No hay cuentas en espera." : "Tu cuenta no puede usar la Caja virtual.");
    setSaleButtonState("btnVirtualCashIn", open && saleAccess.canCloseShift, open ? "Tu cuenta no puede mover efectivo." : "Abre un turno primero.");
    setSaleButtonState("btnVirtualCashOut", open && saleAccess.canCloseShift, open ? "Tu cuenta no puede mover efectivo." : "Abre un turno primero.");
    setSaleButtonState("btnVirtualClose", open && saleAccess.canCloseShift, open ? "Tu cuenta no puede cerrar este turno." : "No hay un turno abierto.");
    $("virtualCashError").textContent = "";

    const recent = await eventos(["VentaCobrada", "VentaCancelada", "EntradaEfectivo", "SalidaEfectivo", "CajaAbierta", "CajaCerrada"], null, null, 400);
    const own = recent.filter(item => item.device_id === status.device_id).slice(0, 30);
    $("virtualActivity").innerHTML = own.length ? tabla(own, event => {
      const p = P(event);
      const amount = event.event_type === "VentaCobrada"
        ? totalDe(p)
        : numero(p.montoCentavos, p.efectivoContadoCentavos, p.montoAperturaCentavos);
      return [fecha(fechaEventoIso(event)), event.event_type, p.folio ? `#${esc(p.folio)}` : "--", amount ? money(amount) : "--", esc(p.clienteNombre || p.motivo || p.nota || p.usuarioNombre || "--")];
    }, ["Fecha", "Operacion", "Folio", "Monto", "Detalle"]) : '<div class="empty-state">Esta Caja virtual aun no tiene actividad.</div>';
  }

  function openVirtualCashMovement(kind) {
    const outgoing = kind === "salida";
    if (!saleShift?.id) { toast("Abre un turno de Caja virtual primero."); return; }
    abrirEditor(
      outgoing ? "Salida de efectivo" : "Entrada de efectivo",
      "El movimiento quedara ligado al turno de Caja virtual, con auditoria y sincronizacion.",
      '<label><span>Monto</span><input name="monto" inputmode="decimal" required></label><label class="field-wide"><span>Motivo</span><input name="motivo" maxlength="500" required></label><label class="field-wide"><span>Nota adicional</span><textarea name="nota" rows="3" maxlength="1000"></textarea></label>',
      async form => {
        const result = await saleApi("cash.move", {
          tipo: kind,
          montoCentavos: centavosInput(form.get("monto")),
          motivo: String(form.get("motivo") || "").trim(),
          nota: String(form.get("nota") || "").trim() || null,
        }, saleUuid());
        cerrarEditor();
        toast(`${outgoing ? "Salida" : "Entrada"} registrada: ${money(result.movement.montoCentavos)}.`);
        await cargarCajaVirtual();
      },
      outgoing ? "Registrar salida" : "Registrar entrada",
    );
  }

  async function openSaleConsole(resume = false) {
    if (!saleAccess.loaded) {
      try { await cargarPermisosCajaWeb(); }
      catch { setSaleAccess({ loaded: true }); }
    }
    if (!saleAccess.canUse) { toast("Tu cuenta no tiene permiso para usar la caja web."); return; }
    $("saleOverlay").classList.remove("oculto");
    $("saleOverlay").setAttribute("aria-hidden", "false");
    $("saleConsole").classList.remove("receipt-mode");
    document.body.style.overflow = "hidden";
    $("saleReceipt").classList.add("oculto");
    $("saleWorkbench").classList.add("oculto");
    $("saleShiftGate").classList.add("oculto");
    $("saleMobileSummary").classList.add("oculto");
    $("saleShiftPill").textContent = "Consultando turno";
    $("saleBranch").textContent = nombreSucursal(BUSINESS);
    $("saleError").textContent = "";
    setSaleStage("catalog");
    // El estado ya fue obtenido al cargar permisos. Se muestra primero para
    // que una consulta historica lenta nunca deje el overlay completamente
    // negro. Catalogo, clientes y cuentas progresan de forma independiente.
    renderSaleShift();
    renderSaleCart();
    const failures = [];
    const captureFailure = label => error => {
      failures.push(`${label}: ${error?.message || error}`);
    };
    const tasks = [
      refreshSaleShift().catch(captureFailure("turno")),
      cargarCatalogoCloud()
        .then(() => renderSaleProducts())
        .catch(captureFailure("catalogo")),
      cargarClientesCloud()
        .then(() => {
          $("saleClient").innerHTML = '<option value="">Consumidor final</option>' + (clientCatalog || []).filter(client => client.activo !== false).map(client => `<option value="${esc(client.id)}">${esc(client.nombre)}${numero(client.saldoCentavos) ? ` | saldo ${money(client.saldoCentavos)}` : ""}</option>`).join("");
        })
        .catch(captureFailure("clientes")),
      loadSaleBankAccounts().catch(captureFailure("cuentas")),
      cargarNegocioCloud().catch(captureFailure("negocio")),
    ];
    await Promise.all(tasks);
    if (failures.length) {
      $("saleError").textContent = `No se cargaron todos los datos (${failures.join("; ")}). Puedes reintentar sin cerrar el turno.`;
    }
    renderSaleShift();
    renderSaleCart();
    if (saleCart.length) setSaleStage("cart");
    setTimeout(() => (saleShift ? (saleCart.length ? $("saleCart") : $("saleSearch")) : $("saleOpening"))?.focus(), 0);
  }

  function closeSaleConsole() {
    if (saleSubmitting) return;
    closeSalePriceVerifier();
    $("saleOverlay").classList.add("oculto");
    $("saleOverlay").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if ((location.hash.slice(1) || "dashboard") === "caja-virtual") location.hash = "dashboard";
  }

  async function openVirtualCommand(action) {
    await openSaleConsole(false);
    if (action === "price") { openSalePriceVerifier(); return; }
    if (!saleShift?.id) {
      toast("Abre el turno antes de usar este modulo de la caja.");
      $("saleOpening")?.focus();
      return;
    }
    if (action === "common") { openCommonSale(); return; }
    if (action === "wholesale") { toggleSaleWholesale(); return; }
    if (action === "checkout") { setSaleStage("checkout", true); }
  }

  async function latestActiveSaleEvent() {
    const rows = await eventos(["VentaCobrada", "VentaCancelada"], null, null, 500);
    const cancellations = rows.filter(row => row.event_type === "VentaCancelada");
    const cancelled = new Set(cancellations.flatMap(clavesVenta));
    return rows.find(row => row.event_type === "VentaCobrada" && !clavesVenta(row).some(key => cancelled.has(key))) || null;
  }

  function previewCurrentTicket() {
    if (!saleCart.length) { toast("Agrega productos para previsualizar el ticket."); return; }
    $("saleReceiptContent").innerHTML = saleReceiptMarkup({ lineas: saleCart, vendidaEn: new Date().toISOString() }, true);
    $("saleWorkbench").classList.add("oculto");
    $("saleReceipt").classList.remove("oculto");
    $("saleConsole").classList.add("receipt-mode");
    saleReceiptPreview = true;
    $("btnSaleNext").textContent = "Volver a la venta";
    syncSaleMobileSummary();
  }

  async function cancelLastSaleFromConsole() {
    const event = await latestActiveSaleEvent();
    if (!event) { toast("No hay una venta valida reciente para anular."); return; }
    const payload = P(event);
    const id = event.entity_id || payload.ventaId || payload.venta_id || payload.id;
    if (!id) { toast("La ultima venta no tiene un identificador anulable."); return; }
    cancelSaleWeb(id, payload.folio || "--", event.id || event.event_id || "");
  }

  async function reprintLastSaleFromConsole() {
    const event = await latestActiveSaleEvent();
    if (!event) { toast("No hay una venta valida reciente para reimprimir."); return; }
    const payload = P(event);
    $("saleReceiptContent").innerHTML = saleReceiptMarkup(payload, false);
    $("saleWorkbench").classList.add("oculto");
    $("saleReceipt").classList.remove("oculto");
    $("saleConsole").classList.add("receipt-mode");
    saleReceiptPreview = true;
    $("btnSaleNext").textContent = "Volver a la venta";
    syncSaleMobileSummary();
  }

  function clearSale(resetReceipt = true) {
    saleCart = [];
    salePayments = [];
    saleSelectedLineIndex = -1;
    saleRequestId = null;
    $("saleClient").value = "";
    $("saleRounding").value = "exacto";
    $("saleTip").value = "0.00";
    $("saleNote").value = "";
    $("salePriceReason").value = "";
    $("salePaymentMethod").value = "efectivo";
    $("saleReference").value = "";
    $("saleBankAccount").value = "";
    $("saleCashReceived").value = "0.00";
    $("saleSearch").value = "";
    if (resetReceipt) {
      $("saleReceipt").classList.add("oculto");
      $("saleConsole").classList.remove("receipt-mode");
    }
    $("saleWorkbench").classList.toggle("oculto", !saleShift);
    updateSalePaymentFields();
    renderSaleProducts();
    renderSaleCart();
    setSaleStage("catalog");
  }

  function selectedSaleLine() {
    if (!saleCart.length) return null;
    if (saleSelectedLineIndex < 0 || saleSelectedLineIndex >= saleCart.length)
      saleSelectedLineIndex = saleCart.length - 1;
    return saleCart[saleSelectedLineIndex] || null;
  }

  function selectSaleLine(index, focus = false) {
    const parsed = Number(index);
    saleSelectedLineIndex = saleCart.length && Number.isFinite(parsed)
      ? Math.max(0, Math.min(saleCart.length - 1, Math.trunc(parsed)))
      : -1;
    document.querySelectorAll("[data-sale-line]").forEach(element => {
      element.classList.toggle("selected", Number(element.dataset.saleLine) === saleSelectedLineIndex);
    });
    if (focus && saleSelectedLineIndex >= 0)
      document.querySelector(`[data-sale-line="${saleSelectedLineIndex}"] [data-sale-field="cantidad"]`)?.focus();
  }

  function openSaleLineChange() {
    const line = selectedSaleLine();
    if (!line) { toast("Agrega o selecciona un producto antes de cambiarlo."); return; }
    abrirEditor("Cambiar linea", line.nombre, `
      <label><span>Cantidad</span><input name="cantidad" inputmode="decimal" required value="${esc(line.cantidad)}"></label>
      <label><span>Precio (RD$)</span><input name="precio" inputmode="decimal" required value="${esc(pesoInput(line.precioUnitarioCentavos))}"${saleAccess.canOverridePrice ? "" : " readonly"}></label>
      <label><span>Descuento %</span><input name="descuento" inputmode="decimal" value="${esc(line.descuentoPct || 0)}"${saleAccess.canOverridePrice ? "" : " readonly"}></label>`, async form => {
      const quantity = numero(String(form.get("cantidad") || "").replace(",", "."));
      if (quantity <= 0 || Math.round(quantity * 1000) !== quantity * 1000)
        throw new Error("La cantidad debe ser mayor que cero y admitir hasta tres decimales.");
      line.cantidad = String(quantity);
      if (saleAccess.canOverridePrice) {
        line.precioUnitarioCentavos = centavosInput(form.get("precio"));
        line.descuentoPct = Math.min(100, Math.max(0, numero(String(form.get("descuento") || "0").replace(",", "."))));
      }
      cerrarEditor();
      renderSaleCart();
      selectSaleLine(saleSelectedLineIndex, true);
    }, "Aplicar cambio");
  }

  function toggleSaleWholesale() {
    const line = selectedSaleLine();
    if (!line) { toast("Agrega o selecciona un producto antes de aplicar mayoreo."); return; }
    if (numero(line.precioMayoreoCentavos) <= 0) {
      toast("El producto seleccionado no tiene precio de mayoreo configurado.");
      return;
    }
    line.mayoreo = !line.mayoreo;
    line.precioUnitarioCentavos = line.mayoreo ? line.precioMayoreoCentavos : line.precioNormalCentavos;
    renderSaleCart();
    selectSaleLine(saleSelectedLineIndex);
    toast(line.mayoreo ? "Precio de mayoreo aplicado." : "Precio normal restaurado.");
  }

  function navigateFromSale(route) {
    closeSaleConsole();
    location.hash = route;
  }

  function salePendingRecord(name) {
    return {
      id: saleUuid(),
      name,
      cart: saleCart.map(line => ({ ...line })),
      clientId: $("saleClient").value,
      rounding: $("saleRounding").value,
      tip: $("saleTip").value,
      note: $("saleNote").value,
      priceReason: $("salePriceReason").value,
      payments: salePayments.map(payment => ({ ...payment })),
      totalCentavos: saleExactTotals().total,
      savedAt: new Date().toISOString(),
    };
  }

  function salePendingMetaText(account) {
    const count = Number(account?.lineCount || account?.cart?.length || 0);
    return `${count} ${count === 1 ? "producto" : "productos"} · ${money(account?.totalCentavos)} · ${fecha(account?.savedAt)}`;
  }

  function salePendingOptionHtml(account, checked = false) {
    return `<div class="confirm-panel field-wide"><label class="check-row"><input type="radio" name="pendingSaleId" value="${esc(account.id)}"${checked ? " checked" : ""}><span><strong>${esc(account.name)}</strong><small>${esc(salePendingMetaText(account))}</small></span></label><div class="button-row"><button class="secondary" type="button" data-pending-delete="${esc(account.id)}">Eliminar</button></div></div>`;
  }

  function parkSale() {
    if (!saleAccess.canParkSale) { toast("Tu cuenta no puede guardar ventas pendientes."); return; }
    if (!salePendingStore) { toast("No se pudo cargar el manejador de cuentas en espera."); return; }
    if (!saleCart.length) { toast("No hay una cuenta para guardar."); return; }
    const existingNames = salePendingList().map(item => item.name);
    abrirEditor("Guardar cuenta en espera", "Ponle un nombre unico para recuperarla despues sin confundirla con otra.", `
      <label class="field-wide"><span>Nombre de la cuenta</span><input name="nombre" required maxlength="80" placeholder="Ej.: Mesa 2, Pedido Ana o Marcos" autocomplete="off"></label>
      ${existingNames.length ? `<p class="field-hint field-wide">Ya guardadas: ${esc(existingNames.join(", "))}</p>` : ""}`, async form => {
      const name = String(form.get("nombre") || "").trim();
      const result = salePendingStore.upsert(localStorage, BUSINESS, salePendingRecord(name));
      clearSale();
      cerrarEditor();
      updateSalePendingButton();
      syncSalePermissionUi();
      toast(`Cuenta "${result.account.name}" guardada en espera.`);
    }, "Guardar cuenta");
  }

  function restorePendingSale(pendingId) {
    if (!salePendingStore) { toast("No se pudo cargar el manejador de cuentas en espera."); return false; }
    const saved = salePendingStore.take(localStorage, BUSINESS, pendingId);
    if (!saved?.cart?.length) {
      updateSalePendingButton();
      syncSalePermissionUi();
      toast("La cuenta en espera ya no existe.");
      return false;
    }
    saleCart = saved.cart.map(line => ({ ...line, localId: line.localId || saleUuid() }));
    salePayments = Array.isArray(saved.payments) ? saved.payments.map(payment => ({ ...payment })) : [];
    $("saleClient").value = saved.clientId || "";
    $("saleRounding").value = saved.rounding || "exacto";
    $("saleTip").value = saved.tip || "0.00";
    $("saleNote").value = saved.note || "";
    $("salePriceReason").value = saved.priceReason || "";
    updateSalePendingButton();
    syncSalePermissionUi();
    renderSaleProducts();
    renderSaleCart();
    setSaleStage(saleCart.length ? "cart" : "catalog");
    toast(`Cuenta "${saved.name}" recuperada (${fecha(saved.savedAt)}).`);
    return true;
  }

  function bindPendingSalesEditor() {
    $("editorFields").querySelectorAll("[data-pending-delete]").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const accounts = salePendingList();
      const account = accounts.find(item => item.id === button.dataset.pendingDelete);
      if (!account) { openPendingSales(); return; }
      if (!confirm(`¿Eliminar la cuenta en espera "${account.name}"?`)) return;
      salePendingStore.remove(localStorage, BUSINESS, account.id);
      updateSalePendingButton();
      syncSalePermissionUi();
      const refreshed = salePendingList();
      if (!refreshed.length) {
        cerrarEditor();
        toast("La ultima cuenta en espera fue eliminada.");
        return;
      }
      const selected = $("editorForm")?.elements?.pendingSaleId?.value || refreshed[0].id;
      $("editorFields").innerHTML = refreshed.map((entry, index) =>
        salePendingOptionHtml(entry, entry.id === selected || (!selected && index === 0))).join("");
      bindPendingSalesEditor();
    }));
  }

  function openPendingSales() {
    if (!salePendingStore) { toast("No se pudo cargar el manejador de cuentas en espera."); return; }
    const accounts = salePendingList();
    if (!accounts.length) { toast("No hay cuentas en espera guardadas."); return; }
    abrirEditor("Cuentas en espera", "Cada cuenta conserva su nombre, productos, cliente y pagos parciales hasta que la recuperes.", accounts.map((account, index) => salePendingOptionHtml(account, index === 0)).join(""), async form => {
      const pendingId = String(form.get("pendingSaleId") || "").trim();
      if (!pendingId) throw new Error("Selecciona una cuenta en espera.");
      if (saleCart.length && !confirm("La cuenta actual se reemplazara por la cuenta en espera seleccionada. Guarda la actual en espera si deseas conservarla.")) return;
      if (!restorePendingSale(pendingId)) throw new Error("No se pudo recuperar la cuenta seleccionada.");
      cerrarEditor();
      setTimeout(() => $("saleCart")?.focus(), 0);
    }, "Recuperar cuenta");
    bindPendingSalesEditor();
  }


  function updateSalePaymentFields() {
    const method = $("salePaymentMethod").value;
    $("saleReferenceField").classList.toggle("oculto", !["tarjeta", "transferencia", "cheque"].includes(method));
    $("saleBankField").classList.toggle("oculto", method !== "transferencia");
    updateSaleCashChange();
  }

  function draftSalePayment(amountOverride = null) {
    const method = $("salePaymentMethod").value;
    const amount = amountOverride ?? centavosInput($("salePaymentAmount").value);
    if (amount <= 0) throw new Error("El pago debe ser mayor que cero.");
    const payment = { metodo: method, montoCentavos: amount };
    if (["tarjeta", "transferencia", "cheque"].includes(method)) payment.referencia = $("saleReference").value.trim() || null;
    if (method === "transferencia") {
      const account = saleBankAccounts.find(item => item.id === $("saleBankAccount").value);
      if (!account) throw new Error("Selecciona la cuenta bancaria que recibio la transferencia.");
      payment.cuentaFinancieraId = account.id;
      payment.cuentaFinancieraNombre = account.nombre;
    }
    return payment;
  }

  function addSalePayment() {
    const payment = draftSalePayment();
    if (salePayments.reduce((sum, item) => sum + item.montoCentavos, 0) + payment.montoCentavos > saleExactTotals().total) {
      throw new Error("Los pagos superan el total de la venta.");
    }
    salePayments.push(payment);
    $("saleReference").value = "";
    renderSalePayments();
    syncSalePaymentDraft(true);
  }

  function collectSalePayments() {
    const total = saleExactTotals().total;
    const payments = salePayments.map(payment => ({ ...payment }));
    const current = payments.reduce((sum, payment) => sum + payment.montoCentavos, 0);
    if (current < total) payments.push(draftSalePayment(total - current));
    const sum = payments.reduce((value, payment) => value + payment.montoCentavos, 0);
    if (sum !== total) throw new Error("La suma de pagos debe coincidir exactamente con el total.");
    if (payments.some(payment => payment.metodo === "credito") && !$("saleClient").value) throw new Error("Selecciona un cliente para vender a credito.");
    return payments;
  }

  function salePayload(inventoryOverride = null) {
    if (!saleCart.length) throw new Error("Agrega al menos un producto.");
    const payments = collectSalePayments();
    const tip = centavosInput($("saleTip").value || "0");
    const cashOnly = payments.length === 1 && payments[0].metodo === "efectivo";
    const data = {
      clienteId: $("saleClient").value || null,
      redondeo: $("saleRounding").value,
      propinaCentavos: tip,
      nota: $("saleNote").value.trim() || null,
      motivoCambioPrecio: $("salePriceReason").value.trim() || null,
      pagos: payments,
      lineas: saleCart.map(line => ({
        productoId: line.productoId, nombre: line.nombre, comun: line.comun,
        cantidad: String(line.cantidad), precioUnitarioCentavos: numero(line.precioUnitarioCentavos),
        descuentoPct: numero(line.descuentoPct), mayoreo: Boolean(line.mayoreo), tasaItbis: line.tasaItbis
      }))
    };
    if (cashOnly) {
      data.pagoConCentavos = centavosInput($("saleCashReceived").value || "0");
      if (data.pagoConCentavos < saleExactTotals().total + tip) throw new Error("El efectivo recibido no cubre el total y la propina.");
    }
    if (inventoryOverride) {
      data.forzarInventario = true;
      data.motivoInventario = inventoryOverride;
    }
    if (saleHasCustomPrices() && !data.motivoCambioPrecio) throw new Error("Indica el motivo del precio especial.");
    return data;
  }

  const saleCentavosSeguro = value => {
    try { return centavosInput(value); }
    catch { return 0; }
  };

  function saleClienteLabel(sale = null) {
    return sale?.clienteNombre
      || sale?.cliente_nombre
      || $("saleClient")?.selectedOptions?.[0]?.textContent
      || "Consumidor final";
  }

  function saleCajeroLabel(sale = null) {
    return sale?.cajeroNombre
      || sale?.usuarioNombre
      || sale?.usuario_nombre
      || session?.user?.email
      || "Caja web";
  }

  function saleLineasRenderizables(sale = null) {
    if (Array.isArray(sale?.lineas) && sale.lineas.length) return sale.lineas;
    return saleCart.map(line => {
      const quantity = numero(line.cantidad);
      const gross = Math.round(numero(line.precioUnitarioCentavos) * quantity);
      const discount = Math.round(gross * numero(line.descuentoPct) / 100);
      return {
        nombre: line.nombre,
        cantidad: quantity,
        precioUnitarioCentavos: numero(line.precioUnitarioCentavos),
        importeFinalCentavos: Math.max(0, gross - discount)
      };
    });
  }

  function saleReceiptRender(sale, quote = false) {
    const helper = window.DcarelaThermalTicket;
    const totals = saleExactTotals();
    const tip = saleCentavosSeguro($("saleTip")?.value || "0");
    const fallbackTotal = totals.total + tip;
    const efectivoRecibido = saleCentavosSeguro($("saleCashReceived")?.value || "0");
    const lines = saleLineasRenderizables(sale);
    const normalizedSale = {
      ...sale,
      vendidaEn: sale?.vendidaEn || new Date().toISOString(),
      clienteNombre: saleClienteLabel(sale),
      lineas: lines,
      subtotalSinItbisCentavos: sale?.subtotalSinItbisCentavos ?? sale?.subtotal_sin_itbis_centavos ?? totals.base,
      itbisCentavos: sale?.itbisCentavos ?? sale?.itbis_centavos ?? totals.tax,
      descuentoCentavos: sale?.descuentoCentavos ?? sale?.descuento_centavos ?? totals.discount,
      propinaCentavos: sale?.propinaCentavos ?? sale?.propina_centavos ?? tip,
      ajusteRedondeoCentavos: sale?.ajusteRedondeoCentavos ?? sale?.ajuste_redondeo_centavos ?? totals.adjustment,
      totalCobradoCentavos: totalDe(sale) || fallbackTotal,
      pagos: Array.isArray(sale?.pagos) && sale.pagos.length ? sale.pagos : salePayments,
      pagoConCentavos: sale?.pagoConCentavos ?? sale?.pago_con_centavos ?? (efectivoRecibido || null),
      cambioCentavos: sale?.cambioCentavos ?? sale?.cambio_centavos
        ?? (efectivoRecibido > fallbackTotal ? efectivoRecibido - fallbackTotal : 0),
      nota: sale?.nota || $("saleNote")?.value || null,
    };
    if (helper?.render) {
      return helper.render({
        business: businessConfig || {},
        sale: normalizedSale,
        branchName: nombreSucursal(BUSINESS),
        cashierName: saleCajeroLabel(sale),
        customerName: saleClienteLabel(sale),
        quote,
      });
    }
    return null;
  }

  function saleReceiptMarkup(sale, quote = false) {
    const rendered = saleReceiptRender(sale, quote);
    if (rendered?.html) return rendered.html;
    const business = businessConfig || {};
    const lines = saleLineasRenderizables(sale);
    const total = quote ? saleExactTotals().total : totalDe(sale);
    return `<article class="sale-receipt"><h2>${esc(business.nombre || "D' Carela Compufoto")}</h2><p>${esc(business.rnc ? `RNC ${business.rnc}` : "")}</p><p>${esc(business.telefono || business.whatsapp || "")}</p><div class="sale-receipt-meta"><strong>${quote ? "COTIZACION" : `VENTA #${esc(sale.folio || "--")}`}</strong><br>${esc(fecha(sale.vendidaEn || new Date().toISOString()))}<br>${esc(saleClienteLabel(sale))}</div>${lines.map(line => `<div class="sale-receipt-line"><span>${esc(line.nombre)}<small>${esc(line.cantidad || 1)} x ${money(line.precioUnitarioCentavos)}</small></span><strong>${money(line.importeFinalCentavos ?? Math.round(numero(line.precioUnitarioCentavos) * numero(line.cantidad)))}</strong></div>`).join("")}<div class="sale-receipt-total"><span>Total</span><strong>${money(total)}</strong></div>${sale.itbisCentavos !== undefined ? `<div class="sale-receipt-line"><span>ITBIS incluido</span><strong>${money(sale.itbisCentavos)}</strong></div>` : ""}${sale.cambioCentavos !== null && sale.cambioCentavos !== undefined ? `<div class="sale-receipt-line"><span>Devuelta</span><strong>${money(sale.cambioCentavos)}</strong></div>` : ""}<p style="margin-top:16px">${esc(business.ticketPie || (quote ? "Cotizacion sujeta a disponibilidad." : "Gracias por su compra"))}</p></article>`;
  }

  function validarTicketTermicoActual() {
    const helper = window.DcarelaThermalTicket;
    const mount = $("saleReceiptContent");
    if (!helper?.validateElement || !mount) return { ok: true, errors: [], warnings: [] };
    return helper.validateElement(mount);
  }

  function printSaleReceipt() {
    const validation = validarTicketTermicoActual();
    if (!validation.ok) {
      toast(validation.errors[0] || "El ticket termico no paso la validacion local.");
      return;
    }
    if (validation.warnings.length) {
      console.warn("[ticket-termico]", validation.warnings.join(" | "));
    }
    document.body.classList.add("sale-printing");
    window.print();
    setTimeout(() => document.body.classList.remove("sale-printing"), 500);
  }

  async function submitSale(inventoryReason = null, printAfter = false) {
    if (!saleAccess.canCreateSale) { toast("Tu cuenta no puede registrar ventas en la caja web."); return; }
    if (saleSubmitting) return;
    saleSubmitting = true;
    $("saleError").textContent = "";
    $("btnSaleSubmit").disabled = true;
    $("btnSaleMobileCheckout").disabled = true;
    $("btnSaleSubmit").textContent = "Registrando...";
    saleRequestId ||= saleUuid();
    try {
      const result = await saleApi("sale.create", salePayload(inventoryReason), saleRequestId);
      saleLastReceipt = result.sale;
      saleReceiptPreview = false;
      $("btnSaleNext").textContent = "Siguiente venta";
      updateSalePendingButton();
      syncSalePermissionUi();
      $("saleReceiptContent").innerHTML = saleReceiptMarkup(result.sale);
      $("saleWorkbench").classList.add("oculto");
      $("saleReceipt").classList.remove("oculto");
      $("saleConsole").classList.add("receipt-mode");
      syncSaleMobileSummary();
      if (printAfter) setTimeout(printSaleReceipt, 80);
      cancelCache.at = 0;
      toast(`Venta #${result.sale.folio} registrada y enviada a las cajas.`);
      cargarVentas().catch(() => {});
      if ((location.hash.slice(1) || "dashboard") === "caja-virtual") cargarCajaVirtual().catch(() => {});
    } catch (error) {
      if (error.status === 409 && /Inventario requiere confirmacion/i.test(error.message) && !inventoryReason && saleAccess.canForceInventory) {
        abrirEditor("Confirmar inventario", error.message, '<label class="field-wide"><span>Motivo para continuar</span><textarea name="motivo" rows="3" required maxlength="500" placeholder="Ej.: conteo pendiente en esta sucursal"></textarea></label>', async form => {
          const reason = String(form.get("motivo") || "").trim();
          if (!reason) throw new Error("El motivo es obligatorio.");
          cerrarEditor();
          saleSubmitting = false;
          await submitSale(reason, printAfter);
        }, "Confirmar y registrar");
      } else {
        $("saleError").textContent = error.message;
        toast(error.message);
      }
    } finally {
      saleSubmitting = false;
      $("btnSaleSubmit").disabled = false;
      $("btnSaleMobileCheckout").disabled = false;
      $("btnSaleSubmit").textContent = "COBRAR (F12)";
    }
  }

  async function openSaleShift() {
    if (!saleAccess.canOpenShift) { $("saleError").textContent = "Tu cuenta no puede abrir la caja web."; return; }
    const button = $("btnSaleOpenShift");
    button.disabled = true;
    try {
      const result = await saleApi("shift.open", { montoAperturaCentavos: centavosInput($("saleOpening").value || "0") }, saleUuid());
      saleShift = result.shift;
      renderSaleShift();
      setSaleStage("catalog", true);
      toast("Caja virtual abierta. Ya puedes registrar ventas.");
      if ((location.hash.slice(1) || "dashboard") === "caja-virtual") cargarCajaVirtual().catch(() => {});
    } catch (error) { $("saleError").textContent = error.message; }
    finally { button.disabled = false; }
  }

  // Denominaciones RD$ (billetes y monedas). El conteo por denominacion es
  // obligatorio: el servidor rechaza el cierre sin desglose (pos-web-sale).
  const DENOMINACIONES = [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1];

  function openSaleCloseShift() {
    if (!saleAccess.canCloseShift) { toast("Tu cuenta no puede cerrar la caja web."); return; }
    const filas = DENOMINACIONES.map(v => `
      <label class="conteo-fila">
        <span>RD$ ${v.toLocaleString("es-DO")}</span>
        <input name="den_${v}" type="number" min="0" step="1" inputmode="numeric"
               placeholder="0" data-den="${v}" class="conteo-cant">
      </label>`).join("");

    abrirEditor(
      "Cerrar Caja virtual",
      "Cuenta el efectivo billete por billete. El sistema valida el arqueo sin revelar el esperado al cajero.",
      `<div class="conteo-grid">${filas}</div>
       <div class="conteo-total" id="conteoResumen">
         <div><span>Total contado</span><b id="conteoTotal">RD$ 0.00</b></div>
         <div><span>Validacion protegida</span><b>Se muestra al cerrar</b></div>
       </div>
       <label class="field-wide"><span>Motivo (obligatorio si hay diferencia)</span>
         <textarea name="nota" rows="5" maxlength="2000" placeholder="Documenta la explicacion completa; no se recortara visualmente"></textarea></label>`,
      async form => {
        const conteo = DENOMINACIONES
          .map(v => ({ valorCentavos: v * 100, cantidad: Math.max(0, Math.trunc(numero(form.get(`den_${v}`)))) }))
          .filter(d => d.cantidad > 0);
        if (!conteo.length) throw new Error("Cuenta el efectivo por denominacion antes de cerrar.");
        const contado = conteo.reduce((t, d) => t + d.valorCentavos * d.cantidad, 0);
        const nota = String(form.get("nota") || "").trim();
        const result = await saleApi("shift.close",
          { efectivoContadoCentavos: contado, conteoDenominaciones: conteo, nota: nota || null },
          saleUuid());
        cerrarEditor();
        saleShift = null;
        clearSale();
        renderSaleShift();
        const dif = result.summary.diferenciaCentavos;
        toast(dif === 0
          ? "Caja cerrada. El conteo cuadro exacto."
          : `Caja cerrada. Diferencia: ${money(dif)}.`);
        if ((location.hash.slice(1) || "dashboard") === "caja-virtual") cargarCajaVirtual().catch(() => {});
      },
      "Cerrar y guardar arqueo");

    // Solo se calcula el dinero fisicamente contado. El esperado y la
    // diferencia permanecen protegidos hasta que el corte ya fue guardado.
    const elTotal = $("conteoTotal");
    function recalcular() {
      let total = 0;
      document.querySelectorAll(".conteo-cant").forEach(inp => {
        total += numero(inp.dataset.den) * 100 * Math.max(0, Math.trunc(numero(inp.value)));
      });
      if (elTotal) elTotal.textContent = money(total);
    }
    document.querySelectorAll(".conteo-cant").forEach(inp => inp.addEventListener("input", recalcular));
    recalcular();
  }

  function openCommonSale() {
    if (!saleAccess.canOpenCommonSale) { toast("Tu cuenta no puede registrar ventas comunes."); return; }
    abrirEditor("Venta comun", "Agrega un articulo o servicio puntual sin alterar el catalogo.", '<label class="field-wide"><span>Descripcion</span><input name="nombre" required maxlength="180"></label><label><span>Precio final</span><input name="precio" inputmode="decimal" required></label><label><span>ITBIS</span><select name="itbis"><option value="0.18">18%</option><option value="0">Exento</option></select></label>', async form => {
      const name = String(form.get("nombre") || "").trim();
      const price = centavosInput(form.get("precio"));
      if (!name || price <= 0) throw new Error("Completa una descripcion y un precio mayor que cero.");
      saleCart.push({ localId: saleUuid(), productoId: `comun-${saleUuid()}`, nombre: name, cantidad: "1", precioUnitarioCentavos: price, precioNormalCentavos: price, precioMayoreoCentavos: 0, descuentoPct: 0, mayoreo: false, tasaItbis: numero(form.get("itbis")), usaInventario: false, comun: true });
      cerrarEditor();
      renderSaleCart();
      setSaleStage("cart");
    }, "Agregar a la cuenta");
  }

  function cancelSaleWeb(saleId, folio, sourceEventId = "") {
    if (!saleAccess.canCancelSale) { toast("Tu cuenta no puede anular ventas desde la caja web."); return; }
    abrirEditor(`Anular venta #${folio || "--"}`, "La venta se conservara en auditoria; inventario y credito se revertiran al sincronizar.", '<label class="field-wide"><span>Motivo de anulacion</span><textarea name="motivo" rows="3" required maxlength="500"></textarea></label>', async form => {
      const reason = String(form.get("motivo") || "").trim();
      if (!reason) throw new Error("El motivo es obligatorio.");
      await saleApi("sale.cancel", { ventaId: saleId, motivo: reason, sourceEventId }, saleUuid());
      cerrarEditor();
      cancelCache.at = 0;
      toast(`Venta #${folio || "--"} anulada y enviada a sincronizacion.`);
      await cargarVentas();
    }, "Anular venta");
  }

  const SALE_SHORTCUT_ACTIONS = Object.freeze({
    BLOCKED_MODAL: "blocked-modal",
    NAV_SALE: "nav-sale",
    NAV_CLIENTS: "nav-clients",
    NAV_PRODUCTS: "nav-products",
    NAV_INVENTORY: "nav-inventory",
    CHANGE_LINE: "change-line",
    PARK_OR_RESUME: "park-or-resume",
    CASH_IN: "cash-in",
    CASH_OUT: "cash-out",
    COMMON_SALE: "common-sale",
    VERIFY_PRICE: "verify-price",
    SEARCH_PRODUCT: "search-product",
    WHOLESALE: "wholesale",
    SUBMIT_SALE: "submit-sale",
    SUBMIT_PRINT: "submit-print",
    CLOSE_CONSOLE: "close-console",
    CLOSE_PRICE_VERIFIER: "close-price-verifier",
  });

  function saleShortcutEditableTarget(target) {
    const element = target && typeof target.closest === "function" ? target : null;
    if (!element) return false;
    return Boolean(element.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
  }

  function saleShortcutContext(source = {}) {
    return {
      overlayOpen: Boolean(source.overlayOpen),
      editorOpen: Boolean(source.editorOpen),
      priceVerifierOpen: Boolean(source.priceVerifierOpen),
      receiptVisible: Boolean(source.receiptVisible),
      shiftOpen: Boolean(source.shiftOpen),
      stage: saleStageNames.has(source.stage) ? source.stage : "catalog",
      hasCartLines: Boolean(source.hasCartLines),
      hasPendingSales: Boolean(source.hasPendingSales),
      canParkSale: Boolean(source.canParkSale),
      canOpenCommonSale: Boolean(source.canOpenCommonSale),
      canVerifyPrice: Boolean(source.canVerifyPrice),
      canCreateSale: Boolean(source.canCreateSale),
      hasEditableTarget: Boolean(source.hasEditableTarget),
    };
  }

  function resolveSaleShortcut(event, rawContext = {}) {
    const key = String(event?.key || "");
    const ctrlEnter = key === "Enter" && event?.ctrlKey && !event?.altKey && !event?.metaKey;
    const ctrlCommon = String(key).toLowerCase() === "p" && event?.ctrlKey && !event?.altKey && !event?.metaKey;
    const context = saleShortcutContext({
      ...rawContext,
      hasEditableTarget: rawContext.hasEditableTarget ?? saleShortcutEditableTarget(event?.target),
    });
    if (!context.overlayOpen) return null;
    if (!ctrlEnter && !ctrlCommon && (event?.ctrlKey || event?.altKey || event?.metaKey)) return null;
    const functionKey = /^F(?:[1-9]|1[0-2])$/.test(key);
    if (context.editorOpen || event?.isComposing) {
      if (context.editorOpen && (functionKey || ctrlEnter || ctrlCommon)) {
        return { action: SALE_SHORTCUT_ACTIONS.BLOCKED_MODAL, key: ctrlEnter ? "Ctrl+Enter" : ctrlCommon ? "Ctrl+P" : key };
      }
      return null;
    }
    if (key === "Escape") {
      return {
        action: context.priceVerifierOpen ? SALE_SHORTCUT_ACTIONS.CLOSE_PRICE_VERIFIER : SALE_SHORTCUT_ACTIONS.CLOSE_CONSOLE,
        key,
      };
    }
    if (ctrlEnter) {
      return {
        action: SALE_SHORTCUT_ACTIONS.SUBMIT_SALE,
        key: "Ctrl+Enter",
        repeat: Boolean(event?.repeat),
      };
    }
    if (ctrlCommon) return { action: SALE_SHORTCUT_ACTIONS.COMMON_SALE, key: "Ctrl+P", allowed: context.canOpenCommonSale };
    if (!functionKey) return null;
    if (key === "F1") return { action: context.stage === "checkout" && context.hasCartLines ? SALE_SHORTCUT_ACTIONS.SUBMIT_PRINT : SALE_SHORTCUT_ACTIONS.NAV_SALE, key };
    if (key === "F2") return { action: context.stage === "checkout" && context.hasCartLines ? SALE_SHORTCUT_ACTIONS.SUBMIT_SALE : SALE_SHORTCUT_ACTIONS.NAV_CLIENTS, key };
    if (key === "F3") return { action: SALE_SHORTCUT_ACTIONS.NAV_PRODUCTS, key };
    if (key === "F4") return { action: SALE_SHORTCUT_ACTIONS.NAV_INVENTORY, key };
    if (key === "F5") return { action: SALE_SHORTCUT_ACTIONS.CHANGE_LINE, key, allowed: context.hasCartLines };
    if (key === "F6") return { action: SALE_SHORTCUT_ACTIONS.PARK_OR_RESUME, key, allowed: context.canParkSale || context.hasPendingSales };
    if (key === "F7") return { action: SALE_SHORTCUT_ACTIONS.CASH_IN, key, allowed: context.shiftOpen };
    if (key === "F8") return { action: SALE_SHORTCUT_ACTIONS.CASH_OUT, key, allowed: context.shiftOpen };
    if (key === "F9") return { action: SALE_SHORTCUT_ACTIONS.VERIFY_PRICE, key, allowed: context.canVerifyPrice };
    if (key === "F10") return { action: SALE_SHORTCUT_ACTIONS.SEARCH_PRODUCT, key };
    if (key === "F11") return { action: SALE_SHORTCUT_ACTIONS.WHOLESALE, key, allowed: context.hasCartLines };
    return {
      action: SALE_SHORTCUT_ACTIONS.SUBMIT_SALE,
      key,
      repeat: Boolean(event?.repeat),
      allowed: context.canCreateSale,
    };
  }

  function saleShortcutRuntimeContext() {
    return {
      overlayOpen: !$("saleOverlay")?.classList.contains("oculto"),
      editorOpen: !$("editorOverlay")?.classList.contains("oculto"),
      priceVerifierOpen: !$("salePriceVerifier")?.classList.contains("oculto"),
      receiptVisible: !$("saleReceipt")?.classList.contains("oculto"),
      shiftOpen: Boolean(saleShift?.id),
      stage: saleStage,
      hasCartLines: saleCart.length > 0,
      hasPendingSales: salePendingCount() > 0,
      canParkSale: saleAccess.canParkSale,
      canOpenCommonSale: saleAccess.canOpenCommonSale,
      canVerifyPrice: saleAccess.canVerifyPrice,
      canCreateSale: saleAccess.canCreateSale,
    };
  }

  function showSaleWorkbenchFromShortcut(stage, focus = true) {
    $("saleReceipt").classList.add("oculto");
    $("saleConsole").classList.remove("receipt-mode");
    renderSaleShift();
    if (!saleShift?.id) {
      setTimeout(() => $("saleOpening")?.focus(), 0);
      return false;
    }
    setSaleStage(stage, focus);
    return true;
  }

  function executeSaleShortcut(shortcut) {
    const receiptVisible = !$("saleReceipt")?.classList.contains("oculto");
    if (receiptVisible && ![
      SALE_SHORTCUT_ACTIONS.NAV_SALE,
      SALE_SHORTCUT_ACTIONS.NAV_CLIENTS,
      SALE_SHORTCUT_ACTIONS.NAV_PRODUCTS,
      SALE_SHORTCUT_ACTIONS.NAV_INVENTORY,
      SALE_SHORTCUT_ACTIONS.CLOSE_CONSOLE,
      SALE_SHORTCUT_ACTIONS.CLOSE_PRICE_VERIFIER,
    ].includes(shortcut.action)) {
      toast("La venta ya fue registrada. Pulsa Siguiente venta para continuar.");
      return true;
    }
    switch (shortcut.action) {
      case SALE_SHORTCUT_ACTIONS.BLOCKED_MODAL:
        return true;
      case SALE_SHORTCUT_ACTIONS.CLOSE_PRICE_VERIFIER:
        closeSalePriceVerifier();
        return true;
      case SALE_SHORTCUT_ACTIONS.CLOSE_CONSOLE:
        closeSaleConsole();
        return true;
      case SALE_SHORTCUT_ACTIONS.NAV_SALE:
        if (receiptVisible) clearSale();
        showSaleWorkbenchFromShortcut("catalog");
        return true;
      case SALE_SHORTCUT_ACTIONS.NAV_CLIENTS:
        navigateFromSale("clientes");
        return true;
      case SALE_SHORTCUT_ACTIONS.NAV_PRODUCTS:
        sessionStorage.setItem("dcarela.inventory.focus", "productos");
        navigateFromSale("inventario");
        return true;
      case SALE_SHORTCUT_ACTIONS.NAV_INVENTORY:
        sessionStorage.setItem("dcarela.inventory.focus", "existencias");
        navigateFromSale("inventario");
        return true;
      case SALE_SHORTCUT_ACTIONS.CHANGE_LINE:
        openSaleLineChange();
        return true;
      case SALE_SHORTCUT_ACTIONS.PARK_OR_RESUME:
        if (saleCart.length) parkSale();
        else if (salePendingCount()) openPendingSales();
        else toast("No hay una venta actual ni cuentas pendientes.");
        return true;
      case SALE_SHORTCUT_ACTIONS.CASH_IN:
        openVirtualCashMovement("entrada");
        return true;
      case SALE_SHORTCUT_ACTIONS.CASH_OUT:
        openVirtualCashMovement("salida");
        return true;
      case SALE_SHORTCUT_ACTIONS.COMMON_SALE:
        if (!saleAccess.canOpenCommonSale) toast("Tu cuenta no puede registrar ventas comunes.");
        else openCommonSale();
        return true;
      case SALE_SHORTCUT_ACTIONS.VERIFY_PRICE:
        if (!saleAccess.canVerifyPrice) toast("Tu cuenta no puede verificar precios en la caja web.");
        else if (!$("salePriceVerifier").classList.contains("oculto")) closeSalePriceVerifier();
        else openSalePriceVerifier();
        return true;
      case SALE_SHORTCUT_ACTIONS.SEARCH_PRODUCT:
        if (!$("salePriceVerifier").classList.contains("oculto")) closeSalePriceVerifier();
        showSaleWorkbenchFromShortcut("catalog");
        return true;
      case SALE_SHORTCUT_ACTIONS.WHOLESALE:
        toggleSaleWholesale();
        return true;
      case SALE_SHORTCUT_ACTIONS.SUBMIT_PRINT:
      case SALE_SHORTCUT_ACTIONS.SUBMIT_SALE: {
        if (!saleShift?.id) {
          showSaleWorkbenchFromShortcut("catalog");
          toast("Abre la caja web antes de cobrar.");
          return true;
        }
        if (!saleAccess.canCreateSale || !saleCart.length) {
          setSaleStage("catalog", true);
          toast("Agrega productos antes de cobrar.");
          return true;
        }
        if (!$("salePriceVerifier").classList.contains("oculto")) closeSalePriceVerifier();
        if (saleStage !== "checkout") {
          showSaleWorkbenchFromShortcut("checkout");
          return true;
        }
        if (!shortcut.repeat) submitSale(null, shortcut.action === SALE_SHORTCUT_ACTIONS.SUBMIT_PRINT);
        return true;
      }
      default:
        return false;
    }
  }

  window.__DCARELA_SALE_SHORTCUTS__ = Object.freeze({
    actions: SALE_SHORTCUT_ACTIONS,
    keys: Object.freeze(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Ctrl+P", "Ctrl+Enter", "Escape"]),
    isEditableTarget: saleShortcutEditableTarget,
    resolve: resolveSaleShortcut,
  });

  function handleSaleShortcut(event) {
    const shortcut = resolveSaleShortcut(event, saleShortcutRuntimeContext());
    if (!shortcut) return;
    event.preventDefault();
    event.stopPropagation();
    executeSaleShortcut(shortcut);
  }

  function calcularLineaVentaWeb(product, quantity) {
    const cantidad = Math.max(0, Number(quantity) || 0);
    const precio = numero(product.precioFinalCentavos);
    const tasa = Math.max(0, Math.min(1, Number(String(product.tasaItbis ?? "0").replace(",", ".")) || 0));
    const incluye = product.precioIncluyeItbis !== false && product.precioIncluyeItbis !== "0" && product.precioIncluyeItbis !== 0;
    let base = Math.round(precio * cantidad);
    let itbis = tasa > 0 ? Math.round(base * tasa) : 0;
    let total = base + itbis;
    if (incluye) {
      total = Math.round(precio * cantidad);
      base = tasa > 0 ? Math.round(total / (1 + tasa)) : total;
      itbis = total - base;
    }
    return { base, itbis, total };
  }

  async function cuentasCobroVentaWeb() {
    const { data, error } = await sb.from("fin_cuentas")
      .select("id,nombre,tipo,estado,oculta")
      .eq("business_id", BUSINESS)
      .eq("estado", "activa")
      .eq("oculta", false)
      .order("orden")
      .order("nombre");
    if (error) throw error;
    return (data || []).filter(account => ["banco", "tarjeta_debito", "ahorro"].includes(account.tipo));
  }

  async function abrirVentaWeb() {
    const [{ products }, clients, accounts] = await Promise.all([
      cargarCatalogoCloud(),
      cargarClientesCloud(),
      cuentasCobroVentaWeb().catch(() => []),
    ]);
    const available = products.filter(product => product.activo && numero(product.precioFinalCentavos) > 0);
    const byId = new Map(available.map(product => [product.id, product]));
    const draft = new Map();
    const optionClients = clients.filter(client => client.activo).map(client =>
      `<option value="${esc(client.id)}">${esc(client.nombre)}${client.telefono ? ` | ${esc(client.telefono)}` : ""}</option>`
    ).join("");
    const optionAccounts = accounts.map(account => `<option value="${esc(account.id)}">${esc(account.nombre)}</option>`).join("");

    abrirEditor("Nueva venta web", "Factura desde el panel con precios validados en la nube. Se replica en todas las terminales sin intervenir el turno fisico abierto.", `
      <section class="web-sale-picker field-wide">
        <label><span>Buscar producto, combo o codigo</span><input id="webSaleSearch" type="search" autocomplete="off" placeholder="Empieza a escribir..."></label>
        <div id="webSaleResults" class="web-sale-results"></div>
      </section>
      <section class="web-sale-cart field-wide">
        <div class="web-sale-cart-title"><div><strong>Detalle de la factura</strong><small id="webSaleLineCount">0 productos</small></div><strong id="webSaleTotal">RD$0.00</strong></div>
        <div id="webSaleCart" class="web-sale-cart-body"><div class="empty-state">Busca un producto y agregalo a la factura.</div></div>
      </section>
      <label><span>Cliente</span><select name="clienteId"><option value="">Consumidor final</option>${optionClients}</select></label>
      <label><span>Forma de pago</span><select id="webSaleMethod" name="metodo"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="cheque">Cheque</option><option value="credito">Credito</option><option value="mixto">Mixto</option></select></label>
      <label id="webSaleAccountField" class="oculto"><span>Cuenta que recibe</span><select name="cuentaFinancieraId"><option value="">Selecciona la cuenta</option>${optionAccounts}</select></label>
      <label id="webSaleCashField"><span>Efectivo recibido</span><input name="pagoCon" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Monto entregado"></label>
      <section id="webSaleMixed" class="web-sale-mixed field-wide oculto">
        <div class="surface-title"><div><strong>Distribucion del pago</strong><p>La suma debe coincidir exactamente con la factura.</p></div><button id="webSaleFillCash" class="secondary" type="button">Completar en efectivo</button></div>
        <div class="web-sale-mixed-grid">
          <label><span>Efectivo</span><input data-web-payment="efectivo" type="number" min="0" step="0.01" value="0"></label>
          <label><span>Transferencia</span><input data-web-payment="transferencia" type="number" min="0" step="0.01" value="0"></label>
          <label><span>Tarjeta</span><input data-web-payment="tarjeta" type="number" min="0" step="0.01" value="0"></label>
          <label><span>Credito</span><input data-web-payment="credito" type="number" min="0" step="0.01" value="0"></label>
        </div>
        <p id="webSalePaymentState" class="sync-note">Distribuido: RD$0.00</p>
      </section>
      <label class="field-wide"><span>Referencia de tarjeta, transferencia o cheque</span><input name="referencia" maxlength="180"></label>
      <label class="field-wide"><span>Nota de la factura</span><textarea name="nota" rows="2" maxlength="1200"></textarea></label>`, async form => {
      if (!draft.size) throw new Error("Agrega al menos un producto.");
      const method = String(form.get("metodo") || "efectivo");
      const total = [...draft.values()].reduce((sum, line) => sum + calcularLineaVentaWeb(line.product, line.quantity).total, 0);
      let payments;
      if (method === "mixto") {
        payments = [...document.querySelectorAll("[data-web-payment]")].map(input => ({
          metodo: input.dataset.webPayment,
          montoCentavos: centavosInput(input.value || "0"),
        })).filter(payment => payment.montoCentavos > 0);
        if (payments.reduce((sum, payment) => sum + payment.montoCentavos, 0) !== total) {
          throw new Error("La distribucion del pago no coincide con el total de la factura.");
        }
      } else payments = [{ metodo: method, montoCentavos: total }];
      const cashAmount = payments.filter(payment => payment.metodo === "efectivo").reduce((sum, payment) => sum + payment.montoCentavos, 0);
      const cashText = String(form.get("pagoCon") || "").trim();
      const cashReceived = cashAmount > 0 ? (cashText ? centavosInput(cashText) : cashAmount) : null;
      const result = await adminWrite("sale.create", null, {
        lineas: [...draft.values()].map(line => ({ productoId: line.product.id, cantidad: String(line.quantity) })),
        clienteId: form.get("clienteId") || null,
        pagos: payments,
        cuentaFinancieraId: form.get("cuentaFinancieraId") || null,
        pagoConCentavos: cashReceived,
        referencia: form.get("referencia"),
        nota: form.get("nota"),
      });
      cerrarEditor();
      const today = inputDate(new Date());
      $("venDesde").value = today;
      $("venHasta").value = today;
      await cargarVentas();
      toast(result.message || "Venta web registrada.");
    }, "Cobrar y sincronizar", true);

    const search = $("webSaleSearch");
    const results = $("webSaleResults");
    const cart = $("webSaleCart");
    const totalLabel = $("webSaleTotal");
    const lineCount = $("webSaleLineCount");
    const methodSelect = $("webSaleMethod");
    const mixed = $("webSaleMixed");
    const accountField = $("webSaleAccountField");
    const cashField = $("webSaleCashField");

    const totalDraft = () => [...draft.values()].reduce((sum, line) => sum + calcularLineaVentaWeb(line.product, line.quantity).total, 0);
    const renderPaymentState = () => {
      const distributed = [...document.querySelectorAll("[data-web-payment]")]
        .reduce((sum, input) => sum + centavosInput(input.value || "0"), 0);
      const total = totalDraft();
      $("webSalePaymentState").textContent = `Distribuido: ${money(distributed)} | pendiente: ${money(total - distributed)}`;
      const transferAmount = centavosInput(document.querySelector('[data-web-payment="transferencia"]')?.value || "0");
      accountField.classList.toggle("oculto", methodSelect.value !== "transferencia" && !(methodSelect.value === "mixto" && transferAmount > 0));
    };
    const updatePaymentMode = () => {
      const isMixed = methodSelect.value === "mixto";
      mixed.classList.toggle("oculto", !isMixed);
      cashField.classList.toggle("oculto", !["efectivo", "mixto"].includes(methodSelect.value));
      accountField.classList.toggle("oculto", methodSelect.value !== "transferencia");
      if (isMixed) renderPaymentState();
    };
    const renderCart = () => {
      const lines = [...draft.values()];
      const total = totalDraft();
      totalLabel.textContent = money(total);
      lineCount.textContent = `${lines.length} producto${lines.length === 1 ? "" : "s"}`;
      cart.innerHTML = lines.length ? lines.map(line => {
        const amount = calcularLineaVentaWeb(line.product, line.quantity).total;
        return `<div class="web-sale-cart-row"><div><strong>${esc(line.product.nombre)}</strong><small>${money(line.product.precioFinalCentavos)} por ${esc(line.product.unidadMedida || "unidad")}</small></div><input data-web-qty="${esc(line.product.id)}" type="number" min="0.001" step="0.001" value="${esc(line.quantity)}" aria-label="Cantidad de ${esc(line.product.nombre)}"><strong>${money(amount)}</strong><button class="icon-button" data-web-remove="${esc(line.product.id)}" type="button" aria-label="Quitar">&#215;</button></div>`;
      }).join("") : '<div class="empty-state">Busca un producto y agregalo a la factura.</div>';
      cart.querySelectorAll("[data-web-qty]").forEach(input => input.addEventListener("change", () => {
        const line = draft.get(input.dataset.webQty);
        const quantity = Number(String(input.value).replace(",", "."));
        if (!line || !Number.isFinite(quantity) || quantity <= 0) return;
        line.quantity = Math.round(quantity * 1000) / 1000;
        renderCart();
      }));
      cart.querySelectorAll("[data-web-remove]").forEach(button => button.addEventListener("click", () => {
        draft.delete(button.dataset.webRemove);
        renderCart();
      }));
      if (methodSelect.value === "mixto") renderPaymentState();
    };
    const renderResults = () => {
      const query = normalizedKey(search.value);
      const matches = available.filter(product => !query || normalizedKey(`${product.nombre} ${product.codigoBarras || ""} ${product.tipo || ""}`).includes(query)).slice(0, 12);
      results.innerHTML = matches.length ? matches.map(product => `<button type="button" data-web-add="${esc(product.id)}"><span><strong>${esc(product.nombre)}</strong><small>${esc(product.codigoBarras || product.tipo || "producto")}</small></span><b>${money(product.precioFinalCentavos)}</b></button>`).join("") : '<div class="empty-state">No hay coincidencias.</div>';
      results.querySelectorAll("[data-web-add]").forEach(button => button.addEventListener("click", () => {
        const product = byId.get(button.dataset.webAdd);
        const existing = draft.get(product.id);
        draft.set(product.id, { product, quantity: (existing?.quantity || 0) + 1 });
        search.value = "";
        renderCart();
        renderResults();
        search.focus();
      }));
    };

    search.addEventListener("input", renderResults);
    methodSelect.addEventListener("change", updatePaymentMode);
    document.querySelectorAll("[data-web-payment]").forEach(input => input.addEventListener("input", renderPaymentState));
    $("webSaleFillCash").addEventListener("click", () => {
      const other = [...document.querySelectorAll("[data-web-payment]")]
        .filter(input => input.dataset.webPayment !== "efectivo")
        .reduce((sum, input) => sum + centavosInput(input.value || "0"), 0);
      document.querySelector('[data-web-payment="efectivo"]').value = pesoInput(Math.max(0, totalDraft() - other));
      renderPaymentState();
    });
    renderResults();
    renderCart();
    updatePaymentMode();
  }

  async function cargarVentas() {
    if (!$("venDesde").value) {
      $("venDesde").value = inputDate(new Date(Date.now() - 30 * 86400000));
      $("venHasta").value = inputDate(new Date());
    }
    const from = inicioDia($("venDesde").value);
    const to = finDia($("venHasta").value);
    const extendedFrom = new Date(new Date(from).getTime() - 86400000).toISOString();
    const queryTo = to;
    // Una sola lectura acotada alimenta ventas, anulaciones y turnos. Antes
    // esta vista podía disparar tres consultas de 5,000 documentos cada una.
    let sourceEvents = await eventos(null, extendedFrom, queryTo, 5000);
    // Al consultar un periodo historico, añade únicamente las anulaciones
    // posteriores; así no oculta ventas anuladas después ni relee el historial
    // completo durante la vista cotidiana.
    if (new Date(to).getTime() < Date.now()) {
      const laterCancellations = await eventos(["VentaCancelada"], to, new Date().toISOString(), 1600);
      sourceEvents = [...sourceEvents, ...laterCancellations];
    }
    const { active, excluded } = await ventasActivas(from, to, 1600, sourceEvents);
    const turnos = await turnosDelRango(from, to, active, sourceEvents);
    const turnosPorId = new Map(turnos.map(turno => [turno.id, turno]));
    const total = active.reduce((sum, event) => sum + totalDe(P(event)), 0);
    const tax = active.reduce((sum, event) => sum + itbisDe(P(event)), 0);
    $("ventasResumen").innerHTML = metric("Ventas validas", String(active.length)) + metric("Total", money(total)) + metric("ITBIS", money(tax)) + metric("Anuladas excluidas", String(excluded));
    if (!active.length) {
      $("ventasTabla").innerHTML = '<div class="empty-state">Sin ventas validas en ese rango.</div>';
      return;
    }
    const rows = active.map((event, index) => {
      const payload = P(event);
      const turnoId = identificadorTurno(event);
      const turno = turnosPorId.get(turnoId);
      const etiquetaTurno = turno?.inicio ? fecha(turno.inicio) : turnoId ? turnoId.slice(0, 8) : "Sin turno";
      const lines = lineasDe(payload).map(line => `${esc(line.nombre || "Producto")} x ${esc(line.cantidad ?? 1)} = ${money(line.importeFinalCentavos ?? line.importe_final_centavos)}`).join("<br>");
      const cuentasTransferencia = cuentasTransferenciaDe(payload);
      const referenciaPago = payload.referencia || (Array.isArray(payload.pagos)
        ? payload.pagos.map(pago => pago?.referencia).find(Boolean) : null);
      const saleId = event.entity_id || payload.ventaId || payload.venta_id;
      const sourceEventId = event.id || event.event_id || "";
      return `<tr><td>${esc(fecha(fechaEventoIso(event)))}</td><td>#${esc(payload.folio ?? "--")}</td><td>${esc(nombreCajero(payload, userCatalog))}</td><td><button class="turn-link" data-turno="${esc(turnoId)}">${esc(etiquetaTurno)}</button></td><td>${esc(metodoConCuentaDe(payload))}</td><td>${esc(payload.clienteNombre || "Consumidor final")}</td><td class="amount">${money(totalDe(payload))}</td><td><div class="button-row"><button class="secondary detail-toggle" data-detail="sale-${index}">Detalle</button>${saleAccess.canCancelSale && saleId ? `<button class="secondary" data-cancel-sale="${esc(saleId)}" data-cancel-event="${esc(sourceEventId)}" data-cancel-folio="${esc(payload.folio ?? "")}">Anular</button>` : ""}</div></td></tr>
        <tr id="sale-${index}" class="detail-row oculto"><td colspan="8"><div class="detail-box">${lines || "Sin lineas sincronizadas"}<br>Subtotal: ${money(payload.subtotalSinItbisCentavos)} | ITBIS: ${money(itbisDe(payload))} | Ajuste: ${money(payload.ajusteRedondeoCentavos)}${cuentasTransferencia.length ? `<br>Cuenta receptora: ${esc(cuentasTransferencia.join(" / "))}` : ""}${referenciaPago ? `<br>Referencia: ${esc(referenciaPago)}` : ""}${payload.nota ? `<br>Nota: ${esc(payload.nota)}` : ""}</div></td></tr>`;
    }).join("");
    $("ventasTabla").innerHTML = `<table><thead><tr><th>Fecha</th><th>Folio</th><th>Cajero</th><th>Turno</th><th>Metodo</th><th>Cliente</th><th class="amount">Total</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    document.querySelectorAll(".detail-toggle").forEach(button => button.addEventListener("click", () => $(button.dataset.detail).classList.toggle("oculto")));
    $("ventasTabla").querySelectorAll("[data-turno]").forEach(button => button.addEventListener("click", () => {
      sessionStorage.setItem("dcarela.turno.focus", button.dataset.turno);
      location.hash = "turnos";
    }));
    $("ventasTabla").querySelectorAll("[data-cancel-sale]").forEach(button => button.addEventListener("click", () => cancelSaleWeb(button.dataset.cancelSale, button.dataset.cancelFolio, button.dataset.cancelEvent || "")));
  }

  async function cargarCaja() {
    const types = ["CajaAbierta", "CajaCerrada", "EntradaEfectivo", "SalidaEfectivo", "CierreConDiferencia", "TurnoCambiado"];
    const items = await eventos(types, null, null, 500);
    const closings = items.filter(item => item.event_type === "CajaCerrada");
    const differences = items.filter(item => item.event_type === "CierreConDiferencia");
    const movements = items.filter(item => ["EntradaEfectivo", "SalidaEfectivo"].includes(item.event_type));
    const sobrantes = differences.filter(item => numero(P(item).diferenciaCentavos) > 0);
    const faltantes = differences.filter(item => numero(P(item).diferenciaCentavos) < 0);
    $("cajaResumen").innerHTML = metric("Cierres registrados", String(closings.length)) + metric("Diferencias", String(differences.length)) + metric("Sobrantes", String(sobrantes.length)) + metric("Faltantes", String(faltantes.length)) + metric("Movimientos", String(movements.length));
    $("cajaTabla").innerHTML = tabla(items, event => {
      const payload = P(event);
      const amount = numero(payload.montoCentavos, payload.efectivoAEntregarCentavos,
        payload.efectivoContadoCentavos, payload.montoAperturaCentavos);
      const diferencia = numero(payload.diferenciaCentavos);
      const diferenciaHtml = event.event_type.includes("Diferencia") || diferencia
        ? `<span class="${diferencia > 0 ? "difference-surplus" : diferencia < 0 ? "difference-bad" : "difference-ok"}">${esc(money(diferencia))}</span>`
        : "--";
      return [fecha(fechaEventoIso(event)), event.event_type, amount ? money(amount) : "--", payload.usuarioNombre || payload.cajeroNombre || "--", payload.motivo || payload.explicacion || payload.nota || "", diferenciaHtml];
    }, ["Fecha", "Evento", "Monto", "Usuario", "Motivo / nota", "Diferencia"]);
  }

  async function cargarReporte() {
    if (!$("repDesde").value) {
      $("repDesde").value = inputDate(new Date(Date.now() - 29 * 86400000));
      $("repHasta").value = inputDate(new Date());
    }
    const from = inicioDia($("repDesde").value);
    const to = finDia($("repHasta").value);
    const [{ active, excluded }, returns] = await Promise.all([
      ventasActivas(from, to, 50000),
      eventos(["DevolucionRegistrada"], from, to, 10000)
    ]);
    const gross = active.reduce((sum, event) => sum + totalDe(P(event)), 0);
    const refunds = returns.reduce((sum, event) => sum + montoDe(P(event)), 0);
    const net = gross - refunds;
    const tax = active.reduce((sum, event) => sum + itbisDe(P(event)), 0);
    const methods = {};
    const byDay = {};
    const products = {};
    active.forEach(event => {
      const payload = P(event);
      const payments = Array.isArray(payload.pagos) ? payload.pagos : [];
      if (payments.length) payments.forEach(payment => {
        const method = String(payment.metodo || "otro").toLowerCase();
        methods[method] = (methods[method] || 0) + numero(payment.montoCentavos, payment.monto_centavos);
      });
      else {
        const method = metodoDe(payload);
        methods[method] = (methods[method] || 0) + totalDe(payload);
      }
      const day = inputDate(new Date(fechaEventoIso(event)));
      byDay[day] ||= { sales: 0, total: 0, tax: 0, refunds: 0 };
      byDay[day].sales += 1;
      byDay[day].total += totalDe(payload);
      byDay[day].tax += itbisDe(payload);
      lineasDe(payload).forEach(line => {
        const name = line.nombre || "Sin nombre";
        products[name] = (products[name] || 0) + numero(line.importeFinalCentavos, line.importe_final_centavos);
      });
    });
    returns.forEach(event => {
      const day = inputDate(new Date(fechaEventoIso(event)));
      byDay[day] ||= { sales: 0, total: 0, tax: 0, refunds: 0 };
      byDay[day].refunds += montoDe(P(event));
    });
    const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
    const validRate = active.length + excluded > 0
      ? Math.floor(active.length * 100 / (active.length + excluded))
      : 100;
    const noRefundRate = gross > 0
      ? Math.max(0, Math.round((gross - refunds) * 100 / gross))
      : 100;
    $("repResumen").innerHTML = [
      ["Venta neta", money(net)], ["Ventas", String(active.length)],
      ["Promedio", money(active.length ? Math.round(gross / active.length) : 0)],
      ["ITBIS", money(tax)]
    ].map(([label, value]) => `<div class="metric-item"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>rango seleccionado</small></div>`).join("")
      + waveMetric("Ventas validas", `${validRate}%`, `${excluded} anulada(s)`, days.map(([, value]) => value.sales))
      + waveMetric("Neto sin devolucion", `${noRefundRate}%`, `${money(refunds)} devuelto`, days.map(([, value]) => value.total - value.refunds));
    lastReportExport = {
      desde: $("repDesde").value, hasta: $("repHasta").value,
      ventas: active.length, anuladas: excluded, bruto: gross, devoluciones: refunds,
      neto: net, itbis: tax, dias: days,
      metodos: Object.entries(methods).sort((a, b) => b[1] - a[1]),
      productos: Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 50)
    };
    $("repGrafica").innerHTML = days.length ? reportWaveChart(days) : '<div class="empty-state">Sin datos para graficar.</div>';
    $("repGrafica").querySelectorAll("[data-report-day]").forEach(button => {
      const abrirDia = () => {
        const day = button.dataset.reportDay;
        $("venDesde").value = day;
        $("venHasta").value = day;
        location.hash = "#ventas";
        cargarVentas().catch(error => mostrarError("ventas", error));
      };
      button.addEventListener("click", abrirDia);
      button.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        abrirDia();
      });
    });
    $("repMetodos").innerHTML = tablaSimple(Object.entries(methods).sort((a, b) => b[1] - a[1]), ["Metodo", "Total"], value => money(value));
    $("repPorDia").innerHTML = tabla(days, ([day, value]) => [fechaCorta(`${day}T12:00:00`), value.sales, money(value.total), money(value.tax), money(value.refunds), money(value.total - value.refunds)], ["Dia", "Ventas", "Bruto", "ITBIS", "Devuelto", "Neto"]);
    $("repTop").innerHTML = tablaSimple(Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 20), ["Producto", "Importe"], value => money(value));
  }

  async function cargarInventario() {
    const { products, categories, combos } = await cargarCatalogoCloud();
    const query = $("invBuscar").value.trim().toLowerCase();
    const categoryNames = new Map();
    categories.forEach(category => (category._ids || [category.id]).forEach(id => categoryNames.set(id, category.nombre)));
    const visible = products.filter(product => {
      if (!query) return true;
      return [product.nombre, product.codigoBarras, categoryNames.get(product.categoriaId), product.tipo]
        .some(value => String(value || "").toLowerCase().includes(query));
    });
    const low = products.filter(product => product.activo && product.usaInventario && numero(product.stock) <= numero(product.stockMinimo)).length;
    $("invResumen").innerHTML = metric("Productos", String(products.length)) + metric("Activos", String(products.filter(item => item.activo).length)) + metric("Stock bajo", String(low)) + metric("Combos", String(products.filter(item => item.tipo === "combo").length));
    const byId = new Map(products.map(product => [product.id, product]));
    const headers = ["Codigo", "Producto", "Categoria", "Precio", "Costo", "Stock", "Componentes", "Estado"];
    if (canEdit) headers.push("Acciones");
    $("invTabla").innerHTML = tabla(visible, product => {
      const combo = combos.get(product.id);
      const componentSummary = product.tipo === "combo"
        ? (combo?.componentes || []).slice(0, 3).map(component => {
            const detail = byId.get(component.productoId);
            return `${component.cantidad || 1} x ${detail?.nombre || component.productoId}`;
          }).join("; ")
        : "";
      const row = [
        esc(product.codigoBarras || "--"), `<strong>${esc(product.nombre)}</strong><span class="sync-note">${esc(product.tipo || "producto")}</span>`,
        esc(categoryNames.get(product.categoriaId) || "Sin categoria"), money(product.precioFinalCentavos), money(product.costoCentavos),
        product.usaInventario ? esc(product.stock ?? "0") : "No aplica",
        product.tipo === "combo" ? `<button class="table-action combo-detail" data-combo-product="${esc(product.id)}">${(combo?.componentes || []).length} componente(s)</button><span class="sync-note">${esc(componentSummary || "Sin detalle sincronizado")}</span>` : "--",
        `<span class="tag ${product.activo ? "ok" : "bad"}">${product.activo ? "Activo" : "Inactivo"}</span>`
      ];
      if (canEdit) row.push(`<div class="row-actions"><button class="table-action" data-edit-product="${esc(product.id)}">Editar</button>${product.tipo === "combo" ? `<button class="table-action" data-combo-product="${esc(product.id)}">Componentes</button>` : ""}${product.usaInventario ? `<button class="table-action" data-stock-product="${esc(product.id)}">Existencia</button>` : ""}${product.activo ? `<button class="table-action danger" data-delete-product="${esc(product.id)}">Eliminar</button>` : ""}</div>`);
      return row;
    }, headers);
    $("invTabla").querySelectorAll("[data-edit-product]").forEach(button => button.addEventListener("click", () => abrirProducto(products.find(item => item.id === button.dataset.editProduct))));
    $("invTabla").querySelectorAll("[data-stock-product]").forEach(button => button.addEventListener("click", () => abrirInventario(products.find(item => item.id === button.dataset.stockProduct))));
    $("invTabla").querySelectorAll("[data-combo-product]").forEach(button => button.addEventListener("click", () => abrirComponentesCombo(products.find(item => item.id === button.dataset.comboProduct))));
    $("invTabla").querySelectorAll("[data-delete-product]").forEach(button => button.addEventListener("click", () => confirmarEliminarProducto(products.find(item => item.id === button.dataset.deleteProduct))));
  }

  function confirmarEliminarProducto(product) {
    if (!product) return;
    abrirEditor("Eliminar producto", "Se ocultara de venta e inventario, pero sus ventas, auditoria y reportes se conservaran.", `
      <div class="field-wide confirm-panel"><strong>${esc(product.nombre)}</strong><p>Esta accion se sincronizara con todas las terminales. Podras reactivarlo editando el producto.</p></div>`, async () => {
      await adminWrite("product.upsert", product.id, { ...product, productoId: product.id, activo: false });
      cerrarEditor();
      await cargarCatalogoCloud(true);
      await cargarInventario();
    });
  }

  async function abrirComponentesCombo(combo) {
    if (!combo) return;
    const { products, combos } = await cargarCatalogoCloud();
    const candidates = products.filter(item => item.activo && item.id !== combo.id);
    const current = combos.get(combo.id)?.componentes || [];
    const optionHtml = selectedId => candidates.map(item => `<option value="${esc(item.id)}"${selected(item.id, selectedId)}>${esc(item.nombre)} | ${money(item.costoCentavos)}</option>`).join("");
    const rowHtml = component => `<div class="combo-component-row"><select name="componente" required><option value="">Selecciona el componente</option>${optionHtml(component?.productoId)}</select><input name="cantidad" type="number" min="0.001" step="0.001" value="${esc(component?.cantidad || 1)}" required><button type="button" class="icon-button combo-remove" aria-label="Quitar componente">&#215;</button></div>`;
    abrirEditor(`Componentes | ${combo.nombre}`, "Cada cantidad se descuenta al vender el combo y el costo se calcula desde sus componentes.", `
      <div id="comboRows" class="field-wide combo-editor">${current.map(rowHtml).join("") || rowHtml(null)}</div>
      <div class="field-wide combo-footer"><button id="btnAddComboRow" class="secondary" type="button">Agregar componente</button><strong id="comboCostPreview">Costo calculado: RD$0.00</strong></div>`, async () => {
      const rows = [...document.querySelectorAll("#comboRows .combo-component-row")];
      const componentes = rows.map(row => ({ productoId: row.querySelector("select").value, cantidad: decimalInput(row.querySelector("input").value) })).filter(item => item.productoId);
      if (!componentes.length) throw new Error("Agrega al menos un componente.");
      const costoCentavos = componentes.reduce((sum, component) => {
        const product = candidates.find(item => item.id === component.productoId);
        return sum + Math.round(numero(product?.costoCentavos) * Number(component.cantidad));
      }, 0);
      await adminWrite("combo.components.set", combo.id, { comboId: combo.id, nombre: combo.nombre, componentes, costoCentavos });
      cerrarEditor();
      await cargarCatalogoCloud(true);
      await cargarInventario();
    });
    const updateCost = () => {
      const total = [...document.querySelectorAll("#comboRows .combo-component-row")].reduce((sum, row) => {
        const product = candidates.find(item => item.id === row.querySelector("select").value);
        return sum + numero(product?.costoCentavos) * numero(row.querySelector("input").value);
      }, 0);
      $("comboCostPreview").textContent = `Costo calculado: ${money(Math.round(total))}`;
    };
    const wireRows = () => document.querySelectorAll("#comboRows .combo-component-row").forEach(row => {
      row.querySelectorAll("select,input").forEach(input => input.addEventListener("input", updateCost));
      row.querySelector(".combo-remove").addEventListener("click", () => { row.remove(); updateCost(); });
    });
    $("btnAddComboRow").addEventListener("click", () => { $("comboRows").insertAdjacentHTML("beforeend", rowHtml(null)); wireRows(); updateCost(); });
    wireRows();
    updateCost();
  }

  async function abrirProducto(product = null) {
    const { categories } = await cargarCatalogoCloud();
    const item = product || { tipo: "producto", precioIncluyeItbis: true, tasaItbis: "0.18", usaInventario: true, activo: true, unidadMedida: "unidad", stock: "0", stockMinimo: "0", stockMaximo: "0" };
    const categoryOptions = `<option value="">Sin categoria</option>` + categories.map(category => `<option value="${esc(category.id)}"${(category._ids || [category.id]).includes(item.categoriaId) ? " selected" : ""}>${esc(category.nombre)}</option>`).join("");
    abrirEditor(product ? "Editar producto" : "Nuevo producto", "Precios, impuestos y catalogo se replicaran en todas las cajas.", `
      <label class="field-wide"><span>Nombre</span><input name="nombre" required maxlength="180" value="${esc(item.nombre || "")}"></label>
      <label><span>Codigo de barras</span><input name="codigoBarras" maxlength="100" value="${esc(item.codigoBarras || "")}"></label>
      <label><span>Categoria</span><select name="categoriaId">${categoryOptions}</select></label>
      <label><span>Tipo</span><select name="tipo"><option value="producto"${selected(item.tipo, "producto")}>Producto</option><option value="servicio"${selected(item.tipo, "servicio")}>Servicio</option><option value="combo"${selected(item.tipo, "combo")}>Combo</option></select></label>
      <label><span>Unidad</span><select name="unidadMedida">${["unidad","libra","onza","kilogramo","gramo","litro","mililitro","metro","pie"].map(unit => `<option value="${unit}"${selected(item.unidadMedida, unit)}>${unit}</option>`).join("")}</select></label>
      <label><span>Precio publico (RD$)</span><input name="precio" type="number" min="0" step="0.01" required value="${pesoInput(item.precioFinalCentavos)}"></label>
      <label><span>Precio mayoreo (RD$)</span><input name="mayoreo" type="number" min="0" step="0.01" value="${pesoInput(item.precioMayoreoCentavos)}"></label>
      <label><span>Costo (RD$)</span><input name="costo" type="number" min="0" step="0.01" value="${pesoInput(item.costoCentavos)}"></label>
      <label><span>Tasa ITBIS</span><input name="tasaItbis" type="number" min="0" max="1" step="0.01" value="${esc(item.tasaItbis ?? "0.18")}"></label>
      ${product ? `<label><span>Existencia actual</span><input value="${esc(item.stock ?? "0")}" disabled></label>` : `<label><span>Existencia inicial</span><input name="stock" type="number" min="0" step="0.001" value="${esc(item.stock ?? "0")}"></label>`}
      <label><span>Stock minimo</span><input name="stockMinimo" type="number" min="0" step="0.001" value="${esc(item.stockMinimo ?? "0")}"></label>
      <label><span>Stock maximo</span><input name="stockMaximo" type="number" min="0" step="0.001" value="${esc(item.stockMaximo ?? "0")}"></label>
      <label class="check-row"><input name="precioIncluyeItbis" type="checkbox"${checked(item.precioIncluyeItbis !== false)}><span>Precio incluye ITBIS</span></label>
      <label class="check-row"><input name="usaInventario" type="checkbox"${checked(item.usaInventario)}><span>Maneja inventario</span></label>
      <label class="check-row"><input name="ventaGranel" type="checkbox"${checked(item.ventaGranel)}><span>Permite venta a granel</span></label>
      <label class="check-row"><input name="activo" type="checkbox"${checked(item.activo !== false)}><span>Producto activo</span></label>`, async form => {
      const data = {
        productoId: product?.id || null,
        nombre: form.get("nombre"), codigoBarras: form.get("codigoBarras"), categoriaId: form.get("categoriaId"),
        tipo: form.get("tipo"), unidadMedida: form.get("unidadMedida"),
        precioFinalCentavos: centavosInput(form.get("precio")), precioMayoreoCentavos: centavosInput(form.get("mayoreo") || 0),
        costoCentavos: centavosInput(form.get("costo") || 0), tasaItbis: decimalInput(form.get("tasaItbis") || 0),
        stock: product ? String(product.stock ?? "0") : decimalInput(form.get("stock") || 0),
        stockMinimo: decimalInput(form.get("stockMinimo") || 0), stockMaximo: decimalInput(form.get("stockMaximo") || 0),
        precioIncluyeItbis: form.has("precioIncluyeItbis"), usaInventario: form.has("usaInventario"),
        ventaGranel: form.has("ventaGranel"), activo: form.has("activo")
      };
      await adminWrite("product.upsert", product?.id, data);
      cerrarEditor();
      await cargarCatalogoCloud(true);
      await cargarInventario();
    });
  }

  function abrirInventario(product) {
    if (!product) return;
    abrirEditor("Ajustar existencia", "El motivo es obligatorio y el ajuste quedara en kardex, auditoria y sincronizacion.", `
      <label class="field-wide"><span>Producto</span><input value="${esc(product.nombre)}" disabled></label>
      <label><span>Existencia actual</span><input value="${esc(product.stock ?? "0")}" disabled></label>
      <label><span>Nueva existencia</span><input name="cantidadNueva" type="number" min="0" step="0.001" required value="${esc(product.stock ?? "0")}"></label>
      <label class="field-wide"><span>Motivo del ajuste</span><textarea name="motivo" rows="3" maxlength="300" required placeholder="Ej.: conteo fisico, entrada o correccion"></textarea></label>`, async form => {
      await adminWrite("inventory.set", product.id, { productoId: product.id, nombre: product.nombre, cantidadNueva: decimalInput(form.get("cantidadNueva")), motivo: form.get("motivo") });
      cerrarEditor();
      await cargarCatalogoCloud(true);
      await cargarInventario();
    });
  }

  function abrirCategoria() {
    abrirEditor("Nueva categoria", "La categoria estara disponible en cada caja despues de sincronizar.", `<label class="field-wide"><span>Nombre</span><input name="nombre" required maxlength="120"></label>`, async form => {
      await adminWrite("category.upsert", null, { nombre: form.get("nombre") });
      cerrarEditor();
      await cargarCatalogoCloud(true);
      await cargarInventario();
    });
  }

  async function cargarClientes() {
    const clients = await cargarClientesCloud();
    const query = $("cliBuscar").value.trim().toLowerCase();
    const visible = clients.filter(client => !query || [client.nombre, client.telefono, client.rnc, client.email].some(value => String(value || "").toLowerCase().includes(query)));
    const debtors = clients.filter(client => numero(client.saldoCentavos) > 0);
    $("cliResumen").innerHTML = metric("Clientes", String(clients.length)) + metric("Activos", String(clients.filter(item => item.activo).length)) + metric("Con balance", String(debtors.length)) + metric("CxC informada", money(debtors.reduce((sum, item) => sum + numero(item.saldoCentavos), 0)));
    const headers = ["Cliente", "Telefono", "RNC", "Correo", "Limite", "Balance", "Estado"];
    if (canEdit) headers.push("Accion");
    $("cliTabla").innerHTML = tabla(visible, client => {
      const row = [`<strong>${esc(client.nombre)}</strong><span class="sync-note">Folio ${esc(client.folio || "--")}</span>`, esc(client.telefono || "--"), esc(client.rnc || "--"), esc(client.email || "--"), money(client.limiteCreditoCentavos), money(client.saldoCentavos), `<span class="tag ${client.activo ? "ok" : "bad"}">${client.activo ? "Activo" : "Inactivo"}</span>`];
      if (canEdit) row.push(`<button class="table-action" data-edit-client="${esc(client.id)}">Editar</button>`);
      return row;
    }, headers);
    $("cliTabla").querySelectorAll("[data-edit-client]").forEach(button => button.addEventListener("click", () => abrirCliente(clients.find(item => item.id === button.dataset.editClient))));
  }

  function abrirCliente(client = null) {
    const item = client || { activo: true, diasCredito: 0 };
    abrirEditor(client ? "Editar cliente" : "Nuevo cliente", "Los saldos no se editan aqui; se conservan mediante ventas, devoluciones y abonos.", `
      <label class="field-wide"><span>Nombre</span><input name="nombre" required maxlength="180" value="${esc(item.nombre || "")}"></label>
      <label><span>Telefono</span><input name="telefono" maxlength="80" value="${esc(item.telefono || "")}"></label>
      <label><span>Correo</span><input name="email" type="email" maxlength="180" value="${esc(item.email || "")}"></label>
      <label><span>RNC / documento</span><input name="rnc" maxlength="80" value="${esc(item.rnc || "")}"></label>
      <label><span>Limite de credito (RD$)</span><input name="limite" type="number" min="0" step="0.01" value="${pesoInput(item.limiteCreditoCentavos)}"></label>
      <label><span>Dias de credito</span><input name="diasCredito" type="number" min="0" max="3650" step="1" value="${esc(item.diasCredito || 0)}"></label>
      <label class="field-wide"><span>Direccion</span><input name="direccion" maxlength="500" value="${esc(item.direccion || "")}"></label>
      <label><span>Red social</span><input name="redSocial" maxlength="180" value="${esc(item.redSocial || "")}"></label>
      <label><span>Persona cercana</span><input name="personaCercanaNombre" maxlength="180" value="${esc(item.personaCercanaNombre || "")}"></label>
      <label><span>Telefono persona cercana</span><input name="personaCercanaTelefono" maxlength="80" value="${esc(item.personaCercanaTelefono || "")}"></label>
      <label class="field-wide"><span>Notas</span><textarea name="notas" rows="3" maxlength="1200">${esc(item.notas || "")}</textarea></label>
      <label class="check-row field-wide"><input name="activo" type="checkbox"${checked(item.activo !== false)}><span>Cliente activo</span></label>`, async form => {
      await adminWrite("client.upsert", client?.id, {
        clienteId: client?.id || null, nombre: form.get("nombre"), telefono: form.get("telefono"), email: form.get("email"),
        rnc: form.get("rnc"), limiteCreditoCentavos: centavosInput(form.get("limite") || 0), diasCredito: Number(form.get("diasCredito") || 0),
        direccion: form.get("direccion"), redSocial: form.get("redSocial"), personaCercanaNombre: form.get("personaCercanaNombre"),
        personaCercanaTelefono: form.get("personaCercanaTelefono"), notas: form.get("notas"), activo: form.has("activo"), folio: client?.folio || null
      });
      cerrarEditor();
      await cargarClientesCloud(true);
      await cargarClientes();
    });
  }

  const COST_EVENTS = [
    "CategoriaGastoCreada", "GastoRegistrado", "GastoEditado", "GastoEliminado", "GastoAnulado",
    "GastoCategoriaActualizada", "CostoRecurrenteGuardado", "CostoRecurrenteDesactivado",
    "CostoObligacionGenerada", "CostoObligacionGuardada", "CostoObligacionAnulada",
    "CostoPagoRegistrado", "CostoDocumentoAdjuntado", "ReciboPagoEmitido",
    "ReciboPagoFirmaActualizada", "ReciboPagoAnulado"
  ];

  const localDateTimeInput = value => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  const dateOnly = value => {
    if (!value) return "";
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : inputDate(date);
  };
  const monthOf = value => dateOnly(value).slice(0, 7);
  const todayKey = () => inputDate(new Date());
  const statusCost = item => {
    if (item.estado === "anulada" || item._stateEvent === "CostoObligacionAnulada") return "anulada";
    if (numero(item.saldoCentavos) <= 0 || item.estado === "pagada") return "pagada";
    return dateOnly(item.venceEn) < todayKey() ? "vencida" : numero(item.saldoCentavos) < numero(item.montoCentavos) ? "parcial" : "pendiente";
  };

  function categoryOptions(categories, current) {
    return categories.map(item => `<option value="${esc(item.id)}"${selected(item.id, current)}>${esc(item.nombre)}</option>`).join("");
  }

  function methodOptions(current) {
    return [["efectivo", "Efectivo"], ["tarjeta", "Tarjeta"], ["transferencia", "Transferencia"], ["cheque", "Cheque"]]
      .map(([value, label]) => `<option value="${value}"${selected(value, current)}>${label}</option>`).join("");
  }

  async function cargarCostosCloud(force = false) {
    if (!force && costStateCache) return costStateCache;
    const items = await eventos(COST_EVENTS, null, null, 20000);
    const categoryEvents = items.filter(item => item.event_type === "CategoriaGastoCreada");
    const categories = consolidateNamed(mergeEvents(categoryEvents, ["CategoriaGastoCreada"]))
      .filter(item => item.nombre)
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
    const categoryMap = new Map(categories.map(item => [item.id, item.nombre]));

    const expenseEvents = items.filter(item => item.event_type.startsWith("Gasto"));
    const expenses = mergeEvents(expenseEvents,
      ["GastoRegistrado", "GastoEditado", "GastoEliminado", "GastoAnulado"])
      .filter(item => item.descripcion)
      .map(item => ({
        ...item,
        categoria: item.categoria || categoryMap.get(item.categoriaId) || "Sin categoria",
        activo: !["GastoEliminado", "GastoAnulado"].includes(item._stateEvent) && item.estado !== "anulado"
      }))
      .sort((a, b) => String(b.fecha || b._latestAt).localeCompare(String(a.fecha || a._latestAt)));

    const recurringEvents = items.filter(item => item.event_type.startsWith("CostoRecurrente"));
    const recurrents = mergeEvents(recurringEvents, ["CostoRecurrenteGuardado", "CostoRecurrenteDesactivado"])
      .filter(item => item.nombre)
      .map(item => ({
        ...item,
        categoria: item.categoria || categoryMap.get(item.categoriaId) || "Sin categoria",
        activo: item._stateEvent !== "CostoRecurrenteDesactivado" && item.activo !== false
      }))
      .sort((a, b) => String(a.proximaFecha || "").localeCompare(String(b.proximaFecha || "")));

    const obligationEvents = items.filter(item => ["CostoObligacionGenerada", "CostoObligacionGuardada", "CostoObligacionAnulada", "CostoDocumentoAdjuntado"].includes(item.event_type));
    const obligationStateAt = new Map();
    obligationEvents.forEach(event => {
      if (event.event_type === "CostoDocumentoAdjuntado") return;
      const id = String(event.entity_id || P(event).obligacionId || "");
      if (id && !obligationStateAt.has(id)) obligationStateAt.set(id, fechaEventoIso(event));
    });
    const obligations = mergeEvents(obligationEvents,
      ["CostoObligacionGenerada", "CostoObligacionGuardada", "CostoObligacionAnulada"])
      .filter(item => item.concepto)
      .map(item => ({ ...item, categoria: item.categoria || categoryMap.get(item.categoriaId) || "Sin categoria" }));
    const payments = items.filter(item => item.event_type === "CostoPagoRegistrado")
      .map(event => ({ id: event.entity_id, ...P(event), fecha: P(event).pagadoEn || fechaEventoIso(event) }))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const latestPayment = new Map();
    payments.forEach(payment => {
      if (payment.obligacionId && !latestPayment.has(payment.obligacionId)) latestPayment.set(payment.obligacionId, payment);
    });
    obligations.forEach(item => {
      const payment = latestPayment.get(item.id);
      if (payment && String(payment.fecha) > String(obligationStateAt.get(item.id) || "")) {
        item.saldoCentavos = payment.saldoCentavos;
        item.estado = payment.estado;
      }
      item.estado = statusCost(item);
    });
    obligations.sort((a, b) => {
      const rank = { vencida: 0, pendiente: 1, parcial: 2, pagada: 3, anulada: 4 };
      return (rank[a.estado] ?? 9) - (rank[b.estado] ?? 9)
        || String(a.venceEn || "").localeCompare(String(b.venceEn || ""));
    });

    const receiptEvents = items.filter(item => item.event_type.startsWith("ReciboPago"));
    const receipts = mergeEvents(receiptEvents,
      ["ReciboPagoEmitido", "ReciboPagoFirmaActualizada", "ReciboPagoAnulado"])
      .filter(item => item.beneficiario && item.concepto)
      .map(item => ({
        ...item,
        estado: item._stateEvent === "ReciboPagoAnulado" || item.estado === "anulado" ? "anulado" : "emitido",
        firmado: item._stateEvent === "ReciboPagoFirmaActualizada" ? item.firmado === true : item.firmado === true
      }))
      .sort((a, b) => String(b.pagadoEn || b.creadoEn || b._latestAt).localeCompare(String(a.pagadoEn || a.creadoEn || a._latestAt)));

    costStateCache = { categories, expenses, recurrents, obligations, payments, receipts };
    return costStateCache;
  }

  function setCostTab(tab) {
    const allowed = ["resumen", "movimientos", "cuentas", "presupuestos", "tarjetas", "compromisos", "recurrentes", "obligaciones", "recibos", "ajustes"];
    costTab = allowed.includes(tab) ? tab : "resumen";
    document.querySelectorAll("[data-cost-tab]").forEach(button => button.classList.toggle("act", button.dataset.costTab === costTab));
    $("provPanelResumen").classList.toggle("oculto", costTab !== "resumen");
    $("provPanelMovimientos").classList.toggle("oculto", costTab !== "movimientos");
    $("provPanelCuentas").classList.toggle("oculto", costTab !== "cuentas");
    $("provPanelPresupuestos").classList.toggle("oculto", costTab !== "presupuestos");
    $("provPanelTarjetas").classList.toggle("oculto", costTab !== "tarjetas");
    $("provPanelCompromisos").classList.toggle("oculto", costTab !== "compromisos");
    $("provPanelRecurrentes").classList.toggle("oculto", costTab !== "recurrentes");
    $("provPanelObligaciones").classList.toggle("oculto", costTab !== "obligaciones");
    $("provPanelRecibos").classList.toggle("oculto", costTab !== "recibos");
    $("provPanelAjustes").classList.toggle("oculto", costTab !== "ajustes");
  }

  function abrirGasto(state, expense = null) {
    if (!state.categories.length) { toast("Agrega primero una categoria de gasto."); return; }
    const item = expense || { metodoPago: "transferencia", fecha: new Date().toISOString(), activo: true };
    abrirEditor(expense ? "Editar gasto" : "Nuevo gasto", "El cambio quedara auditado y se sincronizara con todas las cajas.", `
      <label><span>Categoria</span><select name="categoriaId" required>${categoryOptions(state.categories, item.categoriaId)}</select></label>
      <label><span>Fecha</span><input name="fecha" type="datetime-local" required value="${esc(localDateTimeInput(item.fecha || item._latestAt))}"></label>
      <label class="field-wide"><span>Descripcion</span><input name="descripcion" required maxlength="500" value="${esc(item.descripcion || "")}"></label>
      <label><span>Monto (RD$)</span><input name="monto" type="number" min="0.01" step="0.01" required value="${pesoInput(item.montoCentavos)}"></label>
      <label><span>Metodo</span><select name="metodoPago">${methodOptions(item.metodoPago || item.metodo)}</select></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="3" maxlength="1200">${esc(item.nota || "")}</textarea></label>`, async form => {
      const category = state.categories.find(value => value.id === form.get("categoriaId"));
      await adminWrite("expense.upsert", expense?.id, {
        gastoId: expense?.id || null, categoriaId: form.get("categoriaId"), categoria: category?.nombre || null,
        descripcion: form.get("descripcion"), montoCentavos: centavosInput(form.get("monto")),
        metodoPago: form.get("metodoPago"), nota: form.get("nota"), fecha: form.get("fecha")
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function confirmarEliminarGasto(expense) {
    abrirEditor("Anular gasto", "El registro se conserva en auditoria y desaparece de los totales activos.", `
      <div class="confirm-panel field-wide"><strong>${esc(expense.descripcion)}</strong><p>${esc(expense.categoria)} | ${money(expense.montoCentavos)} | ${esc(fecha(expense.fecha || expense._latestAt))}</p></div>
      <label class="field-wide"><span>Motivo</span><textarea name="motivo" rows="3" maxlength="500" required></textarea></label>`, async form => {
      await adminWrite("expense.delete", expense.id, { gastoId: expense.id, descripcion: expense.descripcion, motivo: form.get("motivo") });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function abrirRecurrente(state, recurring = null) {
    if (!state.categories.length) { toast("Agrega primero una categoria de gasto."); return; }
    const item = recurring || { frecuencia: "mensual", metodoPago: "transferencia", proximaFecha: todayKey(), activo: true, diaMes1: 15, diaMes2: 30 };
    const frequencies = [["semanal", "Semanal"], ["quincenal", "Dos veces al mes"], ["mensual", "Mensual"], ["bimestral", "Cada 2 meses"], ["trimestral", "Trimestral"], ["semestral", "Semestral"], ["anual", "Anual"], ["personalizada", "Intervalo personalizado"]];
    abrirEditor(recurring ? "Editar costo recurrente" : "Nuevo costo recurrente", "Define nomina, alquiler, servicios, suscripciones u otros compromisos permanentes.", `
      <label><span>Categoria</span><select name="categoriaId" required>${categoryOptions(state.categories, item.categoriaId)}</select></label>
      <label><span>Frecuencia</span><select name="frecuencia">${frequencies.map(([value, label]) => `<option value="${value}"${selected(value, item.frecuencia)}>${label}</option>`).join("")}</select></label>
      <label class="field-wide"><span>Nombre del costo</span><input name="nombre" required maxlength="180" value="${esc(item.nombre || "")}"></label>
      <label><span>Acreedor / beneficiario</span><input name="acreedor" maxlength="180" value="${esc(item.acreedor || "")}"></label>
      <label><span>Monto estimado (RD$)</span><input name="monto" type="number" min="0" step="0.01" value="${pesoInput(item.montoEstimadoCentavos)}"></label>
      <label><span>Proximo vencimiento</span><input name="proximaFecha" type="date" required value="${esc(dateOnly(item.proximaFecha) || todayKey())}"></label>
      <label><span>Metodo habitual</span><select name="metodoPago">${methodOptions(item.metodoPago)}</select></label>
      <label><span>Primer dia del mes</span><input name="diaMes1" type="number" min="1" max="31" value="${esc(item.diaMes1 ?? 15)}"></label>
      <label><span>Segundo dia del mes</span><input name="diaMes2" type="number" min="1" max="31" value="${esc(item.diaMes2 ?? 30)}"></label>
      <label><span>Intervalo en dias</span><input name="intervaloDias" type="number" min="1" max="3650" value="${esc(item.intervaloDias || "")}"></label>
      <label class="field-wide"><span>Descripcion</span><input name="descripcion" maxlength="800" value="${esc(item.descripcion || "")}"></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="3" maxlength="1200">${esc(item.nota || "")}</textarea></label>
      <label class="check-row"><input name="montoVariable" type="checkbox"${checked(item.montoVariable)}><span>El monto puede variar</span></label>
      <label class="check-row"><input name="activo" type="checkbox"${checked(item.activo !== false)}><span>Plan activo</span></label>`, async form => {
      const category = state.categories.find(value => value.id === form.get("categoriaId"));
      await adminWrite("cost.recurring.upsert", recurring?.id, {
        recurrenteId: recurring?.id || null, categoriaId: form.get("categoriaId"), categoria: category?.nombre || null,
        nombre: form.get("nombre"), descripcion: form.get("descripcion"), acreedor: form.get("acreedor"),
        montoEstimadoCentavos: centavosInput(form.get("monto") || 0), montoVariable: form.has("montoVariable"),
        frecuencia: form.get("frecuencia"), intervaloDias: form.get("intervaloDias") || null,
        diaMes1: form.get("diaMes1") || null, diaMes2: form.get("diaMes2") || null,
        proximaFecha: form.get("proximaFecha"), metodoPago: form.get("metodoPago"),
        activo: form.has("activo"), nota: form.get("nota")
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function desactivarRecurrente(recurring) {
    abrirEditor("Desactivar costo recurrente", "Las facturas ya generadas se conservan; solo se detienen cargos futuros.", `
      <div class="confirm-panel field-wide"><strong>${esc(recurring.nombre)}</strong><p>${esc(recurring.frecuencia)} | ${money(recurring.montoEstimadoCentavos)}</p></div>`, async () => {
      await adminWrite("cost.recurring.upsert", recurring.id, { ...recurring, recurrenteId: recurring.id, activo: false });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  async function uploadCostDocument(obligationId, file) {
    if (!file || !file.size) return null;
    if (file.size > 12 * 1024 * 1024) throw new Error("El comprobante no puede superar 12 MB.");
    const data = new FormData();
    data.append("business_id", BUSINESS);
    data.append("obligation_id", obligationId);
    data.append("file", file, file.name);
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-cost-document`, {
      method: "POST", headers: await authenticatedHeaders(), body: data
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo respaldar el comprobante.");
    return result;
  }

  async function openCostDocument(obligation) {
    const direct = obligation.adjuntoUrl || obligation.adjuntoRuta;
    if (direct && /^https?:\/\//i.test(direct)) { window.open(direct, "_blank", "noopener"); return; }
    const storagePath = obligation.storagePath || direct;
    if (!storagePath) { toast("Esta factura no tiene un comprobante adjunto."); return; }
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-cost-document`, {
      method: "POST", headers: await authenticatedHeaders(true),
      body: JSON.stringify({ action: "sign", business_id: BUSINESS, storage_path: storagePath })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "No se pudo abrir el comprobante.");
    window.open(result.url, "_blank", "noopener");
  }

  function abrirObligacion(state, obligation = null) {
    if (!state.categories.length) { toast("Agrega primero una categoria de gasto."); return; }
    const item = obligation || { emitidaEn: todayKey(), venceEn: todayKey(), estado: "pendiente" };
    abrirEditor(obligation ? "Editar factura o deuda" : "Nueva factura o deuda", "Registra el documento, su fecha limite y el saldo que debe notificarse.", `
      <label><span>Categoria</span><select name="categoriaId" required>${categoryOptions(state.categories, item.categoriaId)}</select></label>
      <label><span>Acreedor / proveedor</span><input name="acreedor" maxlength="180" value="${esc(item.acreedor || "")}"></label>
      <label class="field-wide"><span>Concepto</span><input name="concepto" required maxlength="300" value="${esc(item.concepto || "")}"></label>
      <label><span>Numero de factura</span><input name="numeroFactura" maxlength="120" value="${esc(item.numeroFactura || "")}"></label>
      <label><span>Monto total (RD$)</span><input name="monto" type="number" min="0.01" step="0.01" required value="${pesoInput(item.montoCentavos)}"></label>
      <label><span>Fecha de factura</span><input name="emitidaEn" type="date" required value="${esc(dateOnly(item.emitidaEn) || todayKey())}"></label>
      <label><span>Fecha limite de pago</span><input name="venceEn" type="date" required value="${esc(dateOnly(item.venceEn) || todayKey())}"></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="3" maxlength="1200">${esc(item.nota || "")}</textarea></label>
      <label class="field-wide file-field"><span>Factura o comprobante</span><input name="archivo" type="file" accept="image/*,application/pdf" capture="environment"><small class="field-hint">Desde iPhone puedes tomar la foto o elegir un PDF. Maximo 12 MB; se guarda en Storage privado.</small></label>`, async form => {
      const category = state.categories.find(value => value.id === form.get("categoriaId"));
      const total = centavosInput(form.get("monto"));
      const paid = obligation ? Math.max(0, numero(obligation.montoCentavos) - numero(obligation.saldoCentavos)) : 0;
      if (total < paid) throw new Error(`El total no puede ser menor que lo ya pagado (${money(paid)}).`);
      const result = await adminWrite("cost.obligation.upsert", obligation?.id, {
        obligacionId: obligation?.id || null, recurrenteId: obligation?.recurrenteId || null,
        categoriaId: form.get("categoriaId"), categoria: category?.nombre || null,
        acreedor: form.get("acreedor"), concepto: form.get("concepto"), numeroFactura: form.get("numeroFactura"),
        montoCentavos: total, saldoCentavos: total - paid, emitidaEn: form.get("emitidaEn"),
        venceEn: form.get("venceEn"), estado: total === paid ? "pagada" : paid ? "parcial" : "pendiente",
        nota: form.get("nota"), periodoClave: obligation?.periodoClave || null
      });
      const id = result.event?.entity_id || obligation?.id;
      const file = form.get("archivo");
      if (id && file instanceof File && file.size) await uploadCostDocument(id, file);
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function pagarObligacion(obligation) {
    abrirEditor("Registrar pago", "El abono reduce el saldo y queda como movimiento inmutable.", `
      <div class="confirm-panel field-wide"><strong>${esc(obligation.concepto)}</strong><p>Saldo actual: ${money(obligation.saldoCentavos)}</p></div>
      <label><span>Monto del pago (RD$)</span><input name="monto" type="number" min="0.01" max="${pesoInput(obligation.saldoCentavos)}" step="0.01" required></label>
      <label><span>Metodo</span><select name="metodoPago">${methodOptions("transferencia")}</select></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="3" maxlength="1200"></textarea></label>`, async form => {
      const amount = centavosInput(form.get("monto"));
      if (amount <= 0 || amount > numero(obligation.saldoCentavos)) throw new Error("El pago debe ser mayor que cero y no superar el saldo.");
      await adminWrite("cost.payment.create", obligation.id, {
        obligacionId: obligation.id, concepto: obligation.concepto, montoCentavos: amount,
        saldoCentavos: numero(obligation.saldoCentavos) - amount, metodoPago: form.get("metodoPago"), nota: form.get("nota")
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function cancelarObligacion(obligation) {
    abrirEditor("Anular factura o deuda", "Solo se anula el saldo pendiente; los pagos registrados permanecen auditados.", `
      <div class="confirm-panel field-wide"><strong>${esc(obligation.concepto)}</strong><p>Saldo: ${money(obligation.saldoCentavos)} | vence ${esc(dateOnly(obligation.venceEn))}</p></div>`, async () => {
      await adminWrite("cost.obligation.cancel", obligation.id, { obligacionId: obligation.id, concepto: obligation.concepto });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function abrirReciboPago(state) {
    const hasCategories = state.categories.length > 0;
    abrirEditor("Nuevo recibo de pago", "Emite un comprobante para nomina, servicios u otros pagos y deja espacio para la firma del beneficiario.", `
      <label><span>Beneficiario</span><input name="beneficiario" required maxlength="180"></label>
      <label><span>Cedula / identificacion</span><input name="documentoIdentidad" maxlength="100"></label>
      <label class="field-wide"><span>Concepto del pago</span><input name="concepto" required maxlength="500"></label>
      <label><span>Monto (RD$)</span><input name="monto" type="number" min="0.01" step="0.01" required></label>
      <label><span>Fecha del pago</span><input name="pagadoEn" type="datetime-local" required value="${esc(localDateTimeInput())}"></label>
      <label><span>Metodo</span><select name="metodoPago">${methodOptions("transferencia")}</select></label>
      <label><span>Referencia</span><input name="referencia" maxlength="180"></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="3" maxlength="1200"></textarea></label>
      <label class="check-row field-wide"><input name="registrarGasto" type="checkbox"${hasCategories ? " checked" : ""}${hasCategories ? "" : " disabled"}><span>Registrar tambien como gasto</span></label>
      ${hasCategories ? `<label class="field-wide"><span>Categoria del gasto</span><select name="categoriaId">${categoryOptions(state.categories)}</select></label>` : `<p class="field-hint field-wide">Agrega una categoria para asociar este recibo a Gastos.</p>`}`, async form => {
      const amount = centavosInput(form.get("monto"));
      let gastoId = null;
      if (form.has("registrarGasto")) {
        const categoryId = form.get("categoriaId");
        const category = state.categories.find(value => value.id === categoryId);
        if (!category) throw new Error("Selecciona la categoria del gasto.");
        const expense = await adminWrite("expense.upsert", null, {
          categoriaId, categoria: category.nombre, descripcion: form.get("concepto"), montoCentavos: amount,
          metodoPago: form.get("metodoPago"), nota: `Recibo para ${form.get("beneficiario")}. ${form.get("nota") || ""}`.trim(),
          fecha: form.get("pagadoEn")
        });
        gastoId = expense.event?.entity_id || null;
      }
      await adminWrite("receipt.create", null, {
        beneficiario: form.get("beneficiario"), documentoIdentidad: form.get("documentoIdentidad"),
        concepto: form.get("concepto"), montoCentavos: amount, metodoPago: form.get("metodoPago"),
        referencia: form.get("referencia"), pagadoEn: form.get("pagadoEn"), gastoId, nota: form.get("nota")
      });
      cerrarEditor();
      costTab = "recibos";
      await cargarProveedores(true);
    });
  }

  async function imprimirReciboWeb(receipt) {
    const negocio = await cargarNegocioCloud();
    const popup = window.open("", "_blank", "width=520,height=760,noopener");
    if (!popup) throw new Error("El navegador bloqueo la ventana de impresion. Habilita ventanas emergentes para este panel.");
    const receiptLabel = receipt.numero > 0 ? String(receipt.numero).padStart(6, "0") : `WEB-${String(receipt.id).slice(0, 8).toUpperCase()}`;
    const logoUrl = new URL("dcarela-logo.png", window.location.href).href;
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo ${esc(receiptLabel)}</title><style>
      @page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;color:#000;font:15px/1.34 Arial,sans-serif}header{text-align:center;border-bottom:1px dashed #000;padding-bottom:7px}.logo{width:66px;height:66px;object-fit:contain;filter:grayscale(1) contrast(1.6)}h1{font-size:21px;margin:2px 0}.slogan{font-style:italic}.contact{font-size:13px;margin:2px 0}.title{text-align:center;font-size:20px;font-weight:800;margin:10px 0;border-block:2px solid #000;padding:5px}.row{display:grid;grid-template-columns:28mm 1fr;gap:4px;margin:5px 0}.amount{font-size:24px;font-weight:800;text-align:center;margin:10px 0}.sign{margin-top:36px;border-top:1px solid #000;text-align:center;padding-top:4px}.state{text-align:center;margin-top:16px;font-size:12px}@media print{button{display:none}}</style></head><body>
      <header>${negocio.logoActivo === false || negocio.logoActivo === "0" ? "" : `<img class="logo" src="${esc(logoUrl)}" alt="">`}<h1>${esc(negocio.nombre || "D' Carela Compufoto")}</h1><div>RNC ${esc(negocio.rnc || "")}</div><div class="slogan">${esc(negocio.slogan || "")}</div><div class="contact">${esc(negocio.direccion || "")}</div><div class="contact">WhatsApp ${esc(negocio.whatsapp || "")} | Tel. ${esc(negocio.telefono || "")}</div><div class="contact">IG ${esc(negocio.instagram || "")} | TikTok ${esc(negocio.tiktok || "")}</div></header>
      <div class="title">RECIBO DE PAGO</div><div class="row"><strong>Recibo</strong><span>${esc(receiptLabel)}</span></div><div class="row"><strong>Fecha</strong><span>${esc(fecha(receipt.pagadoEn || receipt.creadoEn || receipt._latestAt))}</span></div><div class="row"><strong>Recibi de</strong><span>${esc(negocio.nombre || "D' Carela Compufoto")}</span></div><div class="row"><strong>Beneficiario</strong><span>${esc(receipt.beneficiario)}</span></div>${receipt.documentoIdentidad ? `<div class="row"><strong>Identificacion</strong><span>${esc(receipt.documentoIdentidad)}</span></div>` : ""}<div class="row"><strong>Concepto</strong><span>${esc(receipt.concepto)}</span></div><div class="amount">${esc(money(receipt.montoCentavos))}</div><div class="row"><strong>Metodo</strong><span>${esc(receipt.metodoPago || "--")}</span></div>${receipt.referencia ? `<div class="row"><strong>Referencia</strong><span>${esc(receipt.referencia)}</span></div>` : ""}${receipt.nota ? `<div class="row"><strong>Nota</strong><span>${esc(receipt.nota)}</span></div>` : ""}<div class="sign">Firma de quien recibe</div><div class="sign">Administrador y Jefe de Operaciones</div><div class="state">${receipt.firmado ? "Firma verificada en el sistema" : "Pendiente de firma fisica"}</div><script>addEventListener('load',()=>setTimeout(()=>print(),250));<\/script></body></html>`);
    popup.document.close();
  }

  async function actualizarFirmaRecibo(receipt) {
    await adminWrite("receipt.signature", receipt.id, { reciboId: receipt.id, firmado: !receipt.firmado });
    await cargarProveedores(true);
  }

  function anularRecibo(receipt) {
    abrirEditor("Anular recibo de pago", "El recibo se conserva en auditoria y se anula en todas las terminales.", `
      <div class="confirm-panel field-wide"><strong>${esc(receipt.beneficiario)}</strong><p>${esc(receipt.concepto)} | ${money(receipt.montoCentavos)}</p></div>
      <label class="field-wide"><span>Motivo</span><textarea name="motivo" rows="3" maxlength="500" required></textarea></label>`, async form => {
      await adminWrite("receipt.cancel", receipt.id, { reciboId: receipt.id, beneficiario: receipt.beneficiario, motivo: form.get("motivo") });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function nextRecurringDate(plan, value) {
    const current = new Date(`${value}T12:00:00`);
    const validDay = (year, month, day) => new Date(year, month, Math.min(Math.max(1, Number(day) || 1), new Date(year, month + 1, 0).getDate()), 12);
    if (plan.frecuencia === "quincenal" && plan.diaMes1 && plan.diaMes2) {
      const first = Math.min(Number(plan.diaMes1), Number(plan.diaMes2));
      const second = Math.max(Number(plan.diaMes1), Number(plan.diaMes2));
      return inputDate(current.getDate() < second ? validDay(current.getFullYear(), current.getMonth(), second) : validDay(current.getFullYear(), current.getMonth() + 1, first));
    }
    if (plan.frecuencia === "semanal") current.setDate(current.getDate() + 7);
    else if (plan.frecuencia === "personalizada") current.setDate(current.getDate() + Math.max(1, Number(plan.intervaloDias) || 30));
    else {
      const months = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 }[plan.frecuencia] || 1;
      const day = current.getDate();
      current.setDate(1);
      current.setMonth(current.getMonth() + months);
      return inputDate(validDay(current.getFullYear(), current.getMonth(), day));
    }
    return inputDate(current);
  }

  async function generarObligacionesWeb() {
    const state = await cargarCostosCloud();
    const end = new Date();
    end.setMonth(end.getMonth() + 2, 0);
    const endKey = inputDate(end);
    const existing = new Set(state.obligations.map(item => item.periodoClave).filter(Boolean));
    let created = 0;
    for (const plan of state.recurrents.filter(item => item.activo)) {
      let due = dateOnly(plan.proximaFecha) || todayKey();
      let guard = 0;
      while (due <= endKey && guard++ < 48) {
        const period = `${plan.id}:${due}`;
        if (!existing.has(period)) {
          const deterministicId = `${plan.id}-${due}`.slice(0, 120);
          await adminWrite("cost.obligation.upsert", deterministicId, {
            obligacionId: deterministicId, recurrenteId: plan.id, categoriaId: plan.categoriaId,
            categoria: plan.categoria, acreedor: plan.acreedor, concepto: plan.nombre,
            montoCentavos: numero(plan.montoEstimadoCentavos), saldoCentavos: numero(plan.montoEstimadoCentavos),
            emitidaEn: due, venceEn: due, estado: "pendiente", nota: plan.nota,
            periodoClave: period, montoVariable: Boolean(plan.montoVariable)
          });
          existing.add(period);
          created++;
        }
        due = nextRecurringDate(plan, due);
      }
    }
    toast(created ? `${created} vencimiento(s) generados y sincronizados.` : "No habia vencimientos nuevos por generar.");
    await cargarProveedores(true);
  }

  function wireCostActions(state) {
    $("provGastosTabla").querySelectorAll("[data-edit-expense]").forEach(button => button.addEventListener("click", () => abrirGasto(state, state.expenses.find(item => item.id === button.dataset.editExpense))));
    $("provGastosTabla").querySelectorAll("[data-delete-expense]").forEach(button => button.addEventListener("click", () => confirmarEliminarGasto(state.expenses.find(item => item.id === button.dataset.deleteExpense))));
    $("provRecurrentesTabla").querySelectorAll("[data-edit-recurring]").forEach(button => button.addEventListener("click", () => abrirRecurrente(state, state.recurrents.find(item => item.id === button.dataset.editRecurring))));
    $("provRecurrentesTabla").querySelectorAll("[data-stop-recurring]").forEach(button => button.addEventListener("click", () => desactivarRecurrente(state.recurrents.find(item => item.id === button.dataset.stopRecurring))));
    $("provObligacionesTabla").querySelectorAll("[data-edit-obligation]").forEach(button => button.addEventListener("click", () => abrirObligacion(state, state.obligations.find(item => item.id === button.dataset.editObligation))));
    $("provObligacionesTabla").querySelectorAll("[data-pay-obligation]").forEach(button => button.addEventListener("click", () => pagarObligacion(state.obligations.find(item => item.id === button.dataset.payObligation))));
    $("provObligacionesTabla").querySelectorAll("[data-cancel-obligation]").forEach(button => button.addEventListener("click", () => cancelarObligacion(state.obligations.find(item => item.id === button.dataset.cancelObligation))));
    $("provObligacionesTabla").querySelectorAll("[data-open-obligation]").forEach(button => button.addEventListener("click", () => openCostDocument(state.obligations.find(item => item.id === button.dataset.openObligation)).catch(error => toast(error.message))));
    $("provRecibosTabla").querySelectorAll("[data-print-receipt]").forEach(button => button.addEventListener("click", () => imprimirReciboWeb(state.receipts.find(item => item.id === button.dataset.printReceipt)).catch(error => toast(error.message))));
    $("provRecibosTabla").querySelectorAll("[data-sign-receipt]").forEach(button => button.addEventListener("click", () => actualizarFirmaRecibo(state.receipts.find(item => item.id === button.dataset.signReceipt)).catch(error => toast(error.message))));
    $("provRecibosTabla").querySelectorAll("[data-cancel-receipt]").forEach(button => button.addEventListener("click", () => anularRecibo(state.receipts.find(item => item.id === button.dataset.cancelReceipt))));
  }

  const FIN_TIPO_LABEL = {
    efectivo: "Efectivo", banco: "Banco", tarjeta_credito: "Tarjeta de credito",
    tarjeta_debito: "Tarjeta de debito", ahorro: "Ahorro", inversion: "Inversion",
    prestamo: "Prestamo", otra: "Otra",
  };

  function finTipoOptions(current) {
    return Object.entries(FIN_TIPO_LABEL)
      .map(([value, label]) => `<option value="${value}"${selected(current, value)}>${esc(label)}</option>`)
      .join("");
  }

  async function cargarMovimientosFinMes(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = inputDate(new Date(year, monthNumber, 1));
    if (authProvider === "firebase") {
      if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
      return window.DcarelaFirebase.getFinanceMovements(BUSINESS, month);
    }
    const rows = [];
    try {
      if (sb) {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await sb.from("fin_movimientos")
            .select("id,tipo,fecha,hora,monto_centavos,comision_centavos,cuenta_id,cuenta_destino_id,categoria_id,payee,descripcion,nota,es_propina,origen,venta_folio,moneda,tasa_cambio,monto_moneda_principal_centavos,archivo_url,etiquetas,conciliado,afecta_resultado,metadata,created_at,updated_at")
            .eq("business_id", BUSINESS).eq("estado", "registrado")
            .gte("fecha", from).lt("fecha", to)
            .order("fecha", { ascending: false }).range(offset, offset + 999);
          if (error) {
            console.warn("cargarMovimientosFinMes Supabase notice:", error.message);
            break;
          }
          rows.push(...(data || []));
          if (!data || data.length < 1000) return rows;
        }
      }
    } catch (e) {
      console.warn("cargarMovimientosFinMes notice:", e.message);
    }
    return rows;
  }

  async function cargarCuentasFin(month) {
    let cuentasRes, accountVisualsRes, catsRes, movs = [], cardsRes, budgetsRes, preferencesRes, currenciesRes, cumuloRes, commitmentsRes, commitmentPaymentsRes, pendingTransfersRes;
    try {
      if (authProvider === "firebase") {
        if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible.");
        const [accounts, categories, movements, cards, budgets, preferences, currencies,
          commitments, commitmentPayments, pendingTransfers] = await Promise.all([
          window.DcarelaFirebase.getFinanceAccounts(BUSINESS),
          window.DcarelaFirebase.getFinanceCategories(BUSINESS),
          cargarMovimientosFinMes(month),
          window.DcarelaFirebase.getFinanceCards(BUSINESS),
          window.DcarelaFirebase.getFinanceBudgets(BUSINESS),
          window.DcarelaFirebase.getFinancePreferences(BUSINESS),
          window.DcarelaFirebase.getFinanceCurrencies(BUSINESS),
          window.DcarelaFirebase.getFinanceCommitments(BUSINESS),
          window.DcarelaFirebase.getFinanceCommitmentPayments(BUSINESS),
          window.DcarelaFirebase.getFinancePendingTransfers(BUSINESS)
        ]);
        cuentasRes = { data: accounts || [] };
        accountVisualsRes = { data: [] };
        catsRes = { data: categories || [] };
        movs = movements || [];
        cardsRes = { data: cards || [] };
        budgetsRes = { data: budgets || [] };
        preferencesRes = { data: preferences || null };
        currenciesRes = { data: currencies?.length ? currencies : [{ codigo: "DOP", nombre: "Peso dominicano", simbolo: "RD$", tasa_a_principal: 1, principal: true, activa: true }] };
        cumuloRes = { data: null };
        commitmentsRes = { data: commitments || [] };
        commitmentPaymentsRes = { data: commitmentPayments || [] };
        pendingTransfersRes = { data: pendingTransfers || [] };
      } else {
        [cuentasRes, accountVisualsRes, catsRes, movs, cardsRes, budgetsRes, preferencesRes, currenciesRes, cumuloRes, commitmentsRes, commitmentPaymentsRes, pendingTransfersRes] = await Promise.all([
          sb.rpc("fin_account_balances", { p_business_id: BUSINESS }),
          sb.from("fin_cuentas").select("id,visual_tono,visual_tono_secundario,visual_icono,visual_estilo,visual_mascara").eq("business_id", BUSINESS),
          sb.from("fin_categorias").select("id,nombre,tipo,categoria_padre_id,orden,origen,updated_at").eq("business_id", BUSINESS).eq("estado", "activa").order("tipo").order("orden").order("nombre"),
          cargarMovimientosFinMes(month),
          sb.from("fin_tarjetas").select("*").eq("business_id", BUSINESS),
          sb.from("fin_presupuestos").select("*").eq("business_id", BUSINESS).eq("estado", "activo").order("periodo_inicio", { ascending: false }).limit(500),
          sb.from("fin_preferencias").select("*").eq("business_id", BUSINESS).maybeSingle(),
          sb.from("fin_divisas").select("*").eq("business_id", BUSINESS).eq("activa", true).order("principal", { ascending: false }).order("codigo"),
          sb.rpc("fin_cumulo_mensual", { p_business_id: BUSINESS }),
          sb.from("fin_compromisos").select("*").eq("business_id", BUSINESS).order("activo", { ascending: false }).order("proximo_vencimiento", { ascending: true, nullsFirst: false }),
          sb.from("fin_compromiso_pagos").select("*").eq("business_id", BUSINESS).order("fecha", { ascending: false }).limit(500),
          sb.from("fin_transferencias_pendientes").select("*").eq("business_id", BUSINESS).order("estado", { ascending: false }).order("fecha_esperada", { ascending: true })
        ]);
      }
    } catch (finErr) {
      console.warn("cargarCuentasFin:", finErr.message);
      throw finErr;
    }
    const visuals = new Map((accountVisualsRes.data || []).map(item => [item.id, item]));
    const cuentas = (cuentasRes.data || []).map(item => ({ ...item, ...(visuals.get(item.id) || {}) }));
    const catsRows = catsRes.data || [];
    finStateCache = {
      accounts: cuentas,
      categories: catsRows,
      movements: movs,
      cards: cardsRes.data || [],
      budgets: budgetsRes.data || [],
      preferences: preferencesRes.data || null,
      currencies: currenciesRes.data || [],
      cumulo: cumuloRes.error ? null : (cumuloRes.data || null),
      commitments: commitmentsRes.data || [],
      commitmentPayments: commitmentPaymentsRes.data || [],
      pendingTransfers: pendingTransfersRes.data || [],
      month,
    };
    dispararAlertaCumuloMensual();
    finDashboardPeriod = finStateCache.preferences?.periodo_dashboard || finDashboardPeriod;
    renderFinAccounts();
    renderFinPendingTransfers();
    renderFinCommitments();
    renderFinMovements();
    await renderFinBudgets();
    renderFinCards();
    renderFinSettings();
    await renderFinDashboard();
    subscribeFinanceRealtime();
  }

  function dispararAlertaCumuloMensual() {
    if (!canEdit) return;
    try {
      const hoy = inputDate(new Date());
      if (localStorage.getItem("finCumuloAlerta") === hoy) return;
      sb.rpc("fin_alerta_cumulo_mensual", { p_business_id: BUSINESS })
        .then(({ error }) => { if (!error) localStorage.setItem("finCumuloAlerta", hoy); })
        .catch(() => {});
    } catch { /* localStorage no disponible */ }
  }

  const FIN_CHART_COLORS = ["#18181B", "#52525B", "#71717A", "#A1A1AA", "#D4D4D8", "#3F3F46", "#E4E4E7", "#27272A"];
  const FIN_ACCOUNT_ICONS = {
    landmark: "B", wallet: "$", card: "C", savings: "A", cash: "$", camera: "F",
  };
  const safeAccountColor = (value, fallback) =>
    /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : fallback;

  function finRange(period = finDashboardPeriod, reference = finReferenceDate) {
    const base = new Date(`${reference || inputDate(new Date())}T12:00:00`);
    const safe = Number.isNaN(base.getTime()) ? new Date() : base;
    let start = new Date(safe);
    let end = new Date(safe);
    if (period === "semana") {
      const mondayOffset = (safe.getDay() + 6) % 7;
      start.setDate(safe.getDate() - mondayOffset);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else if (period === "mes") {
      start = new Date(safe.getFullYear(), safe.getMonth(), 1, 12);
      end = new Date(safe.getFullYear(), safe.getMonth() + 1, 0, 12);
    }
    return {
      from: inputDate(start),
      to: inputDate(end),
      label: period === "dia" ? fechaCorta(start) : period === "semana"
        ? `${fechaCorta(start)} al ${fechaCorta(end)}`
        : safe.toLocaleDateString("es-DO", { month: "long", year: "numeric" }),
    };
  }

  function finBudgetRange(budget) {
    const start = new Date(`${budget.periodo_inicio}T12:00:00`);
    const end = new Date(start);
    if (budget.periodo === "semanal") end.setDate(start.getDate() + 6);
    else if (budget.periodo === "anual") end.setFullYear(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1);
    else end.setMonth(start.getMonth() + 1, 0);
    return { from: inputDate(start), to: inputDate(end) };
  }

  function renderFinAccounts() {
    const state = finStateCache;
    if (!state) return;
    let patrimonio = 0;
    const cards = state.accounts.map(account => {
      const balance = numero(account.saldo_actual_centavos);
      if (account.incluir_en_total) patrimonio += balance;
      const isCard = account.tipo === "tarjeta_credito";
      const display = isCard ? Math.max(0, -balance) : balance;
      const primary = safeAccountColor(account.visual_tono, "#18181B");
      const secondary = safeAccountColor(account.visual_tono_secundario, "#71717A");
      const style = ["glass", "solid", "outline", "metal"].includes(account.visual_estilo) ? account.visual_estilo : "glass";
      const icon = FIN_ACCOUNT_ICONS[account.visual_icono] || FIN_ACCOUNT_ICONS.landmark;
      const mask = account.visual_mascara ? `&bull;&bull;&bull;&bull; ${esc(account.visual_mascara)}` : "";
      const signLabel = isCard ? (display > 0 ? "Deuda" : "Sin deuda") : balance < 0 ? "Negativo" : balance > 0 ? "Disponible" : "En cero";
      return `<article class="fin-account visual ${style} ${balance < 0 ? "neg" : "pos"}${account.oculta ? " muted" : ""}" style="--account-primary:${primary};--account-secondary:${secondary}">
        <button type="button" class="fin-account-open" data-fin-account-ledger="${esc(account.id)}" title="Ver los movimientos que forman este saldo">
          <span class="fin-account-visual-head"><i>${esc(icon)}</i><span><b>${esc(account.nombre)}</b><small>${mask || esc(FIN_TIPO_LABEL[account.tipo] || account.tipo)}</small></span></span>
          <span class="fin-account-balance-row"><strong>${isCard ? money(display) : money(balance)}</strong><em class="fin-account-sign">${esc(signLabel)}</em></span>
          <small>${esc(FIN_TIPO_LABEL[account.tipo] || account.tipo)}${account.ligada_ventas ? " &middot; ligada a ventas" : ""}${account.oculta ? " &middot; oculta" : ""}</small>
        </button>
        ${canEdit ? `<div class="fin-account-actions"><button type="button" data-fin-account-reconcile="${esc(account.id)}">Conciliar</button><button type="button" data-fin-account-edit="${esc(account.id)}">Editar</button></div>` : ""}
      </article>`;
    }).join("");
    const cumulo = state.cumulo;
    const cumuloCard = cumulo && numero(cumulo.total_centavos) > 0
      ? `<article class="fin-account cumulo"><button type="button" class="fin-account-open" data-fin-open-commitments title="Ver cuotas, capital y saldos pendientes"><span class="fin-account-name">Por saldar este mes</span><strong>${money(numero(cumulo.total_centavos))}</strong><small>${cumulo.compromisos_n || 0} vencimiento(s) &middot; prestamos pendientes ${money(numero(cumulo.deuda_prestamos_centavos))}</small></button></article>`
      : "";
    $("finCuentasCards").innerHTML = `<article class="fin-account total ${patrimonio < 0 ? "neg" : "pos"}"><span class="fin-account-name">Patrimonio total</span><span class="fin-account-balance-row"><strong>${money(patrimonio)}</strong><em class="fin-account-sign">${patrimonio < 0 ? "Negativo" : "Positivo"}</em></span><small>Suma de cuentas incluidas</small></article>${cumuloCard}${cards}`;
    $("finCuentasCards").querySelectorAll("[data-fin-account-ledger]").forEach(button => button.addEventListener("click", () => {
      const accountId = button.dataset.finAccountLedger;
      setCostTab("movimientos");
      $("finMovementAccount").value = accountId;
      renderFinMovements();
      $("finMovementSearch").focus();
    }));
    $("finCuentasCards").querySelectorAll("[data-fin-account-edit]").forEach(button => button.addEventListener("click", () => {
      abrirCuentaFin(state.accounts.find(account => account.id === button.dataset.finAccountEdit));
    }));
    $("finCuentasCards").querySelectorAll("[data-fin-account-reconcile]").forEach(button => button.addEventListener("click", () => {
      abrirConciliacionCuentaFin(state.accounts.find(account => account.id === button.dataset.finAccountReconcile));
    }));
    $("finCuentasCards").querySelector("[data-fin-open-commitments]")?.addEventListener("click", () => setCostTab("compromisos"));
  }

  function renderFinPendingTransfers() {
    const mount = $("finTransferenciasPendientes");
    const state = finStateCache;
    if (!mount || !state) return;
    const accountNames = new Map(state.accounts.map(account => [account.id, account.nombre]));
    const rows = state.pendingTransfers || [];
    if (!rows.length) {
      mount.innerHTML = '<div class="empty-state">No hay transferencias pendientes de confirmacion.</div>';
      return;
    }
    mount.innerHTML = `<table><thead><tr><th>Esperada</th><th>Cuenta</th><th>Detalle</th><th>Direccion</th><th class="amount">Monto</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map(item => `
      <tr><td>${esc(fechaCorta(item.fecha_esperada))}</td><td>${esc(accountNames.get(item.cuenta_id) || "Cuenta")}</td><td><strong>${esc(item.descripcion)}</strong>${item.referencia ? `<small>${esc(item.referencia)}</small>` : ""}</td><td>${item.direccion === "salida" ? "Salida" : "Entrada"}</td><td class="amount">${money(item.monto_centavos)}</td><td><span class="tag ${item.estado === "confirmada" ? "ok" : item.estado === "pendiente" ? "warn" : ""}">${esc(item.estado)}</span></td><td>${canEdit && item.estado === "pendiente" ? `<div class="button-row"><button class="primary" data-pending-confirm="${esc(item.id)}">Confirmar llegada</button><button class="secondary" data-pending-cancel="${esc(item.id)}">Cancelar</button></div>` : ""}</td></tr>`).join("")}</tbody></table>`;
    mount.querySelectorAll("[data-pending-confirm]").forEach(button => button.addEventListener("click", () => resolvePendingTransfer(button.dataset.pendingConfirm, true)));
    mount.querySelectorAll("[data-pending-cancel]").forEach(button => button.addEventListener("click", () => resolvePendingTransfer(button.dataset.pendingCancel, false)));
  }

  function openPendingTransfer() {
    const accounts = (finStateCache?.accounts || []).filter(account => account.estado !== "eliminada" && !account.oculta);
    const popular = accounts.find(account => account.nombre.toLowerCase().includes("popular")) || accounts[0];
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    abrirEditor("Rastrear transferencia", "No cambia el saldo hasta comprobar el estado bancario; evita registrar dinero dos veces.", `
      <label><span>Cuenta receptora</span><select name="cuentaId">${accounts.map(account => `<option value="${esc(account.id)}"${selected(account.id, popular?.id)}>${esc(account.nombre)}</option>`).join("")}</select></label>
      <label><span>Direccion</span><select name="direccion"><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label>
      <label><span>Monto (RD$)</span><input name="monto" inputmode="decimal" required></label>
      <label><span>Fecha esperada</span><input name="fechaEsperada" type="date" required value="${inputDate(tomorrow)}"></label>
      <label class="field-wide"><span>Descripcion</span><input name="descripcion" required maxlength="500" placeholder="Ej.: transferencia del cierre pendiente de reflejarse"></label>
      <label class="field-wide"><span>Referencia</span><input name="referencia" maxlength="180"></label>`, async form => {
      await adminWrite("fin.pending_transfer.create", null, {
        cuentaId: form.get("cuentaId"), direccion: form.get("direccion"),
        montoCentavos: centavosInput(form.get("monto")), fechaOrigen: inputDate(new Date()),
        fechaEsperada: form.get("fechaEsperada"), descripcion: form.get("descripcion"),
        referencia: form.get("referencia"),
      });
      cerrarEditor();
      toast("Transferencia pendiente registrada sin alterar el saldo.");
      await cargarCuentasFin(finStateCache?.month || inputDate(new Date()).slice(0, 7));
    }, "Guardar seguimiento");
  }

  function resolvePendingTransfer(id, confirmed) {
    const item = finStateCache?.pendingTransfers?.find(value => value.id === id);
    if (!item) return;
    abrirEditor(confirmed ? "Confirmar llegada" : "Cancelar seguimiento",
      confirmed ? "Confirma solo si el banco ya refleja el importe. Esta accion no duplica el movimiento financiero original." : "El registro permanecera en auditoria como cancelado.",
      '<label class="field-wide"><span>Nota de verificacion</span><textarea name="nota" rows="4" required maxlength="500" placeholder="Indica como verificaste el estado bancario"></textarea></label>', async form => {
        await adminWrite(confirmed ? "fin.pending_transfer.confirm" : "fin.pending_transfer.cancel", id, { nota: form.get("nota") });
        cerrarEditor();
        toast(confirmed ? "Transferencia confirmada y documentada." : "Seguimiento cancelado.");
        await cargarCuentasFin(finStateCache?.month || inputDate(new Date()).slice(0, 7));
      }, confirmed ? "Confirmar" : "Cancelar seguimiento");
  }

  const FIN_COMMITMENT_FREQUENCY = {
    unica: "Una vez", semanal: "Semanal", quincenal: "Quincenal",
    mensual: "Mensual", bimestral: "Cada 2 meses", trimestral: "Trimestral",
    semestral: "Semestral", anual: "Anual", personalizada: "Personalizada",
  };

  function optionalInteger(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Escribe un numero entero valido.");
    return parsed;
  }

  function optionalCents(value) {
    return String(value ?? "").trim() ? centavosInput(value) : null;
  }

  function abrirCompromisoFin(commitment = null) {
    const item = commitment || {
      tipo: "obligacion", frecuencia: "mensual", activo: true,
      proximo_vencimiento: todayKey(), cuotas_pagadas: 0,
    };
    const frequencyOptions = Object.entries(FIN_COMMITMENT_FREQUENCY)
      .map(([value, label]) => `<option value="${value}"${selected(item.frecuencia, value)}>${label}</option>`).join("");
    abrirEditor(commitment ? "Editar compromiso" : "Nuevo compromiso", "Separa la cuota del mes, el saldo contractual y el capital. El historial de pagos no se borra.", `
      <label class="field-wide"><span>Nombre</span><input name="nombre" required maxlength="180" value="${esc(item.nombre || "")}"></label>
      <label><span>Tipo</span><select name="tipo"><option value="prestamo"${selected(item.tipo, "prestamo")}>Prestamo</option><option value="servicio"${selected(item.tipo, "servicio")}>Servicio</option><option value="alquiler"${selected(item.tipo, "alquiler")}>Alquiler</option><option value="nomina"${selected(item.tipo, "nomina")}>Nomina</option><option value="obligacion"${selected(item.tipo, "obligacion")}>Otra obligacion</option></select></label>
      <label><span>Frecuencia</span><select name="frecuencia">${frequencyOptions}</select></label>
      <label><span>Cuota o importe previsto (RD$)</span><input name="monto" type="number" min="0" step="0.01" required value="${pesoInput(item.monto_centavos)}"></label>
      <label><span>Proximo vencimiento</span><input name="proximoVencimiento" type="date" value="${esc(item.proximo_vencimiento || "")}"></label>
      <label data-frequency-field="semanal"><span>Dia semanal</span><select name="diaSemana"><option value="">Usar fecha de inicio</option><option value="1"${selected(item.dia_semana, 1)}>Lunes</option><option value="2"${selected(item.dia_semana, 2)}>Martes</option><option value="3"${selected(item.dia_semana, 3)}>Miercoles</option><option value="4"${selected(item.dia_semana, 4)}>Jueves</option><option value="5"${selected(item.dia_semana, 5)}>Viernes</option><option value="6"${selected(item.dia_semana, 6)}>Sabado</option><option value="7"${selected(item.dia_semana, 7)}>Domingo</option></select></label>
      <label data-frequency-field="quincenal"><span>Primer dia de pago</span><input name="diaMes1" type="number" min="1" max="31" value="${esc(item.dia_mes_1 ?? "")}" placeholder="Ej. 15"></label>
      <label data-frequency-field="quincenal"><span>Segundo dia de pago</span><input name="diaMes2" type="number" min="1" max="31" value="${esc(item.dia_mes_2 ?? "")}" placeholder="Ej. 30"></label>
      <label data-frequency-field="personalizada"><span>Repetir cada cuantos dias</span><input name="intervaloDias" type="number" min="1" max="3650" value="${esc(item.intervalo_dias ?? "")}" placeholder="Ej. 10"></label>
      <label><span>Fecha de inicio</span><input name="fechaInicio" type="date" value="${esc(item.fecha_inicio || "")}"></label>
      <label><span>Saldo contractual pendiente (RD$)</span><input name="saldoPendiente" type="number" min="0" step="0.01" value="${item.saldo_pendiente_centavos == null ? "" : pesoInput(item.saldo_pendiente_centavos)}"></label>
      <label><span>Capital pendiente (RD$)</span><input name="capitalPendiente" type="number" min="0" step="0.01" value="${item.capital_pendiente_centavos == null ? "" : pesoInput(item.capital_pendiente_centavos)}"></label>
      <label><span>Intereses y cargos pendientes (RD$)</span><input name="cargosPendientes" type="number" min="0" step="0.01" value="${item.cargos_intereses_pendientes_centavos == null ? "" : pesoInput(item.cargos_intereses_pendientes_centavos)}"></label>
      <label><span>Cuotas totales</span><input name="cuotasTotales" type="number" min="1" value="${esc(item.cuotas_totales ?? "")}"></label>
      <label><span>Cuota actual</span><input name="cuotaActual" type="number" min="1" value="${esc(item.cuota_actual ?? "")}"></label>
      <label><span>Cuotas pagadas</span><input name="cuotasPagadas" type="number" min="0" value="${esc(item.cuotas_pagadas ?? 0)}"></label>
      <label class="checkbox-field"><input name="montoVariable" type="checkbox"${checked(item.monto_variable)}><span>El importe puede variar</span></label>
      <label class="checkbox-field"><input name="capitalEsVariable" type="checkbox"${checked(item.capital_es_variable)}><span>El capital cambia con cada pago</span></label>
      <label class="checkbox-field"><input name="activo" type="checkbox"${checked(item.activo !== false)}><span>Compromiso activo</span></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="3" maxlength="1400">${esc(item.nota || "")}</textarea></label>`, async form => {
      const balance = optionalCents(form.get("saldoPendiente"));
      const capital = optionalCents(form.get("capitalPendiente"));
      const charges = optionalCents(form.get("cargosPendientes"));
      if (balance != null && capital != null && capital > balance) throw new Error("El capital no puede superar el saldo contractual.");
      const frequency = form.get("frecuencia");
      const intervaloDias = optionalInteger(form.get("intervaloDias"));
      const diaMes1 = optionalInteger(form.get("diaMes1"));
      const diaMes2 = optionalInteger(form.get("diaMes2"));
      if (frequency === "personalizada" && !intervaloDias) throw new Error("La frecuencia personalizada necesita intervalo en dias.");
      if (frequency === "quincenal" && diaMes1 && diaMes2 && diaMes1 === diaMes2) throw new Error("Los dos dias quincenales deben ser diferentes.");
      await adminWrite("fin.commitment.upsert", commitment?.id, {
        nombre: form.get("nombre"), tipo: form.get("tipo"), frecuencia: frequency,
        montoCentavos: centavosInput(form.get("monto")), proximoVencimiento: form.get("proximoVencimiento") || null,
        diaSemana: optionalInteger(form.get("diaSemana")), diaMes1, diaMes2, intervaloDias,
        fechaInicio: form.get("fechaInicio") || null,
        saldoInicialRegistradoCentavos: commitment?.saldo_inicial_registrado_centavos ?? balance,
        saldoPendienteCentavos: balance, capitalPendienteCentavos: capital,
        cargosInteresesPendientesCentavos: charges,
        cuotasTotales: optionalInteger(form.get("cuotasTotales")), cuotaActual: optionalInteger(form.get("cuotaActual")),
        cuotasPagadas: optionalInteger(form.get("cuotasPagadas")) || 0,
        montoVariable: form.get("montoVariable") === "on", capitalEsVariable: form.get("capitalEsVariable") === "on",
        activo: form.get("activo") === "on", nota: form.get("nota"), metadata: item.metadata || {},
      });
      cerrarEditor();
      await cargarProveedores(true);
      setCostTab("compromisos");
    });
    const editorForm = $("editorForm");
    const frequencySelect = editorForm?.elements?.frecuencia;
    const updateFrequencyFields = () => {
      const frequency = frequencySelect?.value || "mensual";
      editorForm?.querySelectorAll("[data-frequency-field]").forEach(field => {
        field.classList.toggle("oculto", field.dataset.frequencyField !== frequency);
      });
    };
    frequencySelect?.addEventListener("change", updateFrequencyFields);
    updateFrequencyFields();
  }

  function abrirPagoCompromisoFin(commitment) {
    const accountOptions = (finStateCache?.accounts || []).filter(item => item.estado !== "eliminada")
      .map(item => `<option value="${esc(item.id)}">${esc(item.nombre)}</option>`).join("");
    abrirEditor("Registrar pago", `${commitment.nombre}. El saldo se reduce una sola vez y el desglose queda auditado.`, `
      <label><span>Fecha</span><input name="fecha" type="date" required value="${todayKey()}"></label>
      <label><span>Monto pagado (RD$)</span><input name="monto" type="number" min="0.01" step="0.01" required value="${pesoInput(commitment.monto_centavos)}"></label>
      <label><span>Abono a capital (RD$)</span><input name="capital" type="number" min="0" step="0.01" value=""></label>
      <label><span>Interes (RD$)</span><input name="interes" type="number" min="0" step="0.01" value=""></label>
      <label><span>Otros cargos (RD$)</span><input name="cargos" type="number" min="0" step="0.01" value=""></label>
      <label><span>Cuenta usada</span><select name="cuentaId"><option value="">Sin vincular</option>${accountOptions}</select></label>
      <label><span>Numero de cuota</span><input name="numeroCuota" type="number" min="1" value="${esc(commitment.cuota_actual ?? "")}"></label>
      <label><span>Cuotas aplicadas</span><input name="cuotasAplicadas" type="number" min="1" value="1"></label>
      <label><span>Siguiente vencimiento (opcional)</span><input name="proximoVencimiento" type="date"></label>
      <label><span>Referencia o recibo</span><input name="referencia" maxlength="180"></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="3" maxlength="1200"></textarea></label>`, async form => {
      const amount = centavosInput(form.get("monto"));
      const capital = optionalCents(form.get("capital")) || 0;
      const interest = optionalCents(form.get("interes")) || 0;
      const charges = optionalCents(form.get("cargos")) || 0;
      if (capital + interest + charges > amount) throw new Error("Capital, interes y cargos no pueden superar el pago.");
      await adminWrite("fin.commitment.payment", commitment.id, {
        fecha: form.get("fecha"), montoCentavos: amount, capitalCentavos: capital,
        interesCentavos: interest, cargosCentavos: charges, cuentaId: form.get("cuentaId") || null,
        numeroCuota: optionalInteger(form.get("numeroCuota")), cuotasAplicadas: optionalInteger(form.get("cuotasAplicadas")) || 1,
        proximoVencimiento: form.get("proximoVencimiento") || null,
        referencia: form.get("referencia"), nota: form.get("nota"),
      });
      cerrarEditor();
      await cargarProveedores(true);
      setCostTab("compromisos");
    }, "Registrar pago");
  }

  function desactivarCompromisoFin(commitment) {
    abrirEditor("Desactivar compromiso", "No se borra ningun pago ni saldo historico. Puedes reactivarlo editandolo.", `
      <div class="confirm-panel field-wide"><strong>${esc(commitment.nombre)}</strong><p>${money(commitment.saldo_pendiente_centavos || 0)} pendientes.</p></div>
      <label class="field-wide"><span>Motivo</span><textarea name="motivo" rows="3" required></textarea></label>`, async form => {
      await adminWrite("fin.commitment.deactivate", commitment.id, { motivo: form.get("motivo") });
      cerrarEditor();
      await cargarProveedores(true);
      setCostTab("compromisos");
    }, "Desactivar sin borrar");
  }

  function renderFinCommitments() {
    const state = finStateCache;
    if (!state) return;
    const summary = state.cumulo || {};
    $("finCompromisosResumen").innerHTML = metric("Por saldar este mes", money(summary.compromisos_centavos || 0))
      + metric("Deuda de prestamos", money(summary.deuda_prestamos_centavos || 0))
      + metric("Capital pendiente", money(summary.capital_prestamos_centavos || 0))
      + metric("Tarjetas", money(summary.deuda_tarjetas_centavos || 0));
    const dueMap = new Map((summary.detalle || []).map(item => [String(item.id), item]));
    const rows = state.commitments || [];
    const frequencyLabel = item => {
      if (item.frecuencia === "quincenal" && (item.dia_mes_1 || item.dia_mes_2)) {
        return `Quincenal ${[item.dia_mes_1, item.dia_mes_2].filter(Boolean).join(" y ")}`;
      }
      if (item.frecuencia === "personalizada") return `Cada ${item.intervalo_dias || "?"} dias`;
      return FIN_COMMITMENT_FREQUENCY[item.frecuencia] || item.frecuencia || "--";
    };
    $("finCompromisosTabla").innerHTML = tabla(rows, item => {
      const due = dueMap.get(String(item.id)) || {};
      const installments = item.cuotas_totales
        ? `Cuota ${item.cuota_actual || Math.min(item.cuotas_pagadas + 1, item.cuotas_totales)} de ${item.cuotas_totales} (${Math.max(0, item.cuotas_totales - item.cuotas_pagadas)} restante(s))`
        : frequencyLabel(item);
      const actions = canEdit ? `<div class="table-actions"><button type="button" data-fin-commitment-pay="${esc(item.id)}"${item.activo ? "" : " disabled"}>Pagar</button><button type="button" data-fin-commitment-edit="${esc(item.id)}">Editar</button>${item.activo ? `<button type="button" data-fin-commitment-off="${esc(item.id)}">Desactivar</button>` : ""}</div>` : "";
      return [
        `<strong>${esc(item.nombre)}</strong><small>${esc(item.nota || "")}</small>`,
        `<span>${esc(installments)}</span><small>${item.proximo_vencimiento ? `Proximo ${esc(dateOnly(item.proximo_vencimiento))}` : "Sin fecha fija"}</small>`,
        money(numero(due.monto_periodo_centavos)),
        item.saldo_pendiente_centavos == null ? "--" : money(item.saldo_pendiente_centavos),
        item.capital_pendiente_centavos == null ? "--" : money(item.capital_pendiente_centavos),
        `<span class="tag ${item.activo ? "ok" : "bad"}">${item.activo ? "Activo" : "Inactivo"}</span>`,
        actions,
      ];
    }, ["Compromiso", "Frecuencia / cuota", "Este mes", "Saldo total", "Capital", "Estado", "Acciones"]);
    $("finCompromisosTabla").querySelectorAll("[data-fin-commitment-pay]").forEach(button => button.addEventListener("click", () => abrirPagoCompromisoFin(rows.find(item => item.id === button.dataset.finCommitmentPay))));
    $("finCompromisosTabla").querySelectorAll("[data-fin-commitment-edit]").forEach(button => button.addEventListener("click", () => abrirCompromisoFin(rows.find(item => item.id === button.dataset.finCommitmentEdit))));
    $("finCompromisosTabla").querySelectorAll("[data-fin-commitment-off]").forEach(button => button.addEventListener("click", () => desactivarCompromisoFin(rows.find(item => item.id === button.dataset.finCommitmentOff))));
  }

  function finMovementMatches(movement) {
    const state = finStateCache;
    const type = $("finMovementType")?.value || "";
    const account = $("finMovementAccount")?.value || "";
    const category = $("finMovementCategory")?.value || "";
    const query = ($("finMovementSearch")?.value || "").trim().toLocaleLowerCase("es");
    if (type && movement.tipo !== type) return false;
    if (account && movement.cuenta_id !== account && movement.cuenta_destino_id !== account) return false;
    if (category && movement.categoria_id !== category) return false;
    if (!query) return true;
    const accountNames = new Map(state.accounts.map(item => [item.id, item.nombre]));
    const categoryNames = new Map(state.categories.map(item => [item.id, item.nombre]));
    return [movement.descripcion, movement.payee, movement.nota, movement.venta_folio,
      accountNames.get(movement.cuenta_id), accountNames.get(movement.cuenta_destino_id), categoryNames.get(movement.categoria_id)]
      .some(value => String(value || "").toLocaleLowerCase("es").includes(query));
  }

  function renderFinMovements() {
    const state = finStateCache;
    if (!state) return;
    const accounts = new Map(state.accounts.map(item => [item.id, item.nombre]));
    const categories = new Map(state.categories.map(item => [item.id, item.nombre]));
    const accountValue = $("finMovementAccount")?.value || "";
    const categoryValue = $("finMovementCategory")?.value || "";
    $("finMovementAccount").innerHTML = `<option value="">Todas</option>${state.accounts.map(item => `<option value="${esc(item.id)}"${selected(accountValue, item.id)}>${esc(item.nombre)}</option>`).join("")}`;
    $("finMovementCategory").innerHTML = `<option value="">Todas</option>${state.categories.map(item => `<option value="${esc(item.id)}"${selected(categoryValue, item.id)}>${esc(item.nombre)}</option>`).join("")}`;
    finFilteredMovements = state.movements.filter(finMovementMatches);
    const headers = ["Fecha", "Tipo", "Cuenta", "Categoria", "Detalle", "Monto", ""];
    $("finMovimientosTabla").innerHTML = tabla(finFilteredMovements, movement => {
      const expense = movement.tipo === "gasto";
      const sign = expense ? "-" : movement.tipo === "ingreso" ? "+" : "";
      const accountText = movement.tipo === "transferencia"
        ? `${esc(accounts.get(movement.cuenta_id) || "--")} &rarr; ${esc(accounts.get(movement.cuenta_destino_id) || "--")}`
        : esc(accounts.get(movement.cuenta_id) || "--");
      const typeText = movement.conciliado && movement.afecta_resultado === false
        ? "Conciliacion"
        : movement.es_propina ? "Propina" : movement.tipo.charAt(0).toUpperCase() + movement.tipo.slice(1);
      const detail = movement.comision_centavos
        ? `${movement.descripcion || movement.payee || ""} (comision ${money(movement.comision_centavos)})`
        : movement.descripcion || movement.payee || "Sin descripcion";
      const canCancel = canEdit && ["panel", "asistente", "movil"].includes(movement.origen);
      return [esc(dateOnly(movement.fecha)), typeText, accountText, esc(categories.get(movement.categoria_id) || "--"),
        `<span class="cost-name">${esc(detail)}</span><small class="cost-sub">${esc(movement.nota || movement.venta_folio ? `${movement.nota || ""}${movement.venta_folio ? ` Folio #${movement.venta_folio}` : ""}` : movement.origen || "")}</small>`,
        `<span class="amount ${expense ? "neg" : movement.tipo === "ingreso" ? "pos" : ""}">${sign}${money(movement.monto_centavos)}</span>`,
        canCancel ? `<button class="mini danger" data-fin-cancel="${esc(movement.id)}" title="Anular sin borrar historial">Anular</button>` : ""];
    }, headers);
    $("finMovimientosTabla").querySelectorAll("[data-fin-cancel]").forEach(button => button.addEventListener("click", () => {
      const movement = state.movements.find(item => item.id === button.dataset.finCancel);
      if (movement) confirmarAnularMovimientoFin(movement);
    }));
  }

  async function renderFinBudgets() {
    const state = finStateCache;
    if (!state) return;
    const categories = new Map(state.categories.map(item => [item.id, item.nombre]));
    const rangeQueries = new Map();
    for (const budget of state.budgets) {
      const range = finBudgetRange(budget);
      const key = `${range.from}|${range.to}`;
      if (!rangeQueries.has(key)) rangeQueries.set(key, sb.rpc("fin_category_totals", {
        p_business_id: BUSINESS, p_from: range.from, p_to: range.to, p_type: "gasto",
      }));
    }
    const entries = [...rangeQueries.entries()];
    const results = await Promise.all(entries.map(([, request]) => request));
    const totalsByRange = new Map();
    results.forEach((result, index) => {
      if (result.error) throw result.error;
      totalsByRange.set(entries[index][0], new Map((result.data || []).map(row => [row.categoria_id, numero(row.total_centavos)])));
    });
    state.budgetProgress = state.budgets.map(budget => {
      const range = finBudgetRange(budget);
      const spent = totalsByRange.get(`${range.from}|${range.to}`)?.get(budget.categoria_id) || 0;
      const limit = numero(budget.monto_centavos);
      return { ...budget, ...range, spent, percent: limit > 0 ? Math.round(spent * 100 / limit) : 0 };
    });
    if (!state.budgetProgress.length) {
      $("finPresupuestosCards").innerHTML = `<div class="empty-state"><strong>Sin presupuestos</strong><p>Define un limite por categoria para anticipar excesos antes de fin de mes.</p></div>`;
      return;
    }
    $("finPresupuestosCards").innerHTML = state.budgetProgress.map(item => {
      const tone = item.percent >= 100 ? "danger" : item.percent >= item.alerta_porcentaje ? "warn" : "ok";
      return `<button type="button" class="finance-budget ${tone}" data-fin-budget="${esc(item.id)}">
        <span><strong>${esc(categories.get(item.categoria_id) || "Categoria")}</strong><small>${esc(item.periodo)} &middot; ${esc(item.from)} a ${esc(item.to)}</small></span>
        <span class="finance-budget-values"><b>${money(item.spent)} / ${money(item.monto_centavos)}</b><small>${item.percent}% utilizado</small></span>
        <i><em style="width:${Math.min(100, item.percent)}%"></em></i>
      </button>`;
    }).join("");
    $("finPresupuestosCards").querySelectorAll("[data-fin-budget]").forEach(button => button.addEventListener("click", () => {
      abrirPresupuestoFin(state.budgets.find(item => item.id === button.dataset.finBudget));
    }));
  }

  function finCardDates(card, reference = new Date()) {
    const y = reference.getFullYear();
    const m = reference.getMonth();
    const safeDay = (year, month, day) => Math.min(day, new Date(year, month + 1, 0).getDate());
    let cut = new Date(y, m, safeDay(y, m, card.dia_corte), 12);
    if (reference > cut) cut = new Date(y, m + 1, safeDay(y, m + 1, card.dia_corte), 12);
    let payMonth = cut.getMonth() + (card.dia_pago <= card.dia_corte ? 1 : 0);
    const pay = new Date(cut.getFullYear(), payMonth, safeDay(cut.getFullYear(), payMonth, card.dia_pago), 12);
    return { cut, pay };
  }

  function renderFinCards() {
    const state = finStateCache;
    if (!state) return;
    const cardAccounts = state.accounts.filter(item => item.tipo === "tarjeta_credito" && item.estado !== "eliminada");
    const settings = new Map(state.cards.map(item => [item.cuenta_id, item]));
    if (!cardAccounts.length) {
      $("finTarjetasCards").innerHTML = `<div class="empty-state"><strong>Sin tarjetas de credito</strong><p>Agrega primero una cuenta de tipo Tarjeta de credito y luego configura su corte, pago y limite.</p></div>`;
      return;
    }
    $("finTarjetasCards").innerHTML = cardAccounts.map(account => {
      const card = settings.get(account.id);
      const balance = numero(account.saldo_actual_centavos);
      const debt = Math.max(0, -balance);
      const aFavor = Math.max(0, balance);
      const color = esc(card?.color || "#18181B");
      const avisoFavor = aFavor > 0
        ? `<div class="finance-card-warning">Saldo a favor ${money(aFavor)}. En una tarjeta de credito revisa el saldo inicial: deberia ser tu deuda (o 0), no un monto positivo. Editala para que tus consumos se reflejen como deuda.</div>`
        : "";
      const acciones = `<div class="finance-card-actions">
          <button type="button" class="finance-card-consumo" data-fin-card-consumo="${esc(account.id)}">Registrar consumo</button>
          <button type="button" class="finance-card-pay" data-fin-card-pay="${esc(account.id)}">Registrar pago</button>
        </div>`;
      if (!card) {
        return `<article class="finance-credit-card partial" style="--card-color:${color}">
          <button type="button" class="finance-card-edit" data-fin-card="${esc(account.id)}" title="Configurar tarjeta">Configurar</button>
          <span>${esc(account.nombre)}</span><strong>${money(debt)}</strong><small>Deuda actual</small>
          <div class="finance-card-line"><span>Falta configurar</span><b>Corte, pago y limite</b></div>
          ${avisoFavor}
          ${acciones}
        </article>`;
      }
      const available = Math.max(0, numero(card.limite_credito_centavos) - debt);
      const dates = finCardDates(card);
      const percent = card.limite_credito_centavos ? Math.min(100, Math.round(debt * 100 / card.limite_credito_centavos)) : 0;
      return `<article class="finance-credit-card" style="--card-color:${color}">
        <button type="button" class="finance-card-edit" data-fin-card="${esc(account.id)}" title="Editar tarjeta">Editar</button>
        <span>${esc(account.nombre)}</span><strong>${money(debt)}</strong><small>Deuda actual</small>
        <div class="finance-card-line"><span>Disponible</span><b>${money(available)}</b></div>
        <div class="finance-card-line"><span>Proximo corte</span><b>${fechaCorta(dates.cut)}</b></div>
        <div class="finance-card-line"><span>Pago maximo</span><b>${fechaCorta(dates.pay)}</b></div>
        <i><em style="width:${percent}%"></em></i>
        ${avisoFavor}
        ${acciones}
      </article>`;
    }).join("");
    $("finTarjetasCards").querySelectorAll("[data-fin-card]").forEach(button => button.addEventListener("click", () => abrirTarjetaFin(button.dataset.finCard)));
    $("finTarjetasCards").querySelectorAll("[data-fin-card-pay]").forEach(button => button.addEventListener("click", () => abrirPagoTarjetaFin(button.dataset.finCardPay)));
    $("finTarjetasCards").querySelectorAll("[data-fin-card-consumo]").forEach(button => button.addEventListener("click", () => abrirConsumoTarjetaFin(button.dataset.finCardConsumo)));
  }

  function abrirConsumoTarjetaFin(accountId) {
    const state = finStateCache;
    const account = state?.accounts.find(item => item.id === accountId);
    if (!account) { toast("Tarjeta no encontrada."); return; }
    abrirEditor("Registrar consumo", `Compra o cargo con ${account.nombre}. Se registra como gasto y aumenta la deuda de la tarjeta; el pago posterior no lo vuelve a contar como gasto.`, `
      <label><span>Monto (RD$)</span><input name="monto" type="number" min="0.01" step="0.01" required></label>
      <label><span>Categoria</span><select name="categoriaId" required>${finCategoryOptions("gasto")}</select></label>
      <label><span>Fecha</span><input name="fecha" type="date" required value="${inputDate(new Date())}"></label>
      <label><span>Persona o comercio</span><input name="payee" maxlength="180" placeholder="Opcional"></label>
      <label class="field-wide"><span>Descripcion</span><input name="descripcion" maxlength="500" required placeholder="Ej. Compra de materiales"></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="2" maxlength="1200"></textarea></label>`, async form => {
      const amount = centavosInput(form.get("monto"));
      if (amount <= 0) throw new Error("Escribe un monto mayor que cero.");
      await adminWrite("fin.movement.create", null, {
        tipo: "gasto", montoCentavos: amount, cuentaId: accountId,
        categoriaId: form.get("categoriaId"), fecha: form.get("fecha"), payee: form.get("payee"),
        descripcion: form.get("descripcion"), nota: form.get("nota"), origen: "panel",
      });
      cerrarEditor();
      await cargarCuentasFin($("provMes").value);
    });
  }

  function renderFinSettings() {
    const state = finStateCache;
    if (!state) return;
    const prefs = state.preferences || {};
    const accountOptions = (current, includeEmpty = true) => `${includeEmpty ? '<option value="">Selecciona una cuenta</option>' : ""}${state.accounts.filter(item => !item.oculta && item.estado !== "eliminada").map(item => `<option value="${esc(item.id)}"${selected(current, item.id)}>${esc(item.nombre)}</option>`).join("")}`;
    $("finPrefCurrency").innerHTML = state.currencies.map(item => `<option value="${esc(item.codigo)}"${selected(prefs.moneda_principal || "DOP", item.codigo)}>${esc(item.codigo)} &middot; ${esc(item.nombre)}</option>`).join("");
    $("finPrefPeriod").value = prefs.periodo_dashboard || finDashboardPeriod;
    $("finPrefExpenseAccount").innerHTML = accountOptions(prefs.cuenta_gasto_default_id);
    $("finPrefIncomeAccount").innerHTML = accountOptions(prefs.cuenta_ingreso_default_id);
    const parents = new Map(state.categories.map(item => [item.id, item.nombre]));
    $("finCategoriasTabla").innerHTML = tabla(state.categories, item => [
      esc(item.tipo === "gasto" ? "Gasto" : "Ingreso"), esc(item.nombre), esc(parents.get(item.categoria_padre_id) || "Principal"),
      canEdit ? `<button class="mini" data-fin-category="${esc(item.id)}">Editar</button>` : "",
    ], ["Tipo", "Categoria", "Pertenece a", ""]);
    $("finCategoriasTabla").querySelectorAll("[data-fin-category]").forEach(button => button.addEventListener("click", () => abrirCategoriaFin(state.categories.find(item => item.id === button.dataset.finCategory))));
    $("finDivisasTabla").innerHTML = tabla(state.currencies, item => [esc(item.codigo), esc(item.nombre), esc(item.simbolo), numero(item.tasa_a_principal).toLocaleString("es-DO", { maximumFractionDigits: 8 }), item.principal ? "Principal" : "Activa", canEdit ? `<button class="mini" data-fin-currency="${esc(item.id)}">Editar</button>` : ""], ["Codigo", "Nombre", "Simbolo", "Tasa", "Estado", ""]);
    $("finDivisasTabla").querySelectorAll("[data-fin-currency]").forEach(button => button.addEventListener("click", () => abrirDivisaFin(state.currencies.find(item => item.id === button.dataset.finCurrency))));
  }

  async function renderFinDashboard() {
    const state = finStateCache;
    if (!state) return;
    const range = finRange();
    $("finFechaReferencia").value = finReferenceDate;
    $("finPeriodTabs").querySelectorAll("[data-fin-period]").forEach(button => button.classList.toggle("act", button.dataset.finPeriod === finDashboardPeriod));
    
    let summary = null, dailyRows = [], categoryRows = [];
    try {
      if (sb) {
        const [summaryRes, dailyRes, categoryRes] = await Promise.all([
          sb.rpc("fin_period_summary", { p_business_id: BUSINESS, p_from: range.from, p_to: range.to }).catch(() => ({ data: null })),
          sb.rpc("fin_daily_totals", { p_business_id: BUSINESS, p_from: range.from, p_to: range.to }).catch(() => ({ data: null })),
          sb.rpc("fin_category_totals", { p_business_id: BUSINESS, p_from: range.from, p_to: range.to, p_type: "gasto" }).catch(() => ({ data: null })),
        ]);
        if (summaryRes?.data?.[0]) summary = summaryRes.data[0];
        if (dailyRes?.data?.length) dailyRows = dailyRes.data;
        if (categoryRes?.data?.length) categoryRows = categoryRes.data;
      }
    } catch (finErr) {
      console.warn("renderFinDashboard notice:", finErr.message);
    }

    // Client-side financial analytics computation from state.movements
    const periodMovements = (state.movements || []).filter(m => m.fecha >= range.from && m.fecha <= range.to);
    if (!summary) {
      const inc = periodMovements.filter(m => m.tipo === "ingreso").reduce((sum, m) => sum + numero(m.monto_centavos), 0);
      const exp = periodMovements.filter(m => m.tipo === "gasto").reduce((sum, m) => sum + numero(m.monto_centavos), 0);
      summary = { ingresos_centavos: inc, gastos_centavos: exp };
    }

    if (!dailyRows.length) {
      const byDay = new Map();
      periodMovements.forEach(m => {
        const day = m.fecha;
        if (!byDay.has(day)) byDay.set(day, { fecha: day, ingresos_centavos: 0, gastos_centavos: 0 });
        const entry = byDay.get(day);
        if (m.tipo === "ingreso") entry.ingresos_centavos += numero(m.monto_centavos);
        if (m.tipo === "gasto") entry.gastos_centavos += numero(m.monto_centavos);
      });
      dailyRows = [...byDay.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    if (!categoryRows.length) {
      const catMap = new Map(state.categories.map(c => [c.id, c.nombre]));
      const byCat = new Map();
      periodMovements.filter(m => m.tipo === "gasto").forEach(m => {
        const catId = m.categoria_id || "sin-categoria";
        const catName = catMap.get(catId) || m.payee || "Otros gastos";
        if (!byCat.has(catId)) byCat.set(catId, { categoria_id: catId, nombre: catName, total_centavos: 0 });
        byCat.get(catId).total_centavos += numero(m.monto_centavos);
      });
      categoryRows = [...byCat.values()].sort((a, b) => b.total_centavos - a.total_centavos);
    }

    const income = numero(summary.ingresos_centavos);
    const expense = numero(summary.gastos_centavos);
    const net = income - expense;
    const patrimonio = (state.accounts || []).filter(item => item.incluir_en_total).reduce((sum, item) => sum + numero(item.saldo_actual_centavos), 0);
    $("finDashboardKpis").innerHTML = [
      ["Patrimonio", money(patrimonio), "Suma de cuentas"],
      ["Ingresos", money(income), range.label],
      ["Gastos", money(expense), range.label],
      ["Disponible", money(net), net >= 0 ? "Ingresos menos gastos" : "Gasto superior al ingreso"],
    ].map(([label, value, detail], index) => `<div class="metric-item ${index === 3 ? (net < 0 ? "bad" : "good") : ""}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join("");
    
    const availableRate = income > 0 ? Math.max(0, Math.min(100, Math.round(net * 100 / income))) : (expense > 0 ? 0 : 100);
    const expenseCoverage = expense > 0 ? Math.max(0, Math.min(100, Math.round(income * 100 / expense))) : 100;
    const budgets = state.budgetProgress || [];
    const healthyBudgets = budgets.length
      ? Math.round(budgets.filter(item => numero(item.percent) < numero(item.alerta_porcentaje, 80)).length * 100 / budgets.length)
      : 100;
    
    $("finDashboardGauges").innerHTML =
      waveMetric("Margen disponible", `${availableRate}%`, net >= 0 ? money(net) : "resultado negativo", dailyRows.map(item => numero(item.ingresos_centavos) - numero(item.gastos_centavos)))
      + waveMetric("Cobertura de gastos", `${expenseCoverage}%`, `${money(income)} / ${money(expense)}`, dailyRows.map(item => numero(item.ingresos_centavos)))
      + waveMetric("Presupuestos sanos", `${healthyBudgets}%`, budgets.length ? `${budgets.length} presupuesto(s)` : "sin alertas", budgets.length ? budgets.map(item => Math.max(0, 100 - numero(item.percent))) : dailyRows.map(item => numero(item.gastos_centavos)));
    
    renderFinFlowChart(dailyRows, range);
    renderFinCategoryChart(categoryRows, expense);
    renderFinRecent(range);
    renderFinPlanning();
    state.dashboard = { range, summary, daily: dailyRows, categories: categoryRows };
  }

  function renderFinFlowChart(rows, range) {
    $("finFlowCaption").textContent = `${range.label}. Ingresos y gastos confirmados.`;
    if (!rows.length) {
      $("finFlowChart").innerHTML = `<div class="empty-state"><strong>Sin movimientos</strong><p>No hay ingresos ni gastos en este periodo.</p></div>`;
      return;
    }
    const width = 900, height = 250, left = 18, right = 18, top = 18, bottom = 34;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const max = Math.max(1, ...rows.flatMap(item => [numero(item.ingresos_centavos), numero(item.gastos_centavos)]));
    const xAt = index => left + index * chartWidth / Math.max(1, rows.length - 1);
    const yAt = value => top + chartHeight - Math.sqrt(Math.max(0, numero(value)) / max) * chartHeight;
    const income = rows.map((item, index) => ({ x: xAt(index), y: yAt(item.ingresos_centavos) }));
    const expenses = rows.map((item, index) => ({ x: xAt(index), y: yAt(item.gastos_centavos) }));
    const pathOf = points => points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const incomePath = pathOf(income);
    const expensePath = pathOf(expenses);
    const areaPath = `${incomePath} L${income.at(-1).x.toFixed(2)},${(top + chartHeight).toFixed(2)} L${income[0].x.toFixed(2)},${(top + chartHeight).toFixed(2)} Z`;
    const labelIndexes = new Set([0, rows.length - 1, ...[.25, .5, .75].map(part => Math.round((rows.length - 1) * part))]);
    const horizontalGrid = [0, .25, .5, .75, 1].map(part => {
      const y = top + chartHeight * part;
      return `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/>`;
    }).join("");
    const points = rows.map((item, index) => {
      const x = xAt(index), incomeY = income[index].y, expenseY = expenses[index].y;
      const label = labelIndexes.has(index)
        ? `<text class="finance-flow-label" x="${x.toFixed(2)}" y="${height - 9}">${esc(fechaCorta(item.fecha))}</text>`
        : "";
      return `<g class="finance-flow-point" data-fin-day="${esc(item.fecha)}" tabindex="0" role="link" aria-label="${esc(item.fecha)}: ingresos ${money(item.ingresos_centavos)}, gastos ${money(item.gastos_centavos)}"><title>${esc(item.fecha)}: ingresos ${money(item.ingresos_centavos)}, gastos ${money(item.gastos_centavos)}</title><line class="finance-flow-hit" x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${top}" y2="${top + chartHeight}"/><circle class="income" cx="${x.toFixed(2)}" cy="${incomeY.toFixed(2)}" r="3.5"/><circle class="expense" cx="${x.toFixed(2)}" cy="${expenseY.toFixed(2)}" r="3"/>${label}</g>`;
    }).join("");
    $("finFlowChart").innerHTML = `<svg class="finance-flow-wave" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Ingresos y gastos por dia"><defs><linearGradient id="financeIncomeArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".2"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><g class="finance-flow-grid">${horizontalGrid}</g><path class="finance-flow-area" d="${areaPath}"/><path class="finance-flow-income" d="${incomePath}" pathLength="1"/><path class="finance-flow-expense" d="${expensePath}" pathLength="1"/>${points}</svg><div class="finance-flow-legend"><span><i class="income"></i>Ingresos</span><span><i class="expense"></i>Gastos</span><small>Pulsa un punto para abrir ese dia</small></div>`;
    const openDay = target => {
      finReferenceDate = target.dataset.finDay;
      finDashboardPeriod = "dia";
      renderFinDashboard().catch(error => toast(error.message));
    };
    $("finFlowChart").querySelectorAll("[data-fin-day]").forEach(point => {
      point.addEventListener("click", () => openDay(point));
      point.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDay(point); }
      });
    });
  }

  function renderFinCategoryChart(rows, total) {
    if (!rows.length || total <= 0) {
      $("finCategoryChart").innerHTML = `<div class="empty-state"><strong>Sin gastos</strong><p>La composicion aparecera al registrar movimientos.</p></div>`;
      return;
    }
    let cursor = 0;
    const segments = rows.slice(0, 8).map((item, index) => {
      const percent = numero(item.total_centavos) * 100 / total;
      const start = cursor;
      cursor += percent;
      return { ...item, percent, color: FIN_CHART_COLORS[index % FIN_CHART_COLORS.length], start, end: cursor };
    });
    const gradient = segments.map(item => `${item.color} ${item.start.toFixed(2)}% ${item.end.toFixed(2)}%`).join(",");
    $("finCategoryChart").innerHTML = `<div class="finance-donut" style="--donut:${gradient}"><span><strong>${money(total)}</strong><small>Total gastado</small></span></div><div class="finance-donut-legend">${segments.map(item => `<button type="button" data-fin-category-filter="${esc(item.categoria_id || "")}"><i style="background:${item.color}"></i><span>${esc(item.nombre)}</span><b>${Math.round(item.percent)}%</b><small>${money(item.total_centavos)}</small></button>`).join("")}</div>`;
    $("finCategoryChart").querySelectorAll("[data-fin-category-filter]").forEach(button => button.addEventListener("click", () => {
      setCostTab("movimientos");
      $("finMovementType").value = "gasto";
      $("finMovementCategory").value = button.dataset.finCategoryFilter;
      renderFinMovements();
    }));
  }

  function renderFinRecent(range) {
    const state = finStateCache;
    const accounts = new Map(state.accounts.map(item => [item.id, item.nombre]));
    const rows = state.movements.filter(item => item.fecha >= range.from && item.fecha <= range.to).slice(0, 8);
    $("finRecentList").innerHTML = rows.length ? rows.map(item => {
      const expense = item.tipo === "gasto";
      return `<article><i class="${esc(item.tipo)}"></i><span><strong>${esc(item.descripcion || item.payee || (item.tipo === "transferencia" ? "Transferencia" : "Movimiento"))}</strong><small>${esc(accounts.get(item.cuenta_id) || "--")} &middot; ${esc(dateOnly(item.fecha))}</small></span><b class="${expense ? "neg" : item.tipo === "ingreso" ? "pos" : ""}">${expense ? "-" : item.tipo === "ingreso" ? "+" : ""}${money(item.monto_centavos)}</b></article>`;
    }).join("") : `<div class="empty-state compact"><p>Sin actividad en el periodo.</p></div>`;
  }

  function renderFinPlanning() {
    const state = finStateCache;
    const categories = new Map(state.categories.map(item => [item.id, item.nombre]));
    const budgetAlerts = (state.budgetProgress || []).filter(item => item.percent >= item.alerta_porcentaje).slice(0, 4).map(item => ({
      tone: item.percent >= 100 ? "danger" : "warn", title: categories.get(item.categoria_id) || "Presupuesto", detail: `${item.percent}% utilizado &middot; ${money(item.spent)} de ${money(item.monto_centavos)}`,
    }));
    const obligations = (costStateCache?.obligations || []).filter(item => ["pendiente", "parcial", "vencida"].includes(item.estado)).slice(0, 4).map(item => ({
      tone: item.estado === "vencida" ? "danger" : "warn", title: item.concepto || item.acreedor || "Factura pendiente", detail: `${money(item.saldoCentavos)} &middot; vence ${esc(dateOnly(item.venceEn))}`,
    }));
    const rows = [...budgetAlerts, ...obligations].slice(0, 6);
    $("finBudgetAlerts").innerHTML = rows.length ? rows.map(item => `<article class="${item.tone}"><i></i><span><strong>${esc(item.title)}</strong><small>${item.detail}</small></span></article>`).join("") : `<div class="empty-state compact"><strong>Todo bajo control</strong><p>No hay presupuestos excedidos ni vencimientos pendientes.</p></div>`;
  }


  function abrirCuentaFin(account = null) {
    const item = account || {
      nombre: "", tipo: "banco", grupo: "", moneda: "DOP", saldo_inicial_centavos: 0,
      incluir_en_total: true, ligada_ventas: false, oculta: false, orden: 10,
      visual_tono: "#18181B", visual_tono_secundario: "#71717A",
      visual_icono: "landmark", visual_estilo: "glass", visual_mascara: "",
    };
    const esTarjeta = item.tipo === "tarjeta_credito";
    const saldoMostrado = esTarjeta ? Math.abs(numero(item.saldo_inicial_centavos)) : item.saldo_inicial_centavos;
    const primary = safeAccountColor(item.visual_tono, "#18181B");
    const secondary = safeAccountColor(item.visual_tono_secundario, "#71717A");
    abrirEditor(account ? "Editar cuenta" : "Agregar cuenta", "El saldo se recalcula desde el saldo inicial y todos sus movimientos.", `
      <label><span>Nombre</span><input name="nombre" required maxlength="120" value="${esc(item.nombre)}"></label>
      <label><span>Tipo</span><select name="tipo" id="finAccountTipo">${finTipoOptions(item.tipo)}</select></label>
      <label><span>Grupo</span><input name="grupo" maxlength="120" value="${esc(item.grupo || "")}"></label>
      <label><span id="finAccountSaldoLabel">${esTarjeta ? "Deuda inicial (RD$)" : "Saldo inicial (RD$)"}</span><input name="saldoInicial" type="number" step="0.01" required value="${pesoInput(saldoMostrado)}"></label>
      <p id="finAccountSaldoHint" class="field-hint field-wide"${esTarjeta ? "" : ' style="display:none"'}>En una tarjeta de credito escribe cuanto DEBES hoy (0 si esta al dia). Las compras se registran despues con "Registrar consumo".</p>
      <label><span>Moneda</span><input name="moneda" maxlength="8" value="${esc(item.moneda || "DOP")}"></label>
      <label><span>Orden</span><input name="orden" type="number" step="1" value="${esc(item.orden || 0)}"></label>
      <div class="account-visual-editor field-wide">
        <div class="account-visual-preview ${esc(item.visual_estilo || "glass")}" id="finAccountVisualPreview" style="--account-primary:${primary};--account-secondary:${secondary}">
          <i id="finAccountPreviewIcon">${esc(FIN_ACCOUNT_ICONS[item.visual_icono] || "B")}</i>
          <span><small>Vista sincronizada</small><strong id="finAccountPreviewName">${esc(item.nombre || "Nombre de la cuenta")}</strong><b id="finAccountPreviewMask">${item.visual_mascara ? `&bull;&bull;&bull;&bull; ${esc(item.visual_mascara)}` : "Cuenta financiera"}</b></span>
        </div>
        <div class="account-visual-controls">
          <label><span>Color principal</span><input name="visualTono" type="color" value="${primary}"></label>
          <label><span>Color secundario</span><input name="visualTonoSecundario" type="color" value="${secondary}"></label>
          <label><span>Icono</span><select name="visualIcono">
            <option value="landmark"${selected(item.visual_icono, "landmark")}>Banco</option>
            <option value="wallet"${selected(item.visual_icono, "wallet")}>Billetera</option>
            <option value="cash"${selected(item.visual_icono, "cash")}>Efectivo</option>
            <option value="card"${selected(item.visual_icono, "card")}>Tarjeta</option>
            <option value="savings"${selected(item.visual_icono, "savings")}>Ahorros</option>
            <option value="camera"${selected(item.visual_icono, "camera")}>Fotografia</option>
          </select></label>
          <label><span>Estilo</span><select name="visualEstilo">
            <option value="glass"${selected(item.visual_estilo, "glass")}>Cristal</option>
            <option value="solid"${selected(item.visual_estilo, "solid")}>Solido</option>
            <option value="outline"${selected(item.visual_estilo, "outline")}>Contorno</option>
            <option value="metal"${selected(item.visual_estilo, "metal")}>Metal</option>
          </select></label>
          <label class="visual-mask"><span>Ultimos 4 digitos (opcional)</span><input name="visualMascara" inputmode="numeric" pattern="[0-9]{0,4}" maxlength="4" value="${esc(item.visual_mascara || "")}" placeholder="1234"></label>
        </div>
      </div>
      <label class="check-row"><input name="incluirEnTotal" type="checkbox"${checked(item.incluir_en_total)}><span>Incluir en patrimonio total</span></label>
      <label class="check-row"><input name="ligadaVentas" type="checkbox"${checked(item.ligada_ventas)}><span>Cuenta ligada a ventas</span></label>
      <label class="check-row field-wide"><input name="oculta" type="checkbox"${checked(item.oculta)}><span>Ocultar cuenta sin borrar su historial</span></label>`, async form => {
      const tipo = form.get("tipo");
      let saldo = centavosConSignoInput(form.get("saldoInicial"));
      if (tipo === "tarjeta_credito") saldo = -Math.abs(saldo);
      await adminWrite("fin.account.upsert", account?.id, {
        nombre: form.get("nombre"), tipo, grupo: form.get("grupo"),
        moneda: form.get("moneda"), saldoInicialCentavos: saldo,
        incluirEnTotal: form.get("incluirEnTotal") === "on", ligadaVentas: form.get("ligadaVentas") === "on",
        oculta: form.get("oculta") === "on", orden: Number(form.get("orden")) || 0,
        visualTono: form.get("visualTono"), visualTonoSecundario: form.get("visualTonoSecundario"),
        visualIcono: form.get("visualIcono"), visualEstilo: form.get("visualEstilo"),
        visualMascara: form.get("visualMascara"),
      });
      cerrarEditor();
      await cargarCuentasFin($("provMes").value);
    });
    const tipoSel = $("finAccountTipo");
    const saldoLabel = $("finAccountSaldoLabel");
    const saldoHint = $("finAccountSaldoHint");
    tipoSel?.addEventListener("change", () => {
      const card = tipoSel.value === "tarjeta_credito";
      if (saldoLabel) saldoLabel.textContent = card ? "Deuda inicial (RD$)" : "Saldo inicial (RD$)";
      if (saldoHint) saldoHint.style.display = card ? "" : "none";
    });
    const form = $("editorForm");
    const updateVisualPreview = () => {
      const preview = $("finAccountVisualPreview");
      if (!preview) return;
      const data = new FormData(form);
      const visualStyle = ["glass", "solid", "outline", "metal"].includes(String(data.get("visualEstilo")))
        ? String(data.get("visualEstilo")) : "glass";
      preview.className = `account-visual-preview ${visualStyle}`;
      preview.style.setProperty("--account-primary", safeAccountColor(data.get("visualTono"), "#18181B"));
      preview.style.setProperty("--account-secondary", safeAccountColor(data.get("visualTonoSecundario"), "#71717A"));
      $("finAccountPreviewIcon").textContent = FIN_ACCOUNT_ICONS[data.get("visualIcono")] || "B";
      $("finAccountPreviewName").textContent = String(data.get("nombre") || "").trim() || "Nombre de la cuenta";
      const mask = String(data.get("visualMascara") || "").replace(/\D/g, "").slice(-4);
      $("finAccountPreviewMask").textContent = mask ? `•••• ${mask}` : "Cuenta financiera";
    };
    ["nombre", "visualTono", "visualTonoSecundario", "visualIcono", "visualEstilo", "visualMascara"]
      .forEach(name => form.elements.namedItem(name)?.addEventListener("input", updateVisualPreview));
  }

  function abrirConciliacionCuentaFin(account) {
    if (!account) return;
    const isCard = account.tipo === "tarjeta_credito";
    const currentBalance = numero(account.saldo_actual_centavos);
    const displayBalance = isCard ? Math.max(0, -currentBalance) : currentBalance;
    abrirEditor("Conciliar saldo", "Registra la diferencia sin borrar movimientos ni alterar los cobros de ventas.", `
      <div class="reconciliation-summary field-wide"><span>${isCard ? "Deuda actual en tarjeta" : "Saldo disponible calculado"}</span><strong>${money(displayBalance)}</strong></div>
      <label><span>${isCard ? "Deuda real acumulada (RD$)" : "Saldo real disponible (RD$)"}</span><input name="saldoObjetivo" type="number" step="0.01" required value="${pesoInput(displayBalance)}"></label>
      <label><span>Fecha</span><input name="fecha" type="date" required value="${inputDate(new Date())}"></label>
      <label class="field-wide"><span>Motivo obligatorio</span><textarea name="motivo" rows="3" required placeholder="Ejemplo: saldo confirmado con estado de cuenta bancario"></textarea></label>
      <p class="field-hint field-wide">El asiento ajusta el balance real de forma transparente, genera registro contable y conserva intactas las ventas.</p>`, async form => {
      const rawTarget = centavosConSignoInput(form.get("saldoObjetivo"));
      const target = isCard ? (rawTarget > 0 ? -rawTarget : rawTarget) : rawTarget;
      const current = numero(account.saldo_actual_centavos);
      const difference = target - current;
      await adminWrite("fin.account.reconcile", account.id, {
        cuentaId: account.id,
        saldoObjetivoCentavos: target,
        fecha: form.get("fecha"),
        motivo: form.get("motivo"),
      });
      cerrarEditor();
      toast(`Saldo conciliado. Diferencia registrada: ${difference >= 0 ? "+" : "-"}${money(Math.abs(difference))}`);
      await cargarProveedores(true);
      if (typeof cargarCuentasFin === "function") await cargarCuentasFin($("provMes")?.value);
    }, "Conciliar saldo");
  }

  function abrirTransferenciaFin() {
    const accounts = (finStateCache?.accounts || []).filter(account => account.estado !== "eliminada" && !account.oculta);
    if (accounts.length < 2) { toast("Necesitas al menos dos cuentas activas para transferir."); return; }
    const bank = accounts.find(account => account.nombre.toLowerCase().includes("popular")) || accounts.find(account => account.tipo === "banco") || accounts[0];
    const target = accounts.find(account => account.id !== bank.id) || accounts[1];
    const options = current => accounts.map(account => `<option value="${esc(account.id)}"${selected(current, account.id)}>${esc(account.nombre)} (${money(account.saldo_actual_centavos)})</option>`).join("");
    abrirEditor("Nueva transferencia", "Mueve dinero entre cuentas propias. El patrimonio no se duplica ni desaparece.", `
      <label><span>Cuenta de origen</span><select name="cuentaOrigenId">${options(bank.id)}</select></label>
      <label><span>Cuenta de destino</span><select name="cuentaDestinoId">${options(target.id)}</select></label>
      <label><span>Monto (RD$)</span><input name="monto" type="number" min="0.01" step="0.01" required></label>
      <label><span>Comision (RD$)</span><input name="comision" type="number" min="0" step="0.01" value="0.00"></label>
      <label><span>Fecha</span><input name="fecha" type="date" required value="${inputDate(new Date())}"></label>
      <label class="field-wide"><span>Descripcion</span><input name="descripcion" maxlength="500" placeholder="Ej. Deposito de efectivo a Banco Popular"></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="3" maxlength="1200"></textarea></label>`, async form => {
      await adminWrite("fin.transfer.create", null, {
        cuentaOrigenId: form.get("cuentaOrigenId"), cuentaDestinoId: form.get("cuentaDestinoId"),
        montoCentavos: centavosInput(form.get("monto")), comisionCentavos: centavosInput(form.get("comision")),
        fecha: form.get("fecha"), descripcion: form.get("descripcion"), nota: form.get("nota"),
      });
      cerrarEditor();
      await cargarCuentasFin($("provMes").value);
    });
  }

  function finCategoryOptions(type, current = "") {
    const state = finStateCache;
    const rows = (state?.categories || []).filter(item => item.tipo === type);
    const names = new Map(rows.map(item => [item.id, item.nombre]));
    return `<option value="">Selecciona la categoria</option>${rows.map(item => `<option value="${esc(item.id)}"${selected(current, item.id)}>${item.categoria_padre_id ? `${esc(names.get(item.categoria_padre_id) || "General")} / ` : ""}${esc(item.nombre)}</option>`).join("")}`;
  }

  function abrirMovimientoFin(defaultType = "gasto") {
    const state = finStateCache;
    if (!state?.accounts?.length) { toast("Agrega una cuenta antes de registrar movimientos."); return; }
    const prefs = state.preferences || {};
    const type = defaultType === "ingreso" ? "ingreso" : defaultType === "transferencia" ? "transferencia" : "gasto";
    const activeAccounts = state.accounts.filter(item => !item.oculta && item.estado !== "eliminada");
    const defaultAccount = type === "gasto" ? prefs.cuenta_gasto_default_id : prefs.cuenta_ingreso_default_id;
    const accountOptions = current => activeAccounts
      .map(item => `<option value="${esc(item.id)}"${selected(current, item.id)}>${esc(item.nombre)} &middot; ${money(item.saldo_actual_centavos)}</option>`).join("");
    const bank = activeAccounts.find(item => item.nombre.toLowerCase().includes("popular")) || activeAccounts.find(item => item.tipo === "banco") || activeAccounts[0];
    const otra = activeAccounts.find(item => item.id !== (bank && bank.id)) || activeAccounts[1] || activeAccounts[0];
    const esTransfer = type === "transferencia";
    abrirEditor("Entrada rapida", "Gasto, ingreso o transferencia entre tus cuentas. El teclado propio evita errores y funciona igual en iPhone y PC.", `
      <div class="fin-quick-entry field-wide">
        <div class="fin-quick-types"><button type="button" class="${type === "gasto" ? "act" : ""}" data-fin-quick-type="gasto">Gasto</button><button type="button" class="${type === "ingreso" ? "act" : ""}" data-fin-quick-type="ingreso">Ingreso</button><button type="button" class="${esTransfer ? "act" : ""}" data-fin-quick-type="transferencia">Transferencia</button></div>
        <input type="hidden" name="tipo" value="${type}"><input type="hidden" name="montoCentavos" value="0">
        <output id="finQuickAmount">RD$0.00</output>
        <div class="fin-number-pad" aria-label="Teclado de monto">
          ${["1","2","3","4","5","6","7","8","9","00","0","back"].map(key => `<button type="button" data-fin-key="${key}" aria-label="${key === "back" ? "Borrar" : key}">${key === "back" ? "&#9003;" : key}</button>`).join("")}
        </div>
      </div>
      <div id="finQuickOperacion" class="fin-quick-group${esTransfer ? " oculto" : ""}">
        <label><span>Categoria</span><select name="categoriaId" id="finQuickCategory"${esTransfer ? " disabled" : " required"}>${finCategoryOptions(esTransfer ? "gasto" : type)}</select></label>
        <label><span>Cuenta</span><select name="cuentaId"${esTransfer ? " disabled" : " required"}>${accountOptions(defaultAccount)}</select></label>
        <label><span>Persona o comercio</span><input name="payee" maxlength="180" placeholder="Opcional"${esTransfer ? " disabled" : ""}></label>
      </div>
      <div id="finQuickTransfer" class="fin-quick-group${esTransfer ? "" : " oculto"}">
        <label><span>Cuenta de origen</span><select name="cuentaOrigenId"${esTransfer ? "" : " disabled"}>${accountOptions(bank && bank.id)}</select></label>
        <label><span>Cuenta de destino</span><select name="cuentaDestinoId"${esTransfer ? "" : " disabled"}>${accountOptions(otra && otra.id)}</select></label>
        <label><span>Comision (RD$)</span><input name="comision" type="number" min="0" step="0.01" value="0.00"${esTransfer ? "" : " disabled"}></label>
      </div>
      <label><span>Fecha</span><input name="fecha" type="date" required value="${inputDate(new Date())}"></label>
      <label class="field-wide"><span>Descripcion</span><input name="descripcion" id="finQuickDesc" maxlength="500"${esTransfer ? "" : " required"} placeholder="Ej. Compra de materiales"></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="2" maxlength="1200"></textarea></label>`, async form => {
      const amount = numero(form.get("montoCentavos"));
      if (amount <= 0) throw new Error("Escribe un monto mayor que cero.");
      if (form.get("tipo") === "transferencia") {
        const origen = form.get("cuentaOrigenId");
        const destino = form.get("cuentaDestinoId");
        if (!origen || !destino) throw new Error("Elige la cuenta de origen y la de destino.");
        if (origen === destino) throw new Error("Elige dos cuentas distintas para transferir.");
        await adminWrite("fin.transfer.create", null, {
          cuentaOrigenId: origen, cuentaDestinoId: destino, montoCentavos: amount,
          comisionCentavos: centavosInput(form.get("comision") || "0"),
          fecha: form.get("fecha"), descripcion: form.get("descripcion"), nota: form.get("nota"),
        });
        cerrarEditor();
        await cargarProveedores(true);
        if (typeof cargarCuentasFin === "function") await cargarCuentasFin($("provMes")?.value);
        return;
      }
      await adminWrite("fin.movement.create", null, {
        tipo: form.get("tipo"), montoCentavos: amount, cuentaId: form.get("cuentaId"),
        categoriaId: form.get("categoriaId"), fecha: form.get("fecha"), payee: form.get("payee"),
        descripcion: form.get("descripcion"), nota: form.get("nota"), origen: "panel",
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
    let digits = "";
    const amountInput = $("editorFields").querySelector('[name="montoCentavos"]');
    const typeInput = $("editorFields").querySelector('[name="tipo"]');
    const categoryInput = $("finQuickCategory");
    const operacionBox = $("finQuickOperacion");
    const transferBox = $("finQuickTransfer");
    const descInput = $("finQuickDesc");
    const updateAmount = () => {
      const cents = numero(digits || 0);
      amountInput.value = String(cents);
      $("finQuickAmount").textContent = money(cents);
    };
    $("editorFields").querySelectorAll("[data-fin-key]").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.finKey === "back") digits = digits.slice(0, -1);
      else digits = `${digits}${button.dataset.finKey}`.replace(/^0+(?=\d)/, "").slice(0, 12);
      updateAmount();
    }));
    $("editorFields").querySelectorAll("[data-fin-quick-type]").forEach(button => button.addEventListener("click", () => {
      const nuevo = button.dataset.finQuickType;
      typeInput.value = nuevo;
      $("editorFields").querySelectorAll("[data-fin-quick-type]").forEach(item => item.classList.toggle("act", item === button));
      const transfer = nuevo === "transferencia";
      operacionBox.classList.toggle("oculto", transfer);
      transferBox.classList.toggle("oculto", !transfer);
      operacionBox.querySelectorAll("select,input").forEach(el => { el.disabled = transfer; });
      transferBox.querySelectorAll("select,input").forEach(el => { el.disabled = !transfer; });
      descInput.required = !transfer;
      if (!transfer) categoryInput.innerHTML = finCategoryOptions(nuevo);
    }));
  }

  function confirmarAnularMovimientoFin(movement) {
    abrirEditor("Anular movimiento", "El asiento queda visible en auditoria, pero deja de afectar saldos y reportes.", `
      <div class="confirm-panel field-wide"><strong>${esc(movement.descripcion || movement.payee || "Movimiento")}</strong><p>${esc(dateOnly(movement.fecha))} &middot; ${money(movement.monto_centavos)}</p></div>
      <label class="field-wide"><span>Motivo</span><textarea name="motivo" required rows="3" maxlength="500"></textarea></label>`, async form => {
      await adminWrite("fin.movement.cancel", movement.id, { motivo: form.get("motivo") });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function abrirCategoriaFin(category = null) {
    const item = category || { tipo: "gasto", nombre: "", categoria_padre_id: null, orden: 10 };
    const parentOptions = type => `<option value="">Categoria principal</option>${(finStateCache?.categories || []).filter(value => value.tipo === type && value.id !== item.id).map(value => `<option value="${esc(value.id)}"${selected(item.categoria_padre_id, value.id)}>${esc(value.nombre)}</option>`).join("")}`;
    abrirEditor(category ? "Editar categoria" : "Nueva categoria", "Las categorias pueden agruparse en padres e hijos, por ejemplo Transporte / Gasolina.", `
      <label><span>Tipo</span><select name="tipo" id="finCategoryType"><option value="gasto"${selected(item.tipo, "gasto")}>Gasto</option><option value="ingreso"${selected(item.tipo, "ingreso")}>Ingreso</option></select></label>
      <label><span>Pertenece a</span><select name="categoriaPadreId" id="finCategoryParent">${parentOptions(item.tipo)}</select></label>
      <label class="field-wide"><span>Nombre</span><input name="nombre" required maxlength="120" value="${esc(item.nombre)}"></label>
      <label><span>Orden</span><input name="orden" type="number" step="1" value="${esc(item.orden || 0)}"></label>`, async form => {
      await adminWrite("fin.category.upsert", category?.id, {
        nombre: form.get("nombre"), tipo: form.get("tipo"), categoriaPadreId: form.get("categoriaPadreId") || null,
        orden: Number(form.get("orden")) || 0,
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
    $("finCategoryType").addEventListener("change", event => { $("finCategoryParent").innerHTML = parentOptions(event.target.value); });
  }

  function abrirPresupuestoFin(budget = null) {
    const item = budget || { periodo: "mensual", periodo_inicio: `${$("provMes").value}-01`, monto_centavos: 0, alerta_porcentaje: 80 };
    abrirEditor(budget ? "Editar presupuesto" : "Nuevo presupuesto", "El progreso se calcula contra movimientos reales de la categoria, nunca contra estimaciones.", `
      <label><span>Categoria de gasto</span><select name="categoriaId" required>${finCategoryOptions("gasto", item.categoria_id)}</select></label>
      <label><span>Periodo</span><select name="periodo"><option value="semanal"${selected(item.periodo, "semanal")}>Semanal</option><option value="mensual"${selected(item.periodo, "mensual")}>Mensual</option><option value="anual"${selected(item.periodo, "anual")}>Anual</option></select></label>
      <label><span>Inicio</span><input name="periodoInicio" type="date" required value="${esc(item.periodo_inicio)}"></label>
      <label><span>Limite (RD$)</span><input name="monto" type="number" min="0.01" step="0.01" required value="${pesoInput(item.monto_centavos)}"></label>
      <label><span>Avisar al (%)</span><input name="alertaPorcentaje" type="number" min="1" max="100" value="${esc(item.alerta_porcentaje || 80)}"></label>`, async form => {
      await adminWrite("fin.budget.upsert", budget?.id, {
        categoriaId: form.get("categoriaId"), periodo: form.get("periodo"), periodoInicio: form.get("periodoInicio"),
        montoCentavos: centavosInput(form.get("monto")), alertaPorcentaje: Number(form.get("alertaPorcentaje")) || 80,
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function abrirTarjetaFin(accountId = null) {
    const state = finStateCache;
    const creditAccounts = state.accounts.filter(item => item.tipo === "tarjeta_credito" && item.estado !== "eliminada");
    if (!creditAccounts.length) { toast("Agrega primero una cuenta de tipo Tarjeta de credito."); setCostTab("cuentas"); return; }
    const account = creditAccounts.find(item => item.id === accountId) || creditAccounts[0];
    const card = state.cards.find(item => item.cuenta_id === account.id) || { cuenta_id: account.id, dia_corte: 30, dia_pago: 5, limite_credito_centavos: 0, color: "#18181B", metodo_visualizacion: "al_comprar" };
    const accountOptions = creditAccounts.map(item => `<option value="${esc(item.id)}"${selected(account.id, item.id)}>${esc(item.nombre)}</option>`).join("");
    const payOptions = `<option value="">Selecciona la cuenta de pago</option>${state.accounts.filter(item => item.tipo !== "tarjeta_credito" && !item.oculta).map(item => `<option value="${esc(item.id)}"${selected(card.cuenta_pago_id, item.id)}>${esc(item.nombre)}</option>`).join("")}`;
    abrirEditor("Configurar tarjeta", "Las compras aumentan la deuda y reducen el disponible. El pago mueve dinero del banco a la tarjeta sin crear otro gasto.", `
      <label><span>Cuenta de tarjeta</span><select name="cuentaId">${accountOptions}</select></label>
      <label><span>Cuenta habitual de pago</span><select name="cuentaPagoId">${payOptions}</select></label>
      <label><span>Dia de corte</span><input name="diaCorte" type="number" value="30" readonly></label>
      <label><span>Pago maximo</span><input name="diaPago" type="number" value="5" readonly></label>
      <label><span>Limite (RD$)</span><input name="limite" type="number" min="0" step="0.01" value="${pesoInput(card.limite_credito_centavos)}"></label>
      <label><span>Color</span><input name="color" type="color" value="${esc(card.color || "#18181B")}"></label>
      <p class="field-hint field-wide">La tarjeta cierra el dia 30 y debe pagarse, como maximo, el dia 5 del mes siguiente.</p>
      <label class="field-wide"><span>Mostrar el gasto</span><select name="metodoVisualizacion"><option value="al_comprar"${selected(card.metodo_visualizacion, "al_comprar")}>Cuando se compra (recomendado)</option><option value="al_pagar"${selected(card.metodo_visualizacion, "al_pagar")}>Cuando se paga</option></select></label>`, async form => {
      await adminWrite("fin.card.upsert", form.get("cuentaId"), {
        cuentaId: form.get("cuentaId"), cuentaPagoId: form.get("cuentaPagoId") || null,
        diaCorte: Number(form.get("diaCorte")), diaPago: Number(form.get("diaPago")),
        limiteCreditoCentavos: centavosInput(form.get("limite")), color: form.get("color"),
        metodoVisualizacion: form.get("metodoVisualizacion"),
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function abrirPagoTarjetaFin(accountId) {
    const state = finStateCache;
    const card = state.cards.find(item => item.cuenta_id === accountId);
    const account = state.accounts.find(item => item.id === accountId);
    const sources = state.accounts.filter(item => item.id !== accountId && item.tipo !== "tarjeta_credito" && !item.oculta);
    if (!card || !sources.length) { toast("Configura la tarjeta y una cuenta de pago antes de continuar."); return; }
    const sourceOptions = sources.map(item => `<option value="${esc(item.id)}"${selected(card.cuenta_pago_id, item.id)}>${esc(item.nombre)} &middot; ${money(item.saldo_actual_centavos)}</option>`).join("");
    abrirEditor("Pagar tarjeta", "Este pago reduce la cuenta de origen y la deuda de la tarjeta. No se registra como gasto otra vez.", `
      <div class="confirm-panel field-wide"><strong>${esc(account.nombre)}</strong><p>Deuda actual: ${money(Math.max(0, -numero(account.saldo_actual_centavos)))}</p></div>
      <label><span>Cuenta de origen</span><select name="cuentaOrigenId">${sourceOptions}</select></label>
      <input type="hidden" name="cuentaDestinoId" value="${esc(accountId)}">
      <label><span>Monto (RD$)</span><input name="monto" type="number" min="0.01" step="0.01" required></label>
      <label><span>Fecha</span><input name="fecha" type="date" required value="${inputDate(new Date())}"></label>
      <label class="field-wide"><span>Nota</span><textarea name="nota" rows="2" maxlength="1200"></textarea></label>`, async form => {
      await adminWrite("fin.card.payment", null, {
        cuentaOrigenId: form.get("cuentaOrigenId"), cuentaDestinoId: accountId,
        montoCentavos: centavosInput(form.get("monto")), fecha: form.get("fecha"), nota: form.get("nota"),
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  function abrirDivisaFin(currency = null) {
    const item = currency || { codigo: "USD", nombre: "Dolar estadounidense", simbolo: "US$", tasa_a_principal: 1, principal: false, activa: true };
    abrirEditor(currency ? "Editar divisa" : "Agregar divisa", "La tasa indica cuantas unidades de la moneda principal equivalen a una unidad de esta divisa.", `
      <label><span>Codigo</span><input name="codigo" required minlength="3" maxlength="8" value="${esc(item.codigo)}"></label>
      <label><span>Simbolo</span><input name="simbolo" required maxlength="12" value="${esc(item.simbolo)}"></label>
      <label class="field-wide"><span>Nombre</span><input name="nombre" required maxlength="120" value="${esc(item.nombre)}"></label>
      <label><span>Tasa a moneda principal</span><input name="tasa" type="number" min="0.00000001" step="0.00000001" value="${esc(item.tasa_a_principal)}"></label>
      <label class="check-row"><input name="principal" type="checkbox"${checked(item.principal)}><span>Moneda principal</span></label>
      <label class="check-row"><input name="activa" type="checkbox"${checked(item.activa !== false)}><span>Divisa activa</span></label>`, async form => {
      await adminWrite("fin.currency.upsert", currency?.id, {
        codigo: form.get("codigo"), nombre: form.get("nombre"), simbolo: form.get("simbolo"),
        tasaAPrincipal: Number(form.get("tasa")), principal: form.has("principal"), activa: form.has("activa"),
      });
      cerrarEditor();
      await cargarProveedores(true);
    });
  }

  async function guardarPreferenciasFin(formElement) {
    const form = new FormData(formElement);
    await adminWrite("fin.preferences.upsert", null, {
      monedaPrincipal: form.get("monedaPrincipal"), periodoDashboard: form.get("periodoDashboard"),
      cuentaGastoDefaultId: form.get("cuentaGastoDefaultId") || null,
      cuentaIngresoDefaultId: form.get("cuentaIngresoDefaultId") || null,
      locale: "es-DO", semanaInicia: 1,
    });
    finDashboardPeriod = form.get("periodoDashboard");
    await cargarProveedores(true);
  }

  function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarFinCsv() {
    const state = finStateCache;
    const accounts = new Map(state.accounts.map(item => [item.id, item.nombre]));
    const categories = new Map(state.categories.map(item => [item.id, item.nombre]));
    const header = ["Fecha","Hora","Tipo","Cuenta origen","Cuenta destino","Categoria","Persona o comercio","Descripcion","Nota","Monto centavos","Monto RD$","Folio","Origen"];
    const rows = finFilteredMovements.map(item => [item.fecha,item.hora || "",item.tipo,accounts.get(item.cuenta_id) || "",accounts.get(item.cuenta_destino_id) || "",categories.get(item.categoria_id) || "",item.payee || "",item.descripcion || "",item.nota || "",item.monto_centavos,(numero(item.monto_centavos)/100).toFixed(2),item.venta_folio || "",item.origen || ""]);
    const csv = `\uFEFF${[header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}`;
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `DCARELA_FINANZAS_${$("provMes").value}.csv`);
  }

  function exportarFinPdf() {
    const state = finStateCache;
    const accounts = new Map(state.accounts.map(item => [item.id, item.nombre]));
    const categories = new Map(state.categories.map(item => [item.id, item.nombre]));
    const doc = nuevoPdf("Libro financiero", `Mes: ${$("provMes").value} | ${finFilteredMovements.length} movimientos filtrados`);
    doc.autoTable({
      ...opcionesTablaPdf(), startY: 34,
      head: [["Fecha","Tipo","Cuenta","Categoria","Detalle","Monto"]],
      body: finFilteredMovements.map(item => [item.fecha,item.tipo,accounts.get(item.cuenta_id) || "--",categories.get(item.categoria_id) || "--",item.descripcion || item.payee || "--",`${item.tipo === "gasto" ? "-" : item.tipo === "ingreso" ? "+" : ""}${money(item.monto_centavos)}`]),
      didParseCell: hook => {
        if (hook.section !== "body" || hook.column.index !== 5) return;
        const item = finFilteredMovements[hook.row.index];
        if (item?.tipo === "gasto") hook.cell.styles.textColor = [197,63,72];
        if (item?.tipo === "ingreso") hook.cell.styles.textColor = [22,133,121];
      },
    });
    doc.save(`DCARELA_FINANZAS_${$("provMes").value}.pdf`);
  }

  async function todosMovimientosFin() {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.from("fin_movimientos").select("*").eq("business_id", BUSINESS).order("fecha", { ascending: true }).range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function backupFinanzas() {
    const state = finStateCache;
    $("finBackupStatus").textContent = "Preparando copia completa desde Supabase...";
    const movements = await todosMovimientosFin();
    const payload = {
      schema: "dcarela-finanzas-v1", generated_at: new Date().toISOString(), business_id: BUSINESS,
      version_pos: "1.0.17", accounts: state.accounts, categories: state.categories, movements,
      cards: state.cards, budgets: state.budgets, preferences: state.preferences, currencies: state.currencies,
      pending_transfers: state.pendingTransfers || [],
      checksum_basis: `${state.accounts.length}:${state.categories.length}:${movements.length}:${movements.reduce((sum, item) => sum + numero(item.monto_centavos), 0)}`,
    };
    const name = `DCARELA_FINANZAS_BACKUP_${inputDate(new Date())}.json`;
    const file = new File([JSON.stringify(payload, null, 2)], name, { type: "application/json" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: "Copia de Finanzas D' Carela", text: "Respaldo completo para guardar en iCloud Drive o Google Drive.", files: [file] });
      $("finBackupStatus").textContent = `Copia compartida: ${movements.length.toLocaleString("es-DO")} movimientos.`;
    } else {
      downloadBlob(file, name);
      $("finBackupStatus").textContent = `Copia descargada: ${movements.length.toLocaleString("es-DO")} movimientos.`;
    }
  }

  async function validarBackupFinanzas(file) {
    if (!file) return;
    const payload = JSON.parse(await file.text());
    if (payload?.schema !== "dcarela-finanzas-v1" || !Array.isArray(payload.accounts) || !Array.isArray(payload.movements)) throw new Error("El archivo no es una copia valida de Finanzas D' Carela.");
    $("finBackupStatus").textContent = `Archivo valido: ${payload.accounts.length} cuenta(s), ${payload.categories?.length || 0} categoria(s) y ${payload.movements.length.toLocaleString("es-DO")} movimiento(s). Solo se verifico; no se modifico la nube.`;
  }

  function subscribeFinanceRealtime() {
    if (finRealtimeChannel || !sb) return;
    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!$("v-finanzas").classList.contains("oculto")) cargarProveedores(true).catch(error => toast(error.message));
      }, 500);
    };
    finRealtimeChannel = sb.channel(`dcarela-finance-${BUSINESS}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_movimientos", filter: `business_id=eq.${BUSINESS}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_cuentas", filter: `business_id=eq.${BUSINESS}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_presupuestos", filter: `business_id=eq.${BUSINESS}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_tarjetas", filter: `business_id=eq.${BUSINESS}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_transferencias_pendientes", filter: `business_id=eq.${BUSINESS}` }, refresh)
      .subscribe();
  }

  async function cargarProveedores(force = false) {
    if (!$("provMes").value) $("provMes").value = inputDate(new Date()).slice(0, 7);
    const month = $("provMes").value;
    const from = inicioDia(`${month}-01`);
    const endDate = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
    const to = finDia(inputDate(endDate));
    const [state, salesResult] = await Promise.all([cargarCostosCloud(force), ventasActivas(from, to, 20000)]);
    const monthExpenses = state.expenses.filter(item => item.activo && monthOf(item.fecha || item._latestAt) === month);
    const monthPayments = state.payments.filter(item => monthOf(item.fecha) === month);
    const monthObligations = state.obligations.filter(item => monthOf(item.venceEn) === month && !["anulada", "pagada"].includes(item.estado));
    const overdue = state.obligations.filter(item => item.estado === "vencida");
    const expensesTotal = monthExpenses.reduce((sum, item) => sum + numero(item.montoCentavos), 0);
    const paidTotal = monthPayments.reduce((sum, item) => sum + numero(item.montoCentavos), 0);
    const dueTotal = monthObligations.reduce((sum, item) => sum + numero(item.saldoCentavos), 0);
    const overdueTotal = overdue.reduce((sum, item) => sum + numero(item.saldoCentavos), 0);
    const salesTotal = salesResult.active.reduce((sum, item) => sum + totalDe(P(item)), 0);
    const committed = expensesTotal + paidTotal + dueTotal;
    const net = salesTotal - expensesTotal - paidTotal;
    const activeRecurring = state.recurrents.filter(item => item.activo);

    $("provResumen").innerHTML = metric("Ventas del mes", money(salesTotal)) + metric("Gastos", money(expensesTotal))
      + metric("Pagado en obligaciones", money(paidTotal)) + metric("Por pagar este mes", money(dueTotal))
      + metric("Vencido", money(overdueTotal)) + metric("Resultado disponible", money(net));
    $("provAnalisis").innerHTML = `<div class="surface-title"><div><h3>Analisis del mes</h3><p>Ventas contra gastos y compromisos registrados.</p></div></div>
      <div class="analysis-result"><span>Ventas netas</span><strong>${money(salesTotal)}</strong><span>Gastos registrados</span><strong>${money(expensesTotal)}</strong><span>Pagos de deudas</span><strong>${money(paidTotal)}</strong><span>Comprometido + pendiente</span><strong>${money(committed)}</strong><span>Resultado despues de pagos</span><strong class="net ${net < 0 ? "bad" : ""}">${money(net)}</strong></div>`;
    const upcoming = state.obligations.filter(item => ["vencida", "pendiente", "parcial"].includes(item.estado)).slice(0, 6);
    $("provVencimientos").innerHTML = upcoming.length ? upcoming.map(item => `<article class="due-item ${item.estado === "vencida" ? "overdue" : ""}"><strong>${esc(item.concepto)}</strong><span>${esc(item.acreedor || item.categoria)} | ${money(item.saldoCentavos)}</span><span>${item.estado === "vencida" ? "Vencida" : "Pagar"} ${esc(dateOnly(item.venceEn))}</span></article>`).join("") : '<div class="empty-state">No hay vencimientos pendientes.</div>';

    const expenseHeaders = ["Fecha", "Categoria", "Descripcion", "Metodo", "Monto", "Usuario", "Nota"];
    if (canEdit) expenseHeaders.push("Acciones");
    $("provGastosTabla").innerHTML = tabla(monthExpenses, item => {
      const row = [fecha(item.fecha || item._latestAt), esc(item.categoria), `<span class="cost-name">${esc(item.descripcion)}</span>`, esc(item.metodoPago || item.metodo || "--"), money(item.montoCentavos), esc(item.usuarioNombre || "--"), esc(item.nota || "")];
      if (canEdit) row.push(`<div class="row-actions"><button class="table-action" data-edit-expense="${esc(item.id)}">Editar</button><button class="table-action danger" data-delete-expense="${esc(item.id)}">Anular</button></div>`);
      return row;
    }, expenseHeaders);

    const recurringHeaders = ["Plan", "Categoria", "Frecuencia", "Proximo", "Monto", "Tipo", "Metodo", "Estado"];
    if (canEdit) recurringHeaders.push("Acciones");
    $("provRecurrentesTabla").innerHTML = tabla(state.recurrents, item => {
      const row = [`<span class="cost-name">${esc(item.nombre)}</span><span class="cost-sub">${esc(item.acreedor || item.descripcion || "")}</span>`, esc(item.categoria), esc(item.frecuencia), esc(dateOnly(item.proximaFecha)), money(item.montoEstimadoCentavos), item.montoVariable ? "Variable" : "Fijo", esc(item.metodoPago || "--"), `<span class="tag ${item.activo ? "ok" : "bad"}">${item.activo ? "Activo" : "Inactivo"}</span>`];
      if (canEdit) row.push(`<div class="row-actions"><button class="table-action" data-edit-recurring="${esc(item.id)}">Editar</button>${item.activo ? `<button class="table-action danger" data-stop-recurring="${esc(item.id)}">Desactivar</button>` : ""}</div>`);
      return row;
    }, recurringHeaders);

    const obligationHeaders = ["Vence", "Concepto", "Categoria", "Factura", "Total", "Saldo", "Estado", "Documento"];
    if (canEdit) obligationHeaders.push("Acciones");
    $("provObligacionesTabla").innerHTML = tabla(state.obligations, item => {
      const hasDocument = Boolean(item.adjuntoNombre || item.storagePath || item.adjuntoRuta || item.adjuntoUrl);
      const row = [esc(dateOnly(item.venceEn)), `<span class="cost-name">${esc(item.concepto)}</span><span class="cost-sub">${esc(item.acreedor || "")}</span>`, esc(item.categoria), esc(item.numeroFactura || "--"), money(item.montoCentavos), money(item.saldoCentavos), `<strong class="status-${item.estado === "pagada" ? "paid" : item.estado === "vencida" ? "overdue" : "pending"}">${esc(item.estado)}</strong>`, hasDocument ? `<button class="table-action" data-open-obligation="${esc(item.id)}">Abrir</button>` : "--"];
      if (canEdit) row.push(`<div class="row-actions"><button class="table-action" data-edit-obligation="${esc(item.id)}">Editar</button>${numero(item.saldoCentavos) > 0 && !["anulada", "pagada"].includes(item.estado) ? `<button class="table-action" data-pay-obligation="${esc(item.id)}">Pagar</button><button class="table-action danger" data-cancel-obligation="${esc(item.id)}">Anular</button>` : ""}</div>`);
      return row;
    }, obligationHeaders);

    const monthReceipts = state.receipts.filter(item => monthOf(item.pagadoEn || item.creadoEn || item._latestAt) === month);
    const receiptHeaders = ["Fecha", "Beneficiario", "Concepto", "Metodo", "Monto", "Firma", "Estado"];
    receiptHeaders.push("Acciones");
    $("provRecibosTabla").innerHTML = tabla(monthReceipts, item => {
      const active = item.estado !== "anulado";
      return [fecha(item.pagadoEn || item.creadoEn || item._latestAt), `<span class="cost-name">${esc(item.beneficiario)}</span><span class="cost-sub">${esc(item.documentoIdentidad || "")}</span>`, esc(item.concepto), esc(item.metodoPago || "--"), money(item.montoCentavos), `<span class="tag ${item.firmado ? "ok" : "warn"}">${item.firmado ? "Firmado" : "Pendiente"}</span>`, `<span class="tag ${active ? "ok" : "bad"}">${active ? "Emitido" : "Anulado"}</span>`, `<div class="row-actions"><button class="table-action" data-print-receipt="${esc(item.id)}">Imprimir</button>${canEdit && active ? `<button class="table-action" data-sign-receipt="${esc(item.id)}">${item.firmado ? "Quitar firma" : "Marcar firmado"}</button><button class="table-action danger" data-cancel-receipt="${esc(item.id)}">Anular</button>` : ""}</div>`];
    }, receiptHeaders);
    wireCostActions(state);
    setCostTab(costTab);
    $("provPanelRecurrentes").querySelector(".surface-title p").textContent = `${activeRecurring.length} plan(es) activo(s). Genera obligaciones hasta el mes siguiente sin duplicados.`;
    try {
      await cargarCuentasFin(month);
      const quickRequested = new URLSearchParams(location.search).get("quick") === "1";
      if (quickRequested && !sessionStorage.getItem("dcarela.fin.quick.opened")) {
        sessionStorage.setItem("dcarela.fin.quick.opened", "1");
        setCostTab("movimientos");
        setTimeout(() => abrirMovimientoFin("gasto"), 120);
      }
    } catch (error) {
      $("finCuentasCards").innerHTML = "";
      $("finMovimientosTabla").innerHTML = `<div class="empty-state"><strong>No se pudo cargar Finanzas.</strong><p>${esc(error?.message || error)}</p></div>`;
      throw error;
    }
  }

  function alertDefinition(event) {
    const payload = P(event);
    const summary = resumenEvento(event);
    const severity = ["CierreConDiferencia", "ErrorSincronizacion", "BackupSnapshotFallido", "DispositivoBloqueado"].includes(event.event_type)
      ? "critical" : ["VentaCancelada", "DevolucionRegistrada", "InventarioBajo", "ProductoAgotado", "CompraCreditoProveedorRegistrada", "CostoObligacionGenerada", "CostoObligacionGuardada", "GastoEliminado"].includes(event.event_type)
        ? "warning" : "info";
    const targets = {
      CierreConDiferencia: "caja", CajaAbierta: "caja", CajaCerrada: "caja",
      VentaCancelada: "ventas", DevolucionRegistrada: "ventas",
      InventarioBajo: "inventario", ProductoAgotado: "inventario",
      ErrorSincronizacion: "notificaciones", BackupSnapshotFallido: "respaldos",
      ErrorImpresionCorte: "caja",
      DispositivoBloqueado: "dispositivos", CompraCreditoProveedorRegistrada: "finanzas",
      PagoProveedorRegistrado: "finanzas", GastoRegistrado: "finanzas", GastoEditado: "finanzas",
      GastoEliminado: "finanzas", CostoRecurrenteGuardado: "finanzas",
      CostoObligacionGenerada: "finanzas", CostoObligacionGuardada: "finanzas",
      CostoPagoRegistrado: "finanzas", CostoObligacionAnulada: "finanzas",
      ReciboPagoEmitido: "finanzas", ReciboPagoFirmaActualizada: "finanzas",
      ReciboPagoAnulado: "finanzas",
      ActualizacionDisponible: "descargar"
    };
    return {
      key: `event:${event.event_id || event.entity_id || fechaEventoIso(event)}`,
      source: "event", sourceId: null, severity, type: event.event_type,
      title: summary.title, message: summary.detail || summary.category,
      createdAt: fechaEventoIso(event), target: targets[event.event_type] || "dashboard",
      entityId: event.entity_id || payload.entity_id || null, payload
    };
  }

  function readSet() {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); }
    catch { return new Set(); }
  }

  async function obtenerAlertas(force = false) {
    if (!force && alertasCache) return alertasCache;
    if (Date.now() - costAlertsAt > 60000) {
      costAlertsAt = Date.now();
      await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-alerts?business_id=${encodeURIComponent(BUSINESS)}&limit=1`, {
        headers: await authenticatedHeaders()
      }).catch(() => null);
    }
    const [systemResult, eventResult] = await Promise.allSettled([
      sb.from("system_alerts").select("id,severity,alert_type,title,message,payload,acknowledged_at,created_at,device_id")
        .eq("business_id", BUSINESS).order("created_at", { ascending: false }).limit(250),
      eventos(RELEVANT_EVENTS, null, null, 400)
    ]);
    const localRead = readSet();
    const alerts = [];
    if (systemResult.status === "fulfilled" && !systemResult.value.error) {
      (systemResult.value.data || []).forEach(item => alerts.push({
        key: `system:${item.id}`, source: "system", sourceId: item.id,
        severity: item.severity || "info", type: item.alert_type || "alerta",
        title: item.title || "Alerta POS", message: item.message || "",
        createdAt: item.created_at, target: item.payload?.target || null, payload: item.payload || {},
        entityId: item.payload?.entity_id || item.payload?.ventaId || item.payload?.venta_id || null,
        acknowledged: Boolean(item.acknowledged_at)
      }));
    }
    if (eventResult.status === "fulfilled") eventResult.value.forEach(event => alerts.push(alertDefinition(event)));
    const seen = new Set();
    alertasCache = alerts.filter(alert => {
      const minute = String(alert.createdAt || "").slice(0, 16);
      const identity = alert.entityId ? `entity:${String(alert.entityId).toLowerCase()}` : `time:${minute}|${alert.title}`;
      const fingerprint = `${alert.type}|${identity}`;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      alert.read = alert.acknowledged || localRead.has(alert.key);
      return true;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    actualizarContadorAlertas();
    return alertasCache;
  }

  function actualizarContadorAlertas() {
    const count = (alertasCache || []).filter(alert => !alert.read).length;
    $("alertCount").textContent = count > 99 ? "99+" : String(count);
    $("navAlertas").textContent = count > 99 ? "99+" : String(count);
    $("navAlertas").classList.toggle("oculto", count === 0);
  }

  function destinoAlerta(alert) {
    if (alert.target) return alert.target;
    const type = String(alert.type || "").toLowerCase();
    if (type.includes("inventario") || type.includes("stock") || type.includes("agotado")) return "inventario";
    if (type.includes("backup") || type.includes("respaldo")) return "respaldos";
    if (type.includes("caja") || type.includes("cierre") || type.includes("arqueo")) return "caja";
    if (type.includes("venta") || type.includes("devolucion")) return "ventas";
    if (type.includes("cliente") || type.includes("credito")) return "clientes";
    if (type.includes("proveedor") || type.includes("gasto") || type.includes("costo") || type.includes("deuda") || type.includes("obligacion")) return "finanzas";
    if (type.includes("dispositivo")) return "dispositivos";
    if (type.includes("version") || type.includes("actualizacion")) return "descargar";
    return "notificaciones";
  }

  async function marcarAlerta(alert) {
    const read = readSet();
    read.add(alert.key);
    localStorage.setItem(READ_KEY, JSON.stringify([...read].slice(-1200)));
    alert.read = true;
    if (alert.source === "system" && alert.sourceId && session?.user?.id) {
      await sb.from("system_alerts").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: session.user.id })
        .eq("id", alert.sourceId).eq("business_id", BUSINESS).then(() => {});
    }
    actualizarContadorAlertas();
  }

  async function cargarNotificaciones() {
    const alerts = await obtenerAlertas(true);
    const filter = $("alertFilter").value;
    const visible = alerts.filter(alert => filter === "all" || (filter === "open" ? !alert.read : alert.severity === filter));
    $("notificacionesResumen").innerHTML = metric("Sin leer", String(alerts.filter(alert => !alert.read).length)) + metric("Criticas", String(alerts.filter(alert => alert.severity === "critical" && !alert.read).length)) + metric("Advertencias", String(alerts.filter(alert => alert.severity === "warning" && !alert.read).length)) + metric("Historial cargado", String(alerts.length));
    $("notificacionesLista").innerHTML = visible.length ? visible.map((alert, index) => `<article class="notification ${esc(alert.severity)} ${alert.read ? "read" : ""}" data-index="${index}"><span class="notification-marker"></span><div class="notification-copy"><strong>${esc(alert.title)}</strong><p>${esc(alert.message)}</p><div class="notification-meta"><span>${esc(fecha(alert.createdAt))}</span><span>${esc(alert.type)}</span><span>${alert.source === "system" ? "Alerta nube" : "Evento POS"}</span></div></div><div class="notification-actions"><button data-action="open" data-key="${esc(alert.key)}">Abrir</button>${alert.read ? "" : `<button data-action="read" data-key="${esc(alert.key)}">Leida</button>`}</div></article>`).join("") : '<div class="surface empty-state">No hay notificaciones para este filtro.</div>';
    $("notificacionesLista").querySelectorAll("button").forEach(button => button.addEventListener("click", async () => {
      const alert = alerts.find(item => item.key === button.dataset.key);
      if (!alert) return;
      await marcarAlerta(alert);
      if (button.dataset.action === "open") location.hash = destinoAlerta(alert);
      else cargarNotificaciones();
    }));
  }

  async function renderAlertPreview() {
    const alerts = await obtenerAlertas();
    const open = alerts.filter(alert => !alert.read).slice(0, 5);
    $("alertPreview").innerHTML = open.length ? open.map(alert => `<a href="#${esc(destinoAlerta(alert))}" class="preview-alert ${esc(alert.severity)}"><strong>${esc(alert.title)}</strong><span>${esc(alert.message)}</span></a>`).join("") : '<div class="empty-state">No hay alertas abiertas.</div>';
  }

  async function cargarDispositivos() {
    const devices = await getDevices();
    $("devTabla").innerHTML = devices.length ? devices.map(device => `<div class="device-row"><div><strong>${esc(device.device_name || "Dispositivo")}</strong><small>Caja: ${esc(device.cash_register_id || "--")} | Ultima conexion: ${esc(fecha(device.last_seen_at))} | Version: ${esc(device.installed_version || "--")}</small></div><span class="tag ${device.status === "activa" ? "ok" : "bad"}">${esc(device.status)}</span><button class="${device.status === "activa" ? "secondary" : "primary"}" data-device="${esc(device.id)}" data-status="${device.status === "activa" ? "bloqueada" : "activa"}">${device.status === "activa" ? "Bloquear" : "Reactivar"}</button></div>`).join("") : '<div class="empty-state">Sin dispositivos registrados.</div>';
    $("devTabla").querySelectorAll("button[data-device]").forEach(button => button.addEventListener("click", () => cambiarDispositivo(button.dataset.device, button.dataset.status)));
  }

  async function cambiarDispositivo(deviceId, status) {
    if (status === "bloqueada" && !window.confirm("Bloquear este dispositivo impedira nuevas sincronizaciones. Continuar?")) return;
    if (authProvider === "firebase") {
      await adminWrite("device.status", deviceId, { status });
      toast(status === "bloqueada" ? "Dispositivo bloqueado." : "Dispositivo reactivado.");
      await cargarDispositivos();
      return;
    }
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-device-block`, {
      method: "POST",
      headers: await authenticatedHeaders(true),
      body: JSON.stringify({ business_id: BUSINESS, device_id: deviceId, status })
    });
    if (!response.ok) throw new Error(`No se pudo cambiar el dispositivo (HTTP ${response.status}).`);
    toast(status === "bloqueada" ? "Dispositivo bloqueado." : "Dispositivo reactivado.");
    cargarDispositivos();
  }

  async function cargarRespaldos() {
    const backups = await getBackups(100);
    const valid = backups.filter(item => ["subido", "verificado", "correcto"].includes(String(item.status).toLowerCase()));
    const failed = backups.filter(item => String(item.status).toLowerCase().includes("fall"));
    $("bakResumen").innerHTML = metric("Snapshots", String(backups.length)) + metric("Correctos", String(valid.length)) + metric("Fallidos", String(failed.length)) + metric("Ultimo", backups[0] ? fecha(backups[0].created_at) : "--");
    $("bakTabla").innerHTML = tabla(backups, backup => [fecha(backup.created_at), backup.backup_type || "snapshot", Math.round(numero(backup.size) / 1024) + " KB", `<span class="tag ${failed.includes(backup) ? "bad" : "ok"}">${esc(backup.status)}</span>`, backup.verified_at ? fecha(backup.verified_at) : "--", (backup.storage_path || "").split("/").pop() || "--"], ["Fecha", "Tipo", "Tamano", "Estado", "Verificado", "Archivo"]);
  }

  async function cargarRecursos() {
    verEstado(true, "Banco de Recursos conectado");
  }

  async function cargarConfiguracion() {
    $("cfgInfo").innerHTML = `<div class="config-line"><span>Proyecto</span><strong>${esc(authProvider === "firebase" ? "Firebase erikccarela" : cfg.url)}</strong></div><div class="config-line"><span>Negocio</span><strong>${esc(BUSINESS)}</strong></div><div class="config-line"><span>Usuario</span><strong>${esc(session?.user?.email || "--")}</strong></div><div class="config-line"><span>Rol</span><strong>${esc(memberRole)}${canEdit ? " | edicion habilitada" : " | solo lectura"}</strong></div><div class="config-line"><span>Sesion</span><strong>${authProvider === "firebase" ? "Firebase Auth · reglas verificadas" : "Supabase Auth"}</strong></div>`;
    const negocio = await cargarNegocioCloud();
    $("negNombre").value = negocio.nombre || "";
    $("negRnc").value = negocio.rnc || "";
    $("negSlogan").value = negocio.slogan || "";
    $("negDireccion").value = negocio.direccion || "";
    $("negWhatsapp").value = negocio.whatsapp || "";
    $("negTelefono").value = negocio.telefono || "";
    $("negInstagram").value = negocio.instagram || "";
    $("negTiktok").value = negocio.tiktok || "";
    $("negTicketPie").value = negocio.ticketPie || "";
    $("negLogoActivo").checked = ![false, "0", 0].includes(negocio.logoActivo);
    const changes = await eventos(["ConfiguracionActualizada", "FuenteVisualActualizada", "CategoriasNormalizadas", "TextosMigracionReparados", "ProveedoresDepurados"], null, null, 100);
    $("cfgEventos").innerHTML = tabla(changes, event => [fecha(fechaEventoIso(event)), event.event_type, P(event).seccion || event.entity_id || "--", P(event).usuarioNombre || "--"], ["Fecha", "Evento", "Seccion", "Usuario"]);
  }

  async function guardarNegocio() {
    const data = {
      nombre: $("negNombre").value.trim(), rnc: $("negRnc").value.trim(), slogan: $("negSlogan").value.trim(),
      direccion: $("negDireccion").value.trim(), whatsapp: $("negWhatsapp").value.trim(), telefono: $("negTelefono").value.trim(),
      instagram: $("negInstagram").value.trim(), tiktok: $("negTiktok").value.trim(), ticketPie: $("negTicketPie").value.trim(),
      logoActivo: $("negLogoActivo").checked
    };
    if (!data.nombre) { $("negNombre").focus(); throw new Error("El nombre comercial es obligatorio."); }
    await adminWrite("business.update", "negocio", data);
    businessConfig = { ...data, logoActivo: data.logoActivo ? "1" : "0" };
    await cargarConfiguracion();
  }

  async function cambiarClaveCuenta() {
    const nueva = $("cfgNuevaClave").value;
    const confirmacion = $("cfgConfirmarClave").value;
    const estado = $("cfgClaveEstado");
    if (!session?.user) throw new Error("La sesion vencio. Inicia sesion nuevamente.");
    if (nueva.length < 10) {
      $("cfgNuevaClave").focus();
      throw new Error("La nueva contrasena debe tener al menos 10 caracteres.");
    }
    if (nueva !== confirmacion) {
      $("cfgConfirmarClave").focus();
      throw new Error("Las contrasenas no coinciden.");
    }
    estado.textContent = "Actualizando la contrasena...";
    if (authProvider === "firebase") {
      await window.DcarelaFirebase.updatePassword(nueva);
    } else {
      const { data, error } = await sb.auth.updateUser({ password: nueva });
      if (error) throw error;
      session = data?.session || session;
    }
    $("formCambiarClave").reset();
    estado.textContent = "Contrasena actualizada. La sesion actual permanece protegida.";
    toast("Contrasena actualizada correctamente.");
  }

  async function consultarVersion() {
    const response = await fetch(`./app-version.json?desktop=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Manifiesto público de versiones no disponible (HTTP ${response.status}).`);
    const body = await response.json();
    const latest = body?.desktop_release || body?.latest || body?.data || (body?.version ? body : null);
    if (!latest?.version || !latest?.release_url || !latest?.sha256) {
      throw new Error("El manifiesto público de la caja está incompleto.");
    }
    return latest;
  }

  async function consultarVersionAplicacion() {
    const response = await fetch(`./app-version.json?check=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`No se pudo consultar la versión web (HTTP ${response.status}).`);
    const body = await response.json();
    if (!body?.web_version || !body?.pwa_version) throw new Error("El manifiesto de versiones está incompleto.");
    return body;
  }

  function marcarEstadoActualizacion(id, text, tone = "") {
    const target = $(id);
    if (!target) return;
    target.textContent = text;
    target.className = `tag${tone ? ` ${tone}` : ""}`;
  }

  async function registroPwa(forzar = false) {
    if (!("serviceWorker" in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration()
      || await navigator.serviceWorker.register("./sw.js");
    if (forzar) await registration.update();
    return registration;
  }

  function pwaInstalada() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches
      || window.navigator.standalone === true;
  }

  function renderOtrasHerramientas(apps) {
    const target = $("updateSuiteApps");
    if (!target) return;
    const items = Array.isArray(apps) ? apps : [];
    target.innerHTML = items.length ? items.map(app => {
      const published = app.status === "published";
      const beta = app.status === "beta_unsigned";
      const available = Boolean(app.url) && (published || beta);
      const statusLabel = published ? "Publicada" : beta ? "Beta manual" : "En preparación";
      const action = app.url
        ? `<a class="button-link" href="${esc(app.url)}" target="_blank" rel="noopener">${esc(app.action || (published ? "Abrir herramienta" : "Descargar beta"))}</a>`
        : '<span class="tag">Publicación pendiente</span>';
      return `<article class="update-suite-app"><div><span class="update-suite-dot ${published ? "ok" : ""}" aria-hidden="true"></span><div><strong>${esc(app.name || app.id || "Herramienta")}</strong><small>${esc(app.platform || "")}</small></div></div><span class="tag ${published ? "ok" : "warn"}">${esc(statusLabel)}</span><p>${esc(app.notes || "")}</p><div class="update-suite-version"><span>Versión</span><strong>${esc(app.version || "--")}</strong></div>${available ? action : app.url ? action : '<span class="tag">Publicación pendiente</span>'}</article>`;
    }).join("") : '<div class="empty-state">No hay otras herramientas registradas en el manifiesto común.</div>';
  }

  function tamanoArchivo(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return "Tamaño no informado";
    const units = ["B", "KB", "MB", "GB"];
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const amount = value / (1024 ** exponent);
    return `${amount.toLocaleString("es-DO", { maximumFractionDigits: exponent > 1 ? 1 : 0 })} ${units[exponent]}`;
  }

  function renderDescargasAplicacion(downloads, releasePageUrl = "") {
    const target = $("updateDownloads");
    if (!target) return;
    const files = Array.isArray(downloads) ? downloads.filter(file => file?.url) : [];
    const releaseLink = $("downloadReleasePage");
    if (releaseLink) {
      releaseLink.classList.toggle("oculto", !releasePageUrl);
      if (releasePageUrl) releaseLink.href = releasePageUrl;
    }
    if (!files.length) {
      target.innerHTML = '<div class="empty-state">Todavía no hay archivos instalables publicados para descarga.</div>';
      return;
    }
    target.innerHTML = files.map(file => {
      const extension = String(file.extension || file.name?.split(".").pop() || "FILE").toUpperCase();
      const publisherSigned = file.publisher_signature === "signed";
      const signatureKnown = file.publisher_signature === "signed" || file.publisher_signature === "not_signed";
      const signatureLabel = file.signature_label || (publisherSigned
        ? "Firma de editor válida"
        : signatureKnown ? "Sin certificado de editor" : "Firma no informada");
      const integrityLabel = file.sha256 ? "SHA-256 publicado" : "Sin huella publicada";
      const action = file.action || `Descargar .${extension}`;
      return `<article class="update-download-item">
        <header>
          <span class="update-file-type" aria-hidden="true">${esc(extension)}</span>
          <div><p class="eyebrow">${esc(file.product || "D' Carela")}</p><h4>${esc(file.label || file.name || "Archivo")}</h4><small>${esc(file.name || "")}</small></div>
          <span class="tag ${publisherSigned ? "ok" : "warn"}">${esc(signatureLabel)}</span>
        </header>
        <div class="update-download-meta">
          <div><span>Versión</span><strong>${esc(file.version || "--")}</strong></div>
          <div><span>Build</span><strong>${esc(file.build || "--")}</strong></div>
          <div><span>Plataforma</span><strong>${esc(file.platform || "--")}</strong></div>
          <div><span>Canal</span><strong>${esc(file.channel || "stable")}</strong></div>
          <div><span>Publicado</span><strong>${esc(fecha(file.published_at))}</strong></div>
          <div><span>Tamaño</span><strong>${esc(tamanoArchivo(file.size_bytes))}</strong></div>
        </div>
        <p class="update-download-notes">${esc(file.notes || "Archivo oficial publicado para esta versión.")}</p>
        <div class="update-download-integrity"><span class="tag ${file.sha256 ? "ok" : "warn"}">${esc(integrityLabel)}</span>${file.sha256 ? `<code title="SHA-256 completo">${esc(file.sha256)}</code>` : ""}</div>
        <p class="update-install-method"><strong>Instalación:</strong> ${esc(file.installation_method || "Descarga el archivo y sigue las instrucciones del sistema.")}</p>
        <div class="button-row update-download-actions"><a class="button-link primary" href="${esc(file.url)}" target="_blank" rel="noopener">${esc(action)}</a>${file.checksums_url ? `<a class="secondary button-link" href="${esc(file.checksums_url)}" target="_blank" rel="noopener">Ver sumas SHA-256</a>` : ""}</div>
      </article>`;
    }).join("");
  }

  function renderVersionAplicacion(manifest, registration = null) {
    const webPublished = String(manifest.web_version || manifest.build || "--");
    const pwaPublished = String(manifest.pwa_version || webPublished);
    const different = webPublished !== APP_BUILD;
    $("webCurrentVersion").textContent = APP_BUILD;
    $("webPublishedVersion").textContent = webPublished;
    $("mobilePwaVersion").textContent = pwaPublished;
    $("mobileIosVersion").textContent = manifest.ios_version || "No publicada";

    if (different || registration?.waiting) {
      marcarEstadoActualizacion("webUpdateState", "Nueva versión", "warn");
      marcarEstadoActualizacion("mobileUpdateState", "Lista para actualizar", "warn");
      $("webUpdateDetail").textContent = `La compilación ${webPublished} está disponible. Pulsa “Actualizar panel ahora” para aplicarla también al panel móvil.`;
    } else {
      marcarEstadoActualizacion("webUpdateState", "Al día", "ok");
      marcarEstadoActualizacion("mobileUpdateState", "Al día", "ok");
      $("webUpdateDetail").textContent = registration
        ? `Compilación ${APP_BUILD}. Servicio sin conexión activo y actualización automática preparada.`
        : `Compilación ${APP_BUILD}. Este navegador no admite instalación sin conexión.`;
    }
    $("mobileUpdateDetail").textContent = pwaInstalada()
      ? `PWA ${pwaPublished} instalada. Usa “Actualizar panel ahora” para renovar web y móvil a la vez.`
      : `PWA ${pwaPublished} disponible para Android, iPhone, iPad, macOS, Linux y otros sistemas.`;
    $("mobileIosHelp").textContent = manifest.ios_version
      ? `La aplicación iPhone publicada es ${manifest.ios_version}. La PWA ${pwaPublished} sigue siendo el canal recomendado porque se actualiza directamente desde este panel.`
      : "Todavía no hay una IPA publicada; usa la PWA para recibir actualizaciones directas.";
    renderDescargasAplicacion(manifest.downloads, manifest.release_page_url);
    renderOtrasHerramientas(manifest.apps);
  }

  function renderVersionEscritorio(latest) {
    if (!latest) {
      marcarEstadoActualizacion("desktopUpdateState", "Sin publicación", "warn");
      $("dlInfo").innerHTML = '<div class="empty-state"><strong>No hay una versión de Windows publicada.</strong><br>La caja web y móvil continúan funcionando de forma independiente.</div>';
      return;
    }
    marcarEstadoActualizacion("desktopUpdateState", `Estable ${latest.version}`, latest.mandatory ? "warn" : "ok");
    $("dlInfo").innerHTML = `<div class="release-layout"><div><p class="eyebrow">Canal ${esc(latest.channel || "stable")}</p><div class="release-version">${esc(latest.version)}</div><p class="release-notes">${esc(latest.notes || "Versión estable del Punto de Venta para Windows.")}</p><div class="release-meta"><span class="tag ${latest.mandatory ? "warn" : "ok"}">${latest.mandatory ? "Actualización obligatoria" : "Publicación estable"}</span><span class="tag">Publicado ${esc(fecha(latest.created_at))}</span>${latest.sha256 ? `<span class="tag">SHA-256 ${esc(String(latest.sha256).slice(0, 14))}...</span>` : ""}</div></div>${latest.release_url ? `<a class="button-link" href="${esc(latest.release_url)}" target="_blank" rel="noopener">Descargar instalador Windows</a>` : '<span class="tag warn">URL de descarga pendiente</span>'}</div>`;
  }

  async function aplicarActualizacionWeb() {
    const button = $("btnApplyWebUpdate");
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando actualización...";
    try {
      const [manifest, registration] = await Promise.all([
        consultarVersionAplicacion(),
        registroPwa(true),
      ]);
      renderVersionAplicacion(manifest, registration);
      const worker = registration?.waiting || registration?.installing;
      worker?.postMessage?.({ type: "DCARELA_SKIP_WAITING" });
      const target = new URL(location.href);
      target.searchParams.set("build", String(manifest.web_version || Date.now()));
      toast(manifest.web_version === APP_BUILD
        ? "El panel ya está actualizado."
        : "Actualización descargada. Recargando el panel y el acceso móvil...");
      setTimeout(() => {
        if (updateReloading) return;
        updateReloading = true;
        location.replace(target.toString());
      }, manifest.web_version === APP_BUILD ? 300 : 900);
    } catch (error) {
      toast(error.message || String(error));
      $("webUpdateDetail").textContent = `No se pudo actualizar todavía: ${error.message || error}`;
      marcarEstadoActualizacion("webUpdateState", "Reintentar", "warn");
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
  }

  async function instalarPwa() {
    if (pwaInstalada()) {
      toast("El panel ya está instalado como aplicación en este dispositivo.");
      return;
    }
    if (!installPrompt) {
      $("mobileInstallHelp").classList.remove("oculto");
      $("mobileInstallHelp").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("Sigue la guía de instalación para este navegador.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") installPrompt = null;
  }

  async function comprobarVersion() {
    try {
      const [remoteLatest, manifest, registration] = await Promise.all([
        consultarVersion().catch(() => null),
        consultarVersionAplicacion().catch(() => null),
        registroPwa().catch(() => null),
      ]);
      const latest = manifest?.desktop_release || remoteLatest;
      const webDifferent = manifest && String(manifest.web_version) !== APP_BUILD;
      if (webDifferent || registration?.waiting) {
        $("updateTitle").textContent = `Panel ${manifest?.web_version || "nuevo"} disponible`;
        $("updateNotes").textContent = "La misma actualización se aplicará al panel web y al móvil.";
      } else if (latest) {
        $("updateTitle").textContent = `Caja Windows ${latest.version}`;
        $("updateNotes").textContent = latest.notes || "Versión estable disponible para Windows.";
      } else return;
      $("updateBanner").classList.toggle("oculto", (location.hash.slice(1) || "dashboard") !== "descargar");
    } catch { }
  }

  async function cargarDescargar(forzar = false) {
    $("dlInfo").innerHTML = '<div class="loading">Consultando el instalador estable...</div>';
    marcarEstadoActualizacion("desktopUpdateState", "Consultando");
    marcarEstadoActualizacion("webUpdateState", "Comprobando");
    marcarEstadoActualizacion("mobileUpdateState", "Comprobando");
    const [desktop, application, registration] = await Promise.allSettled([
      consultarVersion(),
      consultarVersionAplicacion(),
      registroPwa(forzar),
    ]);
    const manifestDesktop = application.status === "fulfilled" ? application.value?.desktop_release : null;
    if (manifestDesktop || desktop.status === "fulfilled") renderVersionEscritorio(manifestDesktop || desktop.value);
    else {
      marcarEstadoActualizacion("desktopUpdateState", "Sin conexión", "warn");
      $("dlInfo").innerHTML = `<p class="error">${esc(desktop.reason?.message || desktop.reason)}</p>`;
    }
    if (application.status === "fulfilled") {
      renderVersionAplicacion(
        application.value,
        registration.status === "fulfilled" ? registration.value : null,
      );
    } else {
      marcarEstadoActualizacion("webUpdateState", "Sin conexión", "warn");
      marcarEstadoActualizacion("mobileUpdateState", "Sin conexión", "warn");
      $("webCurrentVersion").textContent = APP_BUILD;
      $("webPublishedVersion").textContent = "--";
      $("mobilePwaVersion").textContent = "--";
      $("mobileIosVersion").textContent = "--";
      $("updateDownloads").innerHTML = '<div class="empty-state">No se pudo consultar la lista de archivos descargables.</div>';
      $("updateSuiteApps").innerHTML = '<div class="empty-state">No se pudo consultar el manifiesto común.</div>';
      $("webUpdateDetail").textContent = application.reason?.message || String(application.reason);
    }
    if (forzar) toast("Versiones de Windows, web y móvil comprobadas.");
  }

  function tabla(items, row, headers) {
    if (!items.length) return '<div class="empty-state">Sin datos sincronizados.</div>';
    return `<table><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${items.map(item => `<tr>${row(item).map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function tablaSimple(entries, headers, formatter) {
    if (!entries.length) return '<div class="empty-state">Sin datos.</div>';
    return `<table><thead><tr><th>${esc(headers[0])}</th><th>${esc(headers[1])}</th></tr></thead><tbody>${entries.map(([key, value]) => `<tr><td>${esc(key)}</td><td class="amount">${formatter(value)}</td></tr>`).join("")}</tbody></table>`;
  }

  function nuevoPdf(titulo, periodo) {
    const Pdf = window.jspdf?.jsPDF;
    if (!Pdf) throw new Error("El generador PDF no esta disponible. Recarga el panel.");
    const doc = new Pdf({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setProperties({ title: `${titulo} - D' Carela Compufoto`, author: "D' Carela POS" });
    doc.setTextColor(10, 54, 121);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("D' Carela Compufoto", 14, 14);
    doc.setFontSize(13);
    doc.text(titulo, 14, 22);
    doc.setTextColor(98, 115, 140);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(periodo, 14, 28);
    doc.text(`Generado: ${new Date().toLocaleString("es-DO")}`, 283, 14, { align: "right" });
    return doc;
  }

  function opcionesTablaPdf() {
    return {
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.2, textColor: [21, 34, 56], lineColor: [212, 222, 234], lineWidth: .15 },
      headStyles: { fillColor: [10, 54, 121], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [243, 247, 251] },
      margin: { left: 14, right: 14 }
    };
  }

  function descargarReportePdf() {
    const data = lastReportExport;
    if (!data) throw new Error("Genera primero el reporte que deseas descargar.");
    const doc = nuevoPdf("Reporte de ventas", `Periodo: ${data.desde} a ${data.hasta}`);
    doc.setTextColor(21, 34, 56);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Venta neta: ${money(data.neto)}    Ventas: ${data.ventas}    ITBIS: ${money(data.itbis)}    Devoluciones: ${money(data.devoluciones)}    Anuladas: ${data.anuladas}`, 14, 36);
    doc.autoTable({
      ...opcionesTablaPdf(), startY: 41,
      head: [["Dia", "Ventas", "Bruto", "ITBIS", "Devuelto", "Neto"]],
      body: data.dias.map(([dia, valor]) => [dia, valor.sales, money(valor.total), money(valor.tax), money(valor.refunds), money(valor.total - valor.refunds)])
    });
    let y = doc.lastAutoTable.finalY + 8;
    if (y > 155) { doc.addPage(); y = 18; }
    doc.setFontSize(11); doc.setTextColor(10, 54, 121); doc.text("Metodos de pago", 14, y);
    doc.autoTable({
      ...opcionesTablaPdf(), startY: y + 3, tableWidth: 118,
      head: [["Metodo", "Total"]], body: data.metodos.map(([metodo, total]) => [metodo, money(total)])
    });
    doc.setFontSize(11); doc.setTextColor(10, 54, 121); doc.text("Productos por importe", 148, y);
    doc.autoTable({
      ...opcionesTablaPdf(), startY: y + 3, margin: { left: 148, right: 14 },
      head: [["Producto", "Importe"]], body: data.productos.slice(0, 25).map(([producto, total]) => [producto, money(total)])
    });
    doc.save(`DCARELA_REPORTE_${data.desde}_${data.hasta}.pdf`);
  }

  function descargarTurnosPdf() {
    const data = lastTurnExport;
    if (!data) throw new Error("Consulta primero los turnos que deseas descargar.");
    const doc = nuevoPdf("Ventas por turnos", `Periodo: ${data.desde} a ${data.hasta}`);
    const body = data.turnos.map(turno => [
      fecha(turno.inicio), turno.fin ? fecha(turno.fin) : "En curso", turno.cajero, turno.caja,
      turno.ventas.length, money(turno.total), money(turno.efectivo),
      turno.apertura === null ? "--" : money(turno.apertura),
      turno.esperado === null ? "--" : money(turno.esperado),
      turno.contado === null ? "--" : money(turno.contado),
      turno.diferencia === null ? "Pendiente" : turno.diferencia === 0 ? "Exacto" : money(turno.diferencia)
    ]);
    doc.autoTable({
      ...opcionesTablaPdf(), startY: 34,
      head: [["Entrada", "Salida", "Cajero", "Caja", "Ventas", "Total", "Efectivo", "Apertura", "Esperado", "Contado", "Diferencia"]],
      body,
      didParseCell: hook => {
        if (hook.section !== "body" || hook.column.index !== 10) return;
        const turno = data.turnos[hook.row.index];
        if (turno?.diferencia > 0) hook.cell.styles.textColor = [183, 90, 0];
        if (turno?.diferencia < 0) hook.cell.styles.textColor = [197, 63, 72];
      }
    });
    doc.save(`DCARELA_TURNOS_${data.desde}_${data.hasta}.pdf`);
  }

  function descargarRecalculoPdf() {
    const data = lastReconciliation;
    if (!data) throw new Error("Ejecuta primero el recalculo que deseas descargar.");
    const doc = nuevoPdf("Diagnostico de incongruencias", `Periodo: ${data.desde} a ${data.hasta} | Terminal: ${data.terminal} | Cajero: ${data.cajero}`);
    doc.setTextColor(27, 43, 65);
    doc.setFontSize(9);
    doc.text(`Ventas validas: ${data.activeSales}   Total: ${money(data.totalSales)}   Pagos: ${money(data.paymentTotal)}   Folios faltantes: ${data.missingCount}   Incongruencias: ${data.issueCount}`, 14, 35);
    doc.autoTable({
      startY: 40,
      head: [["Estado", "Terminal", "Folios", "Cantidad", "Venta anterior", "Venta posterior"]],
      body: [
        ...data.folioGaps.map(item => ["Faltante", item.terminal.label, item.explicit, item.count, `#${item.previous}`, `#${item.next}`]),
        ...(data.sequenceBreaks || []).map(item => ["Cambio de secuencia", item.terminal.label, item.explicit, item.count, `#${item.previous}`, `#${item.next}`])
      ],
      theme: "grid", styles: { fontSize: 7 }, headStyles: { fillColor: [10, 54, 121] }
    });
    let y = Math.min(185, (doc.lastAutoTable?.finalY || 40) + 8);
    if (y > 160) { doc.addPage(); y = 18; }
    doc.autoTable({
      startY: y,
      head: [["Fecha", "Folio", "Cajero", "Prueba", "Esperado", "Observado", "Delta", "Explicacion"]],
      body: data.saleIssues.map(issue => [fecha(fechaEventoIso(issue.event)), `#${folioVenta(issue.event) || "--"}`, nombreCajero(P(issue.event), userCatalog), issue.kind, money(issue.expected), money(issue.observed), `${issue.delta > 0 ? "+" : ""}${money(issue.delta)}`, issue.detail]),
      theme: "grid", styles: { fontSize: 6.7 }, headStyles: { fillColor: [10, 54, 121] }
    });
    doc.addPage();
    doc.autoTable({
      startY: 18,
      head: [["Inicio", "Cajero", "Terminal", "Ventas", "Efectivo ventas", "Esperado", "Reconstruido", "Delta nube", "Arqueo real"]],
      body: data.turns.map(item => [fecha(item.opened || item.closed), item.cashier, item.terminal, item.saleCount, money(item.cashSales), item.reportedExpected === null ? "--" : money(item.reportedExpected), money(item.rebuiltExpected), item.cloudDelta === null ? "--" : `${item.cloudDelta > 0 ? "+" : ""}${money(item.cloudDelta)}`, `${numero(item.reportedDifference) > 0 ? "+" : ""}${money(item.reportedDifference)}`]),
      theme: "grid", styles: { fontSize: 6.7 }, headStyles: { fillColor: [10, 54, 121] }
    });
    doc.save(`DCARELA_RECALCULO_${data.desde}_${data.hasta}.pdf`);
  }

  function scheduleLiveRefresh() {
    clearTimeout(liveRefreshTimer);
    liveRefreshTimer = setTimeout(() => {
      const view = location.hash.slice(1) || "dashboard";
      if (view === "dashboard") cargarDashboard().catch(() => {});
      if (view === "notificaciones") cargarNotificaciones().catch(() => {});
      if (["ventas", "caja-virtual", "caja", "turnos", "recalcular", "reportes", "inventario", "clientes", "finanzas", "asistente", "configuracion"].includes(view)) loaders[view]?.().catch(() => {});
    }, 700);
  }

  function conectarRealtime() {
    if (authProvider === "firebase") {
      if (typeof liveChannel === "function") liveChannel();
      const unsubscribers = [
        window.DcarelaFirebase.listenCollection("sync_events", [["business_id", "==", BUSINESS]], items => {
          const newest = items.sort((a, b) => String(b.received_at_cloud || b.created_at_local || "").localeCompare(String(a.received_at_cloud || a.created_at_local || "")))[0];
          if (newest?.event_type === "VentaCancelada") cancelCache.at = 0;
          if (newest && COST_EVENTS.includes(newest.event_type)) costStateCache = null;
          alertasCache = null;
          scheduleLiveRefresh();
        }),
        window.DcarelaFirebase.listenCollection("system_alerts", [["business_id", "==", BUSINESS]], () => {
          alertasCache = null;
          obtenerAlertas(true).then(renderAlertPreview).catch(() => {});
          scheduleLiveRefresh();
        })
      ];
      liveChannel = () => unsubscribers.forEach(unsubscribe => unsubscribe?.());
      $("pillVivo").textContent = "en vivo";
      verEstado(true, "Firebase conectado en vivo");
      return;
    }
    if (liveChannel) sb.removeChannel(liveChannel).catch(() => {});
    liveChannel = sb.channel("dcarela-pos-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sync_events", filter: `business_id=eq.${BUSINESS}` }, change => {
        if (change.new?.event_type === "VentaCancelada") cancelCache.at = 0;
        if (COST_EVENTS.includes(change.new?.event_type)) costStateCache = null;
        if (RELEVANT_EVENTS.includes(change.new?.event_type)) {
          alertasCache = null;
          const summary = resumenEvento(change.new);
          toast(`${summary.title}${summary.detail ? `: ${summary.detail}` : ""}`);
          obtenerAlertas(true).catch(() => {});
        }
        scheduleLiveRefresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_alerts", filter: `business_id=eq.${BUSINESS}` }, change => {
        alertasCache = null;
        toast(change.new?.title || "Nueva alerta del POS");
        obtenerAlertas(true).then(renderAlertPreview).catch(() => {});
        scheduleLiveRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_assistant_actions", filter: `business_id=eq.${BUSINESS}` }, () => {
        if ((location.hash.slice(1) || "dashboard") === "asistente") scheduleLiveRefresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pos_assistant_messages", filter: `business_id=eq.${BUSINESS}` }, () => {
        if ((location.hash.slice(1) || "dashboard") === "asistente" && !iaBusy) scheduleLiveRefresh();
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          $("pillVivo").textContent = "en vivo";
          verEstado(true, "Realtime conectado");
        }
      });
  }

  async function iniciar(generation = authGeneration) {
    const expectedUserId = session?.user?.id || "";
    if (!expectedUserId) throw new Error("Sesion invalida");
    await cargarSucursalesDisponibles();
    if (session?.user?.id !== expectedUserId) return;
    await cargarRolEdicion();
    // En modo embebido el shell es la fuente de verdad y publica el tema por
    // postMessage en cada carga/cambio. Volver a leer la preferencia remota
    // aquí introducía una carrera: el iframe podía regresar a oscuro justo
    // después de que el usuario seleccionara claro en el shell.
    if (!EMBEDDED && authProvider === "supabase") await cargarTemaUsuario().catch(() => {});
    await cargarPermisosCajaWeb().catch(() => setSaleAccess({ loaded: true }));
    if (generation !== authGeneration || session?.user?.id !== expectedUserId) return false;
    sesionOk = true;
    activeUserId = expectedUserId;
    $("access").classList.add("oculto");
    $("app").classList.remove("oculto");
    $("sessionEmail").textContent = session?.user?.email || "Administrador";
    if ($("backendLabel")) $("backendLabel").textContent = authProvider === "firebase" ? "Firebase · acceso seguro" : "Supabase · edición segura";
    verEstado(true, authProvider === "firebase" ? "Firebase autenticado" : "Supabase autenticado");
    if (canEdit) renderIaApprovals().catch(() => {});
    conectarRealtime();
    await obtenerAlertas(true).catch(() => []);
    comprobarVersion();
    mostrarVista(location.hash.slice(1) || "dashboard");
    return true;
  }

  function sesionFirebase(user) {
    if (!user?.uid) return null;
    return {
      provider: "firebase",
      user: { id: user.uid, email: user.email || "" }
    };
  }

  async function sesionFirebaseActual(timeoutMs = 2500) {
    if (!window.DcarelaFirebase?.isAvailable) return null;
    const user = await window.DcarelaFirebase.waitForAuthState(timeoutMs);
    return sesionFirebase(user);
  }

  async function iniciarConSesion(nextSession, generation = authGeneration) {
    if (!nextSession?.user?.id) {
      session = null;
      sesionOk = false;
      activeUserId = "";
      mostrarAcceso("v-login");
      return;
    }
    if (sesionOk && activeUserId === nextSession.user.id) {
      session = nextSession;
      return;
    }
    if (startupPromise) return startupPromise;

    startupPromise = (async () => {
      mostrarAcceso("v-restoring");
      session = nextSession;
      authProvider = nextSession.provider === "firebase" ? "firebase" : "supabase";
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Tiempo de espera agotado al conectar.")), 6000)
        );
        const started = await Promise.race([iniciar(generation), timeoutPromise]);
        if (!started) return;
        if (generation !== authGeneration) return;
      } catch (error) {
        console.warn("iniciarConSesion error:", error);
        if (generation !== authGeneration) return;
        sesionOk = false;
        activeUserId = "";
        authProvider = "none";
        mostrarAcceso("v-login");
        $("loginErr").textContent = mensajeAutenticacion(error);
      }
    })();
    try {
      await startupPromise;
    } finally {
      startupPromise = null;
    }
  }

  async function restaurarSesion() {
    const generation = ++authGeneration;
    mostrarAcceso("v-restoring");
    const safetyTimer = setTimeout(() => {
      if (generation === authGeneration && !sesionOk) {
        mostrarAcceso("v-login");
      }
    }, 4000);

    try {
      const firebaseSession = await sesionFirebaseActual(2500).catch(() => null);
      if (generation !== authGeneration) return;
      if (firebaseSession) {
        await iniciarConSesion(firebaseSession, generation);
        if (!sesionOk) await window.DcarelaFirebase.signOut().catch(() => {});
        return;
      }
      session = null;
      authProvider = "none";
      sesionOk = false;
      activeUserId = "";
      mostrarAcceso("v-login");
    } catch (err) {
      if (generation === authGeneration) {
        session = null;
        authProvider = "none";
        sesionOk = false;
        activeUserId = "";
        mostrarAcceso("v-login");
      }
    } finally {
      clearTimeout(safetyTimer);
    }
  }

  function manejarCambioAuth(event, nextSession) {
    if (event === "SIGNED_OUT") {
      authGeneration++;
      session = null;
      authProvider = "none";
      sesionOk = false;
      activeUserId = "";
      if (liveChannel) sb.removeChannel(liveChannel).catch(() => {});
      liveChannel = null;
      mostrarAcceso("v-login");
      $("loginErr").textContent = "La sesion termino. Inicia sesion nuevamente.";
      return;
    }
    if (event === "TOKEN_REFRESHED") {
      if (nextSession) nextSession.provider = "supabase";
      session = nextSession;
      if (nextSession && !sesionOk) setTimeout(() => iniciarConSesion(nextSession).catch(() => {}), 0);
      return;
    }
    if (event === "SIGNED_IN" && nextSession?.user?.id && nextSession.user.id !== activeUserId) {
      nextSession.provider = "supabase";
      setTimeout(() => iniciarConSesion(nextSession).catch(() => {}), 0);
    }
  }

  // Elementos que arrancar() esperaba y no estaban en el HTML. Se acumulan para
  // avisar una sola vez al final en vez de matar el arranque en el primero.
  const elementosFaltantes = [];

  /**
   * Enlaza un evento tolerando que el elemento no exista.
   *
   * arrancar() ata mas de 100 elementos. Antes lo hacia con
   * $("x").addEventListener(...) directo: si el panel.html servido no traia UNO
   * solo, el arranque entero reventaba con "Cannot read properties of null" y la
   * pantalla quedaba muerta. Paso de verdad en produccion: el panel.html
   * publicado era viejo y le faltaban 22 elementos que panel.js ya ataba
   * (consola de venta web, PWA, actualizaciones). Ahora falta un boton, no el
   * panel.
   */
  function on(id, evento, manejador, opciones) {
    const elemento = $(id);
    if (!elemento) { elementosFaltantes.push(id); return null; }
    elemento.addEventListener(evento, manejador, opciones);
    return elemento;
  }

  async function arrancar() {
    on("btnGuardarCfg", "click", () => {
      const url = $("cfgUrl").value.trim();
      const anon = $("cfgAnon").value.trim();
      if (!url || !anon) { $("cfgErr").textContent = "Completa la URL y la clave publica."; return; }
      localStorage.setItem("dcarela.cfg", JSON.stringify({ url, anon, business: BUSINESS }));
      location.reload();
    });
    const resetConnection = () => { localStorage.removeItem("dcarela.cfg"); location.reload(); };
    on("btnCambiarCfg", "click", resetConnection);
    on("btnReset", "click", resetConnection);
    on("btnEntrar", "click", async () => {
      $("loginErr").textContent = "";
      const button = $("btnEntrar");
      button.disabled = true;
      button.textContent = "Validando...";
      try {
        const email = ($("email").value || "").trim().toLowerCase();
        const password = $("pass").value || "";
        if (!email || !password) {
          $("loginErr").textContent = "Por favor ingresa tu correo y contraseña.";
          return;
        }

        if (!window.DcarelaFirebase?.isAvailable) throw new Error("Firebase no está disponible. Recarga el panel e inténtalo de nuevo.");
        const credential = await esperarConLimite(
          window.DcarelaFirebase.signIn(email, password),
          12000,
          "Tiempo de espera agotado al autenticar."
        );
        const firebaseSession = sesionFirebase(credential?.user);
        if (!firebaseSession) throw new Error("No se recibió una sesión válida de Firebase.");
        await iniciarConSesion(firebaseSession);
        if (!sesionOk) await window.DcarelaFirebase.signOut().catch(() => {});
      } catch (error) {
        const msg = error?.message || "No se pudo validar la sesion.";
        $("loginErr").textContent = mensajeAutenticacion(error, msg);
      } finally {
        button.disabled = false;
        button.textContent = "Entrar";
      }
    });
    on("pass", "keydown", event => { if (event.key === "Enter") $("btnEntrar").click(); });
    on("btnSalir", "click", async () => {
      if (typeof liveChannel === "function") liveChannel();
      await window.DcarelaFirebase?.signOut?.();
      session = null;
      authProvider = "none";
      location.reload();
    });
    on("btnVolver", "click", () => {
      if (history.length > 1) history.back();
      else location.hash = "dashboard";
    });
    const cambiarTema = () => {
      const next = currentTheme === "dark" ? "light" : "dark";
      applyTheme(next, true);
      if (!EMBEDDED) {
        guardarTemaUsuario(next).catch(error => toast(error.message));
      } else window.parent.postMessage({ type: "dcarela:theme-request", theme: next }, location.origin);
    };
    on("btnTema", "click", cambiarTema);
    on("btnTemaAcceso", "click", cambiarTema);
    on("branchSelector", "change", event => abrirSucursal(event.target.value, "dashboard"));
    on("btnIaNueva", "click", () => {
      iaConversationId = null;
      renderIaConversations();
      $("iaConversationTitle").textContent = "Nueva conversación";
      $("iaMessages").innerHTML = IA_EMPTY_HTML;
      iaBindMessageActions([]);
      setIaDrawer("history", false);
      $("iaInput").focus();
    });
    on("btnIaHistorial", "click", () => setIaDrawer("history", !$("iaLayout").classList.contains("history-open")));
    on("btnIaControl", "click", () => setIaDrawer("control", !$("iaLayout").classList.contains("control-open")));
    on("btnIaCerrarHistorial", "click", () => setIaDrawer("history", false));
    on("btnIaCerrarControl", "click", () => setIaDrawer("control", false));
    on("btnIaAddRule", "click", () => {
      const input = $("iaNewRuleInput");
      const val = (input.value || "").trim();
      if (!val) { toast("Escribe una regla de negocio primero."); return; }
      addIaLearnedRule(val, val.slice(0, 40), "manual_rule");
      input.value = "";
      toast("Regla aprendida y guardada en memoria.");
    });
    on("iaNewRuleInput", "keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        $("btnIaAddRule").click();
      }
    });
    on("iaDrawerScrim", "click", () => setIaDrawer("", false));
    on("iaConversationSearch", "input", renderIaConversations);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && ($("iaLayout").classList.contains("history-open") || $("iaLayout").classList.contains("control-open"))) {
        setIaDrawer("", false);
      }
    });
    on("btnIaAdjuntar", "click", () => $("iaFiles").click());
    $("iaTools").querySelectorAll("[data-ia-tool]").forEach(button => button.addEventListener("click", () => {
      const prompt = button.dataset.prompt || "";
      const input = $("iaInput");
      input.value = input.value.trim() ? `${input.value.trim()}\n${prompt}` : prompt;
      input.dispatchEvent(new Event("input"));
      $("iaActiveTool").textContent = button.textContent.trim();
      $("iaActiveTool").classList.remove("oculto");
      $("iaTools").open = false;
      if (button.dataset.iaTool === "document") $("iaFiles").click();
      input.focus();
    }));
    on("btnIaMic", "click", () => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        $("iaError").textContent = "El dictado por voz no esta disponible en este navegador.";
        return;
      }
      if (iaRecognition) {
        iaRecognition.stop();
        return;
      }
      const recognition = new Recognition();
      iaRecognition = recognition;
      recognition.lang = "es-DO";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = () => {
        $("iaError").textContent = "";
        $("btnIaMic").classList.add("listening");
        $("btnIaMic").title = "Detener dictado";
      };
      recognition.onresult = event => {
        const transcript = [...event.results].map(result => result[0]?.transcript || "").join(" ").trim();
        if (!transcript) return;
        const input = $("iaInput");
        input.value = input.value.trim() ? `${input.value.trim()} ${transcript}` : transcript;
        input.dispatchEvent(new Event("input"));
        input.focus();
      };
      recognition.onerror = event => {
        if (!["aborted", "no-speech"].includes(event.error)) {
          $("iaError").textContent = `No se pudo completar el dictado: ${event.error}.`;
        }
      };
      recognition.onend = () => {
        iaRecognition = null;
        $("btnIaMic").classList.remove("listening");
        $("btnIaMic").title = "Dictar mensaje";
      };
      try { recognition.start(); }
      catch (error) {
        iaRecognition = null;
        $("btnIaMic").classList.remove("listening");
        $("iaError").textContent = error.message;
      }
    });
    on("iaFiles", "change", event => {
      agregarAdjuntosIa(event.target.files).catch(error => { $("iaError").textContent = error.message; });
      event.target.value = "";
    });
    on("iaComposer", "dragover", event => { event.preventDefault(); $("iaComposer").classList.add("dragging"); });
    on("iaComposer", "dragleave", () => $("iaComposer").classList.remove("dragging"));
    on("iaComposer", "drop", event => {
      event.preventDefault();
      $("iaComposer").classList.remove("dragging");
      agregarAdjuntosIa(event.dataTransfer?.files || []).catch(error => { $("iaError").textContent = error.message; });
    });
    on("iaInput", "paste", event => {
      const files = [...(event.clipboardData?.files || [])];
      if (files.length) agregarAdjuntosIa(files).catch(error => { $("iaError").textContent = error.message; });
    });
    on("iaComposer", "submit", event => { event.preventDefault(); enviarMensajeIa(); });
    on("iaInput", "keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); enviarMensajeIa(); }
    });
    on("iaInput", "input", () => {
      const input = $("iaInput");
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    });
    on("iaModel", "change", () => localStorage.setItem(`dcarela.ia.model.v2.${BUSINESS}`, $("iaModel").value));
    const intelligenceUpgradeKey = `dcarela.ia.intelligence-upgrade.v37.${BUSINESS}`;
    const applyIntelligenceUpgrade = localStorage.getItem(intelligenceUpgradeKey) !== "1";
    [
      ["iaDepth", "deep"],
      ["iaInitiative", "proactive"],
      ["iaDetail", "extended"],
    ].forEach(([id, fallback]) => {
      const key = `dcarela.ia.preference.${id}.${BUSINESS}`;
      const control = $(id);
      const saved = localStorage.getItem(key);
      const migrated = applyIntelligenceUpgrade && ((id === "iaDepth" && saved === "balanced") || (id === "iaDetail" && saved === "standard"))
        ? fallback
        : saved;
      control.value = migrated && [...control.options].some(option => option.value === migrated) ? migrated : fallback;
      if (applyIntelligenceUpgrade) localStorage.setItem(key, control.value);
      control.addEventListener("change", () => localStorage.setItem(key, control.value));
    });
    localStorage.setItem(intelligenceUpgradeKey, "1");
    $("iaSuggestions").querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => {
      $("iaInput").value = button.dataset.prompt;
      $("iaInput").dispatchEvent(new Event("input"));
      $("iaInput").focus();
    }));
    on("btnNuevaVentaWeb", "click", () => openSaleConsole(false).catch(error => toast(error.message)));
    on("btnReanudarVenta", "click", async () => {
      try {
        await openSaleConsole(false);
        openPendingSales();
      } catch (error) { toast(error.message); }
    });
    on("btnVirtualNewSale", "click", () => openSaleConsole(false).catch(error => toast(error.message)));
    on("btnVirtualResume", "click", async () => {
      try {
        await openSaleConsole(false);
        openPendingSales();
      } catch (error) { toast(error.message); }
    });
    on("btnVirtualCashIn", "click", () => openVirtualCashMovement("entrada"));
    on("btnVirtualCashOut", "click", () => openVirtualCashMovement("salida"));
    on("btnVirtualClose", "click", openSaleCloseShift);
    on("btnVirtualRefresh", "click", () => cargarCajaVirtual().catch(error => { $("virtualCashError").textContent = error.message; }));
    document.querySelectorAll("[data-virtual-route]").forEach(button => button.addEventListener("click", () => {
      location.hash = `#${button.dataset.virtualRoute}`;
    }));
    document.querySelectorAll("[data-virtual-action]").forEach(button => button.addEventListener("click", () => {
      openVirtualCommand(button.dataset.virtualAction).catch(error => toast(error.message));
    }));
    document.querySelectorAll("[data-virtual-open-sale]").forEach(button => button.addEventListener("click", () => openSaleConsole(false).catch(error => toast(error.message))));
    document.querySelectorAll("[data-inventory-focus]").forEach(link => link.addEventListener("click", () => sessionStorage.setItem("dcarela.inventory.focus", link.dataset.inventoryFocus)));
    on("btnCerrarVenta", "click", closeSaleConsole);
    on("saleOverlay", "click", event => { if (event.target === $("saleOverlay")) closeSaleConsole(); });
    $("saleStageTabs").querySelectorAll("[data-sale-stage]").forEach(button => button.addEventListener("click", () => setSaleStage(button.dataset.saleStage, true)));
    on("saleWorkbench", "focusin", event => {
      const pane = event.target.closest("[data-sale-pane]");
      if (pane) setSaleStage(pane.dataset.salePane);
    });
    on("btnSaleOpenShift", "click", openSaleShift);
    on("btnSaleCloseShift", "click", openSaleCloseShift);
    on("btnSaleChange", "click", openSaleLineChange);
    on("btnSaleCashIn", "click", () => openVirtualCashMovement("entrada"));
    on("btnSaleCashOut", "click", () => openVirtualCashMovement("salida"));
    on("btnSaleVerifyPrice", "click", openSalePriceVerifier);
    on("btnSaleFocusSearch", "click", () => setSaleStage("catalog", true));
    on("btnSaleWholesale", "click", toggleSaleWholesale);
    on("btnClosePriceVerifier", "click", closeSalePriceVerifier);
    on("salePriceVerifier", "click", event => { if (event.target === $("salePriceVerifier")) closeSalePriceVerifier(); });
    on("salePriceSearch", "input", event => renderSalePriceVerifier(event.target.value));
    on("salePriceSearch", "keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      $("salePriceResults").querySelector("[data-sale-price-add]")?.click();
    });
    on("btnSaleCommon", "click", openCommonSale);
    on("btnSaleClear", "click", () => clearSale());
    on("btnSaleCartClear", "click", () => clearSale());
    on("btnSalePark", "click", () => saleCart.length ? parkSale()
      : salePendingCount() ? openPendingSales() : toast("No hay una venta actual ni cuentas pendientes."));
    on("saleSearch", "input", event => renderSaleProducts(event.target.value));
    on("saleSearch", "keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const term = event.currentTarget.value.trim().toLowerCase();
      const exact = (productCatalog || []).find(product => [product.codigoBarras, product.sku].some(value => String(value || "").trim().toLowerCase() === term));
      if (exact) { addSaleProduct(exact.id); return; }
      $("saleProductResults").querySelector("[data-sale-product]")?.click();
    });
    on("saleCart", "click", event => {
      const article = event.target.closest("[data-sale-line]");
      if (article) selectSaleLine(Number(article.dataset.saleLine));
      const button = event.target.closest("[data-sale-remove]");
      if (!button) return;
      saleCart.splice(Number(button.dataset.saleRemove), 1);
      saleSelectedLineIndex = Math.min(saleSelectedLineIndex, saleCart.length - 1);
      renderSaleCart();
    });
    on("saleCart", "focusin", event => {
      const article = event.target.closest("[data-sale-line]");
      if (article) selectSaleLine(Number(article.dataset.saleLine));
    });
    on("saleCart", "input", event => {
      const field = event.target.dataset.saleField;
      if (!field) return;
      const index = Number(event.target.closest("[data-sale-line]")?.dataset.saleLine);
      const line = saleCart[index];
      if (!line) return;
      try {
        if (field === "cantidad") {
          const value = String(event.target.value).trim().replace(",", ".");
          if (!/^\d+(?:\.\d{0,3})?$/.test(value) || numero(value) <= 0) return;
          line.cantidad = value;
        }
        if (field === "precio") line.precioUnitarioCentavos = centavosInput(event.target.value || "0");
        if (field === "descuento") line.descuentoPct = Math.min(100, Math.max(0, numero(String(event.target.value).replace(",", "."))));
        const totals = saleExactTotals();
        $("saleBase").textContent = money(totals.base);
        $("saleTax").textContent = money(totals.tax);
        $("saleDiscount").textContent = money(totals.discount);
        $("saleTotal").textContent = money(totals.total);
        $("saleStageCheckoutCount").textContent = saleCart.length ? money(totals.total) : "0";
        $("saleMobileTotal").textContent = money(totals.total);
        $("salePriceReasonField").classList.toggle("oculto", !saleHasCustomPrices());
        syncSalePaymentDraft();
      } catch { /* conserva el ultimo valor valido mientras se escribe */ }
    });
    on("saleCart", "change", event => {
      if (!event.target.matches("[data-sale-wholesale]")) return;
      const line = saleCart[Number(event.target.dataset.saleWholesale)];
      if (!line) return;
      line.mayoreo = event.target.checked;
      line.precioUnitarioCentavos = line.mayoreo ? line.precioMayoreoCentavos : line.precioNormalCentavos;
      renderSaleCart();
    });
    on("saleRounding", "change", renderSaleCart);
    on("saleTip", "input", () => { try { updateSaleCashChange(); } catch {} });
    on("salePaymentMethod", "change", updateSalePaymentFields);
    on("saleCashReceived", "input", () => { try { updateSaleCashChange(); } catch {} });
    on("btnSaleAddPayment", "click", () => { try { addSalePayment(); } catch (error) { toast(error.message); } });
    on("btnSaleSubmit", "click", () => submitSale());
    on("btnSaleSubmitPrint", "click", previewCurrentTicket);
    on("btnSaleCancelCurrent", "click", () => clearSale());
    on("btnSaleCancelLast", "click", () => cancelLastSaleFromConsole().catch(error => toast(error.message)));
    on("btnSaleReprintLast", "click", () => reprintLastSaleFromConsole().catch(error => toast(error.message)));
    on("btnSaleQuote", "click", () => {
      if (!saleCart.length) { toast("Agrega productos antes de imprimir la cotizacion."); return; }
      $("saleReceiptContent").innerHTML = saleReceiptMarkup({ lineas: saleCart, vendidaEn: new Date().toISOString() }, true);
      $("saleWorkbench").classList.add("oculto");
      $("saleReceipt").classList.remove("oculto");
      $("saleConsole").classList.add("receipt-mode");
      syncSaleMobileSummary();
      printSaleReceipt();
      setTimeout(() => {
        $("saleReceipt").classList.add("oculto");
        $("saleWorkbench").classList.remove("oculto");
        $("saleConsole").classList.remove("receipt-mode");
        syncSaleMobileSummary();
      }, 600);
    });
    on("btnSalePrintReceipt", "click", printSaleReceipt);
    on("btnSaleNext", "click", () => {
      if (saleReceiptPreview) {
        saleReceiptPreview = false;
        $("saleReceipt").classList.add("oculto");
        $("saleWorkbench").classList.remove("oculto");
        $("saleConsole").classList.remove("receipt-mode");
        $("btnSaleNext").textContent = "Siguiente venta";
        syncSaleMobileSummary();
        return;
      }
      clearSale();
      setSaleStage("catalog", true);
    });
    document.querySelectorAll("[data-pos-route]").forEach(button => button.addEventListener("click", () => {
      const target = button.dataset.posRoute || "dashboard";
      closeSalePriceVerifier();
      $("saleOverlay").classList.add("oculto");
      $("saleOverlay").setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      location.hash = target;
    }));
    on("btnSaleMobileCart", "click", () => setSaleStage("cart", true));
    on("btnSaleMobileCheckout", "click", () => {
      if (saleStage !== "checkout") setSaleStage("checkout", true);
      else submitSale();
    });
    window.addEventListener("keydown", handleSaleShortcut);
    updateSalePendingButton();
    on("btnVentas", "click", () => cargarVentas().catch(error => mostrarError("ventas", error)));
    on("btnTurnos", "click", () => cargarTurnos().catch(error => mostrarError("turnos", error)));
    on("btnTurnosPdf", "click", () => { try { descargarTurnosPdf(); } catch (error) { toast(error.message); } });
    on("btnRecalcular", "click", () => cargarRecalculador().catch(error => mostrarError("recalcular", error)));
    on("btnRecalcularPdf", "click", () => { try { descargarRecalculoPdf(); } catch (error) { toast(error.message); } });
    on("recDiferencia", "keydown", event => { if (event.key === "Enter") { event.preventDefault(); $("btnRecalcular").click(); } });
    on("btnReporte", "click", () => cargarReporte().catch(error => mostrarError("reportes", error)));
    on("btnReportePdf", "click", () => { try { descargarReportePdf(); } catch (error) { toast(error.message); } });
    document.querySelectorAll("[data-report-focus]").forEach(button => button.addEventListener("click", () => {
      document.querySelectorAll("[data-report-focus]").forEach(item => item.classList.toggle("act", item === button));
      const target = $(button.dataset.reportFocus)?.closest(".surface");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    on("btnNuevoProducto", "click", () => abrirProducto().catch(error => toast(error.message)));
    on("btnNuevaCategoria", "click", abrirCategoria);
    on("btnNuevoCliente", "click", () => abrirCliente());
    on("btnNuevaCategoriaGasto", "click", () => abrirCategoriaFin());
    on("btnNuevoGasto", "click", () => abrirMovimientoFin("gasto"));
    on("btnNuevoRecurrente", "click", () => cargarCostosCloud().then(state => abrirRecurrente(state)).catch(error => toast(error.message)));
    on("btnNuevaObligacion", "click", () => cargarCostosCloud().then(state => abrirObligacion(state)).catch(error => toast(error.message)));
    on("btnNuevoRecibo", "click", () => cargarCostosCloud().then(state => abrirReciboPago(state)).catch(error => toast(error.message)));
    on("btnGenerarObligaciones", "click", () => generarObligacionesWeb().catch(error => toast(error.message)));
    on("btnNuevaCuentaFin", "click", () => abrirCuentaFin());
    on("btnNuevaTransferencia", "click", async () => {
      try {
        if (!finStateCache) await cargarCuentasFin($("provMes").value || inputDate(new Date()).slice(0, 7));
        abrirTransferenciaFin();
      } catch (error) { toast(error.message); }
    });
    const openTransfer = async () => {
      try {
        if (!finStateCache) await cargarCuentasFin($("provMes").value || inputDate(new Date()).slice(0, 7));
        abrirTransferenciaFin();
      } catch (error) { toast(error.message); }
    };
    on("btnFinTransferTop", "click", openTransfer);
    on("btnFinNuevaPendiente", "click", async () => {
      try {
        if (!finStateCache) await cargarCuentasFin($("provMes").value || inputDate(new Date()).slice(0, 7));
        openPendingTransfer();
      } catch (error) { toast(error.message); }
    });
    on("btnFinQuick", "click", () => abrirMovimientoFin("gasto"));
    on("btnFinQuickMov", "click", () => abrirMovimientoFin("gasto"));
    on("btnVerMovimientosFin", "click", () => setCostTab("movimientos"));
    on("btnFinNuevoPresupuesto", "click", () => abrirPresupuestoFin());
    on("btnFinNuevaTarjeta", "click", () => abrirTarjetaFin());
    on("btnFinNuevoCompromiso", "click", () => abrirCompromisoFin());
    on("btnFinNuevaDivisa", "click", () => abrirDivisaFin());
    $("finPeriodTabs").querySelectorAll("[data-fin-period]").forEach(button => button.addEventListener("click", () => {
      finDashboardPeriod = button.dataset.finPeriod;
      renderFinDashboard().catch(error => toast(error.message));
    }));
    on("finFechaReferencia", "change", event => {
      finReferenceDate = event.target.value || inputDate(new Date());
      const month = finReferenceDate.slice(0, 7);
      if (month !== $("provMes").value) {
        $("provMes").value = month;
        cargarProveedores().catch(error => mostrarError("finanzas", error));
      } else renderFinDashboard().catch(error => toast(error.message));
    });
    ["finMovementType", "finMovementAccount", "finMovementCategory"].forEach(id => $(id).addEventListener("change", renderFinMovements));
    on("finMovementSearch", "input", renderFinMovements);
    on("btnFinExportCsv", "click", () => { try { exportarFinCsv(); } catch (error) { toast(error.message); } });
    on("btnFinExportPdf", "click", () => { try { exportarFinPdf(); } catch (error) { toast(error.message); } });
    ["btnFinBackupTop", "btnFinBackup", "btnFinBackupSettings"].forEach(id => $(id).addEventListener("click", () => backupFinanzas().catch(error => toast(error.message))));
    on("btnFinRestorePreview", "click", () => $("finRestoreFile").click());
    on("finRestoreFile", "change", event => validarBackupFinanzas(event.target.files?.[0]).catch(error => toast(error.message)));
    on("finSettingsForm", "submit", event => {
      event.preventDefault();
      guardarPreferenciasFin(event.currentTarget).catch(error => toast(error.message));
    });
    $("provTabs").querySelectorAll("[data-cost-tab]").forEach(button => button.addEventListener("click", () => setCostTab(button.dataset.costTab)));
    on("provMes", "change", () => {
      if (!finReferenceDate.startsWith($("provMes").value)) finReferenceDate = `${$("provMes").value}-01`;
      cargarProveedores().catch(error => mostrarError("finanzas", error));
    });
    on("btnInvBuscar", "click", () => cargarInventario().catch(error => mostrarError("inventario", error)));
    on("btnCliBuscar", "click", () => cargarClientes().catch(error => mostrarError("clientes", error)));
    on("invBuscar", "keydown", event => { if (event.key === "Enter") { event.preventDefault(); $("btnInvBuscar").click(); } });
    on("cliBuscar", "keydown", event => { if (event.key === "Enter") { event.preventDefault(); $("btnCliBuscar").click(); } });
    on("btnCheckAllUpdates", "click", () => cargarDescargar(true));
    on("btnApplyWebUpdate", "click", aplicarActualizacionWeb);
    on("btnInstallPwa", "click", () => instalarPwa().catch(error => toast(error.message)));
    on("btnMobileInstallHelp", "click", () => {
      $("mobileInstallHelp").classList.remove("oculto");
      $("mobileInstallHelp").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    on("btnCloseMobileHelp", "click", () => $("mobileInstallHelp").classList.add("oculto"));
    on("btnGuardarNegocio", "click", () => guardarNegocio().catch(error => toast(error.message)));
    on("btnCambiarClave", "click", async () => {
      const button = $("btnCambiarClave");
      const previous = button.textContent;
      button.disabled = true;
      button.textContent = "Actualizando...";
      try { await cambiarClaveCuenta(); }
      catch (error) { $("cfgClaveEstado").textContent = error.message; toast(error.message); }
      finally { button.disabled = false; button.textContent = previous; }
    });
    on("btnCerrarEditor", "click", cerrarEditor);
    on("btnCancelarEditor", "click", cerrarEditor);
    on("editorOverlay", "click", event => { if (event.target === $("editorOverlay")) cerrarEditor(); });
    on("editorForm", "submit", async event => {
      event.preventDefault();
      if (!editorSubmit) return;
      const button = $("btnGuardarEditor");
      const previous = button.textContent;
      button.disabled = true;
      button.textContent = "Guardando...";
      $("editorError").textContent = "";
      try { await editorSubmit(new FormData(event.currentTarget)); }
      catch (error) { $("editorError").textContent = error?.message || String(error); }
      finally { button.disabled = false; button.textContent = previous; }
    });
    window.addEventListener("keydown", event => { if (event.key === "Escape" && !$("editorOverlay").classList.contains("oculto")) cerrarEditor(); });
    on("alertFilter", "change", () => cargarNotificaciones().catch(() => {}));
    on("btnLeerTodas", "click", async () => {
      const alerts = await obtenerAlertas();
      const read = readSet();
      alerts.forEach(alert => { read.add(alert.key); alert.read = true; });
      localStorage.setItem(READ_KEY, JSON.stringify([...read].slice(-1200)));
      const systemIds = alerts.filter(alert => alert.source === "system" && alert.sourceId && !alert.acknowledged).map(alert => alert.sourceId);
      if (systemIds.length && session?.user?.id) {
        if (authProvider === "firebase") await window.DcarelaFirebase.acknowledgeAlerts(systemIds, BUSINESS).catch(() => {});
        else await sb.from("system_alerts").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: session.user.id }).in("id", systemIds).then(() => {});
      }
      actualizarContadorAlertas();
      cargarNotificaciones();
    });
    window.addEventListener("hashchange", () => { if (sesionOk) mostrarVista(location.hash.slice(1) || "dashboard"); });
    setInterval(() => { $("footerClock").textContent = new Date().toLocaleString("es-DO", { dateStyle: "full", timeStyle: "short" }); }, 1000);

    if (!window.DcarelaFirebase?.isAvailable) {
      mostrarAcceso("v-config");
      $("cfgErr").textContent = "No se pudo iniciar Firebase. Recarga la página o revisa tu conexión.";
      return;
    }
    window.DcarelaFirebase.onAuthStateChanged(user => {
      if (!user && sesionOk) {
        authGeneration++;
        sesionOk = false;
        activeUserId = "";
        session = null;
        authProvider = "none";
        if (typeof liveChannel === "function") liveChannel();
        liveChannel = null;
        mostrarAcceso("v-login");
      }
    });
    await restaurarSesion();
  }

  if (window.__DCARELA_TEST_PANEL_SHORTCUTS__ === true) {
    document.documentElement.dataset.panelModule = "test-ready";
    return;
  }

  arrancar().then(() => {
    document.documentElement.dataset.panelModule = "ready";
    // Si el HTML servido no trae algun elemento, el panel funciona igual pero
    // queda constancia de que control quedo sin enlazar. Sin esto, un desajuste
    // entre panel.html y panel.js solo se notaba como un boton que no responde.
    if (elementosFaltantes.length) {
      document.documentElement.dataset.panelFaltantes = String(elementosFaltantes.length);
      console.warn(
        `[panel] ${elementosFaltantes.length} elemento(s) del HTML no existen y quedaron sin enlazar. ` +
        "Suele significar que panel.html esta desactualizado respecto a panel.js (revisa la cache o vuelve a publicar): " +
        elementosFaltantes.join(", ")
      );
    }
  }).catch(error => {
    document.documentElement.dataset.panelModule = "error";
    mostrarAcceso(cfg ? "v-login" : "v-config");
    const target = cfg ? $("loginErr") : $("cfgErr");
    if (target) target.textContent = `No se pudo iniciar el panel: ${error?.message || error}`;
  });
})();


// DCARELA_SESSION_GUARD_FINAL_1_0_30
async function dcWaitForAuthenticatedSession(client, timeoutMs = 10000, allowNoSession = false) {
  if (!client?.auth?.getSession) {
    return null;
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await client.auth.getSession();

    if (error) {
      throw error;
    }

    if (data?.session) {
      const expiresAt = Number(data.session.expires_at || 0) * 1000;
      if (expiresAt && expiresAt <= Date.now() + 60000 && client.auth.refreshSession) {
        const refreshed = await client.auth.refreshSession();
        if (refreshed.error) throw refreshed.error;
        if (refreshed.data?.session) return refreshed.data.session;
      }
      return data.session;
    }

    if (allowNoSession) return null;

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}
