-- Compatibilidad con el esquema base de Indicadores y Resultados.
--
-- El esquema inicial ya crea public.resultados vinculada directamente a
-- public.indicadores mediante id_indicador. La integracion vigente conserva
-- ese modelo y no utiliza una tabla intermedia accion_indicadores.
-- Este archivo solo conserva la tabla historica auxiliar si aun no existe;
-- no intenta redefinir public.resultados ni sus columnas.
CREATE TABLE IF NOT EXISTS accion_indicadores (
    id_accion_indicador UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_accion UUID NOT NULL REFERENCES public.acciones(id_accion) ON DELETE CASCADE,
    id_indicador UUID NOT NULL REFERENCES public.indicadores(id_indicador) ON DELETE RESTRICT,
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

CREATE INDEX IF NOT EXISTS idx_accion_indicadores_id_accion
  ON accion_indicadores(id_accion);
