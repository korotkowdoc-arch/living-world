/** Durable branch-derived character state and knowledge ledger.
 * Replays only valid scenes. No irreversible global mutation of a character card.
 * Learned facts and beliefs are DISTINCT: false beliefs cannot become world truth.
 */
const clean=v=>typeof v==='string'?v.trim():'';
const key=v=>clean(v).normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е');
const STATE_FIELDS=Object.freeze(['location','health','mood','status','goals','relationships','inventory']);
export function projectCharacterMemory(baselines=[],scenes=[],{getDelta}={}){
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
 return {complete:true,scanned_scenes:scenes.length,characters:output,warnings};
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
