import test from 'node:test';
import assert from 'node:assert/strict';
import bridge from '../bridge/index.js';
import {aiStatus,aiGenerate} from '../public/ai-client.mjs';

const root='https://living-world-bridge-mcp.korotkowdoc.workers.dev';
const origin='https://livingworld-35q.pages.dev';
const user='0a3fbf41-c3c6-4743-a88c-f9a7870fd244';
const world_id='e02d2b6e-9d47-4ccf-a848-5bdad729ae78';
const branch_id='d53a867a-f4b5-40c1-854c-614e66d9e5ba';
const env={BRIDGE_MODE:'live',BRIDGE_PUBLIC_URL:root+'/mcp',SUPABASE_URL:'https://bcwzlsljcxubqtvzsucz.supabase.co',BRIDGE_SUPABASE_USER_ID:user,SUPABASE_OAUTH_CLIENT_ID:'f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6',SUPABASE_PUBLISHABLE_KEY:'test-public',OPENAI_API_KEY:'secret-server-only'};
function jwt(){
 const now=Math.floor(Date.now()/1000);
 return [{alg:'HS256',typ:'JWT'},{iss:env.SUPABASE_URL+'/auth/v1',sub:user,role:'authenticated',aud:'authenticated',iat:now-60,exp:now+3600},{sig:true}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
}
const request=(path,method='GET',body=null,headers={})=>new Request(root+path,{
 method,headers:{origin,...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined
});
const freshWorld={id:world_id,owner_id:user,name:'Испытание',genre:'Фэнтези',premise:'Магия',world_rules:'Нет канонических рельсов',history:'',timeline:'',clock_start:'1989-07',genesis_choices:{current_period:'1989-07'},genesis_approved:true,active_branch_id:branch_id,model_story:'gpt-6',model_relationships:'gpt-5.6'};
const branch={id:branch_id,world_id,head_scene_id:null};
const chars=[{name:'Гарри',role:'hero',description:'Ребёнок',health:'Здоров',goals:'Свобода',knowledge:'Не знает тайну'}];
const packet={scene:'Гарри вышел во двор и встретил нового соседа.',world_time:'1989-07',changes:{facts:['Гарри встретил нового соседа'],open_threads:[],resolved_threads:[],offscreen_events:[],characters:[]}};
test('API CORS and disabled state never expose secrets',async()=>{
 const noKey={...env,OPENAI_API_KEY:undefined};
 const denied=await bridge.fetch(request('/api/ai/status','GET',null,{origin:'https://other.example'}),env);
 assert.equal(denied.status,403);
 const allowed=await bridge.fetch(request('/api/ai/status'),noKey);
 assert.equal(allowed.status,200);
 assert.equal((await allowed.json()).enabled,false);
 assert.equal(allowed.headers.get('access-control-allow-origin'),origin);
 const disabled=await bridge.fetch(request('/api/ai/generate','POST',{kind:'scene',world_id}),noKey);
 assert.equal(disabled.status,503);
 const preflight=await bridge.fetch(request('/api/ai/generate','OPTIONS'),env);
 assert.equal(preflight.status,204);
 const missingAuth=await bridge.fetch(request('/api/ai/generate','POST',{kind:'scene',world_id}),env);
 assert.equal(missingAuth.status,401);
});
test('one-click generated scene reads owner state, calls selected API model, and commits via atomic RPC',async()=>{
 const previous=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (input,opts={})=>{
  const url=String(input);calls.push({url,method:opts.method,body:opts.body,headers:opts.headers});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:user});
  if(url.includes('/rest/v1/lw_worlds?'))return Response.json([freshWorld]);
  if(url.includes('/rest/v1/lw_branches?'))return Response.json([branch]);
  if(url.includes('/rest/v1/lw_characters?'))return Response.json(chars);
  if(url.includes('/rest/v1/rpc/lw_recent_scenes'))return Response.json([]);
  if(url.endsWith('/v1/responses'))return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(packet)}]}],usage:{input_tokens:1000,output_tokens:100}});
  if(url.includes('/rest/v1/rpc/lw_append_scene'))return Response.json('scene-id-success');
  throw Error('unexpected '+url);
 };
 try{
  const res=await bridge.fetch(request('/api/ai/generate','POST',{kind:'scene',world_id,mode:'story',length:'normal'},{authorization:'Bearer '+jwt()}),env);
  assert.equal(res.status,200,await res.clone().text());
  const data=await res.json();
  assert.equal(data.scene_id,'scene-id-success');
  assert.equal(data.model,'gpt-6-astra');
  const api=calls.find(x=>x.url.endsWith('/v1/responses'));
  const body=JSON.parse(api.body);
  assert.equal(body.model,'gpt-6-astra');
  assert.equal(body.reasoning.effort,'high');
  assert.equal(body.store,false);
  assert.equal(api.headers.authorization,'Bearer secret-server-only');
  assert.equal(calls.filter(x=>x.url.includes('lw_append_scene')).length,1);
  assert.ok(!JSON.stringify(data).includes('secret-server-only'));
 }finally{globalThis.fetch=previous;}
});
test('invalid AI scene never calls save RPC',async()=>{
 const previous=globalThis.fetch;const calls=[];
 globalThis.fetch=async (url)=>{
  url=String(url);calls.push(url);
  if(url.endsWith('/auth/v1/user'))return Response.json({id:user});
  if(url.includes('/rest/v1/lw_worlds?'))return Response.json([freshWorld]);
  if(url.includes('/rest/v1/lw_branches?'))return Response.json([branch]);
  if(url.includes('/rest/v1/lw_characters?'))return Response.json(chars);
  if(url.includes('/rest/v1/rpc/lw_recent_scenes'))return Response.json([]);
  if(url.endsWith('/v1/responses'))return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not valid JSON'}]}]});
  throw Error('unexpected '+url);
 };
 try{
  const res=await bridge.fetch(request('/api/ai/generate','POST',{world_id},{authorization:'Bearer '+jwt()}),env);
  assert.equal(res.status,422);
  assert.equal(calls.some(x=>x.includes('lw_append_scene')),false);
 }finally{globalThis.fetch=previous;}
});
test('browser client status and scene call use bearer but no OpenAI secret',async()=>{
 const fetchMock=async (_url,options)=>Response.json(options?.method==='POST'?{ok:true,scene_id:'1'}:{ok:true,enabled:true});
 assert.equal((await aiStatus(fetchMock)).enabled,true);
 const result=await aiGenerate({access_token:'test-jwt'},{kind:'scene',world_id},fetchMock);
 assert.equal(result.scene_id,'1');
});
