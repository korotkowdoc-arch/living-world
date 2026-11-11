/** Static, source-bound audit, not an LLM. It catches only verifiable inconsistencies.
 * No semantic NLP claim is made about unsaid subtext in prose.
 */
import {validateDepthDelta,depthSemanticWarnings} from './world-depth.mjs';
import {validateSceneMemories} from './story-memory.mjs';
import {validateCompanionDelta} from './world-ledger.mjs';
import {validStoryClock,isNondecreasingStoryTime} from './continuity.mjs';
const norm=v=>String(v??'').normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
const arr=v=>Array.isArray(v)?v:[];
const issue=(code,severity,detail,source_scene_id=null)=>({code,severity,detail,source_scene_id});

export function auditNarrativeScene({scene='',world_time='',previous_time='',changes={},characters=[],
 existing_memory_ids=[],known_characters=[]}={}){
 const issues=[],body=String(scene||'');
 if(!body.trim())issues.push(issue('EMPTY_SCENE','error','Сцена не содержит текста.'));
 if(!validStoryClock(world_time))issues.push(issue('INVALID_STORY_TIME','error','Время сцены задано некорректно.'));
 else if(previous_time&&!isNondecreasingStoryTime(previous_time,world_time))
  issues.push(issue('TIME_REGRESSION','error','Время новой сцены раньше уже сыгранной.'));
 try{validateCompanionDelta(changes);}
 catch(e){issues.push(issue('INVALID_RESOURCES','error',e.message));}
 try{validateSceneMemories(changes.memories,body);}
 catch(e){issues.push(issue('UNVERIFIED_MEMORY_QUOTE','error',e.message));}
 let depth=null;
 try{depth=validateDepthDelta(changes,body);}
 catch(e){issues.push(issue('UNVERIFIED_PSYCHOLOGY_OR_OFFSCREEN','error',e.message));}
 if(depth)issues.push(...depthSemanticWarnings({...changes,...depth},existing_memory_ids));
 const known=new Set([...arr(characters),...arr(known_characters)].map(x=>norm(typeof x==='string'?x:x.name)));
 for(const p of arr(changes.new_characters))if(p?.name)known.add(norm(p.name));
 for(const e of arr(changes.psychology))if(e.character&&!known.has(norm(e.character)))
  issues.push(issue('ACTOR_UNVERIFIED','warning','Нет подтверждённой карточки/введения персонажа '+e.character+'.'));
 for(const e of arr(changes.relationships))for(const person of [e.from,e.to])
  if(person&&!known.has(norm(person)))
   issues.push(issue('RELATION_ACTOR_UNVERIFIED','warning','Участник отношения пока не введён в мир: '+person+'.'));
 for(const e of arr(changes.npc_offscreen)){
  if(e.happened_at&&validStoryClock(world_time)&&
    !isNondecreasingStoryTime(e.happened_at,world_time))
   issues.push(issue('OFFSCREEN_FROM_FUTURE','error','Внекадровое событие описывает будущее относительно конца сцены: '+e.id+'.'));
  if(!known.has(norm(e.actor)))issues.push(issue('OFFSCREEN_ACTOR_UNKNOWN','warning',
    'Нет подтверждённого NPC для внекадрового события: '+e.actor+'.'));
 }
 for(const e of arr(changes.characters))for(const learned of arr(e.learned)){
  // A channel without exact source quote may still be valid (older scene / preflight).
  // Report uncertainty; do not pretend to prove a negative from lexical matching.
  if(learned?.via&&!body.includes(learned.via)&&!body.includes(learned.fact))
   issues.push(issue('KNOWLEDGE_CHANNEL_NEEDS_REVIEW','warning',
    e.name+' получает знание «'+learned.fact+'», но канал не найден дословно в новом тексте. Проверь оригинальный источник.'));
 }
 if(arr(changes.npc_offscreen).length===0&&arr(changes.npc_intentions).length)
  issues.push(issue('PLANS_NOT_EVENTS','info','Планы NPC подтверждены как намерения, а не состоявшиеся события.'));
 const counts={errors:issues.filter(i=>i.severity==='error').length,
  warnings:issues.filter(i=>i.severity==='warning').length,
  information:issues.filter(i=>i.severity==='info').length};
 return {passed:counts.errors===0,counts,issues,
  scope:'Статическая проверка явных фактов и цитат. Не доказывает правильность всех художественных деталей или скрытых знаний; сверяй с первичными сценами.'};
}
