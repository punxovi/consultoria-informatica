-- Migración para obtener los roles del usuario autenticado
-- Se crea una función con SECURITY DEFINER para saltarse el RLS de asignaciones_roles
-- y permitir que el frontend valide los accesos del usuario actual.

CREATE OR REPLACE FUNCTION public.get_user_roles()
RETURNS TABLE (
  codigo text,
  alcance text,
  id_pais uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.codigo, 
    a.alcance, 
    a.id_pais
  FROM public.asignaciones_roles a
  JOIN public.roles r ON a.id_rol = r.id_rol
  WHERE a.id_usuario = auth.uid()
    AND a.revocado_at IS NULL
    AND r.activo = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Otorgar permiso de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION public.get_user_roles() TO authenticated;
