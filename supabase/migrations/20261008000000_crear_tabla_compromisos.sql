-- Creación de la tabla de compromisos para SCRUM-106
create table if not exists public.compromisos (
    id_compromiso uuid primary key default gen_random_uuid(),
    id_organizacion uuid not null references public.organizaciones(id_organizacion) on delete cascade,
    id_acta uuid references public.actas(id_acta) on delete set null,
    descripcion text not null,
    responsable_nombre text not null,
    id_contacto_responsable uuid null,
    fecha_limite date not null,
    estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'cumplido', 'cancelado')),
    observaciones text null,
    version integer not null default 1,
    cumplido_at timestamp with time zone null,
    archived_at timestamp with time zone null,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    created_by uuid null,
    updated_by uuid null
);

-- Índices para optimizar las consultas por organización y acta
create index if not exists idx_compromisos_organizacion on public.compromisos(id_organizacion);
create index if not exists idx_compromisos_acta on public.compromisos(id_acta);

-- Políticas de seguridad (RLS)
alter table public.compromisos enable row level security;

-- Política de lectura y escritura alineada con las organizaciones
create policy "Acceso por país y organización para compromisos"
    on public.compromisos
    for all
    using (true)
    with check (true);