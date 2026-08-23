/**
 * D' Carela POS - Firebase Adapter
 * Bridge for Firebase Authentication and Cloud Firestore.
 * Supports both standalone Firebase operation and hybrid backend coexistence.
 */
(function() {
  'use strict';

  // La configuración web vive en firebase-config.js. No se duplica aquí para
  // evitar que una copia desactualizada conecte silenciosamente otro proyecto.
  const cfg = window.__DCARELA_FIREBASE_CONFIG || null;

  let app = null;
  let auth = null;
  let db = null;
  let initialized = false;
  const eventArchiveCache = new Map();

  function initFirebase() {
    if (initialized) return { app, auth, db };
    try {
      if (!cfg) return { app, auth, db };
      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        if (!firebase.apps || !firebase.apps.length) {
          app = firebase.initializeApp(cfg);
        } else {
          app = firebase.app();
        }
        auth = firebase.auth();
        db = firebase.firestore();
        // Enable offline persistence if available
        if (db && db.enablePersistence) {
          db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
              console.warn('Firestore persistence warning:', err);
            }
          });
        }
        initialized = true;
      }
    } catch (e) {
      console.warn('Firebase initialization notice:', e.message);
    }
    return { app, auth, db };
  }

  // Auto-init on script load if SDK is present
  initFirebase();

  const nowIso = () => new Date().toISOString();
  const uuid = () => (globalThis.crypto?.randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    }));
  const integer = (value, label = 'valor', minimum = 0) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) {
      throw new Error(`${label} no es un entero de centavos valido.`);
    }
    return parsed;
  };
  const milli = (value, label = 'cantidad') => {
    const normalized = String(value ?? '').trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) throw new Error(`${label} no es valida.`);
    const parsed = Math.round(Number(normalized) * 1000);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} debe ser mayor que cero.`);
    return parsed;
  };
  const quantityText = value => {
    const whole = Math.trunc(value / 1000);
    const fraction = String(value % 1000).padStart(3, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : String(whole);
  };
  const roundDivide = (numerator, denominator) => Math.round(numerator / denominator);
  const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);

  function roleCanSell(role) {
    return ['owner', 'admin', 'cajero'].includes(String(role || '').toLowerCase());
  }

  function permissionsForRole(role) {
    const admin = ['owner', 'admin'].includes(String(role || '').toLowerCase());
    const seller = roleCanSell(role);
    return {
      canUse: seller,
      canOpenShift: seller,
      canCreateSale: seller,
      canCloseShift: seller,
      canCancelSale: admin,
      canOverridePrice: admin,
      canForceInventory: admin,
      canOpenCommonSale: admin,
      canParkSale: seller,
      canVerifyPrice: seller
    };
  }

  const WEB_SALE_CAPABILITIES = Object.freeze([
    'ventas', 'pagos_mixtos', 'credito', 'pendientes', 'cotizaciones',
    'anulaciones', 'entradas_salidas', 'arqueo', 'impresion', 'clientes',
    'productos', 'inventario', 'reportes', 'finanzas', 'atajos_f1_f12',
    'seguimiento_transferencias'
  ]);

  function webShiftSummary(shift) {
    const opening = Number(shift?.montoAperturaCentavos || 0);
    const cash = Number(shift?.cashSalesCentavos || 0);
    const entries = Number(shift?.entriesCentavos || 0);
    const exits = Number(shift?.exitsCentavos || 0);
    const refunds = Number(shift?.cashRefundsCentavos || 0);
    const customerPayments = Number(shift?.customerCashPaymentsCentavos || 0);
    const deliver = cash + customerPayments + entries - exits - refunds;
    return {
      saleCount: Number(shift?.saleCount || 0),
      grossSalesCentavos: Number(shift?.grossSalesCentavos || 0),
      cashSalesCentavos: cash,
      customerCashPaymentsCentavos: customerPayments,
      entriesCentavos: entries,
      exitsCentavos: exits,
      cashRefundsCentavos: refunds,
      cashToDeliverCentavos: deliver,
      expectedCashCentavos: opening + deliver,
    };
  }

  async function firebaseContext(businessId, role) {
    const { auth: a, db: d } = initFirebase();
    const user = a?.currentUser;
    if (!d || !user) throw new Error('La sesion Firebase vencio. Inicia sesion nuevamente.');
    if (!roleCanSell(role)) throw new Error('Tu cuenta no tiene permiso para usar la Caja virtual.');
    return { d, user, businessId: text(businessId, 120), role: String(role || '').toLowerCase() };
  }

  async function openWebShift(ctx) {
    const rows = await DcarelaFirebase.getCashShifts(ctx.businessId, 250);
    return rows.find(item => item.status === 'open' && item.opened_by_uid === ctx.user.uid) || null;
  }

  function eventDocument(ctx, eventId, eventType, entityType, entityId, payload, createdAt = nowIso()) {
    return {
      business_id: ctx.businessId,
      device_id: `web-${ctx.user.uid}`,
      event_id: eventId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload,
      created_at_local: createdAt,
      received_at_cloud: createdAt,
      status: 'received',
      source: 'caja_web_firebase',
      created_by_uid: ctx.user.uid
    };
  }

  async function createFirebaseSale(ctx, data, requestId) {
    const d = ctx.d;
    const existing = await d.collection('sync_events').doc(requestId).get();
    if (existing.exists) {
      const row = existing.data();
      if (row.event_type !== 'VentaCobrada') throw new Error('request_id ya pertenece a otra operacion.');
      return { ok: true, sale: row.payload, event: { id: existing.id, ...row }, deduplicated: true };
    }
    const shift = await openWebShift(ctx);
    if (!shift) throw new Error('Abre la caja web antes de registrar una venta.');
    if (!Array.isArray(data?.lineas) || !data.lineas.length || data.lineas.length > 200) {
      throw new Error('La venta necesita entre 1 y 200 lineas.');
    }

    const productIds = [...new Set(data.lineas.filter(line => !line.comun).map(line => text(line.productoId, 160)))];
    const productDocs = await Promise.all(productIds.map(id => d.collection('products').doc(id).get()));
    const products = new Map(productDocs.filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));
    const lines = [];
    const stockUpdates = [];
    let baseTotal = 0, taxTotal = 0, discountTotal = 0, exactTotal = 0;
    for (let index = 0; index < data.lineas.length; index++) {
      const input = data.lineas[index] || {};
      const common = input.comun === true || text(input.productoId, 160).startsWith('comun-');
      if (common && !['owner', 'admin'].includes(ctx.role)) throw new Error('Tu usuario no puede registrar ventas comunes.');
      const productId = common ? (text(input.productoId, 160) || `comun-${uuid()}`) : text(input.productoId, 160);
      const product = common ? null : products.get(productId);
      if (!common && (!product || product.activo === false)) throw new Error(`El producto de la linea ${index + 1} ya no esta activo.`);
      const name = common ? text(input.nombre, 180) : text(product.nombre, 180);
      if (!name) throw new Error(`La linea ${index + 1} no tiene descripcion.`);
      const quantity = milli(input.cantidad, `cantidad de ${name}`);
      const wholesale = input.mayoreo === true;
      const normalPrice = common ? integer(input.precioUnitarioCentavos, `precio de ${name}`, 1)
        : integer(product.precioFinalCentavos ?? product.precio_final_centavos, `precio de ${name}`, 1);
      const wholesalePrice = common ? 0 : integer(product.precioMayoreoCentavos ?? product.precio_mayoreo_centavos ?? 0, `mayoreo de ${name}`, 0);
      const authoritative = wholesale && wholesalePrice > 0 ? wholesalePrice : normalPrice;
      const requested = input.precioUnitarioCentavos == null ? authoritative : integer(input.precioUnitarioCentavos, `precio de ${name}`, 1);
      if (requested !== authoritative && !['owner', 'admin'].includes(ctx.role)) throw new Error('Tu usuario no puede cambiar precios.');
      if (requested !== authoritative && !text(data.motivoCambioPrecio, 500)) throw new Error('Indica el motivo del precio especial.');
      const discountBp = Math.round(Number(input.descuentoPct || 0) * 100);
      if (!Number.isSafeInteger(discountBp) || discountBp < 0 || discountBp > 10000) throw new Error(`Descuento invalido en ${name}.`);
      if (discountBp && !['owner', 'admin'].includes(ctx.role)) throw new Error('Tu usuario no puede aplicar descuentos.');
      const gross = roundDivide(requested * quantity, 1000);
      const discount = roundDivide(gross * discountBp, 10000);
      const finalAmount = gross - discount;
      if (finalAmount <= 0) throw new Error(`La linea ${name} debe conservar un importe mayor que cero.`);
      const rate = Number(common ? (input.tasaItbis ?? .18) : (product.tasaItbis ?? product.tasa_itbis ?? .18));
      const rateMillion = Math.round(rate * 1000000);
      const base = rateMillion > 0 ? roundDivide(finalAmount * 1000000, 1000000 + rateMillion) : finalAmount;
      const tax = finalAmount - base;
      const usesInventory = common ? false : product.usaInventario !== false && product.usa_inventario !== false;
      const currentStock = Number(product?.stock ?? 0);
      const required = quantity / 1000;
      if (usesInventory && currentStock < required && !(data.forzarInventario && ['owner', 'admin'].includes(ctx.role) && text(data.motivoInventario, 500))) {
        const error = new Error(`Inventario requiere confirmacion: ${name}, disponible ${currentStock}, requerido ${quantityText(quantity)}.`);
        error.code = 'inventory_confirmation';
        throw error;
      }
      if (usesInventory) stockUpdates.push({ id: productId, stock: currentStock - required });
      lines.push({
        productoId: productId, nombre: name, cantidad: quantityText(quantity),
        precioUnitarioCentavos: requested, importeBrutoCentavos: gross,
        descuentoCentavos: discount, importeFinalCentavos: finalAmount,
        baseSinItbisCentavos: base, itbisCentavos: tax, tasaItbis: String(rate),
        costoUnitarioCentavos: integer(product?.costoCentavos ?? product?.costo_centavos ?? 0, `costo de ${name}`, 0),
        usaInventario: usesInventory, esMayoreo: wholesale,
        precioListaCentavos: normalPrice, ahorroMayoreoCentavos: Math.max(0, normalPrice - requested)
      });
      baseTotal += base; taxTotal += tax; discountTotal += discount; exactTotal += finalAmount;
    }
    let total = exactTotal;
    if (data.redondeo === 'abajo_5' && exactTotal >= 500) total = Math.floor(exactTotal / 500) * 500;
    const payments = (data.pagos || []).map(payment => ({
      metodo: text(payment.metodo, 30).toLowerCase(),
      montoCentavos: integer(payment.montoCentavos, `monto ${payment.metodo}`, 1),
      referencia: text(payment.referencia, 180) || null,
      cuentaFinancieraId: text(payment.cuentaFinancieraId, 160) || null,
      cuentaFinancieraNombre: text(payment.cuentaFinancieraNombre, 180) || null
    }));
    const allowedMethods = new Set(['efectivo', 'tarjeta', 'transferencia', 'cheque', 'credito']);
    if (!payments.length || payments.some(payment => !allowedMethods.has(payment.metodo))) throw new Error('Agrega metodos de pago validos.');
    if (payments.reduce((sum, item) => sum + item.montoCentavos, 0) !== total) throw new Error('La suma de pagos no coincide con el total.');
    const clientId = text(data.clienteId, 160) || null;
    const clientDoc = clientId ? await d.collection('clients').doc(clientId).get() : null;
    const client = clientDoc?.exists ? clientDoc.data() : null;
    const credit = payments.filter(item => item.metodo === 'credito').reduce((sum, item) => sum + item.montoCentavos, 0);
    if (credit && (!clientId || !client || client.activo === false)) throw new Error('Una venta a credito necesita un cliente activo.');
    const limit = Number(client?.limiteCreditoCentavos ?? client?.limite_credito_centavos ?? 0);
    const debt = Number(client?.saldoCentavos ?? client?.saldo_centavos ?? 0);
    if (credit && limit > 0 && debt + credit > limit) throw new Error('El credito supera el disponible del cliente.');
    const tip = integer(data.propinaCentavos || 0, 'propinaCentavos', 0);
    const cashOnly = payments.length === 1 && payments[0].metodo === 'efectivo';
    const received = cashOnly ? integer(data.pagoConCentavos, 'efectivo recibido', total + tip) : null;
    const soldAt = nowIso();
    const saleId = uuid();
    const counterRef = d.collection('counters').doc(`${ctx.businessId}_web_sale`);
    const eventRef = d.collection('sync_events').doc(requestId);
    const saleRef = d.collection('sales').doc(saleId);
    let salePayload = null;
    await d.runTransaction(async transaction => {
      const [eventAgain, counter] = await Promise.all([transaction.get(eventRef), transaction.get(counterRef)]);
      if (eventAgain.exists) { salePayload = eventAgain.data().payload; return; }
      const folio = Math.max(1, Number(counter.data()?.next || 900000));
      salePayload = {
        ventaId: saleId, folio, turnoId: shift.id, cajaNombre: shift.cajaNombre || 'Caja web',
        clienteId: clientId, clienteNombre: client ? text(client.nombre, 180) : null,
        clienteTelefono: client ? text(client.telefono, 80) || null : null,
        subtotalSinItbisCentavos: baseTotal, itbisCentavos: taxTotal,
        descuentoCentavos: discountTotal, totalCalculadoCentavos: exactTotal,
        ajusteRedondeoCentavos: total - exactTotal, totalCobradoCentavos: total,
        metodo: payments.length === 1 ? payments[0].metodo : 'mixto',
        pagoConCentavos: received, cambioCentavos: received == null ? null : received - total - tip,
        propinaCentavos: tip, referencia: payments.length === 1 ? payments[0].referencia : null,
        nota: text(data.nota, 1200) || null, idempotencyKey: requestId, pagos: payments, lineas,
        motivoInventario: text(data.motivoInventario, 500) || null,
        vendidaEn: soldAt, turnoInicio: shift.abiertoEn || shift.opened_at,
        usuarioId: ctx.user.uid, usuarioNombre: ctx.user.email || 'Caja web Firebase', origen: 'caja_web'
      };
      transaction.set(counterRef, { business_id: ctx.businessId, next: folio + 1, updated_at: soldAt }, { merge: true });
      transaction.create(eventRef, eventDocument(ctx, requestId, 'VentaCobrada', 'ventas', saleId, salePayload, soldAt));
      transaction.create(saleRef, { ...salePayload, business_id: ctx.businessId, status: 'closed', created_at: soldAt, created_by_uid: ctx.user.uid });
      transaction.update(shiftRef, {
        saleCount: firebase.firestore.FieldValue.increment(1),
        grossSalesCentavos: firebase.firestore.FieldValue.increment(total),
        cashSalesCentavos: firebase.firestore.FieldValue.increment(
          payments.filter(item => item.metodo === 'efectivo').reduce((sum, item) => sum + item.montoCentavos, 0)
        ),
        updated_at: soldAt,
      });
      stockUpdates.forEach(item => transaction.update(d.collection('products').doc(item.id), { stock: item.stock, updated_at: soldAt }));
      if (credit && clientId) transaction.update(d.collection('clients').doc(clientId), { saldoCentavos: debt + credit, updated_at: soldAt });
    });
    return { ok: true, sale: salePayload, event: { id: requestId }, warnings: [] };
  }

  const financeSignedAmount = (type, amount) => {
    const positive = new Set(['ingreso', 'venta', 'deposito', 'entrada', 'ajuste_positivo']);
    const negative = new Set(['gasto', 'compra', 'retiro', 'salida', 'ajuste_negativo', 'comision']);
    if (positive.has(type)) return Math.abs(amount);
    if (negative.has(type)) return -Math.abs(amount);
    return amount;
  };

  async function firebaseAdminAction(ctx, action, entityId, data) {
    if (!['owner', 'admin'].includes(ctx.role)) throw new Error('Tu cuenta no tiene permiso de administracion.');
    const d = ctx.d;
    const createdAt = nowIso();
    const actor = { created_by_uid: ctx.user.uid, created_by_email: ctx.user.email || '' };
    const saveWithEvent = async (collection, id, values, eventType, entityType, message) => {
      const documentId = text(id, 160) || uuid();
      const eventId = uuid();
      const payload = { ...values, id: documentId, usuarioId: ctx.user.uid, usuarioNombre: ctx.user.email || 'Panel Firebase' };
      const batch = d.batch();
      batch.set(d.collection(collection).doc(documentId), {
        ...values, business_id: ctx.businessId, updated_at: createdAt, ...actor
      }, { merge: true });
      batch.set(d.collection('sync_events').doc(eventId),
        eventDocument(ctx, eventId, eventType, entityType, documentId, payload, createdAt));
      await batch.commit();
      return { ok: true, id: documentId, event: { id: eventId, entity_id: documentId }, message };
    };

    if (action === 'sale.create') return createFirebaseSale(ctx, data, text(data?.requestId, 80) || uuid());

    if (action === 'ui.preference.upsert') {
      const id = text(entityId, 160) || ctx.user.uid;
      await d.collection('ui_preferences').doc(id).set({
        ...data, business_id: ctx.businessId, user_id: ctx.user.uid, updated_at: createdAt
      }, { merge: true });
      return { ok: true, id, message: 'Preferencia guardada.' };
    }

    if (action === 'product.upsert') {
      const id = text(entityId || data.productoId, 160) || uuid();
      return saveWithEvent('products', id, { ...data, productoId: id },
        entityId ? (data.activo === false ? 'ProductoDesactivado' : 'ProductoEditado') : 'ProductoCreado',
        'productos', 'Producto guardado y enviado a las cajas.');
    }

    if (action === 'category.upsert') {
      const id = text(entityId, 160) || uuid();
      return saveWithEvent('categories', id, { ...data, categoriaId: id, activo: data.activo !== false },
        entityId ? 'CategoriaEditada' : 'CategoriaCreada', 'categorias', 'Categoria guardada.');
    }

    if (action === 'client.upsert') {
      const id = text(entityId || data.clienteId, 160) || uuid();
      return saveWithEvent('clients', id, { ...data, clienteId: id, saldoCentavos: Number(data.saldoCentavos || 0) },
        entityId ? 'ClienteEditado' : 'ClienteCreado', 'clientes', 'Cliente guardado y sincronizado.');
    }

    if (action === 'combo.components.set') {
      const id = text(entityId || data.comboId, 160);
      if (!id) throw new Error('Selecciona el combo que deseas actualizar.');
      const result = await saveWithEvent('product_combos', id, { ...data, comboId: id },
        'KitEditado', 'productos', 'Componentes del combo actualizados.');
      await d.collection('products').doc(id).set({ costoCentavos: Number(data.costoCentavos || 0), updated_at: createdAt }, { merge: true });
      return result;
    }

    if (action === 'inventory.set') {
      const id = text(entityId || data.productoId, 160);
      const reason = text(data.motivo, 500);
      if (!id || !reason) throw new Error('El producto y el motivo son obligatorios.');
      const stock = Number(data.cantidadNueva);
      if (!Number.isFinite(stock) || stock < 0) throw new Error('La existencia no es valida.');
      const productRef = d.collection('products').doc(id);
      const eventId = uuid();
      await d.runTransaction(async transaction => {
        const product = await transaction.get(productRef);
        if (!product.exists || product.data().business_id !== ctx.businessId) throw new Error('El producto no existe.');
        const payload = { productoId: id, nombre: data.nombre || product.data().nombre, cantidadAnterior: Number(product.data().stock || 0), cantidadNueva: stock, motivo: reason, usuarioId: ctx.user.uid, usuarioNombre: ctx.user.email || 'Panel Firebase' };
        transaction.update(productRef, { stock, updated_at: createdAt });
        transaction.set(d.collection('sync_events').doc(eventId), eventDocument(ctx, eventId, 'InventarioAjustado', 'productos', id, payload, createdAt));
      });
      return { ok: true, id, message: 'Existencia ajustada con auditoria.' };
    }

    if (action === 'business.update') {
      const payload = { ...data, seccion: 'negocio', logoActivo: data.logoActivo ? '1' : '0' };
      const eventId = uuid();
      const batch = d.batch();
      batch.set(d.collection('businesses').doc(ctx.businessId), {
        ...data, name: data.nombre || data.name || ctx.businessId, active: true, updated_at: createdAt
      }, { merge: true });
      batch.set(d.collection('sync_events').doc(eventId), eventDocument(ctx, eventId,
        'ConfiguracionActualizada', 'configuracion', 'negocio', payload, createdAt));
      await batch.commit();
      return { ok: true, id: ctx.businessId, message: 'Datos del negocio actualizados.' };
    }

    if (action === 'expense_category.upsert') {
      const id = text(entityId, 160) || uuid();
      return saveWithEvent('expense_categories', id, {
        ...data, categoriaId: id, nombre: text(data.nombre, 120), activo: data.activo !== false
      }, 'CategoriaGastoCreada', 'categorias_gasto', 'Categoria de gasto guardada.');
    }

    if (action === 'expense.upsert') {
      const id = text(entityId || data.gastoId, 160) || uuid();
      return saveWithEvent('expenses', id, {
        ...data, gastoId: id, montoCentavos: integer(data.montoCentavos, 'monto', 1), activo: true,
        estado: 'registrado'
      }, entityId ? 'GastoEditado' : 'GastoRegistrado', 'gastos', 'Gasto guardado con auditoria.');
    }

    if (action === 'expense.delete') {
      const id = text(entityId || data.gastoId, 160);
      if (!id) throw new Error('Selecciona el gasto que deseas anular.');
      return saveWithEvent('expenses', id, {
        ...data, gastoId: id, activo: false, estado: 'anulado', anuladoEn: createdAt
      }, 'GastoAnulado', 'gastos', 'Gasto anulado sin borrar su historial.');
    }

    if (action === 'cost.recurring.upsert') {
      const id = text(entityId || data.recurrenteId, 160) || uuid();
      const active = data.activo !== false;
      return saveWithEvent('cost_recurrents', id, { ...data, recurrenteId: id, activo: active },
        active ? 'CostoRecurrenteGuardado' : 'CostoRecurrenteDesactivado', 'costos_recurrentes',
        active ? 'Costo recurrente guardado.' : 'Costo recurrente desactivado.');
    }

    if (action === 'cost.obligation.upsert') {
      const id = text(entityId || data.obligacionId, 160) || uuid();
      return saveWithEvent('cost_obligations', id, { ...data, obligacionId: id },
        'CostoObligacionGuardada', 'costos_obligaciones', 'Factura o deuda guardada.');
    }

    if (action === 'cost.obligation.cancel') {
      const id = text(entityId || data.obligacionId, 160);
      if (!id) throw new Error('Selecciona la obligacion que deseas anular.');
      return saveWithEvent('cost_obligations', id, {
        ...data, obligacionId: id, saldoCentavos: 0, estado: 'anulada', anuladaEn: createdAt
      }, 'CostoObligacionAnulada', 'costos_obligaciones', 'Obligacion anulada; los pagos se conservaron.');
    }

    if (action === 'cost.payment.create') {
      const obligationId = text(entityId || data.obligacionId, 160);
      const amount = integer(data.montoCentavos, 'monto', 1);
      if (!obligationId) throw new Error('La obligacion es obligatoria.');
      const paymentId = uuid();
      const eventId = uuid();
      const obligationRef = d.collection('cost_obligations').doc(obligationId);
      await d.runTransaction(async transaction => {
        const obligation = await transaction.get(obligationRef);
        if (!obligation.exists || obligation.data().business_id !== ctx.businessId) throw new Error('La obligacion no existe.');
        const current = Number(obligation.data().saldoCentavos ?? obligation.data().saldo_centavos ?? 0);
        if (amount > current) throw new Error('El pago no puede superar el saldo pendiente.');
        const balance = current - amount;
        const payload = { ...data, pagoId: paymentId, obligacionId: obligationId, montoCentavos: amount,
          saldoCentavos: balance, estado: balance === 0 ? 'pagada' : 'parcial', pagadoEn: createdAt };
        transaction.create(d.collection('cost_payments').doc(paymentId), {
          ...payload, business_id: ctx.businessId, created_at: createdAt, ...actor
        });
        transaction.update(obligationRef, { saldoCentavos: balance, estado: payload.estado, updated_at: createdAt });
        transaction.create(d.collection('sync_events').doc(eventId),
          eventDocument(ctx, eventId, 'CostoPagoRegistrado', 'costos_pagos', paymentId, payload, createdAt));
      });
      return { ok: true, id: paymentId, event: { id: eventId, entity_id: paymentId }, message: 'Pago aplicado una sola vez.' };
    }

    if (action === 'receipt.create') {
      const id = text(entityId || data.reciboId, 160) || uuid();
      return saveWithEvent('payment_receipts', id, {
        ...data, reciboId: id, estado: 'emitido', firmado: false, creadoEn: createdAt
      }, 'ReciboPagoEmitido', 'recibos_pago', 'Recibo emitido.');
    }

    if (action === 'receipt.signature') {
      const id = text(entityId || data.reciboId, 160);
      if (!id) throw new Error('Selecciona el recibo.');
      return saveWithEvent('payment_receipts', id, { ...data, reciboId: id, firmado: data.firmado === true },
        'ReciboPagoFirmaActualizada', 'recibos_pago', 'Firma del recibo actualizada.');
    }

    if (action === 'receipt.cancel') {
      const id = text(entityId || data.reciboId, 160);
      if (!id) throw new Error('Selecciona el recibo.');
      return saveWithEvent('payment_receipts', id, { ...data, reciboId: id, estado: 'anulado', anuladoEn: createdAt },
        'ReciboPagoAnulado', 'recibos_pago', 'Recibo anulado sin borrar el historial.');
    }

    if (action === 'fin.account.upsert') {
      const id = text(entityId, 160) || uuid();
      const ref = d.collection('fin_accounts').doc(id);
      await d.runTransaction(async transaction => {
        const previous = await transaction.get(ref);
        const old = previous.exists ? previous.data() : {};
        const nextInitial = integer(data.saldoInicialCentavos ?? 0, 'saldo inicial', Number.MIN_SAFE_INTEGER);
        const oldInitial = Number(old.saldo_inicial_centavos || 0);
        const oldCurrent = Number(old.saldo_actual_centavos ?? oldInitial);
        transaction.set(ref, {
          business_id: ctx.businessId, nombre: text(data.nombre, 120),
          tipo: text(data.tipo, 40) || 'otra', grupo: text(data.grupo, 120) || null,
          moneda: text(data.moneda, 8) || 'DOP', saldo_inicial_centavos: nextInitial,
          saldo_actual_centavos: oldCurrent + (nextInitial - oldInitial),
          incluir_en_total: data.incluirEnTotal === true, ligada_ventas: data.ligadaVentas === true,
          oculta: data.oculta === true, estado: 'activa', orden: Number(data.orden || 0),
          visual_tono: text(data.visualTono, 20) || '#18181B',
          visual_tono_secundario: text(data.visualTonoSecundario, 20) || '#71717A',
          visual_icono: text(data.visualIcono, 30) || 'landmark',
          visual_estilo: text(data.visualEstilo, 30) || 'glass',
          visual_mascara: text(data.visualMascara, 4) || null,
          updated_at: createdAt, ...actor,
          ...(previous.exists ? {} : { created_at: createdAt })
        }, { merge: true });
      });
      return { ok: true, id, message: 'Cuenta guardada con historial preservado.' };
    }

    if (action === 'fin.account.reconcile') {
      const accountId = text(data.cuentaId || entityId, 160);
      const reason = text(data.motivo, 500);
      if (!accountId || !reason) throw new Error('La cuenta y el motivo de conciliacion son obligatorios.');
      const target = integer(data.saldoObjetivoCentavos, 'saldo objetivo', Number.MIN_SAFE_INTEGER);
      const accountRef = d.collection('fin_accounts').doc(accountId);
      const movementId = uuid();
      const movementRef = d.collection('fin_movements').doc(movementId);
      let difference = 0;
      await d.runTransaction(async transaction => {
        const accountDoc = await transaction.get(accountRef);
        if (!accountDoc.exists || accountDoc.data().business_id !== ctx.businessId) throw new Error('La cuenta financiera no existe.');
        const current = Number(accountDoc.data().saldo_actual_centavos ?? accountDoc.data().saldo_inicial_centavos ?? 0);
        difference = target - current;
        transaction.create(movementRef, {
          business_id: ctx.businessId, tipo: difference >= 0 ? 'ajuste_positivo' : 'ajuste_negativo',
          fecha: text(data.fecha, 10) || createdAt.slice(0, 10), hora: createdAt.slice(11, 19),
          monto_centavos: Math.abs(difference), cuenta_id: accountId,
          descripcion: 'Conciliacion de saldo', nota: reason,
          referencia: `CONC-${createdAt.replace(/\D/g, '').slice(0, 14)}`,
          origen: 'panel', estado: 'registrado', conciliado: true,
          saldo_anterior_centavos: current, saldo_resultante_centavos: target,
          afecta_resultado: false, created_at: createdAt, updated_at: createdAt, ...actor
        });
        transaction.update(accountRef, { saldo_actual_centavos: target, reconciled_at: createdAt, updated_at: createdAt });
      });
      return { ok: true, id: movementId, difference, message: 'Saldo conciliado mediante asiento auditable.' };
    }

    if (action === 'fin.movement.create') {
      const accountId = text(data.cuentaId, 160);
      const type = text(data.tipo, 40).toLowerCase();
      const amount = integer(data.montoCentavos, 'monto', 1);
      const signed = financeSignedAmount(type, amount);
      const accountRef = d.collection('fin_accounts').doc(accountId);
      const movementId = text(entityId, 160) || uuid();
      const movementRef = d.collection('fin_movements').doc(movementId);
      await d.runTransaction(async transaction => {
        const accountDoc = await transaction.get(accountRef);
        if (!accountDoc.exists || accountDoc.data().business_id !== ctx.businessId) throw new Error('La cuenta financiera no existe.');
        const current = Number(accountDoc.data().saldo_actual_centavos ?? accountDoc.data().saldo_inicial_centavos ?? 0);
        transaction.create(movementRef, {
          business_id: ctx.businessId, tipo: type, fecha: text(data.fecha, 10) || createdAt.slice(0, 10),
          hora: createdAt.slice(11, 19), monto_centavos: amount, cuenta_id: accountId,
          categoria_id: text(data.categoriaId, 160) || null, payee: text(data.payee, 180) || null,
          descripcion: text(data.descripcion, 500) || type, nota: text(data.nota, 1200) || null,
          referencia: text(data.referencia, 180) || null, origen: 'panel', estado: 'registrado',
          conciliado: data.conciliado === true, afecta_resultado: data.afectaResultado !== false,
          saldo_anterior_centavos: current, saldo_resultante_centavos: current + signed,
          created_at: createdAt, updated_at: createdAt, ...actor
        });
        transaction.update(accountRef, { saldo_actual_centavos: current + signed, updated_at: createdAt });
      });
      return { ok: true, id: movementId, message: 'Movimiento financiero registrado.' };
    }

    if (action === 'fin.transfer.create') {
      const sourceId = text(data.cuentaOrigenId, 160);
      const targetId = text(data.cuentaDestinoId, 160);
      if (!sourceId || !targetId || sourceId === targetId) throw new Error('Selecciona dos cuentas diferentes.');
      const amount = integer(data.montoCentavos, 'monto', 1);
      const fee = integer(data.comisionCentavos || 0, 'comision', 0);
      const sourceRef = d.collection('fin_accounts').doc(sourceId);
      const targetRef = d.collection('fin_accounts').doc(targetId);
      const movementId = uuid();
      await d.runTransaction(async transaction => {
        const [sourceDoc, targetDoc] = await Promise.all([transaction.get(sourceRef), transaction.get(targetRef)]);
        if (!sourceDoc.exists || !targetDoc.exists || sourceDoc.data().business_id !== ctx.businessId || targetDoc.data().business_id !== ctx.businessId) {
          throw new Error('Las cuentas de la transferencia no son validas.');
        }
        const sourceBalance = Number(sourceDoc.data().saldo_actual_centavos ?? sourceDoc.data().saldo_inicial_centavos ?? 0);
        const targetBalance = Number(targetDoc.data().saldo_actual_centavos ?? targetDoc.data().saldo_inicial_centavos ?? 0);
        transaction.create(d.collection('fin_movements').doc(movementId), {
          business_id: ctx.businessId, tipo: 'transferencia', fecha: text(data.fecha, 10) || createdAt.slice(0, 10),
          hora: createdAt.slice(11, 19), monto_centavos: amount, comision_centavos: fee,
          cuenta_id: sourceId, cuenta_destino_id: targetId,
          descripcion: text(data.descripcion, 500) || 'Transferencia entre cuentas', nota: text(data.nota, 1200) || null,
          origen: 'panel', estado: 'registrado', conciliado: true, afecta_resultado: false,
          created_at: createdAt, updated_at: createdAt, ...actor
        });
        transaction.update(sourceRef, { saldo_actual_centavos: sourceBalance - amount - fee, updated_at: createdAt });
        transaction.update(targetRef, { saldo_actual_centavos: targetBalance + amount, updated_at: createdAt });
      });
      return { ok: true, id: movementId, message: 'Transferencia registrada sin duplicar patrimonio.' };
    }

    if (action === 'fin.category.upsert') {
      const id = text(entityId, 160) || uuid();
      await d.collection('fin_categories').doc(id).set({
        business_id: ctx.businessId, nombre: text(data.nombre, 120), tipo: text(data.tipo, 30),
        categoria_padre_id: text(data.categoriaPadreId, 160) || null, orden: Number(data.orden || 0),
        origen: 'panel', estado: 'activa', updated_at: createdAt, ...actor
      }, { merge: true });
      return { ok: true, id, message: 'Categoria guardada.' };
    }

    if (action === 'fin.movement.cancel' || action === 'fin.movement.restore') {
      const id = text(entityId, 160);
      const ref = d.collection('fin_movements').doc(id);
      const restoring = action.endsWith('.restore');
      await d.runTransaction(async transaction => {
        const movement = await transaction.get(ref);
        if (!movement.exists || movement.data().business_id !== ctx.businessId) throw new Error('El movimiento no existe.');
        const row = movement.data();
        const alreadyActive = row.estado !== 'anulado';
        if (alreadyActive === restoring) return;
        const amount = Number(row.monto_centavos || 0);
        const accountRef = d.collection('fin_accounts').doc(row.cuenta_id);
        const account = await transaction.get(accountRef);
        if (!account.exists || account.data().business_id !== ctx.businessId) throw new Error('La cuenta del movimiento no existe.');
        const current = Number(account.data().saldo_actual_centavos || 0);
        if (row.tipo === 'transferencia' && row.cuenta_destino_id) {
          const targetRef = d.collection('fin_accounts').doc(row.cuenta_destino_id);
          const target = await transaction.get(targetRef);
          if (!target.exists || target.data().business_id !== ctx.businessId) throw new Error('La cuenta destino no existe.');
          const fee = Number(row.comision_centavos || 0);
          const direction = restoring ? -1 : 1;
          transaction.update(accountRef, { saldo_actual_centavos: current + direction * (amount + fee), updated_at: createdAt });
          transaction.update(targetRef, { saldo_actual_centavos: Number(target.data().saldo_actual_centavos || 0) - direction * amount, updated_at: createdAt });
        } else {
          const signed = financeSignedAmount(String(row.tipo || ''), amount);
          const delta = restoring ? signed : -signed;
          transaction.update(accountRef, { saldo_actual_centavos: current + delta, updated_at: createdAt });
        }
        transaction.update(ref, { estado: restoring ? 'registrado' : 'anulado',
          motivo_anulacion: restoring ? null : text(data.motivo, 500), updated_at: createdAt });
      });
      return { ok: true, id, message: restoring ? 'Movimiento restaurado.' : 'Movimiento anulado sin borrarlo.' };
    }

    if (action === 'fin.card.upsert') {
      const id = text(entityId || data.cuentaId, 160);
      if (!id) throw new Error('Selecciona la cuenta de tarjeta.');
      await d.collection('fin_cards').doc(id).set({
        business_id: ctx.businessId, cuenta_id: id, cuenta_pago_id: text(data.cuentaPagoId, 160) || null,
        dia_corte: Number(data.diaCorte || 30), dia_pago: Number(data.diaPago || 5),
        limite_credito_centavos: integer(data.limiteCreditoCentavos || 0, 'limite', 0),
        color: text(data.color, 20) || '#18181B', metodo_visualizacion: text(data.metodoVisualizacion, 30) || 'al_comprar',
        updated_at: createdAt, ...actor
      }, { merge: true });
      return { ok: true, id, message: 'Tarjeta configurada.' };
    }

    if (action === 'fin.card.payment') {
      return firebaseAdminAction(ctx, 'fin.transfer.create', null, {
        ...data, descripcion: data.nota || 'Pago de tarjeta', comisionCentavos: 0
      });
    }

    if (action === 'fin.budget.upsert') {
      const id = text(entityId, 160) || uuid();
      await d.collection('fin_budgets').doc(id).set({
        business_id: ctx.businessId, categoria_id: text(data.categoriaId, 160), periodo: text(data.periodo, 30),
        periodo_inicio: text(data.periodoInicio, 10), monto_centavos: integer(data.montoCentavos, 'monto', 1),
        alerta_porcentaje: Math.max(1, Math.min(100, Number(data.alertaPorcentaje || 80))), estado: 'activo',
        updated_at: createdAt, ...actor
      }, { merge: true });
      return { ok: true, id, message: 'Presupuesto guardado.' };
    }

    if (action === 'fin.currency.upsert') {
      const code = text(data.codigo, 8).toUpperCase();
      const id = text(entityId, 160) || code;
      if (!code) throw new Error('El codigo de moneda es obligatorio.');
      await d.collection('fin_currencies').doc(id).set({
        business_id: ctx.businessId, codigo: code, nombre: text(data.nombre, 120), simbolo: text(data.simbolo, 12),
        tasa_a_principal: Number(data.tasaAPrincipal || 1), principal: data.principal === true, activa: data.activa !== false,
        updated_at: createdAt, ...actor
      }, { merge: true });
      return { ok: true, id, message: 'Divisa guardada.' };
    }

    if (action === 'fin.preferences.upsert') {
      const id = ctx.businessId;
      await d.collection('fin_preferences').doc(id).set({
        business_id: ctx.businessId, moneda_principal: text(data.monedaPrincipal, 8) || 'DOP',
        periodo_dashboard: text(data.periodoDashboard, 20) || 'mensual',
        cuenta_gasto_default_id: text(data.cuentaGastoDefaultId, 160) || null,
        cuenta_ingreso_default_id: text(data.cuentaIngresoDefaultId, 160) || null,
        locale: text(data.locale, 20) || 'es-DO', semana_inicia: Number(data.semanaInicia || 1),
        updated_at: createdAt, ...actor
      }, { merge: true });
      return { ok: true, id, message: 'Preferencias financieras guardadas.' };
    }

    if (action === 'fin.pending_transfer.create') {
      const id = text(entityId, 160) || uuid();
      await d.collection('fin_pending_transfers').doc(id).set({
        business_id: ctx.businessId, id, cuenta_id: text(data.cuentaId, 160),
        direccion: data.direccion === 'salida' ? 'salida' : 'entrada',
        monto_centavos: integer(data.montoCentavos, 'monto', 1), fecha_origen: text(data.fechaOrigen, 10),
        fecha_esperada: text(data.fechaEsperada, 10), descripcion: text(data.descripcion, 500),
        referencia: text(data.referencia, 180) || null, estado: 'pendiente',
        created_at: createdAt, updated_at: createdAt, ...actor
      }, { merge: true });
      return { ok: true, id, message: 'Transferencia pendiente registrada.' };
    }

    if (action === 'fin.pending_transfer.confirm' || action === 'fin.pending_transfer.cancel') {
      const id = text(entityId, 160);
      if (!id) throw new Error('Selecciona la transferencia pendiente.');
      await d.collection('fin_pending_transfers').doc(id).set({
        estado: action.endsWith('.confirm') ? 'confirmada' : 'cancelada', nota_cierre: text(data.nota, 1200) || null,
        updated_at: createdAt, ...actor
      }, { merge: true });
      return { ok: true, id, message: action.endsWith('.confirm') ? 'Transferencia confirmada.' : 'Transferencia cancelada.' };
    }

    if (action === 'fin.commitment.upsert') {
      const id = text(entityId, 160) || uuid();
      await d.collection('fin_commitments').doc(id).set({
        business_id: ctx.businessId, id, nombre: text(data.nombre, 180), tipo: text(data.tipo, 40),
        frecuencia: text(data.frecuencia, 40), monto_centavos: integer(data.montoCentavos || 0, 'monto', 0),
        proximo_vencimiento: data.proximoVencimiento || null, dia_semana: data.diaSemana ?? null,
        dia_mes_1: data.diaMes1 ?? null, dia_mes_2: data.diaMes2 ?? null, intervalo_dias: data.intervaloDias ?? null,
        fecha_inicio: data.fechaInicio || null, saldo_inicial_registrado_centavos: data.saldoInicialRegistradoCentavos ?? null,
        saldo_pendiente_centavos: data.saldoPendienteCentavos ?? null,
        capital_pendiente_centavos: data.capitalPendienteCentavos ?? null,
        cargos_intereses_pendientes_centavos: data.cargosInteresesPendientesCentavos ?? null,
        cuotas_totales: data.cuotasTotales ?? null, cuota_actual: data.cuotaActual ?? null,
        cuotas_pagadas: Number(data.cuotasPagadas || 0), monto_variable: data.montoVariable === true,
        capital_es_variable: data.capitalEsVariable === true, activo: data.activo !== false,
        nota: text(data.nota, 1400) || null, metadata: data.metadata || {}, updated_at: createdAt, ...actor
      }, { merge: true });
      return { ok: true, id, message: 'Compromiso guardado.' };
    }

    if (action === 'fin.commitment.payment') {
      const commitmentId = text(entityId, 160);
      const amount = integer(data.montoCentavos, 'monto', 1);
      const id = uuid();
      const commitmentRef = d.collection('fin_commitments').doc(commitmentId);
      await d.runTransaction(async transaction => {
        const commitment = await transaction.get(commitmentRef);
        if (!commitment.exists || commitment.data().business_id !== ctx.businessId) throw new Error('El compromiso no existe.');
        let accountRef = null;
        let accountBalance = 0;
        if (data.cuentaId) {
          accountRef = d.collection('fin_accounts').doc(text(data.cuentaId, 160));
          const account = await transaction.get(accountRef);
          if (!account.exists || account.data().business_id !== ctx.businessId) throw new Error('La cuenta de pago no existe.');
          accountBalance = Number(account.data().saldo_actual_centavos || 0);
        }
        const balance = Math.max(0, Number(commitment.data().saldo_pendiente_centavos || 0) - Number(data.capitalCentavos || amount));
        transaction.create(d.collection('fin_commitment_payments').doc(id), {
          business_id: ctx.businessId, compromiso_id: commitmentId, monto_centavos: amount,
          capital_centavos: Number(data.capitalCentavos || 0), interes_centavos: Number(data.interesCentavos || 0),
          cargos_centavos: Number(data.cargosCentavos || 0), cuenta_id: text(data.cuentaId, 160) || null,
          numero_cuota: data.numeroCuota ?? null, cuotas_aplicadas: Number(data.cuotasAplicadas || 1),
          proximo_vencimiento: data.proximoVencimiento || null, fecha: text(data.fecha, 10) || createdAt.slice(0, 10),
          referencia: text(data.referencia, 180) || null, nota: text(data.nota, 1200) || null,
          created_at: createdAt, ...actor
        });
        transaction.update(commitmentRef, { saldo_pendiente_centavos: balance,
          proximo_vencimiento: data.proximoVencimiento || commitment.data().proximo_vencimiento || null,
          updated_at: createdAt });
        if (accountRef) transaction.update(accountRef, { saldo_actual_centavos: accountBalance - amount, updated_at: createdAt });
      });
      return { ok: true, id, message: 'Pago del compromiso registrado.' };
    }

    if (action === 'fin.commitment.deactivate') {
      const id = text(entityId, 160);
      await d.collection('fin_commitments').doc(id).set({ activo: false, motivo_desactivacion: text(data.motivo, 500), updated_at: createdAt, ...actor }, { merge: true });
      return { ok: true, id, message: 'Compromiso desactivado sin borrar pagos.' };
    }

    if (action === 'device.status') {
      const id = text(entityId, 160);
      if (!id) throw new Error('Selecciona el dispositivo.');
      await d.collection('devices').doc(id).set({ status: data.status === 'bloqueada' ? 'bloqueada' : 'activa', updated_at: createdAt, ...actor }, { merge: true });
      return { ok: true, id, message: data.status === 'bloqueada' ? 'Dispositivo bloqueado.' : 'Dispositivo reactivado.' };
    }

    throw new Error(`La operacion ${action} aun no esta migrada al backend Firebase seguro.`);
  }

  const DcarelaFirebase = {
    get isAvailable() {
      if (!initialized) initFirebase();
      return !!(app && auth && db);
    },
    get config() {
      return cfg;
    },
    get app() {
      if (!initialized) initFirebase();
      return app;
    },
    get auth() {
      if (!initialized) initFirebase();
      return auth;
    },
    get db() {
      if (!initialized) initFirebase();
      return db;
    },

    // Authentication methods
    async signIn(email, password) {
      const { auth: a } = initFirebase();
      if (!a) throw new Error('Firebase Auth no inicializado.');
      return a.signInWithEmailAndPassword(email.trim(), password);
    },

    async signOut() {
      const { auth: a } = initFirebase();
      if (!a) return;
      return a.signOut();
    },

    async updatePassword(password) {
      const { auth: a } = initFirebase();
      const user = a?.currentUser;
      if (!user) throw new Error('La sesion Firebase vencio. Inicia sesion nuevamente.');
      return user.updatePassword(password);
    },

    async getIdToken(forceRefresh = false) {
      const { auth: a } = initFirebase();
      const user = a?.currentUser;
      if (!user) throw new Error('La sesion Firebase vencio. Inicia sesion nuevamente.');
      return user.getIdToken(forceRefresh);
    },

    getCurrentUser() {
      const { auth: a } = initFirebase();
      return a ? a.currentUser : null;
    },

    onAuthStateChanged(callback) {
      const { auth: a } = initFirebase();
      if (!a) return () => {};
      return a.onAuthStateChanged(callback);
    },

    waitForAuthState(timeoutMs = 3000) {
      const { auth: a } = initFirebase();
      if (!a) return Promise.resolve(null);
      return new Promise(resolve => {
        let settled = false;
        let timer = null;
        let unsubscribe = () => {};
        const finish = user => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          unsubscribe();
          resolve(user || null);
        };
        timer = setTimeout(() => finish(a.currentUser), Math.max(250, timeoutMs));
        unsubscribe = a.onAuthStateChanged(finish, () => finish(null));
      });
    },

    // Firestore Generic CRUD
    async getCollection(collectionName, conditions = []) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      let q = d.collection(collectionName);
      for (const cond of conditions) {
        if (Array.isArray(cond) && cond.length === 3) {
          q = q.where(cond[0], cond[1], cond[2]);
        }
      }
      const snap = await q.get();
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getDocument(collectionName, docId) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      const doc = await d.collection(collectionName).doc(docId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    },

    async setDocument(collectionName, docId, data, merge = true) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      await d.collection(collectionName).doc(docId).set({
        ...data,
        updated_at: new Date().toISOString()
      }, { merge });
      return { id: docId, ...data };
    },

    async addDocument(collectionName, data) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      const ref = await d.collection(collectionName).add({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return { id: ref.id, ...data };
    },

    async updateDocument(collectionName, docId, data) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      await d.collection(collectionName).doc(docId).update({
        ...data,
        updated_at: new Date().toISOString()
      });
      return { id: docId, ...data };
    },

    async deleteDocument(collectionName, docId) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      return d.collection(collectionName).doc(docId).delete();
    },

    listenCollection(collectionName, conditions = [], callback) {
      const { db: d } = initFirebase();
      if (!d) return () => {};
      let q = d.collection(collectionName);
      for (const cond of conditions) {
        if (Array.isArray(cond) && cond.length === 3) {
          q = q.where(cond[0], cond[1], cond[2]);
        }
      }
      return q.onSnapshot(snap => {
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(items);
      }, err => {
        console.warn(`Firestore listener error on ${collectionName}:`, err);
      });
    },

    async acknowledgeAlerts(ids, businessId) {
      const ctx = await firebaseContext(businessId, 'admin');
      const unique = [...new Set((ids || []).filter(Boolean).map(id => text(id, 160)))];
      if (!unique.length) return { ok: true, count: 0 };
      const batch = ctx.d.batch();
      const at = nowIso();
      unique.forEach(id => batch.update(ctx.d.collection('system_alerts').doc(id), {
        acknowledged_at: at,
        acknowledged_by: ctx.user.uid,
        updated_at: at
      }));
      await batch.commit();
      return { ok: true, count: unique.length };
    },

    // Domain Specific Helpers
    async getBusinesses() {
      return this.getCollection('businesses', [['active', '==', true]]);
    },

    async getMembershipsForUser(userId) {
      if (!userId) return [];
      const membership = await this.getDocument('business_members', userId);
      if (!membership || membership.active === false) return [];
      return (membership.business_ids || []).filter(Boolean).map(businessId => ({
        id: `${userId}_${businessId}`,
        user_id: userId,
        business_id: businessId,
        role: membership.roles?.[businessId] || membership.role || 'viewer',
        active: true
      }));
    },

    async getBusinessesByIds(ids) {
      const unique = [...new Set((ids || []).filter(Boolean))];
      const rows = await Promise.all(unique.map(id => this.getDocument('businesses', id)));
      return rows.filter(item => item && item.active !== false);
    },

    async getProducts(businessId = 'dcarela') {
      return this.getCollection('products', [['business_id', '==', businessId]]);
    },

    async getCategories(businessId = 'dcarela') {
      return this.getCollection('categories', [['business_id', '==', businessId]]);
    },

    async getProductCombos(businessId = 'dcarela') {
      return this.getCollection('product_combos', [['business_id', '==', businessId]]);
    },

    async getClients(businessId = 'dcarela') {
      return this.getCollection('clients', [['business_id', '==', businessId]]);
    },

    async getSyncEvents(businessId = 'dcarela') {
      const current = await this.getCollection('sync_events', [['business_id', '==', businessId]]);
      let archived = eventArchiveCache.get(businessId);
      if (!archived || Date.now() - archived.at > 5 * 60 * 1000) {
        const chunks = await this.getCollection('sync_event_archives', [['business_id', '==', businessId]]);
        archived = {
          at: Date.now(),
          events: chunks.flatMap(chunk => Array.isArray(chunk.events) ? chunk.events : [])
        };
        eventArchiveCache.set(businessId, archived);
      }
      const merged = new Map();
      archived.events.forEach(event => merged.set(event.event_id || event.id, event));
      current.forEach(event => merged.set(event.event_id || event.id, event));
      return [...merged.values()].sort((a, b) => String(b.received_at_cloud || b.created_at_local || '')
        .localeCompare(String(a.received_at_cloud || a.created_at_local || '')));
    },

    async getSales(businessId = 'dcarela', limit = 100) {
      const rows = await this.getCollection('sales', [['business_id', '==', businessId]]);
      return rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, limit);
    },

    async getCashShifts(businessId = 'dcarela', limit = 50) {
      const rows = await this.getCollection('cash_shifts', [['business_id', '==', businessId]]);
      return rows.sort((a, b) => String(b.opened_at || '').localeCompare(String(a.opened_at || '')))
        .slice(0, limit);
    },

    async getFinanceAccounts(businessId = 'dcarela') {
      return this.getCollection('fin_accounts', [['business_id', '==', businessId]]);
    },

    async getFinanceCategories(businessId = 'dcarela') {
      return this.getCollection('fin_categories', [['business_id', '==', businessId]]);
    },

    async getFinanceCards(businessId = 'dcarela') {
      return this.getCollection('fin_cards', [['business_id', '==', businessId]]);
    },

    async getFinanceBudgets(businessId = 'dcarela') {
      return this.getCollection('fin_budgets', [['business_id', '==', businessId]]);
    },

    async getFinancePreferences(businessId = 'dcarela') {
      return this.getDocument('fin_preferences', businessId);
    },

    async getFinanceCurrencies(businessId = 'dcarela') {
      return this.getCollection('fin_currencies', [['business_id', '==', businessId]]);
    },

    async getFinanceCommitments(businessId = 'dcarela') {
      return this.getCollection('fin_commitments', [['business_id', '==', businessId]]);
    },

    async getFinanceCommitmentPayments(businessId = 'dcarela') {
      return this.getCollection('fin_commitment_payments', [['business_id', '==', businessId]]);
    },

    async getFinancePendingTransfers(businessId = 'dcarela') {
      return this.getCollection('fin_pending_transfers', [['business_id', '==', businessId]]);
    },

    async getFinanceMovements(businessId = 'dcarela', month = null) {
      const [financeResult, ledgerResult] = await Promise.allSettled([
        this.getCollection('fin_movements', [['business_id', '==', businessId]]),
        this.getCollection('sync_events', [
          ['business_id', '==', businessId],
          ['event_type', '==', 'LedgerMovimientoRegistrado']
        ])
      ]);
      const rows = financeResult.status === 'fulfilled' ? financeResult.value : [];
      const ledgerRows = ledgerResult.status === 'fulfilled' ? ledgerResult.value.map(event => {
        const payload = event.payload || {};
        return {
          id: payload.ledgerId || event.entity_id || event.event_id || event.id,
          business_id: event.business_id || businessId,
          tipo: payload.tipo || 'GASTO',
          categoria: payload.categoria || '',
          descripcion: payload.descripcion || event.event_type || 'Movimiento de caja Windows',
          monto_centavos: Number(payload.importeDopCentavos ?? payload.importe_dop_centavos ?? 0),
          importe_dop_centavos: Number(payload.importeDopCentavos ?? payload.importe_dop_centavos ?? 0),
          moneda: payload.monedaOriginal || 'DOP',
          estado: payload.estado || 'confirmado',
          fecha: payload.fechaEfectiva || event.created_at_local || event.received_at_cloud || '',
          observaciones: payload.observaciones || '',
          source: 'pos_sync_event'
        };
      }) : [];
      const merged = new Map();
      [...rows, ...ledgerRows].forEach(item => merged.set(item.id, item));
      const filtered = month ? [...merged.values()].filter(item => String(item.fecha || '').startsWith(`${month}-`)) : [...merged.values()];
      if (ledgerResult.status === 'rejected') {
        Object.defineProperty(filtered, 'partial_error', {
          value: 'La fuente del ledger Windows no estuvo disponible en Firebase.', enumerable: false
        });
      }
      return filtered.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    },

    /**
     * Caja web transaccional sobre Firestore. Las reglas remotas vuelven a
     * comprobar membresia y rol; el cliente no obtiene privilegios por ocultar
     * o habilitar botones. Cada operacion genera un sync_event idempotente que
     * la caja Windows puede aplicar sin perder el historial.
     */
    async webSaleAction(action, businessId, role, data = {}, requestId = null) {
      const ctx = await firebaseContext(businessId, role);
      const permissions = permissionsForRole(ctx.role);
      if (action === 'status') {
        const shift = await openWebShift(ctx);
        return {
          ok: true, role: ctx.role, permissions, shift,
          summary: webShiftSummary(shift),
          capabilities: [...WEB_SALE_CAPABILITIES],
          device_id: `web-${ctx.user.uid}`,
        };
      }
      if (!permissions.canUse) throw new Error('Tu cuenta no tiene permiso para usar la Caja virtual.');
      const id = text(requestId, 80) || uuid();
      const eventRef = ctx.d.collection('sync_events').doc(id);

      if (action === 'shift.open') {
        const current = await openWebShift(ctx);
        if (current) return { ok: true, shift: current, deduplicated: true };
        const openedAt = nowIso();
        const shiftId = uuid();
        const shift = {
          id: shiftId, business_id: ctx.businessId, status: 'open',
          cajaId: `web-${ctx.user.uid}`, cajaNombre: 'Caja web',
          opened_by_uid: ctx.user.uid, opened_by_email: ctx.user.email || '',
          montoAperturaCentavos: integer(data.montoAperturaCentavos || 0, 'monto de apertura', 0),
          saleCount: 0, grossSalesCentavos: 0, cashSalesCentavos: 0,
          customerCashPaymentsCentavos: 0, entriesCentavos: 0,
          exitsCentavos: 0, cashRefundsCentavos: 0,
          abiertoEn: openedAt, opened_at: openedAt, updated_at: openedAt
        };
        const payload = {
          turnoId: shiftId, cajaId: shift.cajaId, cajaNombre: shift.cajaNombre,
          montoAperturaCentavos: shift.montoAperturaCentavos, abiertoEn: openedAt,
          usuarioId: ctx.user.uid, usuarioNombre: ctx.user.email || 'Caja web Firebase'
        };
        await ctx.d.runTransaction(async transaction => {
          const previous = await transaction.get(eventRef);
          if (previous.exists) return;
          transaction.create(ctx.d.collection('cash_shifts').doc(shiftId), shift);
          transaction.create(eventRef, eventDocument(ctx, id, 'CajaAbierta', 'turnos', shiftId, payload, openedAt));
        });
        return { ok: true, shift };
      }

      if (action === 'sale.create') return createFirebaseSale(ctx, data, id);

      const shift = await openWebShift(ctx);
      if (!shift) throw new Error('No hay un turno web abierto.');

      if (action === 'cash.move') {
        const type = data.tipo === 'salida' ? 'SalidaEfectivo' : 'EntradaEfectivo';
        const amount = integer(data.montoCentavos, 'monto', 1);
        const createdAt = nowIso();
        const movementId = uuid();
        const payload = {
          movimientoId: movementId, turnoId: shift.id, montoCentavos: amount,
          motivo: text(data.motivo, 500) || (type === 'SalidaEfectivo' ? 'Salida desde caja web' : 'Entrada desde caja web'),
          fecha: createdAt, usuarioId: ctx.user.uid, usuarioNombre: ctx.user.email || 'Caja web Firebase'
        };
        await ctx.d.runTransaction(async transaction => {
          const previous = await transaction.get(eventRef);
          if (previous.exists) return;
          transaction.create(eventRef, eventDocument(ctx, id, type, 'movimientos_caja', movementId, payload, createdAt));
          transaction.update(ctx.d.collection('cash_shifts').doc(shift.id), {
            [type === 'SalidaEfectivo' ? 'exitsCentavos' : 'entriesCentavos']:
              firebase.firestore.FieldValue.increment(amount),
            updated_at: createdAt,
          });
        });
        return { ok: true, movement: payload };
      }

      if (action === 'shift.close') {
        const events = await this.getSyncEvents(ctx.businessId);
        const shiftEvents = events.filter(item => item.payload?.turnoId === shift.id);
        const sales = shiftEvents.filter(item => item.event_type === 'VentaCobrada');
        const cancelled = new Set(shiftEvents.filter(item => item.event_type === 'VentaCancelada')
          .map(item => item.payload?.ventaId).filter(Boolean));
        const cash = sales.filter(item => !cancelled.has(item.payload?.ventaId)).reduce((sum, item) => {
          return sum + (item.payload?.pagos || []).filter(payment => payment.metodo === 'efectivo')
            .reduce((part, payment) => part + Number(payment.montoCentavos || 0), 0);
        }, 0);
        const tips = sales.filter(item => !cancelled.has(item.payload?.ventaId))
          .reduce((sum, item) => sum + Number(item.payload?.propinaCentavos || 0), 0);
        const entries = shiftEvents.filter(item => item.event_type === 'EntradaEfectivo')
          .reduce((sum, item) => sum + Number(item.payload?.montoCentavos || 0), 0);
        const exits = shiftEvents.filter(item => item.event_type === 'SalidaEfectivo')
          .reduce((sum, item) => sum + Number(item.payload?.montoCentavos || 0), 0);
        const expected = Number(shift.montoAperturaCentavos || 0) + cash + tips + entries - exits;
        const counted = integer(data.efectivoContadoCentavos, 'efectivo contado', 0);
        const closedAt = nowIso();
        const payload = {
          turnoId: shift.id, cajaId: shift.cajaId, cajaNombre: shift.cajaNombre,
          montoAperturaCentavos: Number(shift.montoAperturaCentavos || 0),
          ventasEfectivoCentavos: cash, propinasCentavos: tips,
          entradasCentavos: entries, salidasCentavos: exits,
          efectivoEsperadoCentavos: expected, efectivoContadoCentavos: counted,
          diferenciaCentavos: counted - expected,
          conteoDenominaciones: Array.isArray(data.conteoDenominaciones) ? data.conteoDenominaciones : [],
          nota: text(data.nota, 1000) || null, abiertoEn: shift.abiertoEn || shift.opened_at,
          cerradoEn: closedAt, usuarioId: ctx.user.uid, usuarioNombre: ctx.user.email || 'Caja web Firebase'
        };
        await ctx.d.runTransaction(async transaction => {
          const previous = await transaction.get(eventRef);
          if (previous.exists) return;
          transaction.update(ctx.d.collection('cash_shifts').doc(shift.id), {
            status: 'closed', cerradoEn: closedAt, closed_at: closedAt,
            efectivoEsperadoCentavos: expected, efectivoContadoCentavos: counted,
            diferenciaCentavos: counted - expected, updated_at: closedAt
          });
          transaction.create(eventRef, eventDocument(ctx, id, 'CajaCerrada', 'turnos', shift.id, payload, closedAt));
        });
        return { ok: true, summary: payload };
      }

      if (action === 'sale.cancel') {
        if (!permissions.canCancelSale) throw new Error('Tu cuenta no puede anular ventas.');
        const saleId = text(data.ventaId, 160);
        const reason = text(data.motivo, 500);
        if (!saleId || !reason) throw new Error('La venta y el motivo de anulacion son obligatorios.');
        const saleRef = ctx.d.collection('sales').doc(saleId);
        const createdAt = nowIso();
        await ctx.d.runTransaction(async transaction => {
          const [previous, saleDoc] = await Promise.all([transaction.get(eventRef), transaction.get(saleRef)]);
          if (previous.exists) return;
          if (!saleDoc.exists || saleDoc.data().business_id !== ctx.businessId) throw new Error('La venta no existe en esta sucursal.');
          const sale = saleDoc.data();
          if (sale.status === 'cancelled') throw new Error('La venta ya esta anulada.');
          const inventoryLines = (sale.lineas || []).filter(line => line.usaInventario
            && !String(line.productoId || '').startsWith('comun-'));
          const productRefs = inventoryLines.map(line => ctx.d.collection('products').doc(line.productoId));
          const credit = (sale.pagos || []).filter(item => item.metodo === 'credito')
            .reduce((sum, item) => sum + Number(item.montoCentavos || 0), 0);
          const clientRef = credit && sale.clienteId ? ctx.d.collection('clients').doc(sale.clienteId) : null;
          // Firestore exige completar todas las lecturas antes de la primera
          // escritura dentro de una transaccion. Esto evita anulaciones
          // parciales cuando la venta mezcla inventario y credito.
          const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
          const clientDoc = clientRef ? await transaction.get(clientRef) : null;
          productDocs.forEach((productDoc, index) => {
            if (!productDoc.exists) return;
            transaction.update(productRefs[index], {
              stock: Number(productDoc.data().stock || 0) + Number(inventoryLines[index].cantidad || 0), updated_at: createdAt
            });
          });
          if (clientRef && clientDoc?.exists) {
            transaction.update(clientRef, {
              saldoCentavos: Math.max(0, Number(clientDoc.data().saldoCentavos || 0) - credit), updated_at: createdAt
            });
          }
          const payload = {
            ventaId: saleId, folio: sale.folio, motivo: reason, anuladaEn: createdAt,
            usuarioId: ctx.user.uid, usuarioNombre: ctx.user.email || 'Caja web Firebase'
          };
          transaction.update(saleRef, { status: 'cancelled', cancel_reason: reason, cancelled_at: createdAt, updated_at: createdAt });
          if (sale.turnoId) {
            transaction.update(ctx.d.collection('cash_shifts').doc(sale.turnoId), {
              saleCount: firebase.firestore.FieldValue.increment(-1),
              grossSalesCentavos: firebase.firestore.FieldValue.increment(-Number(sale.totalCobradoCentavos || 0)),
              cashSalesCentavos: firebase.firestore.FieldValue.increment(-Number((sale.pagos || [])
                .filter(item => item.metodo === 'efectivo')
                .reduce((sum, item) => sum + Number(item.montoCentavos || 0), 0))),
              updated_at: createdAt,
            });
          }
          transaction.create(eventRef, eventDocument(ctx, id, 'VentaCancelada', 'ventas', saleId, payload, createdAt));
        });
        return { ok: true, message: 'Venta anulada y enviada a sincronizacion.' };
      }

      throw new Error(`Operacion de Caja virtual no admitida: ${action}.`);
    },

    async adminAction(action, businessId, role, entityId = null, data = {}) {
      const ctx = await firebaseContext(businessId, role);
      return firebaseAdminAction(ctx, action, entityId, data);
    }
  };

  window.DcarelaFirebase = DcarelaFirebase;
  window.dcInitFirebase = initFirebase;
})();
