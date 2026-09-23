-- KAN-173: cada línea institucional tiene su propio resultado esperado.
-- Los textos legados de programas se conservan: no indican qué resultado
-- corresponde a cada componente y no se pueden descomponer sin inventar datos.
BEGIN;

CREATE TABLE public.programa_lineas_accion (
  id_linea_accion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_programa uuid NOT NULL REFERENCES public.programas(id_programa) ON DELETE RESTRICT,
  linea_accion text NOT NULL CHECK (btrim(linea_accion) <> '' AND char_length(linea_accion) <= 500),
  resultado_esperado text NOT NULL CHECK (btrim(resultado_esperado) <> '' AND char_length(resultado_esperado) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);

ALTER TABLE public.programa_lineas_accion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.programa_lineas_accion FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.programa_lineas_accion TO authenticated;

CREATE INDEX programa_lineas_accion_id_programa_fk_idx
  ON public.programa_lineas_accion (id_programa);
CREATE INDEX programa_lineas_accion_created_by_fk_idx
  ON public.programa_lineas_accion (created_by);
CREATE INDEX programa_lineas_accion_updated_by_fk_idx
  ON public.programa_lineas_accion (updated_by);
CREATE UNIQUE INDEX programa_lineas_accion_unica_activa_idx
  ON public.programa_lineas_accion (id_programa, lower(btrim(linea_accion)))
  WHERE archived_at IS NULL;

CREATE POLICY programa_lineas_accion_lectura_roles
ON public.programa_lineas_accion FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.programas AS programa
    WHERE programa.id_programa = programa_lineas_accion.id_programa
      AND programa.archived_at IS NULL
  )
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN', 'COORD', 'INVIT'])
);

CREATE POLICY programa_lineas_accion_admin_insert
ON public.programa_lineas_accion FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
);

CREATE POLICY programa_lineas_accion_admin_update
ON public.programa_lineas_accion FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
)
WITH CHECK (
  fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
);

CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.programa_lineas_accion
  FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.programa_lineas_accion
  FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_linea_accion');

COMMIT;
