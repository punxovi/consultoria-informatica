INSERT INTO public.roles (codigo, nombre) VALUES
('ADMIN', 'Administrador'),
('COORD', 'Coordinador'),
('INVIT', 'Invitado')
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre;

WITH catalogo(nombre, descripcion, unidad_medida, criterio_medicion) AS (VALUES
  ('Personas beneficiadas', 'Cantidad de personas beneficiadas por la accion.', 'Personas', 'Conteo de personas beneficiadas.'),
  ('Participantes', 'Cantidad de participantes de la actividad.', 'Personas', 'Conteo de participantes.'),
  ('Actividades realizadas', 'Cantidad de actividades ejecutadas.', 'Actividades', 'Conteo de actividades realizadas.'),
  ('Organizaciones acompañadas', 'Cantidad de organizaciones acompañadas.', 'Organizaciones', 'Conteo de organizaciones acompañadas.'),
  ('Raciones entregadas', 'Cantidad de raciones o apoyos alimentarios entregados.', 'Raciones', 'Conteo de raciones entregadas.'),
  ('Acciones ejecutadas', 'Cantidad de acciones completadas.', 'Acciones', 'Conteo de acciones en estado cumplida.')
), actualizados AS (
  UPDATE public.indicadores i SET descripcion = c.descripcion,
    unidad_medida = c.unidad_medida, criterio_medicion = c.criterio_medicion, archived_at = NULL
  FROM catalogo c WHERE i.id_accion IS NULL AND i.nombre = c.nombre
  RETURNING i.id_indicador
)
INSERT INTO public.indicadores (nombre, descripcion, unidad_medida, criterio_medicion)
SELECT c.nombre, c.descripcion, c.unidad_medida, c.criterio_medicion
FROM catalogo c WHERE NOT EXISTS (
  SELECT 1 FROM public.indicadores i WHERE i.id_accion IS NULL AND i.nombre = c.nombre
);

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '14600000-0000-4000-8000-000000000002',
  'coordinador@prueba.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  now(), '{}'::jsonb, '{"full_name":"Coordinador de Prueba"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data;

INSERT INTO public.perfiles (id_usuario, nombre)
VALUES ('14600000-0000-4000-8000-000000000002', 'Coordinador de Prueba')
ON CONFLICT (id_usuario) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true, archived_at = NULL;

INSERT INTO public.asignaciones_roles (id_usuario, id_rol, alcance, id_pais, otorgado_por)
SELECT '14600000-0000-4000-8000-000000000002', r.id_rol, 'pais', p.id_pais,
       '14600000-0000-4000-8000-000000000002'
FROM public.roles r CROSS JOIN public.paises p
WHERE r.codigo = 'COORD' AND p.codigo_iso = 'CL'
  AND NOT EXISTS (
    SELECT 1 FROM public.asignaciones_roles a
    WHERE a.id_usuario = '14600000-0000-4000-8000-000000000002'
      AND a.id_rol = r.id_rol AND a.revocado_at IS NULL
  );

INSERT INTO fge_private.cuentas_coordinadores (id_usuario, id_pais, id_pais_aplicado, solicitado_por)
SELECT '14600000-0000-4000-8000-000000000002', p.id_pais, p.id_pais,
       '14600000-0000-4000-8000-000000000002'
FROM public.paises p
WHERE p.codigo_iso = 'CL'
ON CONFLICT (id_usuario) DO UPDATE SET
  id_pais = EXCLUDED.id_pais, id_pais_aplicado = EXCLUDED.id_pais_aplicado;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '14600000-0000-4000-8000-000000000003', 'admin@prueba.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  now(), '{}'::jsonb, '{"full_name":"Administrador de Prueba"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
  email_confirmed_at = EXCLUDED.email_confirmed_at, raw_user_meta_data = EXCLUDED.raw_user_meta_data;

INSERT INTO public.perfiles (id_usuario, nombre)
VALUES ('14600000-0000-4000-8000-000000000003', 'Administrador de Prueba')
ON CONFLICT (id_usuario) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true, archived_at = NULL;

INSERT INTO public.asignaciones_roles (id_usuario, id_rol, alcance, id_pais, otorgado_por)
SELECT '14600000-0000-4000-8000-000000000003', r.id_rol, 'global', NULL,
       '14600000-0000-4000-8000-000000000003'
FROM public.roles r WHERE r.codigo = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM public.asignaciones_roles a
    WHERE a.id_usuario = '14600000-0000-4000-8000-000000000003'
      AND a.id_rol = r.id_rol AND a.revocado_at IS NULL
  );

INSERT INTO public.organizaciones (
  id_organizacion, id_pais, nombre, nombre_representante, telefono, correo,
  region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo,
  descripcion_breve, tipo_organizacion, numero_beneficiarios, created_by, updated_by
)
SELECT '14600000-0000-4000-8000-000000000004', p.id_pais,
  'Organización de demostración', 'Representante de prueba', '+56 9 0000 0000',
  'demo@example.com', 'Región Metropolitana', 'Santiago', 'Dirección de demostración',
  'Comunidad local', 'Organización local de prueba para el catálogo de cotizaciones.',
  'emprendimiento_uv', 10, '14600000-0000-4000-8000-000000000003',
  '14600000-0000-4000-8000-000000000003'
FROM public.paises p WHERE p.codigo_iso = 'CL'
ON CONFLICT (id_organizacion) DO UPDATE SET
  nombre = EXCLUDED.nombre, archived_at = NULL;

INSERT INTO public.programas (
  id_programa,
  nombre,
  descripcion,
  objetivo_general,
  objetivos_especificos,
  componentes_linea_accion,
  resultados_esperados
) VALUES
(
  '15800000-0000-4000-8000-000000000001',
  'Programa de Formalización',
  'Acompaña a las organizaciones comunitarias en su proceso de formalización, salud, alimentación y fortalecimiento institucional.',
  'Promover la autonomía de las organizaciones para que puedan articularse con organismos públicos y privados, recibir donaciones y ampliar su alcance.',
  'Definir valores institucionales; conformar equipos directivos; capacitar para la mejora continua; facilitar la obtención de personalidad jurídica; mejorar o activar la comunicación mediante redes sociales.',
  'Definición de valores institucionales; conformación de equipos directivos; capacitación; gestión de trámites administrativos; fortalecimiento de la comunicación y redes sociales.',
  'Organizaciones formalizadas, autónomas, con estructuras de liderazgo y mejores capacidades para articularse, recibir apoyo y ampliar su trabajo.'
),
(
  '15800000-0000-4000-8000-000000000002',
  'Espacios con Valor',
  'Programa de mejoramiento de infraestructura que colabora con las organizaciones de la red para gestionar recursos destinados a sus espacios comunitarios.',
  'Fortalecer la infraestructura de las organizaciones para que desarrollen sus actividades en condiciones adecuadas y sostenibles.',
  'Mejorar los espacios donde se desarrollan las actividades y asegurar condiciones dignas para las familias atendidas.',
  'Gestión de recursos; mejora de infraestructura; articulación de alianzas; adecuación de espacios comunitarios.',
  'Espacios comunitarios fortalecidos, sostenibles y aptos para ofrecer servicios de calidad a las familias.'
),
(
  '15800000-0000-4000-8000-000000000003',
  'Referentes al Frente',
  'Programa de fortalecimiento de líderes comunitarios orientado a promover la gestión y el liderazgo de dirigentes sociales.',
  'Impulsar el desarrollo, la autonomía y la transformación social de las comunidades mediante el fortalecimiento de sus referentes.',
  'Fomentar el aprendizaje colectivo y la socialización de experiencias; brindar acompañamiento individual en salud emocional y psicológica.',
  'Talleres; espacios de aprendizaje colectivo; intercambio de buenas prácticas; acompañamiento individual en salud.',
  'Liderazgos comunitarios fortalecidos, con mejores capacidades de gestión y redes de apoyo.'
),
(
  '15800000-0000-4000-8000-000000000004',
  'Una vuelta +',
  'Programa que promueve la economía circular y permite transformar materiales corporativos en desuso en productos con impacto ambiental y social medible.',
  'Generar impacto social, ambiental y económico mediante proyectos productivos sustentables y la valorización de materiales en desuso.',
  'Fortalecer organizaciones comunitarias; ampliar la producción y los ingresos; reducir el impacto ambiental; contribuir a objetivos ODS y estrategias ESG; diferenciar a las empresas participantes.',
  'Economía circular; proyectos productivos; reutilización de materiales; compras sostenibles; alianzas empresariales; medición de impacto.',
  'Materiales recuperados y transformados, productos elaborados, organizaciones fortalecidas, personas impactadas e ingresos genuinos.'
),
(
  '15800000-0000-4000-8000-000000000005',
  'Voluntariado Corporativo — Una hora para salvar al mundo',
  'Programa que articula acciones de voluntariado con el ámbito corporativo y sus colaboradores.',
  'Generar involucramiento, comunidad y solidaridad mediante actividades conjuntas con organizaciones comunitarias.',
  'Involucrar a colaboradores de empresas; promover la inclusión social; fortalecer la cohesión y el trabajo conjunto.',
  'Acciones de voluntariado corporativo; articulación con empresas; actividades comunitarias; promoción de la solidaridad.',
  'Colaboradores involucrados y organizaciones comunitarias fortalecidas mediante acciones inclusivas y solidarias.'
),
(
  '15800000-0000-4000-8000-000000000006',
  'Donación de Recursos a Organizaciones Comunitarias',
  'Programa destinado a proveer apoyo y recursos a organizaciones comunitarias.',
  'Responder a las necesidades de las organizaciones mediante campañas y asistencia permanente.',
  'Organizar donaciones en fechas especiales y proveer alimentos u otros recursos necesarios.',
  'Campañas recurrentes; regreso a clases; festividades; asistencia alimentaria; entrega permanente de recursos.',
  'Organizaciones apoyadas de forma oportuna y con recursos suficientes para atender las necesidades de sus comunidades.'
)
ON CONFLICT (id_programa) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  objetivo_general = EXCLUDED.objetivo_general,
  objetivos_especificos = EXCLUDED.objetivos_especificos,
  componentes_linea_accion = EXCLUDED.componentes_linea_accion,
  resultados_esperados = EXCLUDED.resultados_esperados;
