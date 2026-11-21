/** Source-bound calendar windows. No canonical events are generated here.
 * Inputs are explicit Year Anchor documents / world.timeline, never a title heuristic.
 * Planned anchors are NOT played outcomes; uncertain dates remain uncertain.
 */
export const CALENDAR_OUTCOMES=Object.freeze(['occurred','altered','unavailable']);
const MONTHS={январ:1,феврал:2,март:3,апрел:4,ма:5,июн:6,июл:7,август:8,сентябр:9,октябр:10,ноябр:11,декабр:12};
const MONTH_PATTERN=/(январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])/gi;
const norm=v=>String(v??'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[–—−]/g,'-').trim();
const lineText=v=>typeof v==='string'?v.trim():'';
const isId=v=>/^Y[1-7]-\d{2}$/.test(v);
const pad=n=>String(n).padStart(2,'0');
const lastDay=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
function monthNumber(word){const x=norm(word);if(x.startsWith('май')||x.startsWith('мая'))return 5;const pair=Object.entries(MONTHS).find(([key])=>x.startsWith(key));return pair?.[1]||null;}
function dateText(y,m,d){if(!Number.isInteger(y)||!m||!d||d<1||d>lastDay(y,m))return null;return y+'-'+pad(m)+'-'+pad(d);}
function parseYearMap(content){
 const out=new Map();
 for(const m of String(content).matchAll(/\bY([1-7])\s*:\s*(\d{4})\s*[-–—]\s*(\d{4})/g)){
  const start=Number(m[2]),end=Number(m[3]);
  if(end===start+1)out.set('Y'+m[1],{start,end});
 }
 return out;
}
function parseWindow(label,range){
 const input=norm(label),months=[...input.matchAll(MONTH_PATTERN)].map(m=>({name:m[0],month:monthNumber(m[0]),index:m.index}));
 const explicit=input.match(/\b(19\d{2}|20\d{2})\b/);
 const yearFor=m=>explicit?Number(explicit[1]):range?(m>=7?range.start:range.end):null;
 if(!months.length)return {precision:'relative',start:null,end:null,reason:'Нет установленного месяца или зависимость от предыдущего события.'};
 const relative=/^(?:сразу после|после финала|та же ночь|та же|через несколько дней|лето|зима)/.test(input)||
  /после y[1-7]/.test(input);
 if(relative)return {precision:'relative',start:null,end:null,reason:'Окно зависит от фактически сыгранного предшествующего события.'};
 const first=months[0],last=months.at(-1);
 if(!first.month||!last.month)return {precision:'relative',start:null,end:null,reason:'Неизвестный месяц.'};
 const y1=yearFor(first.month),y2=yearFor(last.month);
 if(!y1||!y2)return {precision:'unresolved_year',start:null,end:null,reason:'Источник не устанавливает соответствие учебного года календарному.'};
 const beforeFirst=input.slice(0,first.index);
 const numbers=[...beforeFirst.matchAll(/\b(\d{1,2})\b/g)].map(m=>Number(m[1]));
 // "Ночь 1-2 мая" / "1-15 июня" identify a day range, not an exact day.
 const dayRange=beforeFirst.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\s*$/);
 if(dayRange){
  const d1=Number(dayRange[1]),d2=Number(dayRange[2]);
  const begin=dateText(y1,first.month,d1),end=dateText(y1,first.month,d2);
  if(begin&&end&&begin<=end)return {precision:'day_range',start:begin,end,reason:'Явный диапазон дней в источнике.'};
 }
 if(numbers.length&&/\b\d{1,2}\s*$/.test(beforeFirst)){
  const at=dateText(y1,first.month,numbers.at(-1));
  if(at)return {precision:'day',start:at,end:at,reason:'День указан непосредственно в источнике.'};
 }
 const start=dateText(y1,first.month,1),end=dateText(y2,last.month,lastDay(y2,last.month));
 if(!start||!end||start>end)return {precision:'unresolved_year',start:null,end:null,reason:'Неоднозначный порядок месяцев.'};
 return {precision:first.month===last.month?'month':'month_range',start,end,
  reason:'Месячное окно: точный день не указан, календарная дата события не назначена.'};
}
export function parseAnchorCalendar(sources=[]){
 if(!Array.isArray(sources))throw Error('Источники календаря должны быть массивом.');
 const found=new Map(),warnings=[];
 for(const source of sources){
  if(!source||typeof source.content!=='string'||!['year_anchors','world_timeline'].includes(source.category))continue;
  const years=parseYearMap(source.content),origin=lineText(source.reference)||source.category;
  for(const row of source.content.split(/\r?\n/)){
   if(!/\bY[1-7]-\d{2}\b/.test(row)||!row.includes('|'))continue;
   const cols=row.split('|').map(lineText);
   if(cols.length<3||cols.length>8)continue;
   let index=cols.findIndex(c=>isId(c));
   if(index<1||!cols[index+1])continue;
   const id=cols[index],window=cols[index-1],title=cols[index+1];
   if(title.length>280||window.length>150)continue;
   const details=cols.slice(index+2).join(' | ').slice(0,600);
   if(found.has(id)){warnings.push({code:'DUPLICATE_ANCHOR',id,source:origin});continue;}
   const parsed=parseWindow(window,years.get(id.slice(0,2))||null);
   found.set(id,{id,title,window,details,source:origin,year:id.slice(0,2),...parsed});
  }
 }
 return {complete:found.size>0,anchors:[...found.values()].sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999')||a.id.localeCompare(b.id)),
  warnings,source_count:sources.filter(x=>x?.category==='year_anchors'||x?.category==='world_timeline').length,
  note:found.size?'Временные окна извлечены из загруженных исходных строк; календарь не предписывает исход.':'Ни одного проверяемого окна Year Anchors не найдено: НЕ восстанавливай календарь по книжному сюжету.'};
}
export function validateCalendarUpdates(value,scene='',npcOffscreen=[]){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>8)throw Error('calendar_updates: максимум восемь подтверждённых календарных итогов.');
 const ids=new Set();
 return value.map((raw,i)=>{
  const ref='calendar_updates['+i+']';
  if(!raw||!isId(raw.id)||!CALENDAR_OUTCOMES.includes(raw.outcome))
   throw Error(ref+': нужен ID Y1-06 и outcome occurred/altered/unavailable.');
  if(ids.has(raw.id))throw Error(ref+': повторный календарный ID.');
  ids.add(raw.id);
  const reason=lineText(raw.reason);
  if(!reason||reason.length>900)throw Error(ref+': нужен конкретный причинный итог.');
  const source_kind=raw.source_kind||'scene';
  if(!['scene','offscreen'].includes(source_kind))throw Error(ref+': источник должен быть сценой или действительным событием NPC.');
  let evidence='',source_ref='';
  if(source_kind==='scene'){
   evidence=lineText(raw.evidence);
   if(!evidence||evidence.length>650||!String(scene).includes(evidence))
    throw Error(ref+': дословная опора на сохранённую сцену обязательна.');
  }else{
   source_ref=lineText(raw.source_ref);
   if(!source_ref||!npcOffscreen.some(e=>e?.id===source_ref))
    throw Error(ref+': нужен источник из npc_offscreen той же сцены.');
  }
  return {id:raw.id,outcome:raw.outcome,reason,source_kind,source_ref,evidence};
 });
}
function changesOf(scene){
 if(scene?.changes&&typeof scene.changes==='object')return scene.changes;
 if(scene?.delta&&typeof scene.delta==='object')return scene.delta;
 if(typeof scene?.prompt_note==='string'&&scene.prompt_note.startsWith('LWSTATE1:')){
  try{return JSON.parse(scene.prompt_note.slice(9))?.delta||{};}catch{return {};}
 }
 return {};
}
export function projectCalendarHistory(scenes=[]){
 const states=new Map();
 for(const scene of Array.isArray(scenes)?scenes:[]){
  for(const u of Array.isArray(changesOf(scene).calendar_updates)?changesOf(scene).calendar_updates:[]){
   if(!isId(u.id)||!CALENDAR_OUTCOMES.includes(u.outcome))continue;
   states.set(u.id,{...u,scene_id:scene.id||null,world_time:scene.world_time||null});
  }
 }
 return [...states.values()];
}
function storyInterval(v){
 const s=lineText(v);
 if(!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(s))return null;
 const year=Number(s.slice(0,4)),month=Number(s.slice(5,7));
 const day=s.length>=10?Number(s.slice(8,10)):null;
 const start=dateText(year,month,day||1),end=dateText(year,month,day||lastDay(year,month));
 return start&&end?{start,end,precision:day?'day':'month'}:null;
}
export function calendarDirectorBrief({sources=[],scenes=[],clock='',complete=false,limit=18}={}){
 const parsed=parseAnchorCalendar(sources),current=storyInterval(clock);
 const historical=projectCalendarHistory(scenes);
 const statuses=new Map(historical.map(u=>[u.id,u]));
 const rows=parsed.anchors.map(a=>{
  const recorded=statuses.get(a.id);
  let state='uncertain_window';
  if(recorded)state=recorded.outcome;
  else if(a.start&&a.end&&current){
   if(current.start>a.end)state='past_unconfirmed';
   else if(current.end<a.start)state='upcoming';
   else state='window_review';
  }else if(a.precision==='relative')state='dependency_review';
  return {...a,state,recorded:recorded||null};
 });
 const follow=rows.filter(x=>['window_review','past_unconfirmed'].includes(x.state));
 const soon=rows.filter(x=>x.state==='upcoming').slice(0,Math.max(0,limit));
 const dependency=rows.filter(x=>x.state==='dependency_review').slice(0,5);
 return {complete:!!complete&&parsed.complete,source_ready:parsed.complete,
  current_clock:clock||null,clock_precision:current?.precision||null,
  counts:{total:rows.length,confirmed:rows.filter(x=>x.recorded).length,
   review:follow.length,upcoming:rows.filter(x=>x.state==='upcoming').length,dependent:rows.filter(x=>x.state==='dependency_review').length},
  review:follow.slice(0,Math.max(0,limit)),upcoming:soon,dependencies:dependency,
  warnings:parsed.warnings,source_note:parsed.note,
  rule:'Это список возможностей и незакрытых календарных проверок, НЕ приказ воспроизвести канонический исход. Если узел стал невозможен по AU, зафиксируй unavailable только с реальным подтверждением. Старый пропущенный узел нельзя разыгрывать задним числом.'};
}
