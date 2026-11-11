/**
 * Incremental recovery from a VERIFIED immutable checkpoint.
 * The caller MUST prove source_head is in the active branch's ancestry at its
 * current head (SQL owner-scoped recursive RPC), and supply the exact, contiguous
 * new scene chain after that source_head. A snapshot alone is NOT proof of canon.
 */
import {projectCompanion} from './world-ledger.mjs';
import {projectCharacterMemory} from './world-character-memory.mjs';
import {projectCausalMemory} from './world-causality.mjs';
import {projectWorldDepth} from './world-depth.mjs';
import {readSceneNote} from './continuity.mjs';
import {CHAT_CHECKPOINT_FORMAT} from './story-memory.mjs';

export function isReplayableCheckpoint(snapshot){
 return !!snapshot&&snapshot.format===CHAT_CHECKPOINT_FORMAT&&
  typeof snapshot.source_head==='string'&&
  Number.isSafeInteger(snapshot.scanned_world_scenes)&&snapshot.scanned_world_scenes>0&&
  Array.isArray(snapshot.accounts)&&Array.isArray(snapshot.items)&&
  Array.isArray(snapshot.characters)&&Array.isArray(snapshot.open_threads)&&
  Array.isArray(snapshot.resolved_threads)&&
  Array.isArray(snapshot.causal_facts)&&Array.isArray(snapshot.causal_offscreen_events)&&
  Array.isArray(snapshot.character_psychology)&&Array.isArray(snapshot.relationship_memory)&&
  Array.isArray(snapshot.subjective_recollections)&&
  Array.isArray(snapshot.confirmed_npc_offscreen)&&Array.isArray(snapshot.unfulfilled_npc_intentions);
}
const read=s=>readSceneNote(s.prompt_note)?.delta||s.changes||{};
export function replayFromCheckpoint(snapshot,newScenes=[],{
 verified_source_head=false,expected_head=null,world_id=null,baselines=[]
}={}){
 if(!verified_source_head)throw Error('Нельзя восстанавливать из checkpoint без проверки предка через Supabase.');
 if(!isReplayableCheckpoint(snapshot))throw Error('Checkpoint старого формата или неполон для воспроизводимого восстановления.');
 if(world_id&&snapshot.world_id!==world_id)throw Error('Checkpoint принадлежит другому миру.');
 if(!Array.isArray(newScenes))throw Error('Нужна подтверждённая последовательность новых сцен.');
 let prior=snapshot.source_head;
 const seen=new Set([prior]);
 for(const scene of newScenes){
  if(!scene?.id||seen.has(scene.id)||scene.parent_scene_id!==prior)
   throw Error('После checkpoint есть разрыв, цикл или отменённый хвост. Перечитай действующую цепочку.');
  seen.add(scene.id);prior=scene.id;
 }
 if(expected_head&&expected_head!==prior)throw Error('Состояние поменялось после чтения продолжения checkpoint.');
 const scanned=snapshot.scanned_world_scenes;
 const economy=projectCompanion(newScenes,{getDelta:read,strict:true,seed:{
  complete:true,scanned_scenes:scanned,accounts:snapshot.accounts,items:snapshot.items,
  new_characters:snapshot.introduced_people||[],issues:snapshot.resource_warnings||[]
 }});
 const characters=projectCharacterMemory(baselines,newScenes,{getDelta:read,seed:{
  complete:true,scanned_scenes:scanned,characters:snapshot.characters,
  warnings:snapshot.character_warnings||[]
 }});
 const causality=projectCausalMemory(newScenes,{getDelta:read,seed:{
  complete:true,scanned_scenes:scanned,facts:snapshot.causal_facts,
  offscreen_events:snapshot.causal_offscreen_events,
  open_threads:snapshot.open_threads,resolved_threads:snapshot.resolved_threads,
  warnings:snapshot.causal_warnings||[]
 }});
 const depth=projectWorldDepth(newScenes,{getDelta:read,seed:{
  complete:true,scanned_scenes:scanned,psychology:snapshot.character_psychology,
  relationships:snapshot.relationship_memory,
  recollections:snapshot.subjective_recollections,
  confirmed_offscreen:snapshot.confirmed_npc_offscreen,
  npc_intentions:snapshot.unfulfilled_npc_intentions,
  warnings:snapshot.depth_warnings||[]
 }});
 const memories=[...(snapshot.story_memories||[]),...newScenes.flatMap(s=>
  (read(s).memories||[]).map(m=>({...m,scene_id:s.id,world_time:s.world_time})))];
 return {recovered:true,verified_source_head:true,world_id:snapshot.world_id,
  checkpoint_head:snapshot.source_head,head_scene_id:prior,
  world_time:newScenes.at(-1)?.world_time||snapshot.world_time,
  delta_scenes:newScenes.length,scanned_world_scenes:scanned+newScenes.length,
  economy,characters,causality,depth,story_memories:memories,
  data_quality:{
   missing_structured_at_checkpoint:snapshot.missing_structured_consequences?.length||0,
   missing_structured_in_delta:newScenes.filter(s=>!readSceneNote(s.prompt_note)).map(s=>s.id),
   warnings:[...economy.issues,...characters.warnings,...causality.warnings,...depth.warnings]
  },
  limitation:'Восстановлены структурированные факты после доказанной точки checkpoint. Неизвлечённый подтекст старых сцен по-прежнему доступен только через get_story_scene и Year Documents.'
 };
}
