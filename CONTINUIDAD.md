# Continuidad del panel web

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

