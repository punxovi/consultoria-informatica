BEGIN;

DROP POLICY IF EXISTS "Acceso por organización para diagnósticos" ON public.diagnosticos;
DROP POLICY IF EXISTS diagnosticos_lectura ON public.diagnosticos;
DROP POLICY IF EXISTS diagnosticos_insert ON public.diagnosticos;
DROP POLICY IF EXISTS diagnosticos_update ON public.diagnosticos;

CREATE POLICY diagnosticos_lectura ON public.diagnosticos FOR SELECT TO authenticated
USING (archived_at IS NULL AND fge_private.usuario_puede_consultar_organizacion(id_organizacion));
CREATE POLICY diagnosticos_insert ON public.diagnosticos FOR INSERT TO authenticated
WITH CHECK (archived_at IS NULL AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion));
CREATE POLICY diagnosticos_update ON public.diagnosticos FOR UPDATE TO authenticated
USING (archived_at IS NULL AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion))
WITH CHECK (archived_at IS NULL AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion));

ALTER TABLE public.diagnosticos
  ALTER COLUMN fecha_diagnostico SET DEFAULT CURRENT_DATE,
  ADD CONSTRAINT diagnosticos_raciones_no_negativas CHECK (raciones IS NULL OR raciones >= 0);

REVOKE ALL ON TABLE public.diagnosticos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.diagnosticos TO authenticated;
GRANT INSERT (
  id_organizacion, mision, vision, tiene_espacio_fisico,
  caracteristicas_infraestructura, espacios_disponibles, recursos_existentes,
  danos_detectados, necesidades_prioritarias, observaciones, raciones, periodo_raciones
) ON public.diagnosticos TO authenticated;
GRANT UPDATE (
  mision, vision, tiene_espacio_fisico, caracteristicas_infraestructura,
  espacios_disponibles, recursos_existentes, danos_detectados,
  necesidades_prioritarias, observaciones, raciones, periodo_raciones
) ON public.diagnosticos TO authenticated;


NOTIFY pgrst, 'reload schema';
COMMIT;
