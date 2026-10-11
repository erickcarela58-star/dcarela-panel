# Web/PWA 1.0.111 — preservar destinos operativos de error

## Fallo verificado

La carga correcta de un módulo eliminaba todos sus párrafos `p.error`. Eso incluía controles permanentes como `iaError` y `virtualCashError`, no solo avisos transitorios de carga. En producción 1.0.110 se observó `iaError` ausente tras cargar Asistente IA y una excepción al intentar asignarle `textContent` antes del envío; el estado ocupado quedaba activo.

## Corrección

Los avisos creados por `mostrarError` llevan ahora `data-module-error` y `role="alert"`. Tanto la limpieza previa de esos avisos como la limpieza tras una carga correcta se limitan a ese marcador. No se eliminan controles operativos, no se cambia el diseño y no se modifican motores financieros, membresías, cuentas ni datos comerciales.

Se alinearon el identificador interno, el manifiesto y las entradas desktop/mobile/PWA en 1.0.111, build `2026.10.05.1.0.111.0`. Los instaladores Windows permanecen en 1.0.75.

## Pruebas

`panel-error-target-runtime.test.js` reproduce el fallo de eliminación antes de la corrección y verifica después preservación de destinos, limpieza exclusivamente transitoria, dos envíos sucesivos, conservación del borrador si falla el proveedor y liberación del botón para reintentar. Los envíos del test usan un proveedor simulado; no crean movimientos reales.

`node --test *.test.js ai-core/*.test.js`: 317 pruebas aprobadas.

## Límite de verificación

Las pruebas locales no certifican despliegue ni acceso físico en otra PC. La publicación se debe comprobar mediante commit de Pages y contenido HTTP; la respuesta del asistente, mediante consulta no contable en el navegador. No crear ventas, ajustes o aperturas para esta prueba.

## Seguimiento 1.0.112 — selección de proveedor

1.0.111 se publicó con Pages, commit `2cc7315`, y se verificaron contenido HTTP y respuesta real del asistente. La segunda consulta reveló otro fallo: aun seleccionando Forzar Google Gemini, una explicación sobre «saldo de cuenta» se interceptaba como resumen numérico por el buscador local.

1.0.112 mantiene las propuestas financieras y sus aprobaciones antes de la elección del proveedor. En consultas de lectura respeta Gemini explícito y deriva preguntas conceptuales a Gemini cuando se está en automático. No habilita ejecución directa generativa ni cambia datos financieros.

Tres pruebas adicionales verifican Gemini explícito, pregunta conceptual automática y preservación de propuesta pendiente para escrituras. Suite completa: 320 pruebas aprobadas. Build `2026.10.05.1.0.112.0`.

## Seguimiento 1.0.113 — elección reciente frente a historial

La revalidación encontró el selector en cerebro local en la conversación de prueba, pese a haber elegido Automático al finalizar la ronda anterior. `renderIaHistory` asignaba incondicionalmente el modelo del último mensaje, pudiendo sustituir una preferencia más reciente y seleccionar un proveedor que ya no figuraba disponible.

Ahora la preferencia vigente tiene prioridad al recuperar el historial. Sin una nueva preferencia se conserva el modelo disponible de la conversación. Si ese proveedor desapareció, se usa Automático (o la primera opción disponible); una restricción de almacenamiento no impide renderizar el historial. No hay cambio a autenticación, permisos ni aprobación de escrituras.

Cinco regresiones verifican esos casos; cuatro fallaban antes del cambio. Suite completa: 325 pruebas aprobadas. Build `2026.10.05.1.0.113.0`. La confirmación de publicación y la de acceso físico a Plaza siguen siendo verificaciones separadas.

## Seguimiento 1.0.114 — frescura de la señal de dispositivos

En la comprobación del 5 de octubre, 21:47 UTC, el resumen inicialmente mostraba cero terminales y una fecha del 4 de octubre. La vista Dispositivos y una lectura remota no destructiva acreditaban una señal de IMPRESION de ese mismo día. Más tarde la escucha actualizó el resumen: el fallo observado era intermitente, no una caída comprobada del transporte.

Las dos entradas generadas (escritorio y móvil) superponían incondicionalmente la escucha a la lectura manual, aunque fuera más antigua. Ahora conservan las filas de dispositivos, sucursal y hora de **inicio** de la consulta remota. El núcleo proyecta la evidencia verificada más reciente. Usar el inicio, y no la terminación, impide que una consulta lenta anule un bloqueo o eliminación posterior. La señal se recalcula y vence a los diez minutos; caché y errores siguen siendo estado desconocido. No se añaden lecturas periódicas de dinero ni se modifica el cálculo contable.

`shell-device-freshness.test.js` reproduce los cuatro fallos de prioridad de ambas entradas y verifica la función real que conserva la evidencia. Doce regresiones adicionales cubren antigüedad, bloqueo, eliminación, respuestas lentas, caché, errores, separación de sucursales y caducidad sin mutar ventas ni cuentas. Suite completa: **337/337 aprobadas**; sintaxis válida en núcleo y ambas entradas. La publicación se debe verificar por separado. Build `2026.10.05.1.0.114.0`; los instaladores Windows permanecen en 1.0.75.

## Seguimiento 1.0.115 — mi Caja web frente a un turno ajeno

En la sesión real de Plaza del 5 de octubre, 22:50 RD, Caja virtual mostraba la caja del dueño cerrada. Al pedir un resumen, el asistente local respondió «Caja web: turno abierto». El resumen usaba el primer turno abierto de una consulta de toda la sucursal, sin comprobar que perteneciera al usuario. No se abrió ni cerró ningún turno para reproducirlo.

Ahora consulta exclusivamente la acción de lectura `webSaleAction('status', sucursal, rol)` cuando está disponible, la misma fuente de Caja virtual. Solo informa «Mi Caja web: turno abierto» si el resultado verificado corresponde a usuario y sucursal actuales, o «sin turno abierto» si el estado propio confirma `shift: null`. Error, ausencia de confirmación o resultado ajeno se muestran como «estado no disponible», sin cambiar las cifras financieras. Un adaptador anterior que solo ofrece una muestra global la etiqueta como tal y no la toma por estado propio. No se consulta además la lista global cuando existe el estado propio, ni se ejecutan acciones de apertura, cierre o escritura.

Cuatro regresiones nuevas fallan antes y pasan después: turno propio cerrado/abierto, errores o identidad/sucursal ajenas, y muestra global sin estado propio. `assistant-local.test.js`: 36/36; suite completa: **341/341**. Build `2026.10.06.1.0.115.0`; publicación, respuesta real posterior y login de la Caja física se verifican por separado.

## Pendiente local 11/10/2026 — recuperar la validación sin cerrar Firebase

En la sesión existente del dueño, cambiar de Plaza a Central y abrir Money Manager dejó el iframe en el formulario de acceso con «La nube tardó demasiado», aunque el shell seguía mostrando la sesión. Se detuvieron las pruebas protegidas; no se introdujo una contraseña ni se modificaron movimientos. El tiempo de espera es una incidencia actual. No se ha determinado por qué tardó Firestore ni se ha demostrado que la contraseña del colaborador sea incorrecta.

`iniciarConSesion` esperaba membresías/catálogo y vencía a los veinte segundos. Invalidaba correctamente la generación para que la respuesta tardía no abriera datos, pero enviaba todos los errores al login. Además, el formulario llamaba `signOut` si la validación posterior a una autenticación correcta no terminaba. La identidad de Firebase y el permiso para esta sucursal son estados distintos.

El parche **solo local, no publicado** conserva la invalidación y el panel oculto. Si Firebase todavía identifica al mismo usuario, presenta «Validación interrumpida» y un botón «Reintentar acceso». El botón recarga para descartar promesas vencidas y volver a verificar identidad, membresías y sucursal; no reutiliza roles, no guarda claves ni ejecuta `signIn`. Sin identidad vigente, con otra identidad o con un HTML anterior, sigue mostrando el login. Una denegación de permisos nunca abre cuentas o movimientos. Cerrar sesión sigue siendo una acción explícita; no se desconecta Firebase solo por fallar la consulta de autorización. Se limpian los temporizadores del arranque y se corrige únicamente la cadena mojibake del aviso de espera.

`panel-auth-recovery-runtime.test.js` ejecuta las funciones reales del panel en una VM con Firebase, consultas y reloj simulados. Cinco de los ocho primeros casos fallaban antes del cambio. Las once regresiones cubren tiempo agotado, respuesta tardía, identidad ausente/diferente, permisos denegados, restauración lenta/correcta, reintento por recarga, formulario de login, cambio de generación y HTML anterior. No usan cuentas ni claves reales, y no escriben en la nube.

La suite anterior de publicación sigue en 341 casos; la fuente local ampliada tiene 352. El manifiesto conserva 1.0.115: **no hay un build nuevo ni despliegue de este parche**. Antes de publicarlo hay que verificar visualmente la nueva vista en escritorio y móvil, completar la prueba de reintento autorizado y preparar el versionado coherente de las entradas/PWA. Eso no sustituye el acceso físico del colaborador, el contraste de su cola o la causa de las consultas lentas.

### Revisión local 11/10/2026, 16:56–17:04 UTC — eventos de identidad durante el arranque

La nueva ejecución volvió a observar el formulario de acceso 1.0.115 con el aviso de timeout anterior. Un intento de recarga quedó bloqueado por una ventana de extensión de Chrome. No se operó esa ventana ni se empleó otro mecanismo de control. La validación visual y el reintento autorizado siguen pendientes; no hay captura nueva ni prueba real nueva del asistente.

Al ampliar las regresiones se descubrió otra limitación del callback original: solo atendía `!user && sesionOk`. Si Firebase terminaba la identidad mientras las membresías seguían pendientes (`sesionOk=false`), no invalidaba ese arranque; tampoco invalidaba una identidad distinta. Tres casos con la función real y eventos/consultas simulados fallaron antes del cambio: la respuesta tardía podía mostrar el módulo, o la recuperación seguía diciendo que existía una identidad después de terminarla. Esto es una reproducción local; no acredita una exposición real de datos ni modifica las reglas del servidor.

`manejarEstadoFirebase` atiende ahora el cierre durante arranque, sesión abierta y recuperación, y el cambio de UID durante una validación activa. Invalida la generación, borra el estado de acceso local, deshabilita edición, detiene la escucha y mantiene la aplicación oculta. Una identidad diferente debe volver a validar membresía/sucursal por recarga; no recibe permisos heredados. El primer evento sin usuario, antes de un arranque, no fabrica acceso ni cancela otra restauración. El mismo UID conserva una sesión autorizada. `iniciar` comprueba la generación también inmediatamente después de cargar sucursales, antes de cargar el rol.

Cinco pruebas adicionales ejecutan ese callback, no solo una asignación manual de generación: los tres casos anteriores, evento inicial sin identidad y conservación del mismo usuario/cierre con parada de escucha. Se verifica además su enlace real a `onAuthStateChanged`. Suite completa **357/357**. Las catorce regresiones existentes más estos dos casos de control suman dieciséis en el archivo de recuperación. El parche permanece local, sin publicar ni versionar; producción continúa en Web/PWA 1.0.115 y Windows 1.0.75. La causa de la espera en Firestore y la cola física de Plaza siguen sin verificar.

### Preparación de revisión visual — 11/10/2026, 21:58–22:09 UTC

Al empezar, Money Manager Central ya estaba visible con 322 movimientos de octubre, cinco cuentas, trece obligaciones y movimientos del 11/10. Eso no acredita cómo se restauró la sesión: la recarga solicitada volvió a quedar bloqueada por una ventana de extensión de Chrome. No se cerró esa ventana, ingresó una clave ni empleó otro mecanismo de automatización. La prueba real del reintento y la del asistente siguen pendientes.

Se agregó `.local-tests/auth-preview.cjs` para completar la revisión visual sin cuentas reales cuando Chrome permita continuar. Se ejecuta desde este worktree con `node .local-tests/auth-preview.cjs 8816` y se abre `http://127.0.0.1:8816/?scenario=timeout`. Solo escucha en loopback, sirve una lista fija de CSS/logo públicos y copia el HTML de acceso, las funciones y el enlace del botón de reintento desde la fuente vigente. No carga Firebase/Supabase SDK, tokens, configuraciones o datos del negocio. Las entradas de clave están deshabilitadas y el documento tiene un aviso visible de SIMULACIÓN LOCAL. CSP bloquea conexiones y formularios; POST y archivos no permitidos se rechazan. No se dejó un servidor persistente ejecutándose.

Casos disponibles: `timeout`, `denied`, `signed-out`, `changed-user` y `success`; `theme=light|dark`. Reintentar usa el enlace real de recarga, mientras un marcador exclusivamente local prepara una nueva autorización **simulada** en la siguiente carga. Nunca es un permiso del negocio ni un saldo. Antes de publicar, revisar la pantalla y los botones al menos en escritorio y móvil con el navegador permitido, y después repetir el acceso real autorizado. La maqueta no sustituye esa prueba ni la Caja física.

`panel-auth-preview.test.js` aporta cuatro pruebas: extracción de funciones/HTML/enlaces reales y sintaxis; cinco escenarios sin SDK, claves o negocio; servidor HTTP de solo lectura y aislamiento CSP; ejecución del controlador con DOM simulado y reintento por recarga. Se probaron mediante VM y HTTP local, **no mediante un navegador ni capturas**. Suite completa **361/361**. El parche de aplicación sigue siendo `c80c0ab`; no hubo cambios nuevos al motor financiero, autorización de servidor, sesión real o despliegue. Web/PWA publicada continúa en 1.0.115 y Windows en 1.0.75.
