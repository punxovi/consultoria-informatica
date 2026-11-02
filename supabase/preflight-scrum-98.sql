SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'diagnosticos'
ORDER BY ordinal_position;

SELECT
  to_regprocedure('fge_private.usuario_puede_consultar_organizacion(uuid)') AS consulta,
  to_regprocedure('fge_private.usuario_puede_gestionar_organizacion(uuid)') AS gestion;

SELECT d.id_diagnostico, d.id_organizacion, campo.nombre AS campo_a_completar
FROM public.diagnosticos d
CROSS JOIN LATERAL (VALUES
  ('mision', to_jsonb(d)->>'mision', 500),
  ('vision', to_jsonb(d)->>'vision', 500),
  ('caracteristicas_infraestructura', coalesce(to_jsonb(d)->>'caracteristicas_infraestructura', to_jsonb(d)->>'estado_infraestructura'), 500),
  ('espacios_disponibles', to_jsonb(d)->>'espacios_disponibles', 500),
  ('recursos_existentes', to_jsonb(d)->>'recursos_existentes', 500),
  ('danos_detectados', to_jsonb(d)->>'danos_detectados', 500),
  ('necesidades_prioritarias', coalesce(to_jsonb(d)->>'necesidades_prioritarias', to_jsonb(d)->>'necesidad'), 500),
  ('observaciones', to_jsonb(d)->>'observaciones', 1000)
) AS campo(nombre, valor, maximo)
WHERE campo.valor IS NULL OR btrim(campo.valor) = '' OR length(campo.valor) > campo.maximo;

SELECT id_organizacion, count(*) AS cantidad
FROM public.diagnosticos GROUP BY id_organizacion HAVING count(*) > 1;

SELECT id_diagnostico, id_organizacion, raciones, periodo_raciones
FROM public.diagnosticos
WHERE raciones < 0
   OR (raciones IS NULL) <> (periodo_raciones IS NULL)
   OR periodo_raciones NOT IN ('diaria', 'semanal', 'mensual');

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'diagnosticos';
