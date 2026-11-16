/** Durable branch-derived character state and knowledge ledger.
 * Replays only valid scenes. No irreversible global mutation of a character card.
 * Learned facts and beliefs are DISTINCT: false beliefs cannot become world truth.
 */
const clean=v=>typeof v==='string'?v.trim():'';
const key=v=>clean(v).normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е');
const STATE_FIELDS=Object.freeze(['location','health','mood','status','goals','relationships','inventory']);
export function projectCharacterMemory(baselines=[],scenes=[],{getDelta,seed=null}={}){
 const read=getDelta||((scene)=>scene.changes??scene.delta??{});
 const characters=new Map(),warnings=[];
 function ensure(name){
  const normalized=key(name);
  if(!normalized)return null;
  if(!characters.has(normalized)){
   characters.set(normalized,{name:clean(name),origin:'first_appearance',initial:null,
    state:{},knowledge:[],beliefs:[],history:[],introduced_scene_id:null});
  }
  return characters.get(normalized);
 }
 for(const p of baselines){
  if(!clean(p?.name))continue;
  const c=ensure(p.name);
  if(c.initial){warnings.push({code:'DUPLICATE_BASELINE',name:p.name});continue;}
  c.initial={role:p.role||'npc',description:p.description||'',personality:p.personality||'',
    knowledge:p.knowledge||'',relationships:p.relationships||'',goals:p.goals||'',
    location:p.location||'',health:p.health||'',mood:p.mood||'',status:p.status||'',inventory:p.inventory||''};
  c.state=Object.fromEntries(STATE_FIELDS.map(f=>[f,c.initial[f]||'']));
  c.origin='baseline';
 }
 if(seed){
  if(seed.complete!==true||!Array.isArray(seed.characters)||
    !Number.isSafeInteger(seed.scanned_scenes))
   throw Error('Checkpoint знаний неполон или неподтверждён.');
  for(const previous of seed.characters){
   if(!clean(previous.name))throw Error('Персонаж checkpoint без имени.');
   const c=ensure(previous.name);
   c.name=previous.name;c.origin=previous.origin||'checkpoint';
   c.initial=previous.initial?{...previous.initial}:null;
   c.state={...previous.state};
   c.introduced_scene_id=previous.introduced_scene_id??null;
   c.knowledge=(Array.isArray(previous.knowledge)?previous.knowledge:[])
    .map(x=>({normalized:key(x.fact),...x}));
   c.beliefs=(Array.isArray(previous.beliefs)?previous.beliefs:[])
    .map(x=>({normalized:key(x.text),...x}));
   c.history=(Array.isArray(previous.history)?previous.history:[]).map(x=>({...x}));
  }
  if(Array.isArray(seed.warnings))warnings.push(...seed.warnings);
 }
 for(const scene of scenes){
  const delta=read(scene)||{};
  const newPeople=Array.isArray(delta.new_characters)?delta.new_characters:[];
  for(const p of newPeople){
   const c=ensure(p.name);if(!c)continue;
   if(c.initial||c.introduced_scene_id){
     warnings.push({code:'DUPLICATE_NPC_INTRODUCTION',scene_id:scene.id,name:p.name});continue;
   }
   c.initial={role:'npc',description:p.description||'',personality:p.personality||'',
     knowledge:p.knowledge||'',relationships:p.relationships||'',goals:p.goals||'',
     location:p.location||'',health:p.health||'',mood:p.mood||'',status:p.status||'',inventory:p.inventory||''};
   c.state=Object.fromEntries(STATE_FIELDS.map(f=>[f,c.initial[f]||'']));
   c.origin='scene';c.introduced_scene_id=scene.id;
   c.history.push({scene_id:scene.id,world_time:scene.world_time,type:'introduced',source:p.causal_link||''});
  }
  // A confirmed offscreen action belongs to the acting NPC's chronology even
  // when that person never appears in the reader-facing chapter.
  for(const off of Array.isArray(delta.npc_offscreen)?delta.npc_offscreen:[]){
   if(!clean(off?.actor)||!clean(off?.event))continue;
   const c=ensure(off.actor);
   c.history.push({scene_id:scene.id,world_time:off.happened_at||scene.world_time,
    type:'offscreen',event:off.event,basis:off.basis||'narrated',
    causal_basis:off.causal_basis||'',known_by:Array.isArray(off.known_by)?off.known_by:[]});
  }
  for(const deltaChar of Array.isArray(delta.characters)?delta.characters:[]){
   const c=ensure(deltaChar.name);if(!c)continue;
   const changes={};
   for(const field of STATE_FIELDS){
    if(typeof deltaChar[field]==='string'&&deltaChar[field].trim()){
     c.state[field]=deltaChar[field].trim();changes[field]=c.state[field];
    }
   }
   if(Object.keys(changes).length)c.history.push({scene_id:scene.id,world_time:scene.world_time,type:'state',changes});
   for(const fact of Array.isArray(deltaChar.learned)?deltaChar.learned:[]){
    if(!clean(fact?.fact)||!clean(fact?.via))continue;
    const normalized=key(fact.fact);
    if(c.knowledge.some(e=>e.normalized===normalized))continue;
    c.knowledge.push({normalized,fact:fact.fact.trim(),via:fact.via.trim(),scene_id:scene.id,world_time:scene.world_time});
   }
   for(const belief of Array.isArray(deltaChar.beliefs)?deltaChar.beliefs:[]){
    const normalized=key(belief);if(!normalized||c.beliefs.some(e=>e.normalized===normalized))continue;
    c.beliefs.push({normalized,text:belief.trim(),scene_id:scene.id,world_time:scene.world_time});
   }
  }
 }
 const output=Array.from(characters.values()).map(c=>({
  name:c.name,origin:c.origin,introduced_scene_id:c.introduced_scene_id,
  initial:c.initial,state:c.state,
  knowledge:c.knowledge.map(({normalized,...rest})=>rest),
  beliefs:c.beliefs.map(({normalized,...rest})=>rest),
  history:c.history
 }));
 return {complete:true,scanned_scenes:(seed?.scanned_scenes||0)+scenes.length,characters:output,warnings,recovered_from_checkpoint:!!seed};
}
export function actorMemory(ledger,actorNames=[],{maxEntries=200}={}){
 const names=new Set(actorNames.map(key));
 return (ledger.characters||[]).filter(c=>names.has(key(c.name))).map(c=>({
  name:c.name,origin:c.origin,introduced_scene_id:c.introduced_scene_id,
  initial:c.initial,state:c.state,knowledge_total:c.knowledge.length,
  knowledge:c.knowledge.slice(-maxEntries),beliefs:c.beliefs.slice(-maxEntries),
  recent_updates:c.history.slice(-30)
 }));
}
export function knowledgeHas(ledger,actor,fact){
 const c=(ledger.characters||[]).find(x=>key(x.name)===key(actor));
 return !!c?.knowledge.some(x=>key(x.fact)===key(fact));
}

/** Bounded, non-authoritative NPC shortlist for the NEXT simulation interval.
 * This never claims that an unseen event already happened. A model must record
 * each new event separately with provenance before it enters canonical memory.
 */
export function offscreenCandidateBrief(ledger,{recentScenes=[],exclude=[],limit=14,currentTime='',cycle=0}={}){
 const blocked=new Set(exclude.map(key));
 const recent=recentScenes.map(s=>typeof s==='string'?s:String(s?.body||'')).join('\n').toLocaleLowerCase('ru');
 const year=Number(String(currentTime).slice(0,4))||null;
 const cap=Math.max(0,Math.min(20,Number.isInteger(limit)?limit:14));
 const all=(ledger?.characters||[]).filter(c=>c?.name&&!blocked.has(key(c.name))&&
  (c.initial?.role||c.initial_role)!=='hero'&&
  !!(c.state?.goals||c.initial?.goals||c.history?.length)).map(c=>{
  const history=Array.isArray(c.history)?c.history:[];
  const last=history.at(-1);
  const stamp=last?.world_time||c.last_recorded_time||null;
  const tokens=c.name.toLocaleLowerCase('ru').split(/\s+/).filter(x=>x.length>=4);
  const mentioned=tokens.some(t=>recent.includes(t));
  const origin=c.origin||'first_appearance';
  const entries=history.length||c.history_count||0;
  return {name:c.name,location:c.state?.location||'не уточнено',
   goals:c.state?.goals||c.initial?.goals||'не уточнены',
   last_recorded_time:stamp,latest_event:last?.type||c.last_event_type||null,
   knowledge_count:c.knowledge?.length??c.knowledge_count??0,
   belief_count:c.beliefs?.length??c.belief_count??0,
   origin,recently_mentioned:mentioned,history_count:entries};
 });
 const core=all.filter(x=>x.origin==='baseline');
 const recentCast=all.filter(x=>x.origin!=='baseline'&&x.last_recorded_time&&
  (!year||Number(x.last_recorded_time.slice(0,4))>=year-1));
 const older=all.filter(x=>!core.includes(x)&&!recentCast.includes(x));
 core.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
 recentCast.sort((a,b)=>(b.last_recorded_time||'').localeCompare(a.last_recorded_time||'')||
  b.history_count-a.history_count);
 older.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
 // Two rotating older NPCs keep long-absent cast from being permanently hidden,
 // but the shortlist itself never declares that anything happened.
 const rotationSlots=Math.min(2,Math.max(0,cap-core.length));
 const rotation=[];
 for(let i=0;i<rotationSlots&&i<older.length;i++)rotation.push(older[(Math.max(0,cycle)*rotationSlots+i)%older.length]);
 const used=new Set([...core,...rotation].map(x=>x.name));
 const result=[...core.slice(0,cap)];
 for(const c of recentCast)if(result.length<cap-rotation.length&&!used.has(c.name)){result.push(c);used.add(c.name);}
 for(const c of rotation)if(result.length<cap){result.push(c);used.add(c.name);}
 for(const c of older)if(result.length<cap&&!used.has(c.name)){result.push(c);used.add(c.name);}
 return result.slice(0,cap);
}
