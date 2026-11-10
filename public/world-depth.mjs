/**
 * Long-term, provenance-backed psychological and social memory.
 * Observations and actor interpretations never become omniscient world facts.
 * Works only on valid scene ancestry; no GPT API or autonomous fiction.
 */
export const PSYCHOLOGY_ASPECTS=Object.freeze(['trait','value','fear','desire','habit','boundary','coping','trigger','self_image','inner_conflict','motivation']);
export const RELATION_DIMENSIONS=Object.freeze(['trust','respect','affection','irritation','fear','attraction','loyalty','resentment','comfort','jealousy','solidarity','distance']);
export const RELATION_SHIFTS=Object.freeze(['increased','decreased','unchanged','ambivalent','emerged']);
export const INTERPRETATION_TYPES=Object.freeze(['explicit','interpretation']);
const OFFSCREEN_STATUSES=Object.freeze(['narrated','witnessed','reported']);
const field=(value,max=1000)=>typeof value==='string'?value.trim().slice(0,max):'';
const name=value=>field(value,120);
const key=value=>field(value).normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
const safeArray=value=>Array.isArray(value)?value:[];
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const requireText=(value,fieldName,max=1000)=>{
 if(typeof value!=='string'||!value.trim()||value.length>max)
  throw Error(fieldName+': требуется непустой текст до '+max+' символов.');
 return value.trim();
};
const validatedId=(v,fieldName)=>{
 if(typeof v!=='string'||!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(v))throw Error(fieldName+': некорректный id.');
 return v;
};
const uniqueRecords=(records,tag,max)=>{
 if(records===undefined)return [];
 if(!Array.isArray(records)||records.length>max)throw Error(tag+': нужен массив до '+max+' записей.');
 const seen=new Set();
 return records.map((record,i)=>{
  if(!isObject(record))throw Error(tag+'['+i+']: нужен объект.');
  const id=validatedId(record.id,tag+'['+i+']');
  if(seen.has(id))throw Error(tag+': повторяющийся id '+id+'.');
  seen.add(id);return record;
 });
};
const proof=(text,excerpt,ref)=>{
 const evidence=requireText(excerpt,ref+'.evidence',700);
 if(typeof text!=='string'||!text.includes(evidence))
  throw Error(ref+'.evidence не является точным фрагментом сохраняемой сцены.');
 return evidence;
};
const requireEnum=(v,allowed,ref)=>{
 if(!allowed.includes(v))throw Error(ref+': неизвестное значение '+String(v));
 return v;
};
const allShort=(value,ref)=>{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>20||value.some(x=>typeof x!=='string'||!x.trim()||x.length>120))
  throw Error(ref+': до 20 непустых строк по 120 символов.');
 return [...new Set(value.map(x=>x.trim()))];
};
const maybeAt=v=>{
 if(v==null||v==='')return '';
 if(typeof v!=='string'||!/^[0-9]{4}-(0[1-9]|1[0-2])(-[0-3][0-9](T[0-2][0-9]:[0-5][0-9](:[0-5][0-9])?)?)?$/.test(v))
  throw Error('Некорректное время события вне кадра.');
 return v;
};

/** Validate new deep-memory scene changes against VERBATIM source text.
 * Inferred psychology stays labelled inferred and does not overwrite explicit words.
 */
export function validateDepthDelta(changes={},sceneText=''){
 if(!isObject(changes))throw Error('Последствия должны быть объектом.');
 const psychology=uniqueRecords(changes.psychology,'psychology',25).map((r,i)=>{
  const ref='psychology['+i+']';
  return {id:r.id,character:requireText(r.character,ref+'.character',120),
   aspect:requireEnum(r.aspect,PSYCHOLOGY_ASPECTS,ref+'.aspect'),
   observation:requireText(r.observation,ref+'.observation',1500),
   interpretation:field(r.interpretation,1400),
   certainty:requireEnum(r.certainty,INTERPRETATION_TYPES,ref+'.certainty'),
   evidence:proof(sceneText,r.evidence,ref),
   tension_with:field(r.tension_with,600)};
 });
 const relationships=uniqueRecords(changes.relationships,'relationships',30).map((r,i)=>{
  const ref='relationships['+i+']';
  const from=requireText(r.from,ref+'.from',120),to=requireText(r.to,ref+'.to',120);
  if(key(from)===key(to))throw Error(ref+': отношение к себе не считается отношением к другому.');
  return {id:r.id,from,to,
   dimension:requireEnum(r.dimension,RELATION_DIMENSIONS,ref+'.dimension'),
   shift:requireEnum(r.shift,RELATION_SHIFTS,ref+'.shift'),
   interpretation:requireEnum(r.interpretation,INTERPRETATION_TYPES,ref+'.interpretation'),
   rationale:requireText(r.rationale,ref+'.rationale',1500),
   evidence:proof(sceneText,r.evidence,ref),
   unresolved:!!r.unresolved};
 });
 const recollections=uniqueRecords(changes.recollections,'recollections',20).map((r,i)=>{
  const ref='recollections['+i+']';
  return {id:r.id,actor:requireText(r.actor,ref+'.actor',120),
   memory_id:validatedId(r.memory_id,ref+'.memory_id'),
   meaning:requireText(r.meaning,ref+'.meaning',1500),
   emotion:field(r.emotion,250),
   certainty:requireEnum(r.certainty,INTERPRETATION_TYPES,ref+'.certainty'),
   evidence:proof(sceneText,r.evidence,ref)};
 });
 const npc_offscreen=uniqueRecords(changes.npc_offscreen,'npc_offscreen',15).map((r,i)=>{
  const ref='npc_offscreen['+i+']';
  return {id:r.id,actor:requireText(r.actor,ref+'.actor',120),
   happened_at:maybeAt(r.happened_at),
   location:field(r.location,200),
   event:requireText(r.event,ref+'.event',1200),
   basis:requireEnum(r.basis,OFFSCREEN_STATUSES,ref+'.basis'),
   evidence:proof(sceneText,r.evidence,ref),
   known_by:allShort(r.known_by,ref+'.known_by')};
 });
 const npc_intentions=uniqueRecords(changes.npc_intentions,'npc_intentions',20).map((r,i)=>{
  const ref='npc_intentions['+i+']';
  return {id:r.id,actor:requireText(r.actor,ref+'.actor',120),
   plan:requireText(r.plan,ref+'.plan',1100),
   motive:requireText(r.motive,ref+'.motive',900),
   obstacle:field(r.obstacle,900),
   evidence:proof(sceneText,r.evidence,ref),
   status:'intention_not_completed'};
 });
 return {psychology,relationships,recollections,npc_offscreen,npc_intentions};
}
export function depthSemanticWarnings(delta={},priorMemoryIds=[]){
 const warnings=[],known=new Set(priorMemoryIds);
 for(const m of safeArray(delta.memories))if(m?.id)known.add(m.id);
 for(const e of safeArray(delta.recollections)){
  if(!known.has(e.memory_id))warnings.push({code:'MEMORY_REFERENCE_UNKNOWN',
   severity:'warning',id:e.id,actor:e.actor,memory_id:e.memory_id,
   detail:'Отсылка пока не имеет подтверждённого memory_id в действующей ветке. Проверь источник или используй ретроиндекс.'});
 }
 for(const event of safeArray(delta.npc_offscreen))
  if(event.basis==='reported'&&!safeArray(event.known_by).length)
   warnings.push({code:'OFFSCREEN_REPORT_WITHOUT_WITNESS',severity:'warning',
    id:event.id,detail:'Сообщение о событии вне кадра не устанавливает, кто его узнал.'});
 return warnings;
}
const take=(obj,fields)=>Object.fromEntries(fields.map(k=>[k,obj[k]]));
const ref=(scene,entry)=>({...entry,scene_id:scene.id,world_time:scene.world_time??null});
const read=s=>s.changes??s.delta??{};

/** Fold ordered confirmed scene deltas, including contradictory viewpoints.
 * No numeric "affection score" and no false reconciliation of opposing feelings.
 */
export function projectWorldDepth(scenes=[],{getDelta}={}){
 const get=getDelta||read,people=new Map(),links=new Map(),recollections=[],offscreen=[],plans=[],warnings=[];
 const actor=v=>{
  const k=key(v);if(!people.has(k))people.set(k,{name:v,observations:[],aspects:{},latest_emotions:[]});
  return people.get(k);
 };
 for(const scene of scenes){
  const delta=get(scene)||{};
  for(const e of safeArray(delta.psychology)){
   if(!e?.character||!PSYCHOLOGY_ASPECTS.includes(e.aspect))continue;
   const p=actor(e.character),event=ref(scene,e);
   p.observations.push(event);
   // A newer interpretation must not silently erase an explicitly observed trait.
   const old=p.aspects[e.aspect];
   if(!old||e.certainty==='explicit'||old.certainty!=='explicit')p.aspects[e.aspect]=event;
  }
  for(const e of safeArray(delta.relationships)){
   if(!e?.from||!e?.to||!RELATION_DIMENSIONS.includes(e.dimension))continue;
   const code=JSON.stringify([key(e.from),key(e.to)]),entry=links.get(code)||{
    from:e.from,to:e.to,history:[],dimensions:{},conflicts:[]
   };
   const event=ref(scene,e);
   const previous=entry.dimensions[e.dimension];
   if(previous?.shift!==event.shift&&previous?.scene_id!==event.scene_id)
    entry.conflicts.push({dimension:e.dimension,previous_scene_id:previous.scene_id,current_scene_id:event.scene_id,
     from:previous.shift,to:event.shift,meaning:'Изменение отношений требует учитывать оба события.'});
   entry.history.push(event);entry.dimensions[e.dimension]=event;links.set(code,entry);
  }
  for(const e of safeArray(delta.recollections)){
   if(!e?.actor||!e?.memory_id)continue;
   const event=ref(scene,e);recollections.push(event);
   actor(e.actor).latest_emotions.push(event);
  }
  for(const e of safeArray(delta.npc_offscreen))if(e?.actor&&e?.event)offscreen.push(ref(scene,e));
  for(const e of safeArray(delta.npc_intentions))if(e?.actor&&e?.plan)plans.push(ref(scene,e));
 }
 return {complete:true,scanned_scenes:scenes.length,psychology:Array.from(people.values()),
  relationships:Array.from(links.values()),recollections,confirmed_offscreen:offscreen,
  npc_intentions:plans,warnings};
}
export function actorDepth(ledger,actorNames=[],{maxHistory=100}={}){
 const wanted=new Set(actorNames.map(key));
 return {
  psychology:ledger.psychology.filter(a=>wanted.has(key(a.name))).map(p=>({...p,
   observations:p.observations.slice(-maxHistory),latest_emotions:p.latest_emotions.slice(-maxHistory)})),
  relationships:ledger.relationships.filter(l=>wanted.has(key(l.from))||wanted.has(key(l.to)))
   .map(l=>({...l,history:l.history.slice(-maxHistory)})),
  recollections:ledger.recollections.filter(r=>wanted.has(key(r.actor))).slice(-maxHistory),
  confirmed_offscreen:ledger.confirmed_offscreen.filter(r=>wanted.has(key(r.actor))).slice(-maxHistory),
  npc_intentions:ledger.npc_intentions.filter(r=>wanted.has(key(r.actor))).slice(-maxHistory)
 };
}
export function compareWorldBranches(left=[],right=[],{getDelta}={}){
 const readDelta=getDelta||read;let i=0;
 while(i<left.length&&i<right.length&&left[i].id===right[i].id)i++;
 const divergentLeft=left.slice(i),divergentRight=right.slice(i);
 const leftDepth=projectWorldDepth(left,{getDelta:readDelta}),rightDepth=projectWorldDepth(right,{getDelta:readDelta});
 const facts=s=>new Set(s.flatMap(sc=>safeArray((readDelta(sc)||{}).facts)));
 const lFacts=facts(left),rFacts=facts(right);
 const difference=(a,b)=>[...a].filter(x=>!b.has(x));
 const relationKey=l=>key(l.from)+'→'+key(l.to),dimensionDiff=[];
 const lMap=new Map(leftDepth.relationships.map(l=>[relationKey(l),l]));
 const rMap=new Map(rightDepth.relationships.map(l=>[relationKey(l),l]));
 for(const k of new Set([...lMap.keys(),...rMap.keys()])){
  const old=lMap.get(k),now=rMap.get(k);
  for(const dim of new Set([...Object.keys(old?.dimensions||{}),...Object.keys(now?.dimensions||{})])){
   const before=old?.dimensions[dim]||null,after=now?.dimensions[dim]||null;
   if(before?.scene_id!==after?.scene_id||before?.shift!==after?.shift)
    dimensionDiff.push({between:k,dimension:dim,was:before,now:after});
  }
 }
 return {common_prefix_scenes:i,
  fork_after_scene_id:i?left[i-1].id:null,
  previous_branch_tail:divergentLeft.map(s=>({scene_id:s.id,world_time:s.world_time})),
  current_branch_tail:divergentRight.map(s=>({scene_id:s.id,world_time:s.world_time})),
  invalidated_facts:difference(lFacts,rFacts),
  new_facts:difference(rFacts,lFacts),
  relationship_changes:dimensionDiff,
  old_memory_ids:divergentLeft.flatMap(s=>safeArray(readDelta(s).memories).map(m=>m.id)),
  new_memory_ids:divergentRight.flatMap(s=>safeArray(readDelta(s).memories).map(m=>m.id)),
  old_confirmed_offscreen:divergentLeft.flatMap(s=>safeArray(readDelta(s).npc_offscreen).map(e=>e.id)),
  new_confirmed_offscreen:divergentRight.flatMap(s=>safeArray(readDelta(s).npc_offscreen).map(e=>e.id)),
  source:'Разница выводится из валидных веток; планы не приравниваются к случившимся событиям.'};
}
