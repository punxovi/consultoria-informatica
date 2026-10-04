-- Completar los permisos de tabla para Organizaciones.
-- Las políticas RLS (organizaciones_gestion_insert, organizaciones_gestion_update) 
-- no tienen efecto si el rol no tiene primero el permiso de operación en la tabla.
BEGIN;

-- Conceder permisos completos de lectura, inserción y actualización al rol autenticado.
-- Esto sobrescribe el GRANT SELECT parcial anterior de 4 columnas.
GRANT SELECT, INSERT, UPDATE ON public.organizaciones TO authenticated;

-- (Opcional) Refrescar la caché del esquema para la API REST de Supabase (PostgREST)
NOTIFY pgrst, 'reload schema';

COMMIT;
