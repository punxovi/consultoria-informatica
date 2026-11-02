BEGIN;

ALTER TABLE public.diagnosticos
  RENAME COLUMN necesidad TO necesidades_prioritarias;

ALTER TABLE public.diagnosticos
  RENAME COLUMN estado_infraestructura TO caracteristicas_infraestructura;

ALTER TABLE public.diagnosticos
  DROP CONSTRAINT IF EXISTS diagnosticos_raciones_check,
  DROP CONSTRAINT IF EXISTS diagnosticos_check;

ALTER TABLE public.diagnosticos
  ALTER COLUMN mision SET NOT NULL,
  ALTER COLUMN vision SET NOT NULL,
  ALTER COLUMN caracteristicas_infraestructura SET NOT NULL,
  ALTER COLUMN espacios_disponibles SET NOT NULL,
  ALTER COLUMN recursos_existentes SET NOT NULL,
  ALTER COLUMN danos_detectados SET NOT NULL,
  ALTER COLUMN necesidades_prioritarias SET NOT NULL,
  ALTER COLUMN observaciones SET NOT NULL;

ALTER TABLE public.diagnosticos
  ADD CONSTRAINT diagnosticos_mision_chk CHECK (btrim(mision) <> '' AND length(mision) <= 500),
  ADD CONSTRAINT diagnosticos_vision_chk CHECK (btrim(vision) <> '' AND length(vision) <= 500),
  ADD CONSTRAINT diagnosticos_caract_infra_chk CHECK (btrim(caracteristicas_infraestructura) <> '' AND length(caracteristicas_infraestructura) <= 500),
  ADD CONSTRAINT diagnosticos_espacios_chk CHECK (btrim(espacios_disponibles) <> '' AND length(espacios_disponibles) <= 500),
  ADD CONSTRAINT diagnosticos_recursos_chk CHECK (btrim(recursos_existentes) <> '' AND length(recursos_existentes) <= 500),
  ADD CONSTRAINT diagnosticos_danos_chk CHECK (btrim(danos_detectados) <> '' AND length(danos_detectados) <= 500),
  ADD CONSTRAINT diagnosticos_necesidades_chk CHECK (btrim(necesidades_prioritarias) <> '' AND length(necesidades_prioritarias) <= 500),
  ADD CONSTRAINT diagnosticos_observaciones_chk CHECK (btrim(observaciones) <> '' AND length(observaciones) <= 1000),
  ADD CONSTRAINT diagnosticos_raciones_periodo_chk CHECK (
    (raciones IS NULL AND periodo_raciones IS NULL) OR
    (raciones IS NOT NULL AND periodo_raciones IS NOT NULL)
  ),
  ADD CONSTRAINT diagnosticos_periodo_chk CHECK (periodo_raciones IS NULL OR periodo_raciones IN ('diaria', 'semanal', 'mensual'));

ALTER TABLE public.diagnosticos
  ADD CONSTRAINT diagnosticos_organizacion_uq UNIQUE (id_organizacion);

NOTIFY pgrst, 'reload schema';
COMMIT;
