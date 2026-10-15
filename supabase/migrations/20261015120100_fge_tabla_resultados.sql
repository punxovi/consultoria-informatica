
CREATE TABLE IF NOT EXISTS resultados (
    id_resultado UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_indicador UUID NOT NULL REFERENCES indicadores(id_indicador) ON DELETE CASCADE,
    valor_medido NUMERIC NOT NULL,
    fecha_medicion DATE NOT NULL,
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    archived_at TIMESTAMPTZ,
    version INT8 NOT NULL DEFAULT 1
);

-- Índice para optimizar búsquedas por indicador
CREATE INDEX IF NOT EXISTS idx_resultados_id_indicador ON resultados(id_indicador);