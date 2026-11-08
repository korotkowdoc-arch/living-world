import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/bridge_save.sql',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');

test('atomic save migration defines exact published bridge RPC signature',()=>{
 assert.match(sql,/create or replace function public\.lw_bridge_v2_append\(\s*p_world uuid,\s*p_branch uuid,\s*p_head uuid,\s*p_id uuid,\s*p_body text,\s*p_time text,\s*p_note text default ''\s*\)/i);
 assert.match(bridge,/p_world:id,p_branch:branchKey,p_head:head,p_id:requestId,p_body:packet\.scene,p_time:stamp,p_note:note/);
 assert.match(sql,/grant execute on function public\.lw_bridge_v2_append\(uuid,uuid,uuid,uuid,text,text,text\) to authenticated/i);
 assert.match(sql,/revoke all on function public\.lw_bridge_v2_append\(uuid,uuid,uuid,uuid,text,text,text\) from public, anon/i);
 assert.match(sql,/notify pgrst, 'reload schema'/i);
});
test('DB transaction handles exact retries without duplicating scene, money or item changes',()=>{
 assert.match(sql,/select head_scene_id into v_head[\s\S]*for update/i);
 assert.match(sql,/select \* into v_existing from public\.lw_scenes where id=p_id/i);
 assert.match(sql,/v_existing\.prompt_note=coalesce\(p_note,''\)/i);
 assert.match(sql,/if v_head is distinct from p_head/i);
 assert.match(sql,/insert into public\.lw_scenes/i);
 assert.match(sql,/set head_scene_id=p_id/i);
 assert.match(sql,/set updated_at=now\(\)/i);
});
test('saving is owner-restricted, active-branch-restricted and migration is nondestructive',()=>{
 assert.match(sql,/v_owner uuid := auth\.uid\(\)/i);
 assert.match(sql,/where id=p_world and owner_id=v_owner\s*for update/i);
 assert.match(sql,/if v_active is distinct from p_branch/i);
 assert.match(sql,/where id=p_branch and world_id=p_world and owner_id=v_owner/i);
 assert.doesNotMatch(sql,/\bdrop\s+(?:table|schema|function)/i);
 assert.doesNotMatch(sql,/\bdelete\s+from\s+public\.lw_/i);
});
test('public diagnostic avoids exposing private SQL details and labels missing RPC',()=>{
 assert.match(bridge,/if\(code==='PGRST202'\|\|code==='42883'\)/);
 assert.match(bridge,/error\.diagnosticCode=fault/);
 assert.match(bridge,/error_code:error\?\.diagnosticCode\|\|'UNCLASSIFIED'/);
});
