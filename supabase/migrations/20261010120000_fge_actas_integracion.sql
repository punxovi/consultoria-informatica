BEGIN;

ALTER TABLE public.planes ADD CONSTRAINT planes_id_organizacion_uq UNIQUE (id_plan, id_organizacion);
ALTER TABLE public.acciones ADD CONSTRAINT acciones_id_plan_uq UNIQUE (id_accion, id_plan);
ALTER TABLE public.actas
  ADD CONSTRAINT actas_plan_organizacion_fk FOREIGN KEY (id_plan, id_organizacion)
    REFERENCES public.planes(id_plan, id_organizacion) ON DELETE RESTRICT,
  ADD CONSTRAINT actas_accion_plan_fk FOREIGN KEY (id_accion, id_plan)
    REFERENCES public.acciones(id_accion, id_plan) ON DELETE RESTRICT;

CREATE FUNCTION fge_private.validar_acta_integrada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  
  IF NOT fge_private.usuario_puede_gestionar_organizacion(NEW.id_organizacion) THEN
    RAISE EXCEPTION 'No tienes permiso para gestionar actas de esta organización.' USING ERRCODE='42501';
  END IF;
  IF NEW.fecha_reunion::date > (now() AT TIME ZONE 'America/Santiago')::date
     OR nullif(btrim(NEW.objetivo), '') IS NULL
     OR cardinality(NEW.asistentes) NOT BETWEEN 1 AND 100
     OR NEW.asistentes IS NULL
     OR EXISTS (SELECT 1 FROM unnest(NEW.asistentes) n WHERE n IS NULL OR btrim(n) = '' OR length(n) > 150)
     OR (SELECT count(DISTINCT lower(btrim(n))) FROM unnest(NEW.asistentes) n) <> cardinality(NEW.asistentes)
     OR (length(btrim(NEW.asistentes_externos)) BETWEEN 1 AND 2) THEN
    RAISE EXCEPTION 'Revisa la fecha, el objetivo y los asistentes del acta.' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.organizaciones WHERE id_organizacion=NEW.id_organizacion AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organización no disponible.' USING ERRCODE='23503'; END IF;
  PERFORM 1 FROM public.planes WHERE id_plan=NEW.id_plan AND id_organizacion=NEW.id_organizacion AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El id_plan no pertenece a la organización o está archivado.' USING ERRCODE='23503'; END IF;
  IF NEW.id_accion IS NOT NULL THEN
    PERFORM 1 FROM public.acciones WHERE id_accion=NEW.id_accion AND id_plan=NEW.id_plan AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El id_accion no pertenece al plan o está archivado.' USING ERRCODE='23503'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.validar_acta_integrada() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar_acta_integrada BEFORE INSERT OR UPDATE ON public.actas
FOR EACH ROW EXECUTE FUNCTION fge_private.validar_acta_integrada();

ALTER TABLE public.actas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS actas_lectura ON public.actas;
DROP POLICY IF EXISTS actas_insert ON public.actas;
DROP POLICY IF EXISTS actas_update ON public.actas;
CREATE POLICY actas_lectura ON public.actas FOR SELECT TO authenticated
USING (archived_at IS NULL AND fge_private.usuario_puede_consultar_organizacion(id_organizacion));
CREATE POLICY actas_insert ON public.actas FOR INSERT TO authenticated
WITH CHECK (archived_at IS NULL AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion));
CREATE POLICY actas_update ON public.actas FOR UPDATE TO authenticated
USING (archived_at IS NULL AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion))
WITH CHECK (archived_at IS NULL AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion));
REVOKE ALL ON public.actas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.actas TO authenticated;
GRANT INSERT (id_organizacion,id_plan,id_accion,fecha_reunion,objetivo,asistentes,asistentes_externos,observaciones)
  ON public.actas TO authenticated;
GRANT UPDATE (id_plan,id_accion,fecha_reunion,objetivo,asistentes,asistentes_externos,observaciones)
  ON public.actas TO authenticated;

ALTER TABLE public.compromisos ADD COLUMN IF NOT EXISTS responsable_contacto text;
ALTER TABLE public.compromisos ADD CONSTRAINT compromiso_contacto_len
  CHECK (responsable_contacto IS NULL OR (btrim(responsable_contacto) <> '' AND length(responsable_contacto) <= 300));
ALTER TABLE public.compromisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso por país y organización para compromisos" ON public.compromisos;
DROP POLICY IF EXISTS compromisos_lectura ON public.compromisos;
DROP POLICY IF EXISTS compromisos_insert ON public.compromisos;
DROP POLICY IF EXISTS compromisos_update ON public.compromisos;
CREATE POLICY compromisos_lectura ON public.compromisos FOR SELECT TO authenticated
USING (archived_at IS NULL AND EXISTS (SELECT 1 FROM public.actas a
  WHERE a.id_acta=compromisos.id_acta AND a.archived_at IS NULL
  AND fge_private.usuario_puede_consultar_organizacion(a.id_organizacion)));
CREATE POLICY compromisos_insert ON public.compromisos FOR INSERT TO authenticated
WITH CHECK (archived_at IS NULL AND estado='pendiente' AND cumplido_at IS NULL AND EXISTS (SELECT 1 FROM public.actas a
  WHERE a.id_acta=compromisos.id_acta AND a.archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)));
-- Se preserva la política de edición por organización para la gestión de Compromisos.
CREATE POLICY compromisos_update ON public.compromisos FOR UPDATE TO authenticated
USING (archived_at IS NULL AND EXISTS (SELECT 1 FROM public.actas a WHERE a.id_acta=compromisos.id_acta
  AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)))
WITH CHECK (archived_at IS NULL AND EXISTS (SELECT 1 FROM public.actas a WHERE a.id_acta=compromisos.id_acta
  AND fge_private.usuario_puede_gestionar_organizacion(a.id_organizacion)));
GRANT SELECT ON public.compromisos TO authenticated;
GRANT INSERT (id_acta,descripcion,responsable_nombre,responsable_contacto,fecha_limite,observaciones)
  ON public.compromisos TO authenticated;

CREATE FUNCTION public.catalogo_actas(p_id_organizacion uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pais uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT fge_private.usuario_puede_consultar_organizacion(p_id_organizacion) THEN
    RAISE EXCEPTION 'Organización no disponible.' USING ERRCODE='P0002';
  END IF;
  SELECT id_pais INTO pais FROM public.organizaciones WHERE id_organizacion=p_id_organizacion AND archived_at IS NULL;
  RETURN jsonb_build_object(
    'puede_gestionar', fge_private.usuario_puede_gestionar_organizacion(p_id_organizacion),
    'planes', coalesce((SELECT jsonb_agg(jsonb_build_object('id_plan',p.id_plan,'nombre',p.nombre) ORDER BY p.nombre,p.id_plan)
      FROM public.planes p WHERE p.id_organizacion=p_id_organizacion AND p.archived_at IS NULL),'[]'::jsonb),
    'acciones', coalesce((SELECT jsonb_agg(jsonb_build_object('id_accion',a.id_accion,'id_plan',a.id_plan,'nombre',a.nombre) ORDER BY a.nombre,a.id_accion)
      FROM public.acciones a JOIN public.planes p USING(id_plan)
      WHERE p.id_organizacion=p_id_organizacion AND p.archived_at IS NULL AND a.archived_at IS NULL),'[]'::jsonb),
    'asistentes', coalesce((SELECT jsonb_agg(n.nombre ORDER BY n.nombre) FROM (
      SELECT DISTINCT btrim(p.nombre) AS nombre FROM public.perfiles p
      JOIN public.asignaciones_roles ar ON ar.id_usuario=p.id_usuario
      JOIN public.roles r ON r.id_rol=ar.id_rol
      WHERE p.activo AND p.archived_at IS NULL AND r.activo AND r.archived_at IS NULL
      AND ar.archived_at IS NULL AND ar.revocado_at IS NULL AND length(btrim(p.nombre)) BETWEEN 1 AND 150
      AND (ar.alcance='global' OR ar.id_pais=pais)
    ) n),'[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.catalogo_actas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_actas(uuid) TO authenticated;

CREATE FUNCTION public.crear_acta_completa(p_datos jsonb, p_compromisos jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE acta public.actas; c jsonb; resultado jsonb;
BEGIN
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR jsonb_typeof(p_compromisos) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_compromisos)>50 THEN
    RAISE EXCEPTION 'Datos del acta o compromisos inválidos.' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.actas(id_organizacion,id_plan,id_accion,fecha_reunion,objetivo,asistentes,asistentes_externos,observaciones)
  VALUES ((p_datos->>'id_organizacion')::uuid,(p_datos->>'id_plan')::uuid,(p_datos->>'id_accion')::uuid,
    (p_datos->>'fecha_reunion')::date,p_datos->>'objetivo',ARRAY(SELECT jsonb_array_elements_text(p_datos->'asistentes')),
    coalesce(p_datos->>'asistentes_externos',''),p_datos->>'observaciones') RETURNING * INTO acta;
  FOR c IN SELECT jsonb_array_elements(p_compromisos) LOOP
    IF jsonb_typeof(c) IS DISTINCT FROM 'object'
       OR coalesce(length(btrim(c->>'descripcion')),0) NOT BETWEEN 1 AND 2000
       OR coalesce(length(btrim(c->>'responsable_nombre')),0) NOT BETWEEN 1 AND 150
       OR coalesce(length(btrim(c->>'responsable_contacto')),0) NOT BETWEEN 1 AND 300
       OR coalesce(length(c->>'observaciones'),0)>2000
       OR c->>'fecha_limite' IS NULL THEN
      RAISE EXCEPTION 'Compromiso incompleto o inválido.' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.compromisos(id_acta,descripcion,responsable_nombre,responsable_contacto,fecha_limite,observaciones)
    VALUES(acta.id_acta,btrim(c->>'descripcion'),btrim(c->>'responsable_nombre'),btrim(c->>'responsable_contacto'),
      (c->>'fecha_limite')::date,nullif(btrim(c->>'observaciones'),''));
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(guardado) ORDER BY guardado.created_at,guardado.id_compromiso),'[]'::jsonb) INTO resultado
    FROM public.compromisos guardado WHERE guardado.id_acta=acta.id_acta AND guardado.archived_at IS NULL;
  RETURN to_jsonb(acta) || jsonb_build_object('compromisos',resultado);
END;
$$;
REVOKE ALL ON FUNCTION public.crear_acta_completa(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_acta_completa(jsonb,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
