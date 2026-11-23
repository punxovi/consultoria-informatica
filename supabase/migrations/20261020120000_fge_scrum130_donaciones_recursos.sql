BEGIN;

ALTER TABLE public.donaciones
  ADD COLUMN id_pais uuid REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  ADD COLUMN id_programa uuid REFERENCES public.programas(id_programa) ON DELETE RESTRICT,
  ADD COLUMN categoria text CHECK (categoria IN ('Dinero','Producto','Servicio','Insumos','Otro')),
  ADD COLUMN categoria_otro text CHECK (categoria_otro IS NULL OR btrim(categoria_otro) <> ''),
  ADD COLUMN tipo_donante text CHECK (tipo_donante IN ('empresa','persona','organizacion')),
  ADD COLUMN origen text CHECK (origen IS NULL OR btrim(origen) <> ''),
  ADD COLUMN estado text CHECK (estado IN ('Comprometida','Recibida','Entregada','Cerrada')),
  ADD COLUMN valor_estimado numeric,
  ADD COLUMN moneda_valorizacion text CHECK (moneda_valorizacion ~ '^[A-Z]{3}$'),
  ADD COLUMN metodo_valorizacion text CHECK (metodo_valorizacion IS NULL OR btrim(metodo_valorizacion) <> '');

UPDATE public.donaciones d SET id_pais = o.id_pais
FROM public.organizaciones o WHERE o.id_organizacion = d.id_organizacion;
UPDATE public.donaciones SET categoria = 'Dinero' WHERE tipo_aporte = 'dinero';
ALTER TABLE public.donaciones ALTER COLUMN id_pais SET NOT NULL;

ALTER TABLE public.organizaciones ADD CONSTRAINT organizaciones_id_pais_donaciones_uq
  UNIQUE (id_organizacion, id_pais);
ALTER TABLE public.donaciones ADD CONSTRAINT donacion_organizacion_pais_fk
  FOREIGN KEY (id_organizacion, id_pais)
  REFERENCES public.organizaciones(id_organizacion, id_pais) ON DELETE RESTRICT;

ALTER TABLE public.donaciones
  ADD CONSTRAINT donacion_categoria_tipo CHECK (
    categoria IS NULL OR (categoria = 'Dinero' AND tipo_aporte = 'dinero')
    OR (categoria <> 'Dinero' AND tipo_aporte = 'recurso')),
  ADD CONSTRAINT donacion_otro_descripcion CHECK (
    (categoria IS NOT DISTINCT FROM 'Otro' AND categoria_otro IS NOT NULL)
    OR (categoria IS DISTINCT FROM 'Otro' AND categoria_otro IS NULL)),
  ADD CONSTRAINT donacion_valorizacion_completa CHECK (
    (valor_estimado IS NULL AND moneda_valorizacion IS NULL AND metodo_valorizacion IS NULL)
    OR (valor_estimado IS NOT NULL AND valor_estimado >= 0
      AND valor_estimado NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      AND moneda_valorizacion IS NOT NULL AND metodo_valorizacion IS NOT NULL));

ALTER TABLE public.donaciones DROP CONSTRAINT donacion_valores_validos;
ALTER TABLE public.donaciones ADD CONSTRAINT donacion_valores_validos CHECK (
  (tipo_aporte = 'dinero' AND monto IS NOT NULL AND monto > 0
    AND monto NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    AND moneda IS NOT NULL AND cantidad IS NULL AND unidad IS NULL)
  OR (tipo_aporte = 'recurso' AND monto IS NULL AND moneda IS NULL AND (
    (cantidad IS NULL AND unidad IS NULL) OR
    (cantidad IS NOT NULL AND cantidad > 0
      AND cantidad NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
      AND NULLIF(btrim(unidad),'') IS NOT NULL))));

CREATE FUNCTION fge_private.validar_donacion_relaciones() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id_pais IS NULL THEN
    SELECT id_pais INTO NEW.id_pais FROM public.organizaciones
      WHERE id_organizacion = NEW.id_organizacion;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La Organización no existe.' USING ERRCODE = '23503';
    END IF;
  END IF;
  IF NEW.categoria IS NULL AND NEW.tipo_aporte = 'dinero' THEN NEW.categoria := 'Dinero'; END IF;
  IF TG_OP = 'INSERT' OR NEW.id_organizacion IS DISTINCT FROM OLD.id_organizacion
     OR NEW.id_pais IS DISTINCT FROM OLD.id_pais
     OR NEW.id_programa IS DISTINCT FROM OLD.id_programa THEN
    IF NOT EXISTS (SELECT 1 FROM public.organizaciones WHERE id_organizacion = NEW.id_organizacion AND archived_at IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public.paises WHERE id_pais = NEW.id_pais AND archived_at IS NULL)
       OR (NEW.id_programa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.programas WHERE id_programa = NEW.id_programa AND archived_at IS NULL)) THEN
      RAISE EXCEPTION 'País, Organización o Programa no disponible.' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.validar_donacion_relaciones() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar_donacion_relaciones BEFORE INSERT OR UPDATE ON public.donaciones
  FOR EACH ROW EXECUTE FUNCTION fge_private.validar_donacion_relaciones();

CREATE INDEX donaciones_pais_fecha_idx ON public.donaciones(id_pais, fecha) WHERE archived_at IS NULL;
CREATE INDEX donaciones_programa_idx ON public.donaciones(id_programa) WHERE id_programa IS NOT NULL;

COMMENT ON COLUMN public.donaciones.categoria IS 'HU20: Dinero, Producto, Servicio, Insumos, Otro. NULL: clasificación pendiente en contrato legado.';
COMMENT ON COLUMN public.donaciones.tipo_donante IS 'HU20: empresa, persona u organización. NULL: información histórica no declarada.';
COMMENT ON COLUMN public.donaciones.origen IS 'Procedencia declarada del aporte. No se infiere de tipo_movimiento.';
COMMENT ON COLUMN public.donaciones.estado IS 'Estado del aporte, independiente de la dirección del movimiento. NULL: pendiente de completar por el cliente legado.';
COMMENT ON COLUMN public.donaciones.valor_estimado IS 'Valorización opcional de dinero o recursos; no reemplaza el monto efectivo.';
COMMENT ON COLUMN public.donaciones.id_programa IS 'Programa institucional global opcional; no requiere inventar un Plan.';
NOTIFY pgrst, 'reload schema';
COMMIT;
