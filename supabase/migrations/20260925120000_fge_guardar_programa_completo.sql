BEGIN;

CREATE POLICY programa_lineas_accion_admin_lectura_archivadas
ON public.programa_lineas_accion FOR SELECT TO authenticated
USING (
  archived_at IS NOT NULL
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
  AND EXISTS (
    SELECT 1 FROM public.programas AS programa
    WHERE programa.id_programa = programa_lineas_accion.id_programa
      AND programa.archived_at IS NULL
  )
);

CREATE FUNCTION public.guardar_programa_completo(
  p_datos jsonb,
  p_id_programa uuid DEFAULT NULL,
  p_version_esperada bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_programa public.programas;
  v_linea jsonb;
  v_componentes text;
  v_resultados text;
BEGIN
  IF NOT fge_private.usuario_tiene_rol(ARRAY['ADMIN']) THEN
    RAISE EXCEPTION 'No tiene permiso para guardar programas.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR p_datos = '{}'::jsonb THEN
    RAISE EXCEPTION 'Debe enviar los campos del programa.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_datos) AS campo
    WHERE campo NOT IN (
      'nombre', 'descripcion', 'objetivo_general', 'objetivos_especificos',
      'lineas_accion', 'referencias_ods', 'referencias_esg'
    )
  ) THEN
    RAISE EXCEPTION 'Campos de programa no permitidos.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_datos) AS campo
    WHERE campo.key IN ('nombre', 'descripcion', 'objetivo_general', 'objetivos_especificos') AND (
      jsonb_typeof(campo.value) <> 'string' OR btrim(campo.value #>> '{}') = ''
      OR char_length(campo.value #>> '{}') > CASE campo.key
        WHEN 'nombre' THEN 150 WHEN 'objetivo_general' THEN 3000 ELSE 5000 END
    )
  ) THEN
    RAISE EXCEPTION 'Campos de programa inválidos.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_datos) AS campo
    WHERE campo.key IN ('referencias_ods', 'referencias_esg')
      AND (jsonb_typeof(campo.value) <> 'string' OR char_length(campo.value #>> '{}') > 2000)
  ) THEN
    RAISE EXCEPTION 'Referencias de programa invalidas.' USING ERRCODE = '22023';
  END IF;

  IF p_id_programa IS NULL AND NOT p_datos ?& ARRAY[
    'nombre', 'descripcion', 'objetivo_general', 'objetivos_especificos', 'lineas_accion'
  ] THEN
    RAISE EXCEPTION 'Faltan campos obligatorios.' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'lineas_accion' THEN
    IF jsonb_typeof(p_datos->'lineas_accion') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Líneas de acción inválidas.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_datos->'lineas_accion') NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'Debe enviar entre 1 y 50 líneas.' USING ERRCODE = '22023';
    END IF;
    FOR v_linea IN SELECT value FROM jsonb_array_elements(p_datos->'lineas_accion') LOOP
      IF jsonb_typeof(v_linea) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Línea de acción inválida.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_linea->'linea_accion') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_linea->'resultado_esperado') IS DISTINCT FROM 'string'
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_linea) AS campo WHERE campo NOT IN ('linea_accion', 'resultado_esperado')) THEN
        RAISE EXCEPTION 'Línea de acción inválida.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_datos->'lineas_accion')
      GROUP BY lower(btrim(value->>'linea_accion')) HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Líneas de acción repetidas.' USING ERRCODE = '23505';
    END IF;
    SELECT string_agg(btrim(value->>'linea_accion'), E'\n' ORDER BY posicion),
           string_agg(btrim(value->>'resultado_esperado'), E'\n' ORDER BY posicion)
    INTO v_componentes, v_resultados
    FROM jsonb_array_elements(p_datos->'lineas_accion') WITH ORDINALITY AS lineas(value, posicion);
  END IF;

  IF p_id_programa IS NULL THEN
    INSERT INTO public.programas (
      nombre, descripcion, objetivo_general, objetivos_especificos,
      componentes_linea_accion, resultados_esperados, referencias_ods, referencias_esg
    ) VALUES (
      btrim(p_datos->>'nombre'), btrim(p_datos->>'descripcion'),
      btrim(p_datos->>'objetivo_general'), btrim(p_datos->>'objetivos_especificos'),
      v_componentes, v_resultados,
      coalesce(btrim(p_datos->>'referencias_ods'), ''),
      coalesce(btrim(p_datos->>'referencias_esg'), '')
    ) RETURNING * INTO v_programa;
  ELSE
    SELECT * INTO v_programa FROM public.programas
    WHERE id_programa = p_id_programa AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Programa no encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF p_version_esperada IS NOT NULL AND v_programa.version <> p_version_esperada THEN
      RAISE EXCEPTION 'El programa fue modificado por otra sesión.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.programas SET
      nombre = coalesce(btrim(p_datos->>'nombre'), nombre),
      descripcion = coalesce(btrim(p_datos->>'descripcion'), descripcion),
      objetivo_general = coalesce(btrim(p_datos->>'objetivo_general'), objetivo_general),
      objetivos_especificos = coalesce(btrim(p_datos->>'objetivos_especificos'), objetivos_especificos),
      componentes_linea_accion = coalesce(v_componentes, componentes_linea_accion),
      resultados_esperados = coalesce(v_resultados, resultados_esperados),
      referencias_ods = CASE WHEN p_datos ? 'referencias_ods' THEN btrim(p_datos->>'referencias_ods') ELSE referencias_ods END,
      referencias_esg = CASE WHEN p_datos ? 'referencias_esg' THEN btrim(p_datos->>'referencias_esg') ELSE referencias_esg END
    WHERE id_programa = p_id_programa RETURNING * INTO v_programa;
  END IF;

  IF p_datos ? 'lineas_accion' THEN
    UPDATE public.programa_lineas_accion AS existente SET archived_at = now()
    WHERE existente.id_programa = v_programa.id_programa AND existente.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_datos->'lineas_accion')
        WHERE lower(btrim(value->>'linea_accion')) = lower(btrim(existente.linea_accion))
      );
    FOR v_linea IN SELECT value FROM jsonb_array_elements(p_datos->'lineas_accion') LOOP
      UPDATE public.programa_lineas_accion SET
        linea_accion = btrim(v_linea->>'linea_accion'),
        resultado_esperado = btrim(v_linea->>'resultado_esperado')
      WHERE id_programa = v_programa.id_programa AND archived_at IS NULL
        AND lower(btrim(linea_accion)) = lower(btrim(v_linea->>'linea_accion'));
      IF NOT FOUND THEN
        INSERT INTO public.programa_lineas_accion (id_programa, linea_accion, resultado_esperado)
        VALUES (v_programa.id_programa, btrim(v_linea->>'linea_accion'), btrim(v_linea->>'resultado_esperado'));
      END IF;
    END LOOP;
  END IF;

  RETURN to_jsonb(v_programa) || jsonb_build_object('lineas_accion', (
    SELECT coalesce(jsonb_agg(to_jsonb(linea) ORDER BY linea.created_at, linea.id_linea_accion), '[]'::jsonb)
    FROM public.programa_lineas_accion AS linea
    WHERE linea.id_programa = v_programa.id_programa AND linea.archived_at IS NULL
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_programa_completo(jsonb, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_programa_completo(jsonb, uuid, bigint) TO authenticated;

COMMIT;
