
CREATE TABLE IF NOT EXISTS indicadores (
    id_indicador UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_accion UUID NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    unidad_medida TEXT NOT NULL,
    meta NUMERIC,
    criterio_medicion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    archived_at TIMESTAMPTZ,
    version INT8 NOT NULL DEFAULT 1
);

-- Índice para optimizar búsquedas por acción
CREATE INDEX IF NOT EXISTS idx_indicadores_id_accion ON indicadores(id_accion);