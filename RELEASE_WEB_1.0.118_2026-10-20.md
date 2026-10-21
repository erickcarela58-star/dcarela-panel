# Panel web 1.0.118 — monedas y cierre

Continúa la entrega 1.0.117. La comprobación de escritorio con sesión autenticada detectó que una cuenta configurada en USD se rotulaba como RD$ y entraba sin conversión en el total de pesos. Se inspeccionó su configuración y se canceló el diálogo; no se guardaron cambios ni movimientos reales.

## Corrección

- Resumen de escritorio, Finanzas, Money Manager y detalles de cuenta muestran el saldo en su moneda.
- Los totales de cuentas separan DOP y USD; no se inventa una cotización ni se presenta su suma como patrimonio convertido. Los indicadores numéricos internos de patrimonio/disponible/deuda de Money Manager quedan expresamente restringidos a DOP; la presentación usa el desglose por moneda.
- Los formularios manuales de movimientos, gastos, transferencias, conciliación y publicación de movimientos que generan asientos DOP rechazan cuentas de otra moneda antes de confirmar escrituras. El cambio de divisas requiere un flujo explícito con cotización y no se añade en esta entrega.
- Se conservan gráficas, periodos, instantáneas y saldos almacenados. No se migran ni compensan datos históricos.

## Alcance y verificación

Build web `2026.10.20.1.0.118.0`. 395 pruebas Node, sintaxis y diff. Incluye regresiones de moneda nativa, total separado, tarjetas de Finanzas/Money Manager, resumen de escritorio y rechazo atómico de cinco operaciones manuales en USD. Banco local con datos ficticios y escrituras bloqueadas: total por moneda y tarjeta USD visibles.

Por instrucción expresa del dueño, no se continúa el trabajo en la aplicación móvil. Su entrada y bundle permanecen como en la entrega anterior; no se construyen, publican ni instalan aplicaciones nativas. Tampoco se modifican instaladores Windows (1.0.76), Caja física, CRM/editor ni el puente de WhatsApp. Los módulos web compartidos pertenecen a esta entrega del panel.

La comprobación posterior de Pages, hashes HTTP y lectura autenticada se documenta en el cierre conjunto de panel y WhatsApp. Esa evidencia no sustituye una operación financiera o mensaje real, que no se ejecutaron.
