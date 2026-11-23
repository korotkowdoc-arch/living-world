import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIDGE_OAUTH_CLIENT_ID,BRIDGE_OAUTH_REDIRECT_URI} from '../public/oauth/bridge-config.js';
import {NEXT_OAUTH_CLIENT_ID,NEXT_OAUTH_REDIRECT_URI,TRUSTED_OAUTH_CLIENTS,knownOAuthClient,isTrustedCallback} from '../public/oauth/trusted-clients.mjs';

test('legacy and NEXT each have independent known registered OAuth identities',()=>{
 assert.equal(TRUSTED_OAUTH_CLIENTS.length,2);
 assert.notEqual(NEXT_OAUTH_CLIENT_ID,BRIDGE_OAUTH_CLIENT_ID);
 assert.notEqual(NEXT_OAUTH_REDIRECT_URI,BRIDGE_OAUTH_REDIRECT_URI);
 for(const entry of TRUSTED_OAUTH_CLIENTS){
  const result=knownOAuthClient({authorization_id:'123',client:{id:entry.id},redirect_uri:entry.redirect_uri});
  assert.equal(result?.id,entry.id);
  assert.equal(isTrustedCallback(entry.redirect_uri+'?code=abc&state=xyz'),true);
 }
});
test('a new client cannot claim an old client redirect or an untrusted origin',()=>{
 assert.equal(knownOAuthClient({authorization_id:'123',client:{id:NEXT_OAUTH_CLIENT_ID},redirect_uri:BRIDGE_OAUTH_REDIRECT_URI}),null);
 assert.equal(knownOAuthClient({authorization_id:'123',client:{id:BRIDGE_OAUTH_CLIENT_ID},redirect_uri:NEXT_OAUTH_REDIRECT_URI}),null);
 assert.equal(knownOAuthClient({authorization_id:'123',client:{id:'unknown'},redirect_uri:NEXT_OAUTH_REDIRECT_URI}),null);
 assert.equal(isTrustedCallback('https://chatgpt.com.evil.example/connector/oauth/vcwt3WXJ1Lt0'),false);
 assert.equal(isTrustedCallback('https://chatgpt.com/connector/oauth/not-registered'),false);
 assert.equal(isTrustedCallback('https://user:pass@chatgpt.com/connector/oauth/vcwt3WXJ1Lt0'),false);
 assert.equal(isTrustedCallback('https://chatgpt.com/connector/oauth/vcwt3WXJ1Lt0#unexpected'),false);
});
