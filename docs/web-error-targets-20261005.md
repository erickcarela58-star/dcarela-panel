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

## Seguimiento 1.0.112 — selección de proveedor

1.0.111 se publicó con Pages, commit `2cc7315`, y se verificaron contenido HTTP y respuesta real del asistente. La segunda consulta reveló otro fallo: aun seleccionando Forzar Google Gemini, una explicación sobre «saldo de cuenta» se interceptaba como resumen numérico por el buscador local.

1.0.112 mantiene las propuestas financieras y sus aprobaciones antes de la elección del proveedor. En consultas de lectura respeta Gemini explícito y deriva preguntas conceptuales a Gemini cuando se está en automático. No habilita ejecución directa generativa ni cambia datos financieros.

Tres pruebas adicionales verifican Gemini explícito, pregunta conceptual automática y preservación de propuesta pendiente para escrituras. Suite completa: 320 pruebas aprobadas. Build `2026.10.05.1.0.112.0`.

## Seguimiento 1.0.113 — elección reciente frente a historial

La revalidación encontró el selector en cerebro local en la conversación de prueba, pese a haber elegido Automático al finalizar la ronda anterior. `renderIaHistory` asignaba incondicionalmente el modelo del último mensaje, pudiendo sustituir una preferencia más reciente y seleccionar un proveedor que ya no figuraba disponible.

Ahora la preferencia vigente tiene prioridad al recuperar el historial. Sin una nueva preferencia se conserva el modelo disponible de la conversación. Si ese proveedor desapareció, se usa Automático (o la primera opción disponible); una restricción de almacenamiento no impide renderizar el historial. No hay cambio a autenticación, permisos ni aprobación de escrituras.

Cinco regresiones verifican esos casos; cuatro fallaban antes del cambio. Suite completa: 325 pruebas aprobadas. Build `2026.10.05.1.0.113.0`. La confirmación de publicación y la de acceso físico a Plaza siguen siendo verificaciones separadas.
