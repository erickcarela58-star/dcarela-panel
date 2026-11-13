/* ==========================================================================
   v35.26 Category Emojis, Client Category Auto-Linker, Palettes & Demo Inbox
   D' Carela Studio & Events · Finanzas PWA
   ========================================================================== */
(function (root) {
  'use strict';

  const CATEGORY_RULES = [
    { rx: /fotograf|sesi[oó]n|boda|quince|evento|studio|estudio|producci[oó]n|c[aá]mara|lente|impresi[oó]n/i, emoji: '📸' },
    { rx: /video|reel|edici[oó]n|dron|film/i, emoji: '🎬' },
    { rx: /software|saas|nube|cloud|ia|inteligencia|app|hosting|dominio|suscripci|digital|chatgpt|openai|adobe|google|apple|canva/i, emoji: '💻' },
    { rx: /publicidad|meta|facebook|instagram|ads|marketing|pauta/i, emoji: '📣' },
    { rx: /transporte|combustible|gasolina|uber|indrive|peaje|parqueo|veh[ií]culo/i, emoji: '🚗' },
    { rx: /luz|edesur|edenorte|agua|internet|tel[eé]fono|claro|altice|servicio|energ[ií]a/i, emoji: '⚡' },
    { rx: /alquiler|renta|local|oficina/i, emoji: '🏢' },
    { rx: /comida|almuerzo|caf[eé]|restaurante|supermercado|dieta|refrigerio|catering/i, emoji: '🍽️' },
    { rx: /equipo|mantenimiento|reparaci[oó]n|repuesto|ferreter/i, emoji: '🔧' },
    { rx: /n[oó]mina|sueldo|empleado|honorario|freelance|personal|comisi[oó]n venta/i, emoji: '👥' },
    { rx: /impuesto|dgii|itbis|isr|tss|contab/i, emoji: '🧾' },
    { rx: /banco|tarjeta|inter[eé]s|cargo banc|transferencia/i, emoji: '💳' },
    { rx: /venta|ingreso|cobro|anticipo|abono/i, emoji: '💰' }
  ];

  const MERCHANT_RULES = [
    { rx: /codigo cash|c[oó]digo cash|cash code|cajero|atm/i, emoji: '🏧' },
    { rx: /lbtr|ach|pago al instante|transferencia/i, emoji: '🔁' },
    { rx: /openai|chatgpt|claude|anthropic|cursor|github|vercel|firebase|google workspace|adobe|canva/i, emoji: '🤖' },
    { rx: /apple|netflix|spotify|youtube|amazon|prime|meta|facebook/i, emoji: '✨' },
    { rx: /uber|indrive|didi|shell|texaco|total|petronan/i, emoji: '🚕' },
    { rx: /sirena|jumbo|nacional|bravo|pola|ole|pricesmart/i, emoji: '🛒' },
    { rx: /claro|altice|viva/i, emoji: '📶' },
    { rx: /edesur|edenorte|cepm/i, emoji: '⚡' },
    { rx: /farmacia|carol|los hidalgos/i, emoji: '💊' },
    { rx: /starbucks|caf[eé]|restaurante|pizzarelli|mcdonald|wendy/i, emoji: '☕' },
    { rx: /dgii|itbis|e-?cf|606|607/i, emoji: '📑' }
  ];

  const PALETTES = [
    { id: 'obsidian', name: 'Grafito Glass', swatch: 'linear-gradient(135deg,#334155,#64748b)' },
    { id: 'sapphire', name: 'Zafiro Real', swatch: 'linear-gradient(135deg,#2563eb,#06b6d4)' },
    { id: 'emerald', name: 'Esmeralda Studio', swatch: 'linear-gradient(135deg,#059669,#14b8a6)' },
    { id: 'amber', name: 'Ámbar Dorado', swatch: 'linear-gradient(135deg,#d97706,#f97316)' },
    { id: 'amethyst', name: 'Amatista Silk', swatch: 'linear-gradient(135deg,#7c3aed,#ec4899)' },
    { id: 'crimson', name: 'Carmín Editorial', swatch: 'linear-gradient(135deg,#dc2626,#f43f5e)' }
  ];

  function emojiForCategory(name) {
    const text = String(name || '').trim();
    if (!text) return '🏷️';
    for (const rule of CATEGORY_RULES) {
      if (rule.rx.test(text)) return rule.emoji;
    }
    return '🏷️';
  }

  function emojiForAccount(account) {
    const tipo = String(account?.tipo || '').toLowerCase();
    const nombre = String(account?.nombre || '').toLowerCase();
    if (tipo === 'tarjeta_credito' || /tarjeta|visa|mastercard|amex/.test(nombre)) return '💳';
    if (tipo === 'banco' || /banco|popular|reservas|bhd|scotia/.test(nombre)) return '🏦';
    if (tipo === 'efectivo' || /caja|efectivo|cash/.test(nombre)) return '💵';
    return '💰';
  }

  function emojiForMerchant(text) {
    const s = String(text || '').trim();
    if (!s) return '💳';
    for (const rule of MERCHANT_RULES) {
      if (rule.rx.test(s)) return rule.emoji;
    }
    return emojiForCategory(s);
  }

  function resolveClientExpenseCategory(entry, expenseCategories) {
    const cats = Array.isArray(expenseCategories) ? expenseCategories.filter(Boolean) : [];
    const text = `${entry?.descripcion || ''} ${entry?.comercio || ''} ${entry?.nota || ''}`.trim();
    const currentId = String(entry?.categoria_id || '').trim();
    if (currentId) {
      const existing = cats.find((c) => String(c.id) === currentId);
      if (existing && !/otros|general|sin categor/i.test(String(existing.nombre || ''))) {
        return { categoria_id: existing.id, categoria: existing.nombre, matchedBy: 'existing' };
      }
    }

    const matchRules = [
      { test: /openai|chatgpt|claude|cursor|adobe|canva|google|apple|icloud|hosting|dominio|software|saas|microsoft|zoom/i, cat: /software|tecnolog|suscripci|digital|herramienta|app|operaci/i },
      { test: /meta|facebook|instagram|tiktok|ads|publicidad|pauta|google ads/i, cat: /publicidad|marketing|mercadeo|pauta/i },
      { test: /uber|indrive|gasolina|combustible|peaje|shell|texaco|total|transporte|didi|estacionamiento/i, cat: /transporte|combustible|movilidad|vi[aá]tico/i },
      { test: /claro|altice|edesur|edenorte|agua|internet|luz|tel[eé]fono|electricidad/i, cat: /servicio|internet|luz|energ[ií]a|fijo|oficina/i },
      { test: /alquiler|renta|local/i, cat: /alquiler|renta|local/i },
      { test: /sirena|jumbo|nacional|bravo|supermercado|restaurante|caf[eé]|starbucks|almuerzo|comida/i, cat: /comida|alimentaci|dieta|supermercado|catering/i },
      { test: /dgii|itbis|isr|impuesto|contab/i, cat: /impuesto|dgii|fiscal|contab/i },
      { test: /c[aá]mara|lente|tr[ií]pode|flash|estudio|mantenimiento|reparaci|ferreter/i, cat: /equipo|mantenimiento|producci|estudio|costo/i },
      { test: /n[oó]mina|salario|freelance|maquill|decoraci|asistente|honorario/i, cat: /n[oó]mina|personal|honorario|equipo/i }
    ];

    for (const rule of matchRules) {
      if (!rule.test.test(text)) continue;
      const found = cats.find((c) => rule.cat.test(String(c.nombre || '')));
      if (found) return { categoria_id: found.id, categoria: found.nombre, matchedBy: 'keyword' };
    }

    const nonOther = cats.find((c) => !/otros|general|sin categor/i.test(String(c.nombre || '')));
    if (nonOther && cats.length && !currentId) {
      return { categoria_id: cats[0].id, categoria: cats[0].nombre, matchedBy: 'fallback' };
    }
    return currentId ? { categoria_id: currentId, categoria: '', matchedBy: 'keep' } : { categoria_id: '', categoria: '', matchedBy: 'none' };
  }

  function buildDemoInboxData() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      mode: 'demo',
      counts: {
        cuts: 2,
        consumptions: 2,
        paymentAlerts: 2,
        mailAttention: 2,
        fiscalReview: 1,
        totalPending: 9
      },
      cuts: [
        {
          id: 'demo-cut-pos-1',
          kind: 'pos_cut',
          title: 'Corte TPV POS · Terminal Principal',
          date: today,
          systemCentavos: 1845000,
          reportedCentavos: 1845000,
          differenceCentavos: 0,
          currency: 'DOP',
          status: 'pendiente_confirmacion',
          summary: '11 ventas con tarjeta · Sin descuadre vs cierre POS'
        },
        {
          id: 'demo-cut-cash-1',
          kind: 'cash_cut',
          title: 'Cierre Caja del Estudio',
          date: today,
          systemCentavos: 2410000,
          reportedCentavos: 2410000,
          differenceCentavos: 0,
          currency: 'DOP',
          status: 'pendiente_confirmacion',
          summary: 'Efectivo contado RD$24,100 · Coincide con libro'
        }
      ],
      consumptions: [
        {
          id: 'demo-cons-usd-1',
          merchant: 'OPENAI *CHATGPT PLUS',
          cardLast4: '4821',
          bankName: 'Banco Popular',
          accountId: 'tc-popular',
          currency: 'USD',
          originalCentavos: 2000,
          date: today,
          isDigital: true,
          autoDebitSuggested: true,
          suggestedCategoryName: 'Software e IA',
          status: 'pendiente',
          source: 'apps_script_gmail'
        },
        {
          id: 'demo-cons-dop-1',
          merchant: 'LA SIRENA CHURCHILL',
          cardLast4: '4821',
          bankName: 'Banco Popular',
          accountId: 'tc-popular',
          currency: 'DOP',
          originalCentavos: 485000,
          date: today,
          isDigital: false,
          autoDebitSuggested: false,
          suggestedCategoryName: 'Insumos y estudio',
          status: 'pendiente',
          source: 'apps_script_gmail'
        }
      ],
      paymentAlerts: [
        {
          id: 'demo-alert-1',
          title: 'Internet Fibra Óptica Altice',
          dueDate: today,
          amountCentavos: 349000,
          currency: 'DOP',
          severity: 'hoy',
          categoryName: 'Servicios y energía'
        },
        {
          id: 'demo-alert-2',
          title: 'Seguro Equipos Fotográficos',
          dueDate: today,
          amountCentavos: 420000,
          currency: 'DOP',
          severity: 'proximo',
          categoryName: 'Mantenimiento'
        }
      ],
      fx: {
        selectedBankKey: 'popular',
        updatedAt: new Date().toISOString(),
        banks: [
          { key: 'popular', label: 'Banco Popular', rateSell: 61.25, source: 'demo_live' },
          { key: 'banreservas', label: 'Banreservas', rateSell: 61.10, source: 'demo_live' },
          { key: 'bhd', label: 'Banco BHD', rateSell: 61.35, source: 'demo_live' },
          { key: 'scotiabank', label: 'Scotiabank', rateSell: 61.40, source: 'demo_live' }
        ]
      },
      cardLinks: {
        '4821': {
          cardLast4: '4821',
          bankKey: 'popular',
          accountId: 'tc-popular',
          accountName: 'Visa Business Popular ****4821',
          auto_debit_digital: true
        }
      },
      mail: {
        endpointUrl: 'https://crmapi-o2uqjp6fra-uc.a.run.app',
        accounts: [
          {
            email: 'erickcarela91@gmail.com',
            label: 'Principal · Compras y Bancos',
            solo_servicios: false,
            include_transfers: true,
            include_cash_codes: true,
            lastHeartbeatAt: new Date(Date.now() - 420000).toISOString(),
            status: 'activo'
          },
          {
            email: 'erickcarela58@gmail.com',
            label: 'Respaldo · Códigos Cash & Transferencias',
            solo_servicios: false,
            include_transfers: true,
            include_cash_codes: true,
            lastHeartbeatAt: new Date(Date.now() - 960000).toISOString(),
            status: 'activo'
          },
          {
            email: 'dcarelacompufoto01@gmail.com',
            label: "D' Carela · Facturas y Notificaciones",
            solo_servicios: true,
            include_transfers: true,
            include_cash_codes: true,
            lastHeartbeatAt: new Date(Date.now() - 1800000).toISOString(),
            status: 'activo'
          }
        ],
        movements: [
          {
            id: 'demo-mail-cash-1',
            kind: 'retiro_codigo_cash',
            bank: 'Banreservas',
            accountEmail: 'erickcarela58@gmail.com',
            subject: 'Tu Código Cash Banreservas RD$8,000 fue generado',
            amountCentavos: 800000,
            currency: 'DOP',
            reference: 'CASH-849201',
            date: today,
            registered: false
          },
          {
            id: 'demo-mail-lbtr-1',
            kind: 'transferencia_salida',
            bank: 'Banco Popular',
            accountEmail: 'erickcarela91@gmail.com',
            subject: 'Comprobante Transferencia LBTR RD$15,400 · Impresora Estudio',
            amountCentavos: 1540000,
            currency: 'DOP',
            reference: 'LBTR-339104',
            date: today,
            registered: false
          },
          {
            id: 'demo-mail-in-1',
            kind: 'transferencia_entrada',
            bank: 'Banco BHD',
            accountEmail: 'dcarelacompufoto01@gmail.com',
            subject: 'Pago recibido ACH RD$22,500 · Reserva Boda Noviembre',
            amountCentavos: 2250000,
            currency: 'DOP',
            reference: 'ACH-771290',
            date: today,
            registered: true
          },
          {
            id: 'demo-mail-usd-1',
            kind: 'consumo_digital',
            bank: 'Banco Popular',
            accountEmail: 'erickcarela91@gmail.com',
            subject: 'Notificación de consumo APPLE.COM/BILL USD $19.95',
            amountCentavos: 1995,
            currency: 'USD',
            reference: 'APPL-90112',
            date: today,
            registered: true
          }
        ],
        summary: { total: 4, pending: 2, registered: 2 }
      },
      fiscal: {
        compras: [
          { id: 'c606-1', ncf: 'B0100004812', rnc: '101850214', proveedor: 'ALMACENES UNIDOS SAS', fecha: today, montoCentavos: 1245000, itbisCentavos: 189915, estado: 'validado', origen: 'WhatsApp 606' },
          { id: 'c606-2', ncf: 'B0100091204', rnc: '130844512', proveedor: 'PAPELERÍA CCC SRL', fecha: today, montoCentavos: 389000, itbisCentavos: 59339, estado: 'validado', origen: 'Gmail 606' }
        ],
        revisar: [
          { id: 'rev-1', ncf: 'B01000??99', rnc: '131209841', proveedor: 'FERRETERÍA EXPRESS', fecha: today, montoCentavos: 215000, itbisCentavos: 32796, estado: 'por_revisar', motivo: 'NCF parcialmente borroso en foto' }
        ],
        ventas: [
          { id: 'v607-1', ncf: 'E3100000184', rncCliente: '131994821', cliente: 'CORPORACIÓN CARIBE EVENTS', fecha: today, montoCentavos: 4500000, itbisCentavos: 686440, estado: 'pendiente_validar', origen: 'Hermes Facturador DGII' },
          { id: 'v607-2', ncf: 'E3200000912', rncCliente: '000000000', cliente: 'CONSUMIDOR FINAL · SESIÓN', fecha: today, montoCentavos: 1450000, itbisCentavos: 221186, estado: 'validado', origen: 'e-CF XML Drive' }
        ],
        hermes: {
          keepaliveActive: true,
          lastRunAt: new Date(Date.now() - 600000).toISOString(),
          sessionState: 'synced',
          notes: 'Lectura reciente de comprobantes del Facturador Gratuito DGII'
        },
        summary: { compras: 2, ventas: 2, revisar: 1 }
      }
    };
  }

  const api = {
    PALETTES,
    emojiForCategory,
    emojiForAccount,
    emojiForMerchant,
    resolveClientExpenseCategory,
    buildDemoInboxData
  };

  root.DcarelaCategoryLinker = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
