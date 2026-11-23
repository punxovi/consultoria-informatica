BEGIN;
ALTER TABLE public.paises
 ADD COLUMN IF NOT EXISTS codigo_area_telefonica text,
 ADD COLUMN IF NOT EXISTS zona_horaria text;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.paises GROUP BY lower(btrim(nombre)) HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Existen nombres de países duplicados. Resolver manualmente conservando referencias antes de migrar.';
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS paises_nombre_normalizado_uq ON public.paises(lower(btrim(nombre)));

CREATE FUNCTION fge_private.validar_configuracion_pais() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.nombre IS NULL OR length(btrim(NEW.nombre)) NOT BETWEEN 1 AND 120
 OR NEW.nombre ~ '[[:cntrl:]]'
 OR NEW.codigo_iso IS NULL OR NEW.codigo_iso !~ '^[A-Z]{2}$'
 OR NEW.codigo_area_telefonica IS NULL OR NEW.codigo_area_telefonica !~ '^\+[1-9][0-9]{0,2}$'
 OR NEW.zona_horaria IS NULL OR length(NEW.zona_horaria)>100 THEN
   RAISE EXCEPTION 'Nombre, ISO, prefijo y zona horaria válidos son obligatorios' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=NEW.zona_horaria
   AND (z.name='UTC' OR z.name ~ '^[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+$')) THEN
   RAISE EXCEPTION 'Zona IANA inválida' USING ERRCODE='P0151';
 END IF;
 NEW.nombre := btrim(NEW.nombre);
 IF TG_OP='UPDATE' AND NEW.id_pais<>OLD.id_pais THEN
   RAISE EXCEPTION 'El identificador territorial es inmutable' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validar_configuracion_pais BEFORE INSERT OR UPDATE ON public.paises
 FOR EACH ROW EXECUTE FUNCTION fge_private.validar_configuracion_pais();

CREATE FUNCTION fge_private.inicializar_paises_base() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE seed record; existing_id uuid; matches integer;
BEGIN
 FOR seed IN SELECT * FROM (VALUES
 ('Chile','CL','+56','America/Santiago'),
 ('Argentina','AR','+54','America/Argentina/Buenos_Aires'),
 ('Uruguay','UY','+598','America/Montevideo')
 ) AS t(nombre,iso,prefijo,zona) LOOP
   SELECT count(*),(array_agg(id_pais))[1] INTO matches,existing_id FROM public.paises
   WHERE codigo_iso=seed.iso OR lower(btrim(nombre))=lower(seed.nombre);
   IF matches>1 THEN RAISE EXCEPTION 'País base ambiguo: revisar nombre e ISO antes de migrar'; END IF;
   IF matches=0 THEN
     INSERT INTO public.paises(nombre,codigo_iso,codigo_area_telefonica,zona_horaria)
     VALUES(seed.nombre,seed.iso,seed.prefijo,seed.zona);
   ELSE
     UPDATE public.paises SET codigo_iso=seed.iso,
       codigo_area_telefonica=coalesce(nullif(btrim(codigo_area_telefonica),''),seed.prefijo),
       zona_horaria=coalesce(nullif(btrim(zona_horaria),''),seed.zona), archived_at=NULL
     WHERE id_pais=existing_id AND (codigo_iso<>seed.iso OR codigo_area_telefonica IS NULL
       OR btrim(codigo_area_telefonica)='' OR zona_horaria IS NULL OR btrim(zona_horaria)='' OR archived_at IS NOT NULL);
   END IF;
 END LOOP;
END;
$$;
SELECT fge_private.inicializar_paises_base();

ALTER TABLE public.paises ADD CONSTRAINT paises_configuracion_requerida CHECK (
 codigo_area_telefonica IS NOT NULL AND zona_horaria IS NOT NULL
) NOT VALID;

CREATE FUNCTION fge_private.pais_administracion_json(p public.paises) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id_pais',p.id_pais,'nombre',p.nombre,'codigo_iso',p.codigo_iso,
 'codigo_area_telefonica',p.codigo_area_telefonica,'zona_horaria',p.zona_horaria,
 'version',p.version,'created_at',p.created_at,'updated_at',p.updated_at,
 'configuracion_pendiente',p.codigo_area_telefonica IS NULL OR p.zona_horaria IS NULL);
$$;

CREATE FUNCTION public.administrar_paises(p_operacion text,p_datos jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); target uuid; current_country public.paises; saved public.paises;
 changes jsonb; expected bigint; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.perfiles p
   JOIN public.asignaciones_roles a ON a.id_usuario=p.id_usuario
   JOIN public.roles r ON r.id_rol=a.id_rol
   WHERE p.id_usuario=actor AND p.activo AND p.archived_at IS NULL
   AND a.revocado_at IS NULL AND a.archived_at IS NULL AND a.alcance='global'
   AND r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL) THEN
   RAISE EXCEPTION 'Administrador requerido' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Objeto requerido' USING ERRCODE='22023'; END IF;
 IF p_operacion='authorize' THEN RETURN jsonb_build_object('authorized',true); END IF;
 IF p_operacion='list' THEN
   SELECT coalesce(jsonb_agg(fge_private.pais_administracion_json(p) ORDER BY p.nombre,p.id_pais),'[]'::jsonb)
   INTO result FROM public.paises p WHERE p.archived_at IS NULL;
   RETURN result;
 END IF;
 IF p_operacion='create' THEN changes:=p_datos;
 ELSIF p_operacion IN ('get','update') THEN
   BEGIN target:=(p_datos->>'id_pais')::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UUID inválido' USING ERRCODE='22023'; END;
   SELECT * INTO current_country FROM public.paises WHERE id_pais=target AND archived_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'País inexistente' USING ERRCODE='P0149'; END IF;
   IF p_operacion='get' THEN
     IF (p_datos-ARRAY['id_pais'])<>'{}'::jsonb THEN RAISE EXCEPTION 'Campos inválidos' USING ERRCODE='22023'; END IF;
     RETURN fge_private.pais_administracion_json(current_country);
   END IF;
   IF (p_datos-ARRAY['id_pais','version_esperada','cambios'])<>'{}'::jsonb
   OR jsonb_typeof(p_datos->'version_esperada') IS DISTINCT FROM 'number'
   OR (p_datos->>'version_esperada') !~ '^[1-9][0-9]{0,15}$' THEN
     RAISE EXCEPTION 'Versión o campos inválidos' USING ERRCODE='22023';
   END IF;
   expected:=(p_datos->>'version_esperada')::bigint;
   IF current_country.version<>expected THEN RAISE EXCEPTION 'Versión obsoleta' USING ERRCODE='P0150'; END IF;
   changes:=p_datos->'cambios';
 ELSE RAISE EXCEPTION 'Operación inválida' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(changes) IS DISTINCT FROM 'object' OR changes='{}'::jsonb
   OR (changes-ARRAY['nombre','codigo_iso','codigo_area_telefonica','zona_horaria'])<>'{}'::jsonb THEN
   RAISE EXCEPTION 'Campos inválidos' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(changes) e WHERE jsonb_typeof(e.value)<>'string') THEN
   RAISE EXCEPTION 'Los campos deben ser texto' USING ERRCODE='22023';
 END IF;
 IF p_operacion='create' THEN
   INSERT INTO public.paises(nombre,codigo_iso,codigo_area_telefonica,zona_horaria)
   VALUES(btrim(changes->>'nombre'),upper(btrim(changes->>'codigo_iso')),
     btrim(changes->>'codigo_area_telefonica'),btrim(changes->>'zona_horaria')) RETURNING * INTO saved;
 ELSE
   UPDATE public.paises SET
     nombre=CASE WHEN changes ? 'nombre' THEN btrim(changes->>'nombre') ELSE nombre END,
     codigo_iso=CASE WHEN changes ? 'codigo_iso' THEN upper(btrim(changes->>'codigo_iso')) ELSE codigo_iso END,
     codigo_area_telefonica=CASE WHEN changes ? 'codigo_area_telefonica' THEN btrim(changes->>'codigo_area_telefonica') ELSE codigo_area_telefonica END,
     zona_horaria=CASE WHEN changes ? 'zona_horaria' THEN btrim(changes->>'zona_horaria') ELSE zona_horaria END
   WHERE id_pais=target RETURNING * INTO saved;
 END IF;
 RETURN fge_private.pais_administracion_json(saved);
END;
$$;

REVOKE SELECT ON public.paises FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.paises FROM anon,authenticated;
GRANT SELECT(id_pais,nombre,codigo_iso,archived_at) ON public.paises TO authenticated;
REVOKE ALL ON FUNCTION public.administrar_paises(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.administrar_paises(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION fge_private.validar_configuracion_pais(),fge_private.inicializar_paises_base(),
 fge_private.pais_administracion_json(public.paises) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
