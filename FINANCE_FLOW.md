# Caja y Cuentas

## Saldo Disponible

El saldo de una cuenta conciliada parte del ultimo cuadre confirmado y aplica una vez cada movimiento posterior. El mes del informe no cambia el saldo actual de la cuenta.

- Las ventas cobradas alimentan la cuenta del metodo de pago. Una venta a credito no mueve efectivo ni banco hasta registrar su abono.
- Los abonos mueven dinero a la cuenta elegida sin registrar otra venta.
- Un gasto requiere cuenta de salida. Guardarlo descuenta de esa cuenta; editarlo aplica la diferencia y anularlo conserva el historial.
- Una salida de gaveta vinculada a un gasto es una sola operacion, no dos descuentos.
- Una transferencia resta al origen y suma al destino. No es ingreso del negocio. La comision, si existe, es un gasto.
- El traslado de ventas anteriores o de caja chica a la gaveta cambia la ubicacion del efectivo existente; no crea dinero adicional.
- Una entrada externa de cliente es dinero recibido, no una venta adicional.

## Comprobacion

1. Seleccionar la cuenta y fecha reales antes de guardar.
2. Esperar la confirmacion. Ante un error de conexion, reintentar el mismo formulario para conservar el identificador de operacion.
3. Consultar el movimiento en Money Manager y el saldo de la cuenta en Finanzas. Resumen y el asistente leen el mismo motor.
4. Para corregir, editar o anular el registro original. No crear otro gasto para corregir un saldo.
5. Usar Conciliar solamente para un importe fisico o bancario comprobado; no para compensar una carga pendiente.

Los datos que aun no llegaron desde una caja sin conexion no pueden considerarse verificados. Un fallo al leer el diario no debe presentarse como saldo cero. Los saldos del sistema no sustituyen el conteo fisico de la gaveta ni el estado bancario.

## Confirmar una transferencia pendiente

El seguimiento es una espera bancaria, no una orden para crear dinero. Antes de confirmarlo, registra la operacion real en Movimientos si todavia falta, usando su origen y destino correctos. Si ya existe una venta, abono o traslado, no lo registres otra vez.

En Finanzas > Cuentas, pulsa Confirmar llegada y selecciona el asiento original entre los que coinciden con la cuenta, direccion e importe. Escribe la evidencia bancaria y confirma. El sistema verifica el asiento activo y guarda su vinculo junto al cierre del seguimiento en una transaccion; no vuelve a sumar ni restar su importe. Un reintento conserva el cierre. Cancelar un seguimiento pendiente tampoco mueve dinero y no permite cancelar por esta via uno ya confirmado.

La seleccion actual admite documentos del libro financiero cargados en el periodo. Un asiento presente solo como proyeccion de venta o evento historico aun no se puede vincular desde este formulario: no lo dupliques para hacerlo aparecer. Ese caso requiere ampliar el vinculo al diario completo. Los seguimientos historicos ya cerrados no se modifican automaticamente.

## Alcance de las cifras

Saldo de cuentas incluidas respeta la configuracion de inclusion de cada cuenta y no equivale necesariamente al patrimonio neto. Disponible, deuda de tarjeta, resultado del periodo y sumas de cierres tienen alcances distintos. El importe de la cuenta y su indicador de estado se muestran en lineas separadas para conservar la lectura del monto.
