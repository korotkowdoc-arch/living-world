-- LIVING WORLD: atomic, idempotent scene writes for authenticated OAuth bridge.
-- Safe for repeat execution: does not delete any world, branch, scene or document.
-- Requires the existing supabase/schema.sql tables and RLS.
--
-- Expected PostgREST RPC JSON:
-- {p_world,p_branch,p_head,p_id,p_body,p_time,p_note}

create or replace function public.lw_bridge_v2_append(
  p_world uuid, p_branch uuid, p_head uuid, p_id uuid,
  p_body text, p_time text, p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_active uuid;
  v_head uuid;
  v_existing public.lw_scenes%rowtype;
begin
  if v_owner is null then
    raise exception using errcode='LW403', message='Необходим вход владельца мира.';
  end if;
  if p_world is null or p_branch is null or p_id is null
     or p_body is null or length(btrim(p_body))=0 or length(p_body)>150000
     or p_time is null or length(p_time)>32
     or p_time !~ '^[0-9]{4}-[0-9]{2}(-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2})?)?$'
     or length(coalesce(p_note,''))>60000 then
    raise exception using errcode='22023', message='Неверный ID, текст, игровая дата или объём последствий.';
  end if;

  select active_branch_id into v_active
    from public.lw_worlds
    where id=p_world and owner_id=v_owner
    for update;
  if not found then
    raise exception using errcode='LW403', message='Мир недоступен владельцу.';
  end if;
  if v_active is distinct from p_branch then
    raise exception using errcode='LW409', message='Активная ветка изменилась. Перечитай мир перед записью.';
  end if;

  select head_scene_id into v_head
    from public.lw_branches
    where id=p_branch and world_id=p_world and owner_id=v_owner
    for update;
  if not found then
    raise exception using errcode='LW403', message='Ветка недоступна владельцу.';
  end if;

  -- A second submission with the same ID must never write a second event.
  -- Reject tampered retries; return the original ID only for the exact package.
  select * into v_existing from public.lw_scenes where id=p_id;
  if found then
    if v_existing.owner_id=v_owner
      and v_existing.world_id=p_world
      and v_existing.branch_id=p_branch
      and v_existing.parent_scene_id is not distinct from p_head
      and v_existing.body=p_body
      and v_existing.world_time=p_time
      and v_existing.prompt_note=coalesce(p_note,'') then
      return v_existing.id;
    end if;
    raise exception using errcode='LW409', message='ID сцены уже существует с другими данными.';
  end if;

  if v_head is distinct from p_head then
    raise exception using errcode='LW409', message='Последняя сцена изменилась. Перечитай ветку.';
  end if;

  insert into public.lw_scenes (
    id,world_id,branch_id,owner_id,parent_scene_id,body,world_time,model,prompt_note
  ) values (
    p_id,p_world,p_branch,v_owner,p_head,p_body,p_time,'mcp',coalesce(p_note,'')
  );

  update public.lw_branches
    set head_scene_id=p_id
    where id=p_branch and world_id=p_world and owner_id=v_owner;

  update public.lw_worlds
    set updated_at=now()
    where id=p_world and owner_id=v_owner;

  return p_id;
end;
$$;

revoke all on function public.lw_bridge_v2_append(uuid,uuid,uuid,uuid,text,text,text) from public, anon;
grant execute on function public.lw_bridge_v2_append(uuid,uuid,uuid,uuid,text,text,text) to authenticated;

-- Ask PostgREST to refresh its stored function signatures.
notify pgrst, 'reload schema';
