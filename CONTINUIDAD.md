# Continuidad del panel web

## Continuación del 03/11/2026 — panel web 1.0.119

Rama vigente de esta revisión: `codex/panel-web-errores-20261103`, `C:\tmp\dcarela-panel-web-20261103`, desde `f7a9948` (último código publicado `085d7d8`, 1.0.118). No usar la copia antigua `dcarela-panel-publish/main` como fuente nueva.

Corregidos filtros de categoría/periodo/comisiones del gráfico, monedas/permisos/configuración de tarjetas, falsos ceros en préstamos y render de historial (100 filas por página, exportación completa). Suite **408/408** y QA en banco aislado. Detalles, evidencia, límites y estado de publicación en **REVISION_PANEL_WEB_2026-11-03.md**. No se modifican registros financieros reales, Caja física, instaladores, backend, WhatsApp ni CRM/editor. Descripción comercial e integración completa del catálogo siguen identificadas como desarrollo pendiente; la revisión no las da por realizadas.

**Publicado:** código `4ce0a72`, Pages built, 20/20 archivos HTTP idénticos a Git y filtros verificados con sesión real de Central en lectura. Verificación física de Plaza e integración completa del catálogo siguen pendientes.

---

Historial anterior (sus estados de publicación son históricos):

## 2026-10-14 — estilo CRM y navegación, solo local

- Rama `codex/panel-crm-visual-v76`, basada en el panel 1.0.116 y con la recuperación de acceso de `c80c0ab`/`1ffcdbf` integrada. No se hizo push ni deploy y no se cambió el manifiesto ni la versión publicada.
- Tema CRM compartido para shell de escritorio, entrada móvil y módulos: fondo pastel, superficies redondeadas, iconos de color, scroll fino, tablas con filas separadas y tarjetas de cortes.
- Reproducido en la vista completa un regreso involuntario a Resumen al montar el iframe de Finanzas/Reportes. El iframe abre ahora la ruta solicitada, conserva su fuente durante la navegación y renueva la fuente al cambiar de sucursal o sesión. Cambio mínimo en ambos bundles y helper `shell-route-core.js`.
- Finanzas y Money Manager comparten marca bancaria y opciones visuales remotas. Las tarjetas son verticales. No se cambia ningún cálculo, saldo, diario o asiento. Pruebas de cambios de apariencia, valores inválidos y deuda de tarjeta conservada.
- El anillo usa cinco colores y agrupa las categorías restantes en Otros conservando el total; antes se recortaba a ocho categorías. Reportes conserva datos y periodos y usa acentos del tema. Selección de pestañas de Finanzas expuesta también con `aria-selected`.
- Inventario conserva el catálogo de la sucursal y aclara la separación de existencias. Se agregaron accesos al catálogo comercial y al portafolio publicados en la web oficial. Estos accesos no constituyen una integración completa de fotografías ni añaden descripciones al esquema.
- Validación: 373/373 pruebas Node y sintaxis de ambos bundles, panel y helper. Cuatro regresiones de rutas fallaban antes del cambio y pasan después. Revisión local de Reportes/periodos, Inventario, Caja, Turnos y cuentas; Central escritorio y Plaza móvil, claro/oscuro; reintento de autorización en escritorio y móvil.
- Evidencia visual con datos ficticios mediante `.local-tests/workspace-preview.cjs`, servidor GET en loopback 8818 con CSP sin conexiones de red y escrituras rechazadas. Recuperación de acceso mediante `.local-tests/auth-preview.cjs` en 8816. Las capturas quedan fuera del repositorio, en el espacio local del trabajo.
- Límites: no se verificó este código contra las sesiones reales de ambas sucursales, ni la causa remota de la espera de Firestore, ni la instalación física de la Caja. Los saldos y asientos de Plaza permanecen fuera del trabajo. Integración completa de portafolio y nuevo campo de descripción siguen pendientes; no se modificó catálogo, stock ni precios en la nube.
- Caja Windows 1.0.76 sigue preparada en borrador en el bloque anterior; esta entrada no certifica publicación ni instalación. Continuar desde esta rama, conservar el panel sin publicar según la orden del dueño.

## 2026-10-14 — distribución basada en el CRM, después de la revisión del dueño

- El dueño rechazó el cambio de color conservando la estructura antigua. Se revisó el CRM real v185 en Dashboard, Planificación y Clientes de caja, además de `panel/v2.html`: navegación principal compacta, información agrupada por tarea, paneles independientes, detalles contextuales y límites de renderizado. El CRM se usó como referencia de solo lectura; no se editaron sus registros ni se enviaron mensajes.
- El Resumen web se construye ahora en `crm-layout-core.js`: cifras del día agrupadas, gráfico en panel propio, cuentas, actividad reciente y estado de consulta independientes. Se reemplazó la estructura de presentación del dashboard en ambas entradas, conservando sus consultas, caché, identidad, aislamiento de sucursales y validación de señales. Actividad reciente: cinco nodos como máximo; no se recorta la fuente de datos.
- Menú principal con siete destinos de trabajo; herramientas secundarias agrupadas bajo Más. Se eliminó el falso buscador decorativo. Cada destino se conserva una vez y los grupos secundarios se abren si contienen la ruta activa.
- Finanzas usa navegación lateral local y una columna de contenido. Los indicadores secundarios se despliegan bajo demanda. El saldo general queda en una franja independiente de las tarjetas de banco, y el periodo se oculta donde no filtra el saldo (Cuentas/Tarjetas). Se conserva la representación de deuda y los cálculos existentes.
- Validación: 377/377 pruebas Node, incluidas conservación de instantánea, importes firmados, series, estados desconocidos, mensajes de ausencia de datos y rutas. Actualizadas las regresiones anteriores para verificar el nuevo renderer, conservando sus contratos de seguridad. Revisión desktop 1440×1000 y móvil 390×844, Central/Plaza y claro/oscuro, con fixture sin red; ancho de documento móvil 390, sin desbordamiento horizontal.
- El fixture incluye ventas y gastos completamente ficticios para revisar los gráficos reales. Ningún movimiento se guardó en Firebase. Código sin push/deploy; manifiesto/build publicado intactos. Falta la validación de este código con sesiones reales y la integración completa del portafolio. Los demás módulos conservan su comportamiento y no se declaran todos rediseñados.
- Caja: Resumen, Clientes y navegación de Finanzas también se reorganizaron en el worktree Windows. El diseño recién cambiado debe recompilarse y empaquetarse antes de cualquier publicación; los instaladores anteriores del borrador 1.0.76 no contienen esta distribución.
- Cierre visual: corregidas las clases reales de las tarjetas (`metric-item`) y la leyenda de categorías para evitar recortes. Comprobado el contenido a 390 px: documento sin desbordamiento horizontal. Galería local de capturas en `http://127.0.0.1:8820/` y panel interactivo de prueba en `http://127.0.0.1:8818/`; no son URLs publicadas. La galería vive fuera del repositorio.


## 2026-10-14 — una zona de contenido y herramientas organizables

- Por corrección directa del dueño, eliminado Más herramientas y la barra lateral interna de Finanzas. Resumen y widgets usan el ancho disponible, ventas netas hasta 60 px, gráficos reales y bloques apilados. Periodo, filtros, actividad/estado e indicadores secundarios quedan plegables.
- Organizar en menú, Resumen y Finanzas: mover, ocultar, recuperar y guardar localmente. Las preferencias se validan contra herramientas disponibles, no amplían permisos y no tocan Firebase. Orden y visibilidad comprobados tras recargar, después restaurados en el fixture.
- Clic en una cuenta del Resumen o en su tarjeta abre su detalle: saldo firmado del motor existente, ingresos/gastos de sus asientos, uso y movimientos de esa cuenta. El puente comprueba origen, iframe, sucursal, sesión y cuenta; espera a la carga y descarta respuestas de otra sucursal. Un resultado vacío de cuenta no se presenta como falta de sincronización.
- Verificación: 381/381 Node; conservación de saldos/instantáneas y de fuentes/series, límites de renderizado, orden/visibilidad, aislamiento del puente y gastos separados de transferencias. Revisión real del fixture con clic en Popular/Efectivo y organización guardada. No son datos comerciales.
- Código sin publicar: mantener manifiesto/build actual. Capturas y galería local 8820 fuera del repo. Pendiente validación de las sesiones reales y regeneración del instalador Windows. La siguiente orden amplía el trabajo al CRM cotizador/imágenes en otro worktree; no incluye campañas.

## 2026-10-20 — revisión integral de panel y finanzas, solo local

El dueño pausó el editor y asignó el panel completo, conservando las gráficas. Continuar desde REVISION_PANEL_FINANZAS_2026-10-20.md en la rama codex/panel-integral-20261020. Este bloque corrige recargas en cadena, frescura tras errores, deuda/capital desconocidos y acciones de pagos para lectores. Suite 388/388; QA de navegación contra datos ficticios en loopback 8823. Sin publicación ni operaciones reales. La revisión integral, las sesiones reales y la Caja física siguen pendientes; no confundir esta evidencia con producción.
Actualización del bloque: planificación unificada de préstamos/facturas/planes y textos de alcance corregidos. QA móvil de 390 × 844 en claro/oscuro con gráficas conservadas. Suite final 389/389.

## 2026-10-20 — cierre Web/PWA 1.0.117 autorizado

El dueño pidió dejar panel y asistente en versión final. Candidato documentado en RELEASE_WEB_1.0.117_2026-10-20.md; 389/389 pruebas y gráficas conservadas. Integrada origin/main bcc4d3f para preservar Caja Windows 1.0.76. La autorización actual sustituye el límite anterior de no publicar este candidato. La verificación de Pages/HTTP se registra al completar el despliegue; no acredita instalación física.

## Cierre web 1.0.118 — 20/10/2026
Continúa 1.0.117: saldos nativos y totales por moneda; impide escribir asientos DOP desde formularios manuales con cuentas USD. 395/395 pruebas. Ver RELEASE_WEB_1.0.118_2026-10-20.md. Aplicación móvil expresamente fuera de alcance: mobile/ sin cambios frente a 891204a; instaladores Windows 1.0.76 conservados. La inspección de producción fue de lectura y canceló el editor sin guardar. Publicación HTTP/Pages y revisión autenticada se registrarán en CIERRE_PANEL_WHATSAPP_2026-10-20.md.


## Finanzas Web/PWA 1.0.121 — 04/11/2026

El panel actualiza Finanzas y Money Manager tras cambios confirmados en Firebase. Los cambios del mismo asiento se agrupan en una recarga. Se invalida el diario, el saldo y la caché de facturas antes de renderizar. «Pago por verificar» aparece por separado y no entra en el total a pagar.

Web publicada desde `4b77117`, build `2026.11.04.1.0.121.0`. Siete archivos HTTP coinciden con Git y pasaron 408 pruebas. Prueba Playwright con el panel real y fuentes ficticias, escritorio 1440 px y móvil 390 px. Una notificación de pago actualizó la factura, el movimiento y el saldo en la vista abierta. En la sesión de producción de Central se comprobó que las dos declaraciones de Claro aparecen como **Pago por verificar**. El primer intento de acceso agotó su plazo y el botón de reintento recuperó la sesión. Los débitos de la prueba solo se registraron en el banco aislado.

## Finanzas Web/PWA 1.0.127 — 05/11/2026

Publicada la fuente `7685701`. Compromisos activos y planes del período en la misma lista, historial pagado/inactivo opcional con pago desactivado. Lecturas directas autenticadas para validar acceso y consultar finanzas; conserva reglas, errores, paginación por fecha/documento y el orden implícito de desigualdades. Respaldo cada 30 s de un solo evento financiero con la vista visible, sin acumular lecturas; las cifras se recargan cuando cambia.

409 pruebas aprobadas. Banco aislado 1440/390 px e interacción de historial. Producción recargada y autenticada en 1.0.127; diario y panel coinciden en Efectivo RD$6,301, Popular RD$4,297.53, Qik RD$142.75, deuda tarjeta RD$10,542.66 y US$64.00. Ashley/Wind no aparecen como pendientes. La prueba no registró pagos físicos nuevos. Las fuentes públicas de siete archivos coinciden byte a byte con Git.

La conciliación de datos y sus auditorías se documentan en `C:/tmp/dcarela-editor-continuacion-20261102/CIERRE_FINANZAS_ESTADOS_2026-11-05.md`. El cambio financiero no reemplaza los saldos del banco por estimaciones ni ejecuta transferencias. Windows e iOS conservan sus versiones.

## 05/11/2026 — Actualización Windows Caja 1.0.77

Manifiesto `509a88b`: Central y Plaza 1.0.77, cierre de turno exclusivamente manual incluso tras apagado/reinicio. Web/PWA permanece 1.0.127 y las IPA no cambian. Central obligatoria y Plaza opcional conservadas. Las seis pruebas de descargas pasan. Los dos instaladores públicos se descargaron completos y coinciden con sus SHA; fuente POS `a03292c`, instalada y comprobada en la PC actual sin alterar pos.db/WAL. Las demás terminales reciben la protección al instalar la actualización, sin presumir que ya lo hicieron.

Entrega y pruebas: `C:/tmp/dcarela-caja-turno-manual-20261105/docs/CIERRE_TURNO_MANUAL_2026-11-05.md`. Fuente privada `codex/caja-turno-manual-20261105`; publicación pública https://github.com/erickcarela58-star/dcarela-panel/releases/tag/pos-v1.0.77. 429 pruebas POS, 57 integrales sobre copia y autoprueba de apagado/cierre de sesión y recuperación del turno en ambos paquetes.

## 09/11/2026 — PWA Finanzas simple para iPhone 15, solo local

Se preparó `panel.html?simple=1` con Resumen y Finanzas sobre el libro central, organización por día/calendario/semana/mes, manifest independiente y página sin conexión. El modo automático del asistente POS dejó de invocar Gemini; la selección manual y las rutas de servidor siguen pendientes de auditoría. 419/419 pruebas Node aprobadas. La vista se inspeccionó en marco local 393 × 852 con datos ficticios y sin red. **No está publicada, no se probó en iPhone físico ni se confirmó con datos autenticados.** Aprobación visual pendiente. Detalle y pasos exactos en `PWA_FINANZAS_IPHONE15_2026-11-09.md`.

## 09/11/2026 — aclaración: Caja y PWA deben compartir el libro propio

El dueño quiere que Caja Windows, panel central y PWA compartan la contabilidad de D’ Carela; no se busca sincronizar la app Money Manager ajena. La inspección de código mostró dos almacenes: Caja `pos-current-data` consulta `fin_movimientos` y `fin_account_balances` en Supabase; el panel iniciado con Firebase lee `fin_movements`, `fin_accounts` y `sync_events` en Firestore. Aún no hay evidencia de que esos libros estén conciliados. Se quitó del panel local la afirmación de “una sola fuente compartida con la caja” y se muestra el proveedor activo. No se tocaron Caja, ventas, saldos ni nube. Sintaxis de `panel.js`, 2/2 pruebas enfocadas y `git diff --check` pasaron. Pendiente: diseñar y probar conciliación por IDs y centavos sobre copias, elegir fuente canónica y verificar ciclo Caja → nube → PWA con sesiones autenticadas antes de publicar el cambio visual. Ver `ANALISIS_MONEY_MANAGER_IPA_2026-11-09.md`.

**Corrección inmediata del dueño:** la Caja vigente migró a Firebase. La inspección anterior tomó por error la copia vieja `C:/Users/Erick/Documents/Sistema de cajas/dcarela-pos`. El código vigente está en `C:/tmp/dcarela-caja-turno-manual-20261105`: escribe y lee `sync_events` de Firestore y baja `fin_accounts`; el panel Firebase consulta esas colecciones. La vista financiera de Caja CURRENT usa el libro local como fuente de pantalla. Por tanto, hay transporte común, pero falta demostrar que los saldos y movimientos coinciden tras un push/pull real. La prueba 244/244 y los dos fallos integrales corresponden a la copia antigua, no a la Caja vigente. No se tocó producción ni se ha publicado la PWA. El siguiente paso es verificar IDs y centavos sobre una copia y sesión autenticada de Firebase. El diagnóstico corregido está en `ANALISIS_MONEY_MANAGER_IPA_2026-11-09.md`.

El proyecto Firebase de ambos clientes es `erikccarela`; la Caja escribe `sync_events` con IDs idempotentes y `source=pos_local_firebase`, y el panel proyecta `VentaCobrada` y `LedgerMovimientoRegistrado`. Las pruebas focalizadas de la Caja vigente para push y pull Firebase pasaron 2/2 sobre el banco de pruebas, sin escribir en nube. Esto verifica compatibilidad de transporte, no igualdad de saldos reales ni frescura de la terminal.

## 09/11/2026 — revisión final del candidato PWA simple

La vista de iPhone 15 se recorrió en un marco de 393 × 852, con datos ficticios y transporte bloqueado. Captura `.local-tests/pwa-finanzas-iphone15-review-final.png`. Se corrigió el tema inicial: claro para instalaciones nuevas, respetando la elección ya guardada. Pasaron 420/420 pruebas Node, incluyendo contrato Caja Firebase → adaptador del panel → totales PWA para un cobro mixto, sin duplicarlo. Producción 1.0.127 se consultó con sesión autenticada y muestra ventas reales de Caja en Firebase; no se hizo ninguna escritura. La base local de Caja en esta PC está desactualizada, así que sigue sin prueba de igualdad de saldos actuales. El candidato continúa local, pendiente del OK visual del dueño, incremento coherente de build y publicación verificada. Safari e instalación física del iPhone 15 siguen sin comprobarse.
