-- FGE/TDT. Instalación inicial; no transforma un esquema previo.
-- Todos los accesos de aplicación permanecen cerrados hasta definir roles.
BEGIN;
CREATE SCHEMA fge_private;
REVOKE ALL ON SCHEMA fge_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.perfiles (
  id_usuario uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  activo boolean NOT NULL DEFAULT true,
  zona_horaria text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.perfiles FROM PUBLIC, anon, authenticated;

CREATE TABLE public.paises (
  id_pais uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  codigo_iso text NOT NULL UNIQUE CHECK (codigo_iso ~ '^[A-Z]{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.paises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paises FROM PUBLIC, anon, authenticated;

CREATE TABLE public.roles (
  id_rol uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE CHECK (btrim(codigo) <> ''),
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.roles FROM PUBLIC, anon, authenticated;

CREATE TABLE public.permisos (
  id_permiso uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE CHECK (btrim(codigo) <> ''),
  descripcion text NOT NULL CHECK (btrim(descripcion) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permisos FROM PUBLIC, anon, authenticated;

CREATE TABLE public.roles_permisos (
  id_rol uuid NOT NULL REFERENCES public.roles(id_rol) ON DELETE RESTRICT,
  id_permiso uuid NOT NULL REFERENCES public.permisos(id_permiso) ON DELETE RESTRICT,
  PRIMARY KEY (id_rol, id_permiso),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.roles_permisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.roles_permisos FROM PUBLIC, anon, authenticated;

CREATE TABLE public.asignaciones_roles (
  id_asignacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario uuid NOT NULL REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  id_rol uuid NOT NULL REFERENCES public.roles(id_rol) ON DELETE RESTRICT,
  alcance text NOT NULL CHECK (alcance IN ('global','pais')),
  id_pais uuid REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  otorgado_por uuid NOT NULL REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  revocado_at timestamptz,
  revocado_por uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  CHECK ((alcance = 'global' AND id_pais IS NULL) OR (alcance = 'pais' AND id_pais IS NOT NULL)),
  CHECK ((revocado_at IS NULL) = (revocado_por IS NULL)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.asignaciones_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.asignaciones_roles FROM PUBLIC, anon, authenticated;

CREATE TABLE public.permisos_temporales (
  id_permiso_temporal uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario_beneficiario uuid NOT NULL REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  id_usuario_otorga uuid NOT NULL REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  id_pais uuid NOT NULL REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  inicio_at timestamptz NOT NULL,
  fin_at timestamptz NOT NULL,
  motivo text NOT NULL CHECK (btrim(motivo) <> ''),
  revocado_at timestamptz,
  revocado_por uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  motivo_revocacion text,
  CHECK (fin_at > inicio_at),
  CHECK (isfinite(inicio_at) AND isfinite(fin_at)),
  CHECK ((revocado_at IS NULL AND revocado_por IS NULL AND motivo_revocacion IS NULL) OR (revocado_at IS NOT NULL AND revocado_por IS NOT NULL AND NULLIF(btrim(motivo_revocacion),'') IS NOT NULL)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.permisos_temporales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permisos_temporales FROM PUBLIC, anon, authenticated;

CREATE TABLE public.permiso_temporal_detalles (
  id_permiso_temporal uuid NOT NULL REFERENCES public.permisos_temporales(id_permiso_temporal) ON DELETE RESTRICT,
  id_permiso uuid NOT NULL REFERENCES public.permisos(id_permiso) ON DELETE RESTRICT,
  PRIMARY KEY (id_permiso_temporal, id_permiso),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.permiso_temporal_detalles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permiso_temporal_detalles FROM PUBLIC, anon, authenticated;

CREATE TABLE public.organizaciones (
  id_organizacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pais uuid NOT NULL REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  nombre_representante text NOT NULL CHECK (btrim(nombre_representante) <> ''),
  telefono text NOT NULL CHECK (btrim(telefono) <> ''),
  correo text NOT NULL CHECK (btrim(correo) <> ''),
  region_departamento text NOT NULL CHECK (btrim(region_departamento) <> ''),
  comuna_municipio_ciudad text NOT NULL CHECK (btrim(comuna_municipio_ciudad) <> ''),
  direccion text NOT NULL CHECK (btrim(direccion) <> ''),
  publico_objetivo text NOT NULL CHECK (btrim(publico_objetivo) <> ''),
  descripcion_breve text NOT NULL CHECK (btrim(descripcion_breve) <> ''),
  tipo_organizacion text NOT NULL CHECK (tipo_organizacion IN ('comedor_merendero','centro_comunitario','emprendimiento_uv','otra')),
  tipo_organizacion_otro text,
  numero_beneficiarios integer NOT NULL CHECK (numero_beneficiarios >= 0),
  CHECK (tipo_organizacion <> 'otra' OR NULLIF(btrim(tipo_organizacion_otro),'') IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organizaciones FROM PUBLIC, anon, authenticated;

CREATE TABLE public.organizacion_redes (
  id_red uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_organizacion uuid NOT NULL REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (btrim(tipo) <> ''),
  url text NOT NULL CHECK (btrim(url) <> ''),
  UNIQUE (id_organizacion, url),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.organizacion_redes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organizacion_redes FROM PUBLIC, anon, authenticated;

CREATE TABLE public.contactos (
  id_contacto uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pais uuid NOT NULL REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  empresa_organizacion text,
  telefono text,
  correo text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contactos FROM PUBLIC, anon, authenticated;

CREATE TABLE public.informacion_legal (
  id_informacion_legal uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_organizacion uuid NOT NULL REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  UNIQUE (id_organizacion),
  estado_personalidad_juridica text NOT NULL CHECK (estado_personalidad_juridica IN ('si','no','en_proceso')),
  tipo_personalidad_juridica text,
  numero_registro text,
  fecha_constitucion date,
  vigencia_directiva text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.informacion_legal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.informacion_legal FROM PUBLIC, anon, authenticated;

CREATE TABLE public.diagnosticos (
  id_diagnostico uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_organizacion uuid NOT NULL REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  fecha_diagnostico date NOT NULL,
  mision text,
  vision text,
  necesidad text,
  estado_infraestructura text,
  tiene_espacio_fisico boolean,
  espacios_disponibles text,
  recursos_existentes text,
  danos_detectados text,
  observaciones text,
  raciones integer CHECK (raciones >= 0),
  periodo_raciones text,
  personas_atendidas integer CHECK (personas_atendidas >= 0),
  CHECK (raciones IS NULL OR NULLIF(btrim(periodo_raciones),'') IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.diagnosticos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.diagnosticos FROM PUBLIC, anon, authenticated;

CREATE TABLE public.programas (
  id_programa uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_organizacion uuid NOT NULL REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion text NOT NULL CHECK (btrim(descripcion) <> ''),
  objetivo_general text NOT NULL CHECK (btrim(objetivo_general) <> ''),
  objetivos_especificos text NOT NULL CHECK (btrim(objetivos_especificos) <> ''),
  componentes_linea_accion text NOT NULL CHECK (btrim(componentes_linea_accion) <> ''),
  resultados_esperados text NOT NULL CHECK (btrim(resultados_esperados) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.programas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.programas FROM PUBLIC, anon, authenticated;

CREATE TABLE public.planes (
  id_plan uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_programa uuid NOT NULL REFERENCES public.programas(id_programa) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  situacion_necesidad text NOT NULL CHECK (btrim(situacion_necesidad) <> ''),
  objetivo_general text NOT NULL CHECK (btrim(objetivo_general) <> ''),
  objetivos_especificos text NOT NULL CHECK (btrim(objetivos_especificos) <> ''),
  resultado_esperado text NOT NULL CHECK (btrim(resultado_esperado) <> ''),
  responsable_nombre text NOT NULL CHECK (btrim(responsable_nombre) <> ''),
  fecha_inicio date NOT NULL,
  fecha_termino date NOT NULL,
  CHECK (fecha_termino >= fecha_inicio),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planes FROM PUBLIC, anon, authenticated;

CREATE TABLE public.acciones (
  id_accion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_plan uuid NOT NULL REFERENCES public.planes(id_plan) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  responsable_nombre text NOT NULL CHECK (btrim(responsable_nombre) <> ''),
  fecha_inicio date NOT NULL,
  fecha_termino date NOT NULL,
  estado text NOT NULL DEFAULT 'no_iniciada' CHECK (estado IN ('no_iniciada','en_desarrollo','atrasada','cancelada','cumplida')),
  observacion_motivo text,
  resultado_esperado text,
  CHECK (fecha_termino >= fecha_inicio),
  -- Regla provisional: el documento oficial sitúa el motivo junto a cancelada.
  CHECK (estado <> 'cancelada' OR NULLIF(btrim(observacion_motivo),'') IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.acciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.acciones FROM PUBLIC, anon, authenticated;

CREATE TABLE public.actas (
  id_acta uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_accion uuid NOT NULL REFERENCES public.acciones(id_accion) ON DELETE RESTRICT,
  objetivo text NOT NULL CHECK (btrim(objetivo) <> ''),
  fecha timestamptz NOT NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.actas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.actas FROM PUBLIC, anon, authenticated;

CREATE TABLE public.acta_participantes (
  id_participante uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_acta uuid NOT NULL REFERENCES public.actas(id_acta) ON DELETE RESTRICT,
  id_contacto uuid REFERENCES public.contactos(id_contacto) ON DELETE RESTRICT,
  nombre_registrado text NOT NULL CHECK (btrim(nombre_registrado) <> ''),
  representacion text,
  UNIQUE (id_acta, id_contacto),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.acta_participantes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.acta_participantes FROM PUBLIC, anon, authenticated;

CREATE TABLE public.compromisos (
  id_compromiso uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_acta uuid NOT NULL REFERENCES public.actas(id_acta) ON DELETE RESTRICT,
  descripcion text NOT NULL CHECK (btrim(descripcion) <> ''),
  responsable_nombre text NOT NULL CHECK (btrim(responsable_nombre) <> ''),
  id_contacto_responsable uuid REFERENCES public.contactos(id_contacto) ON DELETE RESTRICT,
  fecha_limite date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cumplido')),
  cumplido_at timestamptz,
  observaciones text,
  CHECK ((estado = 'cumplido') = (cumplido_at IS NOT NULL)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.compromisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.compromisos FROM PUBLIC, anon, authenticated;

CREATE TABLE public.indicadores (
  id_indicador uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_accion uuid NOT NULL REFERENCES public.acciones(id_accion) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion text,
  unidad_medida text NOT NULL CHECK (btrim(unidad_medida) <> ''),
  meta numeric,
  -- No se calcula avance hasta acordar unidades, periodos y agregación.
  criterio_medicion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.indicadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.indicadores FROM PUBLIC, anon, authenticated;

CREATE TABLE public.resultados (
  id_resultado uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_indicador uuid NOT NULL REFERENCES public.indicadores(id_indicador) ON DELETE RESTRICT,
  valor_medido numeric NOT NULL,
  fecha_medicion date NOT NULL,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.resultados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resultados FROM PUBLIC, anon, authenticated;

CREATE TABLE public.donaciones (
  id_donacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_organizacion uuid NOT NULL REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  fecha date NOT NULL,
  -- Perspectiva de la organización de esta fila, no de FGE.
  tipo_movimiento text NOT NULL CHECK (tipo_movimiento IN ('recibida','entregada')),
  contraparte_nombre text NOT NULL CHECK (btrim(contraparte_nombre) <> ''),
  descripcion text NOT NULL CHECK (btrim(descripcion) <> ''),
  tipo_aporte text NOT NULL CHECK (tipo_aporte IN ('dinero','recurso')),
  cantidad numeric,
  unidad text,
  monto numeric,
  moneda text CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT donacion_valores_validos CHECK (
   (tipo_aporte = 'dinero' AND monto IS NOT NULL AND monto > 0 AND monto <> 'NaN'::numeric AND monto <> 'Infinity'::numeric AND moneda IS NOT NULL AND cantidad IS NULL AND unidad IS NULL)
   OR
   (tipo_aporte = 'recurso' AND cantidad IS NOT NULL AND cantidad > 0 AND cantidad <> 'NaN'::numeric AND cantidad <> 'Infinity'::numeric AND NULLIF(btrim(unidad),'') IS NOT NULL AND monto IS NULL AND moneda IS NULL)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.donaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.donaciones FROM PUBLIC, anon, authenticated;

CREATE TABLE public.archivos (
  id_archivo uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_organizacion uuid REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  id_informacion_legal uuid REFERENCES public.informacion_legal(id_informacion_legal) ON DELETE RESTRICT,
  id_programa uuid REFERENCES public.programas(id_programa) ON DELETE RESTRICT,
  id_accion uuid REFERENCES public.acciones(id_accion) ON DELETE RESTRICT,
  id_donacion uuid REFERENCES public.donaciones(id_donacion) ON DELETE RESTRICT,
  bucket_id text NOT NULL DEFAULT 'fge-archivos' CHECK (bucket_id = 'fge-archivos'),
  ruta_objeto text NOT NULL CHECK (btrim(ruta_objeto) <> ''),
  nombre_original text NOT NULL CHECK (btrim(nombre_original) <> ''),
  mime_type text NOT NULL CHECK (btrim(mime_type) <> ''),
  tamano_bytes bigint CHECK (tamano_bytes >= 0),
  categoria text NOT NULL,
  descripcion text,
  estado_carga text NOT NULL DEFAULT 'reservado' CHECK (estado_carga IN ('reservado','disponible','fallido')),
  UNIQUE (bucket_id, ruta_objeto),
  CONSTRAINT archivo_un_destino CHECK (num_nonnulls(id_organizacion,id_informacion_legal,id_programa,id_accion,id_donacion) = 1),
  CHECK (estado_carga <> 'disponible' OR tamano_bytes IS NOT NULL),
  CONSTRAINT archivo_categoria_destino CHECK (
   (id_organizacion IS NOT NULL AND categoria IN ('identidad_representante','imagen_organizacion','otro_organizacion')) OR
   (id_informacion_legal IS NOT NULL AND categoria IN ('identificacion_legal','estatutos','otro_legal')) OR
   (id_programa IS NOT NULL AND categoria = 'imagen_programa') OR
   (id_accion IS NOT NULL AND categoria IN ('acta_pdf','foto','audio','video','otro_evidencia')) OR
   (id_donacion IS NOT NULL AND categoria = 'respaldo_donacion')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
ALTER TABLE public.archivos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.archivos FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX asignacion_global_activa_uq ON public.asignaciones_roles(id_usuario,id_rol) WHERE alcance='global' AND revocado_at IS NULL;
CREATE UNIQUE INDEX asignacion_pais_activa_uq ON public.asignaciones_roles(id_usuario,id_rol,id_pais) WHERE alcance='pais' AND revocado_at IS NULL;
COMMIT;
