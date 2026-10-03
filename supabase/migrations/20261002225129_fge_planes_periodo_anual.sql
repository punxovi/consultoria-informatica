-- SCRUM-84: año explícito, sin inferir el período de registros históricos.
BEGIN;
-- Los joins y el selector de Planes solo necesitan identidad, nombre y país.
-- Conceder lectura de estas columnas no habilita el CRUD de Organizaciones.
GRANT SELECT (id_organizacion, id_pais, nombre, archived_at) ON public.organizaciones TO authenticated;
CREATE POLICY organizaciones_lectura_planes ON public.organizaciones
FOR SELECT TO authenticated USING (
  fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
  OR (fge_private.usuario_tiene_rol(ARRAY['COORD','INVIT']) AND (
    archived_at IS NULL OR EXISTS (
      SELECT 1 FROM public.planes plan WHERE plan.id_organizacion = organizaciones.id_organizacion AND plan.archived_at IS NULL
    )
  ))
);
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS periodo_anual smallint;

-- Para una actualización con datos, suministrar un mapa UUID -> año aprobado
-- mediante SET fge.migracion_periodos_planes = '{"uuid-del-plan":2026}'.
DO $$
DECLARE periodos jsonb := coalesce(nullif(current_setting('fge.migracion_periodos_planes', true), ''), '{}')::jsonb;
BEGIN
  IF jsonb_typeof(periodos) <> 'object' THEN
    RAISE EXCEPTION 'El mapa de períodos debe ser un objeto UUID -> año' USING ERRCODE = '22023';
  END IF;
  UPDATE public.planes AS plan SET periodo_anual = dato.value::smallint
  FROM jsonb_each_text(periodos) AS dato
  WHERE plan.id_plan = dato.key::uuid AND plan.periodo_anual IS NULL;
  IF EXISTS (SELECT 1 FROM public.planes WHERE periodo_anual IS NULL) THEN
    RAISE EXCEPTION 'Hay Planes sin período anual confirmado'
      USING ERRCODE = '23502', HINT = 'Revisar los Planes existentes y suministrar fge.migracion_periodos_planes con sus años aprobados. La migración se revierte íntegramente.';
  END IF;
END;
$$;
ALTER TABLE public.planes
  ALTER COLUMN periodo_anual SET NOT NULL,
  ADD CONSTRAINT planes_periodo_anual_chk CHECK (periodo_anual BETWEEN 1 AND 9999);
COMMENT ON COLUMN public.planes.periodo_anual IS 'Año al que corresponde el Plan; explícito e independiente de sus fechas de ejecución.';
CREATE INDEX planes_periodo_anual_activo_idx ON public.planes(periodo_anual) WHERE archived_at IS NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
