import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {companionHealth} from '../public/companion-health.mjs';
import {packSceneNote} from '../public/continuity.mjs';

const sql=readFileSync(new URL('../supabase/bridge_revision.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
const sceneId='11111111-1111-4111-8111-111111111111';
const world={id:'aa',name:'Мир',genesis_choices:{auto_save_enabled:true}};
const branch={id:'bb',name:'Главная',head_scene_id:sceneId};
const scenes=[{id:sceneId,world_time:'2010-08-01T10:00:00',model:'mcp',body:'Полная сохранённая сцена',
 prompt_note:packSceneNote({facts:['Произошло событие'],characters:[{name:'Гарри',state:{mood:'тревога'}}]})}];

test('health journal reports verified Supabase scene, head, full length and causal metadata',()=>{
 const h=companionHealth({world,branch,recentScenes:scenes,
  documentsReady:true,documents:[{category:'core_rules'},{category:'glossary'}],
  assets:{scanned_scenes:1,issues:[]},checkedAt:'2026-11-09T10:00:00Z'});
 assert.equal(h.ready,true);
 assert.equal(h.auto_save_enabled,true);
 assert.equal(h.head_scene_id,sceneId);
 assert.equal(h.recent[0].body_length,scenes[0].body.length);
 assert.equal(h.recent[0].model,'mcp');
 assert.equal(h.recent[0].has_structured_consequences,true);
 assert.equal(h.recent[0].fact_count,1);
 assert.equal(h.recent[0].character_updates,1);
 assert.equal(h.oauth_chat_verified,false);
 assert.match(h.oauth_note,/ChatGPT/);
});

test('health warns on missing head, rules or autosave; does not invent zero balance',()=>{
 const h=companionHealth({world:{...world,genesis_choices:{}},
  branch:{...branch,head_scene_id:'22222222-2222-4222-8222-222222222222'},
  recentScenes:scenes,documentsReady:true,documents:[],assets:null,assetIssue:'История не полная'});
 assert.equal(h.ready,false);
 assert.ok(h.warnings.some(x=>x.includes('Последняя сцена')));
 assert.ok(h.warnings.some(x=>x.includes('Автосохранение')));
 assert.ok(h.warnings.some(x=>x.includes('Правила')));
 assert.equal(h.recent[0].active_head,false);
});

test('app and bridge use same 30000 scene safety bound without deleting history',()=>{
 assert.match(app,/const maxRows=30000,pageSize=500/);
 assert.match(bridge,/const maxRows=30000,pageSize=500/);
 assert.doesNotMatch(app,/offset<=3000;offset\+=500/);
 assert.match(app,/Ветка изменилась во время чтения истории/);
 assert.match(app,/state\.assets=null;state\.characterLedger=null;state\.causalLedger=null/);
});

test('PWA shows health report and refreshed scene journal without pretending to inspect ChatGPT OAuth',()=>{
 assert.match(app,/function renderSyncHealth\(\)/);
 assert.match(app,/async function reloadSyncHealth\(\)/);
 assert.match(app,/case 'health-reload':await reloadSyncHealth\(\);return;/);
 assert.match(app,/companionHealth\(\{world:state\.world,branch,recentScenes:state\.memoryScenes/);
 assert.match(app,/отдельно командой get_sync_health/);
 assert.match(app,/Проверить в Supabase/);
});

test('atomic revision SQL locks owner world and source branch, verifies ancestry and prefix before new branch',()=>{
 assert.match(sql,/create or replace function public\.lw_bridge_v2_fork\(/i);
 assert.match(sql,/p_expected_head uuid/);
 assert.match(sql,/from public\.lw_worlds w[\s\S]*?for update;/i);
 assert.match(sql,/from public\.lw_branches b[\s\S]*?for update;/i);
 assert.match(sql,/v_head is distinct from p_expected_head/);
 assert.match(sql,/with recursive ancestors\(id,parent_scene_id\)/);
 assert.match(sql,/left\(v_original,char_length\(p_prefix\)\)<>p_prefix/);
 assert.match(sql,/insert into public\.lw_branches/i);
 assert.match(sql,/insert into public\.lw_scenes/i);
 assert.match(sql,/return jsonb_build_object\('branch_id'/);
 assert.match(sql,/revoke all on function public\.lw_bridge_v2_fork/i);
 assert.match(sql,/grant execute on function public\.lw_bridge_v2_fork.*authenticated/i);
 assert.doesNotMatch(sql,/delete\s+from\s+public\.lw_(scenes|branches)/i);
});

test('MCP forks only via atomic revision SQL, with signed context proof and no unsafe fallback',()=>{
 assert.match(bridge,/prepareSceneRevision\(/);
 assert.match(bridge,/saveSceneRevision\(/);
 assert.match(bridge,/unseal\(env,'revision-v1',args\.revision_token\)/);
 assert.match(bridge,/rpc\/lw_bridge_v2_fork/);
 assert.doesNotMatch(bridge,/rpc\/lw_fork_scene/);
 assert.match(bridge,/supabase\/bridge_revision\.sql/);
 assert.match(bridge,/preflight_token/);
 assert.match(bridge,/verifyScenePreflight\(/);
});
