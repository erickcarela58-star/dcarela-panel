# PWA 35.62 candidata para nube local

La rama `codex/pwa-nube-3562-20261120` integra la PWA 35.61 pública (**33eeb49**) y la adaptación de la 35.60 a la nube local (**1928884**). Se conservan las rutas de tarjetas, compromisos, Caja y libros fiscales junto con el trabajo previo de Antigravity.

Central y Plaza cargan la capa de compatibilidad de `nube-sdk/compat.mjs` y leen el origen de `nube-config.js`. El caché de la 35.62 incluye estos módulos y los del Facturador. Las consultas REST y las acciones del adaptador financiero usan el origen local cuando está configurado. Las páginas antiguas que todavía usan el transporte anterior conservan su configuración.

El Facturador lee páginas de hasta 1.000 documentos del historial, ordenadas por identificador de documento, y aplica el mismo filtro de sucursal en cada página. Una lectura fallida o un cursor repetido interrumpen la consulta para evitar publicar sumas parciales.

`node --test` dio **518 aprobadas, 0 fallos, 1 omitida** (emulador). La prueba anterior de la 35.60 en Chrome y API/PostgreSQL aislados verificó sesión compartida con CRM y pago de tarjeta de 225.000 ct. El saldo de banco cambió de 1.000.000 a 775.000 ct y el de tarjeta de −225.000 a 0 ct. Evidencia en `C:/tmp/dcarela-crm-local-ui-qa-result.json`.

La prueba de 35.62 en Chrome a 390×844 con Playwright y API/PostgreSQL aislados verificó **1.002 comprobantes ficticios en Central en dos páginas del servidor**, con 1.001 ventas y una nota de crédito para un neto de **11.800.000 ct**. El filtro de octubre mostró **11.800 ct** sin consultas adicionales. Plaza reutilizó la sesión y mostró su único comprobante de **23.600 ct**. Hubo cero errores JavaScript, fallos HTTP y escrituras productivas. El service worker se bloqueó en el navegador de prueba. [Resultado de la prueba](C:/tmp/dcarela-pwa-facturador-3562-local.json) · [Captura de Central](C:/tmp/dcarela-pwa-facturador-3562-local.png).

**Publicación de Facturador en modo provisional.** Finanzas 35.61 dejó de cargar en el dominio público al agotar la cuota de Firebase. La 35.62 se publica en GitHub Pages para consultar los comprobantes ya disponibles en Servicios. El libro general permanece en conciliación y sus escrituras se habilitan después del cambio coordinado de POS, Hermes, colectores y tareas. La confirmación del propietario sobre la tarjeta ya pagada, con deuda 0, límite RD$10.000, corte 5 y pago 1, se conserva privadamente en ambos equipos en `control/owner-card-confirmation.json` para cotejarla con el registro vigente.
