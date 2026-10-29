-- Tabla de historial inmutable (append-only) para auditoría de coberturas temporales
CREATE TABLE IF NOT EXISTS public.permisos_temporales_historial (
    id_historial UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_permiso_temporal UUID NOT NULL,
    tipo_evento VARCHAR(50) NOT NULL, -- 'OTORGAR', 'EXTENDER', 'REVOCAR'
    fin_at_anterior TIMESTAMPTZ NULL,
    fin_at_nuevo TIMESTAMPTZ NULL,
    motivo TEXT NOT NULL,
    accion_por UUID NOT NULL,
    accion_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para trazabilidad rápida
CREATE INDEX IF NOT EXISTS idx_permisos_historial_permiso_id ON public.permisos_temporales_historial(id_permiso_temporal);