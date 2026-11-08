/** Single-batch simulation prompt. No autonomous/background API calls.
 * Every batch needs an explicit approved scene packet; only valid scene ancestry counts.
 */
export const SIMULATION_SPANS = Object.freeze([
 {id:'week', label:'1 неделя'},
 {id:'month', label:'1 месяц'},
 {id:'quarter', label:'3 месяца'},
 {id:'halfyear', label:'6 месяцев'},
 {id:'year', label:'1 год'}
]);
export function simulationPrompt(world, characters, memory, latestScenes=[], {kind='life', span='quarter', decision='', clock=''}={}) {
 if(!['life','skip'].includes(kind))throw Error('Режим симуляции неизвестен.');
 const period=SIMULATION_SPANS.find(x=>x.id===span);
 if(!period)throw Error('Выбери допустимую длительность периода.');
 const starting=String(clock||latestScenes.at(-1)?.world_time||world.genesis_choices?.current_period||world.clock_start||'').trim();
 if(!/^\d{4}-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?)?$/.test(starting))throw Error('Укажи корректную текущую игровую дату/период.');
 const hero=characters.find(c=>c.role==='hero');
 if(!hero)throw Error('Сначала утверди Генезис героя.');
 const last=latestScenes.slice(-3).map(s=>({time:s.world_time,body:s.body.slice(-2200)}));
 const kindText=kind==='life'
  ? 'ПРОГОН БИОГРАФИИ: герой ещё проживает свою предысторию. Его характер, связи, компетенции и страхи формируются только через события и решения. Если есть возраст вступления в школу, соблюдай его.'
  : 'УСКОРЕНИЕ ДЕЙСТВУЮЩЕЙ ИСТОРИИ: не нужно подробно описывать скучные бытовые дни, но нельзя пропустить важное событие или необратимое решение, которое герой должен принять.';
 const userDecision=decision.trim()?'ОТВЕТ ИГРОКА НА ПРЕДЫДУЩЕЕ РЕШЕНИЕ: '+decision.trim()+'\nПрименяй правдоподобные последствия, но не назначай заранее гарантированный успех.':'Пользователь ещё не выбирал новую опцию: продолжай причинно, не выдумывая его решений за пределами уже сыгранного.';
 const summary = {
  world:{name:world.name,genre:world.genre,premise:world.premise,rules:world.world_rules,history:world.history,timeline:world.timeline},
  current_period:starting,hero:{name:hero.name,description:hero.description,goals:hero.goals,status:hero.status,health:hero.health,relationships:hero.relationships},
  school_entry_age:world.genesis_choices?.school_entry_age||null,
  birth_date:world.genesis_choices?.birth_date||null,
  other_people:characters.filter(c=>c.role!=='hero').map(c=>({name:c.name,role:c.role,personality:c.personality,goals:c.goals,relationships:c.relationships,knowledge:c.knowledge})),
  last_valid_scenes:last,continuity:memory
 };
 return `LIVING WORLD — СИМУЛЯЦИЯ ОДНОГО ОТРЕЗКА ЖИЗНИ.
${kindText}
Отправная точка: ${starting}. Максимальный предполагаемый шаг: ${period.label}. Это не обязательный полный скачок: если возникает значимое решение, конфликт или риск, ОСТАНОВИСЬ в этой точке, а не решай за игрока.
${userDecision}

СОСТОЯНИЕ И ПРАВИЛА:
${JSON.stringify(summary,null,2)}

ПРОЦЕДУРА:
1. Продвинь мир максимум на указанный период, учитывая реальный возраст, дорогу, обучение, здоровье, работу, доходы и жизнь NPC вне кадра.
2. Пиши умеренно коротко, в форме исторической хроники/дневника (примерно 300–900 слов). Каждый действительно важный узел — событие → чья-то реакция → последствия. Не делай длинную литературную сцену: это ускоренный режим.
3. Позволь происходить неприятным, нейтральным и счастливым событиям. Не подгоняй каждый период под драму. Не вводи бессмысленные конфликты ради остановки.
4. Если выбор игрока нужен, закончи текущий отрезок на моменте решения и предложи 2–4 правдоподобных альтернативы без гарантированных исходов; в конце игрок сам выбирает. Если выбора нет, decisions=[].
5. Важное: если игрок велел остановить симуляцию, следующая обычная сцена начинается точно с подтверждённого конца отрезка. Уже утверждённые события — канон, предположения — нет. NPC с собственной жизнью могут появляться по причинным каналам, но секреты им автоматически не известны.
6. Время world_time выставь на фактический конец отрезка, НЕ начальное. Сохраняй точность известной даты: YYYY-MM если число неизвестно, YYYY-MM-DD если известен день, или точный timestamp. Не придумывай дату/время без основания. Никогда не возвращай часы назад.

Ответь ТОЛЬКО одним валидным JSON-объектом БЕЗ Markdown:
{
 "scene": "Хроника выбранного отрезка: что произошло, как отреагировали люди и какие последствия возникли",
 "world_time": "Фактическая дата остановки или конца отрезка",
 "decisions":[{"id":"a","label":"Краткое решение игрока","description":"Что герой реально намерен сделать (без заранее назначенного результата)"}],
 "changes":{
  "facts":["Новые подтверждённые произошедшие события"],
  "open_threads":["Новые открытые линии"],
  "resolved_threads":["Точные строки ранее закрытых open_threads"],
  "offscreen_events":["Достоверные события других людей с реальными каналами"],
  "characters":[{"name":"Имя","location":"Если изменилось","health":"Если изменилось","mood":"Если изменилось","goals":"Если изменились","relationships":"Если изменились","inventory":"Если изменилось","learned":[{"fact":"Узнанный факт","via":"Через что узнал"}],"beliefs":["Субъективные убеждения"]}]
 }
}
Если новый человек стал важен, описывай в тексте его самостоятельное происхождение, цели и связи; не стирай его из мира. Никаких автоматических будущих исходов и знаний из отменённой ветки.`;
}
