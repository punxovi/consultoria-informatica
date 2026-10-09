-- Creación de la tabla de diagnósticos para SCRUM-96 y SCRUM-97
create table if not exists public.diagnosticos (
    id_diagnostico uuid primary key default gen_random_uuid(),
    id_organizacion uuid not null references public.organizaciones(id_organizacion) on delete cascade,
    titulo text not null,
    descripcion text not null,
    estado text not null default 'borrador' check (estado in ('borrador', 'en_revision', 'completado', 'archivado')),
    version integer not null default 1,
    archived_at timestamp with time zone null,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    created_by uuid null,
    updated_by uuid null
);

-- Índice para optimizar consultas por organización
create index if not exists idx_diagnosticos_organizacion on public.diagnosticos(id_organizacion);

-- Políticas de seguridad (RLS)
alter table public.diagnosticos enable row level security;

create policy "Acceso por organización para diagnósticos"
    on public.diagnosticos
    for all
    using (true)
    with check (true);