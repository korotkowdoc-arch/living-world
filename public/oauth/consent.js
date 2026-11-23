import {BRIDGE_OAUTH_CLIENT_ID,BRIDGE_OAUTH_REDIRECT_URI,BRIDGE_SUPABASE_URL,BRIDGE_OWNER_USER_ID} from './bridge-config.js';
const $=selector=>document.querySelector(selector);
const id=new URL(location.href).searchParams.get('authorization_id');
const cfgKey='lw_cloud_config_v03';
let client,details,user;
function show(section,message){for(const item of ['setup','login','review'])$('#'+item).hidden=item!==section;$('#status').textContent=message;}
function redirect(url){const target=new URL(url),expected=new URL(BRIDGE_OAUTH_REDIRECT_URI);if(target.origin!==expected.origin||target.pathname!==expected.pathname||target.username||target.password||target.hash)throw Error('Недопустимый адрес возврата.');location.assign(target.href);}
function publicKey(key){if(key.startsWith('sb_publishable_'))return true;try{const parts=key.split('.');return parts.length===3&&JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{return false;}}
async function initialize(){
 if(!id||!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!BRIDGE_OAUTH_CLIENT_ID||!BRIDGE_OWNER_USER_ID)throw Error('OAuth-запрос или публичная конфигурация не готовы.');
 let config;try{config=JSON.parse(localStorage.getItem(cfgKey)||'null');}catch{}
 if(!config){$('#setup-form').elements.url.value=BRIDGE_SUPABASE_URL;show('setup','Подключи существующий проект Supabase.');return;}
 if(config.url!==BRIDGE_SUPABASE_URL||!publicKey(config.key))throw Error('Публичное подключение Supabase некорректно.');
 const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
 client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const response=await client.auth.getUser();
 if(response.error||!response.data.user){show('login','Войди в существующий аккаунт владельца.');return;}
 user=response.data.user;
 if(user.id!==BRIDGE_OWNER_USER_ID)throw Error('Этот аккаунт не является владельцем Bridge.');
 const result=await client.auth.oauth.getAuthorizationDetails(id);
 if(result.error||!result.data)throw Error('Supabase отклонил запрос авторизации'+(result.error?errorDetails(result.error):' (пустой ответ)'));
 details=result.data;
 if(details.redirect_url&&!details.authorization_id){redirect(details.redirect_url);return;}
 if(details.authorization_id!==id||details.client?.id!==BRIDGE_OAUTH_CLIENT_ID)throw Error('Неизвестный OAuth-клиент.');
 if(details.redirect_uri!==BRIDGE_OAUTH_REDIRECT_URI)throw Error('Неизвестный redirect URI.');
 $('#client').textContent=(details.client.name||'ChatGPT')+' · '+details.client.id;
 $('#redirect').textContent=details.redirect_uri;
 $('#scopes').textContent=details.scope||'email';
 $('#account').textContent=user.email||user.id;
 show('review','Проверь запрос и выбери действие.');
}
async function decision(action){
 $('#approve').disabled=$('#deny').disabled=true;
 try {const result=await (action==='approve'?client.auth.oauth.approveAuthorization(id):client.auth.oauth.denyAuthorization(id));
  if(result.error||!result.data?.redirect_url)throw Error();redirect(result.data.redirect_url);
 }catch{$('#status').textContent='Не удалось обработать запрос. Начни подключение заново.';$('#approve').disabled=$('#deny').disabled=false;}
}
$('#setup-form').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);localStorage.setItem(cfgKey,JSON.stringify({url:String(data.get('url')).replace(/\/$/,''),key:String(data.get('key'))}));initialize().catch(fail);});
// Диагностика: успешный пароль не должен выдавать ошибку «не удалось войти»
// из-за следующего независимого этапа — проверки запроса OAuth.
function errorDetails(error){
 const code=typeof error?.code==='string'?' ('+error.code.slice(0,60)+')':'';
 const status=Number.isInteger(error?.status)?' [HTTP '+error.status+']':'';
 const message=typeof error?.message==='string'?error.message.slice(0,220):'Нет подробностей';
 return status+code+': '+message;
}
$('#login-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.currentTarget;
 const values=new FormData(form);
 show('login','Шаг 1/2: проверяю email и пароль в Supabase…');
 try {
   const result=await client.auth.signInWithPassword({email:String(values.get('email')),password:String(values.get('password'))});
   form.querySelector('[name=password]').value='';
   if(result.error)throw result.error;
   if(!result.data?.user||!result.data?.session?.access_token)throw Error('Supabase не вернул активную сессию.');
 } catch(error) {
   form.querySelector('[name=password]').value='';
   show('login','Шаг 1/2 — ошибка входа Supabase'+errorDetails(error));
   return;
 }
 show('login','Шаг 1/2 — вход успешен. Шаг 2/2: проверяю OAuth-запрос…');
 try {await initialize();}
 catch(error){show('login','Шаг 1/2 — вход успешен. Шаг 2/2 — ошибка OAuth'+errorDetails(error));}
});
$('#approve').addEventListener('click',()=>decision('approve'));
$('#deny').addEventListener('click',()=>decision('deny'));
function fail(error){show(null,error.message||'Не удалось проверить запрос.');}
initialize().catch(fail);
