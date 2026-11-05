BEGIN;

ALTER FUNCTION fge_private.exigir_detalle_cotizacion() SECURITY DEFINER;
ALTER FUNCTION fge_private.exigir_detalle_cotizacion() SET search_path = '';
REVOKE ALL ON FUNCTION fge_private.exigir_detalle_cotizacion() FROM PUBLIC, anon, authenticated;

COMMIT;
