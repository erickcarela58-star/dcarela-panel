# PWA Finanzas simple — iPhone 15 (09/11/2026)

Estado: **prototipo local, no publicado ni instalado en un iPhone real**. Rama `main`, base `8d3336b`. No se modificaron ventas, Caja, saldos ni datos de producción.

## Alcance

- `panel.html?simple=1` comparte autenticación, sucursal y libro con el panel central. La navegación móvil contiene Resumen y Finanzas.
- Finanzas presenta mes, Diario, Calendario, Semana, Mes y Resumen. Entradas, salidas y resultado se calculan en DOP; USD permanece separado y las transferencias no cuentan como ingresos o gastos.
- El administrador puede abrir los formularios existentes de ingreso y gasto desde un único botón. No existe un segundo libro contable.
- `manifest-simple.webmanifest` identifica la PWA por separado. El service worker incluye sus archivos y una página sin conexión que no muestra importes posiblemente vencidos.
- El modo automático del asistente POS ya no llama a Gemini. La opción explícita de Google continúa en el panel completo y no se ha retirado su clave del servidor.

## Pruebas realizadas

- 419/419 pruebas Node aprobadas; `node --check panel.js` y `git diff --check` sin errores.
- Vista local aislada con datos ficticios, sin conexión a Firebase ni escritura: `node .local-tests/web-review-preview.cjs 8898` y `http://127.0.0.1:8898/qa-simple-iphone.html` (marco de 393 × 852).
- Se inspeccionaron Diario, Calendario, Semana y Resumen. El calendario cabe en el ancho de 393 px y el detalle del día usa lista compacta.

## Pendientes para entrega

1. Revisión visual y aprobación del dueño antes de publicar el cambio estético.
2. Cambiar build y URL versionada de los recursos al crear la publicación; mantener `app-version.json`, `sw.js` y `panel.html` coherentes. El build público continúa 1.0.127.
3. Verificar inicio de sesión, cambio de sucursal, movimientos y formulario con datos reales sin registrar una operación de prueba; probar Safari e instalación en un iPhone 15 físico. El marco de navegador no simula por completo Safari, notch ni teclado.
4. Verificar manifest, service worker y reapertura sin conexión en Safari; Push y badge no están implementados en esta entrega.
5. Retirar Gemini del panel completo y del servidor solo tras auditar dependencias; el cambio actual elimina su uso automático en este asistente POS.

El IPA de Money Manager suministrado se inspeccionó solo para ubicar la estructura de la app; no se instaló ni se copiaron activos propietarios. La referencia visual fue la captura del dueño.
