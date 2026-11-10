import test from 'node:test';
import assert from 'node:assert/strict';
import bridge from '../bridge/index.js';
import {packSceneNote} from '../public/continuity.mjs';
import {replayFromCheckpoint} from '../public/checkpoint-replay.mjs';

const root='https://living-world-bridge-mcp.korotkowdoc.workers.dev';
const worldId='10000000-0000-4000-8000-000000000009';
const branchId='10000000-0000-4000-8000-000000000010';
const sceneId='10000000-0000-4000-8000-000000000020';
const env={
 BRIDGE_MODE:'live',BRIDGE_PUBLIC_URL:root+'/mcp',
 SUPABASE_URL:'https://bcwzlsljcxubqtvzsucz.supabase.co',
 SUPABASE_OAUTH_CLIENT_ID:'f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6',
 BRIDGE_SUPABASE_USER_ID:'0a3fbf41-c3c6-4743-a88c-f9a7870fd244',
 SUPABASE_PUBLISHABLE_KEY:'public-test-value',
 BRIDGE_SEAL_KEY:'a'.repeat(43),
 BRIDGE_WRITES_ENABLED:'true'
};
function jwt(){
 const now=Math.floor(Date.now()/1000);
 return [{alg:'HS256',typ:'JWT'},{iss:env.SUPABASE_URL+'/auth/v1',
  sub:env.BRIDGE_SUPABASE_USER_ID,role:'authenticated',client_id:env.SUPABASE_OAUTH_CLIENT_ID,
  aud:'authenticated',iat:now-60,exp:now+3600},{test:true}]
 .map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
}
const call=async (name,args)=>{
 const res=await bridge.fetch(new Request(root+'/mcp',{method:'POST',headers:{
  'content-type':'application/json',authorization:'Bearer '+jwt()},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env);
 const json=await res.json();
 if(json.result?.isError)throw Error(name+' failed: '+json.result?.content?.[0]?.text);
 return json.result?.structuredContent;
};

test('OAuth stage open -> checkpoint -> resume -> Year close -> memory search (one real protocol)',async()=>{
 const scene={id:sceneId,parent_scene_id:null,world_id:worldId,branch_id:branchId,
  world_time:'2010-07-31T08:00:00',body:'Гарри обещал: Я верну книгу в четверг!',
  prompt_note:packSceneNote({facts:['Гарри обещал вернуть книгу'],open_threads:['Вернуть книгу'],
   memories:[{id:'book-joke',kind:'joke',title:'Книга в четверг',
    detail:'Личная фраза о возврате книги',quote:'Я верну книгу в четверг!',
    participants:['Гарри','Лия'],known_by:['Гарри','Лия'],emotional_context:'Подшучивание',
    tags:['книга','четверг']}]})};
 const state={world:{id:worldId,active_branch_id:branchId,name:'Тестовый мир',
  genesis_choices:{auto_save_enabled:true}},
  branch:{id:branchId,name:'Первая ветка',head_scene_id:sceneId},
  scenes:[scene],characters:[],has_older_scenes:false};
 const stored=[];
 let activeAnchor=true;
 const former=globalThis.fetch;
 const asyncBody=r=>r?.body?JSON.parse(r.body):null;
 globalThis.fetch=async (raw,opts={})=>{
  const url=String(raw),method=opts.method||'GET';
  if(url.endsWith('/auth/v1/user'))return Response.json({id:env.BRIDGE_SUPABASE_USER_ID});
  if(url.endsWith('/rest/v1/rpc/lw_bridge_v2_state'))return Response.json(state);
  if(url.endsWith('/rest/v1/rpc/lw_bridge_v4_since_checkpoint')){
   const input=asyncBody(opts);
   assert.equal(input.p_anchor,sceneId);
   if(!activeAnchor)return Response.json({code:'LW409',message:'anchor invalidated'},{status:409});
   return Response.json({verified:true,world_id:worldId,active_branch_id:branchId,
    checkpoint_head:sceneId,current_head:sceneId,total_delta_scenes:0,
    offset:input.p_offset,rows:[],next_offset:null,complete:true});
  }
  if(url.includes('/rest/v1/lw_scenes?world_id=eq.')&&url.includes('id=in.'))return Response.json([scene]);
  if(url.includes('/rest/v1/lw_scenes?world_id=eq.')&&url.includes('id=eq.'))return Response.json([scene]);
  if(url.includes('/rest/v1/lw_scenes?world_id=eq.')&&url.includes('body=ilike.'))return Response.json([scene]);
  if(url.includes('/rest/v1/lw_scenes?world_id=eq.'))return Response.json([{
   id:scene.id,parent_scene_id:scene.parent_scene_id,world_time:scene.world_time,
   prompt_note:scene.prompt_note
  }]);
  if(url.includes('/rest/v1/lw_reference_docs?world_id=eq.')){
   const selected=stored.filter(d=>!url.includes('doc_key=eq.')||url.includes('doc_key=eq.'+d.doc_key));
   if(url.includes('select=id,revision,sha256'))return Response.json(selected.slice(-1).map(d=>({
    id:d.id,revision:d.revision,sha256:d.sha256
   })));
   if(url.includes('doc_key=eq.story-stage-control-v2'))return Response.json([...selected].reverse());
   return Response.json(selected);
  }
  if(url.endsWith('/rest/v1/lw_reference_docs')&&method==='POST'){
   const data=asyncBody(opts);
   assert.ok(data.doc_key);
   assert.equal(data.world_id,worldId);
   stored.push({...data,id:'10000000-0000-4000-8000-'+String(200+stored.length).padStart(12,'0')});
   return Response.json({}, {status:201});
  }
  throw Error('Unexpected mock '+method+' '+url);
 };
 try{
  const opened=await call('open_story_stage',{world_id:worldId,title:'До Хогвартса',expected_head:sceneId});
  assert.equal(opened.persisted,true);
  assert.equal(opened.stage.title,'До Хогвартса');
  const stage=await call('get_story_stage_state',{world_id:worldId});
  assert.equal(stage.active_stage.title,'До Хогвартса');
  const cp=await call('create_chat_checkpoint',{world_id:worldId,expected_head:sceneId,
   handoff_note:'Обещание книги важно Лии.',evidence_scene_ids:[sceneId]});
  assert.equal(cp.persisted,true);
  assert.equal(cp.stage_title,'До Хогвартса');
  const checkpointRecord=stored.find(d=>d.category==='checkpoint');
  assert.ok(checkpointRecord);
  assert.match(JSON.parse(checkpointRecord.content).checkpoint_attestation,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const locallyReplayed=replayFromCheckpoint(JSON.parse(checkpointRecord.content),[],{
   verified_source_head:true,expected_head:sceneId,world_id:worldId});
  assert.equal(locallyReplayed.recovered,true);
  assert.ok(Array.isArray(locallyReplayed.economy.accounts));
  assert.ok(Array.isArray(locallyReplayed.characters.characters));
  assert.ok(Array.isArray(locallyReplayed.causality.resolved_threads));
  assert.ok(Array.isArray(locallyReplayed.depth.psychology));
  locallyReplayed.characters.characters.map(x=>x.history.slice(-25));
  const recoveryPage=await call('get_checkpoint_recovery',{world_id:worldId});
  assert.equal(recoveryPage.validated_checkpoint,true);
  const recovered=await call('get_recovered_state',{world_id:worldId});
  assert.equal(recovered.recovered,true);
  assert.equal(recovered.delta_scenes,0);
  activeAnchor=false;
  await assert.rejects(()=>call('get_recovered_state',{world_id:worldId}),/Нет совместимого checkpoint/);
  activeAnchor=true;
  const resumed=await call('get_resume_context',{world_id:worldId,offset:0,limit:25000});
  assert.equal(resumed.checkpoint_found,true);
  assert.match(resumed.checkpoint.content,/Обещание книги важно Лии/);
  assert.equal(resumed.following_scenes.count,0);
  assert.equal(resumed.active_stage.title,'До Хогвартса');
  const result=await call('search_story_memories',{world_id:worldId,query:'книга',actor_names:['Лия']});
  assert.equal(result.structured_memories.total,1);
  assert.equal(result.structured_memories.items[0].scene_id,sceneId);
  assert.equal(result.original_scene_matches[0].scene_id,sceneId);
  const exact=await call('get_story_scene',{world_id:worldId,scene_id:sceneId,limit:25000});
  assert.match(exact.text,/верну книгу в четверг/);
  const closed=await call('close_story_stage',{world_id:worldId,expected_head:sceneId});
  assert.equal(closed.persisted,true);
  assert.equal(closed.stage_closed,'До Хогвартса');
  assert.equal(closed.year_document.scenes,1);
  const updated=await call('get_story_stage_state',{world_id:worldId});
  assert.equal(updated.active_stage,null);
  assert.equal(updated.closed_stages.length,1);
  const after=await call('get_resume_context',{world_id:worldId});
  assert.equal(after.completed_stage_documents.length,1);
  assert.equal(after.completed_stage_documents[0].doc_key,closed.year_document.key);
  assert.equal(stored.filter(d=>d.category==='year_document').length,1);
 }finally{globalThis.fetch=former;}
});
