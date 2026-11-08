/** Branch-derived, auditable causal history. Never confuse a compact preview with
 * the durable archive; every valid event retains its scene, date and source.
 */
const normalized=value=>String(value??'').normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim().replace(/\s+/g,' ');
const trim=value=>typeof value==='string'?value.trim():'';
export function projectCausalMemory(scenes=[],{getDelta}={}){
 const read=getDelta??(s=>s.changes??s.delta??{});
 const facts=[],offscreen_events=[],threads=new Map(),warnings=[];
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
  for(const value of Array.isArray(c.offscreen_events)?c.offscreen_events:[]){
   if(trim(value))offscreen_events.push(event(value.trim(),'offscreen'));
  }
 }
 const active=Array.from(threads.values()).filter(t=>t.status==='open');
 const resolved=Array.from(threads.values()).filter(t=>t.status==='resolved');
 return {complete:true,scanned_scenes:scenes.length,facts,offscreen_events,
  open_threads:active,resolved_threads:resolved,warnings,
  counts:{facts:facts.length,offscreen_events:offscreen_events.length,
    open_threads:active.length,resolved_threads:resolved.length}};
}
export function causalSummary(memory,{recentFacts=80,recentOffscreen=40,openThreads=120}={}){
 if(!memory?.complete)return {complete:false,reason:'Нет полного журнала.'};
 return {complete:true,scanned_scenes:memory.scanned_scenes,
  counts:memory.counts,
  facts:memory.facts.slice(-recentFacts),
  offscreen_events:memory.offscreen_events.slice(-recentOffscreen),
  open_threads:memory.open_threads.slice(-openThreads),
  unshown_open_threads:Math.max(0,memory.open_threads.length-openThreads),
  warnings:memory.warnings.slice(-30)};
}
export function searchCausalMemory(memory,{kind='fact',query='',offset=0,limit=40}={}){
 if(!memory?.complete)throw Error('История не восстановлена полностью.');
 if(!['fact','open_thread','resolved_thread','offscreen'].includes(kind))throw Error('Неизвестный тип причинной памяти.');
 if(!Number.isInteger(offset)||offset<0||offset>1000000||!Number.isInteger(limit)||limit<1||limit>100)
  throw Error('Некорректная страница причинной памяти.');
 const list=kind==='fact'?memory.facts:kind==='open_thread'?memory.open_threads:
  kind==='resolved_thread'?memory.resolved_threads:memory.offscreen_events;
 const q=normalized(query);
 const filtered=q?list.filter(e=>normalized(e.text).includes(q)):list;
 const page=filtered.slice(offset,offset+limit);
 return {kind,query,offset,total:filtered.length,items:page,
   next_offset:offset+limit<filtered.length?offset+limit:null};
}
