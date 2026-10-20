# Panel web y finanzas — revisión local del 20/10/2026

## Alcance vigente

El dueño pausó el editor de flyers y asignó el panel web completo y finanzas: funcionamiento, distribución, estética y rendimiento, conservando el estilo de las gráficas. Otro asistente continúa con CRM. No confundir esta tarea con el catálogo público ni con el webhook financiero de WhatsApp.

- Trabajo: `C:\tmp\dcarela-panel-integral-20261020`, rama `codex/panel-integral-20261020`.
- Base: `8d3da81`, reorganización local del panel del 14/10. La rama publicada sigue separada en `f7325df`; este trabajo no modifica `main` ni se publica.
- Editor pausado: `C:\tmp\dcarela-crm-editor-v230\PAUSA_EDITOR_V244_2026-10-20.md`. Conservar su WIP y la asignación del otro asistente.
- Preview vigente: <http://127.0.0.1:8823/>. Datos ficticios, CSP sin conexiones de red, escrituras rechazadas. No representa los saldos reales.
- Arranque reproducible desde este checkout: `node -e "require('./.local-tests/workspace-preview.cjs').createServer().listen(8823,'127.0.0.1')"`.

## Documentación contrastada

Leídos README, FINANCE_FLOW, CONTINUIDAD y docs/web-error-targets-20261005 del panel; continuidad y errores publicados del asistente financiero; auditorías WEB_CURRENT_AUDIT, PRODUCTIVE_UI_AUDIT, LEGACY_UI_MECHANICS_AUDIT y continuidad del POS. Los documentos de julio/agosto y sus cifras son históricos, no evidencia de operación actual. La continuidad del 14/10 conserva como pendientes la validación de sesiones reales, el portafolio completo y la regeneración del instalador Windows.

## Correcciones verificadas de este bloque

1. **Actualizaciones financieras repetidas:** peticiones simultáneas comparten una lectura forzada. Si llegan durante una consulta normal, comparten una única actualización adicional. Un guardado posterior al inicio de la consulta invalida esa equivalencia y exige una lectura nueva; no se omite la actualización del cambio guardado.
2. **Frescura tras un fallo:** se conserva la instantánea anterior, pero su marca de consulta reciente queda invalidada. Volver al módulo no reutiliza esa instantánea como recién comprobada.
3. **Deuda y capital desconocidos:** una cuota conocida no sustituye el saldo contractual de un préstamo. Los totales incompletos muestran `--` con explicación. El detalle conserva la cuota y presenta el saldo como `Sin verificar`. Las cuotas antiguas sin desglose de capital tampoco acreditan capital cero.
4. **Acciones según permisos:** el detalle de pagos de Money Manager muestra `Solo lectura` cuando la sesión no puede editar, en lugar de ofrecer Registrar pago/Generar factura. Se conserva la autorización del servidor.
5. **Presentación:** pestaña activa de Money Manager expuesta con aria-selected; nombre y tipo del compromiso en líneas separadas; explicación de Cuentas alineada con saldo conciliado, movimientos y comisiones. Colores, SVG, degradados y motores de las gráficas conservados.

6. **Planificación coherente:** Finanzas incluye los préstamos y planes que antes solo aparecían en Money Manager. Comparte su resumen sin duplicar cuotas materializadas. Las etiquetas del análisis de facturas identifican su alcance; ya no presentan su ausencia como ausencia de toda deuda.

## Evidencia y límites

- Suite `node --test *.test.js ai-core/*.test.js`: **389/389**. Ocho pruebas nuevas: seis regresiones fallaron antes de sus correcciones (cuatro de recarga, una contable y una de planificación); dos verifican la presentación para lector/editor. Las demás pruebas verifican conservación. No son pruebas físicas de las sedes.
- Sintaxis de panel.js y money-manager-core.js; `git diff --check` sin errores.
- Navegador real contra fixture: Resumen, Finanzas, cuentas y detalle, Reportes con sus gráficas, Clientes, Inventario, Caja y Money Manager. Préstamo ficticio con cuota conocida/saldo desconocido visible; sesión lectora sin botón de pago y pestaña seleccionada correcta.
- QA móvil adicional: iframe con viewport 390 × 844 sobre la entrada móvil real; tarjetas, controles y gráficas revisados en claro/oscuro. Capturas panel-finanzas-movil-oscuro-20261020.png y panel-graficas-movil-oscuro-20261020.png en outputs. Esto no equivale a probar un dispositivo físico.
- Evidencia: `C:\Users\Erick\Documents\Codex\2026-10-20\ana\outputs\panel-prestamos-local-20261020.png`; log de suite en `...\work\panel-integral-tests.log`.
- No se desplegó hosting/backend, no se hicieron movimientos financieros, ventas, cortes, mensajes ni cambios en la Caja física. No se certifica la corrección de saldos históricos o la rapidez de Firestore con el fixture.

## Cola abierta de la revisión completa

La revisión del panel entero sigue abierta; este bloque no la declara terminada.

1. Ampliar QA local de todos los módulos secundarios y roles: aperturas/cancelación de formularios, errores/reintentos, cambio de sucursal durante consultas lentas y recorrido completo de teclado.
2. Revisar distribución en escritorio compacto y móvil real, tema claro/oscuro, tablas largas, filtros y controles. Conservar el aspecto de las gráficas y las preferencias de herramientas del dueño.
3. Medir lecturas, paginación y renderizado con historial voluminoso; distinguir las mejoras de concurrencia verificadas de la latencia/índices remotos aún no medidos.
4. Integración completa de catálogo/portafolio y descripción de productos pendientes desde el relevo del 14/10: los enlaces existentes son accesos, no integración completa.
5. Validación autenticada de lectura y sincronización con Caja: requiere evidencia por sede/terminal. El estado de publicación o una señal reciente no acreditan instalación ni aplicación de la cola. No introducir operaciones ficticias en producción.
6. Mantener aparte el backlog de WhatsApp financiero (referencia por ID/contexto, recuperación de envíos inciertos, impuestos y conciliación por chat) y el editor/CRM de los otros asistentes. No redeplegar sus fuentes antiguas sobre versiones vigentes.
