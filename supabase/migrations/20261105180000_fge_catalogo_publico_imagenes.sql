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
  ) AS organizacion,
  coalesce((
    SELECT jsonb_agg(jsonb_build_object('id_archivo', a.id_archivo) ORDER BY a.created_at, a.id_archivo)
    FROM public.archivos a
    WHERE a.id_producto = p.id_producto AND a.categoria = 'imagen_producto'
      AND a.estado_carga = 'disponible' AND a.archived_at IS NULL
  ), '[]'::jsonb) AS imagenes
FROM public.productos p
JOIN public.organizaciones o ON o.id_organizacion = p.id_organizacion
LEFT JOIN public.paises pais ON pais.id_pais = o.id_pais AND pais.archived_at IS NULL
WHERE p.publicado AND p.archived_at IS NULL AND o.archived_at IS NULL;

REVOKE ALL ON public.catalogo_cotizacion_publico FROM PUBLIC, authenticated;
GRANT SELECT ON public.catalogo_cotizacion_publico TO anon;

CREATE OR REPLACE FUNCTION public.obtener_imagen_producto_publica(p_id uuid)
RETURNS TABLE(bucket_id text, ruta_objeto text, mime_type text, tamano_bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.bucket_id, a.ruta_objeto, a.mime_type, a.tamano_bytes::bigint
  FROM public.archivos a
  JOIN public.productos p ON p.id_producto = a.id_producto
  JOIN public.organizaciones o ON o.id_organizacion = p.id_organizacion
  WHERE a.id_archivo = p_id AND a.categoria = 'imagen_producto'
    AND a.estado_carga = 'disponible' AND a.archived_at IS NULL
    AND p.publicado AND p.archived_at IS NULL AND o.archived_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.obtener_imagen_producto_publica(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_imagen_producto_publica(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
