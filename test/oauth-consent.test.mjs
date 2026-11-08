import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/oauth/consent.js',import.meta.url),'utf8')
  .replace(/^import \{.*\} from '\.\/bridge-config\.js';/m,'')
  .replace("await import('https://esm.sh/@supabase/supabase-js@2')",'({createClient:mockCreateClient})');
const owner='fcd2996e-9daa-4fa5-842e-4263b8b48dfe';
const clientId='f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6';
const redirectUri='https://chatgpt.com/connector/oauth/3f5za3GcoasC';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function run({url='https://example.test/oauth/consent?authorization_id=trial',userId=owner,requestedClient=clientId,requestedRedirect=redirectUri,automaticRedirect,config=true}={}){
  const elements=Object.fromEntries(['setup','login','review','status','client','redirect','scopes','account','approve','deny','setup-form','login-form'].map(id=>[id,{hidden:true,disabled:false,textContent:'',listeners:{},addEventListener(type,handler){this.listeners[type]=handler;}}]));
  const redirects=[];
  const auth={
    getUser:async()=>({data:{user:{id:userId,email:'owner@example.test'}}}),
    oauth:{
      getAuthorizationDetails:async()=>({data:automaticRedirect?{redirect_url:automaticRedirect}:{authorization_id:'trial',client:{id:requestedClient,name:'LIVING WORLD Bridge MCP'},redirect_uri:requestedRedirect,scope:'email'}}),
      approveAuthorization:async()=>({data:{redirect_url:redirectUri+'?code=test&state=trial'}}),
      denyAuthorization:async()=>({data:{redirect_url:redirectUri+'?error=access_denied&state=trial'}})
    }
  };
  const context={
    URL, FormData, console,
    BRIDGE_OAUTH_CLIENT_ID:clientId,BRIDGE_OAUTH_REDIRECT_URI:redirectUri,BRIDGE_OWNER_USER_ID:owner,
    document:{querySelector:s=>elements[s.slice(1)]},
    location:{href:url,assign:u=>redirects.push(u)},
    localStorage:{getItem:()=>config?JSON.stringify({url:'https://project.supabase.co',key:'sb_publishable_test'}):null},
    mockCreateClient:()=>({auth})
  };
  vm.runInNewContext(source,context);
  await tick();
  return {elements,redirects,click:async name=>{await elements[name].listeners.click();await tick();}};
}

test('consent cannot be shown without an authorization request',async()=>{
  const {elements}=await run({url:'https://example.test/oauth/consent'});
  assert.match(elements.status.textContent,/OAuth-запрос/);
  assert.equal(elements.review.hidden,true);
});
test('owner, client and exact callback must all match before approval',async()=>{
  for(const alteration of [{userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{requestedClient:'other-client'},{requestedRedirect:'https://chatgpt.com/connector/oauth/another'}]){
    const {elements,redirects}=await run(alteration);
    assert.equal(elements.review.hidden,true);
    assert.equal(redirects.length,0);
  }
});
test('valid request shows consent and redirects on approval',async()=>{
  const result=await run();
  assert.equal(result.elements.review.hidden,false);
  assert.match(result.elements.client.textContent,/LIVING WORLD Bridge MCP/);
  await result.click('approve');
  assert.equal(result.redirects[0],redirectUri+'?code=test&state=trial');
});
test('automatic redirect cannot leave registered callback',async()=>{
  const {elements,redirects}=await run({automaticRedirect:'https://chatgpt.com/connector/oauth/other?code=malicious'});
  assert.match(elements.status.textContent,/Недопустимый адрес/);
  assert.equal(redirects.length,0);
});
