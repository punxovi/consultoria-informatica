-- Comprobación del nuevo INSERT: sin modificar solicitudes históricas.
-- Las filas sintéticas no se confirman y se revierten al terminar.
BEGIN;
CREATE TEMP TABLE qa_telefono_resultado(resultado jsonb) ON COMMIT DROP;
DO $qa$
DECLARE valor text; telefono_guardado text;
BEGIN
  FOREACH valor IN ARRAY ARRAY[NULL::text,'','   ',E'\t',E'\n',repeat('9',61)] LOOP
    BEGIN
      INSERT INTO public.solicitudes_cotizacion(nombre_solicitante,correo,telefono)
        VALUES('QA teléfono obligatorio','qa@example.invalid',valor);
      RAISE EXCEPTION 'Se admitió teléfono inválido';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  END LOOP;
  INSERT INTO public.solicitudes_cotizacion(nombre_solicitante,correo,telefono)
    VALUES('QA teléfono obligatorio','qa@example.invalid','  +56 912345678  ')
    RETURNING telefono INTO telefono_guardado;
  IF telefono_guardado IS DISTINCT FROM '+56 912345678' THEN RAISE EXCEPTION 'Teléfono no conservado correctamente'; END IF;
  INSERT INTO qa_telefono_resultado VALUES(jsonb_build_object('resultado','PASS','datos_prueba','Se revierten al terminar','alcance','Validación de teléfono en INSERT; no confirma una cotización de negocio'));
END $qa$;
SELECT resultado FROM qa_telefono_resultado;
ROLLBACK;
