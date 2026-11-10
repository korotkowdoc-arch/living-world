/**
 * Human-directed/GPT-assisted retroactive extraction of past scene memories.
 * The source scene is NEVER rewritten. Every quote and evidence span must occur
 * literally in the immutable scene body; annotations remain interpretations.
 */
export const RETRO_INDEX_FORMAT='LW_RETRO_MEMORY_V1';
export const RETRO_INDEX_KEY_PREFIX='retro-memory-';
const clean=(v,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
const okUuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){4}$/i.test(v);
const arr=v=>Array.isArray(v)?v:[];
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const name=v=>clean(v,120);
export function retroKey(sceneId){
 if(!okUuid(sceneId))throw Error('Нужен ID исходной сцены.');
 return RETRO_INDEX_KEY_PREFIX+sceneId.toLowerCase();
}
export function validateRetroAnnotations(sourceBody,entries=[]){
 if(typeof sourceBody!=='string'||!sourceBody.trim())throw Error('Оригинальный текст сцены недоступен.');
 if(!Array.isArray(entries)||entries.length>25)throw Error('Не более 25 воспоминаний из одной сцены.');
 const keys=new Set(),out=[];
 for(const [i,e] of entries.entries()){
  if(!isObj(e))throw Error('Аннотация '+i+' должна быть объектом.');
  if(typeof e.id!=='string'||!/^[a-z0-9_-]{1,80}$/i.test(e.id)||keys.has(e.id))
   throw Error('У ретровоспоминания должен быть уникальный короткий ID.');
  keys.add(e.id);
  if(!['joke','quote','promise','gift','secret','shared_memory','conflict','relationship','event','other'].includes(e.kind))
   throw Error('Неизвестный тип воспоминания.');
  const evidence=clean(e.evidence,900),quote=clean(e.quote,600);
  if(!evidence||!sourceBody.includes(evidence))throw Error('evidence должен дословно присутствовать в исходной сцене.');
  if(quote&&!sourceBody.includes(quote))throw Error('quote должен дословно присутствовать в исходной сцене.');
  if(!name(e.title)||!clean(e.detail,1800))throw Error('Нужны название и описание воспоминания.');
  const participants=arr(e.participants);
  if(!Array.isArray(e.participants??[])||participants.some(x=>!name(x)||x.length>120)||participants.length>20)
   throw Error('participants должен содержать до 20 имён.');
  const knowing=arr(e.known_by);
  if(!Array.isArray(e.known_by??[])||knowing.length>20)throw Error('known_by должен быть массивом доказанных каналов знаний.');
  const known_by=knowing.map(k=>{
   if(!isObj(k)||!name(k.actor)||!clean(k.channel,220)||!clean(k.evidence,700)||
    !sourceBody.includes(k.evidence))throw Error('Для известности факта нужен актор, канал и дословное подтверждение из исходной сцены.');
   return {actor:name(k.actor),channel:clean(k.channel,220),evidence:clean(k.evidence,700)};
  });
  const tags=arr(e.tags);
  if(!Array.isArray(e.tags??[])||tags.length>20||tags.some(x=>!clean(x,80)||x.length>80))
   throw Error('Некорректные ключевые слова воспоминания.');
  out.push({id:e.id,kind:e.kind,title:clean(e.title,180),
   detail:clean(e.detail,1800),evidence,quote,
   emotional_context:clean(e.emotional_context,700),
   participants:[...new Set(participants.map(name))],
   known_by,known_by_names:known_by.map(k=>k.actor),
   tags:[...new Set(tags.map(t=>clean(t,80)))],
   certainty:'reviewed_annotation_not_independent_canon'});
 }
 return out;
}
export function makeRetroIndex({worldId,scene,head,entries,digest}){
 if(!okUuid(worldId)||!okUuid(head)||!okUuid(scene?.id)||!clean(digest,100))
  throw Error('Нужны валидные ID и контрольная сумма исходной сцены.');
 const validated=validateRetroAnnotations(scene.body,entries);
 const content={format:RETRO_INDEX_FORMAT,world_id:worldId,
  source_scene_id:scene.id,source_scene_time:scene.world_time,
  source_digest:digest,created_at_head:head,
  entries:validated,classification:'reviewed_annotations_with_literal_source_evidence'};
 return {key:retroKey(scene.id),title:'Воспоминания · '+scene.id,
  category:'other',content:JSON.stringify(content),count:validated.length};
}
export function parseRetroIndex(doc){
 if(!doc?.doc_key?.startsWith(RETRO_INDEX_KEY_PREFIX))return null;
 try{
  const data=JSON.parse(doc.content||'');
  if(data.format!==RETRO_INDEX_FORMAT||!okUuid(data.world_id)||!okUuid(data.source_scene_id)||
    data.source_scene_id.toLowerCase()!==doc.doc_key.slice(RETRO_INDEX_KEY_PREFIX.length).toLowerCase()||
    !Array.isArray(data.entries)||!data.source_digest)return null;
  return data;
 }catch{return null;}
}
export function activeRetroMemories(docs=[],validSceneIds=[],worldId){
 const ids=new Set(validSceneIds);
 return docs.flatMap(doc=>{
  const index=parseRetroIndex(doc);
  if(!index||index.world_id!==worldId||!ids.has(index.source_scene_id))return [];
  return index.entries.map(e=>({
   ...e,scene_id:index.source_scene_id,world_time:index.source_scene_time,
   source_digest:index.source_digest,document_key:doc.doc_key,
   evidence_type:'literal_quote_or_excerpt',knowledge_scope:e.known_by.length?'supported_channels':'unknown',
   interpretation_not_world_truth:true
  }));
 });
}
export function searchRetroMemories(memories=[],{query='',actor_names=[],limit=20}={}){
 const norm=v=>clean(v).normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е');
 const tokens=norm(query).split(/\s+/).filter(x=>x.length>1);
 const names=arr(actor_names).map(norm);
 const filtered=memories.filter(m=>{
  if(names.length&&!names.some(n=>[...arr(m.participants),...arr(m.known_by_names)].map(norm).includes(n)))return false;
  const content=norm([m.title,m.detail,m.evidence,m.quote,m.emotional_context,...arr(m.tags)].join(' '));
  return tokens.every(t=>content.includes(t));
 });
 return {total:filtered.length,items:filtered.slice(0,limit)};
}
export function retroIndexCoverage(scenes=[],docs=[],worldId){
 const eligible=new Set(scenes.map(s=>s.id));
 const indexed=new Set(docs.map(parseRetroIndex).filter(x=>x?.world_id===worldId&&eligible.has(x.source_scene_id))
  .map(x=>x.source_scene_id));
 const needs=scenes.filter(s=>!indexed.has(s.id)).map(s=>({scene_id:s.id,world_time:s.world_time,
  already_structured:typeof s.prompt_note==='string'&&s.prompt_note.startsWith('LWSTATE1:')}));
 return {source_scene_count:scenes.length,indexed_scene_count:indexed.size,
  remaining_count:needs.length,pending:needs};
}
