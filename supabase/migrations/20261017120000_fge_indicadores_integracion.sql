BEGIN;

DO $prerequisitos$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.indicadores'::regclass
      AND attname='id_accion' AND attnotnull)
    OR to_regprocedure('fge_private.acceso_indicador_accion(uuid,boolean)') IS NULL
    OR EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.indicadores'::regclass,'public.resultados'::regclass)
      AND NOT relrowsecurity)
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND
      ((tablename='indicadores' AND policyname IN ('indicadores_lectura','indicadores_insert','indicadores_update'))
      OR (tablename='resultados' AND policyname IN ('resultados_lectura','resultados_insert','resultados_update')))) <> 6
  THEN
    RAISE EXCEPTION 'Primero aplica completa 20261015130000_fge_sprint6_rls.sql: faltan los permisos o la estructura del catálogo.'
      USING ERRCODE = '55000';
  END IF;
END;
$prerequisitos$;

ALTER TABLE public.indicadores ADD COLUMN id_catalogo uuid
  REFERENCES public.indicadores(id_indicador) ON DELETE RESTRICT;
ALTER TABLE public.indicadores ADD CONSTRAINT indicadores_catalogo_accion_check
  CHECK (id_catalogo IS NULL OR (id_accion IS NOT NULL AND id_catalogo <> id_indicador));
CREATE UNIQUE INDEX indicadores_accion_catalogo_activo_idx
  ON public.indicadores(id_accion, id_catalogo)
  WHERE archived_at IS NULL AND id_catalogo IS NOT NULL;
CREATE INDEX resultados_indicador_reciente_idx
  ON public.resultados(id_indicador, created_at DESC, id_resultado DESC)
  WHERE archived_at IS NULL;

CREATE FUNCTION fge_private.proteger_relacion_indicador()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE catalogo public.indicadores;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_accion IS DISTINCT FROM OLD.id_accion OR NEW.id_catalogo IS DISTINCT FROM OLD.id_catalogo THEN
      RAISE EXCEPTION 'La relación del indicador no se puede cambiar.' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.id_catalogo IS NOT NULL THEN
    SELECT * INTO catalogo FROM public.indicadores
      WHERE id_indicador = NEW.id_catalogo AND id_accion IS NULL AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Indicador de catálogo no disponible.' USING ERRCODE = 'P0002'; END IF;
    NEW.nombre := catalogo.nombre;
    NEW.descripcion := catalogo.descripcion;
    NEW.unidad_medida := catalogo.unidad_medida;
    NEW.criterio_medicion := catalogo.criterio_medicion;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_relacion_indicador BEFORE INSERT OR UPDATE ON public.indicadores
  FOR EACH ROW EXECUTE FUNCTION fge_private.proteger_relacion_indicador();

CREATE FUNCTION fge_private.proteger_relacion_resultado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_indicador IS DISTINCT FROM OLD.id_indicador THEN
      RAISE EXCEPTION 'La relación del resultado no se puede cambiar.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.indicadores WHERE id_indicador = NEW.id_indicador
      AND id_accion IS NOT NULL AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'El resultado requiere un indicador asociado a una Acción.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_relacion_resultado BEFORE INSERT OR UPDATE ON public.resultados
  FOR EACH ROW EXECUTE FUNCTION fge_private.proteger_relacion_resultado();

CREATE FUNCTION fge_private.indicador_respuesta(p_fila public.indicadores)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id_indicador', p_fila.id_indicador, 'id_accion', p_fila.id_accion,
    'id_catalogo', p_fila.id_catalogo, 'nombre', p_fila.nombre,
    'descripcion', coalesce(p_fila.descripcion, ''), 'unidad_medida', p_fila.unidad_medida,
    'meta', p_fila.meta, 'version', p_fila.version,
    'resultado', (SELECT to_jsonb(r) FROM public.resultados r
      WHERE r.id_indicador = p_fila.id_indicador AND r.archived_at IS NULL
      ORDER BY r.created_at DESC, r.id_resultado DESC LIMIT 1));
$$;

CREATE FUNCTION public.consultar_catalogo_indicadores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id_indicador', i.id_indicador,
    'codigo', i.id_indicador::text, 'nombre', i.nombre,
    'descripcion', coalesce(i.descripcion, ''), 'unidad_medida', i.unidad_medida)
    ORDER BY i.nombre, i.id_indicador), '[]'::jsonb)
  FROM public.indicadores i WHERE i.id_accion IS NULL AND i.archived_at IS NULL;
$$;

CREATE FUNCTION public.listar_indicadores_accion(p_accion uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_accion IS NULL OR NOT fge_private.acceso_indicador_accion(p_accion, false)
    OR NOT EXISTS (SELECT 1 FROM public.acciones WHERE id_accion = p_accion AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Acción no disponible.' USING ERRCODE = 'P0002';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(fge_private.indicador_respuesta(i) ORDER BY i.created_at, i.id_indicador), '[]'::jsonb)
    FROM public.indicadores i WHERE i.id_accion = p_accion AND i.archived_at IS NULL);
END;
$$;

CREATE FUNCTION public.asociar_indicadores_accion(p_accion uuid, p_indicadores jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE entrada record; fila public.indicadores; salida jsonb := '[]'::jsonb;
BEGIN
  IF NOT fge_private.acceso_indicador_accion(p_accion, true) OR p_accion IS NULL THEN
    RAISE EXCEPTION 'Sin permiso para gestionar esta Acción.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.acciones WHERE id_accion = p_accion AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acción no disponible.' USING ERRCODE = 'P0002'; END IF;
  IF p_indicadores IS NULL OR jsonb_typeof(p_indicadores) <> 'array' THEN
    RAISE EXCEPTION 'Selecciona indicadores del catálogo.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_indicadores) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Selecciona entre 1 y 100 indicadores.' USING ERRCODE = '22023';
  END IF;
  FOR entrada IN SELECT * FROM jsonb_to_recordset(p_indicadores) AS x(id_indicador uuid, meta numeric)
  LOOP
    IF entrada.id_indicador IS NULL OR entrada.meta IS NULL OR entrada.meta < 0 OR entrada.meta > 9007199254740991 THEN
      RAISE EXCEPTION 'Indicador o meta inválida.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.indicadores(id_accion, id_catalogo, nombre, unidad_medida, meta)
      VALUES (p_accion, entrada.id_indicador, 'catálogo', 'unidad', entrada.meta) RETURNING * INTO fila;
    salida := salida || jsonb_build_array(fge_private.indicador_respuesta(fila));
  END LOOP;
  RETURN salida;
END;
$$;

CREATE FUNCTION public.actualizar_meta_indicador(p_id uuid, p_version bigint, p_meta numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE fila public.indicadores;
BEGIN
  SELECT * INTO fila FROM public.indicadores WHERE id_indicador = p_id AND archived_at IS NULL;
  IF NOT FOUND OR fila.id_accion IS NULL THEN RAISE EXCEPTION 'Indicador no disponible.' USING ERRCODE = 'P0002'; END IF;
  IF NOT fge_private.acceso_indicador_accion(fila.id_accion, true) THEN
    RAISE EXCEPTION 'Sin permiso para actualizar la meta.' USING ERRCODE = '42501';
  END IF;
  IF p_meta IS NULL OR p_meta < 0 OR p_meta > 9007199254740991 OR p_version IS NULL THEN
    RAISE EXCEPTION 'Meta o versión inválida.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.indicadores SET meta = p_meta
    WHERE id_indicador = p_id AND version = p_version AND archived_at IS NULL RETURNING * INTO fila;
  IF NOT FOUND THEN RAISE EXCEPTION 'La meta cambió; recarga los indicadores.' USING ERRCODE = '40001'; END IF;
  RETURN fge_private.indicador_respuesta(fila);
END;
$$;

CREATE FUNCTION public.guardar_resultado_indicador(
  p_indicador uuid, p_valor numeric, p_fecha date, p_observaciones text,
  p_id uuid DEFAULT NULL, p_version bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE ind public.indicadores; fila public.resultados;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO fila FROM public.resultados WHERE id_resultado = p_id AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Resultado no disponible.' USING ERRCODE = 'P0002'; END IF;
    IF p_indicador IS NOT NULL AND p_indicador <> fila.id_indicador THEN
      RAISE EXCEPTION 'El resultado pertenece a otro indicador.' USING ERRCODE = '22023';
    END IF;
    p_indicador := fila.id_indicador;
  END IF;
  SELECT * INTO ind FROM public.indicadores WHERE id_indicador = p_indicador AND archived_at IS NULL;
  IF NOT FOUND OR ind.id_accion IS NULL THEN RAISE EXCEPTION 'Indicador no disponible.' USING ERRCODE = 'P0002'; END IF;
  IF NOT fge_private.acceso_indicador_accion(ind.id_accion, true) THEN
    RAISE EXCEPTION 'Sin permiso para registrar resultados.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.indicadores WHERE id_indicador = p_indicador AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Indicador no disponible.' USING ERRCODE = 'P0002'; END IF;
  IF p_valor IS NULL OR p_valor < 0 OR p_valor > 9007199254740991 OR p_fecha IS NULL
    OR p_fecha < DATE '0001-01-01' OR p_fecha > DATE '9999-12-31' OR length(p_observaciones) > 1000 THEN
    RAISE EXCEPTION 'Revisa el valor, la fecha y las observaciones.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.resultados WHERE id_indicador = p_indicador AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'Ya existe un resultado; recarga antes de actualizarlo.' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.resultados(id_indicador, valor_medido, fecha_medicion, observaciones)
      VALUES(p_indicador, p_valor, p_fecha, nullif(btrim(p_observaciones), '')) RETURNING * INTO fila;
  ELSE
    UPDATE public.resultados SET valor_medido = p_valor, fecha_medicion = p_fecha,
      observaciones = nullif(btrim(p_observaciones), '')
      WHERE id_resultado = p_id AND version = p_version AND archived_at IS NULL RETURNING * INTO fila;
    IF NOT FOUND THEN RAISE EXCEPTION 'El resultado cambió; recarga los indicadores.' USING ERRCODE = '40001'; END IF;
  END IF;
  RETURN to_jsonb(fila);
END;
$$;

REVOKE ALL ON FUNCTION fge_private.proteger_relacion_indicador(),
  fge_private.proteger_relacion_resultado(), fge_private.indicador_respuesta(public.indicadores)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.indicador_respuesta(public.indicadores) TO authenticated;
REVOKE ALL ON FUNCTION public.consultar_catalogo_indicadores(), public.listar_indicadores_accion(uuid),
  public.asociar_indicadores_accion(uuid, jsonb), public.actualizar_meta_indicador(uuid, bigint, numeric),
  public.guardar_resultado_indicador(uuid, numeric, date, text, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_catalogo_indicadores(), public.listar_indicadores_accion(uuid),
  public.asociar_indicadores_accion(uuid, jsonb), public.actualizar_meta_indicador(uuid, bigint, numeric),
  public.guardar_resultado_indicador(uuid, numeric, date, text, uuid, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
