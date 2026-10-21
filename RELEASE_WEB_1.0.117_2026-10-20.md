# Web/PWA 1.0.117 — cierre estable

El dueño autorizó dejar en versión final el panel web y el asistente financiero. Este documento corresponde al panel POS; el CRM/editor de otro asistente se conserva aparte.

Build `2026.10.20.1.0.117.0`. Incluye la reorganización local del 14/10 y las correcciones financieras del 20/10. Conserva las gráficas, su clasificación contable, los periodos de Reportes y las versiones/URL/hashes de los instaladores Windows 1.0.76 publicados por la otra línea de trabajo. No instala ni reinicia la Caja física.

## Resultado

- Navegación de módulos sin volver involuntariamente a Resumen, distribución común, herramientas organizables y detalle de cuenta con aislamiento de sucursal/sesión.
- Recuperación de acceso con reintento y errores visibles, sin eliminar los controles permanentes de error.
- Actualizaciones financieras simultáneas compartidas; un guardado posterior obliga a verificar de nuevo. Una consulta fallida conserva la instantánea pero invalida su frescura.
- Deuda y capital desconocidos visibles como no verificados; pagos sin acciones de edición en sesiones lectoras.
- Planificación de Finanzas y Money Manager coherente para préstamos, facturas y planes, sin duplicar cuotas materializadas.
- Manifiesto, recursos versionados, entrada móvil y caché PWA alineados en 1.0.117.

## Validación

389/389 pruebas Node; sintaxis y diff sin errores. Revisión en navegador con fuentes ficticias y escrituras bloqueadas: Resumen, Finanzas, Money Manager, cuentas, Reportes/gráficas, Clientes, Inventario y Caja; adaptación móvil a viewport 390 × 844 en claro/oscuro. Pruebas ejecutadas por el asistente, sin delegar el QA al dueño.

La publicación debe verificarse por commit de Pages y contenido HTTP, por separado de los resultados locales. No se afirma instalación de Caja, aplicación de colas ni corrección de saldos históricos por publicar este panel.

## Límites del cierre

Los enlaces a catálogo/portafolio son accesos al sitio comercial; no equivalen a importar sus fotografías al catálogo POS. La integración comercial ampliada, el diagnóstico físico de terminales y la medición remota con volúmenes reales conservan su seguimiento separado. Una versión estable no acredita operaciones financieras reales que no se han ejecutado.
