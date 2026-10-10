BEGIN;
CREATE INDEX IF NOT EXISTS compromisos_acta_activos_idx ON public.compromisos(id_acta,fecha_limite,id_compromiso) WHERE archived_at IS NULL;
ALTER TABLE public.compromisos ADD CONSTRAINT compromisos_campos_api CHECK (
  length(btrim(descripcion)) BETWEEN 1 AND 2000 AND length(btrim(responsable_nombre)) BETWEEN 1 AND 150
  AND (observaciones IS NULL OR length(observaciones)<=2000)
  AND estado IN ('pendiente','cumplido')
  AND ((estado='cumplido')=(cumplido_at IS NOT NULL))
);

CREATE FUNCTION fge_private.validar_compromiso_integrado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.id_acta IS DISTINCT FROM OLD.id_acta THEN
    RAISE EXCEPTION 'No se puede cambiar el acta de origen.' USING ERRCODE='42501';
  END IF;
  SELECT id_organizacion INTO org FROM public.actas WHERE id_acta=NEW.id_acta AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acta no disponible.' USING ERRCODE='23503'; END IF;
  IF NOT fge_private.usuario_puede_gestionar_organizacion(org) THEN
    RAISE EXCEPTION 'No tienes permiso para gestionar compromisos de esta organización.' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(NEW.responsable_contacto),'') IS NULL OR length(NEW.responsable_contacto)>300 THEN
    RAISE EXCEPTION 'El contacto del responsable es obligatorio (máximo 300 caracteres).' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.estado<>'pendiente' THEN RAISE EXCEPTION 'Los compromisos nuevos deben quedar pendientes.' USING ERRCODE='23514'; END IF;
    NEW.cumplido_at:=NULL;
  ELSIF NEW.estado='cumplido' THEN
    NEW.cumplido_at:=CASE WHEN OLD.estado='cumplido' THEN OLD.cumplido_at ELSE now() END;
  ELSE NEW.cumplido_at:=NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fge_private.validar_compromiso_integrado() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validar_compromiso_integrado BEFORE INSERT OR UPDATE ON public.compromisos
FOR EACH ROW EXECUTE FUNCTION fge_private.validar_compromiso_integrado();

ALTER TABLE public.compromisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso por país y organización para compromisos" ON public.compromisos;
DROP POLICY IF EXISTS compromisos_lectura ON public.compromisos;
DROP POLICY IF EXISTS compromisos_insert ON public.compromisos;
DROP POLICY IF EXISTS compromisos_update ON public.compromisos;
CREATE POLICY compromisos_lectura ON public.compromisos FOR SELECT TO authenticated
USING (archived_at IS NULL AND EXISTS(SELECT 1 FROM public.actas a WHERE a.id_acta=compromisos.id_acta AND a.archived_at IS NULL
  AND fge_private.usuario_puede_consultar_organizacion(a.id_organizacion)));
CREATE POLICY compromisos_insert ON public.compromisos FOR INSERT TO authenticated
WITH CHECK (archived_at IS NULL AND estado='pendiente' AND cumplido_at IS NULL AND EXISTS(SELECT 1 FROM public.actas a
  WHERE a.id_acta=compromisos.id_acta AND a.archived_at IS NULL AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)));
CREATE POLICY compromisos_update ON public.compromisos FOR UPDATE TO authenticated
USING (archived_at IS NULL AND EXISTS(SELECT 1 FROM public.actas a WHERE a.id_acta=compromisos.id_acta AND a.archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)))
WITH CHECK (archived_at IS NULL AND EXISTS(SELECT 1 FROM public.actas a WHERE a.id_acta=compromisos.id_acta AND a.archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)));
REVOKE ALL ON public.compromisos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.compromisos TO authenticated;
GRANT INSERT(id_acta,descripcion,responsable_nombre,responsable_contacto,fecha_limite,observaciones) ON public.compromisos TO authenticated;
GRANT UPDATE(descripcion,responsable_nombre,responsable_contacto,fecha_limite,estado,observaciones) ON public.compromisos TO authenticated;

CREATE FUNCTION public.catalogo_compromisos(p_id_organizacion uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NOT fge_private.usuario_puede_consultar_organizacion(p_id_organizacion) THEN
    RAISE EXCEPTION 'Organización no disponible.' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object('puede_gestionar',fge_private.usuario_puede_gestionar_organizacion(p_id_organizacion),
    'actas',coalesce((SELECT jsonb_agg(jsonb_build_object('id_acta',a.id_acta,'id_plan',a.id_plan,'id_accion',a.id_accion,
      'nombre','Acta del '||to_char(a.fecha_reunion,'YYYY-MM-DD')||': '||a.objetivo) ORDER BY a.fecha_reunion DESC,a.id_acta)
      FROM public.actas a WHERE a.id_organizacion=p_id_organizacion AND a.archived_at IS NULL),'[]'::jsonb));
END $$;

CREATE FUNCTION public.consultar_compromisos(p_id_organizacion uuid,p_id uuid DEFAULT NULL,p_id_acta uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NOT fge_private.usuario_puede_consultar_organizacion(p_id_organizacion) THEN
    RAISE EXCEPTION 'Organización no disponible.' USING ERRCODE='P0002';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('id_organizacion',a.id_organizacion) ORDER BY c.fecha_limite,c.id_compromiso)
    FROM public.compromisos c JOIN public.actas a USING(id_acta)
    WHERE a.id_organizacion=p_id_organizacion AND a.archived_at IS NULL AND c.archived_at IS NULL
    AND (p_id IS NULL OR c.id_compromiso=p_id) AND (p_id_acta IS NULL OR c.id_acta=p_id_acta)),'[]'::jsonb);
END $$;

CREATE FUNCTION public.guardar_compromiso(p_id_organizacion uuid,p_datos jsonb,p_id uuid DEFAULT NULL,p_version bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE anterior public.compromisos; guardado uuid; claves text[];
BEGIN
  IF NOT fge_private.usuario_puede_consultar_organizacion(p_id_organizacion) THEN
    RAISE EXCEPTION 'Organización no disponible.' USING ERRCODE='P0002';
  END IF;
  IF NOT fge_private.usuario_puede_gestionar_organizacion(p_id_organizacion) THEN
    RAISE EXCEPTION 'No tienes permiso para gestionar estos compromisos.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR p_datos='{}'::jsonb THEN
    RAISE EXCEPTION 'Datos inválidos.' USING ERRCODE='23514';
  END IF;
  claves:=ARRAY['descripcion','responsable_nombre','responsable_contacto','fecha_limite','observaciones','estado'];
  IF p_id IS NULL THEN claves:=claves||ARRAY['id_acta']; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE NOT k=ANY(claves))
     OR EXISTS(SELECT 1 FROM jsonb_each(p_datos) e WHERE jsonb_typeof(e.value)<>'string' AND NOT(e.key='observaciones' AND e.value='null'::jsonb)) THEN
    RAISE EXCEPTION 'Campos no permitidos o tipos inválidos.' USING ERRCODE='23514';
  END IF;
  IF p_id IS NULL THEN
    IF p_version IS NOT NULL OR coalesce(p_datos->>'estado','pendiente')<>'pendiente' THEN
      RAISE EXCEPTION 'Creación inválida.' USING ERRCODE='23514';
    END IF;
    PERFORM 1 FROM public.actas WHERE id_acta=(p_datos->>'id_acta')::uuid AND id_organizacion=p_id_organizacion AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El acta no pertenece a la organización.' USING ERRCODE='23503'; END IF;
    INSERT INTO public.compromisos(id_acta,descripcion,responsable_nombre,responsable_contacto,fecha_limite,observaciones)
      VALUES((p_datos->>'id_acta')::uuid,btrim(p_datos->>'descripcion'),btrim(p_datos->>'responsable_nombre'),btrim(p_datos->>'responsable_contacto'),
      (p_datos->>'fecha_limite')::date,nullif(btrim(p_datos->>'observaciones'),'')) RETURNING id_compromiso INTO guardado;
  ELSE
    IF p_version IS NULL OR p_version<1 THEN RAISE EXCEPTION 'La versión esperada es obligatoria.' USING ERRCODE='23514'; END IF;
    SELECT c.* INTO anterior FROM public.compromisos c JOIN public.actas a USING(id_acta)
      WHERE c.id_compromiso=p_id AND a.id_organizacion=p_id_organizacion AND a.archived_at IS NULL AND c.archived_at IS NULL FOR UPDATE OF c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Compromiso no disponible.' USING ERRCODE='P0002'; END IF;
    IF anterior.version<>p_version THEN RAISE EXCEPTION 'El compromiso fue modificado por otra sesión.' USING ERRCODE='40001'; END IF;
    UPDATE public.compromisos SET
      descripcion=CASE WHEN p_datos?'descripcion' THEN btrim(p_datos->>'descripcion') ELSE anterior.descripcion END,
      responsable_nombre=CASE WHEN p_datos?'responsable_nombre' THEN btrim(p_datos->>'responsable_nombre') ELSE anterior.responsable_nombre END,
      responsable_contacto=CASE WHEN p_datos?'responsable_contacto' THEN btrim(p_datos->>'responsable_contacto') ELSE anterior.responsable_contacto END,
      fecha_limite=CASE WHEN p_datos?'fecha_limite' THEN (p_datos->>'fecha_limite')::date ELSE anterior.fecha_limite END,
      estado=CASE WHEN p_datos?'estado' THEN p_datos->>'estado' ELSE anterior.estado END,
      observaciones=CASE WHEN p_datos?'observaciones' THEN nullif(btrim(p_datos->>'observaciones'),'') ELSE anterior.observaciones END
      WHERE id_compromiso=p_id AND version=p_version RETURNING id_compromiso INTO guardado;
    IF NOT FOUND THEN RAISE EXCEPTION 'El compromiso cambió durante el guardado.' USING ERRCODE='40001'; END IF;
  END IF;
  RETURN public.consultar_compromisos(p_id_organizacion,guardado)->0;
END $$;
REVOKE ALL ON FUNCTION public.catalogo_compromisos(uuid),public.consultar_compromisos(uuid,uuid,uuid),public.guardar_compromiso(uuid,jsonb,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.catalogo_compromisos(uuid),public.consultar_compromisos(uuid,uuid,uuid),public.guardar_compromiso(uuid,jsonb,uuid,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
