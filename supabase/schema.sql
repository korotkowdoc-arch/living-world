-- LIVING WORLD Cloud v0.3
-- Run ONCE in Supabase > SQL Editor. Personal cloud database with per-user RLS.
create extension if not exists pgcrypto;

create table if not exists public.lw_worlds (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null, genre text not null default 'Фэнтези', premise text not null default '',
 world_rules text not null default '', history text not null default '', timeline text not null default '',
 clock_start text not null default '1998-09-01T08:00:00',
 model_story text not null default 'gpt-6', model_relationships text not null default 'gpt-5.6',
 genesis_choices jsonb not null default '{}'::jsonb, genesis_draft jsonb,
 genesis_approved boolean not null default false,
 active_branch_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.lw_branches (
 id uuid primary key default gen_random_uuid(), world_id uuid not null references public.lw_worlds(id) on delete cascade,
 owner_id uuid not null default auth.uid() references auth.users(id), name text not null default 'Основная линия',
 parent_branch_id uuid, fork_scene_id uuid, head_scene_id uuid,
 created_at timestamptz not null default now()
);
create table if not exists public.lw_scenes (
 id uuid primary key default gen_random_uuid(), world_id uuid not null references public.lw_worlds(id) on delete cascade,
 branch_id uuid not null references public.lw_branches(id) on delete cascade,
 owner_id uuid not null default auth.uid() references auth.users(id),
 parent_scene_id uuid, body text not null, model text not null default 'manual',
 world_time text not null, delta jsonb not null default '{}'::jsonb,
 prompt_note text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.lw_characters (
 id uuid primary key default gen_random_uuid(), world_id uuid not null references public.lw_worlds(id) on delete cascade,
 owner_id uuid not null default auth.uid() references auth.users(id),
 role text not null default 'npc' check (role in ('hero','npc')),
 name text not null, causal_link text not null default '', description text not null default '',
 personality text not null default '', goals text not null default '', relationships text not null default '',
 knowledge text not null default '', location text not null default '', health text not null default '',
 mood text not null default '', status text not null default '', inventory text not null default '',
 created_scene_id uuid, created_at timestamptz not null default now()
);
create index if not exists lw_worlds_owner_idx on public.lw_worlds(owner_id);
create index if not exists lw_branches_world_idx on public.lw_branches(world_id);
create index if not exists lw_scenes_world_time_idx on public.lw_scenes(world_id, created_at desc);
create index if not exists lw_scenes_parent_idx on public.lw_scenes(parent_scene_id);
create index if not exists lw_characters_world_idx on public.lw_characters(world_id);

alter table public.lw_worlds enable row level security;
alter table public.lw_branches enable row level security;
alter table public.lw_scenes enable row level security;
alter table public.lw_characters enable row level security;

revoke all on public.lw_worlds, public.lw_branches, public.lw_scenes, public.lw_characters from anon, authenticated;
grant select, insert, update, delete on public.lw_worlds, public.lw_branches, public.lw_characters to authenticated;
grant select, insert on public.lw_scenes to authenticated;

-- Four explicit policies per mutable table; scene insertion happens via validated RPC.
drop policy if exists "lw_world_read" on public.lw_worlds;
create policy "lw_world_read" on public.lw_worlds for select to authenticated using (owner_id=(select auth.uid()));
drop policy if exists "lw_world_write" on public.lw_worlds;
create policy "lw_world_write" on public.lw_worlds for insert to authenticated with check (owner_id=(select auth.uid()));
drop policy if exists "lw_world_edit" on public.lw_worlds;
create policy "lw_world_edit" on public.lw_worlds for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
drop policy if exists "lw_world_delete" on public.lw_worlds;
create policy "lw_world_delete" on public.lw_worlds for delete to authenticated using (owner_id=(select auth.uid()));

drop policy if exists "lw_branch_read" on public.lw_branches;
create policy "lw_branch_read" on public.lw_branches for select to authenticated using (owner_id=(select auth.uid()));
drop policy if exists "lw_branch_write" on public.lw_branches;
create policy "lw_branch_write" on public.lw_branches for insert to authenticated with check (
 owner_id=(select auth.uid()) and exists (select 1 from public.lw_worlds w where w.id=world_id and w.owner_id=(select auth.uid()))
);
drop policy if exists "lw_branch_edit" on public.lw_branches;
create policy "lw_branch_edit" on public.lw_branches for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
drop policy if exists "lw_branch_delete" on public.lw_branches;
create policy "lw_branch_delete" on public.lw_branches for delete to authenticated using (owner_id=(select auth.uid()));

drop policy if exists "lw_scene_read" on public.lw_scenes;
create policy "lw_scene_read" on public.lw_scenes for select to authenticated using (owner_id=(select auth.uid()));
-- Import of the owner's full world backups needs authenticated INSERT (normal scene creation uses atomic RPC).
drop policy if exists "lw_scene_import" on public.lw_scenes;
create policy "lw_scene_import" on public.lw_scenes for insert to authenticated with check (
 owner_id=(select auth.uid()) and exists (
  select 1 from public.lw_branches b where b.id=branch_id and b.world_id=world_id and b.owner_id=(select auth.uid())
 )
);

drop policy if exists "lw_char_read" on public.lw_characters;
create policy "lw_char_read" on public.lw_characters for select to authenticated using (owner_id=(select auth.uid()));
drop policy if exists "lw_char_write" on public.lw_characters;
create policy "lw_char_write" on public.lw_characters for insert to authenticated with check (
 owner_id=(select auth.uid()) and exists (select 1 from public.lw_worlds w where w.id=world_id and w.owner_id=(select auth.uid()))
);
drop policy if exists "lw_char_edit" on public.lw_characters;
create policy "lw_char_edit" on public.lw_characters for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
drop policy if exists "lw_char_delete" on public.lw_characters;
create policy "lw_char_delete" on public.lw_characters for delete to authenticated using (owner_id=(select auth.uid()));

-- Optimistic, atomic scene append. Only signed-in owner, only at current head.
create or replace function public.lw_append_scene(
 p_world_id uuid, p_branch_id uuid, p_expected_head uuid,
 p_body text, p_world_time text, p_model text default 'manual', p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Войдите в аккаунт'; end if;
 if length(coalesce(p_body,''))=0 or length(p_body)>150000 then raise exception 'Недопустимый размер сцены'; end if;
 if not exists (select 1 from public.lw_worlds w where w.id=p_world_id and w.owner_id=v_user) then raise exception 'Мир недоступен'; end if;
 perform 1 from public.lw_branches b where b.id=p_branch_id and b.world_id=p_world_id and b.owner_id=v_user and b.head_scene_id is not distinct from p_expected_head for update;
 if not found then raise exception 'Ветка изменилась, обновите историю'; end if;
 insert into public.lw_scenes(id,world_id,branch_id,owner_id,parent_scene_id,body,world_time,model,prompt_note)
 values(v_id,p_world_id,p_branch_id,v_user,p_expected_head,p_body,p_world_time,coalesce(p_model,'manual'),coalesce(p_note,''));
 update public.lw_branches set head_scene_id=v_id where id=p_branch_id and owner_id=v_user;
 update public.lw_worlds set updated_at=now() where id=p_world_id and owner_id=v_user;
 return v_id;
end $$;

-- Atomic «На это:» preserving the validated prefix, creating a new branch and scene.
create or replace function public.lw_fork_scene(
 p_world_id uuid, p_source_branch_id uuid, p_target_scene_id uuid,
 p_prefix text, p_continuation text, p_note text default '', p_world_time text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_branch uuid := gen_random_uuid(); v_scene uuid := gen_random_uuid();
v_parent uuid; v_original text; v_target_time text;
begin
 if v_user is null then raise exception 'Войдите в аккаунт'; end if;
 if not exists (select 1 from public.lw_worlds w where w.id=p_world_id and w.owner_id=v_user) then raise exception 'Мир недоступен'; end if;
 if not exists (select 1 from public.lw_branches b where b.id=p_source_branch_id and b.world_id=p_world_id and b.owner_id=v_user) then raise exception 'Ветка недоступна'; end if;
 if not exists (
  with recursive ancestors(id,parent_scene_id) as (
   select s.id,s.parent_scene_id from public.lw_scenes s join public.lw_branches b on b.head_scene_id=s.id
   where b.id=p_source_branch_id and b.owner_id=v_user
   union all
   select s.id,s.parent_scene_id from public.lw_scenes s join ancestors a on a.parent_scene_id=s.id where s.owner_id=v_user
  ) select 1 from ancestors where id=p_target_scene_id
 ) then raise exception 'Сцена отсутствует в текущей ветке'; end if;
 select s.body,s.parent_scene_id,s.world_time into v_original,v_parent,v_target_time
 from public.lw_scenes s where s.id=p_target_scene_id and s.world_id=p_world_id and s.owner_id=v_user;
 if left(v_original,char_length(coalesce(p_prefix,'')))<>coalesce(p_prefix,'') then raise exception 'Префикс изменён. Обновите сцену'; end if;
 if length(coalesce(p_prefix,'')||coalesce(p_continuation,''))=0 then raise exception 'Пустое продолжение'; end if;
 insert into public.lw_branches(id,world_id,owner_id,name,parent_branch_id,fork_scene_id,head_scene_id)
 values(v_branch,p_world_id,v_user,'Правка '||to_char(now(),'DD.MM HH24:MI'),p_source_branch_id,v_parent,v_parent);
 insert into public.lw_scenes(id,world_id,branch_id,owner_id,parent_scene_id,body,world_time,model,prompt_note)
 values(v_scene,p_world_id,v_branch,v_user,v_parent,coalesce(p_prefix,'')||coalesce(p_continuation,''),
 coalesce(p_world_time,v_target_time),'revision',coalesce(p_note,''));
 update public.lw_branches set head_scene_id=v_scene where id=v_branch;
 update public.lw_worlds set active_branch_id=v_branch,updated_at=now() where id=p_world_id and owner_id=v_user;
 return v_branch;
end $$;

-- Return ONLY recent active ancestry (up to 200), not every scene of a multi-year world.
create or replace function public.lw_recent_scenes(p_branch_id uuid, p_limit int default 40)
 returns setof public.lw_scenes language sql stable security invoker set search_path = '' as $$
 with recursive chain(id,depth) as (
  select b.head_scene_id, 0 from public.lw_branches b where b.id=p_branch_id and b.owner_id=(select auth.uid())
  union all
  select s.parent_scene_id, c.depth+1 from public.lw_scenes s join chain c on s.id=c.id
  where s.owner_id=(select auth.uid()) and c.depth<greatest(1,least(p_limit,200))-1
 )
 select s.* from chain c join public.lw_scenes s on s.id=c.id
 where s.owner_id=(select auth.uid()) order by c.depth desc;
$$;

-- RPCs use explicit owner checks; no anonymous execution.
revoke all on function public.lw_append_scene(uuid,uuid,uuid,text,text,text,text) from public, anon;
revoke all on function public.lw_fork_scene(uuid,uuid,uuid,text,text,text,text) from public, anon;
revoke all on function public.lw_recent_scenes(uuid,int) from public, anon;
grant execute on function public.lw_append_scene(uuid,uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.lw_fork_scene(uuid,uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.lw_recent_scenes(uuid,int) to authenticated;
