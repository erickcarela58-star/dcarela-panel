# Panel web - D' Carela Punto de Venta

Panel publicado:

`https://erickcarela58-star.github.io/dcarela-panel/`

La raiz usa el shell global React `EfferdDashboard2`: sidebar responsive,
topbar, selector de sucursal, alertas y resumen ejecutivo. Ventas, caja,
reportes, inventario, clientes, Finanzas, asistente IA, notificaciones,
dispositivos, respaldos y configuracion se cargan dentro del mismo marco desde
`panel.html?embedded=1`, sin duplicar navegacion. Esa ruta solo se habilita dentro
del iframe same-origin de CURRENT; abierta directamente redirige a la aplicacion actual.

Los datos proceden de Supabase y se actualizan por Realtime y refrescos
controlados. `panel.html` ya no es una ruta publica de recuperacion ni se guarda
en la cache offline; el unico fallback publico es `index.html`.

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

## Asistente IA

El modulo `Asistente IA` conserva conversaciones en Supabase, consulta datos
reales con herramientas tipadas, admite imagenes/PDF y presenta cada escritura
para confirmarla. `owner/admin` tiene control completo por rol. Los demas
usuarios requieren capacidades delegadas y sus propuestas avanzadas esperan
aprobacion administrativa.

La clave de Google AI existe solo como `GEMINI_API_KEY` en Supabase Secrets.
Detalles de seguridad, permisos y pruebas: `docs/ASISTENTE_IA_PANEL_WEB.md` en el
repositorio fuente privado.

## Seguridad y acceso

- Proyecto Supabase: `rdmhyhsrewvrpqygtufa`.
- La clave anonima es publica por diseno; RLS y la funcion validan la sesion.
- `service_role` nunca se envia al navegador.
- Las credenciales estan en `PANEL_LOGIN.txt`, fuera de `web/` y de los releases.

## Publicacion

`.github/workflows/pages.yml` publica `web/` en GitHub Pages. El panel publico
tambien se conserva en `panel-publicar/` para una publicacion estatica directa.
