-- Tabla intermedia para asociar un indicador del catálogo a una Acción con su respectiva meta
CREATE TABLE IF NOT EXISTS accion_indicadores (
    id_accion_indicador UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_accion UUID NOT NULL REFERENCES public.acciones(id_accion) ON DELETE CASCADE,
    id_indicador UUID NOT NULL REFERENCES indicadores(id_indicador) ON DELETE RESTRICT,
    meta NUMERIC NOT NULL CHECK (meta >= 0),
    criterio_medicion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    archived_at TIMESTAMPTZ,
    version INT8 NOT NULL DEFAULT 1,
    UNIQUE (id_accion, id_indicador)
);

-- Tabla de resultados periódicos vinculada a la asociación de la acción con el indicador
CREATE TABLE IF NOT EXISTS resultados (
    id_resultado UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_accion_indicador UUID NOT NULL REFERENCES accion_indicadores(id_accion_indicador) ON DELETE CASCADE,
    valor_medido NUMERIC NOT NULL CHECK (valor_medido >= 0),
    fecha_medicion DATE NOT NULL,
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    archived_at TIMESTAMPTZ,
    version INT8 NOT NULL DEFAULT 1
);

-- Índices para optimizar búsquedas y relaciones
CREATE INDEX IF NOT EXISTS idx_accion_indicadores_id_accion ON accion_indicadores(id_accion);
CREATE INDEX IF NOT EXISTS idx_resultados_id_accion_indicador ON resultados(id_accion_indicador);