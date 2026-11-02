# Estructura de Base de Datos - Diagnósticos de Organización

Este documento detalla la estructura implementada en Supabase para almacenar y gestionar los Diagnósticos de las Organizaciones.

## Resumen

El diagnóstico de la Organización se almacena en la tabla `diagnosticos`. La estructura se diseñó alineada al modelo de datos del frontend y para uso a través de la API estándar de Supabase, manteniendo los campos de auditoría convencionales.

Se ha modificado la tabla preexistente mediante la migración `20261008120000_fge_diagnosticos.sql` para forzar restricciones de no nulo según el modelo e incorporar las columnas apropiadas.

## Estructura de la tabla `diagnosticos`

| Columna | Tipo | Restricciones / Notas |
|---|---|---|
| `id_diagnostico` | `uuid` | Clave primaria. |
| `id_organizacion` | `uuid` | Clave foránea a `organizaciones` (`UNIQUE`). Solo un diagnóstico por organización. |
| `fecha_diagnostico` | `date` | Obligatorio. |
| `mision` | `text` | No vacío, longitud <= 500. |
| `vision` | `text` | No vacío, longitud <= 500. |
| `tiene_espacio_fisico` | `boolean` | Puede ser nulo. |
| `caracteristicas_infraestructura` | `text` | No vacío, longitud <= 500. |
| `espacios_disponibles` | `text` | No vacío, longitud <= 500. |
| `recursos_existentes` | `text` | No vacío, longitud <= 500. |
| `danos_detectados` | `text` | No vacío, longitud <= 500. |
| `necesidades_prioritarias` | `text` | No vacío, longitud <= 500. |
| `observaciones` | `text` | No vacío, longitud <= 1000. |
| `raciones` | `integer` | Mayor o igual a 0, obligatorio si `periodo_raciones` está presente. |
| `periodo_raciones` | `text` | `'diaria'`, `'semanal'` o `'mensual'`, obligatorio si `raciones` está presente. |
| `personas_atendidas` | `integer` | Preexistente. |
| `created_at`, `updated_at`, `archived_at` | `timestamptz` | Campos de auditoría. |
| `created_by`, `updated_by` | `uuid` | Referencias a `perfiles`. |
| `version` | `bigint` | Control de concurrencia optimista, incrementa en UPDATE. |

## Operaciones

Las operaciones están disponibles para ser usadas por el Backend (o el cliente Supabase) mediante REST clásico:

- **Crear (POST)**: Insertar en `diagnosticos`. Las restricciones validarán obligatoriedad y longitudes.
- **Consultar (GET)**: Seleccionar de `diagnosticos` donde `id_organizacion = :id`.
- **Actualizar (PATCH)**: Modificar registro asegurando enviar la versión esperada (`version = :version_esperada`). El trigger de concurrencia incrementará automáticamente `version` y actualizará `updated_at` / `updated_by`.

## Auditoría y RLS

- Todos los cambios insertan registros en `fge_private.historial_cambios`.
- *Row Level Security (RLS)* se encuentra habilitada por defecto (denegando todo acceso público/anon). Las políticas granulares por territorio se definen en tareas separadas de seguridad del Sprint 5.

## Pruebas

- Los tests se encuentran en `supabase/tests/database/012_diagnosticos.test.sql` y abarcan aserciones sobre todas las restricciones, tipos de dato y auditoría.
