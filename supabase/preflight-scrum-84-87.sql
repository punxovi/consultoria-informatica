BEGIN TRANSACTION READ ONLY;

SELECT id_plan, nombre, id_organizacion, id_programa, fecha_inicio, fecha_termino,
       to_jsonb(plan)->>'periodo_anual' AS periodo_actual
FROM public.planes plan
WHERE to_jsonb(plan)->>'periodo_anual' IS NULL
ORDER BY nombre, id_plan;

SELECT id_accion, id_plan, nombre, estado, fecha_inicio, fecha_termino, observacion_motivo
FROM public.acciones
WHERE estado NOT IN ('no_iniciada','en_desarrollo','cancelada','cumplida')
ORDER BY id_plan, id_accion;

SELECT id_accion, id_plan, estado, observacion_motivo
FROM public.acciones
WHERE estado = 'cancelada' AND nullif(btrim(observacion_motivo),'') IS NULL;

COMMIT;
