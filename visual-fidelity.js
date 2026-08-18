(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function enhanceCompactMetric(svg) {
    if (!(svg instanceof SVGElement) || svg.dataset.currentMetric === "true") return;
    if (svg.getAttribute("viewBox") !== "0 0 160 70") return;

    const paths = svg.querySelectorAll("path");
    const area = paths[0];
    const line = paths[1];
    if (!area || !line) return;

    svg.dataset.currentMetric = "true";
    const gradient = svg.querySelector("linearGradient");
    const stops = gradient?.querySelectorAll("stop") || [];
    if (stops[0]) stops[0].setAttribute("stop-opacity", ".62");
    if (stops[1]) stops[1].setAttribute("stop-opacity", ".04");

    const inner = line.cloneNode(true);
    inner.removeAttribute("ref");
    inner.classList.add("current-metric-inner");
    inner.setAttribute("transform", "translate(0 13) scale(1 .62)");
    inner.setAttribute("transform-origin", "80px 35px");
    inner.setAttribute("pathLength", "1");
    line.before(inner);
  }

  function enhanceHealthMetric(svg) {
    if (!(svg instanceof SVGElement) || svg.dataset.currentHealth === "true") return;
    if (!svg.querySelector(".dashboard-health-wave")) return;
    svg.dataset.currentHealth = "true";

    const polygon = svg.querySelector("polygon");
    if (!polygon || svg.querySelector("#currentHealthArea")) return;
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs");
      svg.prepend(defs);
    }
    const gradient = document.createElementNS(SVG_NS, "linearGradient");
    gradient.id = "currentHealthArea";
    gradient.setAttribute("x1", "0");
    gradient.setAttribute("x2", "0");
    gradient.setAttribute("y1", "0");
    gradient.setAttribute("y2", "1");
    gradient.innerHTML = '<stop offset="0%" stop-color="var(--shell-text)" stop-opacity=".34"></stop><stop offset="100%" stop-color="var(--shell-text)" stop-opacity=".03"></stop>';
    defs.appendChild(gradient);
    polygon.setAttribute("fill", "url(#currentHealthArea)");
    polygon.removeAttribute("opacity");
  }

  function enhanceRoot(root = document) {
    root.querySelectorAll?.('svg[viewBox="0 0 160 70"]').forEach(enhanceCompactMetric);
    root.querySelectorAll?.("svg").forEach(enhanceHealthMetric);
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('svg[viewBox="0 0 160 70"]')) enhanceCompactMetric(node);
        if (node.matches?.("svg")) enhanceHealthMetric(node);
        enhanceRoot(node);
      }
    }
  });

  enhanceRoot();
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
