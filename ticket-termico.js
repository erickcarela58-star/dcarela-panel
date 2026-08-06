(() => {
  "use strict";

  const DEFAULT_COLUMNS = 32;
  const VERSION = "1.0.33";
  const BRAND_NAME = "D' Carela Punto de Venta";
  const BRAND_COLORS = {
    primary: "#0A3679",
    secondary: "#1797E8",
    accent: "#FF7F03",
    success: "#15867B",
    danger: "#C93C3C",
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

  const text = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const plain = value => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const money = cents => new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100).replace("DOP", "RD$");

  const dateTime = value => value
    ? new Date(value).toLocaleString("es-DO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";

  const toCents = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
    return 0;
  };

  const toQty = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };

  const qtyText = value => {
    const quantity = toQty(value);
    return Number.isInteger(quantity)
      ? String(quantity)
      : quantity.toLocaleString("es-DO", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        });
  };

  const separator = (char = "-", width = DEFAULT_COLUMNS) => char.repeat(Math.max(1, width));

  const center = (value, width = DEFAULT_COLUMNS) => {
    const line = plain(value).slice(0, width);
    const pad = Math.max(0, Math.floor((width - line.length) / 2));
    return `${" ".repeat(pad)}${line}`;
  };

  const pair = (left, right, width = DEFAULT_COLUMNS) => {
    const leftText = plain(left).slice(0, width - 1);
    const rightText = plain(right).slice(0, width - 1);
    if (leftText.length + rightText.length + 1 > width) {
      return `${leftText}\n${" ".repeat(Math.max(0, width - rightText.length))}${rightText}`;
    }
    return `${leftText}${" ".repeat(Math.max(1, width - leftText.length - rightText.length))}${rightText}`;
  };

  const wrap = (value, width = DEFAULT_COLUMNS) => {
    const source = plain(value);
    if (!source) return [""];
    const words = source.split(" ");
    const lines = [];
    let current = "";
    words.forEach(word => {
      if (!current) {
        current = word.slice(0, width);
        return;
      }
      if (`${current} ${word}`.length <= width) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word.slice(0, width);
      }
    });
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  function normalizeLines(sale) {
    const rows = Array.isArray(sale?.lineas) ? sale.lineas : [];
    return rows.map((line, index) => {
      const quantity = toQty(line?.cantidad ?? line?.quantity ?? 1);
      const unitPriceCents = toCents(
        line?.precioUnitarioCentavos,
        line?.precio_unitario_centavos,
        line?.unitPriceCents
      );
      const totalCents = Math.max(
        0,
        toCents(
          line?.importeFinalCentavos,
          line?.importe_final_centavos,
          line?.totalCentavos,
          line?.total_centavos,
          Math.round(unitPriceCents * quantity)
        )
      );
      return {
        id: line?.productoId || line?.id || `line-${index + 1}`,
        name: text(line?.nombre || line?.name || `Producto ${index + 1}`),
        quantity,
        unitPriceCents,
        totalCents,
      };
    }).filter(line => line.name);
  }

  function normalizePayments(sale) {
    const rows = Array.isArray(sale?.pagos) ? sale.pagos : [];
    if (!rows.length && sale?.metodo) {
      return [{
        method: text(sale.metodo),
        amountCents: toCents(
          sale?.totalCobradoCentavos,
          sale?.total_cobrado_centavos,
          sale?.totalCentavos,
          sale?.total_centavos,
          sale?.total
        ),
        reference: text(sale?.referencia),
        account: text(sale?.cuentaFinancieraNombre || sale?.cuenta_financiera_nombre),
      }].filter(payment => payment.amountCents > 0);
    }
    return rows.map((payment, index) => ({
      id: payment?.id || `payment-${index + 1}`,
      method: text(payment?.metodo || payment?.metodoPago || payment?.metodo_pago || "pago"),
      amountCents: toCents(payment?.montoCentavos, payment?.monto_centavos, payment?.amountCents),
      reference: text(payment?.referencia),
      account: text(payment?.cuentaFinancieraNombre || payment?.cuenta_financiera_nombre),
    })).filter(payment => payment.amountCents > 0);
  }

  function build(input = {}) {
    const business = input.business || {};
    const sale = input.sale || {};
    const lines = normalizeLines(sale);
    const payments = normalizePayments(sale);
    const tax = Math.max(0, toCents(sale?.itbisCentavos, sale?.itbis_centavos, sale?.impuestoCentavos, sale?.impuesto_centavos));
    const discount = Math.max(0, toCents(sale?.descuentoCentavos, sale?.descuento_centavos, input.discountCentavos));
    const tip = Math.max(0, toCents(sale?.propinaCentavos, sale?.propina_centavos, input.tipCentavos));
    const rounding = toCents(sale?.ajusteRedondeoCentavos, sale?.ajuste_redondeo_centavos, input.roundingCentavos);
    const linesTotal = lines.reduce((sum, line) => sum + line.totalCents, 0);
    const subtotal = Math.max(
      0,
      toCents(
        sale?.subtotalSinItbisCentavos,
        sale?.subtotal_sin_itbis_centavos,
        sale?.baseCentavos,
        linesTotal - tax
      )
    );
    const total = Math.max(
      0,
      toCents(
        sale?.totalCobradoCentavos,
        sale?.total_cobrado_centavos,
        sale?.totalCentavos,
        sale?.total_centavos,
        sale?.total,
        subtotal + tax - discount + tip + rounding,
        linesTotal + tip + rounding
      )
    );
    return {
      quote: Boolean(input.quote),
      businessName: text(business?.nombre || business?.name || BRAND_NAME),
      displayBusinessName: text(business?.nombreVisible || business?.displayName || BRAND_NAME),
      businessLegalName: text(business?.nombre || business?.name || BRAND_NAME),
      rnc: text(business?.rnc),
      phone: text(business?.telefono || business?.whatsapp),
      address: text(business?.direccion),
      footer: text(business?.ticketPie || input.footer || "Gracias por su compra"),
      branchName: text(input.branchName || sale?.sucursalNombre || sale?.branchName),
      cashierName: text(input.cashierName || sale?.cajeroNombre || sale?.usuarioNombre || "Caja web"),
      customerName: text(sale?.clienteNombre || input.customerName || "Consumidor final"),
      customerPhone: text(sale?.clienteTelefono || sale?.clienteTelefonoCopia || sale?.cliente_telefono || input.customerPhone),
      note: text(sale?.nota || input.note),
      issuedAt: sale?.vendidaEn || sale?.created_at || input.issuedAt || new Date().toISOString(),
      folio: text(sale?.folio || input.folio || "--"),
      subtotal,
      tax,
      discount,
      tip,
      rounding,
      total,
      cashReceived: Math.max(0, toCents(sale?.pagoConCentavos, sale?.pago_con_centavos, input.cashReceivedCentavos)),
      change: Math.max(0, toCents(sale?.cambioCentavos, sale?.cambio_centavos, input.changeCentavos)),
      lines,
      payments,
      columns: Number(input.columns) === 42 ? 42 : DEFAULT_COLUMNS,
      version: VERSION,
      brandName: BRAND_NAME,
      theme: input.theme === "light" ? "light" : "dark",
      colors: { ...BRAND_COLORS },
    };
  }

  function validateData(model) {
    const errors = [];
    const warnings = [];
    if (!model.businessName) errors.push("Falta el nombre del negocio.");
    if (!model.lines.length) errors.push("El ticket no tiene productos.");
    if (model.total <= 0) errors.push("El total del ticket no es válido.");
    if (!model.branchName) warnings.push("No se indicó la sucursal.");
    if (!model.cashierName) warnings.push("No se indicó el cajero.");
    if (!model.quote && !model.payments.length) warnings.push("No se indicó el método de pago.");
    if (!model.folio || model.folio === "--") warnings.push("El ticket no tiene folio visible.");
    return { ok: errors.length === 0, errors, warnings };
  }

  function renderHtml(model) {
    const validation = validateData(model);
    const summaryRows = [
      model.subtotal > 0 ? ["Subtotal", money(model.subtotal)] : null,
      model.discount > 0 ? ["Descuento", `-${money(model.discount)}`] : null,
      model.tax > 0 ? ["ITBIS", money(model.tax)] : null,
      model.tip > 0 ? ["Propina", money(model.tip)] : null,
      model.rounding !== 0 ? ["Redondeo", `${model.rounding > 0 ? "+" : "-"}${money(Math.abs(model.rounding))}`] : null,
    ].filter(Boolean);

    return `<article class="thermal-ticket thermal-ticket--v1030 thermal-ticket--${esc(model.theme)}${validation.ok ? "" : " thermal-ticket--invalid"}" data-thermal-ticket="1" data-columns="${model.columns}" data-version="${esc(model.version)}" aria-label="Ticket térmico ${esc(model.folio || "--")}">
      <div class="thermal-ticket__tokens" hidden
        data-brand-name="${esc(model.brandName)}"
        data-brand-primary="${esc(model.colors.primary)}"
        data-brand-secondary="${esc(model.colors.secondary)}"
        data-brand-accent="${esc(model.colors.accent)}"
        data-brand-success="${esc(model.colors.success)}"
        data-brand-danger="${esc(model.colors.danger)}"></div>
      ${validation.ok ? "" : `<div class="thermal-ticket__status" role="status" aria-live="polite"><strong>Validación local</strong><span>${esc(validation.errors.join(" | "))}</span></div>`}
      <header class="thermal-ticket__header">
        <div class="thermal-ticket__eyebrow">
          <span class="thermal-ticket__eyebrow-chip">${model.quote ? "Cotización" : "Ticket térmico"}</span>
          <span class="thermal-ticket__eyebrow-version">POS ${esc(model.version)}</span>
        </div>
        <div class="thermal-ticket__brand-block">
          <div class="thermal-ticket__brand">${esc(model.displayBusinessName)}</div>
          <div class="thermal-ticket__brand-subtitle">${esc(model.brandName)}</div>
        </div>
        ${model.rnc ? `<div class="thermal-ticket__identity">RNC ${esc(model.rnc)}</div>` : ""}
        ${model.address ? `<div class="thermal-ticket__contact">${esc(model.address)}</div>` : ""}
        ${model.phone ? `<div class="thermal-ticket__contact">${esc(model.phone)}</div>` : ""}
      </header>
      <section class="thermal-ticket__meta" aria-label="Datos del ticket">
        <div class="thermal-ticket__meta-row"><span>Folio</span><span>#${esc(model.folio || "--")}</span></div>
        <div class="thermal-ticket__meta-row"><span>Fecha</span><span>${esc(dateTime(model.issuedAt))}</span></div>
        <div class="thermal-ticket__meta-row"><span>Sucursal</span><span>${esc(model.branchName || "--")}</span></div>
        <div class="thermal-ticket__meta-row"><span>Cajero</span><span>${esc(model.cashierName || "--")}</span></div>
        <div class="thermal-ticket__meta-row"><span>Cliente</span><span>${esc(model.customerName || "Consumidor final")}</span></div>
        ${model.customerPhone ? `<div class="thermal-ticket__meta-row"><span>Teléfono</span><span>${esc(model.customerPhone)}</span></div>` : ""}
      </section>
      <section class="thermal-ticket__items" aria-label="Productos">
        <div class="thermal-ticket__section-title">Detalle</div>
        ${model.lines.map(line => `<article class="thermal-ticket__item">
          <div class="thermal-ticket__name">${esc(line.name)}</div>
          <div class="thermal-ticket__calc"><span>${esc(qtyText(line.quantity))} x ${esc(money(line.unitPriceCents))}</span><strong>${esc(money(line.totalCents))}</strong></div>
        </article>`).join("")}
      </section>
      <section class="thermal-ticket__summary" aria-label="Resumen">
        <div class="thermal-ticket__section-title">Resumen</div>
        ${summaryRows.map(([label, value]) => `<div class="thermal-ticket__summary-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`).join("")}
        <div class="thermal-ticket__summary-row total"><span>Total</span><strong>${esc(money(model.total))}</strong></div>
        ${model.cashReceived > 0 ? `<div class="thermal-ticket__summary-row"><span>Cliente entregó</span><span>${esc(money(model.cashReceived))}</span></div>` : ""}
        ${model.change > 0 ? `<div class="thermal-ticket__summary-row"><span>Devuelta</span><span>${esc(money(model.change))}</span></div>` : ""}
      </section>
      ${model.quote ? "" : `<section class="thermal-ticket__payments" aria-label="Pagos">
        <h4 class="thermal-ticket__section-title">Pago</h4>
        ${model.payments.length ? model.payments.map(payment => `<div class="thermal-ticket__payment-row"><span>${esc(payment.method)}${payment.account ? `<small>${esc(payment.account)}</small>` : ""}${payment.reference ? `<small>Ref. ${esc(payment.reference)}</small>` : ""}</span><strong>${esc(money(payment.amountCents))}</strong></div>`).join("") : `<div class="thermal-ticket__payment-row"><span>Sin detalle</span><strong>${esc(money(model.total))}</strong></div>`}
      </section>`}
      <footer class="thermal-ticket__footer">
        ${model.note ? `<h4 class="thermal-ticket__section-title">Nota</h4><p>${esc(model.note)}</p>` : ""}
        <p>${esc(model.footer)}</p>
      </footer>
    </article>`;
  }

  function renderText(model) {
    const output = [];
    wrap(model.displayBusinessName.toUpperCase(), model.columns).forEach(line => output.push(center(line, model.columns)));
    wrap(model.brandName.toUpperCase(), model.columns).forEach(line => output.push(center(line, model.columns)));
    if (model.rnc) output.push(center(`RNC ${model.rnc}`, model.columns));
    if (model.address) wrap(model.address, model.columns).forEach(line => output.push(center(line, model.columns)));
    if (model.phone) output.push(center(model.phone, model.columns));
    output.push(center(model.quote ? "COTIZACION" : "TICKET TERMICO", model.columns));
    output.push(center(`POS ${model.version}`, model.columns));
    output.push(separator("-", model.columns));
    output.push(pair("FOLIO", `#${model.folio || "--"}`, model.columns));
    output.push(pair("FECHA", plain(dateTime(model.issuedAt)), model.columns));
    output.push(pair("SUCURSAL", model.branchName || "--", model.columns));
    output.push(pair("CAJERO", model.cashierName || "--", model.columns));
    output.push(pair("CLIENTE", model.customerName || "Consumidor final", model.columns));
    if (model.customerPhone) output.push(pair("TELEFONO", model.customerPhone, model.columns));
    output.push(separator("-", model.columns));
    model.lines.forEach(line => {
      wrap(line.name, model.columns).forEach(row => output.push(row));
      pair(`${qtyText(line.quantity)} x ${money(line.unitPriceCents)}`, money(line.totalCents), model.columns)
        .split("\n")
        .forEach(row => output.push(row));
    });
    output.push(separator("-", model.columns));
    if (model.subtotal > 0) output.push(pair("SUBTOTAL", money(model.subtotal), model.columns));
    if (model.discount > 0) output.push(pair("DESCUENTO", `-${money(model.discount)}`, model.columns));
    if (model.tax > 0) output.push(pair("ITBIS", money(model.tax), model.columns));
    if (model.tip > 0) output.push(pair("PROPINA", money(model.tip), model.columns));
    if (model.rounding !== 0) output.push(pair("REDONDEO", `${model.rounding > 0 ? "+" : "-"}${money(Math.abs(model.rounding))}`, model.columns));
    output.push(pair("TOTAL", money(model.total), model.columns));
    if (model.cashReceived > 0) output.push(pair("CLIENTE ENTREGO", money(model.cashReceived), model.columns));
    if (model.change > 0) output.push(pair("DEVUELTA", money(model.change), model.columns));
    if (!model.quote) {
      output.push(separator("-", model.columns));
      output.push("PAGO");
      if (model.payments.length) {
        model.payments.forEach(payment => {
          output.push(pair(payment.method.toUpperCase(), money(payment.amountCents), model.columns));
          if (payment.account) wrap(`Cuenta: ${payment.account}`, model.columns).forEach(line => output.push(line));
          if (payment.reference) wrap(`Ref: ${payment.reference}`, model.columns).forEach(line => output.push(line));
        });
      } else {
        output.push(pair("SIN DETALLE", money(model.total), model.columns));
      }
    }
    if (model.note) {
      output.push(separator("-", model.columns));
      output.push("NOTA");
      wrap(model.note, model.columns).forEach(line => output.push(line));
    }
    output.push(separator("-", model.columns));
    wrap(model.footer, model.columns).forEach(line => output.push(center(line, model.columns)));
    return output.join("\n");
  }

  function validateElement(root) {
    const ticket = root?.matches?.("[data-thermal-ticket='1']")
      ? root
      : root?.querySelector?.("[data-thermal-ticket='1']");
    const errors = [];
    const warnings = [];
    if (!ticket) {
      errors.push("No existe el contenedor del ticket térmico.");
      return { ok: false, errors, warnings };
    }
    if (!ticket.querySelector(".thermal-ticket__brand")) errors.push("Falta el encabezado del negocio.");
    if (!ticket.querySelectorAll(".thermal-ticket__item").length) errors.push("No se renderizaron productos.");
    if (!ticket.querySelector(".thermal-ticket__summary-row.total strong")) errors.push("No se renderizó el total.");
    if (!ticket.querySelector(".thermal-ticket__meta")) warnings.push("Faltan metadatos operativos.");
    return { ok: errors.length === 0, errors, warnings };
  }

  function render(input = {}) {
    const model = build(input);
    return {
      model,
      validation: validateData(model),
      html: renderHtml(model),
      text: renderText(model),
    };
  }

  function sample(variant = "standard") {
    const long = variant === "long";
    return {
      business: {
        nombre: "D' Carela Punto de Venta",
        rnc: "026-0075688-2",
        telefono: "809-746-8651",
        direccion: "Plaza Artesanal, Local 3",
        ticketPie: long
          ? "Gracias por preferirnos. Revise el estado del pedido antes de salir."
          : "Gracias por su compra",
      },
      branchName: long ? "Plaza Artesanal - Centro" : "Plaza Artesanal",
      cashierName: "Caja Web",
      sale: {
        folio: long ? "10458" : "10421",
        vendidaEn: "2026-08-04T14:26:00",
        clienteNombre: long ? "Cliente de prueba con nombre extendido" : "Consumidor final",
        subtotalSinItbisCentavos: 317438,
        itbisCentavos: 57138,
        totalCobradoCentavos: 374576,
        pagoConCentavos: 400000,
        cambioCentavos: 25424,
        pagos: [
          { metodo: "efectivo", montoCentavos: 374576 }
        ],
        lineas: long ? [
          { nombre: "Album fotografico premium 10x12 con portada personalizada y acabado brillante", cantidad: 1, precioUnitarioCentavos: 219500, importeFinalCentavos: 219500 },
          { nombre: "Juego de impresiones instantaneas 4x6 para evento especial", cantidad: 2, precioUnitarioCentavos: 77538, importeFinalCentavos: 155076 },
        ] : [
          { nombre: "Album fotografico 8x10", cantidad: 1, precioUnitarioCentavos: 185000, importeFinalCentavos: 185000 },
          { nombre: "Impresion 4x6", cantidad: 2, precioUnitarioCentavos: 62000, importeFinalCentavos: 124000 },
          { nombre: "Marco sencillo", cantidad: 1, precioUnitarioCentavos: 65576, importeFinalCentavos: 65576 },
        ],
        nota: long ? "Entrega coordinada con el cliente despues de verificar el acabado." : "",
      },
      theme: "dark",
    };
  }

  window.DcarelaThermalTicket = {
    build,
    render,
    validateData,
    validateElement,
    sample,
    money,
    dateTime,
    version: VERSION,
  };
})();
