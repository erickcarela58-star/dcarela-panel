# 🛰️ MASTER HANDOVER & CODEX DIRECTIVE: ECOSISTEMA D' CARELA

> **DOCUMENTO MAESTRO DE TRASPASO TÉCNICO Y PROMPT INTEGRAL PARA CODEX / CLAUDE / CURSOR**  
> *Fecha de generación: 2026-08-20*  
> *Ruta base del repositorio:* `/Volumes/T7/PARA_MAC/`

---

## 📌 PARTE 1: CONTEXTO CRÍTICO Y ESTADO REAL DEL ECOSISTEMA

El ecosistema de **D' Carela Compufoto / D' Carela Studio** se compone de cuatro piezas fundamentales:

1. **Brújula iOS (`BrujulaClean`):** App nativa en Swift/SwiftUI (`/Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/`) para productividad, bloqueo estricto de redes sociales con Screen Time (`ManagedSettings` / `FamilyControls`), biblioteca de lectura (PDF, TXT, Enlaces web/Kindle) y chat con asistente IA.
2. **DCarela Finanzas iOS (`DCarelaPanel`):** Wrapper iOS Swift en `/Volumes/T7/PARA_MAC/FINANZAS_IOS_RECONSTRUIR/FUENTE_TRABAJO/ios-app/DCarelaPanel/` que carga el panel administrativo edge-to-edge en `#09090b`.
3. **Panel Web POS (`dcarela-panel`):** Aplicación web en `/Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel/` (`panel.html`, `panel.js`, `mobile/`). Actualmente usa el cliente de Supabase (`sb.from(...)`).
4. **Almacenamiento e IA:**
   - **Google One (5 TB):** Almacén exclusivo de fotos RAW/JPG y videos pesados.
   - **Google AI Studio (Gemini 2.0):** Cerebro para el asistente de finanzas y el bot de WhatsApp.
   - **Firebase (`erikccarela`):** Proyecto en plan Spark creado para albergar el Hosting, Autenticación y Firestore (reemplazando a Supabase).

---

## 🚨 PARTE 2: DIAGNÓSTICO DE BUGS PENDIENTES

### 1. Brújula: Bloqueo Permanente de Instagram sin Contador / Minutos
- **Ubicación:** [`Sources/SocialAccessStore.swift`](file:///Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/Sources/SocialAccessStore.swift), [`Sources/SocialGateView.swift`](file:///Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/Sources/SocialGateView.swift), [`Sources/RestrictionReconciler.swift`](file:///Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/Sources/RestrictionReconciler.swift).
- **Causa Raíz:** 
  1. `SocialAccessStore.allowedStartHour` está hardcodeado a las **13:00 (1:00 PM)**. Antes de esa hora, cualquier apertura activa la razón `.morning` y aplica el escudo Screen Time.
  2. Si el usuario intenta abrir Instagram antes de la 1:00 PM o durante un período de penalización, `SocialGateView` no muestra un cálculo en vivo de cuántos minutos faltan para las 13:00 ni permite configurar el horario de inicio desde Ajustes.
  3. Si la penalización diaria (`penaltyByDayKey`) o el límite de tiempo (`baseDailyLimitSeconds = 7200`) se consume, el bloqueo se queda en estado permanente sin opción de descanso o ajuste dinámico.

### 2. Brújula: Funciones de Biblioteca y Enlaces Kindle
- **Ubicación:** [`Sources/ReadingStore.swift`](file:///Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/Sources/ReadingStore.swift), [`Sources/Reading/AddBookLinkSheet.swift`](file:///Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/Sources/Reading/AddBookLinkSheet.swift), [`Sources/Reading/SSRFValidator.swift`](file:///Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/Sources/Reading/SSRFValidator.swift), [`Sources/Reading/BookReadingEngine.swift`](file:///Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/Sources/Reading/BookReadingEngine.swift).
- **Causa Raíz:**
  1. Al abrir enlaces de Kindle (`read.amazon.com` o `kindle://`), Amazon requiere sesión de usuario o DRM. Si se intentan raspar en segundo plano con `URLSession`, falla la extracción de texto.
  2. La vista principal de Biblioteca debe permitir **abrir directamente el visor web interno (WebKit) o la app nativa de Kindle** sin obligar al motor de IA a fallar la ingesta.
  3. Los enlaces guardados deben sincronizarse reactivamente con `ReadingStore.links`.

### 3. Panel POS: Migración Completa de Supabase a Firebase
- **Ubicación:** `/Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel/panel.js` (~7,270 líneas).
- **Causa Raíz:**
  - El proyecto de Supabase (`rdmhyhsrewvrpqygtufa`) fue bloqueado por cuota de almacenamiento/transferencia (176% Storage).
  - El usuario creó el proyecto de Firebase **`erikccarela`** (App ID `1:1025242292135:web:22faf94cf230f9ab05e082`, API Key `AIzaSyDqcLYgNqjgkib666vQDQjP5SmDbXAcUVE`).
  - Falta reemplazar en `panel.js` las llamadas de Supabase (`sb.from('pos_sales')`, `sb.auth.signInWithPassword`, etc.) por las funciones de **Firebase Auth** y **Cloud Firestore** (`signInWithEmailAndPassword`, `collection`, `addDoc`, `onSnapshot`).

---

## 📋 PARTE 3: PROMPT LISTO PARA COPIAR Y PEGAR EN CODEX / CLAUDE / OTRO ASISTENTE

A continuación tienes el prompt exacto, detallado y profesional para entregarle al siguiente modelo/agente:

```markdown
Eres el Asistente Senior de Ingeniería encargado de finalizar y solventar al 100% el ecosistema de aplicaciones de D' Carela Compufoto en macOS / iOS / Web.

### INFORMACIÓN DEL ENTORNO Y REPOSITORIOS LOCALES:
- **Disco de Trabajo:** `/Volumes/T7/PARA_MAC/`
- **Brújula iOS (Xcode Project):** `/Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/`
- **Finanzas iOS (Xcode Project):** `/Volumes/T7/PARA_MAC/FINANZAS_IOS_RECONSTRUIR/FUENTE_TRABAJO/ios-app/DCarelaPanel/`
- **Panel POS Web & IPAs Release Repo:** `/Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel/`
- **Proyecto Firebase:** `erikccarela` (Hosting: `https://erikccarela.web.app`)
  - Web App ID: `1:1025242292135:web:22faf94cf230f9ab05e082`
  - API Key: `AIzaSyDqcLYgNqjgkib666vQDQjP5SmDbXAcUVE`
  - Auth Domain: `erikccarela.firebaseapp.com`
  - Storage Bucket: `erikccarela.firebasestorage.app`
  - Messaging Sender ID: `1025242292135`
- **Almacenamiento de Fotos:** Google One (5 TB) – Todas las fotos pesadas se guardan en Drive y solo se almacena su URL en la base de datos.
- **Inteligencia Artificial:** Google AI Studio (Gemini 2.0 Flash) para el asistente del POS y el bot de WhatsApp.

---

### TAREAS EXACTAS QUE DEBES EJECUTAR Y SOLVENTAR:

#### TAREA 1: CORREGIR EL BLOQUEO SOCIAL EN BRÚJULA (INSTAGRAM / FACEBOOK)
1. Revisa `Sources/SocialAccessStore.swift`, `Sources/SocialGateView.swift` y `Sources/RestrictionReconciler.swift`.
2. **Soluciona el bloqueo permanente:**
   - Haz que el horario de apertura de redes (`allowedStartHour`, actualmente fijo a las 13:00) sea configurable desde la UI de ajustes o muestre en `SocialGateView` una cuenta regresiva clara en horas, minutos y segundos: *"Faltan X horas y Y minutos para las 1:00 p. m."*.
   - Si la razón de bloqueo es `.morning`, `.penaltyCooldown` o `.focusPeriod`, `SocialGateView` debe mostrar SIEMPRE un reloj dinámico exacto de cuenta regresiva (`Text(timerInterval: now...unlockTime, countsDown: true)`).
   - Añade un mecanismo de salida de emergencia / reflexión controlada con retraso de 45 segundos para que el usuario nunca quede atrapado sin explicación.
3. **Verifica los AppIntents de Atajos:**
   - Asegúrate de que `RedirectSocialIntent`, `CloseBrujulaSocialSessionIntent` y `ApplySocialPenaltyIntent` en `Sources/ShortcutsIntents.swift` sigan siendo 100% silenciosos (sin `ProvidesDialog` ni `dialog:`) para que las automatizaciones de iOS no muestren banners de confirmación ni pausen la ejecución.

#### TAREA 2: CORREGIR LA BIBLIOTECA DE LECTURA Y ENLACES (KINDLE / WEB / PDF)
1. Revisa `Sources/ReadingStore.swift`, `Sources/Reading/AddBookLinkSheet.swift`, `Sources/Reading/SSRFValidator.swift` y `Sources/Reading/BookReadingEngine.swift`.
2. **Soporte de Enlaces Web y Kindle:**
   - Permitir esquemas `http`, `https` y `kindle://`.
   - Si el usuario ingresa un enlace de Amazon Kindle (`read.amazon.com` o enlaces de libros), guardarlo en `ReadingStore` y permitir abrirlo directamente mediante `InternalLibraryBrowserView` (WKWebView con soporte de cookies de sesión para que el usuario inicie sesión en Amazon Cloud Reader) o derivar a la app de Kindle.
   - Si el motor de extracción en segundo plano no puede obtener texto de DRM de Amazon, no debe marcar la lectura como error fatal ni borrarla de la lista; debe mantener el enlace accesible para lectura manual.
3. Asegurar persistencia reactiva en `ReadingStore` para que cualquier documento importado (PDF/TXT) o enlace añadido aparezca instantáneamente en la lista `ReadingView`.

#### TAREA 3: COMPLETAR LA MIGRACIÓN DE SUPABASE A FIREBASE EN EL PANEL POS
1. Revisa `/Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel/panel.js` y `panel.html`.
2. Reemplaza la inicialización de Supabase (`sb = window.supabase.createClient(...)`) por el cliente oficial de Firebase v9/compat (`firebase.initializeApp(window.__DCARELA_FIREBASE_CONFIG)`).
3. Adapta las siguientes funciones clave en `panel.js` para usar **Firebase Auth y Cloud Firestore**:
   - **Autenticación:** Reemplazar `sb.auth.signInWithPassword` por `firebase.auth().signInWithEmailAndPassword(email, password)` y `onAuthStateChanged`.
   - **Ventas y Turnos:** Reemplazar `sb.from('pos_sales')` y `sb.from('pos_cash_shifts')` por colecciones de Firestore (`db.collection('pos_sales')`, `db.collection('pos_cash_shifts')`).
   - **Sincronización en Tiempo Real:** Usar `db.collection('pos_sales').onSnapshot(...)` para actualizar en vivo el panel sin recargar.
   - **Sucursales y Roles:** Mapear `pos_businesses` y `pos_business_members` a documentos en Firestore.
4. Despliega la web actualizada ejecutando:
   `cd /Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel && firebase deploy --only hosting`

#### TAREA 4: COMPILACIÓN Y EMPAQUETADO FINAL DE IPAS
1. Compila `BrujulaClean` y `DCarelaPanel` con `xcodebuild`:
   - `xcodebuild -project /Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/BrujulaClean.xcodeproj -scheme BrujulaClean -destination 'generic/platform=iOS' CODE_SIGN_IDENTITY='' CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO`
2. Empaqueta los binarios limpios (sin `.appex` sueltos en `Payload/` ni archivos `._*` AppleDouble) en:
   - `/Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel/ios-releases/Brujula-5.0.2-479-QA.ipa`
   - `/Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel/ios-releases/DCarelaFinanzas-5.0.2-QA.ipa`
3. Actualiza los hashes SHA-256 y tamaños en `altstore-source.json` y realiza `git push origin main`.
```

