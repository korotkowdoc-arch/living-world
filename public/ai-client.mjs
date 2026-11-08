/** Authenticated AI generation client. API key never enters browser storage or requests. */
export const AI_GATEWAY='https://living-world-bridge-mcp.korotkowdoc.workers.dev/api/ai';
export async function aiStatus(fetchImpl=fetch){
 try{
  const response=await fetchImpl(AI_GATEWAY+'/status',{method:'GET',cache:'no-store'});
  if(!response.ok)return {enabled:false,reason:'AI-шлюз пока не опубликован.'};
  const payload=await response.json();
  return {enabled:payload.enabled===true,reason:payload.enabled?'':'В Cloudflare Worker ещё не настроен секрет OPENAI_API_KEY.'};
 }catch{return {enabled:false,reason:'Не удалось связаться с AI-шлюзом.'};}
}
export async function aiGenerate(session,payload,fetchImpl=fetch){
 const token=session?.access_token;
 if(typeof token!=='string'||!token)throw Error('Сначала войди в LIVING WORLD.');
 const response=await fetchImpl(AI_GATEWAY+'/generate',{
  method:'POST',
  headers:{'authorization':'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify(payload),
  cache:'no-store'
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.ok)throw Error(data?.error||'Не удалось автоматически создать сцену. Проверь подключение и состояние мира.');
 return data;
}