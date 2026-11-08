-- LIVING WORLD v1.0: immutable document revisions for a private, ChatGPT-first world.
-- Apply once in Supabase > SQL Editor with the existing schema.sql installed.
-- No existing scene or world data is deleted, rewritten or migrated.
create table if not exists public.lw_reference_docs (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.lw_worlds(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id),
  doc_key text not null check (length(doc_key) between 3 and 128 and doc_key ~ '^[a-z0-9][a-z0-9._-]*$'),
  revision integer not null default 1 check (revision between 1 and 1000000),
  category text not null check (category in (
    'core_rules','glossary','character_start','character_baseline',
    'year_document','year_anchors','checkpoint','director_calibration',
    'style_example','world_lore','other'
  )),
  title text not null check (length(title) between 1 and 250),
  source_filename text not null default '',
  content text not null check (length(content) between 1 and 750000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(world_id,doc_key,revision)
);

create index if not exists lw_reference_docs_world_idx
  on public.lw_reference_docs(world_id,doc_key,revision desc);

alter table public.lw_reference_docs enable row level security;
revoke all on public.lw_reference_docs from public,anon,authenticated;
grant select,insert on public.lw_reference_docs to authenticated;

drop policy if exists "lw_reference_docs_select" on public.lw_reference_docs;
create policy "lw_reference_docs_select" on public.lw_reference_docs for select to authenticated
  using (owner_id=(select auth.uid()) and exists (
    select 1 from public.lw_worlds w where w.id=world_id and w.owner_id=(select auth.uid())
  ));

drop policy if exists "lw_reference_docs_insert" on public.lw_reference_docs;
create policy "lw_reference_docs_insert" on public.lw_reference_docs for insert to authenticated
  with check (owner_id=(select auth.uid()) and exists (
    select 1 from public.lw_worlds w where w.id=world_id and w.owner_id=(select auth.uid())
  ));

-- Enforce append-only documents even for members with broader table permissions.
-- Revisions are immutable: replacing a document means inserting a later revision.
create or replace function public.lw_reference_docs_block_changes()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Документы неизменяемы: добавьте новую редакцию.';
end $$;

drop trigger if exists lw_reference_docs_immutable on public.lw_reference_docs;
create trigger lw_reference_docs_immutable before update or delete on public.lw_reference_docs
for each row execute function public.lw_reference_docs_block_changes();

-- A manifest listing only the latest revision of each key. Full text is
-- retrieved separately through an authenticated read to avoid huge prompts.
create or replace view public.lw_reference_doc_manifest
with (security_invoker=true) as
select distinct on (world_id,doc_key)
  id,world_id,doc_key,revision,category,title,source_filename,sha256,
  created_at,length(content) as content_length
from public.lw_reference_docs
order by world_id,doc_key,revision desc;

revoke all on public.lw_reference_doc_manifest from public,anon,authenticated;
grant select on public.lw_reference_doc_manifest to authenticated;

-- SQL Editor installation verification (run as owner, then check app):
-- select to_regclass('public.lw_reference_docs') as docs_table;
