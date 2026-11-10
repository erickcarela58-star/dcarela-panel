# Pruebas Finanzas V3.3 — 10/11/2026

| Caso | Estado | Evidencia |
|---|---|---|
| Motor original, incluido `finance-revision-core.js` | PASÓ | `panel.html` y `finanzas/index.html`; 48 pruebas focales pasaron. |
| Sucursales por membresía, `?b=` ajeno, login ausente | PASÓ en banco sintético | `finanzas/data-source.test.mjs`; el navegador local sin sesión mostró “Datos no verificados”. |
| Lectura canónica y rechazo de error parcial, documento ajeno, cuenta sin saldo base, cambio de UID | PASÓ en banco sintético | 6 pruebas nuevas; `getFinanceJournal` se invoca una vez con cuentas ya leídas. |
| Finanzas/adapter/Caja Firebase regresión local | PASÓ | 146 pruebas, 0 fallos; `.local-tests/finanzas-v33-regresiones.log`. |
| Diseño V3.3 oscuro, Resumen y logos en navegador local | PASÓ en demo local | `finanzas-v33-local-demo-iphone15.png` (datos inventados). |
| Producción sin sesión no presenta saldo ni habilita Registrar | PASÓ local | `finanzas-v33-sin-sesion.png`. |
| Saldo real Caja Windows = CRM = PWA | NO VERIFICADO | La base local instalada está atrasada frente al panel; no se leyó la Caja del negocio ni saldos productivos en esta PWA. `MATRIZ_SALDOS.csv` contiene solo fixtures. |
| Firestore Emulator: reglas de lectura/escritura | PASÓ en proyecto `demo-*` | Temurin JRE portátil verificado por SHA-256; Auth y Firestore emulados en 9199/9183. `finanzas/emulator-rules.test.mjs`: propietario lee/escribe Central, Plaza y usuarios ajenos denegados, lector sin escritura, borrado denegado. |
| Adaptador: idempotencia y anulaciones | PASÓ en banco aislado | `firebase-finance-runtime.test.js`: 33/33, incluidos reintentos y anulaciones concurrentes. |
| PWA con Auth y Firestore emulados | PASÓ parcialmente | En Chrome local, la sesión sintética leyó Central y una transferencia de RD$1.00 pasó de Banco a Efectivo: 2,000.00→1,999.00 y 1,000.00→1,001.00. El total patrimonial no cambió. Ingreso, gasto, conciliación y anulación aún no se recorrieron desde UI. |
| Firebase real con sesión, sucursales y datos autorizados | NO VERIFICADO | No se abrió una sesión real en esta ruta ni se consultaron cuentas productivas. |
| Safari iPhone 15 físico e instalación PWA | NO VERIFICADO | Captura de navegador en tamaño móvil; no prueba física. |
| URL/commit publicado | NO APLICA | Rama local sin push ni despliegue, según la restricción del dueño. |

## Seguimiento de sincronización — 10/11/2026

- **Sesión existente:** el dueño inició sesión en `panel.dcarelacompufoto.com` como administrador. En la vista Finanzas de Central, el panel confirmó 183 ventas integradas por RD$61,791.60, 183 cobros por método, 50 eventos duplicados ignorados y 0 ventas anuladas incluidas. El Resumen advirtió que la última señal de Caja fue el 09/11 a las 6:02 p. m.; por ello no se afirma actualización en vivo de la terminal.
- **Contrato de Caja cotejado:** `RepoVentas.cs` emite `VentaCobrada` con pagos por método; `RepoCaja.cs` emite `SalidaEfectivo`; `RepoGastos.cs` emite `GastoRegistrado` enlazado a esa salida; `RepoClientes.cs` emite `AbonoClienteRegistrado`; `RepoCostos.cs` emite `CostoPagoRegistrado`. El pago de obligación reduce la deuda, pero no prueba una salida bancaria por sí mismo. El diario canónico deduplica el gasto con su salida y cuenta el pago financiero solo si hay asiento `LedgerMovimientoRegistrado` o documento materializado.
- **PWA en rama:** lee `cost_obligations` y `cost_payments` del mismo `business_id` y muestra obligaciones/pagos en Compromisos, aparte del diario para no duplicar el saldo. El botón «Actualizar movimientos de Caja» fuerza una lectura; al volver a la app después de dos minutos, la lectura se repite una vez. No hay sondeo continuo. Búsqueda comienza en el mes actual, sin fecha fija de 2026.
- **Banco aislado:** 154 pruebas financieras/Firebase, 0 fallos. Un caso nuevo con el formato real de Caja coteja venta mixta, salida + gasto vinculado, abono y pago de obligación con asiento y documento: cinco movimientos, sin duplicar salidas ni pagos. La PWA falló cerrado ante pago de una sucursal ajena. Recarga local `?mode=demo` mostró el botón de actualización y las secciones de obligaciones/pagos; los importes allí son sintéticos.
- **Límite de comprobación:** la PWA V3.3 aún no está publicada. La sesión del panel productivo no se copia al origen local ni se extraen credenciales. Por ello no existe comparación real Caja Windows = CRM = PWA, ni lectura de pagos productivos en la nueva ruta. Tampoco se activaron escrituras ni se modificaron saldos. Hace falta probar la ruta con la sesión del mismo dominio después de una publicación aprobada y comparar centavo a centavo con Caja física.
- **Caja instalada en esta PC:** `C:\Users\Erick\AppData\Local\CarelaPOS\pos.db` se abrió con SQLite `mode=ro`. La última venta local fue el 02/11 a las 22:56 UTC; su última sincronización registrada fue el 03/11 a las 08:25 UTC y había 43 eventos pendientes. En noviembre esa base contiene 50 ventas no anuladas por RD$13,115.00, dos gastos y dos salidas enlazadas por RD$555.00, y ningún pago de obligaciones. No es la Caja que produjo el estado del panel del 09/11; comparar sus saldos actuales con el panel daría un falso descuadre. Ninguna consulta escribió en la base.
- **Emulador aislado:** se descargó `OpenJDK21U-jre_x64_windows_hotspot_21.0.13_9.zip` a `C:\tmp\dcarela-finanzas-emulator`, con SHA-256 `2332c0b4cff6bed722da3567c91d5e47568bcba863fa4945d0a8d6fc76158628` verificado. Se arrancaron Auth y Firestore con reglas reales y proyecto `demo-dcarela-finanzas`; no se cambió el Java del sistema ni el `firebase.json` del panel. La prueba de permisos pasó 1/1. No se usaron cuentas ni datos reales.
- **Lectura del emulador:** el adaptador intentó primero el REST público de Firestore, que no respeta `useEmulator()`. Se corrigió `canReadDirect()` para que los proyectos `demo-*` usen el SDK enlazado al emulador; la ruta REST de producción permanece intacta. En una pestaña con origen nuevo se comprobó la lectura de la sucursal autorizada y una transferencia desde la UI. El Service Worker no se registra en la prueba aislada para evitar caché de código anterior. El fixture inicial de reglas omitía `moneda` e `incluir_en_total` y mostraba un total cero; se completó el fixture y la recarga mostró tres cuentas DOP incluidas por RD$3,100.00. Esa tercera cuenta es exclusivamente sintética.

## Comandos ejecutados

`node --test finanzas/data-source.test.mjs finance-core.test.js money-manager-core.test.js simple-finance-core.test.js`

`node --test` con todos los `firebase-*.test.js`, `finance-*.test.js`, `pwa-caja-firebase-e2e.test.js`, `finanzas/*.test.mjs` y los motores: 155/155 en el emulador (10/11), cero fallos.

`node --check finanzas/app.js`, `node --check finanzas/data-source.js`, `git diff --check`.

Servidor local `py -m http.server 8899 --bind 127.0.0.1`; captura en `http://127.0.0.1:8899/finanzas/?mode=demo&b=sucursal-a` y comprobación sin sesión en `/finanzas/`.

## Funciones

- **Conectadas para lectura, pendientes de validar con sesión real:** Resumen, Diario, Calendario, Semana, Mes, Estadísticas, Búsqueda, cuentas, detalle de cuenta/movimiento, tarjetas, presupuestos y compromisos.
- **Solo emulador por código:** `fin.transfer.create` validada desde la UI con cuenta origen y destino; `fin.movement.create`, `fin.movement.cancel` y `fin.account.reconcile` siguen sin recorrido UI, aunque tienen cobertura del adaptador.
- **Bloqueadas en UI real:** toda escritura financiera, editar cuenta/movimiento, pagos de compromisos y gestión de tarjetas/presupuestos.

## Para una activación futura

1. Completar los recorridos UI de ingreso, gasto, conciliación y anulación en el emulador; Auth, reglas y transferencia ya pasaron.
2. Comparar los mismos eventos y saldos por cuenta/moneda en Caja Windows, CRM y PWA; registrar diferencias en centavos sin modificar producción.
3. Probar Safari físico y tiempo/costo de lectura histórica.
4. Solicitar aprobación expresa del dueño para publicar la ruta; otra autorización para abrir escrituras reales tras las pruebas.
