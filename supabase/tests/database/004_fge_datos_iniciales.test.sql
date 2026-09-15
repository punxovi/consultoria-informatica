-- Verifica los datos iniciales definidos por KAN-158.
-- Ejecutar solamente en Supabase LOCAL de pruebas.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT ok(
  EXISTS(SELECT 1 FROM public.paises WHERE nombre = 'Chile' AND codigo_iso = 'CL'),
  'Chile está registrado'
);
SELECT ok(
  EXISTS(SELECT 1 FROM public.paises WHERE nombre = 'Argentina' AND codigo_iso = 'AR'),
  'Argentina está registrado'
);
SELECT ok(
  EXISTS(SELECT 1 FROM public.paises WHERE nombre = 'Uruguay' AND codigo_iso = 'UY'),
  'Uruguay está registrado'
);

SELECT ok(
  EXISTS(
    SELECT 1
    FROM public.organizaciones
    WHERE id_organizacion = '15800000-0000-4000-8000-000000000000'
      AND nombre LIKE '%(FICTICIA)%'
      AND correo LIKE '%@example.invalid'
  ),
  'La organización temporal está identificada como ficticia y no contiene un correo real'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.programas
    WHERE id_organizacion = '15800000-0000-4000-8000-000000000000'
  ),
  6::bigint,
  'La organización temporal contiene los seis Programas Institucionales'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.programas
    WHERE id_organizacion = '15800000-0000-4000-8000-000000000000'
      AND nombre IN (
        'Programa de Formalización',
        'Espacios con Valor',
        'Referentes al Frente',
        'Una vuelta +',
        'Voluntariado Corporativo — Una hora para salvar al mundo',
        'Donación de Recursos a Organizaciones Comunitarias'
      )
  ),
  6::bigint,
  'Están disponibles los seis nombres oficiales definidos por FGE'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.programas
    WHERE id_organizacion = '15800000-0000-4000-8000-000000000000'
      AND NULLIF(btrim(descripcion), '') IS NOT NULL
      AND NULLIF(btrim(objetivo_general), '') IS NOT NULL
      AND NULLIF(btrim(objetivos_especificos), '') IS NOT NULL
      AND NULLIF(btrim(componentes_linea_accion), '') IS NOT NULL
      AND NULLIF(btrim(resultados_esperados), '') IS NOT NULL
  ),
  6::bigint,
  'Todos los programas tienen completos los campos obligatorios del modelo'
);

SELECT * FROM finish();
ROLLBACK;
