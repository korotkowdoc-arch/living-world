/** Read-only 30-scene literary acceptance review.
 * This does not GENERATE a playtest and does not pretend synthetically constructed
 * scenes are an actual autonomous ChatGPT run.
 */
import {narrativePacingBrief} from './narrative-pacing.mjs';
const array=v=>Array.isArray(v)?v:[];
const supported=['main','investigation','relationship','character','everyday','institutional'];
export function literaryPlaytestReport(scenes=[],{
 getDelta=null,complete=false,required=30
}={}){
 const count=Math.min(100,Math.max(1,Math.trunc(required)||30));
 const window=array(scenes).slice(-count);
 const read=getDelta||((s)=>s?.changes??s?.delta??{});
 const rows=window.map(s=>{
  const delta=read(s)||{};
  const beats=array(delta.narrative_beats).filter(x=>supported.includes(x?.domain));
  return {scene_id:s?.id||null,world_time:s?.world_time||null,beats,delta};
 });
 const annotated=rows.filter(r=>r.beats.length>0);
 const domainCounts=Object.fromEntries(supported.map(n=>[n,0]));
 let longest=0,last=null,run=0;
 for(const row of rows){
  const domains=[...new Set(row.beats.map(b=>b.domain))];
  for(const n of domains)domainCounts[n]++;
  if(domains.length===1&&domains[0]===last)run++;
  else{run=domains.length===1?1:0;last=domains.length===1?domains[0]:null;}
  longest=Math.max(longest,run);
 }
 let independentNpc=0,recordedSocial=0,calendarUpdates=0,meetingUpdates=0,npcPlans=0;
 for(const r of rows){
  independentNpc+=array(r.delta.npc_offscreen).filter(x=>x?.basis==='simulated').length;
  recordedSocial+=array(r.delta.relationships).length;
  calendarUpdates+=array(r.delta.calendar_updates).length;
  meetingUpdates+=array(r.delta.npc_schedule_updates).length;
  npcPlans+=array(r.delta.npc_plan_updates).length;
 }
 const signals=[];
 if(annotated.length>=Math.ceil(count*.7)&&longest>=8)
  signals.push({code:'ONE_DOMAIN_SPOTLIGHT',note:'Восемь или больше размеченных сцен подряд имеют единственный повторяющийся фокус. Проверить, почему остальные процессы не влияют на происходящее.'});
 if(annotated.length>=Math.ceil(count*.7)&&domainCounts.relationship===0&&recordedSocial===0)
  signals.push({code:'SOCIAL_LIFE_UNSEEN',note:'В достаточно размеченном окне нет отмеченной социальной жизни. Это повод для режиссёрской проверки, не обязанность назначить секс.'});
 if(annotated.length>=Math.ceil(count*.7)&&domainCounts.main===0&&calendarUpdates===0)
  signals.push({code:'MAIN_PLOT_UNSEEN',note:'Нет подтверждённого внимания к основному сюжету/календарю в размеченном окне. Не форсировать канон.'});
 if(annotated.length>=Math.ceil(count*.7)&&domainCounts.investigation>=Math.ceil(annotated.length*.8))
  signals.push({code:'INVESTIGATION_MONOPOLY',note:'Расследования преобладают в размеченных сценах. Убедиться, что персонажи не доят прежнюю улику.'});
 if(annotated.length>=Math.ceil(count*.7)&&!independentNpc&&!npcPlans)
  signals.push({code:'NPC_AUTONOMY_UNRECORDED',note:'Ни одно самостоятельное действие или изменение плана NPC не записано; отсутствие записи не доказывает отсутствие событий в прозе.'});
 const pacing=narrativePacingBrief(window,{complete:!!complete,window:count});
 return {
  version:1,required_scenes:count,saved_scenes:window.length,
  ready_for_human_review:!!complete&&window.length>=count,
  source:'Сохранённые подтверждённые сцены выбранной действующей ветки. Не является автоматической генерацией 30 сцен.',
  date_range:{from:window[0]?.world_time||null,to:window.at(-1)?.world_time||null},
  coverage:{tagged_scenes:annotated.length,untagged_scenes:window.length-annotated.length,
   note:'Нет метки — нет достоверной автоматической жанровой классификации.'},
  domain_scene_counts:domainCounts,longest_single_domain_run:longest,
  recorded_changes:{independent_npc_events:independentNpc,relationship_observations:recordedSocial,
   calendar_outcomes:calendarUpdates,appointment_changes:meetingUpdates,npc_plan_updates:npcPlans},
  pacing_signals:pacing.signals,editorial_signals:signals,
  mandatory_human_questions:[
   'Были ли отношения живыми и естественными, без принуждения к романтическим сценам по квоте?',
   'Продвигался ли учебный год и события общества без прямого напоминания режиссёра?',
   'Могли ли расследования честно остановиться без бесполезных новых свидетелей?',
   'Действовали ли NPC в собственных интересах, даже когда Гарри находился в другой сцене?',
   'Соблюдались ли время, дорога, сон, здоровье, занятия, согласие и границы?',
   'Не просочились ли знания, вещи и события из отменённой ветки?'
  ],
  verdict:'НЕТ АВТОМАТИЧЕСКОЙ ЛИТЕРАТУРНОЙ ОЦЕНКИ. Данные дают сигналы, окончательный вердикт — после чтения фактически сыгранных сцен.'
 };
}
