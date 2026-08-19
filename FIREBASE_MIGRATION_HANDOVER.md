# 📋 Documento de Traspaso Técnico: Migración a Firebase & Estado del Ecosistema D' Carela

Este documento detalla el estado actual de todo el ecosistema D' Carela Compufoto / Studio, las configuraciones realizadas y la hoja de ruta para completar la migración de base de datos a Firebase.

---

## 1. 🏗️ Resumen del Ecosistema

| Componente | Repositorio / Ruta Local | Tecnología | Estado Actual |
| :--- | :--- | :--- | :--- |
| **Panel POS Web** | `/Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel/` | HTML5, Vanilla JS, CSS3 | Conectado a Hosting Firebase (`erikccarela.web.app`) y GitHub Pages. Falta migrar consultas SQL de `panel.js` a Firestore. |
| **Finanzas iOS** | `/Volumes/T7/PARA_MAC/FINANZAS_IOS_RECONSTRUIR/` | Swift / SwiftUI (WKWebView Edge-to-Edge) | Carga `panel.html` en tema oscuro `#09090b` sin franjas ni barras. |
| **Brújula iOS** | `/Volumes/T7/PARA_MAC/BRUJULA_IOS_3.2/RECONSTRUIDA/BrujulaClean/` | Swift / SwiftUI, ManagedSettings, AppIntents | Compilada e empaquetada (`v5.0.2-480`). Atajos de bloqueo actualizados a ejecución silenciosa sin diálogos (`ProvidesDialog` eliminado). |
| **Almacenamiento de Fotos** | Google One (Cuenta Propietario) | Google Drive (5 TB) | Destinado a albergar el 100% de las fotos RAW/JPG y videos sin costo adicional. |
| **Inteligencia Artificial** | Google AI Studio (Gemini API) | Gemini 2.0 Flash / 1.5 Pro | Motor de IA para el asistente de negocio y el bot de WhatsApp. |

---

## 2. 🔑 Credenciales y Proyecto Firebase

- **Project ID:** `erikccarela`
- **Plan:** Spark (Gratuito - 1 GB Firestore, 10 GB/mes hosting, 50k lecturas/día)
- **Web App ID:** `1:1025242292135:web:22faf94cf230f9ab05e082`
- **API Key:** `AIzaSyDqcLYgNqjgkib666vQDQjP5SmDbXAcUVE`
- **Auth Domain:** `erikccarela.firebaseapp.com`
- **Storage Bucket:** `erikccarela.firebasestorage.app`
- **Messaging Sender ID:** `1025242292135`
- **Measurement ID:** `G-H16J1ZZH7L`
- **Hosting URL:** `https://erikccarela.web.app`

### Archivos de configuración desplegados:
- `firebase.json`: Configuración de Firebase Hosting con rewrite a `index.html`.
- `firebase-config.js`: Objeto `window.__DCARELA_FIREBASE_CONFIG` disponible en todo el frontend.

---

## 3. 📱 Estado de los Instaladores iOS (IPAs)

Ubicación de binarios limpios listos para AltStore / Sideloading:
- `/Volumes/T7/PARA_MAC/scratchpad/github-dcarela-panel/ios-releases/`
  - **`Brujula-5.0.2-479-QA.ipa`**: Compilación limpia con AppIntents silenciosos (sin banners ni botones de confirmación).
  - **`DCarelaFinanzas-5.0.2-QA.ipa`**: Contenedor nativo de Finanzas en tema oscuro con WebKit optimizado.
  - **`altstore-source.json`**: Fuente oficial con URLs directas de alta velocidad (`https://panel.dcarelacompufoto.com/ios-releases/...`).

---

## 4. 🛠️ Tareas Pendientes para el Asistente Entrante (Migración de Backend)

Actualmente, `panel.js` realiza llamadas a través de la biblioteca de Supabase (`sb.from('pos_sales')`, `sb.auth.signInWithPassword`, etc.). Para completar la transición definitiva a Firebase sin depender de Supabase:

### Paso 1: Configurar Firebase Authentication
1. En la consola de Firebase (`console.firebase.google.com`), habilitar el método **Correo electrónico / Contraseña** en *Authentication*.
2. Crear el usuario administrador (`erickcarela58@gmail.com`).

### Paso 2: Crear las Colecciones en Cloud Firestore
Crear las siguientes colecciones equivalentes al esquema relacional anterior:
- `businesses`: Documentos de sucursales (`id`, `name`, `active`).
- `business_members`: Roles de usuario (`user_id`, `business_id`, `role`).
- `sales`: Registro de ventas (`id`, `business_id`, `total`, `items`, `created_at`, `payment_method`, `drive_folder_url`).
- `cash_shifts`: Turnos de caja (`id`, `business_id`, `opened_at`, `closed_at`, `initial_cash`, `final_cash`).
- `products`: Catálogo de inventario y paquetes de fotos (`id`, `name`, `price`, `stock`).

### Paso 3: Adaptar la Capa de Datos en `panel.js`
- Reemplazar las funciones de lectura/escritura (`sb.from(...)`) por el SDK de Firebase Firestore (`getDocs`, `addDoc`, `onSnapshot` para sincronización en tiempo real).
- Reemplazar `sb.auth.signInWithPassword` por `signInWithEmailAndPassword(auth, email, password)`.

---

## 5. 💡 Reglas Operativas
- **Fotos e Imágenes Pesadas:** NUNCA subirlas a la base de datos ni a Firebase Storage si exceden la cuota gratuita. Guardarlas exclusivamente en **Google Drive (5 TB)** y almacenar solo el enlace (`drive_folder_url`) en Firestore.
- **Consultas del POS:** Utilizar `onSnapshot` de Firestore para mantener las ventas actualizadas en vivo en la pantalla del cajero y en la app del iPhone.

