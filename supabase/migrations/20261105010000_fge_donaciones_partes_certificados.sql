-- Perspectiva de la organización y conservación de certificados en archivos.
BEGIN;

COMMENT ON COLUMN public.donaciones.tipo_movimiento IS
  'Perspectiva de id_organizacion: recibida = contraparte emite y organización recibe; entregada = organización emite y contraparte recibe. Independiente de estado.';
COMMENT ON COLUMN public.donaciones.contraparte_nombre IS
  'Emisor externo en recibidas; receptor externo en entregadas. La organización se identifica mediante id_organizacion y su país por la FK compuesta.';

-- Proyección sin duplicar datos editables. SECURITY INVOKER mantiene el RLS
-- de donaciones para ADMIN/COORD y las restricciones vigentes de invitados.
CREATE VIEW public.donaciones_partes WITH (security_invoker = true) AS
SELECT d.*,
  CASE WHEN d.tipo_movimiento = 'recibida'
    THEN jsonb_build_object('tipo','contraparte','nombre',d.contraparte_nombre)
    ELSE jsonb_build_object('tipo','organizacion','id_organizacion',d.id_organizacion,'id_pais',d.id_pais)
  END AS emisor,
  CASE WHEN d.tipo_movimiento = 'entregada'
    THEN jsonb_build_object('tipo','contraparte','nombre',d.contraparte_nombre)
    ELSE jsonb_build_object('tipo','organizacion','id_organizacion',d.id_organizacion,'id_pais',d.id_pais)
  END AS receptor
FROM public.donaciones d;
REVOKE ALL ON public.donaciones_partes FROM PUBLIC, anon;
GRANT SELECT ON public.donaciones_partes TO authenticated;

CREATE OR REPLACE FUNCTION fge_private.validar_archivo_donacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_extension text;
BEGIN
  -- También comprueba OLD: quitar id_donacion no puede eludir el validador.
  IF TG_OP = 'UPDATE' AND OLD.id_donacion IS NOT NULL THEN
    IF ROW(NEW.id_archivo, NEW.id_donacion, NEW.bucket_id, NEW.ruta_objeto,
           NEW.nombre_original, NEW.mime_type, NEW.tamano_bytes, NEW.categoria, NEW.tipo_respaldo)
       IS DISTINCT FROM
       ROW(OLD.id_archivo, OLD.id_donacion, OLD.bucket_id, OLD.ruta_objeto,
           OLD.nombre_original, OLD.mime_type, OLD.tamano_bytes, OLD.categoria, OLD.tipo_respaldo) THEN
      RAISE EXCEPTION 'RESPALDO_INMUTABLE: no se permite cambiar la donación ni la identidad del documento reservado.' USING ERRCODE = '23514';
    END IF;
    IF NEW.estado_carga IS DISTINCT FROM OLD.estado_carga AND NOT (
      (OLD.estado_carga = 'reservado' AND NEW.estado_carga IN ('disponible','fallido')) OR
      (OLD.estado_carga = 'fallido' AND NEW.estado_carga = 'reservado')
    ) THEN
      RAISE EXCEPTION 'ESTADO_RESPALDO_INVALIDO: transición de carga no permitida.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.id_donacion IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.id_donacion IS DISTINCT FROM NEW.id_donacion THEN
    RAISE EXCEPTION 'RESPALDO_INMUTABLE: el archivo no puede cambiar de destino.' USING ERRCODE = '23514';
  END IF;
  IF NEW.bucket_id <> 'fge-archivos'
     OR NEW.ruta_objeto !~ ('^donaciones/' || NEW.id_donacion::text || '/[^/]+$')
     OR NEW.categoria NOT IN ('comprobante','acta_entrega','certificado','fotografia','respaldo_donacion')
     OR (NEW.tipo_respaldo IS NOT NULL AND NEW.tipo_respaldo <> NEW.categoria) THEN
    RAISE EXCEPTION 'RESPALDO_INVALIDO: categoría, bucket o ruta no corresponden a la donación.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Serializa reserva y archivado: nunca se agrega un respaldo a una donación archivada.
    PERFORM 1 FROM public.donaciones WHERE id_donacion = NEW.id_donacion AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DONACION_NO_DISPONIBLE: la donación no existe o está archivada.' USING ERRCODE = '23503';
    END IF;
    v_extension := CASE NEW.mime_type WHEN 'application/pdf' THEN 'pdf'
      WHEN 'image/jpeg' THEN 'jpe?g' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' END;
    IF v_extension IS NULL OR NEW.tamano_bytes IS NULL OR NEW.tamano_bytes NOT BETWEEN 1 AND 52428800
       OR NEW.tipo_respaldo IS NULL OR NEW.estado_carga <> 'reservado'
       OR NEW.ruta_objeto !~ ('^donaciones/' || NEW.id_donacion::text || '/' || NEW.id_archivo::text || '\.(' || v_extension || ')$') THEN
      RAISE EXCEPTION 'RESPALDO_INVALIDO: reserva, tipo, tamaño o nombre de objeto inválido.' USING ERRCODE = '23514';
    END IF;
  END IF;
  -- Sin reemplazar los triggers de sellado, auditoría, FKs o políticas de Storage.
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.validar_archivo_donacion() FROM PUBLIC, anon, authenticated;

COMMENT ON VIEW public.donaciones_partes IS
  'Emisor y receptor derivados del movimiento y las relaciones originales. No contiene copias editables de las partes.';
NOTIFY pgrst, 'reload schema';
COMMIT;
