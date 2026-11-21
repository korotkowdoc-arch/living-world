/** A source-bound, optional director-facing pacing signal.
 * No LLM call, no invented offscreen event and no automatic plot transition.
 * Each beat is evidenced by the saved literary text; the model's tag remains
 * a claim about narrative attention, not proof of semantic quality.
 */
export const NARRATIVE_DOMAINS=Object.freeze([
 'main','investigation','relationship','character','everyday','institutional'
]);
export const NARRATIVE_PROGRESS=Object.freeze(['advance','quiet','stall']);

const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9_-]{2,79}$/.test(value);
const arr=value=>Array.isArray(value)?value:[];
const safeText=value=>typeof value==='string'?value.trim():'';

/** Optional for legacy chapters; strict for every newly supplied annotation. */
export function validateNarrativeBeats(value,scene=''){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>4)throw Error('narrative_beats: не более четырёх подтверждённых аспектов сцены.');
 const used=new Set();
 return value.map((raw,i)=>{
  const ref='narrative_beats['+i+']';
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!NARRATIVE_DOMAINS.includes(raw.domain))
   throw Error(ref+': неизвестная область сюжета.');
  if(used.has(raw.domain))throw Error(ref+': повторная область сюжета.');
  used.add(raw.domain);
  if(!NARRATIVE_PROGRESS.includes(raw.progress))throw Error(ref+': нужен advance, quiet или stall.');
  const evidence=safeText(raw.evidence);
  if(!evidence||evidence.length>600||!String(scene).includes(evidence))
   throw Error(ref+': evidence должен быть дословным фрагментом сцены.');
  const thread_id=safeText(raw.thread_id);
  if(thread_id&&!validId(thread_id))throw Error(ref+': недопустимый thread_id.');
  return {domain:raw.domain,progress:raw.progress,evidence,thread_id};
 });
}
function sceneDelta(scene){
 if(scene?.changes&&typeof scene.changes==='object')return scene.changes;
 if(scene?.delta&&typeof scene.delta==='object')return scene.delta;
 const note=scene?.prompt_note;
 if(typeof note==='string'&&note.startsWith('LWSTATE1:')){
  try{const parsed=JSON.parse(note.slice('LWSTATE1:'.length));return parsed?.v===1?parsed.delta||{}:{};}
  catch{return {};}
 }
 return {};
}
/** A transparent window, not an omniscient assessment of all prose.
 * Unknown or legacy chapters remain unknown; no keyword-based "romance" guesses.
 * Caller must supply only the active, confirmed branch lineage.
 */
export function narrativePacingBrief(scenes=[],{complete=false,window=12,currentTime=null,managedThreads=[]}={}){
 const recent=arr(scenes).slice(-Math.min(24,Math.max(1,Math.floor(window)||12)));
 const rows=recent.map(s=>{
  const values=arr(sceneDelta(s).narrative_beats);
  const beats=values.filter(b=>b&&NARRATIVE_DOMAINS.includes(b.domain)&&NARRATIVE_PROGRESS.includes(b.progress));
  return {scene_id:s.id??null,time:s.world_time??null,beats};
 });
 const counted=Object.fromEntries(NARRATIVE_DOMAINS.map(domain=>[domain,0]));
 for(const row of rows)for(const domain of new Set(row.beats.map(b=>b.domain)))counted[domain]++;
 const classified=rows.filter(r=>r.beats.length>0).length;
 const unknown=rows.length-classified;
 let streakDomain=null,streak=0;
 for(let i=rows.length-1;i>=0;i--){
  const domains=rows[i].beats.map(b=>b.domain);
  if(domains.length!==1)break;
  if(streakDomain===null)streakDomain=domains[0];
  if(streakDomain!==domains[0])break;
  streak++;
 }
 const investigationStalls=new Map();
 for(const row of rows){
  for(const b of row.beats){
   if(b.domain!=='investigation'||!b.thread_id)continue;
   investigationStalls.set(b.thread_id,b.progress==='stall'
    ? (investigationStalls.get(b.thread_id)||0)+1:0);
  }
 }
 const stalledInvestigations=[...investigationStalls].filter(([,count])=>count>=2)
  .map(([id,count])=>({thread_id:id,consecutive_stalls:count}));
 const unrepresented=classified>=4
  ? ['main','relationship','character','everyday'].filter(domain=>counted[domain]===0)
  : [];
 const live=arr(managedThreads).filter(t=>t&&t.status==='active')
  .map(t=>({id:t.id,kind:t.kind,title:t.title,last_at:t.last_at}));
 const signals=[];
 if(streak>=3&&streakDomain)
  signals.push({code:'SINGLE_THREAD_SPOTLIGHT',domain:streakDomain,scenes:streak,
   note:'Три и более подряд сцен с одним подтверждённым фокусом: проверить другие причинно живые линии.'});
 for(const s of stalledInvestigations)signals.push({code:'INVESTIGATION_STALLED',...s,
  note:'Две или более проверки без прогресса: рассмотреть честный тупик и паузу до нового независимого источника.'});
 if(unrepresented.length)signals.push({code:'FOCUS_NEGLECT_REVIEW',domains:unrepresented,
  note:'За отмеченные сцены эти области не получили подтверждённого внимания. Проверить наличие реальных возможностей, не создавать эпизод по квоте.'});
 return {
  version:1,complete:!!complete,window_size:rows.length,current_time:currentTime,
  coverage:{tagged_scenes:classified,untagged_scenes:unknown,
   note:unknown?'Часть сцен не размечена; отсутствие метки не означает отсутствие сюжета.':'Разметка есть у всех сцен окна, но смысловое качество меток не доказано.'},
  domain_scene_counts:counted,
  consecutive_single_focus:{domain:streakDomain,count:streak},
  stalled_investigations:stalledInvestigations,
  underrepresented_review:unrepresented,
  active_threads:live,
  signals
 };
}
/** Prompt directive, not a deterministic scene command or a metronome. */
export function narrativePacingGuidance(brief=null){
 const signals=arr(brief?.signals);
 const circumstances=signals.length
  ? signals.map(x=>'- '+x.note+(x.thread_id?' Линия: '+x.thread_id:'')).join('\n')
  : '- По имеющейся разметке критического перекоса не обнаружено; это НЕ доказательство идеального темпа.';
 return `СКРЫТЫЙ РЕДАКТОР ТЕМПА (не показывай его читателю):
- Перед выбором следующей сцены оцени НЕ ТОЛЬКО незакрытую загадку, но и текущие цели людей, отношения, интимную/бытовую жизнь взрослых, учёбу, институциональные процессы и ближайшие календарные узлы. Восстанавливай реальное состояние и доступные знания.
- Календарные узлы не ждут запроса режиссёра. При продвижении времени проверь достигнутые даты и причину, по которой событие состоится, изменится или окажется невозможным. Не возвращай сюжет к канону насильно.
- Улика заслуживает сцены, только если появился новый независимый источник, изменился риск, появилась возможность проверки либо персонаж действительно выбирает расследование. Повторный разговор без содержательного результата не является автоматическим продолжением линии.
- После двух безрезультатных проверок разумный персонаж может временно отложить дело. Это НЕ автоматический запрет на расследование: срочная угроза или новая причина способны оправдать продолжение. Не придумывай зацепку ради продления загадки.
- Отношения и желание существуют даже при действующей угрозе. Замечай естественные поводы для близости, заботы, конфликтов, романтики, сексуальности и совместного быта; не назначай обязательный секс по расписанию и не вынуждай персонажей к желанию.
- Не чередуй жанры механически. Если сцена сфокусирована на одной линии, продолжай её, когда того требует причинность; но не превращай одну арку в единственное содержание месяцев жизни.
- Если персонажи прямо сейчас заняты непрерывным важным разговором, боем или интимным эпизодом, не прерывай его ради искусственного баланса. Заверши целостную фазу и пересмотри приоритеты затем.
- Скрытые служебные сведения НЕ переходят в знания персонажей. Не изображай намерения NPC уже состоявшимися событиями.
НАБЛЮДАЕМЫЕ СИГНАЛЫ (не приказы, теги — лишь подтверждённые дословными цитатами пометки):
${circumstances}
Проверяй актуальные Year Anchors по настоящим проектным документам, а не по общему канону. Если источник хронологии недоступен, НЕ выдумывай точную дату.`;
}
