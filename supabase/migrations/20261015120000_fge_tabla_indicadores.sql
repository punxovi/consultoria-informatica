CREATE TABLE IF NOT EXISTS indicadores (
    id_indicador UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    unidad_medida TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    version INT8 NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_indicadores_nombre ON indicadores(nombre);
