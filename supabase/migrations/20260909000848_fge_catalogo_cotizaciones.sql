BEGIN;
CREATE TABLE public.productos (
  id_producto uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_organizacion uuid NOT NULL REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion text NOT NULL CHECK (btrim(descripcion) <> ''),
  unidad_medida text NOT NULL CHECK (btrim(unidad_medida) <> ''),
  publicado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE public.solicitudes_cotizacion (
  id_solicitud uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_solicitante text NOT NULL CHECK (btrim(nombre_solicitante) <> ''),
  correo text NOT NULL CHECK (correo ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  telefono text,
  mensaje text,
  estado text NOT NULL DEFAULT 'solicitada' CHECK (estado IN ('solicitada','en_gestion','cotizada','cerrada','rechazada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE public.solicitud_cotizacion_detalles (
  id_detalle uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_solicitud uuid NOT NULL REFERENCES public.solicitudes_cotizacion(id_solicitud) ON DELETE RESTRICT,
  id_producto uuid NOT NULL REFERENCES public.productos(id_producto) ON DELETE RESTRICT,
  cantidad numeric NOT NULL CHECK (cantidad > 0 AND cantidad < 'Infinity'::numeric),
  nombre_producto text NOT NULL,
  unidad_medida text NOT NULL,
  UNIQUE (id_solicitud,id_producto),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.archivos ADD COLUMN id_producto uuid REFERENCES public.productos(id_producto) ON DELETE RESTRICT;
ALTER TABLE public.archivos DROP CONSTRAINT archivo_un_destino;
ALTER TABLE public.archivos ADD CONSTRAINT archivo_un_destino CHECK (
 num_nonnulls(id_organizacion,id_informacion_legal,id_programa,id_accion,id_donacion,id_producto) = 1
);
ALTER TABLE public.archivos DROP CONSTRAINT archivo_categoria_destino;
ALTER TABLE public.archivos ADD CONSTRAINT archivo_categoria_destino CHECK (
 (id_organizacion IS NOT NULL AND categoria IN ('identidad_representante','imagen_organizacion','otro_organizacion')) OR
 (id_informacion_legal IS NOT NULL AND categoria IN ('identificacion_legal','estatutos','otro_legal')) OR
 (id_programa IS NOT NULL AND categoria = 'imagen_programa') OR
 (id_accion IS NOT NULL AND categoria IN ('acta_pdf','foto','audio','video','otro_evidencia')) OR
 (id_donacion IS NOT NULL AND categoria = 'respaldo_donacion') OR
 (id_producto IS NOT NULL AND categoria = 'imagen_producto' AND mime_type IN ('image/jpeg','image/png','image/webp'))
);
CREATE FUNCTION fge_private.validar_producto_cotizado() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.id_organizacion IS DISTINCT FROM OLD.id_organizacion AND EXISTS (
   SELECT FROM public.solicitud_cotizacion_detalles WHERE id_producto = OLD.id_producto
 ) THEN
   RAISE EXCEPTION 'No cambiar la organización de un producto ya solicitado' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validar_producto_cotizado BEFORE UPDATE ON public.productos
 FOR EACH ROW EXECUTE FUNCTION fge_private.validar_producto_cotizado();

CREATE FUNCTION fge_private.preparar_detalle_cotizacion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE producto public.productos;
BEGIN
 IF TG_OP = 'UPDATE' THEN
   IF NEW.id_producto IS DISTINCT FROM OLD.id_producto OR NEW.id_solicitud IS DISTINCT FROM OLD.id_solicitud THEN
     RAISE EXCEPTION 'El detalle no puede cambiar de producto o solicitud' USING ERRCODE = '23514';
   END IF;
   NEW.nombre_producto := OLD.nombre_producto;
   NEW.unidad_medida := OLD.unidad_medida;
 ELSE
   SELECT p.* INTO producto FROM public.productos p
   JOIN public.organizaciones o USING (id_organizacion)
   WHERE p.id_producto = NEW.id_producto AND p.publicado AND p.archived_at IS NULL
     AND o.archived_at IS NULL FOR SHARE OF p,o;
   IF NOT FOUND THEN
     RAISE EXCEPTION 'Producto no disponible para cotizar' USING ERRCODE = '23514';
   END IF;
   NEW.nombre_producto := producto.nombre;
   NEW.unidad_medida := producto.unidad_medida;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preparar_detalle BEFORE INSERT OR UPDATE ON public.solicitud_cotizacion_detalles
 FOR EACH ROW EXECUTE FUNCTION fge_private.preparar_detalle_cotizacion();

CREATE FUNCTION fge_private.exigir_detalle_cotizacion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE solicitud uuid;
BEGIN
 IF TG_OP = 'DELETE' THEN solicitud := OLD.id_solicitud; ELSE solicitud := NEW.id_solicitud; END IF;
 PERFORM 1 FROM public.solicitudes_cotizacion WHERE id_solicitud = solicitud FOR NO KEY UPDATE;
 IF EXISTS (SELECT FROM public.solicitudes_cotizacion WHERE id_solicitud = solicitud)
 AND NOT EXISTS (SELECT FROM public.solicitud_cotizacion_detalles WHERE id_solicitud = solicitud AND archived_at IS NULL) THEN
   RAISE EXCEPTION 'La solicitud debe incluir al menos un producto' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER solicitud_con_productos AFTER INSERT OR UPDATE ON public.solicitudes_cotizacion
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fge_private.exigir_detalle_cotizacion();
CREATE CONSTRAINT TRIGGER detalle_no_vacia_solicitud AFTER DELETE OR UPDATE ON public.solicitud_cotizacion_detalles
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fge_private.exigir_detalle_cotizacion();
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.productos FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.productos
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.productos
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_producto');
CREATE INDEX productos_created_by_idx ON public.productos(created_by);
CREATE INDEX productos_updated_by_idx ON public.productos(updated_by);
ALTER TABLE public.solicitudes_cotizacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.solicitudes_cotizacion FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.solicitudes_cotizacion
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.solicitudes_cotizacion
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_solicitud');
CREATE INDEX solicitudes_cotizacion_created_by_idx ON public.solicitudes_cotizacion(created_by);
CREATE INDEX solicitudes_cotizacion_updated_by_idx ON public.solicitudes_cotizacion(updated_by);
ALTER TABLE public.solicitud_cotizacion_detalles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.solicitud_cotizacion_detalles FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.solicitud_cotizacion_detalles
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.solicitud_cotizacion_detalles
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_detalle');
CREATE INDEX solicitud_cotizacion_detalles_created_by_idx ON public.solicitud_cotizacion_detalles(created_by);
CREATE INDEX solicitud_cotizacion_detalles_updated_by_idx ON public.solicitud_cotizacion_detalles(updated_by);
CREATE INDEX productos_organizacion_idx ON public.productos(id_organizacion);
CREATE INDEX productos_catalogo_idx ON public.productos(nombre,id_producto) WHERE publicado AND archived_at IS NULL;
CREATE INDEX solicitudes_bandeja_idx ON public.solicitudes_cotizacion(estado,created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX detalles_producto_idx ON public.solicitud_cotizacion_detalles(id_producto);
CREATE INDEX archivos_producto_idx ON public.archivos(id_producto);
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fge_private FROM PUBLIC, anon, authenticated;
COMMIT;
