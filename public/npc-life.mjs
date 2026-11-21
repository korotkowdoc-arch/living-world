/** NPC Life V1: source-bound plans and directed social state.
 * A plan is NOT an action, a relationship shift is NOT a numeric affection score,
 * and this projector does not run while ChatGPT is idle.
 */
export const NPC_PLAN_STATES=Object.freeze(['active','paused','blocked','completed','abandoned','superseded']);
const array=v=>Array.isArray(v)?v:[];
const word=v=>typeof v==='string'?v.trim():'';
const normalized=v=>word(v).normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е');
const bounded=(v,size)=>word(v).slice(0,size);
const id=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(v);
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

export function validateNpcPlanUpdates(value,sceneText='',npcOffscreen=[]){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>20)throw Error('npc_plan_updates: максимум 20 изменений.');
 const seen=new Set(),events=new Map(array(npcOffscreen).filter(e=>e?.id).map(e=>[e.id,e]));
 return value.map((e,i)=>{
  const where='npc_plan_updates['+i+']';
  if(!record(e)||!id(e.intention_id)||!NPC_PLAN_STATES.includes(e.status))
   throw Error(where+': нужен исходный intention_id и статус плана.');
  if(!word(e.actor)||e.actor.length>120||!word(e.reason)||e.reason.length>900)
   throw Error(where+': нужен действующий NPC и конкретная причина изменения.');
  if(seen.has(e.intention_id))throw Error(where+': два изменения одного намерения в одной сцене.');
  seen.add(e.intention_id);
  const basis=e.basis||'scene';
  let evidence='',related_offscreen_id='';
  if(basis==='scene'){
   evidence=word(e.evidence);
   if(!evidence||evidence.length>700||!String(sceneText).includes(evidence))
    throw Error(where+': требуется дословная опора из сцены.');
  }else if(basis==='offscreen'){
   related_offscreen_id=word(e.related_offscreen_id);
   const event=events.get(related_offscreen_id);
   if(!id(related_offscreen_id)||!event||normalized(event.actor)!==normalized(e.actor))
    throw Error(where+': событие NPC и актор должны совпадать с существующим npc_offscreen этой сцены.');
  }else throw Error(where+': basis должен быть scene или offscreen.');
  return {intention_id:e.intention_id,actor:word(e.actor),status:e.status,reason:word(e.reason),
   basis,evidence,related_offscreen_id};
 });
}
export function projectNpcPlanLedger(depth={}){
 const records=new Map(),warnings=[];
 for(const plan of array(depth.npc_intentions)){
  if(!id(plan?.id)||!word(plan.actor)||!word(plan.plan))continue;
  if(records.has(plan.id)){
   warnings.push({code:'PLAN_ID_REUSED',id:plan.id,scene_id:plan.scene_id||null});continue;
  }
  records.set(plan.id,{id:plan.id,actor:plan.actor,plan:plan.plan,motive:plan.motive||'',
   obstacle:plan.obstacle||'',state:'unresolved',last_reason:null,
   opened_scene_id:plan.scene_id||null,opened_at:plan.world_time||null,
   changed_scene_id:null,changed_at:null,source:plan});
 }
 for(const update of array(depth.npc_plan_updates)){
  if(!id(update?.intention_id))continue;
  const plan=records.get(update.intention_id);
  if(!plan){warnings.push({code:'UPDATE_UNKNOWN_INTENTION',id:update.intention_id,scene_id:update.scene_id||null});continue;}
  if(normalized(update.actor)!==normalized(plan.actor)){
   warnings.push({code:'PLAN_ACTOR_MISMATCH',id:plan.id,actor:update.actor});continue;
  }
  if(!NPC_PLAN_STATES.includes(update.status))continue;
  if(['completed','abandoned','superseded'].includes(plan.state)){
   warnings.push({code:'PLAN_ALREADY_TERMINAL',id:plan.id});continue;
  }
  plan.state=update.status;plan.last_reason=update.reason||null;
  plan.changed_scene_id=update.scene_id||null;plan.changed_at=update.world_time||null;
 }
 return {plans:[...records.values()],warnings};
}
export function validateNpcPlanTransitions(depth={},updates=[],intentions=[]){
 const ledger=projectNpcPlanLedger(depth);
 const map=new Map(ledger.plans.map(p=>[p.id,p]));
 const newly=new Map(array(intentions).filter(p=>p?.id).map(p=>[p.id,p]));
 for(const u of array(updates)){
  const original=map.get(u.intention_id)||newly.get(u.intention_id);
  if(!original)throw Error('Нельзя менять неизвестное намерение NPC: '+u.intention_id);
  if(normalized(original.actor)!==normalized(u.actor))
   throw Error('Намерение '+u.intention_id+' принадлежит другому NPC.');
  const current=original.state||'unresolved';
  if(['completed','abandoned','superseded'].includes(current))
   throw Error('Закрытое намерение '+u.intention_id+' нельзя возобновить. Создай новый план с отдельной причиной.');
 }
 return true;
}
/** The current goals/locations are derived from the active branch, NOT from baseline.
 * Input depth must belong to the same branch. Records are bounded for display,
 * but internal transition validation uses the complete ledger.
 */
export function npcLifeBrief({characters=[],depth={},complete=false,limit=14,exclude=[]}={}){
 const banned=new Set(array(exclude).map(normalized)),max=Math.min(30,Math.max(1,Math.floor(limit)||14));
 const ledger=projectNpcPlanLedger(depth),relationships=array(depth.relationships);
 const known=array(characters).filter(c=>word(c?.name)&&!banned.has(normalized(c.name)));
 const profiles=known.filter(c=>(c.initial?.role||c.initial_role||c.role||'npc')!=='hero');
 const actors=profiles.map(person=>{
  const name=person.name,key=normalized(name),state=person.state||person;
  const history=array(person.history);
  const health=word(state.health);
  const deceased=/^(умер|умерла|погиб|погибла|мёртв|мертв|dead|deceased)/i.test(health);
  const ownPlans=ledger.plans.filter(p=>normalized(p.actor)===key)
   .filter(p=>!['completed','abandoned','superseded'].includes(p.state));
  const social=relationships.filter(r=>normalized(r.from)===key||normalized(r.to)===key)
   .map(r=>({from:r.from,to:r.to,
    dimensions:Object.fromEntries(Object.entries(r.dimensions||{}).map(([dimension,e])=>[
     dimension,{shift:e.shift,interpretation:e.interpretation,unresolved:!!e.unresolved,
      rationale:bounded(e.rationale,280),scene_id:e.scene_id||null}
    ])),last_scene_id:array(r.history).at(-1)?.scene_id||null}));
  const offscreen=array(depth.confirmed_offscreen).filter(e=>normalized(e.actor)===key);
  return {name,origin:person.origin||'unknown',location:bounded(state.location,240),
   goals:bounded(state.goals,460),health:bounded(health,200),status:bounded(state.status,260),
   recent_event:history.at(-1)||null,
   known_facts:person.knowledge_count??array(person.knowledge).length,
   private_beliefs:person.belief_count??array(person.beliefs).length,
   pending_plans:ownPlans.slice(-5).map(({source,...p})=>p),
   confirmed_offscreen:offscreen.slice(-2).map(e=>({
    id:e.id,event:bounded(e.event,320),happened_at:e.happened_at||e.world_time||null,
    scene_id:e.scene_id||null,known_by:array(e.known_by).slice(0,10)})),
   social_connections:social.slice(-8),deceased,
   needs_causal_review:ownPlans.length>0||social.length>0||!!state.goals};
 });
 const valid=actors.filter(x=>!x.deceased);
 const useful=valid.filter(x=>x.pending_plans.length||x.social_connections.length);
 const extras=valid.filter(x=>!useful.includes(x));
 const choices=[...useful,...extras].slice(0,max);
 return {version:1,complete:!!complete,actor_count:actors.length,visible_count:choices.length,
  actor_profiles:choices,plan_ledger:{total:ledger.plans.length,
   unresolved:ledger.plans.filter(p=>p.state==='unresolved').length,
   active:ledger.plans.filter(p=>p.state==='active').length,
   blocked:ledger.plans.filter(p=>p.state==='blocked'||p.state==='paused').length},
  warnings:[...ledger.warnings,...(!complete?[{code:'INCOMPLETE_ACTIVE_BRANCH',
   note:'Не превращай отсутствие сведений в отсутствие событий.'}]:[])],
  rules:[
   'Намерения со статусом unresolved лишь записаны и могут устареть; проверь возможность их исполнения, не делай вид, что они свершились.',
   'Близость, раздражение, ревность, доверие и влечение — независимые направленные измерения; не превращай их в один показатель любви.',
   'У NPC есть свои пределы, расписание, работа, друзья и цели; реальная встреча требует времени, пути и мотива.',
   'Знания NPC и факты рассказчика отделены. Чужие секреты не становятся знаниями Гарри через раскрытие пульта.',
   'Инициатива — не событие. Состоявшееся за кадром сохраняй отдельно с основанием, датой и каналом знаний.',
   'Не устраивай секс/свидание по квоте, но и не стирай частную жизнь из повествования из-за расследования.'
  ]};
}
