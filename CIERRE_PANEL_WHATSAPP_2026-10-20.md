# Cierre publicado: panel web y asistente financiero

Publicación del 20/10/2026; comprobación repetida el 21/10/2026. La aplicación móvil queda fuera del trabajo por instrucción del dueño. El editor/CRM continúa separado y conserva sus cambios locales.

## Panel web

- URL: https://panel.dcarelacompufoto.com/
- Versión 1.0.118; build 2026.10.20.1.0.118.0.
- Commit publicado: 085d7d80b806636a85e3b63fb8de416528aeed95. GitHub Pages: built, sin error y con ese commit.
- Los 18 archivos de ejecución web descargados coinciden por SHA-256 con el commit. Evidencia: panel-web-1.0.118-verificado.json.
- 395/395 pruebas del cierre web aprobadas, además de sintaxis y revisión de diff. Se conservan los estilos de las gráficas.
- Las cuentas muestran su moneda nativa. Los totales separan DOP y USD; no hay conversión ficticia. Los formularios manuales DOP rechazan cuentas de otra moneda antes de escribir.
- Comprobación actual con sesión autenticada de escritorio: Finanzas > Cuentas cargó, mostró la cuenta USD en US$ y el total separado por moneda. Solo lectura; no se guardaron operaciones ni se cambiaron saldos.
- Captura panel-web-118-monedas-escritorio.png: banco de escritorio con datos ficticios y escrituras bloqueadas, no captura de saldos privados.
- Entrada y bundle de mobile/ idénticos a la entrega 1.0.117 (diff vacío). Instaladores Windows conservados en 1.0.76. No se construyeron ni instalaron aplicaciones nativas.

## Asistente financiero de WhatsApp

Release d5fad484413c4c27b6bcc75c39a4c2eb96b47e7c, tag release-finanzas-final-20261020. Únicamente estas dos funciones:

| Función | Revisión | Estado/build | Archivos SHA-256 |
|---|---|---|---|
| crmWebhook | crmwebhook-00177-sul | ACTIVE / SUCCESS | 590 |
| crmFinanceNotificationRetry | crmfinancenotificationretry-00035-nox | ACTIVE / SUCCESS | 575 |

Ambas verificadas nuevamente contra sus fuentes publicadas, con configuración conservada. Evidencia completa de revisiones y builds en verification-finanzas-final.json.

La confirmación de pago a tarjeta actualiza deuda y crédito disponible atómicamente y rechaza datos inconsistentes/sobrepagos. El worker revisa acuses sending/unknown con cursor persistido, autorización y confirmaciones tardías, sin reenviar mensajes inciertos ni ejecutar dinero. Su cola habitual se conserva.

Pruebas de desarrollo: 2083/2083 sin red real. Fuente integrada del webhook: 543/543; worker: 6/6. Son suites superpuestas, no cantidades de casos independientes para sumar. Consultas paginadas de ambas colecciones aceptadas por Firestore, sin crear índices ni cambiar registros.

No se enviaron mensajes ni se hicieron gastos, pagos, transferencias, cortes o ajustes históricos de prueba reales. No acredita entrega física de WhatsApp ni estado de Caja/Plaza. Conciliación/reversión general, creación/anulación de impuestos vinculados y referencias ambiguas siguen requiriendo el movimiento exacto en Money Manager. Cambio de divisas con cotización no implementado.

## Cambios del otro asistente revisados el 21/10

Carpeta C:\tmp\dcarela-crm-editor-v230; HEAD cbe2a47. Se leyó el texto pegado, PAUSA_EDITOR_V244_2026-10-20.md y RELEVO_EDITOR_V243_2026-10-20.md, y se contrastaron con el código actual.

Confirmados: miniatura con geometría real del degradado, normalización de escala de formas, cancelación del pincel con touchcancel y descarga que espera el guardado. También aparecen los bloques posteriores v245 de capas/multiselección y v246 de controles numéricos compactos y tirador de radio. No se editaron ni se incluyeron sus cambios sin commit en esta publicación.

Validación focal actual: 26/26 pruebas del panel (editor/vista/capas/acabados) y 21/21 del motor (capas, radios, mesas, panorama, sujeto/formas). Incluye rasterización, continuidad de cortes y orden de propuestas/ZIP con proveedores simulados. No certifica gestos visuales completos, publicación real ni la suite global actual del CRM. El relevo conserva pendientes visuales y el aprovisionamiento del modelo de sujeto en Firebase. El editor sigue local y pausado; su banco antiguo 8803 ya no responde. No se reinició ni desplegó el CRM/puente por esta revisión.

## Fuentes y relevo

- Panel: C:\tmp\dcarela-panel-integral-20261020\RELEASE_WEB_1.0.118_2026-10-20.md.
- Desarrollo financiero: C:\tmp\dcarela-finanzas-final-20261020\CIERRE_FINANZAS_ESTABLE_2026-10-20.md.
- Release financiero sellado: C:\tmp\dcarela-finanzas-release-final-20261020. No distribuir work/, fuentes privadas ni metadatos de credenciales.
- Este documento y los dos informes JSON se conservan en outputs/ del chat; copia de relevo en el escritorio y en el repositorio del panel.
