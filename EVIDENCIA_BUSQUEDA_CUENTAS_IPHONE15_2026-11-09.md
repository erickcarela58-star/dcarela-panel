# Búsqueda y Cuentas, referencia Money Manager — 09/11/2026

Estado: **candidato local para iPhone 15, sin publicar**. Se conserva Firebase y el libro del panel central. No se modificaron saldos ni movimientos reales.

## Evidencia de la referencia

Fuentes oficiales de Realbyte revisadas el 09/11/2026:

| Pantalla o función | Comportamiento documentado | Fuente |
| --- | --- | --- |
| Transacciones / búsqueda | La lupa superior izquierda abre otra pantalla. Busca por palabra con autocompletado; periodo, cuenta y categoría de ingreso/gasto filtran los resultados. | [How to search](https://help.realbyteapps.com/hc/en-us/articles/360043325753-How-to-search) |
| Cuentas | Muestra activos y pasivos arriba; tocar una cuenta abre su historial. Permite agregar, editar, ocultar y ordenar. | [How to register/edit/delete/rearrange an account](https://help.realbyteapps.com/hc/en-us/articles/360042844574-How-to-register-edit-delete-rearrange-an-account) |
| Exclusión de totales | Una cuenta excluida sigue apareciendo en transacciones y estadísticas; solo deja de sumar al total de Cuentas. | [How to exclude balance of certain accounts from totals](https://help.realbyteapps.com/hc/en-us/articles/360046152154-How-to-exclude-balance-of-certain-accounts-from-totals) |
| Organización general | La guía iOS separa Home, transacciones, estadísticas, cuentas, tarjetas y ajustes. El sitio del producto destaca filtros, calendario, presupuestos y gráficos. | [iOS User Guide](https://help.realbyteapps.com/hc/en-us/categories/360003093873-iOS-User-Guide), [realbyteapps.com](https://www.realbyteapps.com/) |

También se observaron las [capturas oficiales de Transacciones](https://www.realbyteapps.com/images/main/img_sreen_light1.png) y [Cuentas](https://www.realbyteapps.com/images/main/img_sreen_light7.png). La segunda dispone tres totales en una franja y separa efectivo, bancos y tarjetas con encabezados discretos. Esta organización reemplaza la lista única del primer candidato.

La [captura oficial del filtro de cuentas](https://help.realbyteapps.com/hc/article_attachments/360089872633/Search.PNG) muestra casillas para seleccionar varias cuentas. El primer candidato tenía un `<select>` de una sola cuenta; se reemplazó por una hoja de selección múltiple.

El IPA entregado se inspeccionó previamente para estructura y textos. En esta PC Windows no ejecuta la interfaz iOS; la evidencia exacta de búsqueda y cuentas procede de la documentación oficial y capturas del fabricante. No se copiaron iconos ni recursos propietarios.

## Adaptación en D’ Carela

- Lupa de Finanzas → pantalla `#buscar` separada. El campo acepta palabra o importe y sugiere descripciones; filtros de periodo, varias cuentas, tipo y categoría. Consulta el diario de Firebase solo al pulsar Buscar. Tras la búsqueda, pliega filtros y presenta totales DOP y filas por fecha. Otros importes conservan su moneda en cada fila. El periodo máximo es de 366 días y se muestran 200 filas, informando cuando hay más.
- Tab inferior `Cuentas` → disponible, deuda y neto por moneda, sin conversión inventada; grupos separados de efectivo, bancos y tarjetas. Tocar una cuenta abre su historial mediante la búsqueda filtrada. Las cuentas excluidas del total quedan visibles con su estado.
- El administrador puede abrir la conciliación de cada cuenta, y las tarjetas conservan consumo y pago. El formulario pide saldo comprobado y motivo. Estas acciones usan las funciones ya existentes del libro; la prueba local no guardó nada.
- Resumen, Finanzas y Cuentas comparten la misma sesión, sucursal y datos. La navegación y los iconos son nuevos y propios; no se instaló Money Manager en el CRM.

## Verificación local

- Fixture aislado `http://127.0.0.1:8898/qa-simple-iphone.html`, marco 393 × 852, solo datos ficticios y CSP sin conexión externa ni escrituras.
- “Venta POS” en `#buscar`: 7 filas y RD$8,750.00 de entradas; filtros plegados después, resultados visibles. Captura: `.local-tests/pwa-busqueda-resultados-iphone15-final.png`.
- Hoja de cuentas: seleccionadas Efectivo y Banco Popular, el botón mostró “2 cuentas” y la búsqueda encontró las siete ventas de Efectivo. Captura de la hoja: `.local-tests/pwa-busqueda-cuentas-multiples.png`. No hubo llamadas a la nube.
- Cuentas: 8 cuentas ficticias, disponible RD$27,200.00 y US$64.00; deuda RD$100.00 y US$64.00; neto RD$27,100.00 y US$0.00. Captura revisada: `.local-tests/pwa-cuentas-iphone15-grupos.png`.
- Tocar Efectivo abrió `#buscar` con esa cuenta seleccionada y sus 7 movimientos. Con rol de prueba administrador se abrió “Conciliar Efectivo” con saldo RD$3,200.00, campo de motivo y botón Guardar; se pulsó Cancelar. No se escribió ningún movimiento.
- `node --test`: 420/420 aprobadas. `node --check panel.js` y `git diff --check` aprobados.

## Pendiente para publicación

Mostrar al dueño las capturas y obtener su OK estético. Luego actualizar build, manifest y service worker juntos, probar sesión autenticada sin escrituras, y verificar Safari e instalación en un iPhone 15 físico. La Caja vigente transporta eventos a Firebase, pero no se ha confirmado igualdad de saldos reales entre la terminal actual y la PWA.
