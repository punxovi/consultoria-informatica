-- Solo lectura; no muestra identidades ni respaldos. Ejecutar antes del despliegue.
SELECT count(*) AS donaciones, count(*) FILTER (WHERE archived_at IS NOT NULL) AS historicas,
  count(*) FILTER (WHERE tipo_aporte = 'dinero') AS dinero,
  count(*) FILTER (WHERE tipo_aporte = 'recurso') AS recursos_por_clasificar
FROM public.donaciones;

SELECT count(*) AS organizaciones_sin_pais_valido
FROM public.organizaciones o LEFT JOIN public.paises p USING(id_pais)
WHERE p.id_pais IS NULL;

SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='donaciones'
ORDER BY ordinal_position;

SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20261019120000','20261019130000','20261020120000') ORDER BY version;
