-- LIVING WORLD v2.4: strict, owner-authorized ancestry proof + paged deltas
-- for source-verified checkpoint recovery beyond the 30,000-row full-world cap.
-- Run ONCE in your project's Supabase SQL Editor before using fast recovery.
-- Does NOT update or delete any story, character, branch, checkpoint or fact.

create or replace function public.lw_bridge_v4_since_checkpoint(
 p_world uuid,
 p_anchor uuid,
 p_offset integer default 0,
 p_limit integer default 250
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
 v_owner uuid := auth.uid();
 v_active uuid;
 v_head uuid;
 v_ids uuid[];
 v_anchor_depth integer;
 v_rows jsonb;
begin
 if v_owner is null then
  raise exception using errcode='LW403',message='Нужна авторизация владельца.';
 end if;
 if p_world is null or p_anchor is null or p_offset<0 or p_offset>100000
    or p_limit<1 or p_limit>250 then
  raise exception using errcode='22023',message='Некорректные параметры проверки checkpoint.';
 end if;
 -- Keep the active branch/head stable for the duration of this read-only RPC.
 select w.active_branch_id into v_active from public.lw_worlds w
  where w.id=p_world and w.owner_id=v_owner for share;
 if not found or v_active is null then
  raise exception using errcode='LW403',message='Мир или активная ветка недоступны.';
 end if;
 select b.head_scene_id into v_head from public.lw_branches b
  where b.id=v_active and b.world_id=p_world and b.owner_id=v_owner for share;
 if not found or v_head is null then
  raise exception using errcode='LW404',message='Ветка ещё не содержит сцен.';
 end if;

 -- Follow scene parents rather than created_at/order or the chat transcript.
 -- Stops precisely at checkpoint anchor. Depth bound rejects corrupt cycles.
 with recursive walk(id,parent_scene_id,depth) as (
  select s.id,s.parent_scene_id,0 from public.lw_scenes s
   where s.id=v_head and s.world_id=p_world and s.owner_id=v_owner
  union all
  select s.id,s.parent_scene_id,w.depth+1
   from public.lw_scenes s join walk w on w.parent_scene_id=s.id
   where w.id<>p_anchor and w.depth<100000
     and s.world_id=p_world and s.owner_id=v_owner
 )
 select array_agg(w.id order by w.depth desc),
        max(w.depth) filter (where w.id=p_anchor)
   into v_ids,v_anchor_depth from walk w;

 if v_anchor_depth is null then
  raise exception using errcode='LW409',
   message='Checkpoint не находится в действующей цепочке. Отменённый хвост не восстанавливается.';
 end if;
 -- v_ids is now [checkpoint, scene1, ... current_head].
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'parent_scene_id',s.parent_scene_id,
  'world_time',s.world_time,'prompt_note',s.prompt_note
 ) order by q.ordinality),'[]'::jsonb) into v_rows
 from unnest(v_ids[(p_offset+2):(p_offset+p_limit+1)])
      with ordinality as q(id,ordinality)
 join public.lw_scenes s on s.id=q.id and s.world_id=p_world and s.owner_id=v_owner;

 return jsonb_build_object(
  'verified',true,'world_id',p_world,'active_branch_id',v_active,
  'checkpoint_head',p_anchor,'current_head',v_head,
  'total_delta_scenes',v_anchor_depth,
  'offset',p_offset,'rows',v_rows,
  'next_offset',case when p_offset+p_limit<v_anchor_depth then p_offset+p_limit else null end,
  'complete',p_offset+p_limit>=v_anchor_depth
 );
end;
$$;

revoke all on function public.lw_bridge_v4_since_checkpoint(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.lw_bridge_v4_since_checkpoint(uuid,uuid,integer,integer) to authenticated;

-- Optional source lookup for very long worlds: search ONLY active scene ancestry.
-- No wildcards from the user's query, no returned canceled-branch material.
create or replace function public.lw_bridge_v4_search_active_scenes(
 p_world uuid,p_query text,p_offset integer default 0,p_limit integer default 20
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
 v_owner uuid := auth.uid();
 v_branch uuid;
 v_head uuid;
 v_rows jsonb;
 v_total integer;
begin
 if v_owner is null then
  raise exception using errcode='LW403',message='Владелец не авторизован.';
 end if;
 if p_world is null or p_query is null or length(btrim(p_query))<3 or length(p_query)>150
    or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>50 then
  raise exception using errcode='22023',message='Некорректная строка или страница поиска.';
 end if;
 select w.active_branch_id into v_branch from public.lw_worlds w
  where w.id=p_world and w.owner_id=v_owner for share;
 if not found or v_branch is null then
  raise exception using errcode='LW403',message='Действующий мир не найден.';
 end if;
 select b.head_scene_id into v_head from public.lw_branches b
  where b.id=v_branch and b.world_id=p_world and b.owner_id=v_owner for share;
 if not found then
  raise exception using errcode='LW404',message='Ветка недоступна.';
 end if;

 with recursive ancestry(id,parent_scene_id,depth) as (
  select s.id,s.parent_scene_id,0 from public.lw_scenes s
   where s.id=v_head and s.world_id=p_world and s.owner_id=v_owner
  union all
  select s.id,s.parent_scene_id,a.depth+1
   from public.lw_scenes s join ancestry a on a.parent_scene_id=s.id
   where a.depth<100000 and s.world_id=p_world and s.owner_id=v_owner
 ),
 matching as (
  select s.id,s.world_time,s.prompt_note,a.depth,
   strpos(lower(s.body),lower(p_query)) as body_position,
   s.body
   from ancestry a join public.lw_scenes s on s.id=a.id
   where strpos(lower(s.body),lower(p_query))>0
      or strpos(lower(coalesce(s.prompt_note,'')),lower(p_query))>0
 ),
 page as (
  select * from matching order by depth asc,id asc limit p_limit offset p_offset
 )
 select count(*) into v_total from matching;
 with recursive ancestry(id,parent_scene_id,depth) as (
  select s.id,s.parent_scene_id,0 from public.lw_scenes s
   where s.id=v_head and s.world_id=p_world and s.owner_id=v_owner
  union all
  select s.id,s.parent_scene_id,a.depth+1
   from public.lw_scenes s join ancestry a on a.parent_scene_id=s.id
   where a.depth<100000 and s.world_id=p_world and s.owner_id=v_owner
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',x.id,'world_time',x.world_time,'prompt_note',x.prompt_note,
  'body_match',x.body_position>0,
  'excerpt',substr(x.body,greatest(x.body_position-220,1),650)
 ) order by x.depth asc,x.id asc),'[]'::jsonb) into v_rows
 from (
  select s.id,s.world_time,s.prompt_note,a.depth,
    strpos(lower(s.body),lower(p_query)) as body_position,s.body
  from ancestry a join public.lw_scenes s on s.id=a.id
  where strpos(lower(s.body),lower(p_query))>0
    or strpos(lower(coalesce(s.prompt_note,'')),lower(p_query))>0
  order by a.depth asc,s.id asc limit p_limit offset p_offset
 ) x;
 return jsonb_build_object(
  'verified',true,'world_id',p_world,'active_branch_id',v_branch,
  'current_head',v_head,'query',p_query,
  'offset',p_offset,'match_total',v_total,'rows',v_rows,
  'next_offset',case when p_offset+p_limit<v_total then p_offset+p_limit else null end
 );
end;
$$;
revoke all on function public.lw_bridge_v4_search_active_scenes(uuid,text,integer,integer) from public,anon;
grant execute on function public.lw_bridge_v4_search_active_scenes(uuid,text,integer,integer) to authenticated;

notify pgrst,'reload schema';
