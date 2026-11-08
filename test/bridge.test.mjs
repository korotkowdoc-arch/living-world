import assert from 'node:assert/strict';
import test from 'node:test';
import bridge from '../bridge/index.js';

const root='https://living-world-bridge-mcp.korotkowdoc.workers.dev';
const env={
  BRIDGE_MODE:'live',
  BRIDGE_PUBLIC_URL:root+'/mcp',
  SUPABASE_URL:'https://bcwzlsljcxubqtvzsucz.supabase.co',
  SUPABASE_OAUTH_CLIENT_ID:'f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6',
  BRIDGE_SUPABASE_USER_ID:'0a3fbf41-c3c6-4743-a88c-f9a7870fd244',
  SUPABASE_PUBLISHABLE_KEY:'public-test-value'
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
 assert.deepEqual(d.tools.map(t=>t.name),['list_worlds','get_world_state','get_branch_history']);
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
