/** LIVING WORLD companion contract.
 *  ChatGPT is the narrative engine; Supabase is the durable settings/state source.
 *  All defaults are explicit and old worlds remain backwards-compatible.
 */
import {validStoryClock,isNondecreasingStoryTime} from './continuity.mjs';

export const SIMULATION_MODES=Object.freeze(['off','life','skip']);
export const SIMULATION_SPANS=Object.freeze(['week','month','quarter','halfyear','year']);
export const SCENE_MODES=Object.freeze(['story','relationship']);
export const SCENE_LENGTHS=Object.freeze(['normal','large','detailed']);

const oneOf=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeHead=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value)?value.toLowerCase():null;
export const COMPANION_SETTINGS_VERSION=1;

/** Never treat a stale choice (after a fork/new scene) as the next player's action. */
export function companionSettings(world={},headSceneId=null,currentTime=null){
 const choices=isRecord(world.genesis_choices)?world.genesis_choices:{};
 const prefs=isRecord(choices.companion_preferences)?choices.companion_preferences:{};
 const head=safeHead(headSceneId);
 const pending=isRecord(prefs.pending_decision)?prefs.pending_decision:null;
 const chosen=pending&&head&&safeHead(pending.source_scene_id)===head&&
  /^[a-zA-Z0-9_-]{1,100}$/.test(pending.choice_id||'')&&
  clean(pending.label,200)?{
   source_scene_id:head,choice_id:clean(pending.choice_id,100),
   label:clean(pending.label,200),description:clean(pending.description,500)
  }:null;
 const next=clean(prefs.next_scene_time,32);
 const validNext=validStoryClock(next)&&
  (!currentTime||isNondecreasingStoryTime(String(currentTime),next))?next:null;
 return {
  version:COMPANION_SETTINGS_VERSION,
  simulation_mode:oneOf(choices.simulation_mode,SIMULATION_MODES,'off'),
  simulation_span:oneOf(prefs.simulation_span,SIMULATION_SPANS,'quarter'),
  scene_mode:oneOf(prefs.scene_mode,SCENE_MODES,'story'),
  scene_length:oneOf(prefs.scene_length,SCENE_LENGTHS,'large'),
  director_note:clean(prefs.director_note,1400),
  next_scene_time:validNext,
  next_scene_time_ignored:!!next&&!validNext,
  pending_decision:chosen,
  pending_decision_ignored:!!pending&&!chosen,
  model_story:clean(world.model_story||'gpt-6',60),
  model_relationships:clean(world.model_relationships||'gpt-5.6',60),
  auto_save_enabled:choices.auto_save_enabled===true
 };
}

export function companionGuidance(config){
 const value=config||{};
 const isSim=value.simulation_mode==='life'||value.simulation_mode==='skip';
 const stage=value.simulation_mode==='life'?'прогон жизни — проживай предысторию причинно, формируя характер':
  value.simulation_mode==='skip'?'ускорение времени — пропускай рутину, сохраняя важные решения':
  'обычные литературные сцены, без автоматического пропуска времени';
 const wordCount=value.scene_length==='normal'?'1 500–3 000':
  value.scene_length==='detailed'?'5 000–8 000':'3 000–5 000';
 return {
  narrative_mode:stage,
  simulation_step:isSim?'Не более '+({week:'1 недели',month:'1 месяца',quarter:'3 месяцев',halfyear:'6 месяцев',year:'1 года'}[value.simulation_span]||'3 месяцев')+'; можно остановиться раньше для значимого выбора.':null,
  scene_emphasis:value.scene_mode==='relationship'?
   'психология, диалоги и отношения при сохранении общей причинности':
   'сюжет, мир и причинность без упрощения психологии',
  output_style:isSim?
   'короткая причинная хроника этапа, остановка на значимом выборе':
   'цельная художественная сцена, ориентировочный объём '+wordCount+' слов',
  next_scene_time:value.next_scene_time||'Исходи из последней валидной даты действующей ветки.',
  player_choice:value.pending_decision?value.pending_decision.label+' — '+value.pending_decision.description:
   'Нового подтверждённого выбора нет; не приписывай игроку выбор.',
  director_note:value.director_note||'нет',
  model_notice:'Название модели в настройках PWA — предпочтение; оно НЕ переключает модель текущего чата ChatGPT. Выбор модели остаётся за пользователем.'
 };
}

export function mergeCompanionPreferences(choices={},patch={}){
 if(!isRecord(choices)||!isRecord(patch))throw Error('Параметры мира должны быть объектом.');
 const old=isRecord(choices.companion_preferences)?choices.companion_preferences:{};
 const prefs={...old};
 for(const [key,value] of Object.entries(patch)){
  if(key==='simulation_mode'){
   if(!SIMULATION_MODES.includes(value))throw Error('Неизвестный режим симуляции.');
   continue;
  }
  if(key==='simulation_span'&&!SIMULATION_SPANS.includes(value))throw Error('Неизвестный шаг симуляции.');
  if(key==='scene_mode'&&!SCENE_MODES.includes(value))throw Error('Неизвестный режим сцены.');
  if(key==='scene_length'&&!SCENE_LENGTHS.includes(value))throw Error('Неизвестный объём сцены.');
  if(key==='director_note'&&String(value).length>1400)throw Error('Режиссёрское уточнение слишком длинное.');
  if(key==='next_scene_time'&&value!==''&&!validStoryClock(value))throw Error('Некорректная игровая дата.');
  if(key==='pending_decision'&&value!==null){
   if(!isRecord(value)||!safeHead(value.source_scene_id)||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.choice_id??'')||
     !clean(value.label,200))throw Error('Решение должно иметь действительную исходную сцену, ID и название.');
   prefs[key]={source_scene_id:safeHead(value.source_scene_id),choice_id:value.choice_id,
    label:clean(value.label,200),description:clean(value.description,500)};
   continue;
  }
  if(!['simulation_span','scene_mode','scene_length','director_note','next_scene_time','pending_decision'].includes(key)&&key!=='simulation_mode')
   throw Error('Неизвестный параметр компаньона: '+key);
  if(key!=='simulation_mode')prefs[key]=value;
 }
 return {...choices,...('simulation_mode'in patch?{simulation_mode:patch.simulation_mode}:{}),
  companion_preferences:prefs};
}
