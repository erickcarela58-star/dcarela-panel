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
    "GastoRegistrado", "GastoEditado", "GastoEliminado", "CostoRecurrenteGuardado",
    "CostoObligacionGenerada", "CostoObligacionGuardada", "CostoPagoRegistrado",
    "CostoObligacionAnulada", "ReciboPagoEmitido", "ReciboPagoFirmaActualizada",
    "ReciboPagoAnulado", "ActualizacionDisponible", "ErrorCajonDinero", "ErrorImpresionCorte"
  ];

  let sb = null;
  let session = null;
  let sesionOk = false;
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
    ["v-config", "v-login"].forEach(id => $(id).classList.toggle("oculto", id !== view));
  }

  const loaders = {
    dashboard: cargarDashboard,
    ventas: cargarVentas,
    caja: cargarCaja,
    turnos: cargarTurnos,
    recalcular: cargarRecalculador,
    reportes: cargarReporte,
    inventario: cargarInventario,
    clientes: cargarClientes,
    proveedores: cargarProveedores,
    asistente: cargarAsistente,
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

  async function cargarRolEdicion() {
    const { data, error } = await sb.from("pos_business_members")
      .select("role,active")
      .eq("business_id", BUSINESS)
      .eq("user_id", session.user.id)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    memberRole = data?.role || "viewer";
    canEdit = ["owner", "admin"].includes(memberRole);
    document.querySelectorAll(".admin-only").forEach(element => element.classList.toggle("oculto", !canEdit));
  }

  async function authenticatedHeaders(includeJson = false) {
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
    toast(result.message || "Cambio guardado y enviado a sincronizacion.");
    return result;
  }

  async function iaRequest(mode, data = {}) {
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
    const canResolve = status === "pending" && (canEdit || !action.requires_admin_approval);
    const canUndo = status === "executed" && action.reversible && (canEdit || !action.requires_admin_approval);
    const approval = action.requires_admin_approval && status === "pending"
      ? "Espera aprobacion administrativa."
      : status === "pending" && action.risk_level === "high"
        ? "Confirmacion requerida por seguridad."
        : status === "executed" && action.execution_mode === "automatic"
          ? "Aplicada automaticamente y reversible."
          : iaStatusLabel(status);
    return `<article class="assistant-action-card ${esc(status)}" data-ia-action="${esc(action.id)}">
      <strong>${esc(IA_ACTION_LABELS[action.action] || action.action || "Cambio propuesto")}</strong>
      <p>${esc(action.summary || "Revisa esta propuesta antes de aplicarla.")}</p>
      <small>${esc(approval)}${action.required_capability ? ` · ${esc(IA_CAPABILITY_LABELS[action.required_capability] || action.required_capability)}` : ""}</small>
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

  function iaAttachmentsMeta(message) {
    const files = Array.isArray(message?.metadata?.attachments) ? message.metadata.attachments : [];
    if (!files.length) return "";
    return `<div class="message-body"><p>${files.map(file => `Adjunto: ${esc(file.name || "documento")}`).join("<br>")}</p></div>`;
  }

  function iaMessageHtml(message) {
    const role = message.role === "user" ? "user" : "assistant";
    const label = role === "user" ? (session?.user?.email || "Administrador") : "Asistente IA";
    return `<article class="assistant-message ${role}" data-message-id="${esc(message.id || "")}">
      <span class="message-role">${esc(label)}</span>
      <button class="assistant-copy" type="button" data-copy-message="${esc(message.id || "")}" title="Copiar mensaje" aria-label="Copiar mensaje">&#10697;</button>
      <div class="message-body">${iaMarkdown(message.content)}</div>
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
    actions.filter(action => !renderedActions.has(String(action.id))).forEach(action => chunks.push(iaActionHtml(action)));
    $("iaMessages").innerHTML = chunks.length ? chunks.join("") : `<div class="assistant-empty"><strong>Pregunta o solicita una accion</strong><p>El asistente usara datos reales y documentara cada cambio.</p></div>`;
    $("iaConversationTitle").textContent = history?.conversation?.title || "Nueva conversacion";
    if (history?.conversation?.model) $("iaModel").value = history.conversation.model;
    iaBindMessageActions(messages);
    requestAnimationFrame(() => { $("iaMessages").scrollTop = $("iaMessages").scrollHeight; });
  }

  function renderIaConversations() {
    $("iaConversations").innerHTML = iaConversations.length ? iaConversations.map(conversation => `
      <button class="assistant-conversation ${String(conversation.id) === String(iaConversationId) ? "act" : ""}" type="button" data-ia-conversation="${esc(conversation.id)}">
        <span><span>${esc(conversation.title || "Nueva conversacion")}</span><small>${esc(fecha(conversation.updated_at))}</small></span>
        <span class="archive" data-ia-archive="${esc(conversation.id)}" title="Archivar" aria-label="Archivar conversacion">&#215;</span>
      </button>`).join("") : `<div class="empty-state">Aun no hay conversaciones.</div>`;
    $("iaConversations").querySelectorAll("[data-ia-conversation]").forEach(button => button.addEventListener("click", event => {
      if (event.target.closest("[data-ia-archive]")) return;
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
    $("iaStatus").textContent = status.configured ? "IA conectada" : "Falta configuracion";
    $("iaStatus").classList.toggle("bad", !status.configured || !status.capabilities?.can_use);
    $("iaRole").textContent = status.full_admin_access ? `${status.role} · control total` : status.role;
    $("iaAccessSummary").textContent = status.full_admin_access ? "Acceso completo por rol administrativo" : "Acceso delegado por capacidades";
    $("iaCapabilities").innerHTML = Object.entries(IA_CAPABILITY_LABELS).map(([key, label]) => {
      const enabled = Boolean(status.capabilities?.[key]);
      return `<div class="assistant-capability"><span>${esc(label)}</span><b class="${enabled ? "" : "off"}">${enabled ? "Si" : "No"}</b></div>`;
    }).join("");
    const current = $("iaModel").value;
    $("iaModel").innerHTML = (status.models || []).map(model => `<option value="${esc(model.id)}">${esc(model.label)} · ${esc(model.level)}</option>`).join("");
    const preferred = localStorage.getItem(`dcarela.ia.model.v2.${BUSINESS}`) || current || status.models?.[0]?.id;
    if (preferred && [...$("iaModel").options].some(option => option.value === preferred)) $("iaModel").value = preferred;
    $("iaInput").disabled = !status.configured || !status.capabilities?.can_use;
    $("btnIaEnviar").disabled = $("iaInput").disabled;
    $("btnIaAdjuntar").disabled = $("iaInput").disabled;
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
      if (!allowed.test(file.type)) { toast(`Formato no compatible: ${file.name}`); continue; }
      if (file.size > 6 * 1024 * 1024) { toast(`${file.name} supera 6 MB.`); continue; }
      iaAttachments.push({ name: file.name, mime: file.type || "application/octet-stream", data: await fileToBase64(file), size: file.size });
    }
    if (iaAttachments.reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024) {
      iaAttachments.pop();
      toast("Los adjuntos no pueden superar 8 MB en total.");
    }
    renderIaAttachments();
  }

  async function enviarMensajeIa() {
    if (iaBusy) return;
    const message = $("iaInput").value.trim();
    if (!message && !iaAttachments.length) return;
    iaBusy = true;
    $("iaError").textContent = "";
    $("btnIaEnviar").disabled = true;
    const optimistic = { id: `temp-${Date.now()}`, role: "user", content: message || "Analiza los archivos adjuntos.", metadata: { attachments: iaAttachments }, created_at: new Date().toISOString() };
    const empty = $("iaMessages").querySelector(".assistant-empty");
    if (empty) empty.remove();
    $("iaMessages").insertAdjacentHTML("beforeend", iaMessageHtml(optimistic) + `<div id="iaThinking" class="assistant-thinking"><span>Pensando y consultando datos</span><i></i><i></i><i></i></div>`);
    $("iaMessages").scrollTop = $("iaMessages").scrollHeight;
    const attachments = iaAttachments.map(({ name, mime, data }) => ({ name, mime, data }));
    try {
      const result = await iaRequest("chat", {
        conversation_id: iaConversationId,
        message,
        model: $("iaModel").value,
        attachments
      });
      iaConversationId = result.conversation.id;
      $("iaModelEffective").textContent = `Respuesta generada con ${result.effective_model}`;
      $("iaInput").value = "";
      $("iaInput").style.height = "";
      iaAttachments = [];
      renderIaAttachments();
      await cargarConversacionesIa(false);
      await abrirConversacionIa(iaConversationId);
      if (canEdit) await renderIaApprovals();
    } catch (error) {
      $("iaThinking")?.remove();
      $("iaMessages").querySelector(`[data-message-id="${optimistic.id}"]`)?.remove();
      if (!$("iaMessages").children.length) $("iaMessages").innerHTML = `<div class="assistant-empty"><strong>Pregunta o solicita una accion</strong><p>El asistente usara datos reales y documentara cada cambio.</p></div>`;
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
  }

  function cerrarEditor() {
    $("editorOverlay").classList.add("oculto");
    $("editorOverlay").setAttribute("aria-hidden", "true");
    $("editorFields").innerHTML = "";
    $("editorError").textContent = "";
    $("btnGuardarEditor").textContent = "Guardar y sincronizar";
    editorSubmit = null;
  }

  function abrirEditor(title, subtitle, fields, onSubmit, submitLabel = "Guardar y sincronizar") {
    if (!canEdit) { toast("Tu cuenta no tiene permiso para editar."); return; }
    $("editorTitle").textContent = title;
    $("editorSubtitle").textContent = subtitle || "El cambio quedara auditado y se aplicara en las cajas conectadas.";
    $("editorFields").innerHTML = fields;
    $("editorError").textContent = "";
    $("btnGuardarEditor").textContent = submitLabel;
    editorSubmit = onSubmit;
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
    return String(value ?? "")
      .replace(/\uFFFD/g, "n")
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
    const [productEvents, categoryEvents, comboEvents] = await Promise.all([
      eventos(["ProductoCreado", "ProductoEditado", "ProductoDesactivado", "InventarioAjustado"], null, null, 10000),
      eventos(["CategoriaCreada"], null, null, 2000),
      eventos(["KitEditado"], null, null, 10000)
    ]);
    productCatalog = consolidateProducts(
      mergeEvents(productEvents, ["ProductoCreado", "ProductoEditado", "ProductoDesactivado"])
    )
      .filter(item => item.nombre)
      .map(item => ({ ...item, activo: item._stateEvent !== "ProductoDesactivado" && item.activo !== false }))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
    categoryCatalog = consolidateNamed(mergeEvents(categoryEvents, ["CategoriaCreada"]))
      .filter(item => item.nombre)
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
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

  async function cargarClientesCloud(force = false) {
    if (!force && clientCatalog) return clientCatalog;
    const items = await eventos(["ClienteCreado", "ClienteEditado", "ClienteDesactivado"], null, null, 10000);
    clientCatalog = mergeEvents(items, ["ClienteCreado", "ClienteEditado", "ClienteDesactivado"])
      .filter(item => item.nombre)
      .map(item => ({ ...item, activo: item._stateEvent !== "ClienteDesactivado" && item.activo !== false }))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
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

  function identificadorTurno(event) {
    const payload = P(event);
    return String(payload.turnoId || payload.turno_id || event?.entity_id || "").trim();
  }

  async function turnosDelRango(from, to, ventas = null) {
    const desdeExtendido = new Date(new Date(from).getTime() - 86400000).toISOString();
    const [resultadoVentas, eventosCaja, usuarios] = await Promise.all([
      ventas ? Promise.resolve({ active: ventas }) : ventasActivas(from, to, 50000),
      eventos(["CajaAbierta", "CajaCerrada", "CierreConDiferencia", "TurnoCambiado"], desdeExtendido, to, 10000),
      cargarUsuariosCloud()
    ]);
    const grupos = new Map();
    const crear = id => {
      if (!grupos.has(id)) grupos.set(id, {
        id, inicio: null, fin: null, ultimaVenta: null, caja: "Caja", estado: "abierto",
        apertura: null, esperado: null, contado: null, diferencia: null, motivo: "",
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
            return `<div class="turn-sale"><span>#${esc(payload.folio ?? "--")}</span><span>${esc(hora)}</span><span>${esc(nombreCajero(payload, userCatalog))}</span><span>${esc(payload.metodo || payload.metodoPago || "--")}</span><strong>${money(totalDe(payload))}</strong></div>`;
          }).join("")
        : '<div class="empty-state">Este turno no tiene ventas sincronizadas.</div>';
      return `<tr class="turn-row" id="turn-${esc(turno.id)}"><td>${esc(fecha(turno.inicio))}</td><td>${turno.fin ? esc(fecha(turno.fin)) : "En curso"}</td><td>${esc(turno.cajero)}</td><td>${esc(turno.caja)}</td><td>${turno.ventas.length}</td><td class="amount">${money(turno.total)}</td><td class="amount">${money(turno.efectivo)}</td><td class="amount">${turno.apertura === null ? "--" : money(turno.apertura)}</td><td class="amount">${turno.esperado === null ? "--" : money(turno.esperado)}</td><td class="amount">${turno.contado === null ? "--" : money(turno.contado)}</td><td class="amount ${diferenciaClase}" title="${esc(turno.motivo)}">${esc(diferenciaTexto)}</td><td><span class="tag ${turno.estado === "cerrado" ? "ok" : "warn"}">${esc(turno.estado)}</span></td><td><button class="secondary turn-toggle" data-detail="turn-detail-${index}">Ventas</button></td></tr>
        <tr id="turn-detail-${index}" class="detail-row oculto"><td colspan="13"><div class="detail-box turn-detail"><div class="turn-detail-head"><strong>Folios de este turno</strong><span>${turno.motivo ? `Nota del arqueo: ${esc(turno.motivo)}` : "Sin nota de diferencia"}</span></div>${pista ? `<div class="cash-clue ${diferencia > 0 ? "surplus" : "shortage"}">${esc(pista)}</div>` : ""}${detalle}</div></td></tr>`;
    }).join("");
    $("turnosTabla").innerHTML = `<table><thead><tr><th>Entrada</th><th>Salida</th><th>Cajero(s)</th><th>Caja</th><th>Ventas</th><th class="amount">Total</th><th class="amount">Efectivo</th><th class="amount">Apertura</th><th class="amount">Esperado</th><th class="amount">Contado</th><th class="amount">Diferencia</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
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
    const cash = active.reduce((sum, event) => sum + efectivoDe(P(event)), 0);
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
    const turnos = await turnosDelRango(from, to, active);
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
      return `<tr><td>${esc(fecha(fechaEventoIso(event)))}</td><td>#${esc(payload.folio ?? "--")}</td><td>${esc(nombreCajero(payload, userCatalog))}</td><td><button class="turn-link" data-turno="${esc(turnoId)}">${esc(etiquetaTurno)}</button></td><td>${esc(payload.metodo || payload.metodoPago || "--")}</td><td>${esc(payload.clienteNombre || "Consumidor final")}</td><td class="amount">${money(totalDe(payload))}</td><td><button class="secondary detail-toggle" data-detail="sale-${index}">Detalle</button></td></tr>
        <tr id="sale-${index}" class="detail-row oculto"><td colspan="8"><div class="detail-box">${lines || "Sin lineas sincronizadas"}<br>Subtotal: ${money(payload.subtotalSinItbisCentavos)} | ITBIS: ${money(itbisDe(payload))} | Ajuste: ${money(payload.ajusteRedondeoCentavos)}${payload.nota ? `<br>Nota: ${esc(payload.nota)}` : ""}</div></td></tr>`;
    }).join("");
    $("ventasTabla").innerHTML = `<table><thead><tr><th>Fecha</th><th>Folio</th><th>Cajero</th><th>Turno</th><th>Metodo</th><th>Cliente</th><th class="amount">Total</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    document.querySelectorAll(".detail-toggle").forEach(button => button.addEventListener("click", () => $(button.dataset.detail).classList.toggle("oculto")));
    $("ventasTabla").querySelectorAll("[data-turno]").forEach(button => button.addEventListener("click", () => {
      sessionStorage.setItem("dcarela.turno.focus", button.dataset.turno);
      location.hash = "turnos";
    }));
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
      const amount = numero(payload.montoCentavos, payload.efectivoContadoCentavos, payload.montoAperturaCentavos);
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
    $("repResumen").innerHTML = [
      ["Venta neta", money(net), "accent-blue"], ["Ventas", String(active.length), "accent-cyan"],
      ["Promedio", money(active.length ? Math.round(gross / active.length) : 0), "accent-orange"],
      ["ITBIS", money(tax), "accent-violet"], ["Devoluciones", money(refunds), "accent-red"],
      ["Anuladas", String(excluded), "accent-green"]
    ].map(([label, value, cls]) => `<article class="kpi ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>rango seleccionado</small></article>`).join("");
    const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
    lastReportExport = {
      desde: $("repDesde").value, hasta: $("repHasta").value,
      ventas: active.length, anuladas: excluded, bruto: gross, devoluciones: refunds,
      neto: net, itbis: tax, dias: days,
      metodos: Object.entries(methods).sort((a, b) => b[1] - a[1]),
      productos: Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 50)
    };
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
      <div class="field-wide combo-footer"><button id="btnAddComboRow" class="secondary" type="button">Agregar componente</button><strong id="comboCostPreview">Costo calculado: RD$0.00</strong></div>`, async form => {
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

  function abrirCategoriaGasto() {
    abrirEditor("Nueva categoria de gasto", "La categoria quedara disponible para gastos y salidas registradas en las cajas.", `<label class="field-wide"><span>Nombre</span><input name="nombre" required maxlength="120"></label>`, async form => {
      await adminWrite("expense_category.upsert", null, { nombre: form.get("nombre") });
      cerrarEditor();
      await cargarProveedores(true);
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
    const allowed = ["resumen", "movimientos", "cuentas", "presupuestos", "tarjetas", "recurrentes", "obligaciones", "recibos", "ajustes"];
    costTab = allowed.includes(tab) ? tab : "resumen";
    document.querySelectorAll("[data-cost-tab]").forEach(button => button.classList.toggle("act", button.dataset.costTab === costTab));
    $("provPanelResumen").classList.toggle("oculto", costTab !== "resumen");
    $("provPanelMovimientos").classList.toggle("oculto", costTab !== "movimientos");
    $("provPanelCuentas").classList.toggle("oculto", costTab !== "cuentas");
    $("provPanelPresupuestos").classList.toggle("oculto", costTab !== "presupuestos");
    $("provPanelTarjetas").classList.toggle("oculto", costTab !== "tarjetas");
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
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.from("fin_movimientos")
        .select("id,tipo,fecha,hora,monto_centavos,comision_centavos,cuenta_id,cuenta_destino_id,categoria_id,payee,descripcion,nota,es_propina,origen,venta_folio,moneda,tasa_cambio,monto_moneda_principal_centavos,archivo_url,etiquetas,conciliado,afecta_resultado,metadata,created_at,updated_at")
        .eq("business_id", BUSINESS).eq("estado", "registrado")
        .gte("fecha", from).lt("fecha", to)
        .order("fecha", { ascending: false }).range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function cargarCuentasFin(month) {
    const [cuentasRes, catsRes, movs, cardsRes, budgetsRes, preferencesRes, currenciesRes, cumuloRes] = await Promise.all([
      sb.rpc("fin_account_balances", { p_business_id: BUSINESS }),
      sb.from("fin_categorias").select("id,nombre,tipo,categoria_padre_id,orden,origen,updated_at").eq("business_id", BUSINESS).eq("estado", "activa").order("tipo").order("orden").order("nombre"),
      cargarMovimientosFinMes(month),
      sb.from("fin_tarjetas").select("*").eq("business_id", BUSINESS),
      sb.from("fin_presupuestos").select("*").eq("business_id", BUSINESS).eq("estado", "activo").order("periodo_inicio", { ascending: false }).limit(500),
      sb.from("fin_preferencias").select("*").eq("business_id", BUSINESS).maybeSingle(),
      sb.from("fin_divisas").select("*").eq("business_id", BUSINESS).eq("activa", true).order("principal", { ascending: false }).order("codigo"),
      sb.rpc("fin_cumulo_mensual", { p_business_id: BUSINESS }),
    ]);
    if (cuentasRes.error) throw cuentasRes.error;
    if (catsRes.error) throw catsRes.error;
    if (cardsRes.error) throw cardsRes.error;
    if (budgetsRes.error) throw budgetsRes.error;
    if (preferencesRes.error) throw preferencesRes.error;
    if (currenciesRes.error) throw currenciesRes.error;
    const cuentas = cuentasRes.data || [];
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
      month,
    };
    dispararAlertaCumuloMensual();
    finDashboardPeriod = finStateCache.preferences?.periodo_dashboard || finDashboardPeriod;
    renderFinAccounts();
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

  const FIN_CHART_COLORS = ["#0A3679", "#1797E8", "#FF7F03", "#168579", "#C53F48", "#7455A5", "#E2A62B", "#4A6D8C"];

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
      return `<article class="fin-account ${balance < 0 ? "neg" : "pos"}${account.oculta ? " muted" : ""}">
        <button type="button" class="fin-account-open" data-fin-account-ledger="${esc(account.id)}" title="Ver los movimientos que forman este saldo">
          <span class="fin-account-name">${esc(account.nombre)}</span>
          <strong>${isCard ? `Deuda ${money(display)}` : money(display)}</strong>
          <small>${esc(FIN_TIPO_LABEL[account.tipo] || account.tipo)}${account.ligada_ventas ? " &middot; ligada a ventas" : ""}${account.oculta ? " &middot; oculta" : ""}</small>
        </button>
        ${canEdit ? `<div class="fin-account-actions"><button type="button" data-fin-account-reconcile="${esc(account.id)}">Conciliar</button><button type="button" data-fin-account-edit="${esc(account.id)}">Editar</button></div>` : ""}
      </article>`;
    }).join("");
    const cumulo = state.cumulo;
    const cumuloCard = cumulo && numero(cumulo.total_centavos) > 0
      ? `<article class="fin-account cumulo"><span class="fin-account-name">Cumulo a saldar este mes</span><strong>${money(numero(cumulo.total_centavos))}</strong><small>${cumulo.compromisos_n || 0} compromisos${numero(cumulo.deuda_tarjetas_centavos) > 0 ? ` + ${money(numero(cumulo.deuda_tarjetas_centavos))} tarjetas` : ""} &middot; te avisa al telefono</small></article>`
      : "";
    $("finCuentasCards").innerHTML = `<article class="fin-account total"><span class="fin-account-name">Patrimonio total</span><strong>${money(patrimonio)}</strong><small>Suma de cuentas incluidas</small></article>${cumuloCard}${cards}`;
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
      const color = esc(card?.color || "#0A3679");
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
        <div class="finance-card-line"><span>Fecha de pago</span><b>${fechaCorta(dates.pay)}</b></div>
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
    const [summaryRes, dailyRes, categoryRes] = await Promise.all([
      sb.rpc("fin_period_summary", { p_business_id: BUSINESS, p_from: range.from, p_to: range.to }),
      sb.rpc("fin_daily_totals", { p_business_id: BUSINESS, p_from: range.from, p_to: range.to }),
      sb.rpc("fin_category_totals", { p_business_id: BUSINESS, p_from: range.from, p_to: range.to, p_type: "gasto" }),
    ]);
    if (summaryRes.error) throw summaryRes.error;
    if (dailyRes.error) throw dailyRes.error;
    if (categoryRes.error) throw categoryRes.error;
    const summary = summaryRes.data?.[0] || {};
    const income = numero(summary.ingresos_centavos);
    const expense = numero(summary.gastos_centavos);
    const net = income - expense;
    const patrimonio = state.accounts.filter(item => item.incluir_en_total).reduce((sum, item) => sum + numero(item.saldo_actual_centavos), 0);
    $("finDashboardKpis").innerHTML = [
      ["Patrimonio", money(patrimonio), "Suma de cuentas"],
      ["Ingresos", money(income), range.label],
      ["Gastos", money(expense), range.label],
      ["Disponible", money(net), net >= 0 ? "Ingresos menos gastos" : "Gasto superior al ingreso"],
    ].map(([label, value, detail], index) => `<article class="finance-kpi ${index === 3 && net < 0 ? "bad" : ""}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`).join("");
    renderFinFlowChart(dailyRes.data || [], range);
    renderFinCategoryChart(categoryRes.data || [], expense);
    renderFinRecent(range);
    renderFinPlanning(categoryRes.data || []);
    state.dashboard = { range, summary, daily: dailyRes.data || [], categories: categoryRes.data || [] };
  }

  function renderFinFlowChart(rows, range) {
    $("finFlowCaption").textContent = `${range.label}. Azul: ingresos. Naranja: gastos.`;
    if (!rows.length) {
      $("finFlowChart").innerHTML = `<div class="empty-state"><strong>Sin movimientos</strong><p>No hay ingresos ni gastos en este periodo.</p></div>`;
      return;
    }
    const max = Math.max(1, ...rows.flatMap(item => [numero(item.ingresos_centavos), numero(item.gastos_centavos)]));
    $("finFlowChart").innerHTML = `<div class="finance-flow-bars">${rows.map(item => {
      const incomeHeight = Math.max(2, Math.round(numero(item.ingresos_centavos) * 100 / max));
      const expenseHeight = Math.max(2, Math.round(numero(item.gastos_centavos) * 100 / max));
      return `<button type="button" class="finance-flow-day" data-fin-day="${esc(item.fecha)}" title="${esc(item.fecha)}: ingresos ${money(item.ingresos_centavos)}, gastos ${money(item.gastos_centavos)}"><span class="finance-bar-pair"><i class="income" style="--bar:${incomeHeight}%"></i><i class="expense" style="--bar:${expenseHeight}%"></i></span><small>${esc(fechaCorta(item.fecha))}</small></button>`;
    }).join("")}</div>`;
    $("finFlowChart").querySelectorAll("[data-fin-day]").forEach(button => button.addEventListener("click", () => {
      finReferenceDate = button.dataset.finDay;
      finDashboardPeriod = "dia";
      renderFinDashboard().catch(error => toast(error.message));
    }));
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

  function renderFinPlanning(categoryRows) {
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
    };
    const esTarjeta = item.tipo === "tarjeta_credito";
    const saldoMostrado = esTarjeta ? Math.abs(numero(item.saldo_inicial_centavos)) : item.saldo_inicial_centavos;
    abrirEditor(account ? "Editar cuenta" : "Agregar cuenta", "El saldo se recalcula desde el saldo inicial y todos sus movimientos.", `
      <label><span>Nombre</span><input name="nombre" required maxlength="120" value="${esc(item.nombre)}"></label>
      <label><span>Tipo</span><select name="tipo" id="finAccountTipo">${finTipoOptions(item.tipo)}</select></label>
      <label><span>Grupo</span><input name="grupo" maxlength="120" value="${esc(item.grupo || "")}"></label>
      <label><span id="finAccountSaldoLabel">${esTarjeta ? "Deuda inicial (RD$)" : "Saldo inicial (RD$)"}</span><input name="saldoInicial" type="number" step="0.01" required value="${pesoInput(saldoMostrado)}"></label>
      <p id="finAccountSaldoHint" class="field-hint field-wide"${esTarjeta ? "" : ' style="display:none"'}>En una tarjeta de credito escribe cuanto DEBES hoy (0 si esta al dia). Las compras se registran despues con "Registrar consumo".</p>
      <label><span>Moneda</span><input name="moneda" maxlength="8" value="${esc(item.moneda || "DOP")}"></label>
      <label><span>Orden</span><input name="orden" type="number" step="1" value="${esc(item.orden || 0)}"></label>
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
  }

  function abrirConciliacionCuentaFin(account) {
    if (!account) return;
    abrirEditor("Conciliar saldo", "Registra la diferencia sin borrar movimientos ni convertirla en ingreso o gasto operativo.", `
      <div class="reconciliation-summary field-wide"><span>Saldo calculado</span><strong>${money(account.saldo_actual_centavos)}</strong></div>
      <label><span>Saldo real contado (RD$)</span><input name="saldoObjetivo" type="number" step="0.01" required value="${pesoInput(account.saldo_actual_centavos)}"></label>
      <label><span>Fecha</span><input name="fecha" type="date" required value="${inputDate(new Date())}"></label>
      <label class="field-wide"><span>Motivo obligatorio</span><textarea name="motivo" rows="3" required placeholder="Ejemplo: saldo físico confirmado al cierre; el historial anterior no contenía retiros de caja"></textarea></label>
      <p class="field-hint field-wide">El asiento queda identificado, genera alerta y puede anularse. Las ventas históricas permanecen intactas.</p>`, async form => {
      const target = centavosConSignoInput(form.get("saldoObjetivo"));
      const current = numero(account.saldo_actual_centavos);
      const difference = target - current;
      await adminWrite("fin.account.reconcile", account.id, {
        cuentaId: account.id,
        saldoObjetivoCentavos: target,
        fecha: form.get("fecha"),
        motivo: form.get("motivo"),
      });
      toast(`Saldo conciliado. Diferencia registrada: ${difference >= 0 ? "+" : "-"}${money(Math.abs(difference))}`);
      await cargarFinanzas();
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
    const card = state.cards.find(item => item.cuenta_id === account.id) || { cuenta_id: account.id, dia_corte: 25, dia_pago: 5, limite_credito_centavos: 0, color: "#0A3679", metodo_visualizacion: "al_comprar" };
    const accountOptions = creditAccounts.map(item => `<option value="${esc(item.id)}"${selected(account.id, item.id)}>${esc(item.nombre)}</option>`).join("");
    const payOptions = `<option value="">Selecciona la cuenta de pago</option>${state.accounts.filter(item => item.tipo !== "tarjeta_credito" && !item.oculta).map(item => `<option value="${esc(item.id)}"${selected(card.cuenta_pago_id, item.id)}>${esc(item.nombre)}</option>`).join("")}`;
    abrirEditor("Configurar tarjeta", "Las compras son gasto al realizarlas; el pago mueve dinero del banco a la tarjeta sin crear otro gasto.", `
      <label><span>Cuenta de tarjeta</span><select name="cuentaId">${accountOptions}</select></label>
      <label><span>Cuenta habitual de pago</span><select name="cuentaPagoId">${payOptions}</select></label>
      <label><span>Dia de corte</span><input name="diaCorte" type="number" min="1" max="31" value="${esc(card.dia_corte)}"></label>
      <label><span>Dia de pago</span><input name="diaPago" type="number" min="1" max="31" value="${esc(card.dia_pago)}"></label>
      <label><span>Limite (RD$)</span><input name="limite" type="number" min="0" step="0.01" value="${pesoInput(card.limite_credito_centavos)}"></label>
      <label><span>Color</span><input name="color" type="color" value="${esc(card.color || "#0A3679")}"></label>
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
        if (!$("v-proveedores").classList.contains("oculto")) cargarProveedores(true).catch(error => toast(error.message));
      }, 500);
    };
    finRealtimeChannel = sb.channel(`dcarela-finance-${BUSINESS}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_movimientos", filter: `business_id=eq.${BUSINESS}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_cuentas", filter: `business_id=eq.${BUSINESS}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_presupuestos", filter: `business_id=eq.${BUSINESS}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_tarjetas", filter: `business_id=eq.${BUSINESS}` }, refresh)
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
      DispositivoBloqueado: "dispositivos", CompraCreditoProveedorRegistrada: "proveedores",
      PagoProveedorRegistrado: "proveedores", GastoRegistrado: "proveedores", GastoEditado: "proveedores",
      GastoEliminado: "proveedores", CostoRecurrenteGuardado: "proveedores",
      CostoObligacionGenerada: "proveedores", CostoObligacionGuardada: "proveedores",
      CostoPagoRegistrado: "proveedores", CostoObligacionAnulada: "proveedores",
      ReciboPagoEmitido: "proveedores", ReciboPagoFirmaActualizada: "proveedores",
      ReciboPagoAnulado: "proveedores",
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
    if (type.includes("proveedor") || type.includes("gasto") || type.includes("costo") || type.includes("deuda") || type.includes("obligacion")) return "proveedores";
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

  async function cargarConfiguracion() {
    $("cfgInfo").innerHTML = `<div class="config-line"><span>Proyecto</span><strong>${esc(cfg.url)}</strong></div><div class="config-line"><span>Negocio</span><strong>${esc(BUSINESS)}</strong></div><div class="config-line"><span>Usuario</span><strong>${esc(session?.user?.email || "--")}</strong></div><div class="config-line"><span>Rol</span><strong>${esc(memberRole)}${canEdit ? " | edicion habilitada" : " | solo lectura"}</strong></div><div class="config-line"><span>Sesion</span><strong>Autenticada con Supabase Auth</strong></div>`;
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

  async function consultarVersion() {
    const response = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/pos-installer-version?channel=stable`, {
      headers: await authenticatedHeaders()
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
      if (["ventas", "caja", "turnos", "recalcular", "reportes", "inventario", "clientes", "proveedores", "asistente", "configuracion"].includes(view)) loaders[view]?.().catch(() => {});
    }, 700);
  }

  function conectarRealtime() {
    sb.channel("dcarela-pos-live")
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

  async function iniciar() {
    sesionOk = true;
    $("access").classList.add("oculto");
    $("app").classList.remove("oculto");
    $("sessionEmail").textContent = session?.user?.email || "Administrador";
    verEstado(true, "Sesion autenticada");
    await cargarRolEdicion().catch(() => { canEdit = false; memberRole = "viewer"; });
    if (canEdit) renderIaApprovals().catch(() => {});
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
    $("btnIaNueva").addEventListener("click", () => {
      iaConversationId = null;
      renderIaConversations();
      $("iaConversationTitle").textContent = "Nueva conversacion";
      $("iaMessages").innerHTML = `<div class="assistant-empty"><strong>Pregunta o solicita una accion</strong><p>El asistente usara datos reales y documentara cada cambio.</p></div>`;
      $("iaInput").focus();
    });
    $("btnIaAdjuntar").addEventListener("click", () => $("iaFiles").click());
    $("iaFiles").addEventListener("change", event => {
      agregarAdjuntosIa(event.target.files).catch(error => { $("iaError").textContent = error.message; });
      event.target.value = "";
    });
    $("iaComposer").addEventListener("submit", event => { event.preventDefault(); enviarMensajeIa(); });
    $("iaInput").addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); enviarMensajeIa(); }
    });
    $("iaInput").addEventListener("input", () => {
      const input = $("iaInput");
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    });
    $("iaModel").addEventListener("change", () => localStorage.setItem(`dcarela.ia.model.v2.${BUSINESS}`, $("iaModel").value));
    $("iaSuggestions").querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => {
      $("iaInput").value = button.dataset.prompt;
      $("iaInput").dispatchEvent(new Event("input"));
      $("iaInput").focus();
    }));
    $("btnVentas").addEventListener("click", () => cargarVentas().catch(error => mostrarError("ventas", error)));
    $("btnTurnos").addEventListener("click", () => cargarTurnos().catch(error => mostrarError("turnos", error)));
    $("btnTurnosPdf").addEventListener("click", () => { try { descargarTurnosPdf(); } catch (error) { toast(error.message); } });
    $("btnRecalcular").addEventListener("click", () => cargarRecalculador().catch(error => mostrarError("recalcular", error)));
    $("btnRecalcularPdf").addEventListener("click", () => { try { descargarRecalculoPdf(); } catch (error) { toast(error.message); } });
    $("recDiferencia").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); $("btnRecalcular").click(); } });
    $("btnReporte").addEventListener("click", () => cargarReporte().catch(error => mostrarError("reportes", error)));
    $("btnReportePdf").addEventListener("click", () => { try { descargarReportePdf(); } catch (error) { toast(error.message); } });
    $("btnNuevoProducto").addEventListener("click", () => abrirProducto().catch(error => toast(error.message)));
    $("btnNuevaCategoria").addEventListener("click", abrirCategoria);
    $("btnNuevoCliente").addEventListener("click", () => abrirCliente());
    $("btnNuevaCategoriaGasto").addEventListener("click", () => abrirCategoriaFin());
    $("btnNuevoGasto").addEventListener("click", () => cargarCostosCloud().then(state => abrirGasto(state)).catch(error => toast(error.message)));
    $("btnNuevoRecurrente").addEventListener("click", () => cargarCostosCloud().then(state => abrirRecurrente(state)).catch(error => toast(error.message)));
    $("btnNuevaObligacion").addEventListener("click", () => cargarCostosCloud().then(state => abrirObligacion(state)).catch(error => toast(error.message)));
    $("btnNuevoRecibo").addEventListener("click", () => cargarCostosCloud().then(state => abrirReciboPago(state)).catch(error => toast(error.message)));
    $("btnGenerarObligaciones").addEventListener("click", () => generarObligacionesWeb().catch(error => toast(error.message)));
    $("btnNuevaCuentaFin").addEventListener("click", () => abrirCuentaFin());
    $("btnNuevaTransferencia").addEventListener("click", async () => {
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
    $("btnFinTransferTop").addEventListener("click", openTransfer);
    $("btnFinQuick").addEventListener("click", () => abrirMovimientoFin("gasto"));
    $("btnFinQuickMov").addEventListener("click", () => abrirMovimientoFin("gasto"));
    $("btnVerMovimientosFin").addEventListener("click", () => setCostTab("movimientos"));
    $("btnFinNuevoPresupuesto").addEventListener("click", () => abrirPresupuestoFin());
    $("btnFinNuevaTarjeta").addEventListener("click", () => abrirTarjetaFin());
    $("btnFinNuevaDivisa").addEventListener("click", () => abrirDivisaFin());
    $("finPeriodTabs").querySelectorAll("[data-fin-period]").forEach(button => button.addEventListener("click", () => {
      finDashboardPeriod = button.dataset.finPeriod;
      renderFinDashboard().catch(error => toast(error.message));
    }));
    $("finFechaReferencia").addEventListener("change", event => {
      finReferenceDate = event.target.value || inputDate(new Date());
      const month = finReferenceDate.slice(0, 7);
      if (month !== $("provMes").value) {
        $("provMes").value = month;
        cargarProveedores().catch(error => mostrarError("proveedores", error));
      } else renderFinDashboard().catch(error => toast(error.message));
    });
    ["finMovementType", "finMovementAccount", "finMovementCategory"].forEach(id => $(id).addEventListener("change", renderFinMovements));
    $("finMovementSearch").addEventListener("input", renderFinMovements);
    $("btnFinExportCsv").addEventListener("click", () => { try { exportarFinCsv(); } catch (error) { toast(error.message); } });
    $("btnFinExportPdf").addEventListener("click", () => { try { exportarFinPdf(); } catch (error) { toast(error.message); } });
    ["btnFinBackupTop", "btnFinBackup", "btnFinBackupSettings"].forEach(id => $(id).addEventListener("click", () => backupFinanzas().catch(error => toast(error.message))));
    $("btnFinRestorePreview").addEventListener("click", () => $("finRestoreFile").click());
    $("finRestoreFile").addEventListener("change", event => validarBackupFinanzas(event.target.files?.[0]).catch(error => toast(error.message)));
    $("finSettingsForm").addEventListener("submit", event => {
      event.preventDefault();
      guardarPreferenciasFin(event.currentTarget).catch(error => toast(error.message));
    });
    $("provTabs").querySelectorAll("[data-cost-tab]").forEach(button => button.addEventListener("click", () => setCostTab(button.dataset.costTab)));
    $("provMes").addEventListener("change", () => {
      if (!finReferenceDate.startsWith($("provMes").value)) finReferenceDate = `${$("provMes").value}-01`;
      cargarProveedores().catch(error => mostrarError("proveedores", error));
    });
    $("btnInvBuscar").addEventListener("click", () => cargarInventario().catch(error => mostrarError("inventario", error)));
    $("btnCliBuscar").addEventListener("click", () => cargarClientes().catch(error => mostrarError("clientes", error)));
    $("invBuscar").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); $("btnInvBuscar").click(); } });
    $("cliBuscar").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); $("btnCliBuscar").click(); } });
    $("btnGuardarNegocio").addEventListener("click", () => guardarNegocio().catch(error => toast(error.message)));
    $("btnCerrarEditor").addEventListener("click", cerrarEditor);
    $("btnCancelarEditor").addEventListener("click", cerrarEditor);
    $("editorOverlay").addEventListener("click", event => { if (event.target === $("editorOverlay")) cerrarEditor(); });
    $("editorForm").addEventListener("submit", async event => {
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
