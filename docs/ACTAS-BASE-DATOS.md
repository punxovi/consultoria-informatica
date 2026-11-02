# Estructura de Base de Datos - Actas de Reunión

Este documento detalla la estructura implementada en Supabase para almacenar y gestionar las Actas de Reunión de las Organizaciones.

## Resumen

La tabla `actas` ya existía en la migración inicial (`20260908002323_fge_estructura.sql`), pero estaba estrictamente vinculada a una Acción (`id_accion NOT NULL`). 
Mediante la migración `20261008121000_fge_actas_reunion.sql`, se modificó la tabla para soportar el caso de uso del Sprint 5: almacenar las Actas de Reunión directamente asociadas a las Organizaciones, permitiendo que la Acción sea opcional y agregando la relación obligatoria con la Organización y el Plan.

## Modificaciones a la tabla `actas`

| Columna | Cambio / Restricciones | Notas |
|---|---|---|
| `id_organizacion` | `uuid NOT NULL` (Nuevo) | Relación obligatoria con `organizaciones`. |
| `id_plan` | `uuid NOT NULL` (Nuevo) | Relación obligatoria con `planes`. |
| `id_accion` | DROP `NOT NULL` | Ahora es opcional (el acta puede o no vincularse a una acción específica). |
| `fecha_reunion` | Rename (antes `fecha`) | Alineado al modelo del Frontend. |
| `asistentes` | `text[] NOT NULL` (Nuevo) | Array con los nombres de los usuarios asistentes del sistema. |
| `asistentes_externos` | `text NOT NULL` (Nuevo) | Cadena de texto con asistentes externos. Longitud <= 500. |
| `observaciones` | Rename (antes `notas`) | Alineado al modelo. Longitud <= 2000. |
| `objetivo` | `text NOT NULL` | Se agregó límite de longitud <= 1000. |

Se preservan todas las columnas de auditoría previas (`created_at`, `updated_at`, `archived_at`, `version`, `created_by`, `updated_by`).

## Operaciones e Integridad

- **Integridad Referencial:** Las actas no pueden existir huerfanas de `id_organizacion` ni `id_plan`. 
- **Auditoría:** La tabla mantiene su trigger de auditoría original en `fge_private.historial_cambios`.
- **Row Level Security (RLS):** Como en los demás modelos, la RLS base está habilitada y el acceso está bloqueado hasta que se implementen las políticas (Tarea 3 del Sprint 5).

## Pruebas

- Los tests se encuentran en `supabase/tests/database/013_actas_reunion.test.sql`.
- Se verifican inserciones válidas, anulabilidad de la acción, relaciones obligatorias, y comportamiento de las columnas de auditoría y versiones.
