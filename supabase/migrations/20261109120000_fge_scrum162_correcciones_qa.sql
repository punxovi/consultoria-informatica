-- Correcciones SCRUM-162 sobre la integración vigente. Conserva UUID, imágenes,
-- Organización y referencias de cotizaciones. No modifica migraciones aplicadas.
BEGIN;
ALTER TABLE public.productos
  ADD COLUMN material text CHECK (material IS NULL OR btrim(material) <> ''),
  ADD COLUMN terminacion text CHECK (terminacion IS NULL OR btrim(terminacion) <> '');

-- El dato histórico es un texto combinado: se conserva íntegro, sin adivinar
-- una separación por «·», que también puede formar parte del propio material.
UPDATE public.productos SET material=material_terminacion WHERE material_terminacion IS NOT NULL;

CREATE FUNCTION fge_private.sincronizar_material_producto() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.material IS NULL AND NEW.terminacion IS NULL THEN
      NEW.material := NEW.material_terminacion;
    ELSE
      NEW.material_terminacion := nullif(concat_ws(' · ',NEW.material,NEW.terminacion),'');
    END IF;
  ELSIF NEW.material IS DISTINCT FROM OLD.material OR NEW.terminacion IS DISTINCT FROM OLD.terminacion THEN
    NEW.material_terminacion := nullif(concat_ws(' · ',NEW.material,NEW.terminacion),'');
  ELSIF NEW.material_terminacion IS DISTINCT FROM OLD.material_terminacion THEN
    -- Compatibilidad para clientes antiguos que todavía escriben el texto único.
    NEW.material := NEW.material_terminacion;
    NEW.terminacion := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.sincronizar_material_producto() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sincronizar_material_producto BEFORE INSERT OR UPDATE ON public.productos
  FOR EACH ROW EXECUTE FUNCTION fge_private.sincronizar_material_producto();
COMMENT ON COLUMN public.productos.material IS 'Material independiente; el dato combinado histórico se conserva íntegro al migrar.';
COMMENT ON COLUMN public.productos.terminacion IS 'Terminación independiente: un PATCH de material no la elimina.';
NOTIFY pgrst, 'reload schema';
COMMIT;
