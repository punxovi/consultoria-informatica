-- Catalogo inicial para asociar indicadores a acciones.
-- nombre no es UNIQUE, por eso no se usa ON CONFLICT.
BEGIN;

WITH catalogo(nombre, descripcion, unidad_medida, criterio_medicion) AS (
  VALUES
    ('Personas beneficiadas', 'Cantidad de personas beneficiadas por la accion.', 'Personas', 'Conteo de personas beneficiadas.'),
    ('Participantes', 'Cantidad de participantes de la actividad.', 'Personas', 'Conteo de participantes.'),
    ('Actividades realizadas', 'Cantidad de actividades ejecutadas.', 'Actividades', 'Conteo de actividades realizadas.'),
    ('Organizaciones acompanadas', 'Cantidad de organizaciones acompanadas.', 'Organizaciones', 'Conteo de organizaciones acompanadas.'),
    ('Raciones entregadas', 'Cantidad de raciones o apoyos alimentarios entregados.', 'Raciones', 'Conteo de raciones entregadas.'),
    ('Acciones ejecutadas', 'Cantidad de acciones completadas.', 'Acciones', 'Conteo de acciones en estado cumplida.')
), actualizados AS (
  UPDATE public.indicadores i
  SET descripcion = c.descripcion,
      unidad_medida = c.unidad_medida,
      criterio_medicion = c.criterio_medicion,
      archived_at = NULL
  FROM catalogo c
  WHERE i.id_accion IS NULL
    AND i.nombre = c.nombre
  RETURNING i.nombre
)
INSERT INTO public.indicadores (nombre, descripcion, unidad_medida, criterio_medicion)
SELECT c.nombre, c.descripcion, c.unidad_medida, c.criterio_medicion
FROM catalogo c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.indicadores i
  WHERE i.id_accion IS NULL
    AND i.nombre = c.nombre
);

NOTIFY pgrst, 'reload schema';
COMMIT;
