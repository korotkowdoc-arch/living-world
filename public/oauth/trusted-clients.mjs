/** Explicit per-client OAuth allowlist for the SHARED Supabase authorization UI.
 * Only registered client ID + exact redirect URI pairs are supported.
 * The original LIVING WORLD Bridge client remains unchanged.
 */
import {BRIDGE_OAUTH_CLIENT_ID,BRIDGE_OAUTH_REDIRECT_URI} from './bridge-config.js';

export const NEXT_OAUTH_CLIENT_ID='9ec1beb6-e638-432b-93fe-405e0bd01e53';
export const NEXT_OAUTH_REDIRECT_URI='https://chatgpt.com/connector/oauth/vcwt3WXJ1Lt0';

export const TRUSTED_OAUTH_CLIENTS=Object.freeze([
 Object.freeze({
  id:BRIDGE_OAUTH_CLIENT_ID,
  redirect_uri:BRIDGE_OAUTH_REDIRECT_URI,
  title:'Подключить LIVING WORLD к ChatGPT',
  description:'Этот клиент сможет читать миры прежнего LIVING WORLD через Bridge. Действуют ограничения записи прежнего Bridge.'
 }),
 Object.freeze({
  id:NEXT_OAUTH_CLIENT_ID,
  redirect_uri:NEXT_OAUTH_REDIRECT_URI,
  title:'Подключить LIVING WORLD NEXT к ChatGPT',
  description:'Этот клиент сможет читать миры LIVING WORLD NEXT и сохранять сцены, если в выбранном мире включено автосохранение. Старые миры Bridge ему недоступны.'
 })
]);

export function knownOAuthClient(details){
 if(!details||details.authorization_id==null||typeof details.redirect_uri!=='string')return null;
 return TRUSTED_OAUTH_CLIENTS.find(client=>client.id===details.client?.id&&client.redirect_uri===details.redirect_uri)||null;
}

export function isTrustedCallback(value){
 let target;
 try {target=new URL(value);}catch{return false;}
 if(target.protocol!=='https:'||target.username||target.password||target.hash)return false;
 return TRUSTED_OAUTH_CLIENTS.some(client=>{
  const expected=new URL(client.redirect_uri);
  return target.origin===expected.origin&&target.pathname===expected.pathname;
 });
}
