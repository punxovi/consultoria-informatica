-- Exigir teléfono en solicitudes nuevas sin alterar el historial previo.
BEGIN;
CREATE FUNCTION fge_private.exigir_telefono_cotizacion() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.telefono IS NULL OR NEW.telefono !~ '[^[:space:]]' OR length(NEW.telefono)>60
    OR NEW.telefono ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'El teléfono es obligatorio y admite hasta 60 caracteres' USING ERRCODE='22023';
  END IF;
  NEW.telefono := btrim(NEW.telefono);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.exigir_telefono_cotizacion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER exigir_telefono_cotizacion BEFORE INSERT ON public.solicitudes_cotizacion
  FOR EACH ROW EXECUTE FUNCTION fge_private.exigir_telefono_cotizacion();
NOTIFY pgrst, 'reload schema';
COMMIT;
