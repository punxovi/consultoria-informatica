# Respaldos documentales de donaciones

La asociación reutiliza `public.archivos` y el bucket privado `fge-archivos`. Cada fila guarda `id_donacion`, `tipo_respaldo`, metadatos del archivo y la clave `donaciones/<id_donacion>/<id_archivo>.<extension>`.

El flujo es de dos fases:

1. La API reserva los metadatos mediante `POST /api/v1/organizations/:id/donations/:idDonacion/files`.
2. La API carga el binario mediante `PUT .../files/:idArchivo/file?version_esperada=...`. Solo después de una carga exitosa y validada por firma, tamaño y MIME cambia `estado_carga` a `disponible`.

El detalle de la organización consulta los respaldos desde `GET .../files` y descarga mediante un endpoint autenticado. No se generan enlaces públicos: las políticas RLS de `public.archivos` y Storage comprueban la donación, la organización accesible, la fila de metadatos y el estado de carga. Un respaldo reservado solo acepta carga; uno disponible solo puede ser consultado o descargado con permisos vigentes.

Los tipos permitidos son `comprobante`, `acta_entrega`, `certificado` y `fotografia`. El límite es 50 MiB y se aceptan PDF, JPEG, PNG y WebP, con validación de extensión y firma binaria.
