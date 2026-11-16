/** Branch-derived, auditable causal history. Never confuse a compact preview with
 * the durable archive; every valid event retains its scene, date and source.
 */
const normalized=value=>String(value??'').normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim().replace(/\s+/g,' ');
const trim=value=>typeof value==='string'?value.trim():'';

const THREAD_ACTIONS=['open','advance','pause','resume','resolve','archive','reopen'];
const THREAD_KINDS=['main','character','relationship','institutional','background'];
const THREAD_STATES=['active','paused','resolved','archived'];
const threadId=v=>typeof v==='string'&&/^[a-z][a-z0-9_-]{2,79}$/.test(v);
const limited=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;

/** A storyline is a durable causal PROCESS, not any unanswered question.
 * Legacy free-text "open_threads" remain searchable as uncurated records.
 * Structured transitions have stable IDs, a cause and evidence/provenance.
 */
export function validateThreadUpdates(value,sceneText='',npcOffscreen=[]){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>8)
  throw Error('thread_updates: не более 8 изменений настоящих сюжетных линий за сцену.');
 const used=new Set();
 return value.map((raw,index)=>{
  const ref='thread_updates['+index+']';
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!threadId(raw.id))
   throw Error(ref+': нужен устойчивый id латиницей (не новый id для каждого шага).');
  if(used.has(raw.id))throw Error(ref+': дублирование одной линии в сцене.');
  used.add(raw.id);
  if(!THREAD_ACTIONS.includes(raw.action))throw Error(ref+': неизвестный этап жизненного цикла.');
  if(!limited(raw.summary,1000)||!limited(raw.reason,900))
   throw Error(ref+': нужны результат изменения и конкретная причина, не шаблонная задача.');
  const open=raw.action==='open';
  if(open&&(!limited(raw.title,160)||!limited(raw.objective,700)||!limited(raw.stakes,700)||
      !THREAD_KINDS.includes(raw.kind)))
   throw Error(ref+': новая сюжетная линия требует название, цель, ставки и вид.');
  const origin=raw.source_kind||'scene';
  if(!['scene','offscreen','anchor'].includes(origin))
   throw Error(ref+': недопустимый источник изменения.');
  let evidence='',source_ref='';
  if(origin==='scene'){
   if(!limited(raw.evidence,700)||!String(sceneText).includes(raw.evidence))
    throw Error(ref+': evidence должен буквально присутствовать в сохраняемой сцене.');
   evidence=raw.evidence;
  }else if(origin==='offscreen'){
   if(!limited(raw.source_ref,80)||
      !npcOffscreen.some(e=>e?.id===raw.source_ref))
    throw Error(ref+': для изменения за кадром требуется id фактического npc_offscreen той же сцены.');
   source_ref=raw.source_ref;
  }else{
   if(!/^Y[1-7]-[0-9]{2}$/.test(raw.source_ref||''))
    throw Error(ref+': требуется конкретный ID проектного Year Anchor.');
   source_ref=raw.source_ref;
  }
  return {id:raw.id,action:raw.action,title:open?raw.title.trim():trim(raw.title),
   objective:open?raw.objective.trim():trim(raw.objective),
   stakes:open?raw.stakes.trim():trim(raw.stakes),
   kind:open?raw.kind:THREAD_KINDS.includes(raw.kind)?raw.kind:'',
   summary:raw.summary.trim(),reason:raw.reason.trim(),
   source_kind:origin,source_ref,evidence};
 });
}

/** Catch invalid transitions before saving; never silently fabricate closure. */
export function validateThreadTransitions(existing=[],updates=[]){
 const states=new Map(existing.map(t=>[t.id,t.status]));
 for(const u of updates){
  const before=states.get(u.id);
  if(u.action==='open'){
   if(before)throw Error('Линия '+u.id+' уже существует; развивай её через advance, не открывай дубль.');
   states.set(u.id,'active');continue;
  }
  if(!before)throw Error('Нельзя '+u.action+' несуществующую линию '+u.id+'. Сначала open.');
  if(u.action==='reopen'){
   if(!['resolved','archived'].includes(before))throw Error('reopen только после завершения/архива: '+u.id);
   states.set(u.id,'active');continue;
  }
  if(['resolved','archived'].includes(before))
   throw Error('Нельзя развивать завершённую линию '+u.id+' без явного reopen.');
  if(u.action==='resume'&&before!=='paused')
   throw Error('resume только для приостановленной линии '+u.id);
  if(u.action==='pause'&&before!=='active')
   throw Error('pause только для активной линии '+u.id);
  states.set(u.id,u.action==='pause'?'paused':
   u.action==='resolve'?'resolved':u.action==='archive'?'archived':'active');
 }
 return true;
}

export function projectCausalMemory(scenes=[],{getDelta,seed=null}={}){
 const read=getDelta??(s=>s.changes??s.delta??{});
 const facts=[],offscreen_events=[],threads=new Map(),managed=new Map(),warnings=[];
 if(seed){
  if(seed.complete!==true||!Array.isArray(seed.facts)||!Array.isArray(seed.offscreen_events)||
    !Array.isArray(seed.open_threads)||!Array.isArray(seed.resolved_threads)||
    !Number.isSafeInteger(seed.scanned_scenes))
   throw Error('Checkpoint причинных фактов неполон.');
  facts.push(...seed.facts.map(e=>({...e})));
  offscreen_events.push(...seed.offscreen_events.map(e=>({...e})));
  for(const entry of [...seed.open_threads,...seed.resolved_threads]){
   const k=normalized(entry.text);
   if(!k)throw Error('Неправильная причинная линия в checkpoint.');
   threads.set(k,{...entry,history:Array.isArray(entry.history)?entry.history.map(e=>({...e})):[]});
  }
  for(const entry of Array.isArray(seed.managed_threads)?seed.managed_threads:[]){
   if(!threadId(entry?.id)||!THREAD_STATES.includes(entry.status))
    throw Error('Повреждённая структурная линия в checkpoint.');
   managed.set(entry.id,{...entry,history:Array.isArray(entry.history)?entry.history.map(e=>({...e})):[]});
  }
  if(Array.isArray(seed.warnings))warnings.push(...seed.warnings);
 }
 for(const scene of scenes){
  const c=read(scene)||{};
  const event=(text,kind)=>({kind,text,scene_id:scene.id,world_time:scene.world_time??null});
  for(const fact of Array.isArray(c.facts)?c.facts:[]){
   if(trim(fact))facts.push(event(fact.trim(),'fact'));
  }
  for(const value of Array.isArray(c.open_threads)?c.open_threads:[]){
   if(!trim(value))continue;
   const label=value.trim(),key=normalized(label);
   const old=threads.get(key);
   threads.set(key,{text:label,opened_scene_id:scene.id,opened_at:scene.world_time??null,
    last_scene_id:scene.id,last_at:scene.world_time??null,status:'open',
    history:[...(old?.history||[]),{type:'open',scene_id:scene.id,world_time:scene.world_time??null}]});
  }
  for(const value of Array.isArray(c.resolved_threads)?c.resolved_threads:[]){
   if(!trim(value))continue;
   const key=normalized(value),previous=threads.get(key);
   if(!previous){
    warnings.push({scene_id:scene.id,code:'UNTRACKED_RESOLUTION',text:value.trim()});
    threads.set(key,{text:value.trim(),opened_scene_id:null,opened_at:null,
     last_scene_id:scene.id,last_at:scene.world_time??null,status:'resolved',
     history:[{type:'resolve',scene_id:scene.id,world_time:scene.world_time??null}]});
   }else threads.set(key,{...previous,status:'resolved',last_scene_id:scene.id,
      last_at:scene.world_time??null,history:[...previous.history,{type:'resolve',scene_id:scene.id,world_time:scene.world_time??null}]});
  }

  for(const u of Array.isArray(c.thread_updates)?c.thread_updates:[]){
   if(!threadId(u?.id)||!THREAD_ACTIONS.includes(u.action))continue;
   const old=managed.get(u.id);
   try{validateThreadTransitions(old?[old]:[],[u]);}
   catch(error){warnings.push({scene_id:scene.id,code:'INVALID_THREAD_TRANSITION',
    thread_id:u.id,detail:error.message});continue;}
   const note={action:u.action,scene_id:scene.id,world_time:scene.world_time??null,
    summary:u.summary,reason:u.reason,source_kind:u.source_kind,source_ref:u.source_ref,
    evidence:u.evidence};
   const status=u.action==='pause'?'paused':u.action==='resolve'?'resolved':
    u.action==='archive'?'archived':'active';
   if(!old){
    managed.set(u.id,{id:u.id,title:u.title,kind:u.kind,objective:u.objective,
     stakes:u.stakes,status,summary:u.summary,opened_scene_id:scene.id,
     opened_at:scene.world_time??null,last_scene_id:scene.id,
     last_at:scene.world_time??null,history:[note]});
   }else{
    managed.set(u.id,{...old,status,summary:u.summary,last_scene_id:scene.id,
     last_at:scene.world_time??null,history:[...old.history,note]});
   }
  }
  for(const value of Array.isArray(c.offscreen_events)?c.offscreen_events:[]){
   if(trim(value))offscreen_events.push(event(value.trim(),'offscreen'));
  }
  // Structured NPC events are canonical offscreen events too. In the past they
  // were stored in depth memory only, leaving the causal/offscreen index empty.
  for(const off of Array.isArray(c.npc_offscreen)?c.npc_offscreen:[]){
   if(!trim(off?.actor)||!trim(off?.event))continue;
   offscreen_events.push({...event(off.actor+': '+off.event,'offscreen'),
    event_id:off.id||null,actor:off.actor,happened_at:off.happened_at||scene.world_time,
    basis:off.basis||'narrated',known_by:Array.isArray(off.known_by)?off.known_by:[],
    causal_basis:off.causal_basis||''});
  }
 }
 const tracked=Array.from(managed.values());
 const trackedCounts={active:tracked.filter(t=>t.status==='active').length,
   paused:tracked.filter(t=>t.status==='paused').length,
   resolved:tracked.filter(t=>t.status==='resolved').length,
   archived:tracked.filter(t=>t.status==='archived').length};
 const active=Array.from(threads.values()).filter(t=>t.status==='open');
 const resolved=Array.from(threads.values()).filter(t=>t.status==='resolved');
 return {complete:true,scanned_scenes:(seed?.scanned_scenes||0)+scenes.length,facts,offscreen_events,
  open_threads:active,resolved_threads:resolved,managed_threads:tracked,warnings,
  counts:{facts:facts.length,offscreen_events:offscreen_events.length,
    open_threads:active.length,resolved_threads:resolved.length,
    legacy_unreviewed:active.length,tracked_active:trackedCounts.active,
    tracked_paused:trackedCounts.paused,tracked_resolved:trackedCounts.resolved,
    tracked_archived:trackedCounts.archived}};
}
export function causalSummary(memory,{recentFacts=80,recentOffscreen=40,openThreads=120}={}){
 if(!memory?.complete)return {complete:false,reason:'Нет полного журнала.'};
 return {complete:true,scanned_scenes:memory.scanned_scenes,
  counts:memory.counts,
  facts:memory.facts.slice(-recentFacts),
  offscreen_events:memory.offscreen_events.slice(-recentOffscreen),
  open_threads:memory.open_threads.slice(-openThreads),
  managed_threads:(memory.managed_threads||[]).slice(-100),
  unshown_open_threads:Math.max(0,memory.open_threads.length-openThreads),
  warnings:memory.warnings.slice(-30)};
}
/** Bounded default context, without losing anything in the searchable full archive.
 * Old but relevant threads can be fetched on demand via get_causal_memory.
 */
export function causalSceneBrief(memory,{actorNames=[],maxOpen=24,maxFacts=24,maxOffscreen=14}={}){
 if(!memory?.complete)return memory;
 const all=Array.isArray(memory.managed_threads)?memory.managed_threads:[];
 const names=actorNames.map(normalized).filter(Boolean);
 const live=all.filter(t=>t.status==='active');
 const relevant=live.filter(t=>names.some(n=>normalized(t.title+' '+t.summary).includes(n)));
 const chosen=[...relevant,...live.filter(t=>!relevant.includes(t))].slice(0,maxOpen);
 return {...memory,
  facts:(memory.facts||[]).slice(-maxFacts),
  offscreen_events:(memory.offscreen_events||[]).slice(-maxOffscreen),
  managed_threads:chosen,
  // Legacy uncurated notes are not 405 obligations to resume the plot.
  open_threads:[],
  unshown_open_threads:memory.counts?.legacy_unreviewed??memory.unshown_open_threads??0,
  retrieval_note:'В контексте только подтверждённые активные сюжетные процессы со стабильными ID. Исторические open_threads — необработанные заметки, а НЕ задачи автора или обязанности Гарри; доступны через get_causal_memory для точечной проверки. Нельзя автоматически закрывать их или объявлять несуществовавшими.'};
}
export function searchCausalMemory(memory,{kind='fact',query='',offset=0,limit=40}={}){
 if(!memory?.complete)throw Error('История не восстановлена полностью.');
 if(!['fact','open_thread','resolved_thread','offscreen','storyline'].includes(kind))throw Error('Неизвестный тип причинной памяти.');
 if(!Number.isInteger(offset)||offset<0||offset>1000000||!Number.isInteger(limit)||limit<1||limit>100)
  throw Error('Некорректная страница причинной памяти.');
 const list=kind==='fact'?memory.facts:kind==='open_thread'?memory.open_threads:
  kind==='resolved_thread'?memory.resolved_threads:kind==='storyline'?(memory.managed_threads||[]):memory.offscreen_events;
 const q=normalized(query);
 const filtered=q?list.filter(e=>normalized([e.text,e.title,e.summary,e.id].filter(Boolean).join(' ')).includes(q)):list;
 const page=filtered.slice(offset,offset+limit);
 return {kind,query,offset,total:filtered.length,items:page,
   next_offset:offset+limit<filtered.length?offset+limit:null};
}
