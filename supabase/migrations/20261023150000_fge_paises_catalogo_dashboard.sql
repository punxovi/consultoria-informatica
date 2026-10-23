BEGIN;

-- El Dashboard usa el catálogo de países para construir su filtro territorial.
-- Es un catálogo de referencia no sensible; las métricas y registros siguen
-- protegidos por sus propias políticas RLS territoriales.
GRANT SELECT ON TABLE public.paises TO authenticated;

DROP POLICY IF EXISTS paises_lectura_catalogo_autenticado ON public.paises;
CREATE POLICY paises_lectura_catalogo_autenticado
  ON public.paises
  FOR SELECT
  TO authenticated
  USING (archived_at IS NULL);

NOTIFY pgrst, 'reload schema';

COMMIT;
