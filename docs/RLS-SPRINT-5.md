# Políticas de Seguridad (RLS) - Sprint 5

Este documento describe las políticas de *Row Level Security* implementadas para las nuevas tablas y módulos del Sprint 5.

## Resumen

La migración `20261008122000_fge_sprint5_rls.sql` define las políticas de lectura, inserción y actualización para `diagnosticos`, `actas` y `compromisos`. 
El `Expediente Legal` (`informacion_legal`) ya contaba con sus políticas equivalentes en su respectiva migración, por lo cual no fue necesario modificarlas.

## Implementación

Las políticas restringen el acceso a los usuarios autenticados validando el alcance territorial correspondiente. Esto se logra mediante el uso de las funciones almacenadas del esquema privado:
- `fge_private.usuario_puede_consultar_organizacion(id_organizacion)`
- `fge_private.usuario_puede_gestionar_organizacion(id_organizacion)`

### Diagnósticos
El acceso está directamente ligado a la validación de `id_organizacion` del propio registro de diagnóstico.

### Actas
Se valida `id_organizacion` directamente en la tabla de actas.

### Compromisos
Dado que los compromisos están vinculados al acta y no poseen la referencia directa a `id_organizacion`, la política RLS realiza un sub-query (`EXISTS (SELECT 1 FROM actas...)`) para determinar a qué organización pertenece el compromiso y verificar los privilegios territoriales sobre ella.

## Auditoría y Archivo
Todas las políticas de Sprint 5 incluyen una cláusula `archived_at IS NULL` para prevenir el acceso y modificación de los registros "eliminados" (Soft Delete).

## Pruebas
Los tests se ejecutan sobre los esquemas en `supabase/tests/database/014_rls_sprint5.test.sql`, validando que el rol público / anon deniega totalmente el acceso, además de la propia validación estática de políticas creadas.
