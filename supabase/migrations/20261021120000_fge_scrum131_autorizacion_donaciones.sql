-- Prevalidación de gestión con la misma regla territorial usada por RLS.
BEGIN;
CREATE FUNCTION public.puede_gestionar_donaciones(p_id_organizacion uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND fge_private.usuario_puede_gestionar_organizacion(p_id_organizacion);
$$;
REVOKE ALL ON FUNCTION public.puede_gestionar_donaciones(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_donaciones(uuid) TO authenticated;
COMMENT ON FUNCTION public.puede_gestionar_donaciones(uuid) IS
  'Prevalidación del Backend; no reemplaza RLS ni concede acceso a escrituras.';
NOTIFY pgrst, 'reload schema';
COMMIT;
