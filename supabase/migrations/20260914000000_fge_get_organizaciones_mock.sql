BEGIN;

CREATE OR REPLACE FUNCTION public.get_organizaciones_mock(
  estado_filtro text DEFAULT 'todos'
)
RETURNS TABLE (
  id uuid,
  nombre text,
  rut text,
  estado text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF estado_filtro IS NULL OR estado_filtro NOT IN ('activo', 'inactivo', 'todos') THEN
    RAISE EXCEPTION 'estado_filtro debe ser activo, inactivo o todos'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT organizaciones_mock.id,
         organizaciones_mock.nombre,
         organizaciones_mock.rut,
         organizaciones_mock.estado
  FROM (
    VALUES
      ('a1000000-0000-0000-0000-000000000001'::uuid, 'Organización demostración Norte'::text, '76.000.001-9'::text, 'activo'::text),
      ('a1000000-0000-0000-0000-000000000002'::uuid, 'Organización demostración Centro'::text, '76.000.002-7'::text, 'activo'::text),
      ('a1000000-0000-0000-0000-000000000003'::uuid, 'Organización demostración Sur'::text, '76.000.003-5'::text, 'inactivo'::text)
  ) AS organizaciones_mock(id, nombre, rut, estado)
  WHERE estado_filtro = 'todos' OR organizaciones_mock.estado = estado_filtro
  ORDER BY organizaciones_mock.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organizaciones_mock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organizaciones_mock(text) TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
