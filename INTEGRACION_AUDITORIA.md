# Auditoría de integración Finanzas V3.3 — 10/11/2026

## Fuente real y alcance

- Rama de trabajo: `codex/integracion-finanzas-v33`, creada sobre `c0a112c`. Sin despliegue ni cambios en datos de producción.
- Repositorio del panel: `C:\Users\Erick\Documents\dcarela-panel-publish`. `panel.html` carga el SDK Firebase compat 10.13.0, `firebase-config.js`, `finance-revision-core.js`, `finance-core.js`, `money-manager-core.js`, `simple-finance-core.js` y `firebase-adapter.js` en ese orden. También conserva rutas heredadas Supabase, pero Finanzas V3.3 usa solo Firebase Auth y Firestore.
- El ZIP V3.3 era una maqueta: `app.js` iniciaba en sucursales ficticias y `data-source.js` leía fixtures salvo `?mode=live`. No se copió su carpeta `engine` ni el contrato/reglas de referencia al sitio.
- La ruta nueva `finanzas/` carga los motores originales desde la raíz del panel. `finance-revision-core.js` se recupera del repositorio real, no del ZIP. El panel existente solo recibe un enlace a la PWA de lectura.

## Libro y autorización

- Se reutiliza `window.DcarelaFirebase` y la sesión persistida de Firebase Auth del mismo origen. `waitForAuthState` espera la restauración; `getMembershipsForUser(uid)` y `getBusinessesByIds(ids)` limitan el selector a sucursales activas autorizadas. `?b=` no concede acceso.
- En cada lectura se vuelve a verificar la membresía, la sucursal y el UID. Todas las colecciones y filas del diario deben declarar el `business_id` pedido. Una lectura incompleta, cuota, desconexión, cuenta sin saldo base o sesión cambiada bloquea las cifras.
- `getFinanceJournal(businessId,{accounts,preferences})` es el diario canónico que une archivo, eventos de Caja, ventas y movimientos; no hay colección alternativa ni escritura directa. Los saldos usan `DcarelaFinanceCore.effectiveAccountBalance` del panel.
- La vista normal es de solo lectura. Los controles de crear, transferir, conciliar, anular y editar quedan deshabilitados. `commitAction` solo puede llamar las cuatro acciones contables existentes desde localhost con proyecto `demo-*`, compuerta explícita y rol owner/admin; falta prueba con Firestore Emulator para abrir siquiera ese circuito de escritura.
- Demo requiere `?mode=demo`, importa fixtures solo en ese modo y nunca aparece como lectura real. Service Worker limitado a `finanzas/` y a recursos estáticos; no intercepta el diario, Firebase ni otras rutas del panel.

## Archivos modificados

- `panel.html`: enlace a la ruta aislada, sin sustituir secciones financieras actuales.
- `finanzas/index.html`, CSS V3.3, logos e iconos originales: interfaz conservada; scripts de motor/adaptador apuntan a la raíz real.
- `finanzas/app.js`: sucursales autorizadas, fecha actual, tema oscuro predeterminado, lectura por sesión y bloqueo visible de escrituras.
- `finanzas/data-source.js`: autorización, lectura canónica, validación de completitud y compuerta de escritura solo para emulador.
- `finanzas/sw.js`, `finanzas/manifest.webmanifest`: alcance PWA propio, caché solo de shell estático.
- `finanzas/data-source.test.mjs`: pruebas sintéticas de permisos, fallos de lectura y compuerta de escritura.
- `finanzas/emulator-rules.test.mjs`: Auth y reglas Firestore reales en proyecto `demo-*`, sin tocar datos productivos.
- `firebase-adapter.js`: proyectos `demo-*` consultan el SDK conectado al emulador; el REST público permanece para producción.

## Diferencias y riesgos pendientes

- No se comprobó una sesión real autorizada ni el saldo de Caja Windows frente a PWA. Las capturas son del demo local o de la pantalla local sin sesión, nunca de saldos reales.
- El adaptador real contiene operaciones idempotentes; 33 pruebas de ejecución y reintentos pasaron. Las reglas de Firestore y Auth pasaron en emuladores aislados para lectura/escritura de Central, rechazo de Plaza, lector sin escritura y borrado denegado. Una transferencia se guardó desde la PWA en el emulador y mantuvo el patrimonio; faltan recorridos UI de ingreso, gasto, conciliación y anulación. Ninguna escritura se habilitó en producción. En proyectos `demo-*` el adaptador usa el SDK emulado en vez del REST público.
- La Caja instalada en esta PC está atrasada frente al panel remoto: última venta local 02/11 y última sincronización 03/11, con 43 eventos pendientes. El panel autenticado mostró datos del 09/11. Esa base no sirve como testigo para afirmar paridad de saldos actuales.
- El diario histórico es costoso; esta ruta lo consulta una vez por carga/cambio de sucursal y reutiliza los cortes del adaptador. Falta medir cuota y latencia con historial real.
- Safari en iPhone 15 físico, instalación PWA, notch, teclado, modo offline y accesibilidad aún no están verificados.
