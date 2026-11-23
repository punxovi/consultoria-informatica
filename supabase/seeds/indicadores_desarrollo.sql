BEGIN;
DO $prerequisitos$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.indicadores'::regclass
      AND attname='id_accion' AND attnotnull)
    OR to_regprocedure('fge_private.acceso_indicador_accion(uuid,boolean)') IS NULL
  THEN
    RAISE EXCEPTION 'Primero aplica completa 20261015130000_fge_sprint6_rls.sql para habilitar el catálogo y sus permisos.'
      USING ERRCODE = '55000';
  END IF;
END;
$prerequisitos$;
LOCK TABLE public.indicadores IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.indicadores (nombre, descripcion, unidad_medida)
SELECT propuesta.nombre, propuesta.descripcion, propuesta.unidad_medida
FROM (VALUES
  ('Número de beneficiarios', 'Personas beneficiadas por la acción.', 'Beneficiarios'),
  ('Número de participantes', 'Personas que participan en la actividad.', 'Participantes'),
  ('Número de capacitaciones', 'Capacitaciones realizadas durante la acción.', 'Capacitaciones'),
  ('Número de raciones', 'Raciones entregadas durante la intervención.', 'Raciones'),
  ('Acciones ejecutadas', 'Acciones ejecutadas en el trabajo registrado.', 'Acciones')
) AS propuesta(nombre, descripcion, unidad_medida)
WHERE NOT EXISTS (
  SELECT 1 FROM public.indicadores existente
  WHERE existente.id_accion IS NULL AND existente.archived_at IS NULL
    AND lower(btrim(existente.nombre)) = lower(btrim(propuesta.nombre))
);

COMMIT;

SELECT id_indicador, nombre, unidad_medida
FROM public.indicadores
WHERE id_accion IS NULL AND archived_at IS NULL
ORDER BY nombre;
