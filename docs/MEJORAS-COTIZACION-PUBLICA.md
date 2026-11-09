# Mejoras de cotización pública — 2026-11-09

Base: Sprint 9 `2ad5b84`. Rama: `codex/mejoras-formulario-cotizacion`.

- La confirmación pública ya no muestra «Referencia» ni UUID de solicitud/envío.
  Se conservan los identificadores en el contrato Backend y en la persistencia.
- Los cinco campos de contacto se guardan como borrador en `sessionStorage`,
  igual que la selección de productos. Se restauran al volver al formulario,
  recargar y navegar con Atrás/Adelante. Se admiten valores incompletos en el
  borrador: las reglas de envío se aplican al confirmar el formulario.
- El borrador permanece ante errores de validación, conexión o persistencia.
  Una confirmación válida limpia selección, formulario y borrador. Vaciar o
  cambiar productos no elimina el contacto. Los datos no se guardan en
  `localStorage`; su alcance es la sesión de esa pestaña.
- Teléfono obligatorio en HTML, esquema del formulario, Backend y en INSERT de
  Supabase. Se rechaza su ausencia, nulo, vacío, espacios o exceso de longitud.
  No se cambia la opcionalidad del mensaje ni se exige un formato nacional nuevo.

## Persistencia y contrato

Aplicar `supabase/migrations/20261109130000_fge_cotizacion_telefono_obligatorio.sql`
y ejecutar `supabase/checks/cotizacion-telefono-obligatorio.sql`. El usuario
confirma migración aplicada y verificación PASS en Supabase.

La validación SQL se aplica a nuevas solicitudes, incluyendo las creadas por
RPC o SQL directo. No se modifican teléfonos históricos ni se impide actualizar
el estado de una solicitud antigua sin teléfono. La nueva validación devuelve
SQLSTATE 22023, ya traducido por el servicio a HTTP 400 / DATOS_INVALIDOS.

El contrato público exige ahora `telefono: string` no vacío, hasta 60 caracteres.
La respuesta conserva `id_solicitud` e `id_envio` para la integración, pero estos
campos no forman parte del texto de éxito que ve el visitante.

## Verificación

- 297 pruebas de regresión Backend aprobadas.
- 4 pruebas de contrato/borrador del Frontend aprobadas.
- 18 pruebas de navegador de catálogo/cotización aprobadas, más una prueba
  adicional de Atrás/Adelante con correo incompleto y nuevos productos.
- PostgreSQL/PGlite: 56 comprobaciones de productos y 77 de solicitudes, incluida
  validación SQL de teléfono ausente/vacío y transacciones sin altas parciales.
  También se ejecuta el script remoto de teléfono con rollback.
- Compilación del Frontend aprobada.
- Servicios reiniciados conservando configuración local: login y cotizar HTTP
  200, Gateway HTTP 200, renovación con token ficticio por Gateway HTTP 401 /
  SESION_INVALIDA, comprobando conectividad real de Auth con Supabase.

Los casos de navegador interceptan el envío público: no envían correos ni crean
solicitudes reales. La comprobación SQL remota prueba la regla de INSERT y
revierte sus registros sintéticos al terminar.
