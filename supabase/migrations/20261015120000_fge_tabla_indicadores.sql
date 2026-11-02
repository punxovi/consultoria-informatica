-- Estructura base del catalogo de indicadores.
-- La carga inicial se realiza en la migracion de RLS, despues de permitir
-- indicadores estandar con id_accion NULL.
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

-- Indice para optimizar busquedas por nombre del indicador.
CREATE INDEX IF NOT EXISTS idx_indicadores_nombre ON indicadores(nombre);
