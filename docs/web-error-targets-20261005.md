# Web/PWA 1.0.111 — preservar destinos operativos de error

## Fallo verificado

La carga correcta de un módulo eliminaba todos sus párrafos `p.error`. Eso incluía controles permanentes como `iaError` y `virtualCashError`, no solo avisos transitorios de carga. En producción 1.0.110 se observó `iaError` ausente tras cargar Asistente IA y una excepción al intentar asignarle `textContent` antes del envío; el estado ocupado quedaba activo.

## Corrección

Los avisos creados por `mostrarError` llevan ahora `data-module-error` y `role="alert"`. Tanto la limpieza previa de esos avisos como la limpieza tras una carga correcta se limitan a ese marcador. No se eliminan controles operativos, no se cambia el diseño y no se modifican motores financieros, membresías, cuentas ni datos comerciales.

Se alinearon el identificador interno, el manifiesto y las entradas desktop/mobile/PWA en 1.0.111, build `2026.10.05.1.0.111.0`. Los instaladores Windows permanecen en 1.0.75.

## Pruebas

`panel-error-target-runtime.test.js` reproduce el fallo de eliminación antes de la corrección y verifica después preservación de destinos, limpieza exclusivamente transitoria, dos envíos sucesivos, conservación del borrador si falla el proveedor y liberación del botón para reintentar. Los envíos del test usan un proveedor simulado; no crean movimientos reales.

`node --test *.test.js ai-core/*.test.js`: 317 pruebas aprobadas.

## Límite de verificación

Las pruebas locales no certifican despliegue ni acceso físico en otra PC. La publicación se debe comprobar mediante commit de Pages y contenido HTTP; la respuesta del asistente, mediante consulta no contable en el navegador. No crear ventas, ajustes o aperturas para esta prueba.
