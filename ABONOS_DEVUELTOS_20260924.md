# Contrato de abonos devueltos — preparacion del panel 1.0.92

El POS prepara el boton Devolver abono con un asiento inverso auditable y evento
`AbonoClienteDevuelto`. Esta revision adapta su lectura, no registra devoluciones
en produccion ni agrega una accion bancaria al navegador.

- `finance-core.js`: evento proyectado como salida sin afectar el resultado de
  gastos/ventas, conservando id del movimiento para no duplicar replay.
- `firebase-adapter.js`: el cierre suma abonos netos, restando devoluciones.
- `panel.js`: incluye el evento en consultas de cortes y resta el cobro devuelto.
- Nuevos casos ejecutables en `finance-checkpoint.test.js` y
  `firebase-finance-runtime.test.js`.
- Suite del panel: 247/247 (baseline 245/245). Ninguna escritura a Firestore.

## Entrega web 1.0.92

- Versionado del shell, movil y service worker; los instaladores Windows y sus
  hashes permanecen en 1.0.69. No se modifica el diseno ni la autenticacion web.
- Suite ampliada: 249/249; devolucion posterior al cuadre y reversa materializada
  comprobadas sin duplicar saldos ni alterar resultados de ventas/gastos.
- Este consumidor es compatible con eventos anteriores y se entrega primero.
  No habilita un boton de devolucion Windows ni significa que ya este instalado.
- Pendientes: consumidor CRM y caja nueva, bloqueo de doble devolucion entre
  terminales offline y verificacion autorizada de Plaza. No desplegar el arbol
  compartido CRM entero. Mantener Central/Plaza separadas.
- No se ejecutan operaciones financieras reales, ni cambios de permisos, reglas,
  cuentas o credenciales como parte de esta entrega.

El informe de implementacion Windows, UI, seguridad de sesion y QA se conserva
en la documentacion privada del POS; no forma parte de los archivos publicos.
