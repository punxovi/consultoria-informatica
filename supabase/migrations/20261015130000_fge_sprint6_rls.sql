-- Políticas RLS para Sprint 6: Indicadores, Resultados y control de acceso
BEGIN;

-- ==============================================================================
-- 1. Estructura y permisos para Indicadores y Resultados
-- ==============================================================================

-- Permitir que id_accion sea opcional para el catálogo estándar de indicadores
ALTER TABLE public.indicadores ALTER COLUMN id_accion DROP NOT NULL;

-- Asegurar que Row Level Security esté activo
ALTER TABLE public.indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados ENABLE ROW LEVEL SECURITY;

-- Revocar accesos públicos y anónimos, conceder a usuarios autenticados
REVOKE ALL ON TABLE public.indicadores FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.indicadores TO authenticated;

REVOKE ALL ON TABLE public.resultados FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.resultados TO authenticated;

-- ==============================================================================
-- 2. Funciones auxiliares de acceso para Indicadores y Resultados
-- ==============================================================================

-- Función para verificar si el usuario actual tiene rol de Administrador activo
CREATE OR REPLACE FUNCTION fge_private.usuario_es_administrador()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.asignaciones_roles ar
    JOIN public.roles r ON r.id_rol = ar.id_rol
    WHERE ar.id_usuario = auth.uid()
      AND ar.revocado_at IS NULL
      AND ar.archived_at IS NULL
      AND r.activo = true
      AND r.archived_at IS NULL
      AND r.codigo = 'ADMIN'
  );
$$;

-- Función para verificar si el usuario tiene algún rol activo en la plataforma
CREATE OR REPLACE FUNCTION fge_private.usuario_tiene_rol_activo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.asignaciones_roles ar
    JOIN public.roles r ON r.id_rol = ar.id_rol
    WHERE ar.id_usuario = auth.uid()
      AND ar.revocado_at IS NULL
      AND ar.archived_at IS NULL
      AND r.activo = true
      AND r.archived_at IS NULL
      AND r.codigo IN ('ADMIN', 'COORD', 'INVIT')
  );
$$;

-- Control de acceso para indicadores (asociados a una Acción o del catálogo estándar)
CREATE OR REPLACE FUNCTION fge_private.acceso_indicador_accion(p_accion uuid, p_gestion boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    -- Catálogo estándar de indicadores (sin acción vinculada)
    WHEN p_accion IS NULL THEN
      CASE
        WHEN p_gestion THEN fge_private.usuario_es_administrador()
        ELSE fge_private.usuario_tiene_rol_activo()
      END
    -- Indicador asociado a una Acción específica (hereda organización territorial)
    ELSE
      EXISTS (
        SELECT 1 FROM public.acciones a
        JOIN public.planes p ON p.id_plan = a.id_plan
        WHERE a.id_accion = p_accion
          AND a.archived_at IS NULL
          AND p.archived_at IS NULL
          AND CASE
            WHEN p_gestion THEN fge_private.usuario_puede_gestionar_organizacion(p.id_organizacion)
            ELSE fge_private.usuario_puede_consultar_organizacion(p.id_organizacion)
          END
      )
  END;
$$;

REVOKE ALL ON FUNCTION fge_private.usuario_es_administrador() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.usuario_es_administrador() TO authenticated;

REVOKE ALL ON FUNCTION fge_private.usuario_tiene_rol_activo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.usuario_tiene_rol_activo() TO authenticated;

REVOKE ALL ON FUNCTION fge_private.acceso_indicador_accion(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.acceso_indicador_accion(uuid, boolean) TO authenticated;

-- ==============================================================================
-- 3. Políticas RLS para Indicadores
-- ==============================================================================

CREATE POLICY indicadores_lectura
ON public.indicadores FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.acceso_indicador_accion(id_accion, false)
);

CREATE POLICY indicadores_insert
ON public.indicadores FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND fge_private.acceso_indicador_accion(id_accion, true)
);

CREATE POLICY indicadores_update
ON public.indicadores FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.acceso_indicador_accion(id_accion, true)
)
WITH CHECK (
  archived_at IS NULL
  AND fge_private.acceso_indicador_accion(id_accion, true)
);

-- ==============================================================================
-- 4. Políticas RLS para Resultados
-- ==============================================================================

CREATE POLICY resultados_lectura
ON public.resultados FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.indicadores i
    WHERE i.id_indicador = resultados.id_indicador
      AND i.archived_at IS NULL
      AND fge_private.acceso_indicador_accion(i.id_accion, false)
  )
);

CREATE POLICY resultados_insert
ON public.resultados FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.indicadores i
    WHERE i.id_indicador = resultados.id_indicador
      AND i.archived_at IS NULL
      AND fge_private.acceso_indicador_accion(i.id_accion, true)
  )
);

CREATE POLICY resultados_update
ON public.resultados FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.indicadores i
    WHERE i.id_indicador = resultados.id_indicador
      AND i.archived_at IS NULL
      AND fge_private.acceso_indicador_accion(i.id_accion, true)
  )
)
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.indicadores i
    WHERE i.id_indicador = resultados.id_indicador
      AND i.archived_at IS NULL
      AND fge_private.acceso_indicador_accion(i.id_accion, true)
  )
);

-- ==============================================================================
-- 5. Funciones seguras de archivado (Soft Delete)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.archivar_indicador_seguro(p_id uuid, p_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fila public.indicadores;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  SELECT * INTO fila FROM public.indicadores WHERE id_indicador = p_id FOR UPDATE;
  IF NOT FOUND OR NOT fge_private.acceso_indicador_accion(fila.id_accion, true) THEN
    RAISE EXCEPTION 'Indicador no disponible o sin permiso.' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR fila.version <> p_version OR fila.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'El indicador cambió; recargue antes de archivar.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.resultados SET archived_at = clock_timestamp() WHERE id_indicador = p_id AND archived_at IS NULL;
  UPDATE public.indicadores SET archived_at = clock_timestamp() WHERE id_indicador = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archivar_resultado_seguro(p_id uuid, p_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fila public.resultados;
        ind public.indicadores;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  SELECT * INTO fila FROM public.resultados WHERE id_resultado = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resultado no disponible o sin permiso.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO ind FROM public.indicadores WHERE id_indicador = fila.id_indicador;
  IF NOT FOUND OR ind.archived_at IS NOT NULL OR NOT fge_private.acceso_indicador_accion(ind.id_accion, true) THEN
    RAISE EXCEPTION 'Sin permiso para archivar este resultado.' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR fila.version <> p_version OR fila.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'El resultado cambió; recargue antes de archivar.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.resultados SET archived_at = clock_timestamp() WHERE id_resultado = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_indicador_seguro(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archivar_indicador_seguro(uuid, bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.archivar_resultado_seguro(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archivar_resultado_seguro(uuid, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
