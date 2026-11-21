/** Scene Director V2: a deterministic review of causal opportunities, NOT a
 * plot generator, personality model or a weighted scene roulette.
 * No API calls and no state mutation. The narrator makes the literary choice.
 */
import {narrativePacingBrief} from './narrative-pacing.mjs';
import {calendarDirectorBrief} from './calendar-director.mjs';
const list=v=>Array.isArray(v)?v:[];
const txt=v=>String(v??'').trim();
const limited=(v,n=180)=>txt(v).slice(0,n);
function namedActors(actors){
 return list(actors).filter(x=>x&&typeof x.name==='string').map(x=>({
  name:x.name,role:x.role||x.initial_role||'npc',
  goals:limited(x.goals||x.state?.goals,260),
  location:limited(x.location||x.state?.location),
  status:limited(x.status||x.state?.status),
  motive_known:!!(x.goals||x.state?.goals)
 }));
}
/** The output indicates what merits examination; it cannot prove the next scene. */
export function sceneDirectorBrief({
 world={},clock='',scenes=[],pacing=null,calendar=null,causalMemory=null,
 characters=[],npcCandidates=[],npcLife=null,complete=false
}={}){
 const report=pacing||narrativePacingBrief(scenes,{complete,currentTime:clock});
 const time=calendar||calendarDirectorBrief({scenes,clock,complete:false});
 const threads=list(causalMemory?.managed_threads);
 const active=threads.filter(t=>t?.status==='active');
 const paused=threads.filter(t=>t?.status==='paused');
 const actors=namedActors(characters);
 const streak=report.consecutive_single_focus||{};
 const stale=new Set(list(report.underrepresented_review));
 const stalled=new Set(list(report.stalled_investigations).map(t=>t.thread_id));
 const opportunities=[];
 const push=(kind,id,title,reason,basis,status='review',source=null)=>{
  if(opportunities.some(x=>x.id===id))return;
  opportunities.push({kind,id,title:limited(title,180),reason:limited(reason,450),
   basis,status,source});
 };
 for(const a of list(time.review).slice(0,6)){
  push('calendar','calendar:'+a.id,a.title,
   'Календарное окно '+a.window+' требует причинной проверки; состояние '+a.state+
    '. Узел нельзя объявлять произошедшим без сыгранного доказательства.',
   'reference_window','date_review',a.source);
 }
 if(!time.review?.length)for(const a of list(time.upcoming).slice(0,2)){
  push('calendar','calendar:'+a.id,a.title,
   'Ближайшее известное окно '+a.window+'; события не переносятся искусственно и не имеют заранее выбранного исхода.',
   'reference_window','upcoming',a.source);
 }
 for(const t of active.slice(0,10)){
  const kind=['relationship','character','institutional','main','background'].includes(t.kind)?t.kind:'background';
  push('thread','thread:'+t.id,t.title||t.id,
   stalled.has(t.id)?
    'Отмечены повторные неудачные поиски. Не пытайся добыть новую улику без независимого основания; допустима пауза.':
    'Активная причинная линия; продолжение возможно только при доступной инициативе, времени и обстоятельствах.',
   'confirmed_causal_thread',stalled.has(t.id)?'needs_independent_cause':'active_review',t.last_scene_id||null);
 }
 if(stale.has('relationship')){
  push('relationship_review','relationship-attention','Частная жизнь и отношения',
   'Отсутствие подтверждённого внимания в размеченном окне — повод проверить естественные встречи, заботу, конфликты и желание. Не квота и не обязательное свидание.',
   'narrative_attention','consider_only');
 }
 if(stale.has('character')){
  push('character_review','character-attention','Личные выборы и развитие',
   'Проверь самостоятельные цели, развитие умений и последствия прежних выборов персонажей, без надуманных конфликтов.',
   'narrative_attention','consider_only');
 }
 if(stale.has('everyday')){
  push('everyday_review','everyday-attention','Обычная жизнь и распорядок',
   'Проверь занятия, быт, усталость, деньги, отдых, перемещения и социальный контекст; не превращай бытовую сцену в обязанность.',
   'narrative_attention','consider_only');
 }
 if(stale.has('main')&&!active.some(t=>t.kind==='main')){
  push('main_review','main-attention','Основные события мира',
   'Проверь календарные и независимые силы, а не заполняй отсутствие основного сюжета случайной угрозой.',
   'narrative_attention','consider_only');
 }
 for(const actor of list(npcLife?.actor_profiles).slice(0,8)){
  const plans=list(actor.pending_plans).filter(p=>['active','unresolved','paused','blocked'].includes(p.state));
  if(!plans.length&&!list(actor.social_connections).length)continue;
  const action=plans[0];
  push('npc_life','life:'+actor.name,actor.name,
   action?'Сохранённое намерение: '+limited(action.plan,160)+'; статус '+action.state+
    '. Проверить доступ, время, собственный мотив и препятствия; план не равен выполненному действию.':
    'Есть подтверждённые личные связи. Проверить самостоятельную инициативу, границы и реальные возможности контакта.',
   action?'confirmed_npc_intention':'directed_relationship_history',
   action?'causal_eligibility_review':'social_eligibility_review',
   action?.opened_scene_id||actor.social_connections[0]?.last_scene_id||null);
 }
 for(const e of list(npcCandidates).slice(0,4)){
  const name=limited(e.name||e.actor||e.character||'NPC',120);
  push('npc_review','npc:'+name,name,
   'Кандидат на автономную деятельность: сверить реальную цель, возможности, место и знания. Планы не являются случившимися событиями.',
   'npc_candidate','unconfirmed_candidate');
 }
 if(!opportunities.length){
  push('causal_review','causal-continuation','Продолжение жизни',
   'Не придумывай событие ради заполнения календаря. Продолжи действующую сцену или действие по установленным обстоятельствам.',
   'general_policy','not_event');
 }
 const warnings=[];
 if(complete===false)warnings.push('История/ресурсы могут быть неполны. Нельзя объявлять отсутствие записи доказательством отсутствия события.');
 if(!time.source_ready)warnings.push('Нет проверенного календаря Year Anchors. Не заменяй его воспоминанием о каноне.');
 if(report.coverage?.untagged_scenes)warnings.push('Есть неразмеченные эпизоды. Их жанр, романтика и развитие сюжета не известны анализатору.');
 if(streak.count>=3)warnings.push('Подряд '+streak.count+' сцены с одним фокусом; проверь самостоятельные процессы и отношения.');
 return {version:2,world_name:txt(world?.name)||null,current_clock:clock||null,
  complete:!!complete,calendar:time,pacing:report,
  actors_reviewed:actors.filter(a=>a.motive_known).length,
  active_threads:active.length,paused_threads:paused.length,
  npc_life:npcLife||{complete:false,reason:'Полная память самостоятельной жизни NPC недоступна.'},
  opportunities:opportunities.slice(0,16),warnings,
  selection_policy:'Нет числовых весов, квот и автоматического выбора сюжета. Возможности не становятся сценами без причинной инициативы, времени и доступа. Непрерывный разговор, бой или интимный эпизод не разрывается ради переключения темы.'};
}
export function sceneDirectorGuidance(director=null){
 const picks=list(director?.opportunities).slice(0,10);
 const calendar=list(director?.calendar?.review).slice(0,5);
 const picksText=picks.length?picks.map(o=>
  '- '+o.title+' ['+o.status+']: '+o.reason+' (источник: '+(o.source||o.basis)+')').join('\n'):
  '- Нет подтверждённого выбора сцены; продолжи происходящее по валидному состоянию.';
 const calendarText=calendar.length?calendar.map(e=>e.id+' '+e.window+' — '+e.title+
  ' ('+e.state+', '+e.source+')').join('; '):
  director?.calendar?.source_ready?'Срочных неподтверждённых окон нет.':'Календарь не загружен: нельзя домыслить известные даты.';
 return `SCENE DIRECTOR V2 — СЛУЖЕБНЫЙ ПЛАНИРОВЩИК (НЕ ПИШИ ЕГО В ХУДОЖЕСТВЕННОМ ОТВЕТЕ).
Это список оснований для проверки, НЕ подготовленный сценарий и НЕ выбор сюжета по рейтингу.
1. СНАЧАЛА восстанови непрерывность: сцену, время, здоровье, сон, травмы, предметы, обещания, границы и знания. Если предыдущий эпизод продолжается непосредственно, заверши его органично.
2. Затем проверь календарные окна, самостоятельные институции/антагонисты, реальные цели Гарри и NPC, частную жизнь и отношения. Действие возникает по причинам, а не по сюжетной квоте.
3. Возможность из календаря НЕ равна произошедшему событию. Проверяй первоисточник Year Anchors. Не импортируй канонических участников, результат или дату при недостаточной точности. Если срок прошёл без установленного события, НЕ разыгрывай его задним числом; обозначь неопределённость и проверь причинность.
4. Загадку можно отложить после бесплодных проверок без новой независимой информации. Не создавай новую бумажку, свидетеля или ложный след только чтобы продлить расследование.
5. Социальная, романтическая и взрослая интимная жизнь не исчезают из-за квеста; правдоподобные встречи, желания и конфликты требуют собственных причин и свободного поведения участников. Секс не обязателен по таймеру.
6. NPC могут жить вне кадра, но намерение и предположение — не свершившийся факт. Доступ к чужой информации только через реальные каналы. В каждом новом отрезке времени проверяй независимые планы и возможности существенных NPC, включая тех, кто не присутствует рядом с Гарри. Подтверждённое событие записывай как npc_offscreen с реальной датой/причиной, а изменение намерения — в npc_plan_updates с исходным ID; до записи план НЕ выполнен.
6а. Социальные связи направленные и многомерные (доверие может сосуществовать с раздражением и желанием). Изменения мотивированы пережитым, не превращай персонажей в удобных любовных интересов; не выдавай цитаты памяти за чтение мыслей.
7. Ни один пункт ниже не назначает обязательную следующую сцену. При неполной памяти запрашивай источник прежде чем утверждать пропущенные события.
КАЛЕНДАРНЫЕ ПРОВЕРКИ: ${calendarText}
ДОПУСТИМЫЕ НАПРАВЛЕНИЯ:
${picksText}
Служебный планировщик не должен всплывать перед читателем. После сцены фиксируй только события и доказанные последствия.`;
}
