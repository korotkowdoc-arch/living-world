import {projectCompanion,formatAmount} from './world-ledger.mjs';
import {projectCharacterMemory} from './world-character-memory.mjs';
import {projectCausalMemory} from './world-causality.mjs';
import {readSceneNote} from './continuity.mjs';
import {projectWorldDepth} from './world-depth.mjs';

export const STAGE_CONTROL_KEY='story-stage-control-v2';
export const STAGE_CONTROL_FORMAT='LW_STAGE_CONTROL_V2';
export const CHAT_CHECKPOINT_FORMAT='LW_CHAT_CHECKPOINT_V2';
export const STAGE_YEAR_FORMAT='LW_STAGE_YEAR_V2';
export const MEMORY_KINDS=['joke','quote','promise','gift','secret','shared_memory','conflict','relationship','event','other'];
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str=(v,n=5000)=>typeof v==='string'?v.trim().slice(0,n):'';
const norm=v=>str(v).normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
const arr=v=>Array.isArray(v)?v:[];
const source=s=>({scene_id:s.id,world_time:s.world_time??null});
const read=s=>readSceneNote(s.prompt_note)?.delta||s.changes||{};
const isId=v=>typeof v==='string'&&id.test(v);
const citation=s=>'`'+s.id+'` ('+str(s.world_time||'дата неизвестна',50)+')';

/** A stage is bounded by scene ancestry, NEVER by January 1st or a school timetable. */
export function stageScenes(lineage,stage,head=null){
 if(!Array.isArray(lineage))throw Error('История не загружена.');
 const headIndex=head===null?lineage.length-1:lineage.findIndex(s=>s.id===head);
 if(headIndex<0&&lineage.length)throw Error('Конечная сцена не находится в валидной ветке.');
 const boundary=stage?.start_after_scene_id??null;
 const start=boundary===null?-1:lineage.findIndex(s=>s.id===boundary);
 if(boundary!==null&&start<0)throw Error('Начало этапа аннулировано правкой. Нужно заново определить границу.');
 if(start>headIndex)throw Error('Начало этапа позже его конца.');
 return lineage.slice(start+1,headIndex+1);
}
export function normalizeStageControl(data){
 if(!data||data.format!==STAGE_CONTROL_FORMAT||!isId(data.world_id)||
  (data.source_head!==null&&!isId(data.source_head)))
  throw Error('Некорректный документ состояния сюжетных этапов.');
 if(data.open_stage!==null&&data.open_stage!==undefined){
  const a=data.open_stage;
  if(!isId(a.id)||!str(a.title,120)||(a.start_after_scene_id!==null&&!isId(a.start_after_scene_id)))
   throw Error('Некорректен открытый сюжетный этап.');
 }
 if(!Array.isArray(data.closed_stages))throw Error('Неверная история закрытых этапов.');
 return data;
}
export function chooseStageControl(rows=[],lineage=[],worldId){
 const ancestry=new Set(lineage.map(s=>s.id));
 const compatible=row=>{
  try{
   const state=normalizeStageControl(JSON.parse(row.content));
   if(state.world_id!==worldId)return null;
   if(state.source_head!==null&&!ancestry.has(state.source_head))return null;
   if(state.open_stage?.start_after_scene_id&&!ancestry.has(state.open_stage.start_after_scene_id))return null;
   return state;
  }catch{return null;}
 };
 const sorted=[...rows].sort((a,b)=>Number(b.revision||0)-Number(a.revision||0));
 const latest=sorted.length?Number(sorted[0].revision):0;
 for(const row of sorted){
  const active=compatible(row);
  if(active)return {state:{...active,closed_stages:arr(active.closed_stages).filter(c=>
   isId(c.end_scene_id)&&ancestry.has(c.end_scene_id)&&
   (!c.start_after_scene_id||ancestry.has(c.start_after_scene_id)))},
   latest_revision:latest,selected_revision:row.revision,
   stale_revision:row.revision!==latest};
 }
 return {state:{format:STAGE_CONTROL_FORMAT,world_id:worldId,source_head:null,
  branch_id:null,open_stage:null,closed_stages:[]},
  latest_revision:latest,selected_revision:null,stale_revision:latest>0};
}
export function stageYearMetadata(doc){
 if(doc?.category!=='year_document')return null;
 const text=String(doc.content||'');
 const match=text.match(/^LW_STAGE_YEAR_V2:\s*(\{[^\n]*\})$/m);
 if(!match)return null;
 try{
  const m=JSON.parse(match[1]);
  return m.format===STAGE_YEAR_FORMAT&&isId(m.world_id)&&isId(m.stage_id)&&isId(m.end_scene_id)?m:null;
 }catch{return null;}
}
export function validStageYearDocs(docs,control,lineage,worldId){
 const ids=new Set(lineage.map(s=>s.id));
 const completed=arr(control?.closed_stages);
 return docs.filter(doc=>{
  const meta=stageYearMetadata(doc);
  if(!meta)return true;
  return meta.world_id===worldId&&ids.has(meta.end_scene_id)&&
   completed.some(c=>c.id===meta.stage_id&&c.end_scene_id===meta.end_scene_id&&c.doc_key===doc.doc_key);
 });
}
export function validateSceneMemories(memories=[],sceneBody=''){
 if(memories===undefined)return [];
 if(!Array.isArray(memories)||memories.length>16)throw Error('changes.memories: не более 16 записей на сцену.');
 const found=new Set();
 return memories.map((m,i)=>{
  if(!m||typeof m!=='object'||Array.isArray(m))throw Error('memories['+i+']: требуется объект.');
  const mid=str(m.id,80),kind=str(m.kind,30),title=str(m.title,180),detail=str(m.detail,1800),quote=str(m.quote,600);
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(mid)||found.has(mid)||!MEMORY_KINDS.includes(kind)||!title||!detail)
   throw Error('memories['+i+']: укажи уникальный id, kind, title и detail.');
  if(quote&&!String(sceneBody).includes(quote))
   throw Error('memories['+i+'].quote не совпадает с буквальной репликой в этой сцене.');
  found.add(mid);
  const people={};
  for(const key of ['participants','known_by','tags']){
   const vals=arr(m[key]);
   if(!Array.isArray(m[key]??[])||vals.length>20||vals.some(x=>typeof x!=='string'||!x.trim()||x.length>100))
    throw Error('memories['+i+'].'+key+': массив до 20 коротких строк.');
   people[key]=[...new Set(vals.map(x=>x.trim()))];
  }
  const emotional_context=str(m.emotional_context,700);
  if(m.emotional_context&&m.emotional_context.length>700)throw Error('Слишком длинный эмоциональный контекст.');
  const related_to=str(m.related_to,80);
  if(related_to&&!/^[a-zA-Z0-9_-]{1,80}$/.test(related_to))throw Error('Некорректная связанная запись.');
  return {id:mid,kind,title,detail,quote,emotional_context,
   participants:people.participants,known_by:people.known_by,tags:people.tags,related_to};
 });
}
/** The event's source scene and factual limits travel with the memory. */
export function indexStoryMemories(scenes=[]){
 const output=[];
 for(const scene of scenes){
  const delta=read(scene);
  for(const memory of arr(delta.memories)){
   if(!memory||!str(memory.title)||!str(memory.detail))continue;
   output.push({...memory,scene_id:scene.id,world_time:scene.world_time??null,
    evidence:'structured_scene_memory',knowledge_scope:arr(memory.known_by).length?'explicit':'unknown'});
  }
 }
 return output;
}
export function searchStoryMemories(scenes,{query='',actor_names=[],kind=null,limit=20}={}){
 const indexed=indexStoryMemories(scenes);
 const tokens=norm(query).split(' ').filter(t=>t.length>1);
 const names=arr(actor_names).map(norm).filter(Boolean);
 const filtered=indexed.filter(m=>{
  if(kind&&m.kind!==kind)return false;
  const available=[...arr(m.participants),...arr(m.known_by)].map(norm);
  if(names.length&&!names.some(n=>available.includes(n)))return false;
  const corpus=norm([m.title,m.detail,m.quote,m.emotional_context,...arr(m.tags),...available].join(' '));
  return !tokens.length||tokens.every(t=>corpus.includes(t));
 });
 return {total:filtered.length,items:filtered.slice(-Math.min(100,Math.max(1,limit))).reverse(),
  note:'known_by — только прямо зафиксированное знание. Отсутствие имени не доказывает, что персонаж ничего не знает. Проверяй первичную сцену.'};
}
function projectionAt(scenes,characters){
 const people=projectCharacterMemory(characters||[],scenes,{getDelta:read});
 const assets=projectCompanion(scenes,{getDelta:read,strict:false});
 const causal=projectCausalMemory(scenes,{getDelta:read});
 const depth=projectWorldDepth(scenes,{getDelta:read});
 const issues=[...assets.issues,...people.warnings,...causal.warnings];
 return {people,assets,causal,depth,issues};
}
function sceneRecord(scene){
 const delta=read(scene);
 return {...source(scene),structured:!!readSceneNote(scene.prompt_note),
  changes:{facts:arr(delta.facts),open_threads:arr(delta.open_threads),
   resolved_threads:arr(delta.resolved_threads),offscreen_events:arr(delta.offscreen_events),
   characters:arr(delta.characters),economy:arr(delta.economy),items:arr(delta.items),
   new_characters:arr(delta.new_characters),memories:arr(delta.memories),
   psychology:arr(delta.psychology),relationships:arr(delta.relationships),
   recollections:arr(delta.recollections),npc_offscreen:arr(delta.npc_offscreen),
   npc_intentions:arr(delta.npc_intentions)}};
}
function makeSnapshot({world,branch,lineage,characters,stage,kind,handoff_note='',evidence_scene_ids=[]}){
 if(!world?.id||branch?.head_scene_id!==lineage.at(-1)?.id)throw Error('Снимок требует полную текущую ветку.');
 const selected=stageScenes(lineage,stage);
 if(!selected.length)throw Error('В текущем этапе нет сыгранных сцен.');
 const {people,assets,causal,depth,issues}=projectionAt(lineage,characters);
 const notes=str(handoff_note,20000);
 const proofs=arr(evidence_scene_ids);
 if(notes&&!proofs.length)throw Error('Для заметок перехода укажи ID сыгранных сцен, на которых они основаны.');
 const ids=new Set(lineage.map(s=>s.id));
 if(proofs.some(x=>!ids.has(x)))throw Error('Заметка ссылается на сцену вне действующей ветки.');
 const allScenes=selected.map(sceneRecord),latest=lineage.slice(-3);
 const recent_full_scenes=latest.map(s=>{
  const body=typeof s.body==='string'?s.body:null;
  return {scene_id:s.id,world_time:s.world_time,text:body&&body.length<=65000?body:null,
   text_available:!!body,read_full_by_id:body&&body.length>65000?true:!body,
   body_length:body?.length??null};
 });
 return {format:kind,world_id:world.id,world_name:world.name,branch_id:branch.id,
  source_head:branch.head_scene_id,world_time:lineage.at(-1).world_time,
  stage:{id:stage?.id??null,title:stage?.title||'Текущий незакрытый этап',
   start_after_scene_id:stage?.start_after_scene_id??null,scene_count:selected.length},
  scope:'Подтверждённая действующая цепочка, а не видимое окно текущего чата',
  source_scene_ids:selected.map(s=>s.id),
  scanned_world_scenes:lineage.length,
  causal_facts:causal.facts,causal_offscreen_events:causal.offscreen_events,
  causal_warnings:causal.warnings,resource_warnings:assets.issues,
  character_warnings:people.warnings,depth_warnings:depth.warnings,
  chronology:allScenes,
  open_threads:causal.open_threads,resolved_threads:causal.resolved_threads,
  characters:people.characters.map(c=>({
   name:c.name,origin:c.origin,initial:c.initial,state:c.state,introduced_scene_id:c.introduced_scene_id,
   knowledge:c.knowledge,beliefs:c.beliefs,history:c.history
  })),
  accounts:assets.accounts.map(a=>({person:a.person,currency:a.currency,scale:a.scale,
   known:a.known,balance:a.balance,observed_delta:a.observed_delta,
   entries:a.entries})),
  items:assets.items.map(i=>({id:i.id,label:i.label,owner:i.owner,holder:i.holder,
   location:i.location,condition:i.condition,exists:i.exists,history:i.history})),
  introduced_people:assets.new_characters,
  story_memories:indexStoryMemories(selected),
  character_psychology:depth.psychology,
  relationship_memory:depth.relationships,
  subjective_recollections:depth.recollections,
  confirmed_npc_offscreen:depth.confirmed_offscreen,
  unfulfilled_npc_intentions:depth.npc_intentions,
  recent_full_scenes,
  handoff_note:notes?{text:notes,evidence_scene_ids:proofs,
   classification:'narrative_interpretation_verified_sources_not_an_independent_fact'}:null,
  missing_structured_consequences:selected.filter(s=>!readSceneNote(s.prompt_note)).map(s=>s.id),
  issues,
  retrieval:'При старой отсылке ищи в search_story_memories, затем читай точную сцену через get_story_scene. Присутствие и знания разных персонажей НЕ совпадают автоматически.'
 };
}
export function buildChatCheckpoint({world,branch,lineage,characters=[],stage=null,handoff_note='',evidence_scene_ids=[]}={}){
 const snapshot=makeSnapshot({world,branch,lineage,characters,stage,kind:CHAT_CHECKPOINT_FORMAT,
  handoff_note,evidence_scene_ids});
 const content=JSON.stringify(snapshot);
 if(content.length>700000)throw Error('Checkpoint превышает допустимый размер: нельзя молча обрезать память. Сохрани более короткий этап или скорректируй объём структурированных событий.');
 return {key:'chat-checkpoint-'+branch.id,title:'CHECKPOINT · '+snapshot.stage.title+' · '+snapshot.world_time,
  content,category:'checkpoint',source_head:snapshot.source_head,
  scene_count:snapshot.stage.scene_count,
  missing_structured_consequences:snapshot.missing_structured_consequences.length};
}
export function buildStoryYear({world,branch,lineage,characters=[],stage}={}){
 if(!stage?.id||!stage.title)throw Error('Нужен именованный игровой этап.');
 const snapshot=makeSnapshot({world,branch,lineage,characters,stage,kind:STAGE_YEAR_FORMAT});
 const p={format:STAGE_YEAR_FORMAT,world_id:world.id,stage_id:stage.id,title:stage.title,
  start_after_scene_id:stage.start_after_scene_id??null,
  end_scene_id:branch.head_scene_id,scene_count:snapshot.stage.scene_count};
 const lines=[
  '# YEAR DOCUMENT · '+str(stage.title,120),
  'LW_STAGE_YEAR_V2: '+JSON.stringify(p),
  '',
  '> Закрытый сюжетный этап (не календарный год). Создан по команде владельца. События взяты только из валидных сцен. Старые версии после «На это:» не признаются текущим каноном.',
  '',
  '## Границы и контроль',
  '- Последняя сцена: '+citation(lineage.at(-1)),
  '- Сцен в этапе: '+snapshot.stage.scene_count,
  '- Сцен без структурированных последствий: '+snapshot.missing_structured_consequences.length,
  '',
  '## События и их последствия',
  ...snapshot.chronology.map(s=>'### `'+s.scene_id+'` ('+str(s.world_time,40)+')\n'+
   (JSON.stringify(s.changes)==='{}'?'Полные последствия не структурированы; открой исходную сцену.':
    'Подтверждённые изменения: '+JSON.stringify(s.changes))+
   (s.structured?'':'\nБез структурированного пакета: читать оригинальный текст по ID.')),
  '',
  '## Совместные воспоминания, отсылки, шутки, обещания и секреты',
  ...(snapshot.story_memories.length?snapshot.story_memories.map(m=>
   '- **'+str(m.title,180)+'** ['+m.kind+'] — '+str(m.detail,1800)+
   (m.quote?'\n  - Точная фраза: «'+str(m.quote,600)+'»':'')+
   (m.emotional_context?'\n  - Эмоциональный контекст: '+str(m.emotional_context,700):'')+
   '\n  - Участники: '+arr(m.participants).join(', ')+
   '\n  - Точно знают: '+(arr(m.known_by).join(', ')||'не установлено')+
   '\n  - Источник: `'+m.scene_id+'` ('+str(m.world_time,40)+')'
  ):['Пока нет размеченных воспоминаний. Это НЕ означает, что герои ничего не помнят: перечитай исходные сцены.']),
  '',
  '## Открытые обещания и линии',
  ...snapshot.open_threads.map(x=>'- '+x.text+' (открыта: `'+x.opened_scene_id+'`)'),
  '',
  '## Закрытые обязательства',
  ...snapshot.resolved_threads.map(x=>'- '+x.text+' (`'+x.last_scene_id+'`)'),
  '',
  '## Развитие персонажей, их знания и убеждения',
  ...snapshot.characters.map(c=>'### '+str(c.name,120)+'\n'+
   'Текущее состояние: '+JSON.stringify(c.state)+
   '\nПодтверждённые знания и каналы: '+JSON.stringify(c.knowledge)+
   '\nСубъективные убеждения: '+JSON.stringify(c.beliefs)+
   '\nИстория изменений с источниками: '+JSON.stringify(c.history)),
  '',
  '## Психология и внутренние противоречия',
  ...snapshot.character_psychology.map(p=>'### '+str(p.name,120)+'\\nАктуальные аспекты: '+JSON.stringify(p.aspects)+'\\nИстория: '+JSON.stringify(p.observations)),
  '',
  '## Направленные отношения с несколькими одновременными чувствами',
  ...snapshot.relationship_memory.map(r=>'### '+str(r.from,120)+' → '+str(r.to,120)+'\\nАспекты: '+JSON.stringify(r.dimensions)+'\\nСобытия: '+JSON.stringify(r.history)),
  '',
  '## Индивидуальное восприятие воспоминаний',
  ...snapshot.subjective_recollections.map(r=>'- '+str(r.actor,120)+': '+JSON.stringify(r)),
  '',
  '## NPC: подтверждённые события вне кадра',
  ...snapshot.confirmed_npc_offscreen.map(e=>'- '+JSON.stringify(e)),
  '',
  '## NPC: намерения, а не факты',
  ...snapshot.unfulfilled_npc_intentions.map(e=>'- '+JSON.stringify(e)),
  '',
  '## Предметы и денежные ресурсы',
  ...snapshot.items.map(x=>'- '+str(x.label,150)+' ('+x.id+'): '+JSON.stringify(x)),
  ...snapshot.accounts.map(x=>'- '+x.person+' / '+x.currency+': '+JSON.stringify(x)),
  '',
  '## Первичные сцены',
  ...snapshot.source_scene_ids.map(s=>'- `'+s+'` — точный полный текст хранится отдельно и доступен через get_story_scene.'),
  '',
  '## Ограничения',
  '- Все незаписанные нюансы можно восстановить только по оригинальным сценам; отсутствие отметки не является доказательством отсутствия события.',
  '- Записи "known_by" не распространяют сведения автоматически на других персонажей.',
  '- Изменение прежних фактов на последующих этапах не стирает исторические события этого этапа.',
  ''
 ];
 const content=lines.join('\n');
 if(content.length>700000)throw Error('Year Document слишком большой. Не обрезай события; нужна сегментированная выгрузка этапа.');
 return {key:'year-stage-'+stage.id,title:'YEAR DOCUMENT · '+stage.title,
  content,category:'year_document',source_head:branch.head_scene_id,
  scene_count:snapshot.stage.scene_count,
  missing_structured_consequences:snapshot.missing_structured_consequences.length,
  stage_metadata:p};
}
export function parseCheckpointDoc(doc){
 if(doc?.category!=='checkpoint')return null;
 try{
  const body=JSON.parse(String(doc.content||''));
  return body?.format===CHAT_CHECKPOINT_FORMAT&&isId(body.source_head)&&isId(body.world_id)?body:null;
 }catch{return null;}
}
export function chooseCheckpoint(docs=[],lineage=[],worldId){
 const index=new Map(lineage.map((s,i)=>[s.id,i]));
 const candidates=docs.map(d=>({doc:d,body:parseCheckpointDoc(d)}))
  .filter(x=>x.body?.world_id===worldId&&index.has(x.body.source_head));
 candidates.sort((a,b)=>index.get(b.body.source_head)-index.get(a.body.source_head));
 return candidates[0]||null;
}
