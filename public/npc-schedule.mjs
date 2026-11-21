/** Source-bound one-off NPC commitments. No invented recurrence, geography, or travel times.
 * Tentative proposals are NOT confirmed meetings; missing schedule data is NOT free time.
 * Pure analysis of active scene ancestry; nothing runs in the background.
 */
export const NPC_SCHEDULE_ACTIONS=Object.freeze(['create','confirm','reschedule','cancel','complete']);
export const NPC_SCHEDULE_STATES=Object.freeze(['tentative','confirmed','cancelled','completed']);
const list=v=>Array.isArray(v)?v:[];
const word=v=>typeof v==='string'?v.trim():'';
const norm=v=>word(v).normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
const key=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(v);
function literalTime(value){
 const s=word(value);
 const m=s.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d)$/);
 if(!m)return false;
 const dt=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
 return dt.getUTCFullYear()===Number(m[1])&&dt.getUTCMonth()+1===Number(m[2])&&dt.getUTCDate()===Number(m[3]);
}
export function validScheduleInterval(start_at,end_at){
 if(!literalTime(start_at)||!literalTime(end_at)||start_at>=end_at)return false;
 // Maximum 7 days: longer commitments belong to timeline/calendar, not invented precision.
 return (Date.parse(end_at+'Z')-Date.parse(start_at+'Z'))<=7*86400000;
}
const intersects=(a,b)=>a.start_at<b.end_at&&b.start_at<a.end_at;
const shared=(a,b)=>a.participants.some(p=>b.participants.some(q=>norm(p)===norm(q)));
function actorList(value,ref){
 if(!Array.isArray(value)||value.length<1||value.length>12)
  throw Error(ref+': нужен список из 1–12 участников.');
 const people=value.map(word);
 if(people.some(p=>!p||p.length>120)||new Set(people.map(norm)).size!==people.length)
  throw Error(ref+': участники должны быть непустыми и уникальными.');
 return people;
}
/** Verify provenance of *one change*, not whether a character would truly agree.
 * Semantic consent, actual ability to travel and schedule truth must still be reviewed.
 */
export function validateNpcScheduleUpdates(value,sceneText='',offscreen=[]){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>12)throw Error('npc_schedule_updates: до 12 изменений на сцену.');
 const used=new Set(),sources=new Map(list(offscreen).filter(e=>e?.id).map(e=>[e.id,e]));
 return value.map((input,i)=>{
  const ref='npc_schedule_updates['+i+']';
  if(!input||typeof input!=='object'||Array.isArray(input)||!key(input.id)||
    !NPC_SCHEDULE_ACTIONS.includes(input.action))throw Error(ref+': нужен устойчивый id и действие.');
  if(used.has(input.id))throw Error(ref+': одно обязательство нельзя изменить дважды в одной сцене.');
  used.add(input.id);
  const actor=word(input.actor),reason=word(input.reason);
  if(!actor||actor.length>120||!reason||reason.length>900)
   throw Error(ref+': нужен инициатор и причинное обоснование.');
  const basis=input.basis||'scene';let evidence='',related_offscreen_id='';
  if(basis==='scene'){
   evidence=word(input.evidence);
   if(!evidence||evidence.length>700||!String(sceneText).includes(evidence))
    throw Error(ref+': evidence должен дословно встречаться в сохранённой сцене.');
  }else if(basis==='offscreen'){
   related_offscreen_id=word(input.related_offscreen_id);
   const source=sources.get(related_offscreen_id);
   if(!key(related_offscreen_id)||!source||norm(source.actor)!==norm(actor))
    throw Error(ref+': требуется npc_offscreen того же инициатора и этой же сцены.');
  }else throw Error(ref+': basis должен быть scene или offscreen.');
  const entry={id:input.id,action:input.action,actor,reason,basis,evidence,related_offscreen_id};
  if(['create','reschedule'].includes(input.action)){
   if(!validScheduleInterval(input.start_at,input.end_at))
    throw Error(ref+': нужен реальный точный интервал YYYY-MM-DDTHH:MM до семи суток; не придумывай дату.');
   entry.start_at=input.start_at;entry.end_at=input.end_at;
  }
  if(input.action==='create'){
   entry.participants=actorList(input.participants,ref+'.participants');
   if(!entry.participants.some(p=>norm(p)===norm(actor)))
    throw Error(ref+': инициатор должен быть участником личного обязательства.');
   entry.location=word(input.location);
   entry.purpose=word(input.purpose);
   if(!entry.location||entry.location.length>240||!entry.purpose||entry.purpose.length>650)
    throw Error(ref+': необходимо подтверждённое место и назначение.');
   entry.state=input.state||'tentative';
   if(!['tentative','confirmed'].includes(entry.state))
    throw Error(ref+': при создании возможны только tentative или confirmed.');
  }
  if(input.action==='reschedule'&&input.location!==undefined){
   entry.location=word(input.location);
   if(!entry.location||entry.location.length>240)throw Error(ref+': место должно быть указано корректно.');
  }
  return entry;
 });
}
/** One projector for new worlds and checkpoint replays; old events keep their original
 * provenance and cannot acquire new evidence through later annotations.
 */
export function projectNpcScheduleLedger(depth={}){
 const events=new Map(),warnings=[];
 for(const entry of list(depth.npc_schedule_updates)){
  if(!entry||!key(entry.id)||!NPC_SCHEDULE_ACTIONS.includes(entry.action))continue;
  const old=events.get(entry.id);
  if(entry.action==='create'){
   if(old){warnings.push({code:'SCHEDULE_ID_REUSED',id:entry.id,scene_id:entry.scene_id||null});continue;}
   if(!validScheduleInterval(entry.start_at,entry.end_at))continue;
   events.set(entry.id,{
    id:entry.id,participants:list(entry.participants).slice(),actor:entry.actor,
    purpose:entry.purpose,location:entry.location,
    start_at:entry.start_at,end_at:entry.end_at,state:entry.state||'tentative',
    opened_scene_id:entry.scene_id||null,last_scene_id:entry.scene_id||null,
    last_reason:entry.reason,history:[{action:'create',scene_id:entry.scene_id||null}]
   });
   continue;
  }
  if(!old){warnings.push({code:'SCHEDULE_UNKNOWN_ID',id:entry.id,scene_id:entry.scene_id||null});continue;}
  if(['cancelled','completed'].includes(old.state)){
   warnings.push({code:'SCHEDULE_TERMINAL_CHANGE',id:entry.id,scene_id:entry.scene_id||null});continue;
  }
  if(!list(old.participants).some(p=>norm(p)===norm(entry.actor))){
   warnings.push({code:'SCHEDULE_ACTOR_MISMATCH',id:entry.id,scene_id:entry.scene_id||null});continue;
  }
  if(entry.action==='confirm')old.state='confirmed';
  else if(entry.action==='cancel')old.state='cancelled';
  else if(entry.action==='complete')old.state='completed';
  else if(entry.action==='reschedule'){
   if(!validScheduleInterval(entry.start_at,entry.end_at))continue;
   old.start_at=entry.start_at;old.end_at=entry.end_at;
   if(entry.location)old.location=entry.location;
  }
  old.last_scene_id=entry.scene_id||null;old.last_reason=entry.reason;
  old.history.push({action:entry.action,scene_id:entry.scene_id||null});
 }
 return {events:[...events.values()],warnings};
}
/** Refuse impossible double bookings. No speculative travel times. */
export function validateNpcScheduleTransitions(depth={},updates=[],characters=[],currentTime=''){
 const current=projectNpcScheduleLedger(depth);
 if(current.warnings.length)throw Error('Календарь NPC содержит неподтверждённые переходы; сначала сверить первоисточники.');
 const existing=new Map(current.events.map(e=>[e.id,{...e}]));
 const known=new Set(list(characters).map(p=>norm(typeof p==='string'?p:p?.name)).filter(Boolean));
 const allowedTime=word(currentTime);
 for(const update of list(updates)){
  const item=existing.get(update.id);
  if(update.action==='create'){
   if(item)throw Error('Обязательство с ID '+update.id+' уже создано.');
   for(const p of update.participants){
    if(known.size&&!known.has(norm(p)))throw Error('Встреча включает неизвестного участника '+p+'.');
   }
   existing.set(update.id,{...update});
   if(allowedTime.length>=16&&update.start_at<allowedTime.slice(0,16))
    throw Error('Нельзя задним числом создавать новую будущую встречу: '+update.id);
   if(allowedTime.length>=10&&update.end_at.slice(0,10)<allowedTime.slice(0,10))
    throw Error('Нельзя создавать истекшее обязательство как будущее.');
  }else{
   if(!item)throw Error('Нет доказанного расписания с ID '+update.id+'.');
   if(!list(item.participants).some(p=>norm(p)===norm(update.actor)))
    throw Error('Этот NPC не является участником расписания '+update.id+'.');
   if(['cancelled','completed'].includes(item.state))
    throw Error('Завершённое/отменённое обязательство нельзя изменять: '+update.id);
   if(update.action==='confirm'){
    if(item.state!=='tentative')throw Error('Нельзя подтверждать уже согласованную встречу: '+update.id);
    item.state='confirmed';
   }
   if(update.action==='reschedule'){
    item.start_at=update.start_at;item.end_at=update.end_at;
    if(update.location)item.location=update.location;
   }
   if(update.action==='cancel')item.state='cancelled';
   if(update.action==='complete'){
    if(item.state!=='confirmed')throw Error('Нельзя завершить неподтверждённую встречу.');
    if(allowedTime.length>=16&&allowedTime.slice(0,16)<item.start_at)
     throw Error('Встреча ещё не наступила относительно времени сцены.');
    if(allowedTime.length>=10&&allowedTime.slice(0,10)<item.start_at.slice(0,10))
     throw Error('Встреча находится в будущем.');
    item.state='completed';
   }
  }
 }
 const confirmed=[...existing.values()].filter(e=>e.state==='confirmed');
 for(let i=0;i<confirmed.length;i++)for(let j=i+1;j<confirmed.length;j++){
  if(shared(confirmed[i],confirmed[j])&&intersects(confirmed[i],confirmed[j]))
   throw Error('Двойная запись NPC: '+confirmed[i].id+' и '+confirmed[j].id+
    ' имеют общих участников и пересекаются по времени.');
 }
 return true;
}
/** Availability means known scheduling conflicts ONLY, never a claim that a
 * free-looking person will agree to meet or could travel on time.
 */
export function npcMeetingFeasibility({
 characters=[],depth={},participants=[],start_at='',end_at='',location='',clock='',complete=false
}={}){
 const people=actorList(participants,'participants');
 if(!validScheduleInterval(start_at,end_at))throw Error('Проверь точный интервал встречи; неизвестный час нельзя подставить.');
 const known=new Map(list(characters).filter(p=>p?.name).map(p=>[norm(p.name),p]));
 const schedule=projectNpcScheduleLedger(depth);
 const blockers=[],reviews=[],proposals=[];
 for(const name of people){
  const person=known.get(norm(name));
  if(!person){reviews.push({person:name,code:'UNKNOWN_ACTOR',reason:'Нет полного подтверждённого профиля.'});continue;}
  const state=person.state||person;
  if(/^(мертв|мёртв|умер|умерла|погиб|погибла|dead|deceased)/i.test(word(state.health))){
   blockers.push({person:name,code:'DECEASED',reason:'Персонаж погиб или умер согласно состоянию.'});continue;
  }
  const at=word(state.location);
  if(word(location)&&at&&norm(location)!==norm(at))
   reviews.push({person:name,code:'TRAVEL_UNVERIFIED',reason:'Текущее местонахождение отличается от места встречи; маршрут и время дороги не подтверждены.'});
  if(!at)reviews.push({person:name,code:'LOCATION_UNKNOWN',reason:'Местонахождение не установлено.'});
 }
 for(const event of schedule.events){
  if(!shared({participants:people},event)||!intersects({start_at,end_at},event))continue;
  const collision={id:event.id,participants:event.participants,start_at:event.start_at,end_at:event.end_at};
  if(event.state==='confirmed')blockers.push({code:'KNOWN_SCHEDULE_CONFLICT',...collision});
  if(event.state==='tentative')proposals.push(collision);
 }
 if(word(clock).length>=16&&start_at<word(clock).slice(0,16))
  reviews.push({code:'REQUEST_IN_PAST',reason:'Запрошенный момент раньше установленного времени.'});
 if(!complete)reviews.push({code:'INCOMPLETE_MEMORY',reason:'Нельзя считать отсутствующие записи подтверждением свободы NPC.'});
 if(schedule.warnings.length)reviews.push({code:'INCONSISTENT_SCHEDULE',reason:'Есть противоречивые исторические записи расписания.'});
 const status=blockers.length?'blocked':reviews.length||proposals.length?'needs_review':'possible_unconfirmed';
 return {status,participants:people,start_at,end_at,location:word(location)||null,
  blockers,reviews,tentative_conflicts:proposals,
  confirmed_commitments_considered:schedule.events.filter(e=>e.state==='confirmed').length,
  disclaimer:'Отсутствие конфликта НЕ означает согласие, свободное время или возможность добраться. Никогда не назначай встречу без подтверждённой инициативы и канала связи.'};
}
export function npcScheduleBrief({characters=[],depth={},clock='',complete=false,limit=12}={}){
 const schedule=projectNpcScheduleLedger(depth);
 const active=schedule.events.filter(e=>['tentative','confirmed'].includes(e.state));
 const upcoming=active.filter(e=>!word(clock)||e.end_at.slice(0,10)>=word(clock).slice(0,10))
  .sort((a,b)=>a.start_at.localeCompare(b.start_at)).slice(0,Math.min(Math.max(1,limit),40));
 const elapsed=active.filter(e=>word(clock).length>=10&&e.end_at.slice(0,10)<word(clock).slice(0,10));
 return {version:1,complete:!!complete,world_clock:word(clock)||null,
  totals:{all:schedule.events.length,tentative:active.filter(e=>e.state==='tentative').length,
   confirmed:active.filter(e=>e.state==='confirmed').length,past_unresolved:elapsed.length},
  upcoming:upcoming.map(({history,...e})=>e),
  past_unresolved:elapsed.slice(-8).map(e=>({id:e.id,participants:e.participants,
   ended_at:e.end_at,state:e.state,source_scene_id:e.last_scene_id})),
  warnings:[...schedule.warnings,...(!complete?[{code:'INCOMPLETE_HISTORY'}]:[])],
  notes:[
   'Срок прошёл — встреча НЕ считается состоявшейся, отменённой или пропущенной без записи о результате.',
   'Предложение не равно согласию. Подтверждённая запись не гарантирует реальное появление участников.',
   'Отсутствие записи не доказывает свободное время. Работа, сон, боль, расстояние и личные ограничения требуют причинной проверки.'
  ]};
}
