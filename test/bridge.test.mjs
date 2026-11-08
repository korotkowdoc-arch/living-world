import assert from 'node:assert/strict';
import test from 'node:test';
import bridge from '../bridge/index.js';
import {packSceneNote} from '../public/continuity.mjs';

const root='https://living-world-bridge-mcp.korotkowdoc.workers.dev';
const worldId='10000000-0000-4000-8000-000000000009';
const branchId='10000000-0000-4000-8000-000000000010';
const env={
  BRIDGE_MODE:'live',
  BRIDGE_PUBLIC_URL:root+'/mcp',
  SUPABASE_URL:'https://bcwzlsljcxubqtvzsucz.supabase.co',
  SUPABASE_OAUTH_CLIENT_ID:'f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6',
  BRIDGE_SUPABASE_USER_ID:'0a3fbf41-c3c6-4743-a88c-f9a7870fd244',
  SUPABASE_PUBLISHABLE_KEY:'public-test-value',
  BRIDGE_WRITES_ENABLED:'false'
};
const call=(method,params={},headers={},config=env)=>bridge.fetch(new Request(root+'/mcp',{
  method:'POST',headers:{'content-type':'application/json',...headers},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
}),config);

test('MCP 2.0 discovery exposes valid resultType without credentials',async()=>{
 const r=await call('server/discover');
 assert.equal(r.status,200);
 const d=(await r.json()).result;
 assert.equal(d.resultType,'complete');
 assert.deepEqual(d.supportedVersions,['2026-07-28']);
 assert.equal(d._meta['io.modelcontextprotocol/serverInfo'].name,'living-world-bridge');
});
test('initialize and tools/list work without a Bearer token',async()=>{
 assert.equal((await call('initialize')).status,200);
 const r=await call('tools/list');
 assert.equal(r.status,200);
 const d=(await r.json()).result;
 assert.equal(d.resultType,'complete');
 assert.deepEqual(d.tools.map(t=>t.name),['list_worlds','get_world_state','get_causal_memory','get_scene_receipt','get_story_context','save_reference_document','get_character_memory','get_reference_catalog','get_reference_document','get_scene_preflight','get_companion_state','get_branch_history']);
 assert.ok(d.tools.every(t=>t._meta.securitySchemes[0].type==='oauth2'));
});
test('real data calls are forbidden without a validated OAuth token',async()=>{
 const r=await call('tools/call',{name:'list_worlds',arguments:{}});
 assert.equal(r.status,401);
 assert.match(r.headers.get('www-authenticate'),/resource_metadata/);
 assert.equal(r.headers.get('x-lw-auth-failure'),'missing_bearer');
 const invalid=await call('tools/call',{name:'list_worlds',arguments:{}},{authorization:'Bearer invalid'});
 assert.equal(invalid.status,401);
});
test('legacy demo mode remains isolated from Supabase',async()=>{
 const r=await call('tools/call',{name:'list_worlds',arguments:{}},{},{...env,BRIDGE_MODE:'demo'});
 assert.equal(r.status,200);
 assert.equal((await r.json()).result.structuredContent.mode,'demo');
});
test('resource metadata routes remain valid',async()=>{
 for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']){
  const r=await bridge.fetch(new Request(root+path),env);
  assert.equal(r.status,200);
  assert.equal((await r.json()).resource,root+'/mcp');
 }
});

function testJwt(aud,overrides={},headerOverrides={}) {
 const now=Math.floor(Date.now()/1000);
 const jwtHeader={alg:'HS256',typ:'JWT',...headerOverrides};
 const claims={
   iss:env.SUPABASE_URL+'/auth/v1',sub:env.BRIDGE_SUPABASE_USER_ID,
   role:'authenticated',client_id:env.SUPABASE_OAUTH_CLIENT_ID,
   aud,iat:now-60,exp:now+3600,...overrides
 };
 return [jwtHeader,claims,{test:true}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
}
test('approved Supabase OAuth JWT with standard audience can reach a live read-only RPC',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
   if(String(url).endsWith('/auth/v1/user'))return Response.json({id:env.BRIDGE_SUPABASE_USER_ID});
   if(String(url).endsWith('/rest/v1/rpc/lw_bridge_v2_worlds'))return Response.json([]);
   throw Error('Unexpected fetch in test');
 };
 try {
   for(const aud of ['authenticated',['authenticated',root+'/mcp'],root+'/mcp']){
     const token=testJwt(aud);
     const response=await call('tools/call',{name:'list_worlds',arguments:{}},{authorization:'Bearer '+token});
     assert.equal(response.status,200);
     assert.deepEqual((await response.json()).result.structuredContent,{mode:'live',worlds:[],next_offset:null});
   }
 } finally {globalThis.fetch=original;}
});
test('tokens from a different OAuth client or audience are still denied',async()=>{
 for(const token of [
  testJwt('authenticated',{client_id:'different-oauth-client'}),
  testJwt('https://other.example/mcp'),
  testJwt('authenticated',{sub:'11111111-1111-4111-8111-111111111111'})
 ]){
  const r=await call('tools/call',{name:'list_worlds',arguments:{}},{authorization:'Bearer '+token});
  assert.equal(r.status,401);
  assert.match(r.headers.get('x-lw-auth-failure'),/mismatch/);
 }
});
test('OAuth JWT typ at+jwt is understood, but still requires Supabase verification',async()=>{
 const token=testJwt('authenticated',{}, {typ:'at+jwt'});
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(null,{status:401});
 try{
  const r=await call('tools/call',{name:'list_worlds',arguments:{}},{authorization:'Bearer '+token});
  assert.equal(r.status,401);
  assert.equal(r.headers.get('x-lw-auth-failure'),'supabase_auth_401');
 } finally {globalThis.fetch=original;}
});

test('Supabase transport failures expose only safe diagnostics, never exception details',async()=>{
 const originalFetch=globalThis.fetch;
 const originalWarn=console.warn;
 const logs=[];
 globalThis.fetch=async()=>{throw new TypeError('secret-value-must-not-appear');};
 console.warn=(...args)=>logs.push(args);
 try {
   const token=testJwt('authenticated');
   const response=await call('tools/call',{name:'list_worlds',arguments:{}},{authorization:'Bearer '+token});
   assert.equal(response.status,401);
   assert.equal(response.headers.get('x-lw-auth-failure'),'supabase_auth_unreachable');
   const transport=logs.find(([message])=>message==='LIVING WORLD Supabase Auth transport:');
   assert.ok(transport);
   assert.equal(transport[1].category,'type_error');
   assert.equal(transport[1].cause_code,null);
   assert.ok(transport[1].elapsed_ms>=0);
   assert.doesNotMatch(JSON.stringify(logs),/secret-value-must-not-appear/);
 } finally {
   globalThis.fetch=originalFetch;
   console.warn=originalWarn;
 }
});

test('Workers redirect compatibility: auth and RPC fetches never follow redirects',async()=>{
 const originalFetch=globalThis.fetch;
 const originalWarn=console.warn;
 const redirects=[];
 console.warn=()=>{};
 try {
   const token=testJwt('authenticated');
   globalThis.fetch=async (url,init)=>{
     redirects.push({url:String(url),redirect:init?.redirect});
     return new Response(null,{status:302,headers:{location:'https://example.com/should-not-follow'}});
   };
   const badAuth=await call('tools/call',{name:'list_worlds',arguments:{}},{authorization:'Bearer '+token});
   assert.equal(badAuth.status,401);
   assert.equal(badAuth.headers.get('x-lw-auth-failure'),'supabase_auth_302');
   assert.deepEqual(redirects.map(r=>r.redirect),['manual']);
   redirects.length=0;
   globalThis.fetch=async (url,init)=>{
     redirects.push({url:String(url),redirect:init?.redirect});
     if(String(url).endsWith('/auth/v1/user'))return Response.json({id:env.BRIDGE_SUPABASE_USER_ID});
     return new Response(null,{status:302,headers:{location:'https://example.com/should-not-follow'}});
   };
   const badRpc=await call('tools/call',{name:'list_worlds',arguments:{}},{authorization:'Bearer '+token});
   assert.equal(badRpc.status,200);
   const result=(await badRpc.json()).result;
   assert.equal(result.isError,true);
   assert.match(result.content[0].text,/Supabase отклонил запрос/);
   assert.deepEqual(redirects.map(r=>r.redirect),['manual','manual']);
 } finally {
   globalThis.fetch=originalFetch;
   console.warn=originalWarn;
 }
});

test('owner-authorized bridge write tool is listed only when enabled',async()=>{
 const enabled={...env,BRIDGE_WRITES_ENABLED:'true'};
 const r=await call('tools/list',{},{},enabled);
 assert.equal(r.status,200);
 const list=(await r.json()).result.tools.map(x=>x.name);
 assert.ok(list.includes('save_scene_package'));
 assert.ok(list.includes('save_scene_auto'));
 const health=await bridge.fetch(new Request(root+'/health'),enabled);
 assert.equal((await health.json()).writes_enabled,true);
 const turnedOff=await bridge.fetch(new Request(root+'/health'),env);
 assert.equal((await turnedOff.json()).writes_enabled,false);
});

test('companion MCP excludes invalidated branch purchases and reads precise ledger',async()=>{
 const original=globalThis.fetch;
 const sceneA={id:'10000000-0000-4000-8000-000000000001',parent_scene_id:null,world_time:'1998-09',prompt_note:packSceneNote({
  facts:[],open_threads:[],resolved_threads:[],offscreen_events:[],characters:[],
  economy:[{id:'initial',action:'opening',account:'Гарри',currency:'GALLEON',scale:0,amount:500,reason:'Наследство',source:'Банковская запись'}],
  items:[{id:'cloak',action:'acquire',item_id:'cloak01',label:'Мантия-невидимка',owner:'Гарри',reason:'Получил',source:'Сцена'}],new_characters:[]
 })};
 const sceneB={id:'10000000-0000-4000-8000-000000000002',parent_scene_id:sceneA.id,world_time:'1998-10',prompt_note:packSceneNote({
  facts:[],open_threads:[],resolved_threads:[],offscreen_events:[],characters:[],
  economy:[{id:'spent',action:'debit',account:'Гарри',currency:'GALLEON',scale:0,amount:90,reason:'Покупка',source:'Сцена'}],
  items:[{id:'gift',action:'gift',item_id:'cloak01',owner:'Гарри',recipient:'Лия',reason:'Подарил',source:'Сцена'}],new_characters:[]
 })};
 const other={id:'10000000-0000-4000-8000-000000000003',parent_scene_id:sceneA.id,world_time:'1998-10',prompt_note:packSceneNote({
  facts:[],open_threads:[],resolved_threads:[],offscreen_events:[],characters:[],
  economy:[{id:'different',action:'debit',account:'Гарри',currency:'GALLEON',scale:0,amount:400,reason:'Другая ветка',source:'Сцена'}],items:[],new_characters:[]
 })};
 const state={world:{id:worldId},branch:{id:branchId,head_scene_id:sceneB.id},characters:[],scenes:[]};
 globalThis.fetch=async url=>{
  const u=String(url);
  if(u.endsWith('/auth/v1/user'))return Response.json({id:env.BRIDGE_SUPABASE_USER_ID});
  if(u.endsWith('/rest/v1/rpc/lw_bridge_v2_state'))return Response.json(state);
  if(u.includes('/rest/v1/lw_scenes?'))return Response.json([sceneA,sceneB,other]);
  throw Error('Unexpected fetch '+u);
 };
 try{
  const res=await call('tools/call',{name:'get_companion_state',arguments:{world_id:worldId}},{authorization:'Bearer '+testJwt('authenticated')});
  assert.equal(res.status,200);
  const d=(await res.json()).result.structuredContent;
  assert.equal(d.complete,true);
  assert.equal(d.accounts.find(a=>a.person==='Гарри').balance,410);
  assert.equal(d.items.find(i=>i.id==='cloak01').owner,'Лия');
  assert.equal(d.scanned_scenes,2);
  assert.equal(d.audit.some(a=>a.reason==='Другая ветка'),false);
  const next=await call('tools/call',{name:'get_story_context',arguments:{world_id:worldId}},{authorization:'Bearer '+testJwt('authenticated')});
  const context=(await next.json()).result.structuredContent;
  assert.equal(context.companion.complete,true);
  assert.equal(context.companion.accounts[0].balance,410);
  assert.equal(context.branch.head_scene_id,sceneB.id);
  assert.equal(context.character_memory.complete,true);
  assert.ok(Array.isArray(context.character_memory.profiles));
  assert.equal(context.causal_memory.complete,true);
  assert.equal(context.causal_memory.counts.facts,0);
  const deep=await call('tools/call',{name:'get_causal_memory',arguments:{world_id:worldId,kind:'fact',limit:20}},{authorization:'Bearer '+testJwt('authenticated')});
  const summary=(await deep.json()).result.structuredContent;
  assert.equal(summary.complete,true);assert.equal(summary.total,0);
 }finally{globalThis.fetch=original;}
});

test('one-call autosave is forbidden unless owner opted in for this world',async()=>{
 const live={...env,BRIDGE_WRITES_ENABLED:'true'};
 const head=null;const requestId='10000000-0000-4000-8000-000000000090';
 let allow=false,writeCount=0,lastBody=null,savedRow=null;
 const prev=globalThis.fetch;
 globalThis.fetch=async (url,opts={})=>{
  const u=String(url);
  if(u.endsWith('/auth/v1/user'))return Response.json({id:env.BRIDGE_SUPABASE_USER_ID});
  if(u.endsWith('/rest/v1/rpc/lw_bridge_v2_state'))return Response.json({
   world:{id:worldId,name:'Сцена в мире',genesis_choices:{auto_save_enabled:allow}},
   branch:{id:branchId,head_scene_id:head}
  });
  if(u.includes('/rest/v1/lw_scenes?'))return Response.json(u.includes('id=eq.')&&savedRow?[savedRow]:[]);
  if(u.endsWith('/rest/v1/rpc/lw_bridge_v2_append')){
   writeCount++;lastBody=JSON.parse(opts.body);
   savedRow={id:lastBody.p_id,world_id:lastBody.p_world,branch_id:lastBody.p_branch,
    parent_scene_id:lastBody.p_head,body:lastBody.p_body,world_time:lastBody.p_time,prompt_note:lastBody.p_note};
   return Response.json(lastBody.p_id);
  }
  throw Error('Unexpected '+u);
 };
 const args={world_id:worldId,branch_id:branchId,expected_head:head,request_id:requestId,scene:'Гарри получил двадцать галеонов.',world_time:'1999-06',
  changes:{facts:['Гарри получил двадцать галеонов.'],economy:[{id:'money',action:'credit',account:'Гарри',currency:'GALLEON',amount:20,scale:0,reason:'Получил деньги',source:'В сцене передали двадцать галеонов'}],items:[],new_characters:[]}};
 try{
  const denied=await call('tools/call',{name:'save_scene_auto',arguments:args},{authorization:'Bearer '+testJwt('authenticated')},live);
  assert.equal((await denied.json()).result.isError,true);
  assert.equal(writeCount,0);
  allow=true;
  const allowed=await call('tools/call',{name:'save_scene_auto',arguments:args},{authorization:'Bearer '+testJwt('authenticated')},live);
  const data=(await allowed.json()).result.structuredContent;
  assert.equal(data.persisted,true);
  assert.equal(data.scene_id,requestId);
  assert.equal(lastBody.p_id,requestId);
  assert.equal(lastBody.p_time,'1999-06');
  assert.ok(lastBody.p_note.includes('GALLEON'));
  assert.equal(writeCount,1);
  const saved=await call('tools/call',{name:'get_scene_receipt',arguments:{world_id:worldId,request_id:requestId}},{authorization:'Bearer '+testJwt('authenticated')},live);
  const receipt=(await saved.json()).result.structuredContent;
  assert.equal(receipt.saved,true);
  assert.equal(receipt.scene_id,requestId);
  const repeated=await call('tools/call',{name:'save_scene_auto',arguments:args},{authorization:'Bearer '+testJwt('authenticated')},live);
  assert.equal((await repeated.json()).result.structuredContent.already_saved,true);
  assert.equal(writeCount,1);
  const changed=await call('tools/call',{name:'save_scene_auto',arguments:{...args,scene:'Совсем другая сцена.'}},{authorization:'Bearer '+testJwt('authenticated')},live);
  assert.equal((await changed.json()).result.isError,true);
  assert.equal(writeCount,1);
 } finally {globalThis.fetch=prev;}
});

test('source-document MCP retrieves full immutable revision in chunks and checks world rules before scene',async()=>{
 const prev=globalThis.fetch;
 const first={id:'10000000-0000-4000-8000-000000000091',world_id:worldId,doc_key:'rules',revision:1,category:'core_rules',title:'Правила мира',source_filename:'core.docx',sha256:'a'.repeat(64),content:'Гарри поступает в Хогвартс в восемнадцать лет. Правило о знаниях NPC.'};
 const glossary={id:'10000000-0000-4000-8000-000000000092',world_id:worldId,doc_key:'glossary',revision:1,category:'glossary',title:'Росмэн',source_filename:'rosman.docx',sha256:'b'.repeat(64),content:'Severus Snape | Снегг'};
 const branch={id:branchId,head_scene_id:null};
 const state={world:{id:worldId,world_rules:'Магия',genesis_choices:{}},branch,characters:[],scenes:[],has_older_scenes:false};
 globalThis.fetch=async (url)=>{
  const u=String(url);
  if(u.endsWith('/auth/v1/user'))return Response.json({id:env.BRIDGE_SUPABASE_USER_ID});
  if(u.endsWith('/rest/v1/rpc/lw_bridge_v2_state'))return Response.json(state);
  if(u.includes('/rest/v1/lw_scenes?'))return Response.json([]);
  if(u.includes('/rest/v1/lw_reference_docs?')){
   if(u.includes('doc_key=eq.rules'))return Response.json([first]);
   return Response.json([first,glossary]);
  }
  throw Error('Unexpected '+u);
 };
 try{
  const token={authorization:'Bearer '+testJwt('authenticated')};
  const cat=await call('tools/call',{name:'get_reference_catalog',arguments:{world_id:worldId}},token);
  const catalog=(await cat.json()).result.structuredContent;
  assert.equal(catalog.installed,true);assert.equal(catalog.manifest.length,2);
  const read=await call('tools/call',{name:'get_reference_document',arguments:{world_id:worldId,doc_key:'rules',revision:1,offset:0,limit:12}},token);
  const doc=(await read.json()).result.structuredContent;
  assert.equal(doc.content.length,12);assert.equal(doc.next_offset,12);assert.equal(doc.sha256,'a'.repeat(64));
  const pre=await call('tools/call',{name:'get_scene_preflight',arguments:{world_id:worldId,scene_intent:'Гарри говорит со Снеггом',actor_names:['Гарри']}},token);
  const result=(await pre.json()).result.structuredContent;
  assert.equal(result.documents.installed,true);
  assert.equal(result.documents.ready,true);
  assert.match(result.documents.selected.map(x=>x.full_text||x.excerpts).join(' '),/восемнадцать/);
  assert.equal(result.memory_coverage.complete,true);
 }finally{globalThis.fetch=prev;}
});

test('MCP reference-document writes require explicit opt-in and create immutable private revision',async()=>{
 const prev=globalThis.fetch;
 let allow=false,writes=0;
 const doc={world_id:worldId,doc_key:'core-rules-y1',category:'core_rules',title:'PROJECT CORE RULES',source_filename:'rules.docx',content:'Правило мира: магия не выдаёт автоматически знания персонажам.'};
 globalThis.fetch=async (url,opts={})=>{
  const u=String(url);
  if(u.endsWith('/auth/v1/user'))return Response.json({id:env.BRIDGE_SUPABASE_USER_ID});
  if(u.endsWith('/rest/v1/rpc/lw_bridge_v2_state'))return Response.json({world:{id:worldId,genesis_choices:{document_upload_enabled:allow}},branch:{id:branchId,head_scene_id:null},characters:[],scenes:[]});
  if(u.includes('/rest/v1/lw_reference_docs?'))return Response.json([]);
  if(u.endsWith('/rest/v1/lw_reference_docs')){writes++;const body=JSON.parse(opts.body);assert.equal(body.doc_key,'core-rules-y1');assert.match(body.sha256,/^[a-f0-9]{64}$/);return new Response(null,{status:201});}
  throw Error('Unexpected '+u);
 };
 const live={...env,BRIDGE_WRITES_ENABLED:'true'},headers={authorization:'Bearer '+testJwt('authenticated')};
 try{
  const denied=await call('tools/call',{name:'save_reference_document',arguments:doc},headers,live);
  assert.equal((await denied.json()).result.isError,true);assert.equal(writes,0);
  allow=true;
  const saved=await call('tools/call',{name:'save_reference_document',arguments:doc},headers,live);
  const result=(await saved.json()).result.structuredContent;
  assert.equal(result.persisted,true);assert.equal(result.revision,1);assert.equal(result.length,doc.content.length);assert.equal(writes,1);
 }finally{globalThis.fetch=prev;}
});


test('website diagnostic rejects other sites and does not accept unauthenticated callers',async()=>{
 const cfg={...env,BRIDGE_WRITES_ENABLED:'true'};
 const endpoint=root+'/api/diagnostics/save-test';
 const rejected=await bridge.fetch(new Request(endpoint,{method:'POST',headers:{origin:'https://attacker.example'}}),cfg);
 assert.equal(rejected.status,403);
 const preflight=await bridge.fetch(new Request(endpoint,{method:'OPTIONS',headers:{origin:'https://livingworld-35q.pages.dev','access-control-request-method':'POST'}}),cfg);
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('access-control-allow-origin'),'https://livingworld-35q.pages.dev');
 const unauth=await bridge.fetch(new Request(endpoint,{method:'POST',headers:{origin:'https://livingworld-35q.pages.dev'}}),cfg);
 assert.equal(unauth.status,401);
});

test('website diagnostic writes, retries, reads back, then deletes only its disposable world',async()=>{
 const tmp='10000000-0000-4000-8000-000000000101';
 const branch='10000000-0000-4000-8000-000000000102';
 const original=globalThis.fetch;
 let scene=null,head=null,writes=0,deleted=false,worldCreates=0;
 const cfg={...env,BRIDGE_WRITES_ENABLED:'true'};
 globalThis.fetch=async (raw,options={})=>{
  const url=String(raw);
  const method=options.method||'GET';
  if(url.endsWith('/auth/v1/user'))return Response.json({id:env.BRIDGE_SUPABASE_USER_ID});
  if(url.includes('/rest/v1/lw_worlds?select=id,name')&&method==='POST'){
   worldCreates++;return Response.json([{id:tmp,name:'Техническая проверка сейвов (временная)'}]);
  }
  if(url.includes('/rest/v1/lw_branches?select=id')&&method==='POST')return Response.json([{id:branch}]);
  if(url.includes('/rest/v1/lw_worlds?id=eq.')&&method==='PATCH')return Response.json([{id:tmp}]);
  if(url.includes('/rest/v1/lw_worlds?id=eq.')&&method==='DELETE'){
   assert.equal(url.includes(tmp),true);
   deleted=true;return Response.json([{id:tmp}]);
  }
  if(url.endsWith('/rest/v1/rpc/lw_bridge_v2_state'))
   return Response.json({world:{id:tmp,name:'Тест',genesis_choices:{auto_save_enabled:true}},
    branch:{id:branch,head_scene_id:head},characters:[],scenes:[]});
  if(url.includes('/rest/v1/lw_scenes?id=eq.'))return Response.json(scene?[scene]:[]);
  if(url.includes('/rest/v1/lw_scenes?world_id=eq.'))return Response.json(scene?[scene]:[]);
  if(url.endsWith('/rest/v1/rpc/lw_bridge_v2_append')){
   const payload=JSON.parse(options.body);
   writes++;
   scene={id:payload.p_id,world_id:payload.p_world,branch_id:payload.p_branch,
    parent_scene_id:payload.p_head,world_time:payload.p_time,
    prompt_note:payload.p_note,body:payload.p_body};
   head=scene.id;
   return Response.json(scene.id);
  }
  throw Error('Unexpected diagnostic fetch '+method+' '+url);
 };
 try{
  const token=testJwt('authenticated',{client_id:undefined});
  const response=await bridge.fetch(new Request(root+'/api/diagnostics/save-test',{
   method:'POST',headers:{origin:'https://livingworld-35q.pages.dev',
     authorization:'Bearer '+token}
  }),cfg);
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  const result=await response.json();
  assert.equal(result.ok,true);
  assert.equal(result.temporary_world_removed,true);
  assert.equal(result.receipt.balance,100);
  assert.equal(result.receipt.duplicate_prevented,true);
  assert.equal(result.receipt.scanned_scenes,1);
  assert.equal(writes,1);
  assert.equal(worldCreates,1);
  assert.equal(deleted,true);
 }finally{globalThis.fetch=original;}
});
