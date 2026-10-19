-- Creación de la tabla de indicadores (Catálogo estandarizado global)
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

-- Carga inicial (Seed) automática de los 5 indicadores 
INSERT INTO indicadores (nombre, descripcion, unidad_medida) VALUES
    ('Número de beneficiarios', 'Cantidad total de beneficiarios atendidos en la acción', 'Personas'),
    ('Número de participantes', 'Cantidad de participantes involucrados activamente', 'Participantes'),
    ('Número de capacitaciones', 'Total de talleres o capacitaciones realizadas', 'Sesiones'),
    ('Número de raciones', 'Cantidad de raciones de alimentos entregadas', 'Raciones'),
    ('Acciones ejecutadas', 'Número de acciones completadas en el periodo', 'Acciones')
ON CONFLICT (nombre) DO NOTHING;

-- Índice para optimizar búsquedas por nombre del indicador
CREATE INDEX IF NOT EXISTS idx_indicadores_nombre ON indicadores(nombre);