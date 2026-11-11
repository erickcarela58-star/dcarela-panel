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
| PWA con Auth y Firestore emulados | PASÓ en operaciones aisladas | En Chrome local, la sesión sintética leyó Central y una transferencia de RD$1.00 pasó de Banco a Efectivo: 2,000.00→1,999.00 y 1,000.00→1,001.00. El total patrimonial no cambió. Un ingreso ficticio de RD$1.00 subió Banco y total una sola vez. El 10/11 se registró desde la UI un gasto de RD$1.23, se anuló con motivo y Firestore confirmó que el asiento permanece con `estado=anulado`; una conciliación dejó Banco ficticio en RD$1,999.99, visto en la siguiente carga. Ninguna operación fue productiva. |
| Firebase real con sesión, sucursales y datos autorizados | NO VERIFICADO | No se abrió una sesión real en esta ruta ni se consultaron cuentas productivas. |
| Inicio y cierre de sesión propios de la PWA | PASÓ en emulador | Sin sesión no mostró saldos; contraseña ficticia incorrecta se rechazó; una cuenta demo de Central abrió dos cuentas, conservó sesión al recargar y volvió al acceso al cerrar. Usa `DcarelaFirebase.signIn/signOut` del panel, sin clave adicional. Safari/iPhone y cuenta real aún no verificados. |

El acceso fue publicado en `0fb28d44f1e064967c07b5eeb45c1b1c2de33bdf`: Pages `built`, seis hashes HTTP idénticos y formulario sin sesión comprobado en la URL pública a 393 × 852. No se verificó login de una cuenta real ni Safari físico.
| Safari iPhone 15 físico e instalación PWA | NO VERIFICADO | Captura de navegador en tamaño móvil; no prueba física. |
| URL/commit publicado | PASÓ para archivos y ruta | El dueño autorizó publicar el 10/11. Pages run `42779979744` terminó success para `476991bfc93a65726528fa1054bf4801a8c61b65`; `https://panel.dcarelacompufoto.com/finanzas/` respondió 200. Siete archivos, incluidos `finanzas/app.js`, `firebase-adapter.js` y `finance-revision-core.js`, coincidieron por SHA-256 con el blob de Git. Falta prueba autenticada de la nueva ruta. |

**Actualización visual v35, 10/11:** el commit de fuente `977d798067f92d00deda036ce73c6a570b658dd0` quedó `built` en Pages. La URL pública respondió 200; seis archivos de la PWA coincidieron byte a byte por SHA-256. En la URL pública, las 26 pantallas demo revisadas dejaron la barra tras el contenido y la ruta sin sesión rechazó los saldos y la escritura. Evidencias en `CONTINUIDAD.md` y `C:/tmp/finanzas-v35-publicacion-verificada-20261110.json`. No es prueba de sesión real, Caja física ni Safari.

**Revalidación 11/11:** Auth y Firestore se ejecutaron con JRE portátil y proyecto `demo-dcarela-finanzas`; la suite completa aprobó **434/434, sin omisiones**. El adaptador publicado en `72362da` coincide por SHA-256 con el blob Git (`f401e3bc9eeef3fd6e90423d71e7972c2d4dc4369e0584891e4f24bf7606e9ac`) y el run Pages `42983460540` terminó `success`. La Caja activa usa otro `device_id` que la base de esta PC; su parche `76a283e` no está instalado allí. Por eso los botones de escritura productiva continúan bloqueados y la paridad física Caja/CRM/PWA permanece **no verificada**. La instalación y gestos en Safari/iPhone 15 tampoco se comprobaron físicamente.

**Interfaz 35.16:** el botón de tema volvió a la cabecera y las vistas/gestos tienen transición horizontal direccional; el banco local comprobó claro, oscuro, calendario, estadísticas, brillo, movimiento reducido y ancho de 393 px. Cuatro capturas y el script `C:/tmp/dcarela-pwa-motion-qa-20261111.cjs` contienen la evidencia. La suite completa con emuladores pasó 434/434. Las capturas son demo sintética, no prueba de Caja productiva ni de Safari físico.

**Entrega 35.16:** Pages run `42986684817` terminó correctamente para `10fc14a`; seis recursos HTTP de `https://panel.dcarelacompufoto.com/finanzas/` igualaron los blobs de Git por SHA-256 (`C:/tmp/dcarela-pwa-motion-publica-20261111.json`). El banco de interacción pasó también sobre ese dominio con datos demo. Escritura real y paridad física continúan no verificadas.

## Seguimiento de sincronización — 10/11/2026

- **Sesión existente:** el dueño inició sesión en `panel.dcarelacompufoto.com` como administrador. En la vista Finanzas de Central, el panel confirmó 183 ventas integradas por RD$61,791.60, 183 cobros por método, 50 eventos duplicados ignorados y 0 ventas anuladas incluidas. El Resumen advirtió que la última señal de Caja fue el 09/11 a las 6:02 p. m.; por ello no se afirma actualización en vivo de la terminal.
- **Contrato de Caja cotejado:** `RepoVentas.cs` emite `VentaCobrada` con pagos por método; `RepoCaja.cs` emite `SalidaEfectivo`; `RepoGastos.cs` emite `GastoRegistrado` enlazado a esa salida; `RepoClientes.cs` emite `AbonoClienteRegistrado`; `RepoCostos.cs` emite `CostoPagoRegistrado`. El pago de obligación reduce la deuda, pero no prueba una salida bancaria por sí mismo. El diario canónico deduplica el gasto con su salida y cuenta el pago financiero solo si hay asiento `LedgerMovimientoRegistrado` o documento materializado.
- **PWA en rama:** lee `cost_obligations` y `cost_payments` del mismo `business_id` y muestra obligaciones/pagos en Compromisos, aparte del diario para no duplicar el saldo. El botón «Actualizar movimientos de Caja» fuerza una lectura; al volver a la app después de dos minutos, la lectura se repite una vez. No hay sondeo continuo. Búsqueda comienza en el mes actual, sin fecha fija de 2026.
- **Banco aislado:** 154 pruebas financieras/Firebase, 0 fallos. Un caso nuevo con el formato real de Caja coteja venta mixta, salida + gasto vinculado, abono y pago de obligación con asiento y documento: cinco movimientos, sin duplicar salidas ni pagos. La PWA falló cerrado ante pago de una sucursal ajena. Recarga local `?mode=demo` mostró el botón de actualización y las secciones de obligaciones/pagos; los importes allí son sintéticos.
- **Límite de comprobación:** la PWA V3.3 ya está publicada en modo de solo lectura. La sesión del panel productivo no se copió al origen local ni se extrajeron credenciales. El navegador de Work estaba deshabilitado durante la comprobación posterior, por lo que no hay lectura autenticada de la ruta nueva ni comparación real Caja Windows = CRM = PWA. Tampoco se activaron escrituras ni se modificaron saldos. Falta abrir la ruta con la sesión del mismo dominio y comparar centavo a centavo con Caja física.
- **Caja instalada en esta PC:** `C:\Users\Erick\AppData\Local\CarelaPOS\pos.db` se abrió con SQLite `mode=ro`. La última venta local fue el 02/11 a las 22:56 UTC; su última sincronización registrada fue el 03/11 a las 08:25 UTC y había 43 eventos pendientes. En noviembre esa base contiene 50 ventas no anuladas por RD$13,115.00, dos gastos y dos salidas enlazadas por RD$555.00, y ningún pago de obligaciones. No es la Caja que produjo el estado del panel del 09/11; comparar sus saldos actuales con el panel daría un falso descuadre. Ninguna consulta escribió en la base.
- **Emulador aislado:** se descargó `OpenJDK21U-jre_x64_windows_hotspot_21.0.13_9.zip` a `C:\tmp\dcarela-finanzas-emulator`, con SHA-256 `2332c0b4cff6bed722da3567c91d5e47568bcba863fa4945d0a8d6fc76158628` verificado. Se arrancaron Auth y Firestore con reglas reales y proyecto `demo-dcarela-finanzas`; no se cambió el Java del sistema ni el `firebase.json` del panel. La prueba de permisos pasó 1/1. No se usaron cuentas ni datos reales.
- **Lectura del emulador:** el adaptador intentó primero el REST público de Firestore, que no respeta `useEmulator()`. Se corrigió `canReadDirect()` para que los proyectos `demo-*` usen el SDK enlazado al emulador; la ruta REST de producción permanece intacta. En una pestaña con origen nuevo se comprobó la lectura de la sucursal autorizada y una transferencia desde la UI. El Service Worker no se registra en la prueba aislada para evitar caché de código anterior. El fixture inicial de reglas omitía `moneda` e `incluir_en_total` y mostraba un total cero; se completó el fixture y la recarga mostró tres cuentas DOP incluidas por RD$3,100.00. Esa tercera cuenta es exclusivamente sintética.

## Comandos ejecutados

`node --test finanzas/data-source.test.mjs finance-core.test.js money-manager-core.test.js simple-finance-core.test.js`

`node --test` con todos los `firebase-*.test.js`, `finance-*.test.js`, `pwa-caja-firebase-e2e.test.js`, `finanzas/*.test.mjs` y los motores: 155/155 en el emulador (10/11), cero fallos.

`node --check finanzas/app.js`, `node --check finanzas/data-source.js`, `git diff --check`.

Antes de publicar el 10/11 se ejecutaron todos los `*.test.js` y `*.test.mjs` del repositorio: **430 pruebas, 429 correctas, 0 fallos y 1 omitida** (la del emulador sin sus variables). Con Auth/Firestore emulados, esa prueba adicional pasó 1/1. Sintaxis de `finanzas/app.js`, `finanzas/data-source.js` y `firebase-adapter.js` correcta; `origin/main` era ancestro lineal del commit publicado.

Servidor local `py -m http.server 8899 --bind 127.0.0.1`; captura en `http://127.0.0.1:8899/finanzas/?mode=demo&b=sucursal-a` y comprobación sin sesión en `/finanzas/`.

## Funciones

- **Conectadas para lectura, pendientes de validar con sesión real:** Resumen, Diario, Calendario, Semana, Mes, Estadísticas, Búsqueda, cuentas, detalle de cuenta/movimiento, tarjetas, presupuestos y compromisos.
- **Solo emulador por código:** `fin.transfer.create`, `fin.movement.create` (ingreso y gasto), `fin.movement.cancel` y `fin.account.reconcile` validadas desde la UI en proyecto `demo-*`; gasto anulado conservado en Firestore y saldo conciliado visto al recargar. Los scripts/evidencias del último recorrido están en `C:/tmp/dcarela-emulator-ui-check-20261110.cjs` y `CONTINUIDAD.md`. El control del navegador de Work sigue deshabilitado, pero el Chromium aislado se probó por CDP sin credenciales de producción.
- **Bloqueadas en UI real después de v35.18:** anular, conciliar, editar cuenta/movimiento, pagos de compromisos y gestión de tarjetas/presupuestos. Ingreso, gasto y transferencia pasan por el adaptador original únicamente para owner/admin en el origen oficial; aún falta verificar una escritura y el reflejo en Caja productiva.
- **Acceso al registro:** la PWA 35.17 muestra el botón «+» también en producción; su popup abre `/panel.html#finanzas`, donde está el registro operativo del panel central. La PWA no envía movimientos directamente. El recorrido del popup pasó en Auth/Firestore Emulator con datos ficticios y 434/434 pruebas; el salto en Safari/iPhone físico y la paridad con la Caja activa siguen sin verificar.
- **Registro directo v35.18:** reemplaza ese desvío por hoja Gasto/Ingreso/Transferencia dentro de la PWA. La compuerta de origen HTTPS oficial y rol owner/admin permite `fin.movement.create` y `fin.transfer.create` del adaptador original, con `requestId` estable; anulación/conciliación siguen bloqueadas. En el emulador, un gasto de RD$1.23 se guardó y apareció en Diario; 435/435 pruebas del repositorio pasaron. No se probó una escritura productiva ni se cotejó la Caja activa con el libro Firebase. Capturas locales en `C:/tmp/dcarela-pwa-direct-entry-{light,dark}-20261111.png`.

## Para una activación futura

1. Completar el recorrido UI de ingreso y transferencia de v35.18 en el emulador; gasto, anulación y conciliación de emulador ya pasaron. Las dos últimas continúan bloqueadas en producción.
2. Comparar los mismos eventos y saldos por cuenta/moneda en Caja Windows, CRM y PWA; registrar diferencias en centavos sin modificar producción.
3. Probar Safari físico y tiempo/costo de lectura histórica.
4. La publicación de lectura fue autorizada el 10/11 y verificada por URL, Pages y hashes. El dueño pidió después registro directo y publicación. La compuerta de escritura de la v35.18 se limita a crear movimientos/transferencias en el libro Firebase; la paridad con la Caja activa sigue pendiente y no debe declararse completada.
