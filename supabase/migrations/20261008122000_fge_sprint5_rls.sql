BEGIN;

CREATE POLICY diagnosticos_lectura
ON public.diagnosticos FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion)
);

CREATE POLICY diagnosticos_insert
ON public.diagnosticos FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

CREATE POLICY diagnosticos_update
ON public.diagnosticos FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
)
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

CREATE POLICY actas_lectura
ON public.actas FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion)
);

CREATE POLICY actas_insert
ON public.actas FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

CREATE POLICY actas_update
ON public.actas FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
)
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

CREATE POLICY compromisos_lectura
ON public.compromisos FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.actas AS a
    WHERE a.id_acta = compromisos.id_acta
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_consultar_organizacion(a.id_organizacion)
  )
);

CREATE POLICY compromisos_insert
ON public.compromisos FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.actas AS a
    WHERE a.id_acta = compromisos.id_acta
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)
  )
);

CREATE POLICY compromisos_update
ON public.compromisos FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.actas AS a
    WHERE a.id_acta = compromisos.id_acta
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)
  )
)
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.actas AS a
    WHERE a.id_acta = compromisos.id_acta
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)
  )
);

NOTIFY pgrst, 'reload schema';
COMMIT;
