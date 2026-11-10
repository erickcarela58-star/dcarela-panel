# PWA Finanzas simple — iPhone 15 (09/11/2026)

Estado: **prototipo local, no publicado ni instalado en un iPhone real**. Rama `main`, base `8d3336b`. No se modificaron ventas, Caja, saldos ni datos de producción.

## Alcance

- `panel.html?simple=1` comparte autenticación, sucursal y libro con el panel central. La navegación móvil contiene Resumen y Finanzas.
- Finanzas presenta mes, Diario, Calendario, Semana, Mes y Resumen. Entradas, salidas y resultado se calculan en DOP; USD permanece separado y las transferencias no cuentan como ingresos o gastos.
- El administrador puede abrir los formularios existentes de ingreso y gasto desde un único botón. No existe un segundo libro contable.
- `manifest-simple.webmanifest` identifica la PWA por separado. El service worker incluye sus archivos y una página sin conexión que no muestra importes posiblemente vencidos.
- El modo automático del asistente POS ya no llama a Gemini. La opción explícita de Google continúa en el panel completo y no se ha retirado su clave del servidor.

## Pruebas realizadas

- 420/420 pruebas Node aprobadas; `node --check panel.js` y `git diff --check` sin errores.
- Prueba de contrato con un `VentaCobrada` ficticio de pago mixto: Caja lo expresa como un solo evento Firebase, el adaptador del panel lo deduplica y la PWA suma los dos medios de cobro una sola vez. No escribe en Firebase ni modifica Caja.
- Vista local aislada con datos ficticios, sin conexión a Firebase ni escritura: `node .local-tests/web-review-preview.cjs 8898` y `http://127.0.0.1:8898/qa-simple-iphone.html` (marco de 393 × 852).
- Se inspeccionaron Diario, Calendario, Semana y Resumen. El calendario cabe en el ancho de 393 px y el detalle del día usa lista compacta.
- Captura de revisión: `.local-tests/pwa-finanzas-iphone15-review-final.png`. La vista nueva inicia en claro si no hay una preferencia guardada; conserva la preferencia existente. La captura usa exclusivamente importes ficticios.
- Tras el rechazo estético del dueño, se rehízo la navegación con la jerarquía observada en el IPA y su captura: encabezado de búsqueda y opciones, mes, Diario/Calendario/Semana/Mes/Resumen, tres totales y lista plana por fecha. Captura nueva: `.local-tests/pwa-finanzas-iphone15-ipa-final.png`. La búsqueda por descripción, categoría o cuenta recalcula los importes visibles; al abrir Calendario o Resumen se limpia el filtro y vuelven los totales del mes. Las opciones exponen la sucursal autorizada y el tema. El marco de 393 px no tiene desbordamiento horizontal.
- Lectura autenticada de la producción actual (1.0.127): el panel central mostró movimientos de Caja del 09/11 y cuentas de Firebase; no se registró ni modificó ningún movimiento. La Caja local inspeccionada tiene último movimiento del 02/11 y por eso no sirve para comparar saldos actuales.

## Pendientes para entrega

1. Revisión visual y aprobación del dueño de la **nueva** captura antes de publicar el cambio estético; la captura anterior fue rechazada.
2. Cambiar build y URL versionada de los recursos al crear la publicación; mantener `app-version.json`, `sw.js` y `panel.html` coherentes. El build público continúa 1.0.127.
3. Verificar el modo simple en sesión autenticada, cambio de sucursal y formulario sin registrar una operación de prueba; probar Safari e instalación en un iPhone 15 físico. El marco de navegador no simula por completo Safari, notch ni teclado.
4. Verificar manifest, service worker y reapertura sin conexión en Safari; Push y badge no están implementados en esta entrega.
5. Retirar Gemini del panel completo y del servidor solo tras auditar dependencias; el cambio actual elimina su uso automático en este asistente POS.

El IPA de Money Manager suministrado se inspeccionó solo para ubicar la estructura de la app; no se instaló ni se copiaron activos propietarios. La referencia visual fue la captura del dueño.
