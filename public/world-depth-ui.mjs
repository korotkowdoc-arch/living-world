/** HTML escaped views of active-branch depth and fork analysis, no remote API. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е');
const cut=(v,max=800)=>esc(String(v??'').slice(0,max));
const list=(arr,render,empty='Пока нет подтверждённых записей')=>Array.isArray(arr)&&arr.length?
 arr.map(render).join(''):'<p class="hint">'+esc(empty)+'</p>';
const matches=(query,...parts)=>!query||norm(parts.join(' ')).includes(norm(query));
const proof=(e)=>'<span class="hint"> · сцена '+cut(e.scene_id||'?')+' · '+cut(e.world_time||'время неизвестно')+'</span>';
const explain={
 trait:'Характер',value:'Ценности',fear:'Страх',desire:'Желание',
 habit:'Привычка',boundary:'Границы',coping:'Совладание',trigger:'Триггер',
 self_image:'Образ себя',inner_conflict:'Противоречие',motivation:'Мотив'
};
const relation={
 trust:'Доверие',respect:'Уважение',affection:'Привязанность',
 irritation:'Раздражение',fear:'Страх',attraction:'Влечение',
 loyalty:'Лояльность',resentment:'Обида',comfort:'Комфорт',
 jealousy:'Ревность',solidarity:'Солидарность',distance:'Дистанция'
};
const shift={increased:'усилилось',decreased:'ослабло',unchanged:'без изменений',
 ambivalent:'противоречиво',emerged:'возникло'};
const classify=e=>e.certainty==='interpretation'||e.interpretation==='interpretation'?
 '<span class="tag">Интерпретация</span>':'<span class="tag">Явное подтверждение</span>';

export function renderWorldDepthView(depth,{query=''}={}){
 if(!depth)return '<div class="panel">Глубокая память ещё не пересчитана. Нажми «Обновить из Supabase».</div>';
 const people=depth.psychology.filter(p=>matches(query,p.name,JSON.stringify(p.aspects)));
 const links=depth.relationships.filter(r=>matches(query,r.from,r.to,JSON.stringify(r.dimensions)));
 const off=depth.confirmed_offscreen.filter(e=>matches(query,e.actor,e.event,e.location));
 const plans=depth.npc_intentions.filter(e=>matches(query,e.actor,e.plan,e.motive));
 const recollections=depth.recollections.filter(e=>matches(query,e.actor,e.meaning,e.memory_id));
 return `<section class="panel stack world-depth">
   <div class="row between"><div><h2 class="section-title">Личная память и отношения</h2>
   <p class="hint">Подтверждения из действующей ветки, без усреднённых шкал симпатии и автоматических характеров.</p></div>
   <span class="tag">${depth.scanned_scenes} сцен</span></div>
   <div class="field"><label for="depth-query">Персонаж, чувство или воспоминание</label>
    <input id="depth-query" class="input" value="${esc(query)}" placeholder="Например: Гарри, Лия, недоверие">
   </div><div class="row"><button type="button" data-action="depth-search" class="btn">Найти</button>
   <button type="button" data-action="depth-copy-retro" class="btn">✦ Разметить старые воспоминания через GPT</button>
   <button type="button" data-action="depth-copy-npc" class="btn">✦ План жизни NPC через GPT</button>
   <button type="button" data-action="depth-copy-audit" class="btn">✦ Проверка сцены через GPT</button>
   <button type="button" data-action="depth-copy-recovery" class="btn">✦ Восстановить checkpoint</button></div>
   <details open><summary>Психология (${people.length})</summary>
   ${list(people.slice(0,60),p=>`<div class="listrow"><div><b>${cut(p.name,120)}</b>
    ${list(Object.values(p.aspects||{}),(e)=>`<p><b>${esc(explain[e.aspect]||e.aspect)}:</b> ${cut(e.observation,1300)}
      ${classify(e)}${proof(e)}</p>`)}</div></div>`)}
    ${people.length>60?'<p class="hint">Показано 60 персон. Уточни поиск.</p>':''}</details>
   <details open><summary>Направленные отношения (${links.length})</summary>
   ${list(links.slice(0,80),r=>`<div class="listrow"><div><b>${cut(r.from,100)} → ${cut(r.to,100)}</b>
     ${list(Object.values(r.dimensions||{}),e=>`<p><b>${esc(relation[e.dimension]||e.dimension)}:</b>
      ${esc(shift[e.shift]||e.shift)} — ${cut(e.rationale,900)} ${classify(e)}${proof(e)}</p>`)}
      ${r.conflicts?.length?`<p class="hint">Состояние менялось: ${r.conflicts.length} подтверждённых переходов.</p>`:''}
   </div></div>`)}
   ${links.length>80?'<p class="hint">Показано 80 связей. Уточни поиск.</p>':''}</details>
   <details><summary>Личные воспоминания и переосмысления (${recollections.length})</summary>
   ${list(recollections.slice(-80).reverse(),e=>`<p><b>${cut(e.actor,120)}</b> — ${cut(e.meaning,1300)}
     ${e.emotion?`<span class="hint">· ${cut(e.emotion,250)}</span>`:''}
     ${classify(e)}${proof(e)}<span class="hint"> · memory_id: ${cut(e.memory_id,80)}</span></p>`)}</details>
   <details><summary>NPC: произошедшее вне кадра (${off.length})</summary>
   ${list(off.slice(-70).reverse(),e=>`<p><b>${cut(e.actor,120)}:</b>
     ${cut(e.event,1200)}${proof(e)}
     <span class="hint"> · Кто знает: ${esc((e.known_by||[]).join(', ')||'не установлено')}</span></p>`)}</details>
   <details><summary>NPC: намерения (не произошедшие события) (${plans.length})</summary>
   ${list(plans.slice(-70).reverse(),e=>`<p><b>${cut(e.actor,120)}:</b>
     ${cut(e.plan,1000)} <span class="hint">Мотив: ${cut(e.motive,900)}</span>${proof(e)}</p>`)}</details>
   <p class="footnote">Если в структурированной памяти ничего нет, это не доказательство отсутствия переживаний. Поиск первоначальной сцены доступен через компаньон.</p>
 </section>`;
}
export function renderBranchComparisonView(diff){
 if(!diff)return '';
 const lines=list(diff.relationship_changes?.slice(0,30),e=>
  `<li>${cut(e.between,150)} — ${esc(relation[e.dimension]||e.dimension)}:
  ${esc(shift[e.was?.shift]||'нет')} → ${esc(shift[e.now?.shift]||'нет')}</li>`);
 return `<div class="panel stack branch-diff">
   <h2 class="section-title">Сравнение веток</h2>
   <p class="hint">Общий префикс: ${Number(diff.common_prefix_scenes)||0} сцен;
   последняя общая сцена: ${cut(diff.fork_after_scene_id||'нет')}</p>
   <div class="grid">
    <div><h3>Отменённый хвост (${diff.previous_branch_tail?.length||0})</h3>
    <p class="hint">${esc((diff.previous_branch_tail||[]).slice(0,30).map(x=>x.scene_id).join(', '))}</p>
    <h4>Факты только в старой ветке</h4>
    ${list(diff.invalidated_facts?.slice(0,40),x=>`<p>${cut(x,800)}</p>`)}</div>
    <div><h3>Новая ветка (${diff.current_branch_tail?.length||0})</h3>
    <p class="hint">${esc((diff.current_branch_tail||[]).slice(0,30).map(x=>x.scene_id).join(', '))}</p>
    <h4>Новые факты</h4>
    ${list(diff.new_facts?.slice(0,40),x=>`<p>${cut(x,800)}</p>`)}</div>
   </div><h3>Изменения связей</h3><ul>${lines}</ul>
   <h3>Психологические изменения</h3>
   ${list(diff.psychology_changes?.slice(0,45),e=>`<p><b>${cut(e.actor,120)} · ${cut(e.aspect,80)}</b>:
    ${cut(e.was?.observation||'не зафиксировано',500)} → ${cut(e.now?.observation||'не зафиксировано',500)}</p>`)}
   <div class="grid">
    <div><h3>Обязательства только в старой ветке</h3>
      ${list(diff.open_threads_only_in_previous?.slice(0,50),e=>`<p>${cut(e.text,800)}${proof({scene_id:e.opened_scene_id,world_time:e.opened_at})}</p>`)}
     <h3>Знания только в старой ветке</h3>
      ${list(diff.knowledge_only_in_previous?.slice(0,50),e=>`<p><b>${cut(e.actor,120)}</b> — ${cut(e.fact,800)}${proof(e)}</p>`)}
    </div>
    <div><h3>Обязательства только в действующей ветке</h3>
      ${list(diff.open_threads_only_in_current?.slice(0,50),e=>`<p>${cut(e.text,800)}${proof({scene_id:e.opened_scene_id,world_time:e.opened_at})}</p>`)}
     <h3>Новые знания действующей ветки</h3>
      ${list(diff.knowledge_only_in_current?.slice(0,50),e=>`<p><b>${cut(e.actor,120)}</b> — ${cut(e.fact,800)}${proof(e)}</p>`)}
    </div>
   </div>
   <p class="footnote">Старую ветку можно просматривать и сравнивать. Её события не переносятся автоматически в действительный канон.</p></div>`;
}
