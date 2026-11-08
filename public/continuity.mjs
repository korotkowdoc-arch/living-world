/** LIVING WORLD v0.5: structured continuity records attached to active scene ancestry.
 * No server migration: scene.prompt_note carries the optional LWSTATE1 record.
 */
export const NOTE_PREFIX = 'LWSTATE1:';
/** Preserve date precision: YYYY-MM means the day is genuinely unknown. */
export function validStoryClock(value) {
  if(typeof value!=='string')return false;
  const m=value.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01])(?:T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?)?$/);
  if(!m)return false;
  if(m[3]){
    const dt=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
    if(dt.getUTCFullYear()!==Number(m[1]) || dt.getUTCMonth()!==Number(m[2])-1 || dt.getUTCDate()!==Number(m[3]))return false;
  }
  return true;
}

const asText = value => typeof value === 'string' ? value.trim() : '';
const normalize = s => asText(s).toLocaleLowerCase('ru');
const uniqAppend = (items, newItems, limit = 120) => {
  const existing = new Set(items.map(normalize));
  for (const item of newItems) if (!existing.has(normalize(item))) {
    items.push(item); existing.add(normalize(item));
  }
  if (items.length > limit) items.splice(0, items.length - limit);
};
function textArray(value, field, limit=40) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit || value.some(s => typeof s !== 'string' || !s.trim() || s.length > 1100)) {
    throw Error(`Поле ${field} должно содержать не более ${limit} непустых строк до 1100 символов.`);
  }
  return value.map(s=>s.trim());
}
export function parseScenePackage(raw) {
  let input = asText(raw).replace(/^\uFEFF/, '');
  if(input.startsWith('```')) input=input.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'');
  const start=input.indexOf('{'), end=input.lastIndexOf('}');
  if(start<0 || end<start) throw Error('Скопируй весь JSON-пакет сцены с фигурными скобками.');
  let result;
  try { result=JSON.parse(input.slice(start,end+1)); }
  catch(e) { throw Error('Ошибка JSON пакета: '+e.message); }
  if(!result || typeof result !== 'object' || Array.isArray(result)) throw Error('Пакет должен быть JSON-объектом.');
  if(typeof result.scene !== 'string' || !result.scene.trim() || result.scene.length>150000) throw Error('Поле scene должно содержать текст сцены до 150000 символов.');
  if(result.world_time !== undefined && !validStoryClock(result.world_time)) throw Error('Время: YYYY-MM, YYYY-MM-DD или YYYY-MM-DDTHH:MM:SS. Не придумывай неизвестный день или час.');
  const c=result.changes;
  if(!c || typeof c !== 'object' || Array.isArray(c)) throw Error('Добавь объект changes для отслеживания последствий.');
  const changes={
    facts:textArray(c.facts,'changes.facts'),
    open_threads:textArray(c.open_threads,'changes.open_threads'),
    resolved_threads:textArray(c.resolved_threads,'changes.resolved_threads'),
    offscreen_events:textArray(c.offscreen_events,'changes.offscreen_events'),
    characters:[],
  };
  if(c.characters!==undefined && (!Array.isArray(c.characters) || c.characters.length>30)) throw Error('changes.characters должен быть массивом до 30 персонажей.');
  const seenNames=new Set();
  for(const [i,char] of (c.characters||[]).entries()) {
    if(!char || typeof char!=='object' || Array.isArray(char) || !asText(char.name)) throw Error(`Изменение персонажа ${i+1}: укажи имя.`);
    if(seenNames.has(normalize(char.name))) throw Error('Имя персонажа повторяется в changes.characters.');
    seenNames.add(normalize(char.name));
    const ch={name:asText(char.name)};
    for(const f of ['location','health','mood','status','goals','relationships','inventory']) {
      if(char[f]!==undefined){
        if(typeof char[f]!=='string' || char[f].length>3000) throw Error(`${char.name}: поле ${f} должно быть строкой до 3000 символов.`);
        ch[f]=char[f].trim();
      }
    }
    ch.beliefs=textArray(char.beliefs,`${char.name}.beliefs`,20);
    if(char.learned!==undefined && (!Array.isArray(char.learned) || char.learned.length>20)) throw Error(`${char.name}.learned должен быть массивом до 20 записей.`);
    ch.learned=(char.learned||[]).map((k,j)=>{
      if(!k || typeof k!=='object' || typeof k.fact!=='string' || !k.fact.trim() || typeof k.via!=='string' || !k.via.trim() || k.fact.length>1100 || k.via.length>500){throw Error(`${char.name}.learned[${j}]: нужны fact и via — способ, которым персонаж узнал факт.`);}
      return {fact:k.fact.trim(),via:k.via.trim()};
    });
    changes.characters.push(ch);
  }
  const decisions=result.decisions??[];
  if(!Array.isArray(decisions)||decisions.length>4)throw Error('decisions: нужно не более 4 вариантов.');
  const found=new Set();
  for(const [i,d] of decisions.entries()){
    if(!d||typeof d!=='object'||Array.isArray(d)||typeof d.id!=='string'||typeof d.label!=='string'||typeof d.description!=='string'||!d.id.trim()||!d.label.trim()||d.id.length>30||d.label.length>200||d.description.length>800)throw Error('decisions['+i+']: нужны id, label и description.');
    if(found.has(d.id))throw Error('decisions: повторяющийся id.');found.add(d.id);
  }
  return {scene:result.scene.trim(),world_time:result.world_time||null,changes,decisions};
}
export function packSceneNote(changes, directorNote='', decisions=[]) {
  const note=NOTE_PREFIX+JSON.stringify({v:1,director_note:asText(directorNote).slice(0,1200),delta:changes,decisions:decisions.slice(0,4)});
  if(note.length>10000)throw Error('Слишком много изменений для одной сцены. Сократи пакет до 10000 символов метаданных.');
  return note;
}
export function readSceneNote(value) {
  if(typeof value!=='string' || !value.startsWith(NOTE_PREFIX))return null;
  try { const obj=JSON.parse(value.slice(NOTE_PREFIX.length)); return obj?.v===1 && obj.delta ? obj : null; }
  catch { return null; }
}
export function makeContinuity(characters=[],scenes=[]) {
  const memory={facts:[],open_threads:[],offscreen_events:[],characters:{},tracked_scenes:0,scanned_scenes:scenes.length};
  for(const ch of characters) memory.characters[ch.name]={name:ch.name,role:ch.role,description:ch.description,personality:ch.personality,goals:ch.goals,relationships:ch.relationships,knowledge:ch.knowledge,location:ch.location,health:ch.health,mood:ch.mood,status:ch.status,inventory:ch.inventory,learned:[],beliefs:[]};
  for(const scene of scenes) {
    const packet=readSceneNote(scene.prompt_note);
    if(!packet)continue;
    const change=packet.delta;memory.tracked_scenes++;
    uniqAppend(memory.facts,change.facts||[],150);
    uniqAppend(memory.open_threads,change.open_threads||[],100);
    const closed=new Set((change.resolved_threads||[]).map(normalize));
    memory.open_threads=memory.open_threads.filter(s=>!closed.has(normalize(s)));
    uniqAppend(memory.offscreen_events,change.offscreen_events||[],70);
    for(const changeChar of (change.characters||[])) {
      const name=asText(changeChar.name);
      const key=Object.keys(memory.characters).find(k=>normalize(k)===normalize(name))||name;
      const current=memory.characters[key]||(memory.characters[key]={name:key,learned:[],beliefs:[]});
      for(const field of ['location','health','mood','status','goals','relationships','inventory']) if(changeChar[field]!==undefined && changeChar[field]!=='')current[field]=changeChar[field];
      const seen=new Set((current.learned||[]).map(v=>normalize(v.fact)));
      for(const knowledge of (changeChar.learned||[])) if(!seen.has(normalize(knowledge.fact))) {current.learned.push({...knowledge,scene_id:scene.id});seen.add(normalize(knowledge.fact));}
      if(current.learned.length>100)current.learned=current.learned.slice(-100);
      uniqAppend(current.beliefs,changeChar.beliefs||[],100);
    }
  }
  return memory;
}
export function compactMemory(memory) {
  return {facts:memory.facts.slice(-80),open_threads:memory.open_threads.slice(-50),offscreen_events:memory.offscreen_events.slice(-30),characters:Object.values(memory.characters).map(c=>({name:c.name,description:c.description,personality:c.personality,goals:c.goals,relationships:c.relationships,knowledge_at_genesis:c.knowledge,learned:(c.learned||[]).slice(-30),beliefs:(c.beliefs||[]).slice(-25),location:c.location,health:c.health,mood:c.mood,status:c.status,inventory:c.inventory}))};
}
export function scenePackagePrompt(narrativePrompt,memory,clock) {
  const state=compactMemory(memory);
  return `${narrativePrompt}\n\nПАМЯТЬ ДЕЙСТВУЮЩЕЙ ВЕТКИ (не приписывай её знания всем персонажам):\n${JSON.stringify(state,null,2)}\n\nВерни ТОЛЬКО один валидный JSON-объект без Markdown:\n{\n  "scene": "Цельная художественная сцена; не сокращай её ради отчёта",\n  "world_time": "${clock}",\n  "changes": {\n    "facts": ["Только новые подтверждённые произошедшие факты"],\n    "open_threads": ["Новые ещё не закрытые линии без обещанных исходов"],\n    "resolved_threads": ["Точные формулировки уже закрытых линий из open_threads"],\n    "offscreen_events": ["Только причинно возможные события вне сцены"],\n    "characters": [{"name":"Имя изменившегося персонажа","location":"Новое место, если оно изменилось","health":"Новое состояние здоровья, если изменилось","mood":"Настроение, если изменилось","status":"Социальный статус, если изменился","goals":"Новые цели, если изменились","relationships":"Изменение связи, если оно произошло","inventory":"Изменившиеся ресурсы","learned":[{"fact":"Что точно узнал именно этот персонаж","via":"Реальный канал, через который он узнал"}],"beliefs":["Субъективная версия, которая может быть неверной"]}]\n  }\n}\nЕсли день или час не установлен, сохраняй исходную точность world_time (например, YYYY-MM); не придумывай дату ради формата. Если нет изменений, оставь соответствующий массив пустым и не выдумывай события. В поле characters включай только тех, чьё состояние действительно изменилось. Никаких событий из отменённых веток. Сначала художественная причинность, затем достоверные последствия.`;
}
