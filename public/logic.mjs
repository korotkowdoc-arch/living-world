/** Pure, browser-independent helpers for Living World cloud. */
export const GENESIS_FIELDS = ['role','name','causal_link','description','personality','goals','relationships','knowledge','location','health','mood','status','inventory'];
export const CHARACTER_FIELDS = GENESIS_FIELDS.filter(f=>f!=='role');
export function cleanText(x,max=100000) { return String(x ?? '').trim().slice(0,max); }
export function escapeHTML(x='') { return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function parseGenesis(raw, count=4, hero='Главный герой') {
  let text=cleanText(raw,500000).replace(/^\uFEFF/,'');
  if(text.startsWith('```')) text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'');
  const first=text.indexOf('{'), last=text.lastIndexOf('}');
  if(first<0||last<=first) throw Error('Не найден JSON-объект. Скопируй именно JSON с фигурными скобками.');
  let data;
  try { data=JSON.parse(text.slice(first,last+1)); }
  catch(e) { throw Error('Ошибка JSON: '+e.message+'. Проверь, что ответ скопирован полностью.'); }
  for(const field of ['summary','opening']) if(typeof data[field]!=='string') throw Error(`Отсутствует текстовое поле ${field}.`);
  for(const field of ['past_changes','open_threads','uncertainties']) if(!Array.isArray(data[field]) || data[field].some(v=>typeof v!=='string')) throw Error(`Поле ${field} должно быть массивом строк.`);
  if(!Array.isArray(data.characters)||data.characters.length!==count+1) throw Error(`Нужно ${count+1} персонажей: герой и ${count} NPC.`);
  if(data.characters[0].role!=='hero' || data.characters[0].name!==hero) throw Error(`Первый персонаж должен иметь role=hero и имя «${hero}».`);
  const names=new Set();
  for(const [i,ch] of data.characters.entries()) {
    if(!ch||typeof ch!=='object') throw Error(`Персонаж ${i+1} должен быть объектом.`);
    if(i>0 && ch.role!=='npc') throw Error(`Персонаж ${i+1} должен иметь role=npc.`);
    for(const f of GENESIS_FIELDS) if(typeof ch[f]!=='string') throw Error(`Персонаж ${i+1}: поле ${f} должно быть текстом.`);
    const name=ch.name.trim().toLocaleLowerCase('ru');
    if(!name||names.has(name)) throw Error('Имена персонажей должны быть уникальны и непусты.');
    names.add(name);
  }
  return data;
}

/** Short, consequence-focused simulation. Choices are calibration signals, not historical facts. */
export const QUICK_GENESIS_STEPS = [
  {
    title:'Тебя несправедливо обвиняют. Твой первый ход?',
    context:'Никто не знает всей правды, но решение нужно принять сейчас.',
    options:[
      {id:'confront',label:'Скажу прямо, что думаю',hint:'Прямота и риск конфликта'},
      {id:'evidence',label:'Сначала найду доказательства',hint:'Проверка фактов и терпение'},
      {id:'workaround',label:'Найду неожиданный выход',hint:'Гибкость и практичность'}
    ]
  },
  {
    title:'Близкий человек просит о помощи, но цена высока.',
    context:'Нет заранее правильного варианта — у любого выбора будут последствия.',
    options:[
      {id:'protect',label:'Помогу, даже рискуя собой',hint:'Преданность и самоотдача'},
      {id:'plan',label:'Составлю план и попрошу поддержки',hint:'Доверие и координация'},
      {id:'boundary',label:'Обозначу границу и предложу иной путь',hint:'Независимость и переговоры'}
    ]
  },
  {
    title:'У тебя появляется возможность начать жизнь иначе.',
    context:'Что больше всего хочется получить от этой перемены?',
    options:[
      {id:'freedom',label:'Свободу и новые дороги',hint:'Самостоятельность'},
      {id:'home',label:'Дом и близких людей',hint:'Привязанность и стабильность'},
      {id:'truth',label:'Ответы на давние вопросы',hint:'Знания и любопытство'},
      {id:'influence',label:'Возможность влиять на события',hint:'Ответственность и амбиции'}
    ]
  },
  {
    title:'Какие люди должны окружать героя?',
    context:'ИИ придумает их прошлое и цели самостоятельно — это только пожелание к составу.',
    options:[
      {id:'autonomous',label:'Полностью доверяю ИИ',hint:'Непредсказуемое самостоятельное окружение'},
      {id:'mixed',label:'Друзья и соперники, со своими интересами',hint:'Сложные пересекающиеся связи'},
      {id:'family',label:'Семья, долги и прежние знакомства',hint:'Сила общего прошлого'},
      {id:'strangers',label:'Герой начинает почти один',hint:'Новые связи возникают по ходу истории'}
    ]
  }
];
export function quickGenesisPrompt(world,choices) {
  const answers=choices.quick_answers;
  if(!Array.isArray(answers)||answers.length!==QUICK_GENESIS_STEPS.length)throw Error('Ответь на четыре ситуации быстрого старта.');
  const decisions=QUICK_GENESIS_STEPS.map((step,i)=>{
    const option=step.options.find(o=>o.id===answers[i]);
    if(!option)throw Error('Выбор для шага '+(i+1)+' недействителен.');
    return {situation:step.title,decision:option.label,meaning:option.hint};
  });
  const hero=cleanText(choices.hero_name,100);
  if(!hero || hero==='Главный герой')throw Error('Укажи имя главного героя.');
  const npcCount=Number(choices.npc_count);
  if(!Number.isInteger(npcCount)||npcCount<2||npcCount>6)throw Error('Количество NPC должно быть от 2 до 6.');
  const names=cleanText(choices.npc_ideas||'',1800);
  const setting=cleanText(choices.world_idea||world.premise||'',3000);
  const worldName=cleanText(choices.world_title||world.name,140);
  const base=genesisPrompt({...world,name:worldName,premise:setting},{...choices,hero_name:hero,npc_count:String(npcCount)});
  return `БЫСТРЫЙ СТАРТ LIVING WORLD — построй полноценный генезис, а не анкету-заглушку.
Я выбираю только направление. Ты САМОСТОЯТЕЛЬНО создаёшь причинно связанную биографию героя и ${npcCount} автономных NPC с собственными целями, ошибками, отношениями, ресурсами и событиями вне кадра.

МИР / ЖАНР: ${worldName} / ${world.genre||'Фэнтези'}
ОСНОВА И ПОЖЕЛАНИЯ К МИРУ: ${setting||'Предложи сам, не противореча имеющимся правилам мира.'}
ГЕРОЙ: ${hero}, возраст ${choices.hero_age||'18'}.
ВОЗМОЖНЫЕ ЗНАКОМЫЕ ИЛИ ПОЖЕЛАНИЯ О NPC (необязательно): ${names||'Придумай всех NPC самостоятельно.'}

ЧЕТЫРЕ РЕШЕНИЯ В КОРОТКОЙ СИМУЛЯЦИИ:
${JSON.stringify(decisions,null,2)}

ВАЖНО: эти решения показывают склонности героя и желательную динамику, но НЕ означают, что указанные ситуации буквально произошли до начала истории. Преврати выборы в правдоподобные качества и жизненные обстоятельства, не объявляя сами вымышленные задания каноном.
Дай каждому NPC независимую жизнь, отношения и реальные знания с каналами получения; не делай всех спутниками или поклонниками героя. Пусть хотя бы часть NPC знает друг друга независимо от героя, если это причинно оправданно. Их жизненные обстоятельства должны вытекать из среды и решений, а не выбираться случайно без причин. Если перечислены имена, включи этих людей в пределах заданного количества; остальные персонажи — твой выбор.
Не задавай мне дополнительные вопросы: решение за ИИ. Не придумывай будущие исходы и не подменяй уже сыгранные факты.

${base}`;
}

export function genesisPrompt(world,choices) {
  const npcCount=Math.min(10,Math.max(1,Number(choices.npc_count)||4));
  const hero=cleanText(choices.hero_name||'Главный герой',100);
  return `Создай стартовую причинную модель интерактивной вселенной. НЕ сцену. В мире есть самостоятельные люди, знания не перетекают между ними, исходы не предопределены. Развилка биографии героя меняет жизнь других только через правдоподобные причинные каналы. Если исходный канон указан, учитывай его ядро, но не копируй сюжет автоматически.\n\nМИР:\n${JSON.stringify({name:world.name,genre:world.genre,premise:world.premise,world_rules:world.world_rules,history:world.history,timeline:world.timeline,clock_start:world.clock_start},null,2)}\n\nВЫБОРЫ ГЕРОЯ:\n${JSON.stringify(choices,null,2)}\n\nВерни ТОЛЬКО валидный JSON, без пояснений и Markdown, со свойствами: summary:string, past_changes:string[], open_threads:string[], opening:string, uncertainties:string[], characters:array. В characters ровно ${npcCount+1} объектов: первый role="hero", name="${hero}", далее ровно ${npcCount} самостоятельных NPC role="npc" с уникальными именами. У КАЖДОГО обязательно строковые поля: ${GENESIS_FIELDS.join(', ')}. Не приписывай NPC знания без канала. Отделяй факты прошлого от намерений, рисков и неопределённостей. Для существующего мира не выдумывай противоречащие канону факты. Не создавай список обязательных будущих событий.`;
}
export function scenePrompt(world,characters,scenes,mode='story',directorNote='') {
  const requestedModel=String(mode==='relationship'?world.model_relationships||'gpt-5.6':world.model_story||'gpt-6').toUpperCase();
  const models=characters.map(c=>({name:c.name,role:c.role,description:c.description,personality:c.personality,goals:c.goals,relationships:c.relationships,knowledge:c.knowledge,location:c.location,health:c.health,mood:c.mood,status:c.status,inventory:c.inventory}));
  const recent=scenes.slice(-8).map(s=>({time:s.world_time,body:s.body}));
  return `Продолжи АВТОНОМНУЮ художественную историю, от третьего лица, без меню решений и без обязательной остановки на реплике героя. ИИ самостоятельно ведёт героя, NPC и мир. Не подгоняй канон, не давай скрытых знаний и не возвращай отменённые события. Важные сцены показывай полно и причинно. Все герои действуют из текущего опыта и собственных целей.\n\nМИР: ${JSON.stringify({name:world.name,genre:world.genre,premise:world.premise,rules:world.world_rules,history:world.history,timeline:world.timeline,clock_start:world.clock_start,current_period:world.genesis_choices?.current_period||null},null,2)}\n\nКАЛЕНДАРЬ: clock_start — историческое начало мира, а current_period — текущая граница сюжета. Не возвращайся к началу года и не придумывай число/час, если известен только месяц.\n\nПЕРСОНАЖИ: ${JSON.stringify(models,null,2)}\n\nПОСЛЕДНИЕ ВАЛИДНЫЕ СЦЕНЫ: ${JSON.stringify(recent,null,2)}\n\nРЕЖИМ: ${requestedModel} · Высокое — ${mode==='relationship'?'отношения, нюансы психологии, диалоги и взаимные границы':'сюжет, развитие мира, хронология и причинность'}\nНастройка модели внутри LIVING WORLD — только предпочтение для запроса: пользователь выбирает реальную модель и уровень «Высокое» в ChatGPT вручную. Обе модели обязаны учитывать одну и ту же подтверждённую память мира.\n\nРЕЖИССЁРСКОЕ УТОЧНЕНИЕ: ${directorNote||'нет'}\n\nВерни только литературное продолжение без служебных пояснений.`;
}
export function revisionPrompt(world,characters,prefix,correction,scenes) {
  return scenePrompt(world,characters,scenes,'story',`РЕЖИССЁРСКАЯ ПРАВКА «НА ЭТО»: ${correction}\nСохрани валидный префикс текущей сцены неизменным. Весь старый текст после точки вмешательства никогда не происходил. Продолжай НЕПОСРЕДСТВЕННО после этого фрагмента, не переписывая префикс и не создавая новый старт:\n${prefix}\n\nВерни ТОЛЬКО НОВОЕ ПРОДОЛЖЕНИЕ после префикса.`);
}
export function demoGenesis(world,choices) {
  const h=choices.hero_name||'Главный герой';
  const origin=choices.origin||'Изгой';
  const people=['Алекс Рин','Мира Велт','Торен Касс','Илара Рен','Марек Дорн','Селия Варн','Ноа Лир','Эда Мар'];
  const npcCount=Math.min(6,Math.max(1,Number(choices.npc_count)||4));
  const hero={role:'hero',name:h,causal_link:`Выбранная развилка «${choices.turning_point||'не указана'}» изменила условия взросления.`,description:`${choices.hero_age||18} лет. Происхождение: ${origin}. Детство: ${choices.childhood||'не определено'}.`,personality:'Осторожный с новыми людьми; дальнейшее развитие зависит от событий.',goals:choices.core_drive||'Определить своё место в мире',relationships:'Сложные связи без гарантированной лояльности.',knowledge:'Знает собственное прошлое и только доступные ему факты.',location:'Стартовая локация ещё не определена.',health:'Активные травмы не установлены.',mood:'Ожидание нового этапа.',status:'Главный герой, самостоятельный человек.',inventory:'Начальные ресурсы пока не определены.'};
  const characters=[hero,...people.slice(0,npcCount).map((name,i)=>({role:'npc',name,causal_link:`Демонстрационная причинная связь №${i+1}: пересекался с героем в прошлом, но имеет собственные цели.`,description:`Второстепенный житель мира «${world.name}». Демо-анкета, не отражающая готовый канон.`,personality:['Прагматичен, осторожен','Социально проницательна','Независим, упрям','Сдержанна, любознательна'][i%4],goals:['Найти стабильное место в обществе','Сохранить собственное дело','Разрешить личный конфликт','Развивать профессиональные навыки'][i%4],relationships:'Имеет независимый круг контактов и прошлое вне жизни героя.',knowledge:'Не знает мотивов героя и скрытой служебной информации.',location:'Городская среда, точная локация не установлена.',health:'Активные заболевания не установлены.',mood:'Занят собственными делами.',status:'Автономный NPC, не спутник героя по умолчанию.',inventory:'Обычные личные вещи.'}))];
  return {summary:'ДЕМО: набросок стартовых связей. Настоящую альтернативную причинность строит ИИ, это только тест интерфейса.',past_changes:[`Герой пережил: ${choices.turning_point||'неопределённую развилку'}.`],open_threads:['Прошлое NPC уточняется до утверждения в полноценной ИИ-версии.'],opening:`${world.clock_start||'1998-09-01T08:00:00'} — мир готов к запуску; первая сцена не сыграна.`,uncertainties:['Это демо-генерация. Биографии персонажей требуют творческого и фактического уточнения.'],characters};
}
export function clampIndex(v,max){return Math.max(0,Math.min(Number(v)||0,max));}
export function demoScene(world,characters,prevCount){ const hero=characters.find(c=>c.role==='hero')?.name||'Главный герой'; const npc=characters.filter(c=>c.role==='npc')[prevCount%Math.max(1,characters.filter(c=>c.role==='npc').length)]?.name||'незнакомец';return `${hero} остановился у выхода и посмотрел на ${npc}. Утро только начиналось, но разговор обещал потребовать большего внимания, чем казалось сначала.\n\n— Мы можем обсудить это позже, — произнёс ${npc}.\n\n${hero} не спешил соглашаться. Пока он собирался с ответом, за дверью послышались шаги.\n\n(ДЕМО: шаблон для проверки сохранений, не полноценная ИИ-сцена.)`; }
