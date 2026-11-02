-- SCRUM-87 / RF36: descripción propia y cuatro estados de flujo.
BEGIN;
ALTER TABLE public.acciones ADD COLUMN descripcion text;
ALTER TABLE public.acciones ADD CONSTRAINT acciones_descripcion_chk
  CHECK (descripcion IS NULL OR (btrim(descripcion) <> '' AND char_length(descripcion) <= 5000));

-- Atrasada no identifica si la Acción comenzó. Solo convertir datos con una
-- correspondencia UUID -> estado de flujo confirmada por su responsable.
DO $$
DECLARE estados jsonb := coalesce(nullif(current_setting('fge.migracion_estados_acciones', true), ''), '{}')::jsonb;
BEGIN
  IF jsonb_typeof(estados) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_each_text(estados) WHERE value NOT IN ('no_iniciada','en_desarrollo','cancelada','cumplida')
  ) THEN
    RAISE EXCEPTION 'El mapa debe contener UUID -> estado válido de RF36' USING ERRCODE = '22023';
  END IF;
  UPDATE public.acciones AS accion SET estado = dato.value
  FROM jsonb_each_text(estados) AS dato
  WHERE accion.id_accion = dato.key::uuid AND accion.estado = 'atrasada';
  IF EXISTS (SELECT 1 FROM public.acciones WHERE estado = 'atrasada') THEN
    RAISE EXCEPTION 'Hay Acciones Atrasadas sin estado de flujo confirmado'
      USING ERRCODE = '23514', HINT = 'Suministrar fge.migracion_estados_acciones. Cancelada exige motivo ya registrado. No se deduce un estado a partir del vencimiento.';
  END IF;
END;
$$;
ALTER TABLE public.acciones DROP CONSTRAINT acciones_estado_check;
ALTER TABLE public.acciones ADD CONSTRAINT acciones_estado_check
  CHECK (estado IN ('no_iniciada','en_desarrollo','cancelada','cumplida'));
COMMENT ON COLUMN public.acciones.descripcion IS 'Descripción opcional; distinta del resultado esperado y del motivo de cancelación.';
COMMENT ON COLUMN public.acciones.estado IS 'RF36: cuatro estados de flujo. Vencida se deriva de fecha_termino y no se persiste como estado.';
NOTIFY pgrst, 'reload schema';
COMMIT;
