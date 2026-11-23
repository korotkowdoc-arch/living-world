import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIDGE_OAUTH_CLIENT_ID,BRIDGE_OAUTH_REDIRECT_URI} from '../public/oauth/bridge-config.js';
import {NEXT_OAUTH_CLIENT_ID,NEXT_OAUTH_REDIRECT_URI,NEXT_CONSENT_URL,nextConsentUrl,validatedChatGPTCallback,routeOAuthDetails} from '../public/oauth/client-routing.mjs';
const id='aBcDef0123456789gHIjklmNoPqrsTuv';
test('old Bridge consent stays on its original path',()=>{
 assert.notEqual(BRIDGE_OAUTH_CLIENT_ID,NEXT_OAUTH_CLIENT_ID);
 assert.notEqual(BRIDGE_OAUTH_REDIRECT_URI,NEXT_OAUTH_REDIRECT_URI);
 const route=routeOAuthDetails({authorization_id:id,client:{id:BRIDGE_OAUTH_CLIENT_ID},redirect_uri:BRIDGE_OAUTH_REDIRECT_URI},id);
 assert.deepEqual(route,{kind:'bridge'});
 assert.equal(validatedChatGPTCallback(BRIDGE_OAUTH_REDIRECT_URI+'?code=abc&state=123'),BRIDGE_OAUTH_REDIRECT_URI+'?code=abc&state=123');
});
test('new NEXT consent is safely and automatically routed to its own origin',()=>{
 const route=routeOAuthDetails({authorization_id:id,client:{id:NEXT_OAUTH_CLIENT_ID},redirect_uri:NEXT_OAUTH_REDIRECT_URI},id);
 assert.deepEqual(route,{kind:'next',url:NEXT_CONSENT_URL+'?authorization_id='+id});
 assert.equal(nextConsentUrl(id),route.url);
});
test('already-approved NEXT OAuth can return to its registered ChatGPT callback',()=>{
 const dest=NEXT_OAUTH_REDIRECT_URI+'?code=ok&state=123';
 assert.deepEqual(routeOAuthDetails({redirect_url:dest},id),{kind:'callback',url:dest});
 assert.equal(validatedChatGPTCallback(dest),dest);
});
test('unregistered clients and cross-redirect claims stay blocked',()=>{
 const cases=[
 {authorization_id:id,client:{id:NEXT_OAUTH_CLIENT_ID},redirect_uri:BRIDGE_OAUTH_REDIRECT_URI},
 {authorization_id:id,client:{id:BRIDGE_OAUTH_CLIENT_ID},redirect_uri:NEXT_OAUTH_REDIRECT_URI},
 {authorization_id:id,client:{id:'another'},redirect_uri:NEXT_OAUTH_REDIRECT_URI},
 {authorization_id:'wrong-id',client:{id:NEXT_OAUTH_CLIENT_ID},redirect_uri:NEXT_OAUTH_REDIRECT_URI}
 ];
 for(const details of cases)assert.throws(()=>routeOAuthDetails(details,id));
});
test('invalid redirects are not followed, even after consent',()=>{
 for(const url of [
 'https://chatgpt.com.evil.example/connector/oauth/vcwt3WXJ1Lt0?code=x',
 'https://chatgpt.com/connector/oauth/not-ours?code=x',
 NEXT_OAUTH_REDIRECT_URI+'#fragment',
 NEXT_OAUTH_REDIRECT_URI,
 'https://user:pass@chatgpt.com/connector/oauth/vcwt3WXJ1Lt0?code=x',
 'javascript:alert(1)',
 'http://chatgpt.com/connector/oauth/vcwt3WXJ1Lt0?code=x'
 ])assert.throws(()=>validatedChatGPTCallback(url),url);
 assert.throws(()=>nextConsentUrl('../bad'));
});
