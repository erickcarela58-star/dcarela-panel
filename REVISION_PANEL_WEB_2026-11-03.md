# Revisión del panel web — 03/11/2026

Pedido vigente: retomar el panel web y corregir errores documentados que siguen abiertos. Se revisa `https://panel.dcarelacompufoto.com/`, separado del CRM v390 ya cerrado.

Fuente: rama `codex/panel-web-errores-20261103`, `C:\tmp\dcarela-panel-web-20261103`, base `f7a9948` (web publicada 1.0.118, código `085d7d8`). La copia `dcarela-panel-publish/main` en 1.0.116 es anterior y no debe sobrescribir esta base. Producción confirmó 1.0.118. Suite base: **395/395**.

## Documentos contrastados

`CONTINUIDAD.md`, `REVISION_PANEL_FINANZAS_2026-10-20.md`, `RELEASE_WEB_1.0.118_2026-10-20.md`, `CIERRE_PANEL_WHATSAPP_2026-10-20.md`, `docs/web-error-targets-20261005.md` y auditorías de CURRENT conservadas en el POS. Las órdenes y cifras antiguas se toman como contexto, no como operaciones que deban ejecutarse otra vez.

## Incidencias reproducidas

1. **Categorías del gráfico que no filtran:** en producción, el primer segmento envía `sin-categoria`, pero ese valor no existe en el selector. El navegador lo convierte en vacío, aparece «Todas» y se muestran seis filas al pulsar un segmento. Otras categorías referenciadas por el historial tampoco están en el catálogo actual. Los tres segmentos se rotulan «Otros gastos» aunque son grupos distintos.
2. **Periodo perdido al abrir el gráfico:** su clic no transmite fechas al listado de movimientos, que no tiene filtros de fecha. El libro Firebase se limita al mes cargado, pero un gráfico de día/semana o un periodo más pequeño puede abrir operaciones ajenas a ese segmento/periodo. No se afirma que producción mezclara todos los meses en una sola tabla.
3. **Comisiones:** el gráfico incluye comisiones de transferencia en el resultado, pero abre un filtro solo de movimientos `gasto`, excluyendo el movimiento que aporta la comisión.

4. **Tarjetas y monedas:** la pestaña Tarjetas usa el formato DOP para deuda/disponible USD; Compromisos suma deudas DOP y USD como pesos. Además ofrece botones de configuración/pago/consumo a lectores. Reproducido con las funciones reales y comprobado después en navegador con identidades ficticias.
5. **Préstamos sin saldo verificado:** Compromisos convierte los `null` del resumen contractual en cero, aunque Money Manager ya conservaba el estado desconocido. La cuota mensual no demuestra la deuda total ni el capital pendiente.
6. **Fechas de tarjetas:** al editar una tarjeta con corte/pago propios, el formulario los reemplaza por 30/5 y los deja bloqueados. El selector también permite otra tarjeta sin cargar su configuración.
7. **Historial extenso:** el listado construye una fila DOM por cada resultado y recalcula el catálogo por cada fila buscada. Se revisó con 12.008 movimientos sintéticos.

## Correcciones y alcance

- El detalle del gráfico conserva categoría, fecha inicial/final y gastos que aportan al resultado, incluidas las comisiones. Limpia filtros de otra cuenta. Las categorías históricas siguen disponibles con una referencia honesta si falta su nombre; «Sin categoría» tiene identidad propia.
- Los controles Desde/Hasta y Limpiar filtros delimitan el **libro cargado**, cuyo mes se muestra. No descargan meses adicionales por sí solos. Para otro mes se cambia el periodo superior. Un rango invertido conserva su error, también con cuenta seleccionada.
- Historial en páginas de 100 filas, retorno a página 1 al cambiar filtros y navegación por teclado. La búsqueda reutiliza mapas de categorías/cuentas. El CSV y el PDF siguen exportando todos los resultados filtrados, con las mismas categorías que la tabla; el PDF identifica el alcance filtrado.
- Tarjetas conserva la moneda real de deuda/disponible/saldo a favor. El resumen agrupa tarjetas por moneda y excluye las eliminadas. No hay conversión ni suma DOP+USD. Los lectores consultan sin controles de escritura. Las operaciones manuales DOP solo ofrecen tarjetas/cuentas de pago admitidas por ese flujo.
- Editar tarjeta conserva corte/pago y permite corregirlos; cambiar de tarjeta carga su configuración. Se retiró la afirmación fija «corte 30/pago 5» y la de estado «en tiempo real». Se conserva el cálculo existente para meses cortos.
- Compromisos muestra `--` y «Saldo sin verificar» para deuda/capital desconocidos. La confirmación de desactivación también conserva ese estado. Cero verificado sigue siendo cero.
- Las métricas ahora presentan la explicación opcional que sus llamadas ya proporcionaban. No se cambian motores, estilos, colores ni degradados de las gráficas.

Las comprobaciones reales son de lectura: no se guardan pagos, gastos, conciliaciones, ventas ni ajustes ficticios en producción.

## Evidencia local

- `node --test *.test.js ai-core/*.test.js`: **408/408**, base 395. Regresiones con funciones reales: categorías/fechas/comisiones, tarjetas/monedas/permisos/configuración y paginación/CSV completo. Fallos originales observados antes de corregirlos; los casos de conservación verifican comportamiento admitido.
- `node --check panel.js`, `git diff --check` correctos.
- Banco reproducible: `node .local-tests/web-review-preview.cjs 8897`. Usa el shell y panel reales, datos sintéticos, CSP sin conexiones y escrituras rechazadas. Variantes `?role=admin`, `?large=1` y `?slow=1`; no usa credenciales, clientes ni saldos reales.
- Navegador: gráfico → Sin categoría conserva 2 registros (gasto/comisión), fechas y selector; lector sin acciones de tarjeta; administrador con acciones DOP y USD solo consulta; préstamo desconocido separado de cuota; 12.008 registros/100 filas/página siguiente y búsqueda desde página 2; CSV completo comprobado con la función real.
- Inventario: editar abre; guardado deliberadamente rechazado en el banco conserva formulario, error y reintento; Cancelar funciona. Clientes: abrir y cerrar con Escape. Reportes: gráficas y tablas cargan. Escritorio 1024×768 oscuro y vista responsive 390×844 sin desbordamiento horizontal de página; esto no certifica un teléfono físico ni una app nativa.
- Capturas con datos ficticios en `outputs` del chat: `panel-web-filtros-20261103.png`, `panel-web-tarjetas-lector-20261103.png`, `panel-web-reportes-oscuro-20261103.png`, `panel-web-tarjetas-compacto-20261103.png`. Log `work/panel-web-cambios-tests.log`.

## Publicación

Preparada Web/PWA **1.0.119**, build `2026.11.03.1.0.119.0`. Entradas, caché y manifiesto coherentes; Windows 1.0.76, manifiestos/instaladores y entrada/bundle móvil conservados. Falta confirmar GitHub Pages y cotejo HTTP tras publicar. No se despliega backend, CRM ni WhatsApp.

## Cola heredada que debe contrastarse

- La matriz local anterior amplía formularios, roles, teclado, distribución y volumen. No declara probada cada combinación de cada módulo secundario; se conserva la distinción entre fixtures y sesiones reales.
- El paginado reduce el DOM; no reduce automáticamente las lecturas de Firestore ni demuestra su latencia/índices remotos. La causa de las esperas históricas no quedó demostrada por esta prueba local.
- Descripción comercial de productos y catálogo/portafolio: desarrollo funcional pendiente del relevo anterior. Los accesos publicados siguen siendo enlaces. No se añadió un campo web que finja sincronizarse con un esquema de Caja sin soporte ni se publicaron fotos/productos inventados.
- Sincronización por sede: la señal de Central no certifica la Caja física de Plaza.

No se retoma el asistente financiero de WhatsApp, el CRM/editor ni la aplicación móvil nativa con fuentes antiguas. Los cambios y su alcance de publicación se registrarán al verificarse.
