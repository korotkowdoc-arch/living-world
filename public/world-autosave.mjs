/** A hung request must become a visible error, never an indefinite inert switch. */
export async function withAutosaveDeadline(request,ms=15000){
 let timer;
 try{
  const timeout=new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(Error('Нет ответа Supabase. Проверь соединение, затем обнови список миров.')),ms);
  });
  return await Promise.race([Promise.resolve(request),timeout]);
 }finally{clearTimeout(timer);}
}
/** Owner-scoped autosave permission; scene content and Genesis stay untouched. */
export async function persistWorldAutosave({client,userId,worldId,enabled}){
 if(!client||!userId||!worldId||typeof enabled!=='boolean')
  throw Error('Нельзя изменить автосейв: не выбран мир или отсутствует авторизация.');
 const read=async(fields)=>{
  const result=await withAutosaveDeadline(client.from('lw_worlds').select(fields).eq('id',worldId).eq('owner_id',userId).single());
  if(result.error)throw result.error;
  if(!result.data||result.data.id!==worldId)throw Error('Выбранный мир не найден или недоступен.');
  return result.data;
 };
 const before=await read('id,owner_id,genesis_choices');
 const choices={...(before.genesis_choices||{}),auto_save_enabled:enabled};
 if(before.genesis_choices?.auto_save_enabled!==enabled){
  const result=await withAutosaveDeadline(client.from('lw_worlds').update({genesis_choices:choices})
   .eq('id',worldId).eq('owner_id',userId).select('id').single());
  if(result.error)throw result.error;
  if(result.data?.id!==worldId)throw Error('Supabase не подтвердил изменение нужного мира.');
 }
 const confirmed=await read('id,genesis_choices');
 if(confirmed.genesis_choices?.auto_save_enabled!==enabled)
  throw Error('Supabase не сохранил настройку автосейва. Действующее значение не изменилось.');
 return confirmed.genesis_choices;
}
