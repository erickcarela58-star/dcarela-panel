(() => {
  "use strict";

  document.documentElement.dataset.panelModule = "started";
  const $ = id => document.getElementById(id);
  const cfg = JSON.parse(localStorage.getItem("dcarela.cfg") || "null") || window.__DCARELA_DEFAULT || null;
  const BUSINESS = cfg?.business || "dcarela";
  const READ_KEY = `dcarela.alertas.leidas.${BUSINESS}`;
  const RELEVANT_EVENTS = [
    "CierreConDiferencia", "ErrorSincronizacion", "BackupSnapshotFallido", "VentaCancelada",
    "DevolucionRegistrada", "InventarioBajo", "ProductoAgotado", "DispositivoBloqueado",
    "CajaAbierta", "CajaCerrada", "CompraCreditoProveedorRegistrada", "PagoProveedorRegistrado",
    "GastoRegistrado", "ActualizacionDisponible"
  ];

  let sb = null;
  let session = null;
  let sesionOk = false;
  let cancelCache = { at: 0, ids: new Set() };
  let alertasCache = null;
  let toastTimer = null;
  let liveRefreshTimer = null;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
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
  const fechaCorta = value => value ? new Date(value).toLocaleDateString("es-DO", {
    day: "2-digit", month: "2-digit"
  }) : "--";
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
    ["v-config", "v-login"].forEach(id => $(id).classList.toggle("oculto", id !== view));
  }

  const loaders = {
    dashboard: cargarDashboard,
    ventas: cargarVentas,
    caja: cargarCaja,
    reportes: cargarReporte,
    inventario: cargarInventario,
    proveedores: cargarProveedores,
    notificaciones: cargarNotificaciones,
    dispositivos: cargarDispositivos,
    respaldos: cargarRespaldos,
    descargar: cargarDescargar,
    configuracion: cargarConfiguracion
  };

  function mostrarVista(name) {
    const selected = loaders[name] ? name : "dashboard";
    document.querySelectorAll(".vista").forEach(view => view.classList.add("oculto"));
    $("v-" + selected).classList.remove("oculto");
    document.querySelectorAll("#menu a").forEach(link => {
      const active = link.getAttribute("href") === `#${selected}`;
      link.classList.toggle("act", active);
      if (active) $("pageTitle").textContent = link.dataset.title || link.textContent.trim();
    });
    loaders[selected]().catch(error => mostrarError(selected, error));
  }

  function mostrarError(module, error) {
    verEstado(false, "Error al consultar datos");
    const target = document.querySelector(`#v-${module} .surface:last-child`) || $("v-" + module);
    if (target) target.insertAdjacentHTML("afterbegin", `<p class="error">${esc(error?.message || error)}</p>`);
  }

  async function eventos(types, from, to, limit = 400) {
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
    verEstado(true);
    return output;
  }

  function clavesVenta(event) {
    const payload = P(event);
    return [event?.entity_id, payload.id, payload.ventaId, payload.venta_id, payload.saleId, payload.sale_id]
      .filter(Boolean).map(value => String(value).trim().toLowerCase());
  }

  async function idsVentasAnuladas(force = false) {
    if (!force && Date.now() - cancelCache.at < 30000) return cancelCache.ids;
    const cancellations = await eventos(["VentaCancelada"], null, null, 50000);
    const ids = new Set();
    cancellations.forEach(event => clavesVenta(event).forEach(id => ids.add(id)));
    cancelCache = { at: Date.now(), ids };
    return ids;
  }

  async function ventasActivas(from, to, limit = 50000) {
    const [sales, cancelled] = await Promise.all([
      eventos(["VentaCobrada"], from, to, limit),
      idsVentasAnuladas()
    ]);
    const active = sales.filter(sale => !clavesVenta(sale).some(id => cancelled.has(id)));
    return { active, excluded: sales.length - active.length, raw: sales };
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
      InventarioBajo: ["Inventario", "Inventario bajo", payload.nombre || event.entity_id || ""],
      ErrorSincronizacion: ["Sync", "Error de sincronizacion", payload.message || payload.error || ""],
      BackupSnapshotCreado: ["Respaldo", "Snapshot creado", payload.storagePath || payload.storage_path || ""],
      BackupSnapshotFallido: ["Respaldo", "Fallo de respaldo", payload.message || payload.error || ""],
      CompraCreditoProveedorRegistrada: ["CxP", `Compra a credito ${money(montoDe(payload))}`, payload.proveedorNombre || ""],
      PagoProveedorRegistrado: ["CxP", `Pago a proveedor ${money(montoDe(payload))}`, payload.proveedorNombre || ""],
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

  function metric(label, value) {
    return `<div class="metric-chip"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
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
    const from = inicioDia();
    const to = finDia();
    const [{ active, excluded }, returns, activity, devices, backups] = await Promise.all([
      ventasActivas(from, to, 5000),
      eventos(["DevolucionRegistrada"], from, to, 1000),
      eventos(null, null, null, 45),
      getDevices().catch(() => []),
      getBackups(5).catch(() => [])
    ]);
    const gross = active.reduce((sum, event) => sum + totalDe(P(event)), 0);
    const refunds = returns.reduce((sum, event) => sum + montoDe(P(event)), 0);
    const net = gross - refunds;
    const cash = active.filter(event => metodoDe(P(event)).includes("efectivo")).reduce((sum, event) => sum + totalDe(P(event)), 0);
    const tax = active.reduce((sum, event) => sum + itbisDe(P(event)), 0);
    const cashEvents = activity.filter(event => ["CajaAbierta", "CajaCerrada"].includes(event.event_type));
    const cashState = cashEvents[0]?.event_type === "CajaAbierta" ? "Abierta" : "Cerrada";

    $("kVenta").textContent = money(net);
    $("kVentaDetalle").textContent = refunds ? `${money(refunds)} devuelto` : `${excluded} anulada(s) excluida(s)`;
    $("kNum").textContent = active.length;
    $("kNumDetalle").textContent = excluded ? `${excluded} anulada(s) fuera del total` : "ventas validas";
    $("kProm").textContent = money(active.length ? Math.round(gross / active.length) : 0);
    $("kEfec").textContent = money(cash);
    $("kItbis").textContent = money(tax);
    $("kCaja").textContent = cashState;
    $("kCajaDetalle").textContent = cashEvents[0] ? fecha(fechaEventoIso(cashEvents[0])) : "sin eventos";
    renderHourChart(active);
    renderFeed(activity);

    const latestEvent = activity[0];
    const latestBackup = backups[0];
    const activeDevices = devices.filter(device => device.status === "activa").length;
    const unread = (await obtenerAlertas()).filter(alert => !alert.read).length;
    $("healthList").innerHTML = [
      ["Sincronizacion", latestEvent ? `Ultimo evento ${fecha(fechaEventoIso(latestEvent))}` : "Sin eventos", latestEvent ? "activa" : "sin datos", latestEvent ? "" : "warn"],
      ["Respaldo", latestBackup ? `${fecha(latestBackup.created_at)} | ${latestBackup.status}` : "No disponible", latestBackup?.status || "pendiente", latestBackup ? "" : "bad"],
      ["Dispositivos", `${activeDevices} de ${devices.length} activos`, activeDevices ? "en linea" : "revisar", activeDevices ? "" : "warn"],
      ["Alertas", `${unread} sin leer`, unread ? "atencion" : "al dia", unread ? "warn" : ""]
    ].map(([title, detail, value, tone]) => `<div class="health-row"><span class="health-dot ${tone}"></span><div><b>${esc(title)}</b><small>${esc(detail)}</small></div><span class="health-value">${esc(value)}</span></div>`).join("");
    renderAlertPreview();
    $("pillVivo").textContent = "en vivo";
  }

  async function cargarVentas() {
    if (!$("venDesde").value) {
      const today = inputDate(new Date());
      $("venDesde").value = today;
      $("venHasta").value = today;
    }
    const from = inicioDia($("venDesde").value);
    const to = finDia($("venHasta").value);
    const { active, excluded } = await ventasActivas(from, to, 50000);
    const total = active.reduce((sum, event) => sum + totalDe(P(event)), 0);
    const tax = active.reduce((sum, event) => sum + itbisDe(P(event)), 0);
    $("ventasResumen").innerHTML = metric("Ventas validas", String(active.length)) + metric("Total", money(total)) + metric("ITBIS", money(tax)) + metric("Anuladas excluidas", String(excluded));
    if (!active.length) {
      $("ventasTabla").innerHTML = '<div class="empty-state">Sin ventas validas en ese rango.</div>';
      return;
    }
    const rows = active.map((event, index) => {
      const payload = P(event);
      const lines = lineasDe(payload).map(line => `${esc(line.nombre || "Producto")} x ${esc(line.cantidad ?? 1)} = ${money(line.importeFinalCentavos ?? line.importe_final_centavos)}`).join("<br>");
      return `<tr><td>${esc(fecha(fechaEventoIso(event)))}</td><td>#${esc(payload.folio ?? "--")}</td><td>${esc(payload.cajeroNombre || payload.usuarioNombre || "--")}</td><td>${esc(payload.metodo || payload.metodoPago || "--")}</td><td>${esc(payload.clienteNombre || "Consumidor final")}</td><td class="amount">${money(totalDe(payload))}</td><td><button class="secondary detail-toggle" data-detail="sale-${index}">Detalle</button></td></tr>
        <tr id="sale-${index}" class="detail-row oculto"><td colspan="7"><div class="detail-box">${lines || "Sin lineas sincronizadas"}<br>Subtotal: ${money(payload.subtotalSinItbisCentavos)} | ITBIS: ${money(itbisDe(payload))} | Ajuste: ${money(payload.ajusteRedondeoCentavos)}${payload.nota ? `<br>Nota: ${esc(payload.nota)}` : ""}</div></td></tr>`;
    }).join("");
    $("ventasTabla").innerHTML = `<table><thead><tr><th>Fecha</th><th>Folio</th><th>Cajero</th><th>Metodo</th><th>Cliente</th><th class="amount">Total</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    document.querySelectorAll(".detail-toggle").forEach(button => button.addEventListener("click", () => $(button.dataset.detail).classList.toggle("oculto")));
  }

  async function cargarCaja() {
    const types = ["CajaAbierta", "CajaCerrada", "EntradaEfectivo", "SalidaEfectivo", "CierreConDiferencia", "TurnoCambiado"];
    const items = await eventos(types, null, null, 500);
    const closings = items.filter(item => item.event_type === "CajaCerrada");
    const differences = items.filter(item => item.event_type === "CierreConDiferencia");
    const movements = items.filter(item => ["EntradaEfectivo", "SalidaEfectivo"].includes(item.event_type));
    $("cajaResumen").innerHTML = metric("Cierres registrados", String(closings.length)) + metric("Diferencias", String(differences.length)) + metric("Movimientos", String(movements.length));
    $("cajaTabla").innerHTML = tabla(items, event => {
      const payload = P(event);
      const amount = numero(payload.montoCentavos, payload.efectivoContadoCentavos, payload.montoAperturaCentavos);
      return [fecha(fechaEventoIso(event)), event.event_type, amount ? money(amount) : "--", payload.usuarioNombre || payload.cajeroNombre || "--", payload.motivo || payload.explicacion || payload.nota || "", event.event_type.includes("Diferencia") || numero(payload.diferenciaCentavos) ? money(payload.diferenciaCentavos) : "--"];
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
      const method = metodoDe(payload);
      methods[method] = (methods[method] || 0) + totalDe(payload);
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
    $("repResumen").innerHTML = [
      ["Venta neta", money(net), "accent-blue"], ["Ventas", String(active.length), "accent-cyan"],
      ["Promedio", money(active.length ? Math.round(gross / active.length) : 0), "accent-orange"],
      ["ITBIS", money(tax), "accent-violet"], ["Devoluciones", money(refunds), "accent-red"],
      ["Anuladas", String(excluded), "accent-green"]
    ].map(([label, value, cls]) => `<article class="kpi ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>rango seleccionado</small></article>`).join("");
    const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
    const maxDay = Math.max(1, ...days.map(([, value]) => value.total - value.refunds));
    $("repGrafica").innerHTML = days.length ? days.map(([day, value]) => {
      const current = value.total - value.refunds;
      return `<div class="report-bar"><span>${esc(fechaCorta(`${day}T12:00:00`))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, current * 100 / maxDay)}%"></div></div><strong>${money(current)}</strong></div>`;
    }).join("") : '<div class="empty-state">Sin datos para graficar.</div>';
    $("repMetodos").innerHTML = tablaSimple(Object.entries(methods).sort((a, b) => b[1] - a[1]), ["Metodo", "Total"], value => money(value));
    $("repPorDia").innerHTML = tabla(days, ([day, value]) => [fechaCorta(`${day}T12:00:00`), value.sales, money(value.total), money(value.tax), money(value.refunds), money(value.total - value.refunds)], ["Dia", "Ventas", "Bruto", "ITBIS", "Devuelto", "Neto"]);
    $("repTop").innerHTML = tablaSimple(Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 20), ["Producto", "Importe"], value => money(value));
  }

  async function cargarInventario() {
    const types = ["ProductoCreado", "ProductoEditado", "ProductoDesactivado", "InventarioAjustado", "CompraRegistrada", "KitCreado", "KitEditado", "LoteDeRedondeoAplicado"];
    const items = await eventos(types, null, null, 500);
    $("invResumen").innerHTML = metric("Cambios recibidos", String(items.length)) + metric("Ajustes de inventario", String(items.filter(item => item.event_type === "InventarioAjustado").length)) + metric("Kits / combos", String(items.filter(item => item.event_type.startsWith("Kit")).length));
    $("invTabla").innerHTML = tabla(items, event => {
      const payload = P(event);
      return [fecha(fechaEventoIso(event)), event.event_type, payload.nombre || payload.productoNombre || event.entity_id || "--", payload.precioFinalCentavos != null ? money(payload.precioFinalCentavos) : "--", payload.stock ?? payload.nuevoStock ?? "--", payload.usuarioNombre || "--"];
    }, ["Fecha", "Evento", "Producto", "Precio", "Stock", "Usuario"]);
  }

  async function cargarProveedores() {
    const types = ["CompraCreditoProveedorRegistrada", "PagoProveedorRegistrado", "GastoRegistrado", "GastoEditado", "GastoEliminado", "CategoriaGastoCreada", "CuentaPagarCreada", "CuotaProveedorRegistrada"];
    const items = await eventos(types, null, null, 1000);
    const expenses = items.filter(item => item.event_type.includes("Gasto")).reduce((sum, item) => sum + montoDe(P(item)), 0);
    const purchases = items.filter(item => item.event_type === "CompraCreditoProveedorRegistrada").reduce((sum, item) => sum + montoDe(P(item)), 0);
    const payments = items.filter(item => item.event_type === "PagoProveedorRegistrado").reduce((sum, item) => sum + montoDe(P(item)), 0);
    $("provResumen").innerHTML = metric("Gastos sincronizados", money(expenses)) + metric("Compras a credito", money(purchases)) + metric("Pagos registrados", money(payments)) + metric("Balance por eventos", money(purchases - payments));
    $("provTabla").innerHTML = tabla(items, event => {
      const payload = P(event);
      return [fecha(fechaEventoIso(event)), event.event_type, payload.categoria || payload.proveedorNombre || payload.nombre || "--", payload.descripcion || payload.concepto || "--", money(montoDe(payload)), payload.metodo || payload.metodoPago || "--", payload.usuarioNombre || "--", payload.nota || payload.motivo || ""];
    }, ["Fecha", "Evento", "Categoria / proveedor", "Descripcion", "Monto", "Metodo", "Usuario", "Nota"]);
  }

  function alertDefinition(event) {
    const payload = P(event);
    const summary = resumenEvento(event);
    const severity = ["CierreConDiferencia", "ErrorSincronizacion", "BackupSnapshotFallido", "DispositivoBloqueado"].includes(event.event_type)
      ? "critical" : ["VentaCancelada", "DevolucionRegistrada", "InventarioBajo", "ProductoAgotado", "CompraCreditoProveedorRegistrada"].includes(event.event_type)
        ? "warning" : "info";
    const targets = {
      CierreConDiferencia: "caja", CajaAbierta: "caja", CajaCerrada: "caja",
      VentaCancelada: "ventas", DevolucionRegistrada: "ventas",
      InventarioBajo: "inventario", ProductoAgotado: "inventario",
      ErrorSincronizacion: "notificaciones", BackupSnapshotFallido: "respaldos",
      DispositivoBloqueado: "dispositivos", CompraCreditoProveedorRegistrada: "proveedores",
      PagoProveedorRegistrado: "proveedores", GastoRegistrado: "proveedores", ActualizacionDisponible: "descargar"
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
    if (type.includes("proveedor") || type.includes("gasto")) return "proveedores";
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
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-device-block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
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

  async function cargarConfiguracion() {
    $("cfgInfo").innerHTML = `<div class="config-line"><span>Proyecto</span><strong>${esc(cfg.url)}</strong></div><div class="config-line"><span>Negocio</span><strong>${esc(BUSINESS)}</strong></div><div class="config-line"><span>Usuario</span><strong>${esc(session?.user?.email || "--")}</strong></div><div class="config-line"><span>Sesion</span><strong>Autenticada con Supabase Auth</strong></div>`;
    const changes = await eventos(["ConfiguracionActualizada", "FuenteVisualActualizada", "CategoriasNormalizadas", "TextosMigracionReparados", "ProveedoresDepurados"], null, null, 100);
    $("cfgEventos").innerHTML = tabla(changes, event => [fecha(fechaEventoIso(event)), event.event_type, P(event).seccion || event.entity_id || "--", P(event).usuarioNombre || "--"], ["Fecha", "Evento", "Seccion", "Usuario"]);
  }

  async function consultarVersion() {
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-installer-version?channel=stable`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
    });
    if (!response.ok) throw new Error(`Servicio de versiones no disponible (HTTP ${response.status}).`);
    const body = await response.json();
    return body?.latest || body?.data || (body?.version ? body : null);
  }

  async function comprobarVersion() {
    try {
      const latest = await consultarVersion();
      if (!latest) return;
      $("updateTitle").textContent = `Version ${latest.version} disponible${latest.mandatory ? " (obligatoria)" : ""}`;
      $("updateNotes").textContent = latest.notes || "Nueva version publicada en el canal estable.";
      $("updateBanner").classList.remove("oculto");
    } catch { }
  }

  async function cargarDescargar() {
    try {
      const latest = await consultarVersion();
      if (!latest) {
        $("dlInfo").innerHTML = '<div class="empty-state"><strong>No hay una version publicada en installer_versions.</strong><br>El instalador local puede generarse, pero la descarga publica requiere registrar el release.</div>';
        return;
      }
      $("dlInfo").innerHTML = `<div class="release-layout"><div><p class="eyebrow">Canal ${esc(latest.channel || "stable")}</p><div class="release-version">${esc(latest.version)}</div><p class="release-notes">${esc(latest.notes || "Version estable del Punto de Venta.")}</p><div class="release-meta"><span class="tag ${latest.mandatory ? "warn" : "ok"}">${latest.mandatory ? "Actualizacion obligatoria" : "Actualizacion disponible"}</span><span class="tag">Publicado ${esc(fecha(latest.created_at))}</span>${latest.sha256 ? `<span class="tag">SHA-256 ${esc(String(latest.sha256).slice(0, 14))}...</span>` : ""}</div></div>${latest.release_url ? `<a class="button-link" href="${esc(latest.release_url)}" target="_blank" rel="noopener">Descargar instalador</a>` : '<span class="tag warn">URL de descarga pendiente</span>'}</div>`;
    } catch (error) {
      $("dlInfo").innerHTML = `<p class="error">${esc(error.message)}</p>`;
    }
  }

  function tabla(items, row, headers) {
    if (!items.length) return '<div class="empty-state">Sin datos sincronizados.</div>';
    return `<table><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${items.map(item => `<tr>${row(item).map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function tablaSimple(entries, headers, formatter) {
    if (!entries.length) return '<div class="empty-state">Sin datos.</div>';
    return `<table><thead><tr><th>${esc(headers[0])}</th><th>${esc(headers[1])}</th></tr></thead><tbody>${entries.map(([key, value]) => `<tr><td>${esc(key)}</td><td class="amount">${formatter(value)}</td></tr>`).join("")}</tbody></table>`;
  }

  function scheduleLiveRefresh() {
    clearTimeout(liveRefreshTimer);
    liveRefreshTimer = setTimeout(() => {
      const view = location.hash.slice(1) || "dashboard";
      if (view === "dashboard") cargarDashboard().catch(() => {});
      if (view === "notificaciones") cargarNotificaciones().catch(() => {});
    }, 700);
  }

  function conectarRealtime() {
    sb.channel("dcarela-pos-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sync_events", filter: `business_id=eq.${BUSINESS}` }, change => {
        if (change.new?.event_type === "VentaCancelada") cancelCache.at = 0;
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
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          $("pillVivo").textContent = "en vivo";
          verEstado(true, "Realtime conectado");
        }
      });
  }

  async function iniciar() {
    sesionOk = true;
    $("access").classList.add("oculto");
    $("app").classList.remove("oculto");
    $("sessionEmail").textContent = session?.user?.email || "Administrador";
    verEstado(true, "Sesion autenticada");
    conectarRealtime();
    await obtenerAlertas(true).catch(() => []);
    comprobarVersion();
    mostrarVista(location.hash.slice(1) || "dashboard");
  }

  async function arrancar() {
    $("btnGuardarCfg").addEventListener("click", () => {
      const url = $("cfgUrl").value.trim();
      const anon = $("cfgAnon").value.trim();
      if (!url || !anon) { $("cfgErr").textContent = "Completa la URL y la clave publica."; return; }
      localStorage.setItem("dcarela.cfg", JSON.stringify({ url, anon, business: BUSINESS }));
      location.reload();
    });
    const resetConnection = () => { localStorage.removeItem("dcarela.cfg"); location.reload(); };
    $("btnCambiarCfg").addEventListener("click", resetConnection);
    $("btnReset").addEventListener("click", resetConnection);
    $("btnEntrar").addEventListener("click", async () => {
      $("loginErr").textContent = "";
      const result = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("pass").value });
      if (result.error) { $("loginErr").textContent = result.error.message; return; }
      session = result.data.session;
      iniciar();
    });
    $("pass").addEventListener("keydown", event => { if (event.key === "Enter") $("btnEntrar").click(); });
    $("btnSalir").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
    $("btnNotificaciones").addEventListener("click", () => { location.hash = "notificaciones"; });
    $("btnVentas").addEventListener("click", () => cargarVentas().catch(error => mostrarError("ventas", error)));
    $("btnReporte").addEventListener("click", () => cargarReporte().catch(error => mostrarError("reportes", error)));
    $("alertFilter").addEventListener("change", () => cargarNotificaciones().catch(() => {}));
    $("btnLeerTodas").addEventListener("click", async () => {
      const alerts = await obtenerAlertas();
      const read = readSet();
      alerts.forEach(alert => { read.add(alert.key); alert.read = true; });
      localStorage.setItem(READ_KEY, JSON.stringify([...read].slice(-1200)));
      const systemIds = alerts.filter(alert => alert.source === "system" && alert.sourceId && !alert.acknowledged).map(alert => alert.sourceId);
      if (systemIds.length && session?.user?.id) await sb.from("system_alerts").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: session.user.id }).in("id", systemIds).then(() => {});
      actualizarContadorAlertas();
      cargarNotificaciones();
    });
    window.addEventListener("hashchange", () => { if (sesionOk) mostrarVista(location.hash.slice(1) || "dashboard"); });
    setInterval(() => { $("footerClock").textContent = new Date().toLocaleString("es-DO", { dateStyle: "full", timeStyle: "short" }); }, 1000);

    if (!cfg) { mostrarAcceso("v-config"); return; }
    if (!window.supabase?.createClient) {
      mostrarAcceso("v-config");
      $("cfgErr").textContent = "No se pudo cargar la biblioteca de Supabase.";
      return;
    }
    sb = window.supabase.createClient(cfg.url, cfg.anon);
    const result = await sb.auth.getSession();
    if (result.error) { mostrarAcceso("v-login"); $("loginErr").textContent = result.error.message; return; }
    session = result.data.session;
    if (session) await iniciar(); else mostrarAcceso("v-login");
  }

  arrancar().then(() => {
    document.documentElement.dataset.panelModule = "ready";
  }).catch(error => {
    document.documentElement.dataset.panelModule = "error";
    mostrarAcceso(cfg ? "v-login" : "v-config");
    const target = cfg ? $("loginErr") : $("cfgErr");
    if (target) target.textContent = `No se pudo iniciar el panel: ${error?.message || error}`;
  });
})();
