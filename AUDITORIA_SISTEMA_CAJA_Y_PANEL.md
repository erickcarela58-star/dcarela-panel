# AUDITORÍA INTEGRAL: SISTEMA DE CAJA, TURNOS Y PANEL WEB
**Fecha de corte:** 2026-09-22T12:50:00-04:00  
**Negocio:** Central (`dcarela`) y Sucursal Plaza Artesanal (`plaza-artesanal`)  
**Propósito:** Documento canónico para asistentes automatizados, agentes de desarrollo y auditoría contable continua.

---

## 1. ESTADO CONSOLIDADO DE CUENTAS (22 DE SEPTIEMBRE DE 2026)

Los siguientes saldos han sido verificados, consolidados y auditados directamente contra Firestore de producción (`erikccarela`) y el motor contable `financeCore.effectiveAccountBalance`:

| Cuenta / Recurso | ID Firestore | Saldo Nominal | Saldo Efectivo | Estado Conciliación |
| :--- | :--- | :--- | :--- | :--- |
| **Banco Popular** | `786b5ffd-169c-40f6-8fbc-8f0e6bc69a02` | **RD$ 9,466.46** | **RD$ 9,466.46** | Conciliado (`2026-09-22T23:59:59-04:00`) |
| **Cuenta Corriente Qik** | `622ddedb-bf63-4b3b-a349-ab58762ab3e8` | **RD$ 26.69** | **RD$ 26.69** | Conciliado (`2026-09-22T23:59:59-04:00`) |
| **Efectivo Disponible** | `a8a05570-a058-4b59-935a-80a8e556d729` | **RD$ 41,480.00** | **RD$ 41,480.00** | Conciliado (`2026-09-22T23:59:59-04:00`) |
| **Tarjeta de Crédito Qik**| `d131e3d8-8fba-4602-9a96-badeec362451` | **RD$ 0.00 deuda** | **RD$ 0.00 deuda** | Saldo en cero, límite RD$ 10,000 disponible |
| **Efectivo Plaza Artesanal** | `plaza-artesanal-cash` | **RD$ 0.00** | **RD$ 0.00** | Operativo local |

> [!IMPORTANT]
> **Sumatoria de Efectivo Disponible Físico (Fuera de Gaveta):**
> La suma canónica declarada por el propietario: `22,500 + 2,600 + 80 + 5,600 + 6,700 + 4,000 = RD$ 41,480.00` (`4148000` centavos).
> Este saldo representa el dinero disponible consolidado y **no debe descontarse anticipadamente** ni confundirse con el fondo retenido en la gaveta del turno en curso.

---

## 2. AUDITORÍA DEL TURNO EN CURSO Y FLUJO DE CORTE

### 2.1 Datos del turno activo en producción
- **Turno ID:** `aea62762-a29a-4f7d-ae15-f41e1fef4d3a`
- **Caja:** Caja Principal (`caja-central-01`)
- **Cajera / Abierto por:** Ashley Brito (`opened_by_uid: 8lVpz...`)
- **Apertura:** `2026-09-22T13:03:02.000Z`
- **Fondo de apertura (Monto apertura):** RD$ 2,200.00 (`220000` centavos)
- **Ventas cobradas del turno:** 12 transacciones (RD$ 2,125.00 total bruto, de los cuales RD$ 2,025.00 en efectivo y RD$ 100.00 en transferencias bancarias).
- **Dinero físico actual en gaveta:** RD$ 2,200.00 (apertura) + RD$ 2,025.00 (efectivo ventas) = **RD$ 4,225.00**.

### 2.2 Flujo obligatorio al cerrar el turno (`CajaCerrada`)
1. **Conteo físico:** La cajera cuenta la gaveta total (esperado RD$ 4,225.00).
2. **Fondo de caja:** El monto de apertura (RD$ 2,200.00) permanece en gaveta como base para el siguiente turno.
3. **Efectivo a entregar (`efectivoAEntregarCentavos`):**
   $$\text{efectivoAEntregarCentavos} = \text{efectivoContadoCentavos} - \text{montoAperturaCentavos} = 4,225 - 2,200 = \text{RD\$ 2,025.00}$$
4. **Transferencia al disponible:** El webhook / Cloud Function `crmFinanceCut` y `processPanelCutEvent` ejecutan la transferencia interna del corte desde Gaveta/Caja Chica hacia `Efectivo Disponible` (`a8a05570-a058-4b59-935a-80a8e556d729`).
5. **Conciliación en WhatsApp / Panel:** El bot notifica al propietario el corte con el monto entregable real conciliado, sin usar valores fijos por defecto.

---

## 3. IRREGULARIDADES IDENTIFICADAS Y CORREGIDAS

### IRREGULARIDAD 1: Falta de `efectivoAEntregarCentavos` en evento `CajaCerrada`
- **Ubicación:** `firebase-adapter.js` (método `webSaleAction`, acción `shift.close`).
- **Problema detectado:** El payload generado para el evento `CajaCerrada` incluía `montoAperturaCentavos`, `ventasEfectivoCentavos`, `efectivoEsperadoCentavos` y `efectivoContadoCentavos`, pero omitía `efectivoAEntregarCentavos`. Los sistemas consumidores (Windows POS, Cloud Functions y Reportes) tenían que calcularlo o terminaban asumiendo el conteo total.
- **Corrección aplicada:** Se incorporó explícitamente en el payload del evento:
  ```javascript
  efectivoAEntregarCentavos: Math.max(0, counted - Number(shift.montoAperturaCentavos || 0))
  ```

### IRREGULARIDAD 2: Bloqueo administrativo en cierre de turnos ajenos
- **Ubicación:** `firebase-adapter.js` (línea 2428).
- **Problema detectado:** La validación transaccional `latest.data().opened_by_uid !== ctx.user.uid` arrojaba error fatal si el dueño o administrador intentaba cerrar o auditar el turno de un cajero que se marchó o cerró sesión en su equipo.
- **Corrección aplicada:** Se flexibilizó para que los roles `owner` y `admin` tengan permiso explícito de auditoría y cierre administrativo:
  ```javascript
  const isOwnerOrAdmin = ['owner', 'admin'].includes(String(ctx.role || '').toLowerCase());
  if (latest.data().opened_by_uid !== ctx.user.uid && !isOwnerOrAdmin) {
    throw new Error('El turno pertenece a otro usuario y solo un administrador puede cerrarlo.');
  }
  ```

### IRREGULARIDAD 3: Selección de turno en Caja Virtual web
- **Ubicación:** `firebase-adapter.js` (método `openWebShift`).
- **Problema detectado:** Si el administrador intentaba realizar una salida/entrada de efectivo o un cierre enviando `data.turnoId`, `openWebShift` ignoraba dicho parámetro y buscaba solo turnos abiertos por el UID del usuario logueado en la web, retornando `null` ("No hay un turno web abierto").
- **Corrección aplicada:** Se añadió soporte para `data.turnoId` explícito y fallback al turno activo de la sucursal cuando el usuario tiene privilegios de administración.

### IRREGULARIDAD 4: Fallbacks estáticos y omisión de `cutData.payload` en Cloud Functions
- **Ubicación:** `firebase-functions/src/whatsapp-cash-cuts.js` (`processPanelCutEvent`) y `firebase-functions/src/index.js` (`crmFinanceCut`).
- **Problema detectado:** Al activarse `crmFinanceCut` por creación de documento en `sync_events`, los datos reales del turno residen en el mapa anidado `eventData.payload`. Sin embargo, `processPanelCutEvent` leía campos en la raíz (`cutData.panel_transfer_amount_centavos`), por lo que al no encontrarlos utilizaba fallbacks fijos (`650000` = RD$ 6,500.00 y `1200000` = RD$ 12,000.00).
- **Corrección aplicada:** Se implementó desestructuración segura de `cutData.payload`:
  ```javascript
  const p = (typeof cutData.payload === 'object' && cutData.payload !== null) ? cutData.payload : cutData;
  const panelTransfer = Number(cutData.panel_transfer_amount_centavos ?? p.efectivoAEntregarCentavos ?? ...);
  const pettyBefore = Number(cutData.petty_cash_before_centavos ?? p.montoAperturaCentavos ?? ...);
  ```

### IRREGULARIDAD 5: Efectos de zona horaria y desfase en `reconciled_at`
- **Ubicación:** `finance-core.js` (`projectedLedgerDeltaForAccount`).
- **Problema detectado:** Si un movimiento carece de `source_timestamp` (ISO UTC completo), el motor recurre a `${item.fecha}T23:59:59-04:00` (lo que equivale a las `03:59:59Z` del día siguiente). Si `reconciled_at` se guardaba en UTC (`23:59:59Z`), el timestamp del movimiento resultaba posterior al corte de conciliación, provocando que los movimientos del día se restaran una segunda vez del saldo conciliado.
- **Regla establecida para asistentes:** Siempre registrar movimientos con `source_timestamp: new Date().toISOString()`, y registrar `reconciled_at` con fin de día en hora local dominicana (`2026-09-22T23:59:59-04:00` o `2026-09-23T03:59:59.999Z`).

### IRREGULARIDAD 6: Selector de ITBIS en transferencias y pagos de tarjeta
- **Ubicación:** `panel.js` (formularios de transferencia rápida, transferencia entre cuentas y pago de tarjeta).
- **Problema detectado:** No existía un botón interactivo para seleccionar la tasa del 0.20% (impuesto sobre transferencias y pagos bancarios en Rep. Dom.), causando que las transferencias registradas desde el panel se crearan sin el asiento de ITBIS correspondiente (ej. RD$ 16.20 por transferir RD$ 8,100.00).
- **Corrección aplicada:** Se implementó `bindTransferItbisOptions` con botones interactivos `Sin ITBIS` y `0.20%` que calculan y actualizan automáticamente el campo de comisión/ITBIS en centavos exactos.

### IRREGULARIDAD 7: Latencia extrema en carga del panel de Finanzas y Resumen
- **Ubicación:** `panel.js` y `firebase-adapter.js`.
- **Problema detectado:** Al navegar a Finanzas o Resumen, el sistema realizaba descargas repetidas de todos los eventos históricos (`sync_events`) y colecciones completas sin caché en memoria, tardando más de 12 segundos en terminales móviles o con conexiones lentas.
- **Corrección aplicada:** Se implementó bypass de archivos históricos en consultas activas, caché en memoria de 60 segundos por rango de fechas (`finStateCache`, `reporteViewCache`, `cajaViewCache`) e invalidación reactiva inmediata solo ante nuevos eventos en tiempo real.

### IRREGULARIDAD 8: Regularización de Suscripciones Históricas sin Alterar Saldos Conciliados
- **Ubicación:** `whatsapp-finance-parser.js`, `whatsapp-owner-assistant.js`, `expenses` y `fin_movements`.
- **Problema detectado:** Cuando el propietario indicaba que un compromiso o suscripción recurrente (como ChatGPT o Adobe) ya había sido cobrado en una fecha pasada (ej. 18 de septiembre), registrar el gasto hoy como gasto regular debitaba el saldo disponible del Banco Popular por segunda vez, o dejaba el compromiso como vencido e impago en septiembre.
- **Corrección aplicada:**
  1. Se regularizaron los gastos de **ChatGPT** (`RD$ 1,680.00`) y **Adobe** (`RD$ 1,675.04`) con fecha y `source_timestamp` del `2026-09-18T12:00:00.000Z`, vinculados a Banco Popular.
  2. Al tener un timestamp anterior a `reconciled_at` (`2026-09-22T23:59:59-04:00`), `financeCore.effectiveAccountBalance` no los vuelve a restar del saldo base conciliado, manteniendo el Banco Popular en sus **RD$ 9,466.46** exactos.
  3. Se avanzaron las próximas fechas de cobro en `cost_recurrents` a octubre de 2026 (`2026-10-18`).
  4. En el parser y asistente de WhatsApp se implementó la detección de frases como *"ya se había cobrado el 18"*, *"registra el gasto pero no cambies el saldo"* y *"suscripción de Adobe"*, activando el flag `no_cambiar_saldo` y asignando la fecha histórica sin alterar saldos bancarios consolidados.

---

## 4. INSTRUCCIONES PARA ASISTENTES IA AUTOMATIZADOS

1. **Lectura obligatoria antes de operar:**
   - Antes de modificar saldos o registrar lotes, consulte `fin_accounts` y compruebe los campos `reconciled_balance_centavos` y `reconciled_at`.
   - Si una cuenta está conciliada a las `23:59:59-04:00`, cualquier gasto o movimiento con fecha de ese mismo día debe llevar un `source_timestamp` anterior al corte si ya está incluido en el saldo, o posterior si es un movimiento adicional.
2. **Suscripciones y compromisos históricos:**
   - Cuando el dueño indique que un pago o suscripción ya fue cobrado en el banco en días previos pero no estaba registrado, **NO** reduzca el saldo disponible actual.
   - Genere el gasto con `source_timestamp` correspondiente a la fecha de cobro real (anterior a la conciliación) y avance la `proximaFecha` del recurrente en `cost_recurrents`.
3. **Tratamiento del dinero en efectivo:**
   - El saldo de la cuenta `Efectivo` (`a8a05570-a058-4b59-935a-80a8e556d729`) representa el dinero físico disponible fuera de la caja registradora.
   - Las ventas del turno activo permanecen en la gaveta hasta la emisión de `CajaCerrada`.
   - Cuando se produzca el cierre, el monto a transferir a `Efectivo` es estrictamente `efectivoAEntregarCentavos`.
4. **Gastos recurrentes y suscripciones:**
   - Toda suscripción recurrente debe tener su documento en `cost_recurrents`, su gasto en `expenses` y su movimiento en `fin_movements` con el evento `LedgerMovimientoRegistrado` en `sync_events`.
   - Ejemplo verificado: Antropic mensual RD$ 1,224.92 asignado a Banco Popular (`786b5ffd-169c-40f6-8fbc-8f0e6bc69a02`).
5. **Despliegues y versionado PWA:**
   - Cada modificación en el panel web debe incrementar el `build` en `app-version.json`, `index.html`, `mobile/index.html`, `panel.html` y `sw.js`.
   - La suite de 243 pruebas en `dcarela-panel-publish` debe ejecutarse con `node --test *.test.js` y aprobar al 100% antes de desplegar.
