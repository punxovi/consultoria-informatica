BEGIN;

ALTER TABLE public.productos
  ADD COLUMN tipo_item text NOT NULL DEFAULT 'producto'
    CHECK (tipo_item IN ('producto', 'servicio')),
  ADD COLUMN categoria text CHECK (categoria IS NULL OR btrim(categoria) <> ''),
  ADD COLUMN material_terminacion text CHECK (material_terminacion IS NULL OR btrim(material_terminacion) <> ''),
  ADD COLUMN caracteristicas jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(caracteristicas) = 'object'),
  ADD COLUMN informacion_adicional text CHECK (informacion_adicional IS NULL OR btrim(informacion_adicional) <> '');

COMMENT ON COLUMN public.productos.publicado IS 'Habilita la publicación; solo es visible si el producto y su Organización no están archivados.';
COMMENT ON COLUMN public.productos.caracteristicas IS 'Atributos descriptivos del producto o servicio como objeto JSON; no contiene existencias ni operaciones de inventario.';
COMMENT ON COLUMN public.archivos.id_producto IS 'Una o más imágenes de producto, en el bucket privado fge-archivos. Se conserva el historial mediante archived_at.';

DROP TRIGGER validar_producto_cotizado ON public.productos;
CREATE FUNCTION fge_private.conservar_identidad_producto() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.id_producto IS DISTINCT FROM OLD.id_producto
     OR NEW.id_organizacion IS DISTINCT FROM OLD.id_organizacion THEN
    RAISE EXCEPTION 'El producto debe conservar su identificador y Organización' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conservar_identidad_producto BEFORE UPDATE ON public.productos
FOR EACH ROW EXECUTE FUNCTION fge_private.conservar_identidad_producto();

CREATE FUNCTION fge_private.validar_imagen_producto() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.id_producto IS NOT NULL AND (
    NEW.id_archivo IS DISTINCT FROM OLD.id_archivo OR
    NEW.id_producto IS DISTINCT FROM OLD.id_producto OR
    NEW.bucket_id IS DISTINCT FROM OLD.bucket_id OR
    NEW.ruta_objeto IS DISTINCT FROM OLD.ruta_objeto OR
    NEW.mime_type IS DISTINCT FROM OLD.mime_type OR
    NEW.tamano_bytes IS DISTINCT FROM OLD.tamano_bytes
  ) THEN
    RAISE EXCEPTION 'La imagen debe conservar su identidad, destino y objeto; archive y registre otra' USING ERRCODE = '23514';
  END IF;
  IF NEW.id_producto IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.id_producto IS NULL) THEN
    IF NEW.bucket_id <> 'fge-archivos'
      OR NEW.ruta_objeto !~ ('^productos/' || NEW.id_producto::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
      OR NEW.mime_type IS DISTINCT FROM (CASE lower(right(NEW.ruta_objeto, 4))
        WHEN '.jpg' THEN 'image/jpeg' WHEN '.png' THEN 'image/png' WHEN 'webp' THEN 'image/webp' END)
      OR NEW.tamano_bytes IS NULL OR NEW.tamano_bytes NOT BETWEEN 1 AND 5242880 THEN
      RAISE EXCEPTION 'Imagen de producto inválida: ruta, MIME o tamaño (máximo 5 MiB)' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_imagen_producto BEFORE INSERT OR UPDATE ON public.archivos
FOR EACH ROW EXECUTE FUNCTION fge_private.validar_imagen_producto();

CREATE FUNCTION fge_private.acceso_organizacion_producto(p_organizacion uuid, p_gestion boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizaciones o
    JOIN public.paises pais ON pais.id_pais = o.id_pais AND pais.archived_at IS NULL
    JOIN public.perfiles perfil ON perfil.id_usuario = auth.uid() AND perfil.activo AND perfil.archived_at IS NULL
    WHERE o.id_organizacion = p_organizacion AND o.archived_at IS NULL
      AND CASE WHEN p_gestion THEN fge_private.usuario_puede_gestionar_organizacion(o.id_organizacion)
        ELSE fge_private.usuario_puede_consultar_organizacion(o.id_organizacion) END
  );
$$;
CREATE FUNCTION fge_private.acceso_producto(p_producto uuid, p_gestion boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.productos p WHERE p.id_producto = p_producto AND p.archived_at IS NULL
      AND fge_private.acceso_organizacion_producto(p.id_organizacion, p_gestion)
  );
$$;
CREATE FUNCTION fge_private.acceso_objeto_producto(p_bucket text, p_ruta text, p_carga boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.archivos a
    WHERE a.bucket_id = p_bucket AND p_bucket = 'fge-archivos' AND a.ruta_objeto = p_ruta
      AND a.id_producto IS NOT NULL AND a.categoria = 'imagen_producto' AND a.archived_at IS NULL
      AND a.estado_carga = CASE WHEN p_carga THEN 'reservado' ELSE 'disponible' END
      AND fge_private.acceso_producto(a.id_producto, p_carga)
  );
$$;

REVOKE ALL ON FUNCTION fge_private.conservar_identidad_producto(), fge_private.validar_imagen_producto(),
  fge_private.acceso_organizacion_producto(uuid, boolean), fge_private.acceso_producto(uuid, boolean),
  fge_private.acceso_objeto_producto(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA fge_private TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.acceso_organizacion_producto(uuid, boolean),
  fge_private.acceso_producto(uuid, boolean), fge_private.acceso_objeto_producto(text, text, boolean) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.productos TO authenticated;
CREATE POLICY productos_consulta ON public.productos FOR SELECT TO authenticated
USING (fge_private.acceso_organizacion_producto(id_organizacion, false));
CREATE POLICY productos_alta ON public.productos FOR INSERT TO authenticated
WITH CHECK (archived_at IS NULL AND fge_private.acceso_organizacion_producto(id_organizacion, true));
CREATE POLICY productos_modificacion ON public.productos FOR UPDATE TO authenticated
USING (archived_at IS NULL AND fge_private.acceso_organizacion_producto(id_organizacion, true))
WITH CHECK (fge_private.acceso_organizacion_producto(id_organizacion, true));

GRANT SELECT, INSERT, UPDATE ON public.archivos TO authenticated;
CREATE POLICY archivos_producto_consulta ON public.archivos FOR SELECT TO authenticated
USING (id_producto IS NOT NULL AND fge_private.acceso_producto(id_producto, false));
CREATE POLICY archivos_producto_alta ON public.archivos FOR INSERT TO authenticated
WITH CHECK (id_producto IS NOT NULL AND categoria = 'imagen_producto' AND archived_at IS NULL AND fge_private.acceso_producto(id_producto, true));
CREATE POLICY archivos_producto_modificacion ON public.archivos FOR UPDATE TO authenticated
USING (id_producto IS NOT NULL AND archived_at IS NULL AND fge_private.acceso_producto(id_producto, true))
WITH CHECK (id_producto IS NOT NULL AND categoria = 'imagen_producto' AND fge_private.acceso_producto(id_producto, true));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'fge-archivos' AND NOT public) THEN
    RAISE EXCEPTION 'Se requiere el bucket privado fge-archivos existente' USING ERRCODE = '55000';
  END IF;
END $$;
GRANT SELECT, INSERT ON storage.objects TO authenticated;
CREATE POLICY storage_producto_consulta ON storage.objects FOR SELECT TO authenticated
USING (fge_private.acceso_objeto_producto(bucket_id, name, false));
CREATE POLICY storage_producto_alta ON storage.objects FOR INSERT TO authenticated
WITH CHECK (fge_private.acceso_objeto_producto(bucket_id, name, true));

CREATE VIEW public.productos_por_territorio WITH (security_invoker = true) AS
SELECT p.id_producto, p.id_organizacion, o.id_pais, p.nombre, p.descripcion,
  p.tipo_item, p.categoria, p.material_terminacion, p.caracteristicas,
  p.informacion_adicional, p.unidad_medida, p.publicado, p.archived_at, p.version
FROM public.productos p JOIN public.organizaciones o ON o.id_organizacion = p.id_organizacion
WHERE p.archived_at IS NULL;
REVOKE ALL ON public.productos_por_territorio FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.productos_por_territorio TO authenticated;

CREATE INDEX productos_organizacion_vigentes_idx ON public.productos(id_organizacion, nombre, id_producto) WHERE archived_at IS NULL;
CREATE INDEX productos_categoria_vigentes_idx ON public.productos(categoria, id_producto) WHERE publicado AND archived_at IS NULL;
CREATE INDEX archivos_producto_disponibles_idx ON public.archivos(id_producto, created_at, id_archivo)
  WHERE categoria = 'imagen_producto' AND estado_carga = 'disponible' AND archived_at IS NULL;

COMMENT ON VIEW public.productos_por_territorio IS 'Consulta interna con RLS por Organización o país. No publica automáticamente la tabla al visitante; la proyección web y entrega de imágenes firmadas corresponden a la integración del catálogo.';
NOTIFY pgrst, 'reload schema';
COMMIT;
