# Panel web - D' Carela Punto de Venta

Panel publicado:

`https://erickcarela58-star.github.io/dcarela-panel/`

Muestra ventas, caja, reportes, inventario, clientes, gastos, notificaciones,
dispositivos, respaldos y configuracion. Los datos proceden de Supabase y se
actualizan por Realtime y refrescos controlados.

## Edicion administrativa

Los miembros `owner` y `admin` pueden:

- Crear y editar productos y categorias.
- Ajustar inventario con motivo obligatorio.
- Crear, editar y desactivar clientes.
- Editar datos del negocio y del ticket.
- Crear categorias de gastos.

Cada escritura pasa por `pos-admin-write`, valida la sesion y el rol, registra
`sync_events`, `audit_logs` y `system_alerts`, y despues llega a las cajas por
`pos-sync-pull`.

Ventas, pagos, balances, movimientos de caja y cortes no se editan directamente.
Se corrigen mediante los flujos auditados del POS.

## Seguridad y acceso

- Proyecto Supabase: `rdmhyhsrewvrpqygtufa`.
- La clave anonima es publica por diseno; RLS y la funcion validan la sesion.
- `service_role` nunca se envia al navegador.
- Las credenciales estan en `PANEL_LOGIN.txt`, fuera de `web/` y de los releases.

## Publicacion

`.github/workflows/pages.yml` publica `web/` en GitHub Pages. El panel publico
tambien se conserva en `panel-publicar/` para una publicacion estatica directa.
