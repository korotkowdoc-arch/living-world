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

export function buildYearArchive({world,branch,scenes=[],characters=[],from,to}={}){
 if(!world?.id||!branch?.id||world.active_branch_id!==branch.id)
  throw Error('Для архива требуется действующая ветка выбранного мира.');
 if(!validPeriod(from)||!validPeriod(to)||monthsBetween(from,to)<0||monthsBetween(from,to)>12)
  throw Error('Укажи годовой период от YYYY-MM до YYYY-MM, не длиннее 13 календарных месяцев.');
 if(!Array.isArray(scenes)||!scenes.length)throw Error('Сначала сохрани хотя бы одну сцену в действующей ветке.');
 if(branch.head_scene_id!==scenes.at(-1).id)
  throw Error('Архив нельзя создавать по устаревшей цепочке. Перечитай сцены.');
 const latest=dateMonth(scenes.at(-1).world_time);
 if(!validPeriod(latest)||latest<to)
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
  if(!parts.length){missing++;parts.push('  - Нет структурированного пакета последствий; требуется сверка полного текста сцены в архиве.');}
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
  '# YEAR DOCUMENT · '+from+' — '+to,
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
  '- Годовой архив привязан к HEAD-источнику. При «На это:» нужно проверить, что архивный HEAD всё ещё предок активной ветки.',
  '- Year Document НЕ является техническим snapshot и не устраняет лимит полного пересчёта истории.',
  '- При создании новой редакции старые редакции не переписываются.',
  ''
 ].join('\n');
 if(text.length>200000)throw Error('Годовой архив превышает 200 000 символов. Архивируй более короткий период, не обрезая события.');
 return {key:yearArchiveKey(from,to,branch.id),title:'YEAR DOCUMENT · '+from+' — '+to+' · '+line(world.name),
  content:text,from,to,branch_id:branch.id,source_head:branch.head_scene_id,year_end_head:beforeOrAt.at(-1).id,
  scene_count:selected.length,unstructured_scenes:missing,characters:people.characters.length};
}

/** A year document may only influence current scenes while its last source scene
 *  remains an ancestor. A fork BEFORE that source invalidates the archive.
 *  Legacy manually uploaded documents stay visible but are not automatically vouched for.
 */
export function isYearArchiveActive(doc,activeSceneIds){
 if(doc?.category!=='year_document')return true;
 const match=String(doc.content||'').match(/^LW_ARCHIVE_ACTIVE_HEAD:\s*([0-9a-f-]{36})\s*$/im);
 if(!match)return true;
 return Array.isArray(activeSceneIds)&&activeSceneIds.includes(match[1].toLowerCase());
}
