(() => {
  "use strict";

  const ROOT_ID = "current-downloads";
  let manifestPromise = null;
  let scheduled = false;

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return "Tamaño no informado";
    const units = ["B", "KB", "MB", "GB"];
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const amount = value / (1024 ** exponent);
    return `${amount.toLocaleString("es-DO", { maximumFractionDigits: exponent > 1 ? 1 : 0 })} ${units[exponent]}`;
  }

  function formatDate(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime())
      ? "Fecha no informada"
      : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function loadManifest() {
    manifestPromise ||= fetch(`./app-version.json?downloads=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    return manifestPromise;
  }

  function downloadCard(file) {
    const extension = String(file.extension || file.name?.split(".").pop() || "FILE").toUpperCase();
    const publisherSigned = file.publisher_signature === "signed";
    const signature = file.signature_label
      || (publisherSigned ? "Firma de editor válida" : "Sin certificado de editor");
    const action = file.action || `Descargar .${extension}`;
    return `<article class="current-download-card">
      <header class="current-download-card-head">
        <span class="current-download-type" aria-hidden="true">${escapeHtml(extension)}</span>
        <div><p>${escapeHtml(file.product || "D' Carela")}</p><h4>${escapeHtml(file.label || file.name || "Archivo")}</h4><small>${escapeHtml(file.name || "")}</small></div>
        <span class="current-download-status ${publisherSigned ? "is-ok" : "is-warn"}">${escapeHtml(signature)}</span>
      </header>
      <dl class="current-download-meta">
        <div><dt>Versión</dt><dd>${escapeHtml(file.version || "--")}</dd></div>
        <div><dt>Build</dt><dd>${escapeHtml(file.build || "--")}</dd></div>
        <div><dt>Plataforma</dt><dd>${escapeHtml(file.platform || "--")}</dd></div>
        <div><dt>Canal</dt><dd>${escapeHtml(file.channel || "stable")}</dd></div>
        <div><dt>Publicado</dt><dd>${escapeHtml(formatDate(file.published_at))}</dd></div>
        <div><dt>Tamaño</dt><dd>${escapeHtml(formatBytes(file.size_bytes))}</dd></div>
      </dl>
      <p class="current-download-notes">${escapeHtml(file.notes || "Archivo oficial publicado para esta versión.")}</p>
      <div class="current-download-sha"><span>SHA-256 verificado</span><code title="SHA-256 completo">${escapeHtml(file.sha256 || "No publicado")}</code></div>
      <p class="current-download-install"><strong>Instalación:</strong> ${escapeHtml(file.installation_method || "Descarga el archivo y sigue las instrucciones del sistema.")}</p>
      <div class="current-download-actions">
        <a class="current-download-primary" href="${escapeHtml(file.url)}" target="_blank" rel="noopener">${escapeHtml(action)}</a>
        ${file.checksums_url ? `<a class="current-download-secondary" href="${escapeHtml(file.checksums_url)}" target="_blank" rel="noopener">Ver sumas SHA-256</a>` : ""}
      </div>
    </article>`;
  }

  function suiteStatus(app) {
    const published = app.status === "published" && app.url;
    const beta = app.status === "beta_unsigned" && app.url;
    const diagnostic = app.status === "diagnostic_unsigned" && app.url;
    const available = published || beta || diagnostic;
    const label = published
      ? "Aplicación disponible"
      : diagnostic ? "Diagnóstico sin firma Apple"
      : beta ? "Beta para instalación manual" : "Compilación pendiente";
    const action = app.action || (published ? "Abrir aplicación" : diagnostic ? "Descargar diagnóstico" : "Descargar beta");
    return `<article><div><strong>${escapeHtml(app.name || app.id || "Aplicación")}</strong><small>${escapeHtml(app.platform || "")}</small></div><span class="${published ? "is-ok" : "is-warn"}">${escapeHtml(label)}</span><p>${escapeHtml(app.notes || "")}</p><b>Versión ${escapeHtml(app.version || "--")}</b>${available ? `<a href="${escapeHtml(app.url)}" target="_blank" rel="noopener">${escapeHtml(action)}</a>` : ""}</article>`;
  }

  function renderManifest(root, manifest) {
    const downloads = Array.isArray(manifest.downloads) ? manifest.downloads.filter(file => file?.url) : [];
    const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
    const grid = root.querySelector("[data-download-grid]");
    grid.innerHTML = downloads.length
      ? downloads.map(downloadCard).join("")
      : '<div class="current-download-empty">No hay archivos instalables publicados.</div>';
    const suite = root.querySelector("[data-download-suite]");
    suite.innerHTML = apps.length
      ? `<div class="current-download-suite-title"><strong>Disponibilidad por aplicación</strong><span>Solo se habilitan descargas instalables y verificables.</span></div><div class="current-download-suite-grid">${apps.map(suiteStatus).join("")}</div>`
      : "";
    const release = root.querySelector("[data-release-page]");
    if (manifest.release_page_url) release.href = manifest.release_page_url;
    else release.hidden = true;
  }

  function renderError(root, error) {
    root.querySelector("[data-download-grid]").innerHTML = `<div class="current-download-empty"><strong>No se pudieron consultar las descargas.</strong><span>${escapeHtml(error?.message || error)}</span></div>`;
  }

  function findUpdatesContainer() {
    const heading = [...document.querySelectorAll("h2")]
      .find(node => /Todo al d[ií]a desde el m[oó]vil/i.test(node.textContent || ""));
    return heading?.closest("section")?.parentElement || null;
  }

  function hideLegacyLink() {
    const legacy = [...document.querySelectorAll("a")]
      .find(node => /Abrir centro web completo/i.test(node.textContent || ""));
    if (!legacy) return;
    legacy.classList.add("current-legacy-download-link");
    legacy.setAttribute("aria-hidden", "true");
    legacy.tabIndex = -1;
  }

  function mount() {
    scheduled = false;
    if ((location.hash.slice(1) || "dashboard") !== "descargar") return;
    hideLegacyLink();
    const container = findUpdatesContainer();
    if (!container || document.getElementById(ROOT_ID)) return;
    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.className = "current-download-center shell-enter";
    root.setAttribute("aria-labelledby", "current-download-title");
    root.innerHTML = `<header class="current-download-heading"><div><p>Archivos publicados</p><h3 id="current-download-title">Descargas disponibles</h3><span>Instaladores y paquetes oficiales con versión, tamaño, integridad e instrucciones.</span></div><a data-release-page class="current-download-secondary" href="#descargar" target="_blank" rel="noopener">Ver publicación</a></header><div class="current-download-grid" data-download-grid><div class="current-download-empty">Consultando archivos descargables...</div></div><div class="current-download-suite" data-download-suite></div>`;
    const footer = [...container.children].find(node => node.tagName === "P") || null;
    container.insertBefore(root, footer);
    loadManifest().then(manifest => renderManifest(root, manifest)).catch(error => renderError(root, error));
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(mount);
  }

  addEventListener("hashchange", scheduleMount);
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
  scheduleMount();
})();
