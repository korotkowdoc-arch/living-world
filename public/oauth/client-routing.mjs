/** OAuth routing for two deliberately distinct ChatGPT clients sharing one Supabase Auth server.
 * The old LIVING WORLD Bridge remains isolated. No wildcard or client-supplied redirect is trusted.
 */
import {BRIDGE_OAUTH_CLIENT_ID,BRIDGE_OAUTH_REDIRECT_URI} from './bridge-config.js';
export const NEXT_OAUTH_CLIENT_ID='9ec1beb6-e638-432b-93fe-405e0bd01e53';
export const NEXT_OAUTH_REDIRECT_URI='https://chatgpt.com/connector/oauth/vcwt3WXJ1Lt0';
export const NEXT_CONSENT_URL='https://living-world-next.pages.dev/oauth/consent.html';
const CLIENTS=[
 {id:BRIDGE_OAUTH_CLIENT_ID,callback:BRIDGE_OAUTH_REDIRECT_URI},
 {id:NEXT_OAUTH_CLIENT_ID,callback:NEXT_OAUTH_REDIRECT_URI}
];
const ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
export function nextConsentUrl(id){
 if(typeof id!=='string'||!ID_RE.test(id))throw Error('Некорректный OAuth-запрос.');
 return NEXT_CONSENT_URL+'?authorization_id='+encodeURIComponent(id);
}
export function validatedChatGPTCallback(raw){
 let destination;
 try{destination=new URL(raw);}catch{throw Error('Недопустимый адрес возврата.');}
 if(destination.protocol!=='https:'||destination.username||destination.password||destination.hash)
  throw Error('Недопустимый адрес возврата.');
 if(!CLIENTS.some(({callback})=>{
   const expected=new URL(callback);
   return destination.origin===expected.origin&&destination.pathname===expected.pathname;
 }))throw Error('Недопустимый адрес возврата.');
 if(!destination.searchParams.has('code')&&!destination.searchParams.has('error'))
  throw Error('Адрес возврата OAuth не содержит результата авторизации.');
 return destination.href;
}
export function routeOAuthDetails(details,requestId){
 if(typeof requestId!=='string'||!ID_RE.test(requestId))throw Error('Некорректный OAuth-запрос.');
 if(details?.redirect_url&&!details?.authorization_id)
  return {kind:'callback',url:validatedChatGPTCallback(details.redirect_url)};
 if(details?.authorization_id!==requestId)throw Error('Неизвестный OAuth-запрос.');
 if(details?.client?.id===NEXT_OAUTH_CLIENT_ID&&details.redirect_uri===NEXT_OAUTH_REDIRECT_URI)
  return {kind:'next',url:nextConsentUrl(requestId)};
 if(details?.client?.id===BRIDGE_OAUTH_CLIENT_ID&&details.redirect_uri===BRIDGE_OAUTH_REDIRECT_URI)
  return {kind:'bridge'};
 throw Error('Неизвестный OAuth-клиент или адрес возврата.');
}
