BEGIN;
CREATE TABLE public.notificaciones_email_cotizacion (
  id_notificacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_solicitud uuid NOT NULL REFERENCES public.solicitudes_cotizacion(id_solicitud) ON DELETE RESTRICT,
  id_envio uuid,
  tipo text NOT NULL CHECK (tipo IN ('coordinador', 'solicitante')),
  destinatario text NOT NULL CHECK (destinatario ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  datos jsonb NOT NULL CHECK (jsonb_typeof(datos) = 'object'),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'enviado', 'fallido')),
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  proximo_intento timestamptz NOT NULL DEFAULT clock_timestamp(),
  ultimo_error text,
  enviado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id_solicitud, tipo)
);
ALTER TABLE public.notificaciones_email_cotizacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificaciones_email_cotizacion FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.notificaciones_email_cotizacion TO service_role;
CREATE INDEX notificaciones_email_cotizacion_pendientes_idx
  ON public.notificaciones_email_cotizacion(proximo_intento, created_at)
  WHERE estado IN ('pendiente', 'procesando');
CREATE UNIQUE INDEX notificaciones_email_solicitante_envio_uidx
  ON public.notificaciones_email_cotizacion(id_envio)
  WHERE tipo='solicitante' AND id_envio IS NOT NULL;

CREATE FUNCTION fge_private.encolar_emails_solicitud_cotizacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE solicitud public.solicitudes_cotizacion; persona record; items jsonb;
BEGIN
  SELECT * INTO solicitud FROM public.solicitudes_cotizacion
    WHERE id_solicitud=NEW.id_solicitud AND archived_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto', d.nombre_producto, 'cantidad', d.cantidad, 'unidad', d.unidad_medida,
    'organizacion', d.nombre_organizacion, 'pais', d.nombre_pais
  ) ORDER BY d.id_detalle), '[]'::jsonb) INTO items
  FROM public.solicitud_cotizacion_detalles d
  WHERE d.id_solicitud=solicitud.id_solicitud AND d.archived_at IS NULL;

  IF solicitud.id_coordinador IS NOT NULL THEN
    SELECT u.email, p.nombre INTO persona FROM auth.users u
      JOIN public.perfiles p ON p.id_usuario=u.id
      WHERE u.id=solicitud.id_coordinador AND p.activo AND p.archived_at IS NULL;
    IF FOUND AND persona.email IS NOT NULL THEN
      INSERT INTO public.notificaciones_email_cotizacion(id_solicitud,id_envio,tipo,destinatario,datos)
      VALUES (solicitud.id_solicitud,solicitud.id_envio,'coordinador',lower(persona.email),jsonb_build_object(
        'coordinador', persona.nombre, 'id_solicitud', solicitud.id_solicitud,
        'nombre', solicitud.nombre_solicitante, 'correo', solicitud.correo,
        'telefono', solicitud.telefono, 'mensaje', solicitud.mensaje,
        'pais', (SELECT nombre FROM public.paises WHERE id_pais=solicitud.id_pais),
        'items', items
      )) ON CONFLICT (id_solicitud,tipo) DO NOTHING;
    END IF;
  END IF;

  IF solicitud.id_envio IS NOT NULL THEN
    INSERT INTO public.notificaciones_email_cotizacion(id_solicitud,id_envio,tipo,destinatario,datos)
    SELECT solicitud.id_solicitud,solicitud.id_envio,'solicitante',lower(solicitud.correo),jsonb_build_object(
      'nombre', solicitud.nombre_solicitante, 'id_solicitud', solicitud.id_envio,
      'pais', (SELECT string_agg(DISTINCT pais.nombre, ', ' ORDER BY pais.nombre)
        FROM public.solicitudes_cotizacion s JOIN public.paises pais ON pais.id_pais=s.id_pais
        WHERE s.id_envio=solicitud.id_envio),
      'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'producto', d.nombre_producto, 'cantidad', d.cantidad, 'unidad', d.unidad_medida,
        'organizacion', d.nombre_organizacion, 'pais', d.nombre_pais
      ) ORDER BY d.id_detalle) FROM public.solicitudes_cotizacion s
        JOIN public.solicitud_cotizacion_detalles d ON d.id_solicitud=s.id_solicitud AND d.archived_at IS NULL
        WHERE s.id_envio=solicitud.id_envio), '[]'::jsonb)
    )
    ON CONFLICT (id_envio) WHERE tipo='solicitante' AND id_envio IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.encolar_emails_solicitud_cotizacion() FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER encolar_emails_solicitud_cotizacion
  AFTER INSERT ON public.solicitudes_cotizacion DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fge_private.encolar_emails_solicitud_cotizacion();

CREATE FUNCTION public.tomar_notificaciones_email_cotizacion(p_limite integer DEFAULT 20)
RETURNS SETOF public.notificaciones_email_cotizacion
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Límite inválido' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
    WITH candidatas AS (
      SELECT n.id_notificacion FROM public.notificaciones_email_cotizacion n
      WHERE (n.estado='pendiente' AND n.proximo_intento<=clock_timestamp())
         OR (n.estado='procesando' AND n.proximo_intento<=clock_timestamp())
      ORDER BY n.created_at,n.id_notificacion
      FOR UPDATE SKIP LOCKED LIMIT p_limite
    )
    UPDATE public.notificaciones_email_cotizacion n
    SET estado='procesando', intentos=n.intentos+1,
        proximo_intento=clock_timestamp()+interval '5 minutes'
    FROM candidatas c WHERE n.id_notificacion=c.id_notificacion
    RETURNING n.*;
END;
$$;

CREATE FUNCTION public.cerrar_notificacion_email_cotizacion(p_id uuid,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actual public.notificaciones_email_cotizacion;
BEGIN
  SELECT * INTO actual FROM public.notificaciones_email_cotizacion
    WHERE id_notificacion=p_id AND estado='procesando' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_error IS NULL THEN
    UPDATE public.notificaciones_email_cotizacion SET estado='enviado',enviado_en=clock_timestamp(),ultimo_error=NULL
      WHERE id_notificacion=p_id;
  ELSIF actual.intentos>=8 THEN
    UPDATE public.notificaciones_email_cotizacion SET estado='fallido',ultimo_error=left(p_error,1000)
      WHERE id_notificacion=p_id;
  ELSE
    UPDATE public.notificaciones_email_cotizacion SET estado='pendiente',ultimo_error=left(p_error,1000),
      proximo_intento=clock_timestamp()+make_interval(mins=>least(360,5*(2^least(actual.intentos-1,6))::integer))
      WHERE id_notificacion=p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.tomar_notificaciones_email_cotizacion(integer),
  public.cerrar_notificacion_email_cotizacion(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_notificaciones_email_cotizacion(integer),
  public.cerrar_notificacion_email_cotizacion(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION fge_private.encolar_emails_solicitud_cotizacion() FROM service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
