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

## Ventas con varios pagos

El saldo empareja cada cobro proyectado con un asiento de la misma venta, cuenta e importe. Un asiento representa un solo pago; registrar la parte en efectivo no oculta la parte bancaria. El folio por si solo no identifica una venta entre terminales. Las ventas web nuevas conservan tambien el indice del pago. Esta proteccion no constituye una migracion de acumuladores Windows ni resuelve por si sola las anulaciones anteriores al cuadre.

## Pagos de prestamos

En Compromisos y deudas, selecciona Pagar y escribe capital, intereses y cargos. En un prestamo los tres deben sumar exactamente el importe pagado. Escribe capital cero cuando solo pagues intereses; dejarlo vacio no permite adivinar el desglose.

El sistema descuenta el pago total de la cuenta una sola vez. El capital reduce deuda y no se considera gasto del periodo; intereses y cargos forman un asiento de gasto separado. Los saldos contractual, capital y cargos conocidos se reducen con su componente correspondiente; un saldo desconocido permanece desconocido. Las cuotas aplicadas se registran junto al pago. Un importe superior a un saldo conocido se rechaza para revisar primero el contrato.

Para corregir un pago nuevo, abre su movimiento y elige Anular. El formulario indica Anular pago completo: revierte todos sus asientos, la cuenta y las cuotas en una sola transaccion, aunque hayas abierto la parte de intereses. Conserva pagos posteriores y el historial. El proximo vencimiento no se adivina ni se cambia al anular; el compromiso queda marcado para revisar esa fecha. En Editar puedes comprobarla y marcar que ya revisaste el calendario.

Los pagos historicos sin el efecto original registrado y los pagos o anulaciones incorporados en un cuadre requieren la ruta de reversa historica, todavia pendiente. Se rechazan las anulaciones parciales en esos casos. No se migran ni corrigen automaticamente pagos anteriores. Las pruebas de este bloque se ejecutan en fixtures, sin pagos ficticios en produccion.

El resumen del asistente excluye de gastos el capital marcado sin efecto en resultados; el contexto de analisis tambien excluye de ingresos los cobros con esa marca. Esto no convierte todas las consultas del asistente en una vista completa del diario: cobertura historica y proyecciones siguen pendientes.

Las consultas contables completas usan una cache separada de las consultas operativas que pueden admitir datos locales sin red. Un fallo de verificacion debe mostrarse como error y permitir reintentar; no convierte datos locales en un saldo confirmado. Las consultas completas concurrentes siguen compartiendo su lectura. Esto no elimina los topes historicos ni certifica tiempos de carga.
