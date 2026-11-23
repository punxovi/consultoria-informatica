BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_exportacion_reporte(
  p_destino text,
  p_filtros jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  usuario uuid := auth.uid();
  filtros jsonb := COALESCE(p_filtros, '{}'::jsonb);
  actor text := COALESCE(
    NULLIF(NULLIF(current_setting('role', true), 'none'), ''),
    session_user
  );
BEGIN
  IF usuario IS NULL THEN
    RAISE EXCEPTION 'SesiÃ³n requerida.' USING ERRCODE = '42501';
  END IF;
  IF p_destino NOT IN ('interno', 'donante', 'externo') THEN
    RAISE EXCEPTION 'Destino de reporte no vÃ¡lido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(filtros) <> 'object' THEN
    RAISE EXCEPTION 'Los filtros del reporte deben ser un objeto JSON.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO fge_private.historial_cambios (
    tabla_afectada,
    clave_registro,
    tipo_accion,
    id_usuario,
    permiso_ejercido,
    actor_sql,
    despues
  ) VALUES (
    'reportes',
    jsonb_build_object('destino', p_destino, 'filtros', filtros),
    'INSERT',
    usuario,
    'reportes.exportar',
    actor,
    jsonb_build_object('operacion', 'exportacion', 'destino', p_destino, 'filtros', filtros)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_exportacion_reporte(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_exportacion_reporte(text, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
