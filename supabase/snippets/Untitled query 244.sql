WITH target AS (
  SELECT u.id AS user_id, r.id_rol AS role_id
  FROM auth.users u
  JOIN public.perfiles p ON p.id_usuario = u.id
  JOIN public.roles r ON r.codigo = 'ADMIN' AND r.activo = true
  WHERE lower(u.email) = lower('admin@prueba.com')
)
INSERT INTO public.asignaciones_roles
  (id_usuario, id_rol, alcance, id_pais, otorgado_por)
SELECT t.user_id, t.role_id, 'global', NULL, t.user_id
FROM target t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.asignaciones_roles a
  WHERE a.id_usuario = t.user_id
    AND a.id_rol = t.role_id
    AND a.alcance = 'global'
    AND a.revocado_at IS NULL
)
RETURNING id_usuario, id_rol, alcance, id_pais;