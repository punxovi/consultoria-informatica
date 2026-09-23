-- Los triggers de auditoría se instalaron como SECURITY INVOKER cuando solo
-- escribía el administrador SQL. Una política RLS que permita a un usuario
-- escribir Programas falla al insertar el historial privado. La función
-- trigger se eleva de forma acotada; nunca se concede INSERT directo.
BEGIN;

CREATE OR REPLACE FUNCTION fge_private.auditar_registro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  anterior jsonb;
  posterior jsonb;
  fila jsonb;
  clave jsonb := '{}'::jsonb;
  nombre_columna text;
  actor_invocador text := COALESCE(
    NULLIF(NULLIF(current_setting('role', true), 'none'), ''),
    session_user
  );
BEGIN
  IF TG_OP <> 'INSERT' THEN anterior := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN posterior := to_jsonb(NEW); END IF;
  fila := coalesce(posterior, anterior);
  FOREACH nombre_columna IN ARRAY TG_ARGV LOOP
    clave := clave || jsonb_build_object(nombre_columna, fila -> nombre_columna);
  END LOOP;
  INSERT INTO fge_private.historial_cambios
    (tabla_afectada, clave_registro, tipo_accion, id_usuario, actor_sql, antes, despues)
  VALUES
    (TG_TABLE_NAME, clave, TG_OP, auth.uid(), actor_invocador, anterior, posterior);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION fge_private.auditar_registro()
  FROM PUBLIC, anon, authenticated;

COMMIT;
