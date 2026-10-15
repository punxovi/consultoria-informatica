# SCRUM-111 — Gestión de Evidencias

## Qué hice

- Agregué Evidencias en el detalle de cada acción: adjuntar, consultar y descargar archivos, indicar origen y descripción, y controlar su publicación.
- Incorporé declaración de consentimiento para personas identificables y del padre, madre o tutor cuando aparecen menores. La fecha y el usuario los registra el backend.
- Conecté la interfaz a la API real de sprint-6. Si falla la subida, permite completar la carga sin duplicar el registro. También permite retirar la publicación y revocar el consentimiento.
- Mejoré la jerarquía visual: títulos principales primero y más grandes, descripciones debajo y datos más legibles. Quité encabezados secundarios sobre los títulos de Organizaciones, Programas, Planes y Acciones; reordené también el encabezado del Dashboard.
- Amplié las vistas de Acción y detalle de Programa. Evidencias aprovecha dos columnas en escritorio y una en móvil.

## Cómo probar

1. Tener los `.env` configurados y la migración de Evidencias `20261013120000_fge_evidencias.sql` aplicada en Supabase por quien administra la base. Esta entrega no aplica migraciones remotas.
2. Ejecutar `npm install` y `npm run dev` desde la raíz. Entrar con ADMIN o COORD con permisos sobre la acción.
3. Abrir **Planes → detalle del plan → detalle de una acción → Evidencias**.
4. Elegir un archivo, completar origen y descripción, declarar si aparecen personas y sus consentimientos. Guardar y comprobar listado, detalle y descarga.
5. Para publicar, marcar **Permitir publicación** o usar el botón del detalle. Probar también retirar la publicación. Crear una acción no exige evidencia: puede adjuntarse después.

Formatos del backend: PDF, JPG, PNG, WebP, MP3, OGG, WAV, MP4 y WebM; hasta 50 MiB. Documentos y actas se adjuntan en PDF. Los archivos permanecen en un bucket privado; marcar una evidencia como publicada actualiza su estado, no crea un enlace público de descarga.

## Conexión y verificación

**No usa demo:** consume `/api/v1/evidences` mediante `frontend/src/lib/evidencias/cliente.ts`. Primero reserva metadatos, luego sube el binario y finalmente publica si se solicitó. El contrato existente está en [EVIDENCIAS-BACKEND.md](EVIDENCIAS-BACKEND.md).

Pasaron 77 pruebas del frontend y 7 de navegador; también compilación y chequeo de tipos. Las pruebas de navegador simulan HTTP: todavía debe verificarse el flujo con una cuenta y archivos reales en el Supabase del equipo. No se cambiaron las reglas del backend ni se subieron datos reales durante las pruebas.
