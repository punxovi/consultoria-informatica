-- SCRUM-183: una tarjeta representa la combinación Coordinador + país.
-- El historial debe incluir todas las coberturas de esa combinación, no solo
-- la cobertura más reciente que se muestra en la tarjeta.
BEGIN;

DO $migration$
DECLARE
  definicion text;
  filtro_antiguo text := 'WHERE historial.id_permiso_temporal = v_id;';
  filtro_nuevo text := $sql$
WHERE historial.id_permiso_temporal IN (
  SELECT cobertura.id_permiso_temporal
  FROM public.permisos_temporales AS cobertura
  WHERE cobertura.id_usuario_beneficiario = (
      SELECT seleccionada.id_usuario_beneficiario
      FROM public.permisos_temporales AS seleccionada
      WHERE seleccionada.id_permiso_temporal = v_id
    )
    AND cobertura.id_pais = (
      SELECT seleccionada.id_pais
      FROM public.permisos_temporales AS seleccionada
      WHERE seleccionada.id_permiso_temporal = v_id
    )
    AND cobertura.archived_at IS NULL
);$sql$;
BEGIN
  SELECT pg_get_functiondef('public.administrar_coberturas(text,jsonb)'::regprocedure)
    INTO definicion;
  IF position(filtro_antiguo IN definicion) = 0 THEN
    RAISE EXCEPTION 'No se encontró el filtro de historial de administrar_coberturas';
  END IF;
  definicion := replace(definicion, filtro_antiguo, filtro_nuevo);
  EXECUTE definicion;
END;
$migration$;

COMMIT;
