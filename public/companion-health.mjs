import {readSceneNote} from './continuity.mjs';

/** Diagnostic snapshot from owner-authorized Supabase records, never from ChatGPT claims.
 * This does NOT prove a particular chat has reconnected its OAuth plugin.
 */
export function companionHealth({world=null,branch=null,recentScenes=[],documents=[],documentsReady=false,
 assets=null,assetIssue=null,checkedAt=null}={}){
 if(!world)return {ready:false,checks:[],recent:[],warnings:['Мир не выбран.']};
 const head=branch?.head_scene_id||null;
 const visible=Array.isArray(recentScenes)?recentScenes:[];
 const last=visible.at(-1)||null;
 const aligned=head===null||last?.id===head;
 const autoSave=world.genesis_choices?.auto_save_enabled===true;
 const categories=new Set((documents||[]).map(d=>d.category));
 const core=categories.has('core_rules'),glossary=categories.has('glossary');
 const archive=categories.has('year_document'),checkpoint=categories.has('checkpoint');
 const latest=visible.slice(-12).reverse().map(scene=>{
  const note=readSceneNote(scene.prompt_note);
  const delta=note?.delta||null;
  return {
   scene_id:scene.id,world_time:scene.world_time,model:scene.model||'не указан',
   body_length:typeof scene.body==='string'?scene.body.length:null,
   has_structured_consequences:!!delta,
   fact_count:Array.isArray(delta?.facts)?delta.facts.length:0,
   character_updates:Array.isArray(delta?.characters)?delta.characters.length:0,
   resource_changes:(delta?.items?.length||0)+(delta?.economy?.length||0),
   active_head:scene.id===head
  };
 });
 const checks=[
  {id:'supabase',label:'Supabase и действующая ветка',status:branch?'ok':'error',
   detail:branch?'Ветка '+(branch.name||branch.id):'Активная ветка отсутствует'},
  {id:'head',label:'Последняя сцена',status:aligned?'ok':'error',
   detail:!head?'Сцен пока нет':aligned?'Голова ветки совпадает с последней загруженной сценой':'Сцена и голова ветки расходятся'},
  {id:'autosave',label:'Разрешение автосохранения',status:autoSave?'ok':'warning',
   detail:autoSave?'Включено':'Выключено владельцем мира'},
  {id:'sources',label:'Правила мира',status:!documentsReady?'error':core?'ok':'warning',
   detail:!documentsReady?'Библиотека недоступна':core?'Основной документ загружен':'Нет основного документа правил'},
  {id:'glossary',label:'Глоссарий',status:glossary?'ok':'info',
   detail:glossary?'Загружен':'Необязателен, если мир без специальной терминологии'},
  {id:'replay',label:'Причинная память и предметы',status:assetIssue?'error':!assets?'info':assets.issues?.length?'warning':'ok',
   detail:assetIssue||(!assets?'Полная сверка ещё не запускалась':assets.issues?.length?
    'Есть несогласованные записи: '+assets.issues.length:'Сверено '+assets.scanned_scenes+' сцен')},
  {id:'archive',label:'Годовые архивы и checkpoint',status:archive&&checkpoint?'ok':'info',
   detail:'Годовые документы: '+(archive?'есть':'пока нет')+'; checkpoint: '+(checkpoint?'есть':'пока нет')}
 ];
 const warnings=checks.filter(c=>c.status==='error'||c.status==='warning').map(c=>c.label+': '+c.detail);
 return {ready:!warnings.length,world_id:world.id,branch_id:branch?.id||null,head_scene_id:head,
  auto_save_enabled:autoSave,last_verified_at:checkedAt,recent:latest,checks,warnings,
  oauth_chat_verified:false,
  oauth_note:'Проверка PWA подтверждает только Supabase. OAuth-доступ конкретного чата нужно проверять командой get_sync_health из ChatGPT.'};
}
