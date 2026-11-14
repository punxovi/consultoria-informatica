BEGIN;

CREATE OR REPLACE VIEW public.catalogo_cotizacion_publico
WITH (security_barrier = true) AS
SELECT p.id_producto, p.nombre, p.descripcion, p.unidad_medida, p.tipo_item, p.caracteristicas,
  jsonb_build_object(
    'id_organizacion', o.id_organizacion,
    'nombre', o.nombre,
    'pais', CASE WHEN pais.id_pais IS NULL THEN NULL ELSE jsonb_build_object(
      'id_pais', pais.id_pais, 'nombre', pais.nombre
    ) END
  ) AS organizacion
FROM public.productos p
JOIN public.organizaciones o ON o.id_organizacion = p.id_organizacion
LEFT JOIN public.paises pais ON pais.id_pais = o.id_pais AND pais.archived_at IS NULL
WHERE p.publicado AND p.archived_at IS NULL AND o.archived_at IS NULL;

REVOKE ALL ON public.catalogo_cotizacion_publico FROM PUBLIC, authenticated;
GRANT SELECT ON public.catalogo_cotizacion_publico TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
