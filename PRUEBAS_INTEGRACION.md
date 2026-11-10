# Pruebas Finanzas V3.3 — 10/11/2026

| Caso | Estado | Evidencia |
|---|---|---|
| Motor original, incluido `finance-revision-core.js` | PASÓ | `panel.html` y `finanzas/index.html`; 48 pruebas focales pasaron. |
| Sucursales por membresía, `?b=` ajeno, login ausente | PASÓ en banco sintético | `finanzas/data-source.test.mjs`; el navegador local sin sesión mostró “Datos no verificados”. |
| Lectura canónica y rechazo de error parcial, documento ajeno, cuenta sin saldo base, cambio de UID | PASÓ en banco sintético | 6 pruebas nuevas; `getFinanceJournal` se invoca una vez con cuentas ya leídas. |
| Finanzas/adapter/Caja Firebase regresión local | PASÓ | 146 pruebas, 0 fallos; `.local-tests/finanzas-v33-regresiones.log`. |
| Diseño V3.3 oscuro, Resumen y logos en navegador local | PASÓ en demo local | `finanzas-v33-local-demo-iphone15.png` (datos inventados). |
| Producción sin sesión no presenta saldo ni habilita Registrar | PASÓ local | `finanzas-v33-sin-sesion.png`. |
| Saldo real Caja Windows = CRM = PWA | NO VERIFICADO | No se leyó Caja física ni se utilizaron saldos de producción. `MATRIZ_SALDOS.csv` contiene solo fixtures. |
| Firestore Emulator: escrituras, reglas, doble clic e idempotencia | NO VERIFICADO | La CLI Firebase está disponible, pero `java` no está en PATH y no hay emulador configurado en `firebase.json`; compuerta de producción cerrada. |
| Firebase real con sesión, sucursales y datos autorizados | NO VERIFICADO | No se abrió una sesión real en esta ruta ni se consultaron cuentas productivas. |
| Safari iPhone 15 físico e instalación PWA | NO VERIFICADO | Captura de navegador en tamaño móvil; no prueba física. |
| URL/commit publicado | NO APLICA | Rama local sin push ni despliegue, según la restricción del dueño. |

## Comandos ejecutados

`node --test finanzas/data-source.test.mjs finance-core.test.js money-manager-core.test.js simple-finance-core.test.js`

`node --test` con todos los `firebase-*.test.js`, `finance-*.test.js`, `pwa-caja-firebase-e2e.test.js` y los motores: 146/146.

`node --check finanzas/app.js`, `node --check finanzas/data-source.js`, `git diff --check`.

Servidor local `py -m http.server 8899 --bind 127.0.0.1`; captura en `http://127.0.0.1:8899/finanzas/?mode=demo&b=sucursal-a` y comprobación sin sesión en `/finanzas/`.

## Funciones

- **Conectadas para lectura, pendientes de validar con sesión real:** Resumen, Diario, Calendario, Semana, Mes, Estadísticas, Búsqueda, cuentas, detalle de cuenta/movimiento, tarjetas, presupuestos y compromisos.
- **Solo emulador por código, sin validación E2E:** `fin.movement.create`, `fin.transfer.create`, `fin.movement.cancel`, `fin.account.reconcile`.
- **Bloqueadas en UI real:** toda escritura financiera, editar cuenta/movimiento, pagos de compromisos y gestión de tarjetas/presupuestos.

## Para una activación futura

1. Configurar Firestore Emulator aislado y ejecutar la matriz de escrituras/permisos con datos sintéticos.
2. Comparar los mismos eventos y saldos por cuenta/moneda en Caja Windows, CRM y PWA; registrar diferencias en centavos sin modificar producción.
3. Probar Safari físico y tiempo/costo de lectura histórica.
4. Solicitar aprobación expresa del dueño para publicar la ruta; otra autorización para abrir escrituras reales tras las pruebas.
