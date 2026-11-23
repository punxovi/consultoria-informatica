BEGIN;
CREATE TEMP TABLE scrum130_prueba (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO scrum130_prueba VALUES (gen_random_uuid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizaciones o JOIN public.paises p USING (id_pais)
    WHERE o.archived_at IS NULL AND p.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La prueba necesita una Organización y su país activos.';
  END IF;
END;
$$;

INSERT INTO public.donaciones (
  id_donacion, id_organizacion, id_pais, fecha, tipo_movimiento,
  contraparte_nombre, descripcion, tipo_aporte, categoria,
  tipo_donante, origen, estado, cantidad, unidad,
  valor_estimado, moneda_valorizacion, metodo_valorizacion
)
SELECT t.id, o.id_organizacion, o.id_pais, CURRENT_DATE, 'recibida',
  'Donante ficticio SCRUM-130', 'Prueba temporal de estructura',
  'recurso', 'Servicio', 'empresa', 'Prueba SQL', 'Comprometida',
  2, 'horas', 100, 'CLP', 'Valor declarado de prueba'
FROM scrum130_prueba t
CROSS JOIN public.organizaciones o
JOIN public.paises p ON p.id_pais = o.id_pais
WHERE o.archived_at IS NULL AND p.archived_at IS NULL
ORDER BY o.id_organizacion
LIMIT 1;

SELECT d.id_donacion, d.id_organizacion, d.id_pais, d.categoria,
  d.tipo_donante, d.estado, d.cantidad, d.unidad,
  d.valor_estimado, d.moneda_valorizacion, d.metodo_valorizacion
FROM public.donaciones d JOIN scrum130_prueba t ON t.id = d.id_donacion;

ROLLBACK;
