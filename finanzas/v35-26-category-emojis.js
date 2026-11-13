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

  const APPLE_EMOJI_CODES = Object.freeze({
    '💸': '1f4b8',
    '💰': '1f4b0',
    '🔁': '1f501',
    '⏰': '23f0',
    '🔔': '1f514',
    '💳': '1f4b3',
    '🧾': '1f9fe',
    '✉️': '2709',
    '✉': '2709',
    '📑': '1f4d1',
    '🖥️': '1f5a5',
    '🖥': '1f5a5',
    '🎨': '1f3a8',
    '🖌️': '1f58c',
    '🖌': '1f58c',
    '☀️': '2600',
    '☀': '2600',
    '🌙': '1f319',
    '🏢': '1f3e2',
    '🌐': '1f310',
    '💱': '1f4b1',
    '✨': '2728',
    '✅': '2705',
    '⚠️': '26a0',
    '⚠': '26a0',
    '🚨': '1f6a8',
    '📋': '1f4cb',
    '📥': '1f4e5',
    '📤': '1f4e4',
    '🏦': '1f3e6',
    '💵': '1f4b5',
    '🏷️': '1f3f7',
    '🏷': '1f3f7',
    '🔍': '1f50d',
    '📅': '1f4c5',
    '🗓️': '1f5d3',
    '🗓': '1f5d3',
    '📊': '1f4ca',
    '⚙️': '2699',
    '⚙': '2699',
    '📸': '1f4f8',
    '🎬': '1f3ac',
    '💻': '1f4bb',
    '📣': '1f4e3',
    '🚗': '1f697',
    '⚡': '26a1',
    '🍽️': '1f37d',
    '🍽': '1f37d',
    '🔧': '1f527',
    '👥': '1f465',
    '🏧': '1f3e7',
    '🤖': '1f916',
    '🚕': '1f695',
    '🛒': '1f6d2',
    '📶': '1f4f6',
    '💊': '1f48a',
    '☕': '2615',
    '🔒': '1f512',
    '🟢': '1f7e2',
    '🟡': '1f7e1',
    '⏳': '23f3',
    '📝': '1f4dd',
    '🎛️': '1f4ca',
    '🎛': '1f4ca',
    '🔄': '1f501',
    '🧪': '2728'
  });

  function appleEmojiUrl(emoji) {
    const raw = String(emoji || '').trim();
    if (!raw) return '';
    const code = APPLE_EMOJI_CODES[raw] || APPLE_EMOJI_CODES[raw.replace(/\uFE0F/g, '')];
    return code ? `./assets/emojis/${code}.png` : '';
  }

  function appleEmojiHtml(emoji, size = 18, className = '') {
    const raw = String(emoji || '').trim();
    if (!raw) return '';
    const url = appleEmojiUrl(raw);
    const cls = className ? `v3526-apple-emoji ${className}` : 'v3526-apple-emoji';
    if (!url) return `<span>${raw}</span>`;
    return `<img class="${cls}" src="${url}" width="${size}" height="${size}" alt="" aria-hidden="true" draggable="false" loading="eager" style="width:${size}px;height:${size}px">`;
  }

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
      { test: /sirena|jumbo|nacional|bravo|supermercado|restaurante|caf[eé]|starbucks|almuerzo|comida|cena|desayuno|pizza|burger|mcdonald|wendy|kfc|pollo|yokomo|refrigerio/i, cat: /comida|alimentaci|dieta|supermercado|catering/i },
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
          bankName: 'Banco BHD',
          bankKey: 'bhd',
          accountId: 'sucursal-a-visa',
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
          cardLast4: '9042',
          bankName: 'Banreservas',
          bankKey: 'banreservas',
          accountId: 'sucursal-a-reservas',
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
        updatedAt: new Date().toISOString(),
        confirmedDate: today,
        confirmedToday: true,
        banks: [
          { key: 'banreservas', label: 'Banreservas', rateSell: 61.10, usdCompra: 58.40, bankUrl: 'https://www.banreservas.com/calculadoras/divisas', source: 'banreservas.com/calculadoras/divisas · Confirmado hoy', confirmedToday: true },
          { key: 'bhd', label: 'Banco BHD', rateSell: 61.35, usdCompra: 58.20, bankUrl: 'https://www.infodolar.com.do/', source: 'infodolar.com.do · Confirmado hoy', confirmedToday: true },
          { key: 'popular', label: 'Banco Popular', rateSell: 61.25, usdCompra: 58.15, bankUrl: 'https://www.infodolar.com.do/', source: 'infodolar.com.do · Confirmado hoy', confirmedToday: true },
          { key: 'scotiabank', label: 'Scotiabank', rateSell: 61.40, usdCompra: 58.10, bankUrl: 'https://www.infodolar.com.do/', source: 'infodolar.com.do · Confirmado hoy', confirmedToday: true }
        ]
      },
      cardLinks: {
        '4821': {
          cardLast4: '4821',
          bankKey: 'bhd',
          accountId: 'sucursal-a-visa',
          accountName: 'Tarjeta empresarial BHD ****4821',
          auto_debit_digital: true
        },
        '9042': {
          cardLast4: '9042',
          bankKey: 'banreservas',
          accountId: 'sucursal-a-reservas',
          accountName: 'Cuenta Banreservas ****9042',
          auto_debit_digital: false
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
      },
      ecosystem: (function () {
        const isPlazaDemo = typeof document !== 'undefined' && document.querySelector?.('meta[name="dcarela-branch-app"]')?.content === 'plaza';
        const biz = isPlazaDemo ? 'plaza-artesanal' : 'dcarela';
        const branchName = isPlazaDemo ? 'Plaza Artesanal' : 'Central';
        const nowIso = new Date().toISOString();
        return {
          ok: true,
          businessId: biz,
          branchName,
          checkedAt: nowIso,
          database: {
            projectId: 'erikccarela',
            connected: true,
            accountsCount: isPlazaDemo ? 3 : 6,
            movementsCount: isPlazaDemo ? 18 : 64,
            movementsSampled: false,
            obligationsCount: isPlazaDemo ? 2 : 5,
            syncedAt: nowIso
          },
          caja: {
            today,
            activeShift: {
              id: `demo-shift-${biz}`,
              cajaNombre: `Caja ${branchName} POS`,
              usuarioNombre: isPlazaDemo ? 'caja.plaza@dcarelacompufoto.com' : 'caja.central@dcarelacompufoto.com',
              status: 'open',
              openedAt: `${today}T09:05:00-04:00`,
              montoAperturaCentavos: 500000,
              saleCount: isPlazaDemo ? 4 : 9,
              grossSalesCentavos: isPlazaDemo ? 1850000 : 4260000
            },
            openShifts: [
              {
                id: `demo-shift-${biz}`,
                cajaNombre: `Caja ${branchName} POS`,
                usuarioNombre: isPlazaDemo ? 'caja.plaza@dcarelacompufoto.com' : 'caja.central@dcarelacompufoto.com',
                status: 'open',
                openedAt: `${today}T09:05:00-04:00`,
                montoAperturaCentavos: 500000,
                saleCount: isPlazaDemo ? 4 : 9,
                grossSalesCentavos: isPlazaDemo ? 1850000 : 4260000
              }
            ],
            recentClosings: [
              {
                id: `demo-close-${biz}-prev`,
                cajaNombre: `Caja ${branchName} POS`,
                closedAt: new Date(Date.now() - 86400000).toISOString(),
                saleCount: isPlazaDemo ? 8 : 16,
                grossSalesCentavos: isPlazaDemo ? 3120000 : 7890000,
                efectivoAEntregarCentavos: isPlazaDemo ? 1480000 : 3240000
              }
            ],
            devices: [
              {
                id: `pos-${biz}-1`,
                name: `PC Mostrador ${branchName}`,
                status: 'activa',
                version: '1.0.77',
                lastSeenAt: new Date(Date.now() - 90000).toISOString(),
                online: true
              }
            ],
            onlineDevices: 1,
            totalDevices: 1,
            lastDeviceSeenAt: new Date(Date.now() - 90000).toISOString(),
            lastAppliedEventAt: new Date(Date.now() - 180000).toISOString(),
            lastPosEventAt: new Date(Date.now() - 120000).toISOString(),
            salesTodayCount: isPlazaDemo ? 4 : 9,
            salesTodayCentavos: isPlazaDemo ? 1850000 : 4260000,
            pendingCutsCount: 2,
            recentSales: [
              {
                id: `demo-sale-${biz}-1`,
                folio: isPlazaDemo ? 'P-142' : 'C-812',
                cliente: isPlazaDemo ? 'Visitante Plaza · Taza Foto' : 'Estudio Bodas Caribe',
                totalCentavos: isPlazaDemo ? 480000 : 1450000,
                metodo: 'Tarjeta',
                fecha: today,
                at: new Date(Date.now() - 420000).toISOString(),
                origen: 'POS'
              },
              {
                id: `demo-sale-${biz}-2`,
                folio: isPlazaDemo ? 'P-141' : 'C-811',
                cliente: 'Consumidor Final · Retrato',
                totalCentavos: isPlazaDemo ? 220000 : 650000,
                metodo: 'Efectivo',
                fecha: today,
                at: new Date(Date.now() - 1800000).toISOString(),
                origen: 'POS'
              }
            ]
          },
          crm: {
            conversationsTotal: isPlazaDemo ? 18 : 64,
            unreadConversations: isPlazaDemo ? 2 : 5,
            handoffPending: isPlazaDemo ? 1 : 2,
            recentConversations: [
              {
                id: `demo-conv-${biz}-1`,
                name: isPlazaDemo ? 'Laura Gómez · Souvenirs' : 'Mariela Rojas · Boda',
                phone: isPlazaDemo ? '18095550192' : '18095550144',
                unreadCount: 2,
                handoff: true,
                stage: 'cotizando',
                preview: isPlazaDemo ? '¿Listo el cuadro personalizado para hoy?' : 'Confirmar hora de sesión en estudio...',
                lastMessageAt: new Date(Date.now() - 300000).toISOString()
              },
              {
                id: `demo-conv-${biz}-2`,
                name: isPlazaDemo ? 'Hotel Zona Colonial' : 'Carlos Medina · Graduación',
                phone: isPlazaDemo ? '18095550881' : '18095550321',
                unreadCount: 0,
                handoff: false,
                stage: 'seguimiento',
                preview: 'Gracias, paso por allá a las 4 PM.',
                lastMessageAt: new Date(Date.now() - 2400000).toISOString()
              }
            ],
            quotesTotal: isPlazaDemo ? 5 : 14,
            quotesPending: isPlazaDemo ? 2 : 4,
            quotesApproved: isPlazaDemo ? 2 : 6,
            recentQuotes: [
              {
                id: `demo-quote-${biz}-1`,
                folio: isPlazaDemo ? 'COT-P19' : 'COT-104',
                cliente: isPlazaDemo ? 'Laura Gómez' : 'Mariela Rojas',
                telefono: '18095550144',
                titulo: isPlazaDemo ? 'Combo Impresión + Marco 11x14' : 'Paquete XV Premium Estudio',
                totalCentavos: isPlazaDemo ? 680000 : 2850000,
                estado: 'enviada',
                creada: today
              },
              {
                id: `demo-quote-${biz}-2`,
                folio: isPlazaDemo ? 'COT-P18' : 'COT-103',
                cliente: 'Eventos del Este SRL',
                telefono: '18295550910',
                titulo: 'Cobertura Corporativa',
                totalCentavos: isPlazaDemo ? 1150000 : 3400000,
                estado: 'aprobada',
                creada: today
              }
            ],
            tasksPending: isPlazaDemo ? 2 : 3,
            tasksOverdue: 1,
            pendingTasks: [
              {
                id: `demo-task-${biz}-1`,
                titulo: isPlazaDemo ? `Preparar entrega Marco ${branchName}` : 'Confirmar retoque álbum boda',
                fechaLimite: today,
                horaLimite: '16:30',
                prioridad: 'alta',
                empleadoNombre: 'Erick',
                estado: 'pendiente',
                vencida: false
              }
            ],
            clientsCount: isPlazaDemo ? 42 : 184,
            clientsWithBalanceCount: isPlazaDemo ? 2 : 6,
            clientsReceivableCentavos: isPlazaDemo ? 390000 : 1620000,
            recentClients: [
              {
                id: `demo-cli-${biz}-1`,
                nombre: isPlazaDemo ? 'Galería Zona Colonial' : 'Estudio Eventos RD',
                telefono: '809-555-2233',
                saldoCentavos: isPlazaDemo ? 390000 : 920000,
                diasCredito: 15,
                limiteCreditoCentavos: 2500000
              },
              {
                id: `demo-cli-${biz}-2`,
                nombre: isPlazaDemo ? 'Ana Turística' : 'Luis Fotografía',
                telefono: '829-555-4411',
                saldoCentavos: 0,
                diasCredito: 0,
                limiteCreditoCentavos: 0
              }
            ],
            bridgeStatus: {
              bridgeId: isPlazaDemo ? 'whatsapp_qr_plaza' : 'whatsapp_qr',
              status: 'connected',
              connectedPhone: isPlazaDemo ? '18094440000' : '18495245620',
              updatedAt: new Date(Date.now() - 45000).toISOString(),
              botEnabled: !isPlazaDemo,
              online: true
            }
          }
        };
      })()
    };
  }

  const api = {
    PALETTES,
    APPLE_EMOJI_CODES,
    appleEmojiUrl,
    appleEmojiHtml,
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
