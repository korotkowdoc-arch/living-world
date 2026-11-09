-- LIVING WORLD v1.9: secure, atomic revision of a played scene into a NEW branch.
-- One-time migration; leaves all worlds, scenes, old branches and rules intact.
-- Requires supabase/schema.sql. This function is deliberately a NEW RPC,
-- so the existing mobile UI lw_fork_scene is not changed.
create or replace function public.lw_bridge_v2_fork(
  p_world uuid,
  p_source_branch uuid,
  p_expected_head uuid,
  p_target uuid,
  p_prefix text,
  p_continuation text,
  p_note text default '',
  p_time text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_active uuid;
  v_head uuid;
  v_parent uuid;
  v_original text;
  v_original_time text;
  v_time text;
  v_new_branch uuid := gen_random_uuid();
  v_new_scene uuid := gen_random_uuid();
begin
  if v_owner is null then
    raise exception using errcode='LW403',message='Требуется вход владельца.';
  end if;
  if p_world is null or p_source_branch is null or p_target is null
    or p_prefix is null or p_continuation is null
    or length(btrim(p_continuation))=0
    or length(p_prefix||p_continuation)>150000
    or length(coalesce(p_note,''))>60000 then
    raise exception using errcode='22023',message='Некорректная точка правки, текст или последствия.';
  end if;

  -- Same lock ordering as lw_bridge_v2_append: world first, active branch second.
  select w.active_branch_id into v_active
    from public.lw_worlds w
    where w.id=p_world and w.owner_id=v_owner
    for update;
  if not found then
    raise exception using errcode='LW403',message='Мир недоступен.';
  end if;
  if v_active is distinct from p_source_branch then
    raise exception using errcode='LW409',message='Действующая ветка изменилась после подготовки правки.';
  end if;
  select b.head_scene_id into v_head
    from public.lw_branches b
    where b.id=p_source_branch and b.world_id=p_world and b.owner_id=v_owner
    for update;
  if not found then
    raise exception using errcode='LW403',message='Ветка недоступна.';
  end if;
  if v_head is distinct from p_expected_head then
    raise exception using errcode='LW409',message='Последняя сцена изменилась; отклонена устаревшая режиссёрская правка.';
  end if;

  select s.body,s.parent_scene_id,s.world_time into v_original,v_parent,v_original_time
    from public.lw_scenes s
    where s.id=p_target and s.world_id=p_world and s.owner_id=v_owner;
  if not found then
    raise exception using errcode='LW404',message='Исходная сцена не найдена.';
  end if;

  if not exists (
    with recursive ancestors(id,parent_scene_id) as (
      select s.id,s.parent_scene_id
        from public.lw_scenes s where s.id=v_head and s.world_id=p_world and s.owner_id=v_owner
      union all
      select s.id,s.parent_scene_id
        from public.lw_scenes s join ancestors a on a.parent_scene_id=s.id
        where s.world_id=p_world and s.owner_id=v_owner
    )
    select 1 from ancestors where id=p_target
  ) then
    raise exception using errcode='LW409',message='Исходная сцена больше не в валидной цепочке.';
  end if;
  if left(v_original,char_length(p_prefix))<>p_prefix then
    raise exception using errcode='LW409',message='Префикс изменён. Перечитай исходный текст.';
  end if;
  v_time:=coalesce(p_time,v_original_time);
  if v_time is null or length(v_time)>32
     or v_time !~ '^[0-9]{4}-[0-9]{2}(-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2})?)?$' then
    raise exception using errcode='22023',message='Некорректная игровая дата исправления.';
  end if;

  insert into public.lw_branches(id,world_id,owner_id,name,parent_branch_id,fork_scene_id,head_scene_id)
    values(v_new_branch,p_world,v_owner,'Правка MCP '||to_char(now(),'DD.MM HH24:MI'),
      p_source_branch,v_parent,v_parent);
  insert into public.lw_scenes(id,world_id,branch_id,owner_id,parent_scene_id,body,world_time,model,prompt_note)
    values(v_new_scene,p_world,v_new_branch,v_owner,v_parent,p_prefix||p_continuation,
      v_time,'revision-mcp',coalesce(p_note,''));
  update public.lw_branches set head_scene_id=v_new_scene
    where id=v_new_branch and owner_id=v_owner;
  update public.lw_worlds set active_branch_id=v_new_branch,updated_at=now()
    where id=p_world and owner_id=v_owner;
  return jsonb_build_object('branch_id',v_new_branch,'scene_id',v_new_scene,
    'source_branch_id',p_source_branch,'source_head',v_head,
    'target_scene_id',p_target,'world_time',v_time);
end
$$;
revoke all on function public.lw_bridge_v2_fork(uuid,uuid,uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.lw_bridge_v2_fork(uuid,uuid,uuid,uuid,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
