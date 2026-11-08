import {projectCompanion,formatAmount} from './world-ledger.mjs';
import {projectCharacterMemory} from './world-character-memory.mjs';
import {projectCausalMemory} from './world-causality.mjs';
import {readSceneNote} from './continuity.mjs';

/** Build a source-cited, auditable YEAR DOCUMENT from the active scene ancestry.
 *  This is a factual draft, not an AI claim about unrecorded events.
 *  It never invents an event, a relationship, a balance or a completed year.
 */
export function yearArchiveKey(from,to,branchId){
 if(!/^[0-9a-f-]{36}$/i.test(branchId||''))throw Error('Неизвестная ветка архива.');
 return 'year-'+from+'-'+to+'-'+branchId.toLowerCase();
}
const dateMonth=value=>String(value||'').slice(0,7);
const line=(value)=>String(value??'').replace(/\s+/g,' ').trim();
const arr=value=>Array.isArray(value)?value:[];
const bullet=(values,empty='Не зафиксировано')=>values.length?values.map(s=>'- '+s).join('\n'):'- '+empty;
const sceneRef=s=>'`'+s.id+'`'+' ('+line(s.world_time||'время неизвестно')+')';
const validPeriod=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v||'');
const monthsBetween=(from,to)=>(Number(to.slice(0,4))-Number(from.slice(0,4)))*12+(Number(to.slice(5))-Number(from.slice(5)));

export function buildYearArchive({world,branch,scenes=[],characters=[],from,to,allowPartial=false}={}){
 if(!world?.id||!branch?.id||world.active_branch_id!==branch.id)
  throw Error('Для архива требуется действующая ветка выбранного мира.');
 if(!validPeriod(from)||!validPeriod(to)||monthsBetween(from,to)<0||monthsBetween(from,to)>12)
  throw Error('Укажи годовой период от YYYY-MM до YYYY-MM, не длиннее 13 календарных месяцев.');
 if(!Array.isArray(scenes)||!scenes.length)throw Error('Сначала сохрани хотя бы одну сцену в действующей ветке.');
 if(branch.head_scene_id!==scenes.at(-1).id)
  throw Error('Архив нельзя создавать по устаревшей цепочке. Перечитай сцены.');
 const latest=dateMonth(scenes.at(-1).world_time);
 if(!validPeriod(latest))throw Error('Дата последней сцены не установлена. Нельзя корректно пересчитать год.');
 const completed=latest>=to;
 if(!completed&&!allowPartial)
  throw Error('Этот период ещё не завершён в сохранённых сценах. Не создавай Year Document заранее.');
 const selected=scenes.filter(s=>dateMonth(s.world_time)>=from&&dateMonth(s.world_time)<=to);
 if(!selected.length)throw Error('В выбранном году нет подтверждённых сцен.');
 const beforeOrAt=scenes.filter(s=>dateMonth(s.world_time)<=to);
 const read=s=>readSceneNote(s.prompt_note)?.delta||{};
 const assets=projectCompanion(beforeOrAt,{getDelta:read,strict:false});
 const people=projectCharacterMemory(characters,beforeOrAt,{getDelta:read});
 const causal=projectCausalMemory(beforeOrAt,{getDelta:read});
 const errors=[...assets.issues.map(i=>i.error),...people.warnings.map(i=>i.code),...causal.warnings.map(i=>i.code)];
 if(errors.length)throw Error('Годовой архив нельзя признать достоверным: '+errors.slice(0,4).join('; '));
 const chronology=[];
 let missing=0;
 for(const s of selected){
  const d=read(s);
  const parts=[];
  for(const [key,label] of [['facts','Факты'],['open_threads','Открытые линии'],['resolved_threads','Закрытые линии'],['offscreen_events','Вне кадра']]){
   for(const value of arr(d[key]))if(line(value))parts.push('  - '+label+': '+line(value));
  }
  for(const item of arr(d.items))parts.push('  - Предмет: '+line(item.action)+' / '+line(item.item_id)+' / '+line(item.reason));
  for(const money of arr(d.economy))parts.push('  - Финансы: '+line(money.action)+' / '+line(money.account)+' / '+line(money.currency)+' / '+line(money.reason));
  for(const npc of arr(d.new_characters))parts.push('  - Новый NPC: '+line(npc.name)+'; '+line(npc.causal_link));
  for(const person of arr(d.characters)){
   const modified=['location','health','mood','status','goals','relationships','inventory']
    .filter(k=>line(person[k])).map(k=>k+'='+line(person[k]));
   if(modified.length)parts.push('  - '+line(person.name)+': '+modified.join('; '));
   for(const learned of arr(person.learned))parts.push('  - '+line(person.name)+' узнал: '+line(learned.fact)+' (канал: '+line(learned.via)+')');
   for(const belief of arr(person.beliefs))parts.push('  - Убеждение '+line(person.name)+': '+line(belief));
  }
  if(!parts.length){
   missing++;
   parts.push('  - Нет структурированного пакета последствий; подтверждённые события нужно читать из полного текста этой действующей сцены.');
   const raw=typeof s.body==='string'?s.body.trim():'';
   if(raw){
    const excerpt=raw.length>14000?raw.slice(0,7000)+'\n[СЕРЕДИНА ОПУЩЕНА; ПРОЧИТАЙ ПОЛНЫЙ ТЕКСТ СЦЕНЫ ПО ID]\n'+raw.slice(-7000):raw;
    parts.push('  - Первичный текст ВАЛИДНОЙ редакции сцены, не структурированный факт ('+raw.length+' символов):\n'+
     excerpt.split('\n').map(v=>'> '+v).join('\n')+
     (raw.length>14000?'\n  - Текст показан не полностью; извлеки последствия только после чтения полной сцены.':''));
   }else parts.push('  - Текст этой сцены не был загружен. Получи его по ID, не возвращай старый отменённый хвост.');
  }
  chronology.push('### '+sceneRef(s)+'\n'+parts.join('\n'));
 }
 const activeItems=assets.items.filter(i=>i.exists).map(i=>line(i.label)+' [`'+line(i.id)+'`]; собственник '+line(i.owner)+'; держатель '+line(i.holder||'не установлен')+'; место '+line(i.location||'не установлено')+'; состояние '+line(i.condition||'не установлено'));
 const lostItems=assets.items.filter(i=>!i.exists).map(i=>line(i.label)+' [`'+line(i.id)+'`] — использован или утрачен по журналу');
 const npcItems=assets.new_characters.map(c=>line(c.name)+' — '+line(c.description)+'; происхождение: '+line(c.causal_link));
 const characterItems=people.characters.map(p=>{
  const st=p.state||{};
  const changes=['location','health','mood','status','goals','relationships','inventory'].map(k=>k+': '+line(st[k]||'не зафиксировано')).join('; ');
  return '### '+line(p.name)+'\n'+changes+'\nЛичные знания: '+p.knowledge.length+
   '; убеждения: '+p.beliefs.length+
   '. Последние знания с каналами: '+(p.knowledge.slice(-25).map(k=>line(k.fact)+' ('+line(k.via)+', `'+k.scene_id+'`)').join(' | ')||'не зафиксированы')+
   '. Последние убеждения: '+(p.beliefs.slice(-15).map(b=>line(b.text)+' (`'+b.scene_id+'`)').join(' | ')||'не зафиксированы');
 });
 const recentFacts=causal.facts.filter(f=>dateMonth(f.world_time)>=from&&dateMonth(f.world_time)<=to).map(f=>line(f.text)+' — `'+f.scene_id+'`');
 const accounts=assets.accounts.map(acc=>acc.person+' / '+acc.currency+': '+formatAmount(acc));
 const text=[
  (completed?'# YEAR DOCUMENT · ':'# РАБОЧАЯ СВОДКА ГОДА · ')+from+' — '+to,
  'LW_ARCHIVE_WORLD_ID: '+world.id,
  'LW_ARCHIVE_BRANCH_ID: '+branch.id,
  'LW_ARCHIVE_ACTIVE_HEAD: '+beforeOrAt.at(-1).id,
  'LW_ARCHIVE_CREATED_FROM_HEAD: '+branch.head_scene_id,
  '',
  '> Автоматический фактологический архив. Он основан ТОЛЬКО на действующей ветке и структурированных последствиях. Он не подменяет полные тексты сцен, не добавляет новые факты и не считается литературной интерпретацией. Перед признанием итогов года сверяй важные сцены вручную.',
  '',
  '## Покрытие',
  '- Мир: '+line(world.name),
  '- Период: '+from+' — '+to,
  '- Состояние периода: '+(completed?'завершён по игровой дате':'ещё продолжается, это не итог завершённого года'),
  '- Сцен в периоде: '+selected.length,
  '- Последняя сцена периода: '+sceneRef(beforeOrAt.at(-1)),
  '- Сцен без структурированных последствий в периоде: '+missing,
  '- Все ссылки ниже ведут к неизменяемым ID исходных сцен текущей ветки.',
  '',
  '## Подтверждённые факты года',
  bullet(recentFacts,'Структурированные факты не зафиксированы; смотри хронологию.'),
  '',
  '## Хронология и последствия по каждой сцене',
  chronology.join('\n\n'),
  '',
  '## Открытые линии к концу периода',
  bullet(causal.open_threads.map(t=>line(t.text)+' — `'+t.opened_scene_id+'`')),
  '',
  '## Закрытые линии к концу периода',
  bullet(causal.resolved_threads.map(t=>line(t.text)+' — завершена в `'+t.last_scene_id+'`')),
  '',
  '## Имущество на конец периода',
  bullet(activeItems),
  '',
  '## Использованные или утраченные предметы',
  bullet(lostItems),
  '',
  '## Денежные счета на конец периода',
  bullet(accounts,'Подтверждённых счетов нет. Отсутствие счёта не означает нулевой баланс.'),
  '',
  '## Новые персонажи действующей ветки',
  bullet(npcItems),
  '',
  '## Состояние и личные знания персонажей на конец периода',
  characterItems.join('\n\n')||'Профили не зафиксированы.',
  '',
  '## Контроль преемственности',
  '- Факты, не представленные в структурированных пакетах, могут содержаться только в полных текстах сцен.',
  '- Архивный HEAD фиксирует исходную редакцию. После «На это:» актуальная сводка ПЕРЕСЧИТЫВАЕТСЯ по всем действующим сценам до и после правки; отменённые события не переносятся.',
  '- Year Document НЕ является техническим snapshot и не устраняет лимит полного пересчёта истории.',
  '- При создании новой редакции старые редакции не переписываются.',
  ''
 ].join('\n');
 if(text.length>200000)throw Error('Годовой архив превышает 200 000 символов. Архивируй более короткий период, не обрезая события.');
 return {key:yearArchiveKey(from,to,branch.id),title:'YEAR DOCUMENT · '+from+' — '+to+' · '+line(world.name),
  content:text,from,to,branch_id:branch.id,source_head:branch.head_scene_id,year_end_head:beforeOrAt.at(-1).id,
  scene_count:selected.length,unstructured_scenes:missing,characters:people.characters.length,completed,
  source_scene_ids:selected.map(s=>s.id)};
}

/** Generated Year Documents are historical versions. They are NEVER allowed to
 * dictate current canon after a revision. We extract their calendar range only,
 * then reconstruct all facts from the CURRENT ancestry (before + after fork).
 * There is no all-or-nothing invalidation of a whole year's valid events.
 */
export function yearArchiveMetadata(doc){
 if(doc?.category!=='year_document')return null;
 const content=String(doc.content||'');
 const head=content.match(/^LW_ARCHIVE_ACTIVE_HEAD:\s*([0-9a-f-]{36})\s*$/im);
 const sourceWorld=content.match(/^LW_ARCHIVE_WORLD_ID:\s*([0-9a-f-]{36})\s*$/im);
 const range=content.match(/^# YEAR DOCUMENT · (\d{4}-\d{2}) — (\d{4}-\d{2})\s*$/m);
 if(!head||!sourceWorld||!range||!validPeriod(range[1])||!validPeriod(range[2]))return null;
 return {world_id:sourceWorld[1].toLowerCase(),from:range[1],to:range[2],source_head:head[1].toLowerCase()};
}

export function reconcileYearDocuments({documents=[],world,branch,scenes=[],characters=[]}={}){
 if(!world?.id||!branch?.id||branch.id!==world.active_branch_id||
  !Array.isArray(scenes)||!scenes.length||scenes.at(-1).id!==branch.head_scene_id)
  throw Error('Нельзя пересогласовать документы без полной актуальной цепочки.');
 const canonical=[],liveSummaries=[],warnings=[];
 const byPeriod=new Map();
 for(const doc of documents){
  const meta=yearArchiveMetadata(doc);
  if(!meta){canonical.push(doc);continue;}
  if(meta.world_id!==world.id.toLowerCase()){
   warnings.push({code:'WRONG_YEAR_ARCHIVE_WORLD',doc_key:doc.doc_key});
   continue;
  }
  const key=meta.from+'|'+meta.to;
  if(!byPeriod.has(key))byPeriod.set(key,[]);
  byPeriod.get(key).push({doc,meta});
 }
 const ids=new Set(scenes.map(s=>String(s.id).toLowerCase()));
 for(const [period,records] of byPeriod){
  // All archived versions of the same year point to ONE live timeline.
  const {meta}=records.at(-1);
  const yearScenes=scenes.filter(s=>dateMonth(s.world_time)>=meta.from&&dateMonth(s.world_time)<=meta.to);
  if(!yearScenes.length){
   warnings.push({code:'YEAR_NO_CURRENT_EVENTS',period,
    reason:'В действующей ветке пока нет подтверждённых событий этого периода.'});
   continue;
  }
  const lastYearScene=yearScenes.at(-1);
  const reusable=records.find(({meta:m})=>ids.has(m.source_head)&&
    m.source_head===lastYearScene.id.toLowerCase()&&
    m.from===meta.from&&m.to===meta.to);
  // Reuse the completed archived period if its last scene is still the period head;
  // later scenes outside this period do not invalidate a valid archived year.
  // Otherwise rebuild from all actual scenes before and after the fork.
  if(reusable){
   canonical.push(reusable.doc);
   continue;
  }
  try{
   const result=buildYearArchive({world,branch,scenes,characters,
    from:meta.from,to:meta.to,allowPartial:true});
   liveSummaries.push({
    period,from:meta.from,to:meta.to,
    completed:result.completed,source_head:branch.head_scene_id,
    source_scene_ids:result.source_scene_ids,
    scenes:result.scene_count,
    unstructured_scenes:result.unstructured_scenes,
    content:result.content,
    origin_keys:records.map(({doc})=>doc.doc_key)
   });
   warnings.push({code:'YEAR_RECONCILED_FROM_CURRENT_CHAIN',period,
    reason:'Год пересобран по валидным сценам до и после правки; отменённые события исключены.'});
   if(result.unstructured_scenes)warnings.push({code:'YEAR_NEEDS_FULL_SCENE_REVIEW',period,
    reason:'Есть сцены без структурированных последствий: сверяй полный текст по ID.'});
  }catch(error){
   warnings.push({code:'YEAR_RECONCILIATION_BLOCKED',period,reason:error.message});
  }
 }
 return {documents:canonical,liveSummaries,warnings};
}
