# Panel web - D' Carela Punto de Venta

Panel publicado: `https://panel.dcarelacompufoto.com/`

La raiz usa el shell global React `EfferdDashboard2`: sidebar responsive,
topbar, selector de sucursal, alertas y resumen ejecutivo. Ventas, caja,
reportes, inventario, clientes, Finanzas, asistente IA, notificaciones,
dispositivos, respaldos y configuracion se cargan dentro del mismo marco desde
`panel.html?embedded=1`, sin duplicar navegacion. Esa ruta solo se habilita dentro
del iframe same-origin de CURRENT; abierta directamente redirige a la aplicacion actual.

La operacion principal usa Firebase Auth y Cloud Firestore con reglas por negocio,
rol y membresia. Los eventos del POS Windows se leen desde `sync_events`, con
ventanas y limites para evitar descargar el historial completo. `panel.html` se
carga dentro del shell y la PWA conserva un fallback offline versionado.

## Edicion administrativa

Los miembros `owner` y `admin` pueden:

- Crear y editar productos y categorias.
- Ajustar inventario con motivo obligatorio.
- Crear, editar y desactivar clientes.
- Editar datos del negocio y del ticket.
- Crear categorias de gastos.

Cada escritura pasa por el adaptador Firebase, valida la sesion y el rol y deja
un evento auditable en `sync_events` para sincronizarse con las cajas.

Ventas, pagos, balances, movimientos de caja y cortes no se editan directamente.
Se corrigen mediante los flujos auditados del POS.

## Asistente IA

El modulo `Asistente IA` conserva primero las conversaciones en el navegador y
las sincroniza en la ruta privada del usuario en Firestore. El cerebro local
consulta ventas, finanzas, inventario, clientes, caja y turnos sin consumir una
API generativa. Google Gemini se ofrece como modelo remoto protegido por el
servidor. Toda escritura se presenta como propuesta y requiere confirmacion.

## Seguridad y acceso

- Proyecto Firebase: `erikccarela`.
- Las reglas de Firestore limitan cada lectura y escritura al negocio y rol autenticados.
- La clave de Google no se envia al navegador.
- No se publican respaldos comerciales, credenciales ni archivos seed.

## Publicacion

La rama `main` publica este directorio con el dominio definido en `CNAME`.
`firebase.json` conserva la configuracion equivalente de hosting y reescribe las
rutas de la aplicacion a `index.html`. El dominio oficial es
`panel.dcarelacompufoto.com`.
