-- SCRUM-173: los Invitados no reciben datos de contacto de las Organizaciones.
BEGIN;

-- La migración 20261108020000 añadió columnas fuera de la matriz de visibilidad.
-- Se reconstruye la vista para eliminar esas columnas del contrato PostgREST.
DROP VIEW IF EXISTS public.organizaciones_invitado;

CREATE VIEW public.organizaciones_invitado
WITH (security_barrier = true) AS
SELECT o.id_organizacion, o.id_pais, o.nombre,
       o.region_departamento, o.comuna_municipio_ciudad,
       o.publico_objetivo, o.descripcion_breve, o.tipo_organizacion,
       o.numero_beneficiarios,
       jsonb_build_object('id_pais', p.id_pais, 'codigo_iso', p.codigo_iso, 'nombre', p.nombre) AS pais,
       o.archived_at, o.version
FROM public.organizaciones o
JOIN public.paises p ON p.id_pais = o.id_pais
WHERE o.archived_at IS NULL AND p.archived_at IS NULL
  AND fge_private.usuario_puede_consultar_organizacion(o.id_organizacion);

REVOKE ALL ON public.organizaciones_invitado FROM PUBLIC, anon;
GRANT SELECT ON public.organizaciones_invitado TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
