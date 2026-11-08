-- Schema para produção no Supabase (PostgreSQL). Na demo local, os mesmos dados ficam em data/db.json.

create table if not exists escritorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  plano text not null check (plano in ('SOLO', 'ESCRITORIO', 'BANCA')),
  evolution_instance text unique,
  config jsonb not null default '{}'::jsonb,       -- advogados, agenda, endereço, tom de voz
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  phone text not null,
  push_name text,
  nome text,
  stage text not null default 'novo',
  problemas text[] not null default '{}',
  situacao text check (situacao in ('empregado', 'desligado')),
  meses_desde_saida numeric,
  tempo_vinculo_meses numeric,
  carteira boolean,
  provas boolean,
  temperatura text check (temperatura in ('quente', 'morno', 'frio')),
  score int,
  urgente boolean not null default false,
  classificacao jsonb,
  opt_out boolean not null default false,
  handoff_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escritorio_id, phone)
);

create table if not exists mensagens (
  id bigserial primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  origem text not null check (origem in ('lead', 'agente', 'advogado')),
  texto text not null,
  followup text,
  response_ms int,
  created_at timestamptz not null default now()
);

create table if not exists agendamentos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  advogado text not null,
  inicio timestamptz not null,
  modalidade text not null,
  google_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists followups (
  id bigserial primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  tipo text not null check (tipo in ('24h', '48h', '7d')),
  due_at timestamptz not null,
  sent_at timestamptz,
  cancelado boolean not null default false
);

create table if not exists notificacoes_advogado (
  id bigserial primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  tipo text not null check (tipo in ('briefing', 'urgente', 'humano', 'relatorio', 'nota')),
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_escritorio_temp on leads (escritorio_id, temperatura);
create index if not exists idx_followups_due on followups (due_at) where sent_at is null and not cancelado;
create index if not exists idx_mensagens_lead on mensagens (lead_id, created_at);
