# Claude - panel web D' Carela POS

Claude puede modificar, probar, hacer commit, push y publicar este espejo
estatico. La fuente React principal vive en:

`C:\Users\Erick\Desktop\Nuevo programa de facturacion\panel-site`

La salida canonica se genera en:

`C:\Users\Erick\Desktop\Nuevo programa de facturacion\web`

No convertir este espejo en una segunda fuente divergente. Los arreglos
duraderos deben hacerse primero en la fuente principal y luego sincronizarse.

## Produccion

- URL: `https://panel.dcarelacompufoto.com/`
- Repositorio: `erickcarela58-star/dcarela-panel`
- Branch de Pages: `main`, raiz `/`

Conservar el CNAME configurado en GitHub Pages.

## Verificacion

En `panel-site`:

```powershell
npm run lint
npm test
npm run build:mobile
npm run build:shell
```

Despues comprobar login, sucursales, ventas, inventario, Finanzas, reportes,
asistente, notificaciones, responsive 390 px, escritorio y consola.

No escribir `service_role`, contrasenas ni claves privadas en el navegador.
No editar ventas, pagos o cortes directamente para corregir una vista.

