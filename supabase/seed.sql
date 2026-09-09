-- Datos semilla para FGE
-- Estos datos se insertan al hacer `supabase start` o `supabase db reset`

-- Insertar roles básicos de la plataforma
INSERT INTO public.roles (codigo, nombre) VALUES
('ADMIN', 'Administrador'),
('COORD', 'Coordinador'),
('INVIT', 'Invitado')
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre;
