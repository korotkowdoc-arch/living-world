import {escapeHTML as esc, cleanText, parseGenesis, genesisPrompt, scenePrompt, revisionPrompt, demoGenesis, demoScene, CHARACTER_FIELDS, QUICK_GENESIS_STEPS, quickGenesisPrompt} from './logic.mjs';
import {parseScenePackage,packSceneNote,readSceneNote,makeContinuity,compactMemory,scenePackagePrompt,validStoryClock,isNondecreasingStoryTime} from './continuity.mjs';
import {simulationPrompt,SIMULATION_SPANS} from './simulation.mjs';
import {aiStatus,aiGenerate} from './ai-client.mjs';
import {activeLineage,projectCompanion,formatAmount} from './world-ledger.mjs';
import {DOC_CATEGORIES,REUSABLE_SOURCE_CATEGORIES,guessCategory,normalizedDocumentText,extractDocumentFile,digestText,docCategory} from './reference-documents.mjs';
import {validateNewWorldSetup,latestReusableDocs} from './world-setup.mjs';
import {WORLD_LONG_PRESS_MS,WORLD_CLICK_SUPPRESS_MS,worldMenuPosition,suppressWorldOpen} from './world-context.mjs';
import {WORLD_BACKUP_FORMAT,sealWorldBackup,validateWorldBackup} from './world-backup.mjs';
import {projectCausalMemory,searchCausalMemory} from './world-causality.mjs';
import {projectCharacterMemory} from './world-character-memory.mjs';

const app=document.getElementById('app');
const cfgKey='lw_cloud_config_v03'; // Preserve the existing Supabase connection when upgrading.
const state={config:readConfig(),client:null,session:null,user:null,worlds:[],world:null,characters:[],branches:[],scenes:[],memoryScenes:[],view:'library',modal:null,revision:null,recentLimit:40,busy:false,storyMode:'story',sceneLength:'large',quickStep:0,quickAnswers:[],aiReady:false,aiReason:'Подключение ещё не проверено',assets:null,assetIssue:null,documents:[],documentsReady:null,documentsError:'',docSelected:null,docContent:null,characterLedger:null,causalLedger:null,memoryQuery:'',memoryKind:'fact',memoryOffset:0,worldContext:null,suppressWorldClickUntil:0,saveDiagnostic:null};
const x=v=>esc(v??'');
// Historical start and current narrative period are separate; don't fabricate a date.
const storyClock=(w=state.world)=>state.scenes.at(-1)?.world_time||w?.genesis_choices?.current_period||(w?.genesis_approved?'':w?.clock_start)||'';
const opt=(value,label,selected)=>`<option value="${x(value)}" ${String(value)===String(selected)?'selected':''}>${x(label)}</option>`;
const btn=(id,label,cls='')=>`<button type="button" class="btn ${cls}" data-action="${id}">${label}</button>`;
const f=(name,label,value='',type='text',hint='')=>`<div class="field"><label for="f-${name}">${x(label)}</label>${type==='textarea'?`<textarea id="f-${name}" name="${x(name)}">${x(value)}</textarea>`:`<input id="f-${name}" class="input" type="${type}" name="${x(name)}" value="${x(value)}"${name==='email'?' autocomplete="username"':name==='password'?' autocomplete="current-password"':type==='password'?' autocomplete="new-password"':''}>`}${hint?`<div class="hint">${x(hint)}</div>`:''}</div>`;
const getForm=id=>{const form=document.getElementById(id);if(!form)throw Error('Форма не найдена');return Object.fromEntries(new FormData(form).entries());};
function readConfig(){try{return JSON.parse(localStorage.getItem(cfgKey)||'null');}catch{return null;}}
function notify(t,bad=false){const el=document.getElementById('toast');el.textContent=t;el.className='show'+(bad?' error':'');clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.className='',5500);}
function errtext(e){
 const m=String(e?.message||e||'Неизвестная ошибка');
 if(m.includes('Failed to fetch'))return 'Нет соединения с облаком. Проверь интернет и адрес Supabase.';
 if(/invalid login credentials|email or password|invalid_grant/i.test(m))return 'Неверная почта или пароль. Если ты раньше входила по ссылке, сначала назначь пароль своей учётной записи Supabase.';
 if(/email not confirmed/i.test(m))return 'Почта ещё не подтверждена. Для личного аккаунта администратор может отметить Auto Confirm User в Supabase.';
 if(/too many requests|rate limit/i.test(m))return 'Слишком много попыток входа. Не повторяй их подряд.';
 return m;
}
async function withBusy(fn){if(state.busy)return;state.busy=true;try{await fn();}catch(e){console.error(e);notify(errtext(e),true);}finally{state.busy=false;}}
function dataOrThrow(result){if(result.error)throw result.error;return result.data;}
async function clipboard(s){try{await navigator.clipboard.writeText(s);notify('Скопировано. Можно вставить в ChatGPT.');}catch{const box=document.createElement('textarea');box.value=s;document.body.append(box);box.select();document.execCommand('copy');box.remove();notify('Запрос скопирован.');}}
function render(){if(!state.config){renderSetup();return;}if(!state.session){renderLogin();return;}renderApp();}
function renderSetup(){app.innerHTML=`<div class="auth"><div class="eyebrow">LIVING WORLD · CLOUD v1.0</div><h1>Приватный мир на iPhone</h1><p class="sub">Один раз подключи собственную облачную базу Supabase. Затем Mac больше не нужен.</p><div class="panel" style="margin-top:22px"><form id="setup-form" class="form">${f('url','Project URL','https://','text','Supabase → Project Settings → API → Project URL')}${f('key','Publishable key (не секретный)','', 'text','Можно использовать publishable / anon key. Никогда не вставляй secret или service_role key.')}<button class="btn gold full" type="submit">Подключить базу</button></form><div class="footnote">Если Supabase ещё не создан, открой инструкцию README из архива. База и сайт должны быть опубликованы один раз; потом всё управление доступно с телефона.</div></div></div>`;}
function renderLogin(){app.innerHTML=`<div class="auth"><div class="eyebrow">✦ LIVING WORLD · v1.0</div><h1>Войти в свои вселенные</h1><p class="sub">Один пароль вместо писем и кодов. На iPhone вход сохраняется между запусками.</p><div class="panel" style="margin-top:22px"><form id="login-form" class="form">${f('email','Электронная почта',localStorage.getItem('lw_login_email')||'','email')}${f('password','Пароль','','password')}<button class="btn gold full" type="submit">Войти в LIVING WORLD</button></form><details class="login-help"><summary>Первый вход — откуда взять пароль?</summary><p>Если ты раньше пользовалась только ссылками из писем, у того аккаунта может ещё не быть пароля. Не угадывай его и не запрашивай новые письма.</p><p>Для новой личной учётной записи открой Supabase → Authentication → Users → Add user → Create new user. Введи свободный email и свой надёжный пароль; выбери Auto Confirm User. Если твой старый email уже занят, используй другой адрес или алиас, например <code>мойадрес+livingworld@gmail.com</code> (у Gmail он приходит в тот же ящик).</p><p><strong>Важно:</strong> другая учётная запись не увидит миры старой. Если уже есть сохранённые миры, не создавай новый аккаунт — сначала восстанови доступ к прежнему.</p><p>После настройки можно выключить публичную регистрацию в Authentication → Sign In / Providers.</p><a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">Открыть Supabase (Authentication → Users)</a></details><div class="divider"></div>${btn('disconnect-db','Сменить подключение к базе','ghost full')}<div class="footnote">Пароль не сохраняется в настройках приложения. Supabase хранит защищённую сессию, поэтому повторный вход обычно не требуется.</div></div></div>`;}
function shellNav(){const links=[['library','▦','Миры'],['builder','⚙','Мир'],['genesis','✦','Генезис'],['story','▤','История'],['memory','◈','Память'],['assets','▣','Активы'],['documents','▤','Документы'],['people','♙','Герои'],['history','⑂','Ветки'],['settings','⚑','Настройки']];return `<aside class="sidebar"><div class="brand"><span class="mark">✦</span><div>LIVING WORLD<small>PRIVATE UNIVERSES</small></div></div><div class="eyebrow">Библиотека</div><nav class="nav">${links.map(([v,i,l])=>`<button data-action="navigate" data-view="${v}" class="${state.view===v?'active':''}">${i} &nbsp;${l}</button>`).join('')}</nav><div class="sidebar-bottom">v1.0 · источник истины<br>Mac не требуется<br>${x(state.user?.email||'')}</div></aside>`;}
function mobileNav(){const l=[['library','▦','Миры'],['builder','⚙','Мир'],['genesis','✦','Генезис'],['story','▤','История'],['memory','◈','Память'],['people','♙','Люди']];return `<nav class="mobilebar" aria-label="Основные разделы">${l.map(([v,i,label])=>`<button data-action="navigate" data-view="${v}" class="${state.view===v?'active':''}"><span>${i}</span>${label}</button>`).join('')}</nav>`;}
function renderApp(){let content='';switch(state.view){case 'world-setup':content=renderWorldSetup();break;case 'builder':content=renderBuilder();break;case 'genesis':content=renderGenesis();break;case 'people':content=renderPeople();break;case 'story':content=renderStory();break;case 'memory':content=renderMemory();break;case 'assets':content=renderAssets();break;case 'documents':content=renderDocuments();break;case 'history':content=renderHistory();break;case 'settings':content=renderSettings();break;default:content=renderLibrary();}app.innerHTML=`<div class="app">${shellNav()}<div class="mobiletop"><button data-action="navigate" data-view="library">✦ LIVING WORLD</button><div><button data-action="navigate" data-view="history" aria-label="Ветки">⑂</button><button data-action="navigate" data-view="settings" aria-label="Настройки">⚙</button></div></div><main class="main">${content}</main>${mobileNav()}</div>${renderWorldContextMenu()}${state.modal?renderModal():''}`;}
function heading(k,title,subtitle,actions=''){return `<div class="head"><div><div class="eyebrow">${x(k)}</div><h1 class="page-title">${x(title)}</h1><p class="sub">${x(subtitle)}</p></div>${actions?`<div class="row">${actions}</div>`:''}</div>`;}
function needsWorld(){return `<div class="well"><h3>Сначала создай вселенную</h3><p>Всё — от предыстории героя до законов мира — можно сделать на iPhone.</p>${btn('new-world','+ Создать вселенную','gold')}</div>`;}
function renderLibrary(){return `${heading('Твоя библиотека','Мои вселенные','Играем в ChatGPT. Здесь — постоянная память, персонажи, ресурсы, последствия и ветки.',btn('new-world','+ Новая вселенная','gold'))}${state.worlds.length?`<div class="grid">${state.worlds.map(w=>`<div class="world-library-card"><button type="button" class="world-card" data-action="open-world" data-id="${x(w.id)}" title="Открыть мир. Долгое нажатие или правая кнопка — действия." style="text-align:left"><span class="tag">${x(w.genre||'Фэнтези')}</span><h3>${x(w.name)}</h3><p>${x((w.premise||'Предыстория ещё не задана.').slice(0,180))}</p><div class="tiny">${w.genesis_approved?'Генезис утверждён':'Мир готов к настройке'} · ${x(w.clock_start)}</div><div class="world-card-hint">Удерживай или ПКМ — действия</div></button></div>`).join('')}</div>`:`<div class="well" style="text-align:center"><div class="spark">✦</div><h2>Вселенная ещё не создана</h2><p>Задай основу мира, выбери прошлое главного героя и запусти собственную историю.</p>${btn('new-world','Создать первую вселенную','gold')}</div>`}`;}
function renderWorldContextMenu(){
 const m=state.worldContext;
 if(!m||state.view!=='library')return '';
 const world=state.worlds.find(w=>w.id===m.id);
 if(!world)return '';
 return `<div class="world-context-backdrop" data-action="close-world-menu"></div><div class="world-context-menu" role="menu" aria-label="Действия с миром" style="left:${m.x}px;top:${m.y}px"><div class="world-context-label">${x(world.name)}</div><button type="button" role="menuitem" data-action="world-menu-delete" data-id="${x(world.id)}">Удалить</button></div>`;
}
function showWorldContextMenu(worldId,clientX,clientY){
 if(state.view!=='library'||!state.worlds.some(w=>w.id===worldId))return;
 const width=220,height=108;
 state.worldContext={id:worldId,...worldMenuPosition(clientX,clientY,window.innerWidth,window.innerHeight,{width,height})};
 render();
}
function renderWorldSetup(){
 const sources=state.worlds||[];
 const labels={core_rules:'Законы и правила мира',glossary:'Глоссарий и названия',style_example:'Примеры стиля сцен',year_anchors:'Календарные и причинные ориентиры',director_calibration:'Режиссёрские настройки'};
 const checkboxes=REUSABLE_SOURCE_CATEGORIES.map(c=>`<label class="world-source-check"><input type="checkbox" name="copy_category" value="${x(c)}" ${['core_rules','glossary','style_example'].includes(c)?'checked':''}><span>${x(labels[c]||c)}</span></label>`).join('');
 return `${heading('Новый мир · шаг 1 из 3','Основа новой вселенной','Выбери документы ДО Генезиса и любых событий предыстории.') }
 <div class="panel"><form class="form" id="world-setup-form">
 ${f('name','Название новой вселенной','','text','Например, Гарри Поттер — жизнь с 15 лет')}
 <div class="field"><label>Жанр</label><select name="genre">${['Фэнтези','Историческая AU','Современный мир','Научная фантастика','Свой жанр'].map(g=>opt(g,g,'Фэнтези')).join('')}</select></div>
 <div class="divider"></div>
 <h2 class="section-title">Переносить документы правил?</h2>
 <p class="sub">Можно взять проверенные первоисточники из предыдущего мира, не перенося его персонажей, сыгранные события, деньги или предметы. Или начать с чистой библиотеки.</p>
 <div class="field"><label for="world-setup-source">Источник общих документов</label>
 <select id="world-setup-source" name="source_id">${opt('','Нет — новый мир без старых документов','')}${sources.map(w=>opt(w.id,w.name,'')).join('')}</select></div>
 ${sources.length?`<div id="world-setup-categories" class="world-source-categories" hidden><p class="tiny">Какие документы скопировать?</p>${checkboxes}<p class="hint">Внимание: PROJECT CORE RULES может содержать факты биографии прошлого Гарри. При новом старте в 15 лет их нужно проверить и при необходимости изменить в новой редакции. Ничего из старого прохождения автоматически не считается сыгранным.</p></div>`:'<p class="hint">Сохранённых миров для переноса пока нет. Источники можно загрузить позже.</p>'}
 <div class="row mobile-full" style="margin-top:17px"><button type="submit" class="btn gold">Создать мир и перейти к Генезису</button>${btn('cancel-world-setup','Назад к мирам')}</div>
 </form></div>`;
}

function renderBuilder(){const w=state.world;if(!w)return needsWorld();return `${heading('Конструктор · 1/3',w.name,'История, календарь и законы будущей реальности.',btn('goto-genesis','Перейти к Генезису','gold'))}<div class="panel"><form class="form two" id="world-form">${f('name','Название мира',w.name)}<div class="field"><label>Жанр</label><select name="genre">${['Фэнтези','Современный мир','Научная фантастика','Историческая AU','Свой жанр'].map(g=>opt(g,g,w.genre)).join('')}</select></div><div class="span2">${f('premise','Основная идея мира',w.premise,'textarea','Например: магическое общество в современном мире, отдельная историческая развилка.')}</div><div class="span2">${f('world_rules','Законы и ограничения',w.world_rules,'textarea','Что возможно, что невозможно, как устроена магия, политика и общество.')}</div><div class="span2">${f('history','Подтверждённое прошлое',w.history,'textarea','Только уже произошедшее. Не записывай предполагаемое будущее как факт.')}</div><div class="span2">${f('timeline','Исторические узлы и хронология',w.timeline,'textarea','Даты, события и возможные узлы — с пометкой, если исход открыт.')}</div>${f('clock_start','Историческое начало истории',w.clock_start,'text','Y1 начинается 1 сентября 1998; не подменяй этот факт текущим временем.')}<div class="span2">${f('current_period','Текущий период действующей истории',w.genesis_choices?.current_period||'','text','Например, 1999-06: известен месяц, но не число. Допустимы YYYY-MM, YYYY-MM-DD или точное время. Заполни перед новой сценой.')}</div><div class="field"><label>Статус</label><div class="code">${w.genesis_approved?'Стартовый Генезис принят':'Стартовые персонажи ещё не утверждены'}</div></div><div class="span2 row mobile-full"><button class="btn gold" type="submit">Сохранить изменения</button>${btn('goto-genesis','Далее: предыстория героя')}</div></form></div><p class="footnote">Все изменения мира сохраняются в облаке и доступны с iPhone без Mac.</p>`;}
const selectField=(name,label,items,value)=>`<div class="field"><label>${x(label)}</label><select name="${name}">${items.map(v=>opt(v,v,value)).join('')}</select></div>`;
function choices(){const w=state.world;return {hero_name:'Главный герой',hero_age:'18',npc_count:'4',base_world:'existing',origin:'Изгой',childhood:'На улице',turning_point:'Побег',close_bonds:'Сложные, неоднозначные связи',core_drive:'Выживание',divergence:'',custom_details:'',source_material:'',...(w?.genesis_choices||{})};}

function renderQuickGenesis(){
  const w=state.world,c=choices(),index=state.quickStep;
  const done=index>=QUICK_GENESIS_STEPS.length;
  const progress=QUICK_GENESIS_STEPS.map((_,i)=>`<span class="step ${i<=index?'on':''}">${i+1}</span>`).join('');
  if(!done){
    const step=QUICK_GENESIS_STEPS[index];
    return `<div class="panel quick-genesis"><div class="eyebrow">Быстрый старт · ${index+1} из ${QUICK_GENESIS_STEPS.length}</div><div class="steps" aria-label="Прогресс мини-истории">${progress}</div><h2 class="quick-question">${x(step.title)}</h2><p class="sub">${x(step.context)}</p><div class="quick-options">${step.options.map(opt=>`<button type="button" class="quick-option" data-action="quick-answer" data-choice="${x(opt.id)}"><strong>${x(opt.label)}</strong><small>${x(opt.hint)}</small></button>`).join('')}</div>${index>0?btn('quick-back','← Назад','ghost'):''}<p class="footnote">Это пробная ситуация, не уже произошедшее событие. Выбор влияет на характер и окружение, но не фиксирует вымышленную сцену как прошлое.</p></div>`;
  }
  const decisions=QUICK_GENESIS_STEPS.map((step,i)=>`<div class="tiny">${i+1}. ${x(step.options.find(o=>o.id===state.quickAnswers[i])?.label||'Не выбрано')}</div>`).join('');
  return `<div class="panel quick-genesis"><div class="eyebrow">Быстрый старт · 4 решения готовы</div><h2 class="quick-question">Почти готово. Остальное придумает ИИ.</h2><div class="quick-summary">${decisions}</div><form class="form two" id="quick-genesis-form">${f('world_title','Название мира',w.name==='Новая вселенная'?'':w.name,'text','Например: Хогвартс — другая история')}${f('hero_name','Имя главного героя',c.hero_name==='Главный герой'?'':c.hero_name,'text','Нужно для проверки ответа ИИ')}${f('hero_age','Возраст героя',c.hero_age||'18','number')}${selectField('npc_count','Сколько значимых NPC создать',['2','3','4','5','6'],c.npc_count||'4')}${f('school_entry_age','Возраст поступления в школу (необязательно)',c.school_entry_age||'','number','Например, 18 для AU Хогвартса. Если обычной школы нет, оставь пустым.')}<div class="span2">${f('birth_date','Дата рождения героя (если известна)',c.birth_date||'','text','Например: 1980-07-31. При неизвестной дате оставь пустым.')}</div><div class="span2"><div class="field"><label>Как начать</label><select name="start_mode">${opt('story','Сразу полноценная история',c.simulation_mode==='life'?'life':'story')}${opt('life','Сначала симулировать жизнь героя',c.simulation_mode==='life'?'life':'story')}</select></div></div><div class="span2"><div class="field"><label>Основа мира</label><select name="base_world">${opt('original','Своя оригинальная вселенная',w.genesis_choices?.base_world||'original')}${opt('existing','Существующий мир / AU',w.genesis_choices?.base_world||'original')}</select></div></div><div class="span2">${f('start_period','Когда начинается история?',w.genesis_choices?.current_period||w.clock_start,'text','Например: 1999-06 или 2000-09-01T08:00:00. Дату можно изменить позже.')}</div><div class="span2">${f('world_idea','В двух словах — где и о чём мир?',w.premise||c.world_idea||'','textarea','Можешь написать одно предложение или оставить пустым — ИИ предложит сам.')}</div><div class="span2">${f('npc_ideas','Хочешь конкретных людей? Необязательно',c.npc_ideas||'','textarea','Имена, отношения или одна подсказка. Можно оставить пустым: ИИ создаст всех NPC сам.')}</div></form><div class="row mobile-full" style="margin-top:18px">${aiButton('quick-auto','✦ Создать персонажей автоматически')}${btn('quick-generate','Скопировать запрос для ИИ')}${btn('open-chatgpt','Открыть ChatGPT')}${btn('quick-back','← Исправить выборы','ghost')}</div><p class="footnote">Автоматическая генерация сохраняет готовый проект Генезиса напрямую. ${x(state.aiReady?'API подключён.':'API пока не подключён: '+state.aiReason)} Ручной перенос остаётся запасным вариантом.</p></div>`;
}

function renderGenesis(){const w=state.world;if(!w)return needsWorld();const c=choices();let proposal='';if(w.genesis_draft){const d=w.genesis_draft;proposal=`<div class="panel stack" style="margin-top:20px"><div class="row between"><h2 class="section-title">Предложенная стартовая модель</h2><span class="tag">${w.genesis_approved?'Уже утверждена':'Ожидает утверждения'}</span></div><p>${x(d.summary||'')}</p><h3>Изменённое прошлое</h3><ul>${(d.past_changes||[]).map(v=>`<li>${x(v)}</li>`).join('')}</ul><h3>Открытые линии</h3><ul>${(d.open_threads||[]).map(v=>`<li>${x(v)}</li>`).join('')}</ul><h3>Персонажи (${d.characters?.length||0})</h3>${(d.characters||[]).map(p=>`<div class="persona"><b>${x(p.name)}</b> <span class="muted">${p.role==='hero'?'Герой':'NPC'}</span><p>${x(p.description)}</p><p>${x(p.causal_link)}</p></div>`).join('')}<h3>Неопределённости</h3><ul>${(d.uncertainties||[]).map(v=>`<li>${x(v)}</li>`).join('')}</ul>${!w.genesis_approved?btn('genesis-approve','Утвердить и заселить мир','gold full'):'<div class="attention">Генезис закреплён. Дальнейшее развитие персонажей свободно; анкеты можно редактировать.</div>'}</div>`;}
if(w.genesis_approved)return `${heading('Конструктор · 2/3','Генезис','Утверждённое прошлое сохранено. Новый старт — в новой вселенной.')}<div class="attention">Этот Генезис уже утверждён. Персонажей можно изменять в разделе «Герои», а для новой истории создай отдельную вселенную.</div>${proposal}`;
return `${heading('Конструктор · 2/3','Генезис','Четыре решения о герое, затем ИИ создаёт его прошлое и окружение.')}${renderQuickGenesis()}<details class="panel" style="margin-top:16px"><summary class="login-help" style="cursor:pointer;font-weight:750">Расширенные настройки (необязательно)</summary><div class="panel" style="margin-top:12px"><form id="genesis-form" class="form two">${f('hero_name','Имя героя',c.hero_name)}${f('hero_age','Возраст в начале',c.hero_age,'number')}${selectField('base_world','Основа вселенной',['existing','original'],c.base_world)}${selectField('npc_count','Значимых NPC на старте',['2','3','4','5','6'],c.npc_count)}${selectField('origin','Происхождение',['Изгой','Богатая семья','Обычная семья','Сирота','Наследник','Неизвестное'],c.origin)}${selectField('childhood','Детство',['На улице','В семье','В приюте','Под опекой','В изоляции','В пути'],c.childhood)}${selectField('turning_point','Поворотное событие',['Побег','Потеря','Спасение','Встреча','Предательство','Открытие тайны','Нет развилки'],c.turning_point)}${selectField('close_bonds','Начальные связи',['Сложные, неоднозначные связи','Одиночка','Любимая семья','Сильная дружба','Устоявшаяся пара','Враждебное окружение'],c.close_bonds)}${selectField('core_drive','Главная мотивация',['Выживание','Свобода','Любовь','Власть','Знания','Месть','Принадлежность','Собственное дело'],c.core_drive)}<div class="span2">${f('divergence','Главная историческая развилка',c.divergence,'textarea','Какая перемена уже произошла к началу истории?')}</div><div class="span2">${f('source_material','Каноническая основа (если есть)',c.source_material,'textarea','Название произведения и факты, которые нужно сохранить. Не обязательно перечислять всех NPC.')}</div><div class="span2">${f('custom_details','Дополнительные детали',c.custom_details,'textarea')}</div></form><div class="divider"></div><div class="row mobile-full">${aiButton('genesis-auto','✦ Сгенерировать персонажей')}${btn('genesis-copy','Скопировать запрос для ChatGPT')}${btn('genesis-demo','Демо-генерация')}${btn('genesis-save','Сохранить выборы','ghost')}</div><p class="footnote">ChatGPT по подписке пока используется через копирование. Прямая интеграция в частную облачную PWA отдельно не подтверждена; платных API-вызовов приложение не делает.</p></div></details><div class="panel" style="margin-top:15px"><h2 class="section-title">Вставить JSON из ChatGPT</h2><p class="sub">Скопируй ответ целиком. Мы проверим имена и обязательные поля. Можно вставить JSON с обрамлением Markdown.</p><div class="field" style="margin:15px 0"><textarea id="genesis-json" placeholder='{"summary":"...","past_changes":[],"open_threads":[],"opening":"...","uncertainties":[],"characters":[]}'></textarea></div><div class="row mobile-full">${btn('genesis-paste','Вставить ответ из буфера')}${btn('genesis-parse','Проверить и показать персонажей','gold')}</div></div>${proposal}`;}

function renderCharacterMemory(){
 const data=state.characterLedger;
 if(!data)return '<div class="panel"><p class="sub">Для проверки знаний по всей ветке открой «Активы» и затем «Герои».</p></div>';
 const rows=data.characters.map(ch=>{
  const facts=ch.knowledge||[],beliefs=ch.beliefs||[],state=ch.state||{};
  const updates=ch.history||[];
  const line=facts.slice(-80).map(f=>`<li>${x(f.fact)}<p class="hint">Как узнал: ${x(f.via)} · сцена ${x(f.scene_id)} · ${x(f.world_time||'дата неизвестна')}</p></li>`).join('');
  const beliefsHTML=beliefs.slice(-80).map(b=>`<li>${x(b.text)} <span class="hint">(убеждение персонажа, не установленный факт; сцена ${x(b.scene_id)})</span></li>`).join('');
  const history=updates.slice(-35).map(h=>`<li>${x(h.world_time||'дата неизвестна')} · ${x(h.type==='introduced'?'Появление':JSON.stringify(h.changes||{}))} <span class="hint">(сцена ${x(h.scene_id)})</span></li>`).join('');
  return `<div class="asset-panel"><div class="eyebrow">${ch.origin==='scene'?'Новый NPC':'Изначальный персонаж'} · ${facts.length} знаний · ${beliefs.length} убеждений</div>
   <h3 class="section-title">${x(ch.name)}</h3><p class="tiny"><b>Текущее место:</b> ${x(state.location||'Не зафиксировано')}</p>
   <p class="tiny"><b>Здоровье:</b> ${x(state.health||'Не установлено')}</p>
   <p class="tiny"><b>Цели:</b> ${x(state.goals||'Не установлены')}</p>
   <p class="tiny"><b>Отношения:</b> ${x(state.relationships||'Не установлены')}</p>
   <details><summary>Что достоверно узнал (${facts.length})</summary><ul>${line||'<li>Нет записей о новых знаниях.</li>'}</ul></details>
   <details><summary>Во что верит (${beliefs.length})</summary><ul>${beliefsHTML||'<li>Убеждения отдельно не записаны.</li>'}</ul></details>
   <details><summary>История изменений (${updates.length})</summary><ul>${history||'<li>Изменения состояния ещё не зафиксированы.</li>'}</ul></details>
  </div>`;
 }).join('');
 return `<h2 class="section-title" style="margin-top:28px">Актуальная память персонажей</h2>
 <p class="sub">Пересчитано ${data.scanned_scenes} сцен текущей ветки. Знания принадлежат только тому, кто реально мог их получить, а субъективные убеждения хранятся отдельно.</p>
 ${data.warnings.length?`<div class="attention">Предупреждения: ${data.warnings.length}. Некоторые персонажи могли быть введены повторно.</div>`:''}
 <div class="asset-grid">${rows||'<div class="panel">Персонажей пока нет.</div>'}</div>`;
}

function renderPeople(){if(!state.world)return needsWorld();return `${heading('Население мира','Персонажи','Автономные личности, а не обязательные спутники героя.',btn('add-character','+ Добавить персонажа','gold'))}${state.characters.length?`<div class="grid">${state.characters.map(c=>`<div class="panel"><span class="tag">${c.role==='hero'?'Главный герой':'NPC'}</span><h2 class="section-title" style="margin:11px 0">${x(c.name)}</h2><p class="sub">${x(c.description).slice(0,320)}</p><div class="divider"></div><p class="tiny"><b>Цель:</b> ${x(c.goals).slice(0,300)}</p><p class="tiny"><b>Характер:</b> ${x(c.personality).slice(0,300)}</p><div class="row"> <button class="btn small" data-action="edit-character" data-id="${x(c.id)}">Изменить</button></div></div>`).join('')}</div>`:`<div class="well"><h3>Пока нет персонажей</h3><p>Открой «Генезис» — он создаст главного героя и окружение из выбранной предыстории.</p>${btn('goto-genesis','Перейти в Генезис','gold')}</div>`}${renderCharacterMemory()}`;}

function renderSimulationPanel(w){
 if(!w.genesis_approved)return '';
 const mode=w.genesis_choices?.simulation_mode||'off';
 const scene=state.memoryScenes.at(-1);
 const decisions=mode!=='off'?(readSceneNote(scene?.prompt_note)?.decisions||[]):[];
 const choiceKey=scene?'lw_sim_choice_'+w.id+'_'+scene.id:'';
 const savedChoice=choiceKey?localStorage.getItem(choiceKey)||'':'';
 const controls=`<div class="sim-modes">
   <button type="button" class="mode-tile ${mode==='life'?'active':''}" data-action="sim-mode" data-mode="life" aria-pressed="${mode==='life'}"><strong>Прогон жизни</strong><small>Последовательно проживать предысторию, формируя характер</small></button>
   <button type="button" class="mode-tile ${mode==='skip'?'active':''}" data-action="sim-mode" data-mode="skip" aria-pressed="${mode==='skip'}"><strong>Ускорение времени</strong><small>Пропускать рутину, сохраняя значимые события и решения</small></button>
   <button type="button" class="mode-tile ${mode==='off'?'active':''}" data-action="sim-mode" data-mode="off" aria-pressed="${mode==='off'}"><strong>Начать играть отсюда / Стоп</strong><small>Вернуться к большим литературным сценам в текущей точке</small></button>
 </div>`;
 const decisionUI=decisions.length?`<div class="sim-decisions"><div class="eyebrow">Выбери, что будет делать герой дальше</div>${decisions.map(d=>`<button type="button" data-action="sim-choice" data-choice="${x(d.id)}" class="quick-option ${savedChoice===d.id?'active':''}"><strong>${x(d.label)}</strong><small>${x(d.description)}</small></button>`).join('')}</div>`:'';
 const panel=mode==='off'?'':`<div class="row" style="align-items:flex-end;margin-top:16px"><div class="field" style="min-width:180px"><label>Один шаг симуляции (максимум)</label><select id="sim-span">${SIMULATION_SPANS.map(p=>opt(p.id,p.label,'quarter')).join('')}</select></div>${aiButton('sim-auto','⚡ Автоматически продвинуть время')}${btn('sim-copy','Скопировать запрос симуляции')}${btn('open-chatgpt','Открыть ChatGPT')}</div>${decisionUI}<p class="footnote">Каждый шаг требует запроса к ИИ и утверждения последствий. Пока прямой AI-интеграции нет, приложение не умеет автоматически прогонять годы без копирования запроса. Можно остановиться в любой момент, выбрав «Начать играть отсюда / Стоп».</p>`;
 return `<div class="panel" style="margin-bottom:18px"><h2 class="section-title">Время и жизнь персонажа</h2><p class="sub">Режимы используют ту же действующую ветку, её память и текущую дату. Переключение не отменяет прошлое.</p>${controls}${panel}</div>`;
}

function renderStory(){const w=state.world;if(!w)return needsWorld();const b=state.branches.find(b=>b.id===w.active_branch_id);const action=btn('goto-memory','Память действующей ветки')+btn('goto-assets','Деньги и вещи')+btn('goto-documents','Источники');
const storyLabel=x(String(w.model_story||'gpt-6').toUpperCase())+' · Высокое';
const relationLabel=x(String(w.model_relationships||'gpt-5.6').toUpperCase())+' · Высокое';
const storyMode=state.storyMode==='relationship'?'relationship':'story';
const modeSelector=`<div class="eyebrow" style="margin-bottom:9px">Режим следующей сцены</div><div class="mode-choices" role="group" aria-label="Выбор режима запроса для ChatGPT"><button type="button" class="mode-tile ${storyMode==='story'?'active':''}" data-action="set-story-mode" data-mode="story" aria-pressed="${storyMode==='story'}"><strong>${storyLabel}</strong><small>Сюжет · Мир · Причинность</small></button><button type="button" class="mode-tile ${storyMode==='relationship'?'active':''}" data-action="set-story-mode" data-mode="relationship" aria-pressed="${storyMode==='relationship'}"><strong>${relationLabel}</strong><small>Отношения · Диалоги · Психология</small></button></div><p class="hint" id="story-mode-status" style="margin:9px 0 17px">Выбран режим ${storyMode==='relationship'?relationLabel:storyLabel}. ${state.aiReady?'При нажатии «Продолжить» будет вызвана соответствующая API-модель с высоким уровнем рассуждения.':'AI пока не подключён: в ChatGPT модель и уровень выбираются вручную.'} Память мира одна.</p>`;
return `${heading('Архив сцен',w.name,'Полные сцены ведём в ChatGPT. Здесь сохраняются причинность, история и исправленные ветки.',action)}<div class="attention" style="margin-bottom:18px">Основной игровой режим: продолжай историю в ChatGPT. Подключённый MCP-мост читает память и записывает валидные последствия. Копирование текста и отдельный API-ключ для этого не требуются. Для записи без страницы подтверждения один раз включи автосохранение в «Настройках» выбранного мира.</div><div class="panel" style="margin-bottom:18px"><div class="row between"><span class="pill">Ветка: ${x(b?.name||'не выбрана')}</span><span class="tiny">${state.scenes.length} сцен на экране · время ${x(storyClock(w))}</span></div><div class="divider"></div>${modeSelector}<div class="form two"><div class="field"><label>Объём следующей художественной сцены</label><select id="scene-length">${opt("normal","Обычная · 1 500–3 000 слов",state.sceneLength)}${opt("large","Большая · 3 000–5 000 слов",state.sceneLength)}${opt("detailed","Подробная · 5 000–8 000 слов",state.sceneLength)}</select><p class="hint">Это ориентир для ChatGPT, а не гарантированный размер ответа. Продолжение большого эпизода может потребовать нескольких ответов.</p></div><div class="field"><label>Игровое время новой сцены</label><input class="input" id="story-clock" value="${x(storyClock(w))}" placeholder="Например, 1999-06 — день неизвестен"></div><div class="span2 field"><label>Режиссёрское уточнение (необязательно)</label><textarea id="story-note" style="min-height:75px" placeholder="Например: покажи развитие конфликта без канонической подгонки"></textarea></div></div><p class="footnote">Укажи текущий период; можно записать только месяц (например, 1999-06), не придумывая день. JSON-пакет сохраняет структурированные последствия, обычная сцена — только текст. ${x(state.aiReady?'Автоматический API подключён.':'Автоматический API не подключён: '+state.aiReason)} Причинная память автоматически охватывает максимум 200 последних сцен без гарантированного переноса старых фактов.</p><div class="row mobile-full" style="margin-top:12px">${aiButton('auto-scene','▶ Продолжить историю автоматически')}${btn('copy-scene-packet','Запрос с памятью (JSON)')}${btn('copy-scene-prompt','Простой текстовый запрос')}${btn('open-chatgpt','Открыть ChatGPT')}</div></div>${renderSimulationPanel(w)}${state.scenes.length?state.scenes.map((s,i)=>`<article class="scene"><div class="meta"><span>СЦЕНА ${String(i+1).padStart(3,'0')} · ${x(s.model)}</span><span>${x(s.world_time)}</span></div><div class="body">${x(s.body)}</div><div class="actions"><button class="btn small" data-action="revise" data-id="${x(s.id)}">✎ На это</button></div></article>`).join(''):`<div class="well"><h3>История ещё не началась</h3><p>Создай начальную ситуацию, затем попроси ChatGPT написать первую сцену и вставь её сюда.</p></div>`}<div class="panel"><h2 class="section-title">Добавить сцену</h2><p class="sub">Вставь текст, полученный от ChatGPT, или напиши свой. После сохранения сцена войдёт в текущую ветку.</p><form id="scene-form" class="form" style="margin-top:15px"><div class="field"><label>Текст сцены</label><textarea name="body" style="min-height:180px" placeholder="Вставь сюда новую сцену..."></textarea></div><button class="btn gold full" type="submit">Сохранить сцену в облаке</button></form></div><details class="panel" style="margin-bottom:18px"><summary style="cursor:pointer;font-weight:750">Вставить пакет ИИ: сцена + последствия (JSON)</summary><p class="sub" style="margin-top:12px">Скопируй «Запрос с памятью (JSON)», получи ответ в ChatGPT и вставь его целиком сюда. Только утверждённые изменения войдут в память активной ветки; в отменённой ветке они не сохраняются.</p><form id="scene-package-form" class="form" style="margin-top:12px"><div class="field"><label>Ответ ChatGPT (JSON)</label><textarea name="payload" style="min-height:190px" placeholder='{"scene":"...","world_time":"1999-06","changes":{"facts":[],"open_threads":[],"resolved_threads":[],"offscreen_events":[],"characters":[]}}'></textarea></div><button class="btn gold full" type="submit">Проверить, сохранить сцену и последствия</button></form></details>${state.scenes.length>=state.recentLimit?`<p style="text-align:center">${btn('load-more','Показать более ранние сцены')}</p>`:''}`;}


function renderDocuments(){
 if(!state.world)return needsWorld();
 const header=heading('Архив первоисточников','Документы мира','Полные правила, глоссарии, модели и завершённые годы с проверяемыми редакциями.',btn('docs-refresh','Обновить'));
 if(state.documentsReady===false){
   const ref=String(state.config?.url||'').match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)?.[1];
   const editor=ref?'https://supabase.com/dashboard/project/'+ref+'/sql/new':'https://supabase.com/dashboard';
   return header+`<div class="attention"><b>Библиотека документов пока не установлена в Supabase.</b><p>Это одноразовая настройка. Открой SQL-файл, скопируй его содержимое, вставь в SQL Editor и нажми <b>Run</b>. После этого вернись сюда и нажми «Обновить».</p>
    <div class="row"><a class="btn gold" href="https://github.com/korotkowdoc-arch/living-world/blob/main/supabase/reference_docs.sql" target="_blank" rel="noopener">1. Открыть SQL-миграцию</a><a class="btn" href="${x(editor)}" target="_blank" rel="noopener">2. Открыть Supabase SQL Editor</a></div>
    <p class="tiny">Скрипт не удаляет старые миры, персонажей и сцены. Он создаёт отдельную приватную таблицу документов и правила доступа.</p><p class="tiny">Состояние сервера: ${x(state.documentsError)}</p></div>`;
 }
 if(state.documentsReady!==true)return header+'<div class="panel">Загружаем список документов…</div>';
 const docs=state.documents;
 const allowImport=state.world.genesis_choices?.document_upload_enabled===true;
 const importToggle=`<div class="ai-status"><b>Импорт документов из этого чата: ${allowImport?'разрешён':'нуждается в разрешении'}</b><p>Разрешение позволяет подключённому MCP сохранять полный текст проектных документов в выбранный мир. Файлы и правки других миров не затрагиваются.</p>${btn('toggle-document-import',allowImport?'Запретить импорт из ChatGPT':'Разрешить импорт документов',allowImport?'':'gold')}</div>`;
 const sources=(state.worlds||[]).filter(w=>w.id!==state.world.id);
 const reusable=`<div class="panel"><h2 class="section-title">Общие документы из другого мира</h2><p class="sub">Скопировать <b>правила, глоссарий, причинные ориентиры и стиль</b> из уже созданного мира. История пройденных лет, checkpoint, персонажи, их отношения и предметы не копируются. Это отдельные редакции в новом мире, старый не меняется.</p>${sources.length?`<div class="field"><label>Мир-источник</label><select id="docs-source-world">${sources.map(w=>opt(w.id,w.name,w.id===sources[0].id?sources[0].id:sources[0].id)).join('')}</select></div><div class="row" style="margin-top:12px">${btn('docs-copy-shared','Скопировать общие документы','gold')}</div>`:'<p class="hint">В библиотеке пока нет других миров-источников. После создания нового мира эта кнопка появится.</p>'}</div>`;
 const types=DOC_CATEGORIES.map(kind=>opt(kind.id,kind.label,'world_lore')).join('');
 const rows=docs.map(d=>`<div class="asset-panel doc-card">
  <div class="eyebrow">${x(docCategory(d.category).label)} · редакция ${x(d.revision)}</div>
  <h3 class="section-title">${x(d.title)}</h3>
  <p class="tiny">${x(d.source_filename||'Добавлен текстом')} · ${x(Number(d.content_length||0).toLocaleString('ru-RU'))} символов</p>
  <p class="tiny">SHA-256: <code>${x(String(d.sha256||'').slice(0,16))}…</code></p>
  <div class="row"><button class="btn small" data-action="doc-open" data-id="${x(d.id)}">Прочитать</button><button class="btn small" data-action="doc-replace" data-key="${x(d.doc_key)}">Новая редакция</button></div>
 </div>`).join('');
 const selected=state.docSelected?docs.find(d=>d.id===state.docSelected):null;
 const preview=selected?`<div class="panel doc-preview"><h3 class="section-title">${x(selected.title)} · редакция ${x(selected.revision)}</h3><p class="hint">Показывается текст, извлечённый из исходного документа. Данные приватны для владельца мира.</p>${state.docContent!==null?`<pre class="doc-text">${x(state.docContent.slice(0,30000))}${state.docContent.length>30000?'\n… Отображены первые 30 000 символов. Полная версия сохранена в Supabase.':''}</pre>`:'<p>Загрузка текста…</p>'}<div class="row">${btn('doc-close','Закрыть')}${state.docContent?btn('doc-copy','Скопировать полную редакцию'):''}</div></div>`:'';
 return header+importToggle+reusable+`<div class="panel">
   <h2 class="section-title">Загрузить документы мира</h2>
   <p class="sub">Можно выбрать сразу до 12 файлов DOCX, TXT или Markdown: правила, глоссарий, модели персонажей, завершённые годы и примеры. Категории определяются автоматически по именам.</p>
   <div class="field"><label for="doc-files">Выбрать файлы</label><input type="file" id="doc-files" accept=".docx,.txt,.md,.markdown" multiple></div>
   <div class="row" style="margin-top:12px">${btn('docs-import','Сохранить документы в Supabase','gold')}</div>
   <p class="footnote">Сейчас сохраняются извлечённый текст, имя файла, редакция и контрольная сумма SHA-256; бинарный исходный DOCX отдельно пока не хранится. Повторный импорт обновлённого файла создаст новую неизменяемую редакцию.</p>
 </div>`+
 `<div class="panel"><h3 class="section-title">Добавить отдельный текст</h3><form class="form" id="doc-text-form"><div class="field"><label>Название</label><input name="title" class="input" required placeholder="Например: Дополнительное правило"></div><div class="field"><label>Тип источника</label><select name="category">${types}</select></div><div class="field"><label>Полный текст</label><textarea name="content" rows="7" required></textarea></div><button type="submit" class="btn">Сохранить источник</button></form></div>`+
 `<h2 class="section-title" style="margin-top:24px">Библиотека (${docs.length})</h2><div class="asset-grid">${rows||'<div class="panel">Здесь пока нет документов. Генерация сцен не имеет доступа к полным первоисточникам.</div>'}</div>`+preview;
}


function renderSaveStatus(){
 if(!state.world)return '';
 const branch=state.branches.find(b=>b.id===state.world.active_branch_id);
 if(!branch)return '<div class="attention">Сохранение: действующая ветка отсутствует.</div>';
 const head=branch.head_scene_id||null;
 const last=state.memoryScenes.at(-1)||null;
 const aligned=!head||last?.id===head;
 const structured=last?!!readSceneNote(last.prompt_note):false;
 const status=!head?'Новый мир: сцен пока нет':!aligned?'Нужно перечитать последнюю сцену':structured?'Сцена и последствия найдены':'Сцена найдена, но структурированные последствия отсутствуют';
 const alert=!aligned||(head&&!structured);
 return `<div class="panel save-status ${alert?'save-status-warn':''}">
 <div class="row between"><h2 class="section-title">Последнее сохранение</h2><span class="tag">${x(status)}</span></div>
 <p class="tiny"><b>Действующая ветка:</b> ${x(branch.name)}</p>
 <p class="tiny"><b>Последняя сцена:</b> ${x(head||'ещё не создана')}</p>
 <p class="tiny"><b>Игровая дата:</b> ${x(last?.world_time||state.world.genesis_choices?.current_period||'не установлена')}</p>
 ${head&&!structured?'<p class="hint">Полный текст хранится, но карта ресурсов и знаний может быть неполной: проверь пакет последствий сцены.</p>':''}
 ${!aligned?'<p class="hint">Последняя запись и голова ветки не совпали в загруженных данных. Обнови состояние и не продолжай историю до проверки.</p>':''}
 <div class="row">${btn('assets-reload','Проверить сохранение в Supabase')}${btn('goto-story','Архив сцен')}</div>
 </div>`;
}
function renderWorldReadiness(){
 const documents=state.documentsReady===true;
 const types=new Set((state.documents||[]).map(d=>d.category));
 const rules=types.has('core_rules'),glossary=types.has('glossary'),years=types.has('year_document');
 const assets=state.assets;
 const memory=state.characterLedger;
 const statuses=[
  {name:'Библиотека источников',okay:documents,text:documents?'Подключена к Supabase':'Нужна SQL-миграция'},
  {name:'Основные правила',okay:rules,text:rules?'Загружены':'Нет полного исходного документа'},
  {name:'Глоссарий',okay:glossary,text:glossary?'Загружен':'Не загружен (если нужен для этого мира)'},
  {name:'Годовые документы',okay:years,text:years?'Есть сохранённые годы':'Пока нет (допустимо для новой истории)'},
  {name:'Состояние персонажей',okay:!!memory,text:memory?'Из '+memory.scanned_scenes+' сцен ветки':'Ещё не пересчитано'},
  {name:'Ресурсы и инвентарь',okay:!!assets&&!assets.issues?.length,text:assets?.issues?.length?'Есть противоречия: '+assets.issues.length:assets?'Проверены':'Ещё не пересчитаны'}
 ];
 return `<div class="panel readiness"><h2 class="section-title">Готовность памяти к следующей сцене</h2><p class="sub">Это не оценка качества литературы: здесь показано, какие данные доступны для проверки причинности. Отсутствие годовых документов нормально для совершенно нового мира.</p>
 <div class="readiness-grid">${statuses.map(v=>`<div class="readiness-line"><span class="${v.okay?'ready-ok':'ready-missing'}" aria-hidden="true">${v.okay?'✓':'!'}</span><div><strong>${x(v.name)}</strong><p class="hint">${x(v.text)}</p></div></div>`).join('')}</div>
 <div class="row">${btn('goto-documents','Открыть документы')}${btn('goto-memory','Проверить память')}</div></div>`;
}

function renderAssets(){
 const w=state.world;if(!w)return needsWorld();
 if(!state.assets)return `${heading('Действующая ветка','Активы и ресурсы','Журнал собственности, денег и новых персонажей из подтверждённых сцен.',btn('assets-reload','Загрузить журнал','gold'))}${renderSaveStatus()}<div class="attention">${x(state.assetIssue||'Полный журнал ещё не загружен. Старые сцены не считаются нулевыми деньгами или отсутствующими вещами.')}</div>`;
 const a=state.assets;
 const accounts=a.accounts.map(acc=>`<div class="asset-panel"><div class="eyebrow">${x(acc.person)} · ${x(acc.currency)}</div><h3 class="section-title">${x(formatAmount(acc))}</h3>${!acc.known?'<p class="hint">Начальный остаток неизвестен. Показаны только подтверждённые изменения.</p>':''}<details><summary>История денежных операций (${acc.entries.length})</summary><ul>${acc.entries.slice(-35).map(e=>`<li><b>${x(e.action)}</b> · ${x(e.amount)} ${x(e.currency)} · ${x(e.reason)} <span class="muted">(${x(e.world_time)}, сцена ${x(e.scene_id)})</span></li>`).join('')}</ul></details></div>`).join('');
 const possessions=a.items.map(item=>`<div class="asset-panel"><div class="eyebrow">${x(item.id)} · ${item.exists?'В мире':'Утрачен или использован'}</div><h3 class="section-title">${x(item.label)}</h3><p class="tiny"><b>Собственник:</b> ${x(item.owner)}</p><p class="tiny"><b>Фактический держатель:</b> ${x(item.holder||'Нет')}</p><p class="tiny"><b>Место:</b> ${x(item.location||'Не установлено')}</p>${item.condition?`<p class="tiny"><b>Состояние:</b> ${x(item.condition)}</p>`:''}<details><summary>История предмета (${item.history.length})</summary><ul>${item.history.map(h=>`<li><b>${x(h.action)}</b> — ${x(h.reason)} <span class="muted">(${x(h.world_time)}, сцена ${x(h.scene_id)})</span></li>`).join('')}</ul></details></div>`).join('');
 const newcomers=a.new_characters.map(p=>`<div class="asset-panel"><h3 class="section-title">${x(p.name)}</h3><p class="tiny">${x(p.description)}</p><p class="tiny"><b>Появление:</b> ${x(p.causal_link)} <span class="muted">(сцена ${x(p.created_scene_id)})</span></p><p class="tiny"><b>Цели:</b> ${x(p.goals)}</p><p class="tiny"><b>Что знает:</b> ${x(p.knowledge)}</p></div>`).join('');
 const issues=a.issues.length?`<div class="attention"><h3>Требуют проверки (${a.issues.length})</h3><ul>${a.issues.slice(0,25).map(z=>`<li>Сцена ${x(z.scene_id)}: ${x(z.error)}</li>`).join('')}</ul></div>`:'';
 return `${heading('Счёт и инвентарь','Живые активы','Только сыгранное в действующей ветке. Невыясненные суммы не превращаются в ноль.',btn('assets-reload','Перечитать сцены'))}${renderSaveStatus()}${renderWorldReadiness()}<p class="sub">Проверены ${a.scanned_scenes} сцен. ${a.audit.length} подтверждённых операций. Удалённые при «На это:» события здесь не учитываются.</p>${issues}<h2 class="section-title">Деньги и счета (${a.accounts.length})</h2><div class="asset-grid">${accounts||'<div class="panel">Суммы пока не зафиксированы. Это не означает нулевой баланс.</div>'}</div><h2 class="section-title" style="margin-top:26px">Предметы и собственность (${a.items.length})</h2><div class="asset-grid">${possessions||'<div class="panel">Подтверждённых предметов в структурированном журнале пока нет.</div>'}</div><h2 class="section-title" style="margin-top:26px">Новые люди из сцен (${a.new_characters.length})</h2><div class="asset-grid">${newcomers||'<div class="panel">Пока нет новых зарегистрированных персонажей.</div>'}</div>`;
}

function renderMemory(){
 if(!state.world)return needsWorld();
 const m=state.causalLedger;
 if(!m)return heading('Причинная память','Сыгранные факты','История хранится по действующей ветке, а не как пересказ последних сообщений.')+
  '<div class="attention">Полный журнал ещё не пересчитан. Не считай пустой экран доказательством отсутствия фактов.</div>'+btn('memory-reload','Загрузить всю память','gold');
 const kinds=[['fact','Факты'],['open_thread','Открытые линии'],['resolved_thread','Закрытые линии'],['offscreen','Вне кадра']];
 const page=searchCausalMemory(m,{kind:state.memoryKind,query:state.memoryQuery,offset:state.memoryOffset,limit:40});
 const renderEvent=e=>`<li><b>${x(e.text)}</b><p class="hint">Сцена: ${x(e.scene_id||e.last_scene_id||e.opened_scene_id||'неизвестно')} · ${x(e.world_time||e.last_at||'время не зафиксировано')}</p></li>`;
 const active=m.open_threads.slice(-80).map(e=>`<li><b>${x(e.text)}</b><span class="hint"> · открыта в сцене ${x(e.opened_scene_id||'неизвестно')}</span></li>`).join('');
 const box=(title,body)=>`<div class="panel stack"><h2 class="section-title">${x(title)}</h2>${body}</div>`;
 return `${heading('Действующая ветка','Причинная память','Восстановлена по всей действующей цепочке. Старые обещания и события доступны через поиск.',btn('memory-reload','Обновить из Supabase'))}
 <div class="panel"><div class="row between"><b>Сцен проанализировано: ${m.scanned_scenes}</b><span class="tag">${m.counts.facts} фактов · ${m.counts.open_threads} открытых линий</span></div>
 <div class="form two" style="margin-top:15px"><div class="field"><label for="memory-kind">Тип сведений</label><select id="memory-kind">${kinds.map(([value,label])=>opt(value,label,state.memoryKind)).join('')}</select></div>
 <div class="field"><label for="memory-query">Найти старый факт, обещание или событие</label><input id="memory-query" class="input" value="${x(state.memoryQuery)}" placeholder="Например, наследство, мантия, обещал"></div></div>
 <div class="row" style="margin-top:12px">${btn('memory-search','Искать по всей ветке')}</div></div>
 ${box('Результаты ('+page.total+')',`<ul>${page.items.map(renderEvent).join('')||'<li>По этому запросу ничего не найдено.</li>'}</ul><div class="row">${state.memoryOffset>0?btn('memory-prev','Предыдущие'):''}${page.next_offset!==null?btn('memory-next','Следующие'):''}</div>`)}
 <div class="grid">
 ${box('Незакрытые сюжетные линии ('+m.counts.open_threads+')',`<ul>${active||'<li>В структурированной памяти нет открытых линий.</li>'}</ul>${m.counts.open_threads>80?'<p class="hint">Показаны последние 80. Остальные находятся поиском по типу «Открытые линии».</p>':''}`)}
 ${box('События вне кадра ('+m.counts.offscreen_events+')',`<ul>${m.offscreen_events.slice(-40).map(renderEvent).join('')||'<li>Пока не зафиксированы.</li>'}</ul>`)}
 </div>
 ${m.warnings.length?`<div class="attention">В журнале обнаружены ${m.warnings.length} закрытых линий без ранее найденного открытия. Проверь источник.</div>`:''}
 ${renderCharacterMemory()}`;
}
function renderHistory(){if(!state.world)return needsWorld();return `${heading('Временные линии','Ветки реальности','Каждая правка сохраняет прежний вариант, но не переносит отменённые события.')}<div class="panel">${state.branches.map(b=>`<div class="listrow"><div><b>${x(b.name)}</b> ${b.id===state.world.active_branch_id?'<span class="tag">Действующая</span>':''}<p>Создана: ${x(new Date(b.created_at).toLocaleString('ru-RU'))}</p><p>Текущая сцена: ${x(b.head_scene_id||'нет')}</p></div>${b.id!==state.world.active_branch_id?`<button class="btn small" data-action="switch-branch" data-id="${x(b.id)}">Перейти</button>`:''}</div>`).join('')}</div><div class="well" style="margin-top:16px">Чтобы изменить прошлое, в разделе «История» нажми «На это» под нужной сценой. Новая ветка возникнет автоматически.</div>`;}
function renderSettings(){const w=state.world,auto=w?.genesis_choices?.auto_save_enabled===true;
return `${heading('Настройки','Моё приложение','Приватность, модели, резервное копирование и вход.')}<div class="panel stack">${w?`<div class="ai-status"><b>Запись сцен из ChatGPT: ${auto?'автоматическое сохранение разрешено':'ручное подтверждение каждой сцены'}</b><p>Если включить, подключённый MCP-мост сможет записывать действительно сыгранные сцены в этот мир одним вызовом при правильной ветке и владельце. Это не включает платный API и не меняет модель ChatGPT.</p>${btn('toggle-auto-save',auto?'Отключить автосохранение':'Разрешить автосохранение сцен',auto?'':'gold')}</div>`:''}<details class="login-help"><summary>Дополнительно: самостоятельная генерация на сайте через отдельный API</summary><div class="ai-status"><b>Автоматический ИИ: ${state.aiReady?'Подключён':'Не подключён'}</b><p>${state.aiReady?'Кнопки Генезиса, сцен и ускорения вызывают OpenAI API через защищённый Worker.':'Для автоматической генерации добавь секрет OPENAI_API_KEY в Cloudflare Worker living-world-bridge-mcp и проверь подключение. '+x(state.aiReason)}</p>${btn('ai-refresh','Проверить AI-подключение')}</div></details>
 <details class="login-help" open><summary>Диагностика настоящих сейвов</summary>
 <div class="panel"><p class="sub">Проверка через Cloudflare и Supabase: создать <b>отдельный временный технический мир</b>, сохранить сцену, повторить запрос с тем же ID, прочитать баланс и предмет, затем удалить временный мир. Твои миры и история Гарри не изменяются.</p>
 ${btn('run-save-diagnostic','Проверить сейвы в реальной базе','gold')}
 ${state.saveDiagnostic?`<div class="save-diagnostic-result"><strong>${state.saveDiagnostic.ok?'Тест прошёл':'Тест не прошёл'}</strong>
 <p class="tiny">${state.saveDiagnostic.ok?'Сцена записана и перечитана. Повтор не создал дубль.':''}${x(state.saveDiagnostic.reason||'')}</p>
 ${!state.saveDiagnostic.ok?`<p class="tiny"><b>Этап:</b> ${x(state.saveDiagnostic.stage||'неизвестен')} · <b>Код:</b> ${x(state.saveDiagnostic.error_code||'неизвестен')}</p>`:''}
 ${['PGRST202','42883','PGRST204'].includes(state.saveDiagnostic.error_code)?`<p class="hint">Нужна SQL-функция сохранения сцен. Установи её в Supabase, затем повтори тест.</p><div class="row"><a class="btn" href="https://github.com/korotkowdoc-arch/living-world/blob/main/supabase/bridge_save.sql" target="_blank" rel="noopener">Открыть SQL исправления</a><a class="btn" href="https://supabase.com/dashboard/project/bcwzlsljcxubqtvzsucz/sql/new" target="_blank" rel="noopener">Supabase SQL Editor</a></div>`:''}
 ${state.saveDiagnostic.ok?`<p class="tiny">Сцен: ${x(state.saveDiagnostic.receipt?.scanned_scenes)} · баланс: ${x(state.saveDiagnostic.receipt?.balance)} галеонов · повтор защищён: да</p>`:''}
 <p class="tiny"><b>Временный мир:</b> ${state.saveDiagnostic.temporary_world_removed?'удалён':state.saveDiagnostic.temporary_world_id?'проверь удаление вручную: '+x(state.saveDiagnostic.temporary_world_id):'не создавался'}</p></div>`:''}
 <p class="footnote">Этот тест проверяет работающий серверный путь записи, но не обновляет набор команд OAuth в ChatGPT. Для автоматических сейвов из чата подключение должно видеть save_scene_auto.</p>
 </div></details><div class="listrow"><div><b>Подключённый аккаунт</b><p>${x(state.user?.email)}</p></div>${btn('logout','Выйти','small')}</div><div class="listrow"><div><b>Хранилище</b><p>Supabase · данные в облаке, Mac не нужен</p></div><span class="tag">RLS</span></div><details class="login-help"><summary>Установить или сменить пароль</summary><form id="password-form" class="form">${f('new_password','Новый пароль (не меньше 12 символов)','','password')}${f('repeat_password','Повтори пароль','','password')}<button class="btn" type="submit">Сохранить новый пароль</button></form><p class="footnote">Для изменения пароля аккаунт должен быть авторизован. Если Supabase требует повторное подтверждение личности, он сообщит об этом.</p></details><div class="divider"></div>${state.world?`<form id="models-form" class="form two">${f('model_story','Модель для сюжета',state.world.model_story)}${f('model_relationships','Модель для отношений',state.world.model_relationships)}<div class="span2"><button type="submit" class="btn">Сохранить предпочтения</button></div></form><div class="divider"></div><h3>Резервная копия</h3><p class="sub">Экспорт содержит все сцены всех веток и биографии. Сохраняй файл в iCloud Drive или другое надёжное место.</p><div class="row mobile-full">${btn('export-world','Экспортировать текущий мир','gold')}${btn('import-open','Импортировать резервную копию')}</div>`:`<div class="well">Выбери мир для экспорта или импорта.</div>`}<div class="divider"></div><div class="attention">Встроенных платных AI-запросов нет. Прямое использование подписки ChatGPT из частного облачного PWA пока не реализовано и не гарантировано.</div><div class="footnote">Этот сайт может быть публично доступен по URL, но содержимое миров требует входа в Supabase и защищено политиками доступа. На бесплатном тарифе сохраняй резервные копии.</div></div>`;}
function renderModal(){const m=state.modal;if(!m)return '';let body='';if(m.type==='character'){const c=m.character||{};body=`<form class="form two" id="character-form"><div class="field"><label>Роль</label><select name="role">${opt('npc','NPC',c.role||'npc')}${opt('hero','Главный герой',c.role||'npc')}</select></div>${f('name','Имя',c.name||'')} ${CHARACTER_FIELDS.filter(k=>k!=='name').map(k=>`<div class="span2">${f(k,({causal_link:'Причинная связь',description:'Биография',personality:'Характер',goals:'Цели',relationships:'Отношения',knowledge:'Знания',location:'Место',health:'Здоровье',mood:'Настроение',status:'Статус',inventory:'Имущество'})[k],c[k]||'','textarea')}</div>`).join('')}<div class="span2"><button class="btn gold full" type="submit">${c.id?'Сохранить персонажа':'Создать персонажа'}</button></div></form>`;}
if(m.type==='revision'){const s=m.scene;body=`<p class="sub">Поставь курсор в текст после последней фразы, которую нужно сохранить, и нажми «Зафиксировать точку». Всё далее аннулируется в новой ветке.</p><div class="field" style="margin:14px 0"><label>Текст исходной сцены</label><textarea id="revision-source" style="min-height:185px">${x(s.body)}</textarea></div><div class="row">${btn('revision-mark','Зафиксировать точку','gold')}${btn('revision-copy','Скопировать запрос «На это»')}</div><p class="tiny" id="revision-anchor-status">Сохранено символов: ${state.revision?.prefix?.length??0}</p><div class="field"><label>Твоя режиссёрская правка</label><textarea id="revision-note" placeholder="На это: герой не отступает, потому что...">${x(state.revision?.note||'')}</textarea></div><div class="field"><label>Новое продолжение ПОСЛЕ точки вмешательства</label><textarea id="revision-continuation" style="min-height:165px" placeholder="Вставь текст из ChatGPT или напиши продолжение сам."></textarea></div>${btn('revision-commit','Создать новую ветку','gold full')}<p class="footnote">Новая ветка будет содержать старый префикс + новое продолжение. Прежняя версия не удаляется из архива.</p>`;}
if(m.type==='delete-world'){
 body=`<p class="sub">Удалить мир <strong>«${x(m.name)}»</strong> со всей его историей, персонажами и документами?</p><p class="hint">Это действие нельзя отменить.</p><div class="row" style="margin-top:20px">${btn('cancel-delete-world','Нет')}${btn('confirm-delete-world','Да','danger')}</div>`;
}
if(m.type==='import'){body=`<p class="sub">Выбери JSON-файл экспорта LIVING WORLD. Он будет восстановлен как новая копия мира.</p><div class="field" style="margin:15px 0"><label>Файл резервной копии</label><input type="file" id="backup-file" accept="application/json,.json"></div>${btn('import-file','Восстановить мир из файла','gold full')}`;}
return `<div class="modalwrap"><div class="modal"><div class="modal-head"><h2>${x(m.type==='character'?'Редактор персонажа':m.type==='revision'?'Режиссёрская правка':m.type==='delete-world'?'Удалить мир?':'Импорт мира')}</h2><button class="btn small" data-action="close-modal" aria-label="Закрыть">✕</button></div>${body}</div></div>`;}
async function checkAiConnection(){
 const status=await aiStatus();
 state.aiReady=status.enabled;
 state.aiReason=status.reason||'';
 return status;
}
async function runAI(payload){
 if(!state.aiReady)throw Error(state.aiReason||'Автоматический ИИ ещё не подключён.');
 const session=dataOrThrow(await state.client.auth.getSession());
 if(!session.session)throw Error('Войди заново в LIVING WORLD.');
 document.body.classList.add('ai-running');
 try{return await aiGenerate(session.session,payload);}
 finally{document.body.classList.remove('ai-running');}
}
function aiButton(id,title){
 return `<button type="button" class="btn gold" data-action="${id}" ${state.aiReady?'':'disabled title="'+x(state.aiReason)+'"'}>${title}</button>`;
}
async function connect(){if(!state.config)return;const {url,key}=state.config;if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(url)||!key)throw Error('Некорректный Project URL или ключ Supabase.');const sdk=await import('https://esm.sh/@supabase/supabase-js@2');state.client=sdk.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const result=await state.client.auth.getSession();if(result.error)throw result.error;state.session=result.data.session;state.user=state.session?.user||null;state.client.auth.onAuthStateChange((_event,session)=>{const old=state.user?.id;state.session=session;state.user=session?.user||null;if(state.user&&!old){loadWorlds().then(render).catch(e=>notify(errtext(e),true));}else if(!state.user){state.world=null;state.worlds=[];render();}});if(state.user)await loadWorlds();await checkAiConnection();}
async function loadWorlds(){state.worlds=dataOrThrow(await state.client.from('lw_worlds').select('*').order('updated_at',{ascending:false}));}
async function openWorld(id){state.assets=null;state.assetIssue=null;state.documents=[];state.documentsReady=null;state.documentsError='';state.docSelected=null;state.docContent=null;state.characterLedger=null;state.causalLedger=null;state.memoryQuery='';state.memoryKind='fact';state.memoryOffset=0;state.world=dataOrThrow(await state.client.from('lw_worlds').select('*').eq('id',id).single());const savedAnswers=state.world.genesis_choices?.quick_answers;state.quickAnswers=Array.isArray(savedAnswers)?savedAnswers.slice(0,QUICK_GENESIS_STEPS.length):[];state.quickStep=state.quickAnswers.length===QUICK_GENESIS_STEPS.length?QUICK_GENESIS_STEPS.length:0;state.storyMode=localStorage.getItem('lw_story_mode_'+id)==='relationship'?'relationship':'story';state.sceneLength=['normal','large','detailed'].includes(localStorage.getItem('lw_scene_length_'+id))?localStorage.getItem('lw_scene_length_'+id):'large';const [chars,branches]=await Promise.all([state.client.from('lw_characters').select('*').eq('world_id',id).order('created_at'),state.client.from('lw_branches').select('*').eq('world_id',id).order('created_at')]);state.characters=dataOrThrow(chars);state.branches=dataOrThrow(branches);if(!state.world.active_branch_id && state.branches[0]){state.world.active_branch_id=state.branches[0].id;dataOrThrow(await state.client.from('lw_worlds').update({active_branch_id:state.world.active_branch_id}).eq('id',id));}await loadScenes();await loadDocuments();}
async function loadScenes(){if(!state.world?.active_branch_id){state.scenes=[];state.memoryScenes=[];return;}const id=state.world.active_branch_id;const [visible,memory]=await Promise.all([state.client.rpc('lw_recent_scenes',{p_branch_id:id,p_limit:state.recentLimit}),state.client.rpc('lw_recent_scenes',{p_branch_id:id,p_limit:200})]);state.scenes=dataOrThrow(visible);state.memoryScenes=dataOrThrow(memory);}

async function loadAssets(){
 const w=state.world;
 if(!w){state.assets=null;return;}
 const branch=state.branches.find(b=>b.id===w.active_branch_id);
 if(!branch)throw Error('Действующая ветка не найдена.');
 const all=[];
 for(let offset=0;offset<=3000;offset+=500){
  const res=state.client.from('lw_scenes').select('id,parent_scene_id,world_time,prompt_note').eq('world_id',w.id).order('created_at',{ascending:true}).range(offset,offset+499);
  const page=dataOrThrow(await res);
  if((offset===3000 && page.length>0)||all.length+page.length>3000)throw Error('Не удалось пересчитать активы: больше 3000 сцен. Требуется долговременный checkpoint.');
  all.push(...page);
  if(page.length<500||offset===3000)break;
 }
 const lineage=activeLineage(all,branch.head_scene_id);
 state.assets=projectCompanion(lineage,{getDelta:s=>readSceneNote(s.prompt_note)?.delta||{},strict:false});
 state.characterLedger=projectCharacterMemory(state.characters,lineage,{getDelta:s=>readSceneNote(s.prompt_note)?.delta||{}});
 state.causalLedger=projectCausalMemory(lineage,{getDelta:s=>readSceneNote(s.prompt_note)?.delta||{}});
 state.assetIssue=null;
}

let mammothLoader=null;
async function loadDocuments(){
 if(!state.world){state.documents=[];state.documentsReady=null;return;}
 const response=await state.client.from('lw_reference_doc_manifest').select('*').eq('world_id',state.world.id).limit(150);
 if(response.error){state.documentsReady=false;state.documentsError=response.error.message||'Не удалось получить документы.';state.documents=[];return;}
 state.documents=(response.data||[]).sort((a,b)=>docCategory(b.category).priority-docCategory(a.category).priority||a.title.localeCompare(b.title,'ru'));
 state.documentsReady=true;state.documentsError='';
}
async function readDocument(id){
 if(!state.world)throw Error('Мир не выбран.');
 const r=await state.client.from('lw_reference_docs').select('id,world_id,doc_key,revision,category,title,content').eq('id',id).eq('world_id',state.world.id).single();
 const doc=dataOrThrow(r);
 state.docSelected=id;state.docContent=doc.content;
}
async function browserDocxParser(){
 if(window.mammoth?.convertToHtml)return window.mammoth;
 if(!mammothLoader)mammothLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.13.0/mammoth.browser.min.js';
  script.crossOrigin='anonymous';
  script.onload=()=>window.mammoth?.convertToHtml?resolve(window.mammoth):reject(Error('Обработчик DOCX не запустился.'));
  script.onerror=()=>reject(Error('Не удалось загрузить локальный обработчик DOCX. При необходимости сохрани документ в TXT.'));
  document.head.appendChild(script);
 });
 return mammothLoader;
}
async function insertDocument({title,category,filename='',text,existingKey=null}){
 if(!state.documentsReady)throw Error('Библиотека документов ещё не установлена.');
 const content=normalizedDocumentText(text);
 const sha=await digestText(content);
 const key=existingKey||category+'-'+(await digestText((filename||title).toLocaleLowerCase('ru'))).slice(0,22);
 const old=state.documents.find(d=>d.doc_key===key);
 if(old?.sha256===sha)return {skipped:true,doc:old};
 const obj={world_id:state.world.id,owner_id:state.user.id,doc_key:key,revision:old?old.revision+1:1,category,title:title.slice(0,250),source_filename:filename.slice(0,250),content,sha256:sha};
 const r=await state.client.from('lw_reference_docs').insert(obj).select('id,doc_key,revision').single();
 return {skipped:false,doc:dataOrThrow(r)};
}
async function importDocuments(files,existingKey=null){
 if(!state.documentsReady)throw Error('Сначала установи SQL-миграцию библиотеки документов.');
 const list=[...files];
 if(!list.length)throw Error('Выбери файлы DOCX, TXT или Markdown.');
 if(list.length>12)throw Error('За один раз можно импортировать не больше 12 документов.');
 let imported=0,unchanged=0;
 const issues=[];
 for(const f of list){
  try{
   const category=guessCategory(f.name);
   const isDocx=/\.docx$/i.test(f.name);
   const content=await extractDocumentFile(f,{mammoth:isDocx?await browserDocxParser():undefined});
   const replace=existingKey&&list.length===1?existingKey:null;
   const parent=replace?state.documents.find(d=>d.doc_key===replace):null;
   const result=await insertDocument({title:f.name.replace(/\.[^.]+$/,''),category:parent?.category||category,filename:f.name,text:content,existingKey:replace});
   if(result.skipped)unchanged++;else imported++;
   await loadDocuments();
  }catch(error){issues.push(f.name+': '+errtext(error));}
 }
 return {imported,unchanged,issues};
}
async function copyReusableDocuments(sourceWorldId,categories=REUSABLE_SOURCE_CATEGORIES){
 const destination=state.world;
 if(!destination||state.documentsReady!==true)throw Error('Не выбрана готовая библиотека документов нового мира.');
 const source=(state.worlds||[]).find(w=>w.id===sourceWorldId&&w.id!==destination.id);
 if(!source)throw Error('Выбери другой принадлежащий тебе мир.');
 const approved=categories.filter(c=>REUSABLE_SOURCE_CATEGORIES.includes(c));
 if(!approved.length)throw Error('Не выбраны категории для переноса.');
 const response=await state.client.from('lw_reference_docs').select('doc_key,revision,category,title,source_filename,content,sha256')
  .eq('world_id',source.id).in('category',approved).order('revision',{ascending:false}).limit(150);
 const records=dataOrThrow(response);
 const latest=latestReusableDocs(records,approved);
 let copied=0,unchanged=0;
 const errors=[];
 for(const doc of latest){
  try{
   const checksum=await digestText(doc.content);
   if(checksum!==doc.sha256)throw Error('Контрольная сумма исходника не совпадает.');
   const result=await insertDocument({title:doc.title,category:doc.category,
    filename:doc.source_filename||'',text:doc.content,existingKey:doc.doc_key});
   if(result.skipped)unchanged++;else copied++;
   await loadDocuments();
  }catch(error){errors.push(doc.title+': '+errtext(error));}
 }
 return {copied,unchanged,errors};
}
async function saveWorld(fields){const w=state.world;if(!w)throw Error('Мир не выбран');const data={name:cleanText(fields.name,140),genre:fields.genre,premise:cleanText(fields.premise,15000),world_rules:cleanText(fields.world_rules,20000),history:cleanText(fields.history,50000),timeline:cleanText(fields.timeline,50000),clock_start:cleanText(fields.clock_start,80),genesis_choices:{...(w.genesis_choices||{}),current_period:cleanText(fields.current_period,30)},updated_at:new Date().toISOString()};if(data.genesis_choices.current_period&&!validStoryClock(data.genesis_choices.current_period))throw Error('Текущий период: YYYY-MM, YYYY-MM-DD или YYYY-MM-DDTHH:MM:SS.');if(!data.name)throw Error('Укажи название мира');state.world=dataOrThrow(await state.client.from('lw_worlds').update(data).eq('id',w.id).select().single());await loadWorlds();notify('Мир сохранён в облаке.');}
async function newWorld(setup){
 const config=validateNewWorldSetup(setup,state.worlds);
 // Verify selected documents before creating any new records, never import played Y1 history.
 if(config.source_id){
   const response=await state.client.from('lw_reference_docs')
     .select('doc_key,revision,category,title,source_filename,content,sha256')
     .eq('world_id',config.source_id).in('category',config.categories)
     .order('revision',{ascending:false}).limit(150);
   const sources=latestReusableDocs(dataOrThrow(response),config.categories);
   if(!sources.length)throw Error('В выбранном мире нет документов указанных типов. Выбери другие категории или отключи перенос.');
   for(const doc of sources){
     if(await digestText(doc.content)!==doc.sha256)throw Error('Контрольная сумма источника не совпадает: '+doc.title);
   }
 }
 const row=dataOrThrow(await state.client.from('lw_worlds').insert({
   owner_id:state.user.id,name:config.name,genre:config.genre
 }).select().single());
 const branch=dataOrThrow(await state.client.from('lw_branches').insert({
   owner_id:state.user.id,world_id:row.id,name:'Основная линия'
 }).select().single());
 dataOrThrow(await state.client.from('lw_worlds').update({active_branch_id:branch.id}).eq('id',row.id));
 await loadWorlds();await openWorld(row.id);
 if(config.source_id){
   try{
     const result=await copyReusableDocuments(config.source_id,config.categories);
     if(result.errors.length||result.copied+result.unchanged===0){
       state.view='documents';render();
       notify('Мир создан, но перенос документов завершён не полностью. Зайди в «Документы» и повтори перенос. '+result.errors.join(' / '),true);
       return;
     }
     state.view='genesis';render();
     notify('Мир создан. Перенесено документов: '+result.copied+'. Теперь можно начинать Генезис.');
   }catch(error){
     state.view='documents';render();
     notify('Мир создан, но копирование документов не удалось: '+errtext(error)+'. Перенеси их через раздел «Документы» перед Генезисом.',true);
   }
 }else{
   state.view='genesis';render();
   notify('Новый мир создан без старого прошлого. Теперь можно перейти к Генезису.');
 }
}
async function deleteWorld(worldId){
 const world=state.worlds.find(w=>w.id===worldId);
 if(!world)throw Error('Мир не найден в твоей библиотеке.');
 const removed=dataOrThrow(await state.client.from('lw_worlds').delete()
   .eq('id',worldId).eq('owner_id',state.user.id).select('id'));
 if(!Array.isArray(removed)||removed.length!==1)throw Error('Не удалось подтвердить удаление мира. Проверь права доступа.');
 if(state.world?.id===worldId){
   state.world=null;state.characters=[];state.branches=[];state.scenes=[];state.memoryScenes=[];
   state.documents=[];state.assets=null;state.characterLedger=null;state.modal=null;
 }
 localStorage.removeItem('lw_story_mode_'+worldId);
 localStorage.removeItem('lw_scene_length_'+worldId);
 await loadWorlds();
 state.view='library';render();
 notify('Мир «'+world.name+'» и его связанные данные удалены.');
}
async function saveGenesisChoices(draft=false,kind='save'){const w=state.world;if(!w||w.genesis_approved)throw Error('Генезис уже утверждён. Создай новый мир для другого старта.');const c=kind==='import'&&Array.isArray(w.genesis_choices?.quick_answers)?w.genesis_choices:getForm('genesis-form');if(!c.hero_name?.trim())throw Error('Задай имя героя.');const data={genesis_choices:c,updated_at:new Date().toISOString()};if(kind==='demo')data.genesis_draft=demoGenesis(w,c);if(kind==='import')data.genesis_draft=parseGenesis(document.getElementById('genesis-json').value,Number(c.npc_count),c.hero_name);state.world=dataOrThrow(await state.client.from('lw_worlds').update(data).eq('id',w.id).select().single());return c;}
async function approveGenesis(){const w=state.world;const d=w?.genesis_draft;if(!d||w.genesis_approved)throw Error('Нет неутверждённого Генезиса');if(state.characters.length||state.scenes.length)throw Error('Старт можно утвердить только в пустом мире');const rows=d.characters.map(c=>({owner_id:state.user.id,world_id:w.id,...Object.fromEntries(['role',...CHARACTER_FIELDS].map(k=>[k,c[k]||'']))}));dataOrThrow(await state.client.from('lw_characters').insert(rows));const extra=`\n\nГЕНЕЗИС (утверждённое прошлое):\n${d.summary}\n${d.past_changes.map(s=>'- '+s).join('\n')}`;state.world=dataOrThrow(await state.client.from('lw_worlds').update({genesis_approved:true,history:(w.history||'')+extra}).eq('id',w.id).select().single());await openWorld(w.id);state.view='people';render();notify('Персонажи и стартовое прошлое закреплены в облаке.');}
async function saveCharacter(fields){const rec=Object.fromEntries(['role',...CHARACTER_FIELDS].map(k=>[k,cleanText(fields[k],20000)]));if(!rec.name)throw Error('Имя обязательно');const id=state.modal?.character?.id;if(id)dataOrThrow(await state.client.from('lw_characters').update(rec).eq('id',id));else dataOrThrow(await state.client.from('lw_characters').insert({...rec,owner_id:state.user.id,world_id:state.world.id}));state.modal=null;await openWorld(state.world.id);render();notify('Персонаж сохранён.');}
async function appendScene(body,model='manual',extra={}){const w=state.world;const branch=state.branches.find(b=>b.id===w.active_branch_id);if(!branch)throw Error('Нет действующей ветки');const t=cleanText(extra.world_time||document.getElementById('story-clock')?.value||storyClock(w),80);if(!validStoryClock(t))throw Error('Перед записью сцены задай текущий период в разделе «Мир» (например, 1999-06), затем открой «Историю» заново.');const previous=state.memoryScenes.at(-1)?.world_time;if(previous&&!isNondecreasingStoryTime(previous,t))throw Error('Новая сцена не может оказаться раньше последней подтверждённой точки времени. Для изменения прошлого используй «На это» или новую ветку.');const rawNote=extra.note!==undefined?extra.note:document.getElementById('story-note')?.value||'';dataOrThrow(await state.client.rpc('lw_append_scene',{p_world_id:w.id,p_branch_id:branch.id,p_expected_head:branch.head_scene_id||null,p_body:cleanText(body,150000),p_world_time:t,p_model:model,p_note:(()=>{const note=String(rawNote||'');if(note.length>60000)throw Error('Пакет изменений слишком велик для сохранения.');return note;})()}));await openWorld(w.id);render();notify('Сцена и её последствия сохранены в действующей ветке.');}

async function switchBranch(id){const w=state.world;dataOrThrow(await state.client.from('lw_worlds').update({active_branch_id:id}).eq('id',w.id));await openWorld(w.id);state.view='story';render();notify('Переключено на выбранную временную линию.');}
function markRevision(){if(!state.revision)return;const ta=document.getElementById('revision-source');state.revision.prefix=ta.value.slice(0,ta.selectionStart);document.getElementById('revision-anchor-status').textContent=`Сохранено символов: ${state.revision.prefix.length}. Остальной хвост будет отменён.`;}
async function commitRevision(){const r=state.revision;if(!r)return;const continuation=document.getElementById('revision-continuation')?.value||'';const note=document.getElementById('revision-note')?.value||'';if(!continuation.trim())throw Error('Вставь новое продолжение после точки вмешательства');if(!r.prefix&&!confirm('Ты не сохранил префикс сцены. Переписать её с самого начала?'))return;dataOrThrow(await state.client.rpc('lw_fork_scene',{p_world_id:state.world.id,p_source_branch_id:state.world.active_branch_id,p_target_scene_id:r.scene.id,p_prefix:r.prefix,p_continuation:continuation,p_note:note,p_world_time:r.scene.world_time}));state.revision=null;state.modal=null;await openWorld(state.world.id);render();notify('Новая ветка создана. Отменённый хвост не входит в действующую линию.');}
async function collectBackup(){
 const w=state.world;
 if(!w)throw Error('Выбери мир для создания резервной копии.');
 const id=w.id;
 const [chars,branches]=await Promise.all([
  state.client.from('lw_characters').select('*').eq('world_id',id),
  state.client.from('lw_branches').select('*').eq('world_id',id)
 ]);
 const characters=dataOrThrow(chars),branchesList=dataOrThrow(branches);
 const readAll=async(table,columns='*')=>{
  const result=[];
  for(let off=0;;off+=500){
   const page=dataOrThrow(await state.client.from(table).select(columns)
    .eq('world_id',id).order('created_at',{ascending:true}).range(off,off+499));
   result.push(...page);
   if(page.length<500)break;
   if(off>200000)throw Error('Архив слишком велик для экспорта через браузер.');
  }
  return result;
 };
 const [scenes,documents]=await Promise.all([
  readAll('lw_scenes'),
  readAll('lw_reference_docs','doc_key,revision,category,title,source_filename,sha256,content,created_at')
 ]);
 for(const d of documents){
  if(await digestText(d.content)!==d.sha256)throw Error('Документ '+d.title+' повреждён. Экспорт остановлен.');
 }
 const result={format:WORLD_BACKUP_FORMAT,exported_at:new Date().toISOString(),world:w,
  characters,branches:branchesList,scenes,documents};
 return sealWorldBackup(result);
}
async function exportWorld(){
 const data=await collectBackup();
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const a=document.createElement('a');
 a.href=url;
 a.download='living-world-'+(state.world.name||'world').replace(/[^\p{L}\p{N}_-]/gu,'_')+
  '-'+new Date().toISOString().slice(0,10)+'.json';
 a.click();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
 notify('Полная резервная копия скачана: сцены, ветки, персонажи, все редакции правил и проверка целостности.');
}
async function importBackup(file){
 if(!file)throw Error('Выбери файл резервной копии.');
 if(file.size>45*1024*1024)throw Error('Резервная копия превышает 45 МБ.');
 const backup=JSON.parse(await file.text());
 const inspected=await validateWorldBackup(backup);
 const old=backup.world;
 const choices={...(old.genesis_choices||{}),auto_save_enabled:false,document_upload_enabled:false};
 const newW={
  name:(old.name||'Восстановленный мир')+' (копия)',genre:old.genre||'Фэнтези',
  premise:old.premise||'',world_rules:old.world_rules||'',history:old.history||'',
  timeline:old.timeline||'',clock_start:old.clock_start||'1998-09-01T08:00:00',
  genesis_choices:choices,genesis_draft:old.genesis_draft||null,
  genesis_approved:!!old.genesis_approved,
  model_story:old.model_story||'gpt-6',model_relationships:old.model_relationships||'gpt-5.6',
  owner_id:state.user.id
 };
 let created=null,committed=false;
 try{
  created=dataOrThrow(await state.client.from('lw_worlds').insert(newW).select().single());
  const bmap=new Map(backup.branches.map(b=>[b.id,crypto.randomUUID()]));
  const smap=new Map(backup.scenes.map(sc=>[sc.id,crypto.randomUUID()]));
  const bRows=backup.branches.map(b=>({
   id:bmap.get(b.id),world_id:created.id,owner_id:state.user.id,
   name:b.name,parent_branch_id:bmap.get(b.parent_branch_id)||null,
   fork_scene_id:null,head_scene_id:null
  }));
  if(!bRows.length)bRows.push({id:crypto.randomUUID(),world_id:created.id,owner_id:state.user.id,name:'Основная линия'});
  dataOrThrow(await state.client.from('lw_branches').insert(bRows));
  const sceneRows=backup.scenes.map(sc=>({
   id:smap.get(sc.id),world_id:created.id,owner_id:state.user.id,
   branch_id:bmap.get(sc.branch_id)||bRows[0].id,
   parent_scene_id:smap.get(sc.parent_scene_id)||null,
   body:sc.body,world_time:sc.world_time,model:sc.model||'manual',
   delta:sc.delta||{},prompt_note:sc.prompt_note||'',
   created_at:sc.created_at||new Date().toISOString()
  }));
  for(let i=0;i<sceneRows.length;i+=100)
   dataOrThrow(await state.client.from('lw_scenes').insert(sceneRows.slice(i,i+100)));
  const characterRows=backup.characters.map(c=>({
   world_id:created.id,owner_id:state.user.id,role:c.role||'npc',
   ...Object.fromEntries(CHARACTER_FIELDS.map(k=>[k,c[k]||''])),
   created_scene_id:smap.get(c.created_scene_id)||null
  }));
  for(let i=0;i<characterRows.length;i+=100)
   dataOrThrow(await state.client.from('lw_characters').insert(characterRows.slice(i,i+100)));
  const documentRows=inspected.documents.map(d=>({
   world_id:created.id,owner_id:state.user.id,
   doc_key:d.doc_key,revision:d.revision,category:d.category,title:d.title,
   source_filename:d.source_filename||'',sha256:d.sha256,content:d.content,
   created_at:d.created_at||new Date().toISOString()
  }));
  for(let i=0;i<documentRows.length;i+=50)
   dataOrThrow(await state.client.from('lw_reference_docs').insert(documentRows.slice(i,i+50)));
  for(const b of backup.branches){
   dataOrThrow(await state.client.from('lw_branches').update({
    head_scene_id:smap.get(b.head_scene_id)||null,
    fork_scene_id:smap.get(b.fork_scene_id)||null
   }).eq('id',bmap.get(b.id)));
  }
  const active=bmap.get(old.active_branch_id)||bRows[0].id;
  dataOrThrow(await state.client.from('lw_worlds').update({active_branch_id:active}).eq('id',created.id));
  committed=true;
  state.modal=null;
  await loadWorlds();await openWorld(created.id);
  state.view='assets';
  try{await loadAssets();}
  catch(error){state.assets=null;state.assetIssue=errtext(error);}
  render();
  notify('Мир полностью восстановлен: '+sceneRows.length+' сцен и '+documentRows.length+' редакций документов.');
 }catch(error){
  if(created?.id&&!committed){
   try{
    dataOrThrow(await state.client.from('lw_worlds').delete().eq('id',created.id).select('id'));
   }catch(cleanupError){
    throw Error('Восстановление не удалось; не удалось удалить неполную копию "'+created.name+'": '+
      errtext(cleanupError)+'. Причина: '+errtext(error));
   }
  }
  if(committed)throw Error('Мир сохранён целиком, но экран не обновился: '+errtext(error)+'. Открой копию из списка миров.');
  throw Error('Восстановление отменено, неполная копия очищена. '+errtext(error));
 }
}
async function runSaveDiagnosticFromCompanion(){
 const current=await state.client.auth.getSession();
 if(current.error||!current.data?.session?.access_token)throw Error('Войди в Supabase для проверки сейвов.');
 const response=await fetch('https://living-world-bridge-mcp.korotkowdoc.workers.dev/api/diagnostics/save-test',{
  method:'POST',mode:'cors',headers:{authorization:'Bearer '+current.data.session.access_token}
 });
 let result;
 try{result=await response.json();}catch{throw Error('Мост не вернул результат проверки. Проверь подключение Cloudflare и доступность сайта.');}
 if(!result||typeof result!=='object')throw Error('Пустой ответ диагностики.');
 state.saveDiagnostic=result;
 // Temp world cleanup is server-side; refresh the list to surface failed cleanup.
 await loadWorlds();render();
 notify(result.ok?'Сейвы проверены: одна сцена, никаких дублей, баланс совпал, тестовый мир удалён.':
  'Проверка не прошла: '+(result.reason||'неизвестная причина')+'. Этап: '+(result.stage||'авторизация'),!result.ok);
}

async function actionHandler(action,el){switch(action){
case 'run-save-diagnostic':await runSaveDiagnosticFromCompanion();return;
case 'navigate':state.worldContext=null;state.view=el.dataset.view;if(state.view==='story')state.recentLimit=40;if(state.view==='assets'||state.view==='people'||state.view==='memory')await loadAssets();if(state.view==='documents')await loadDocuments();render();return;
case 'goto-memory':state.view='memory';await loadAssets();render();return;
case 'memory-reload':await loadScenes();await loadAssets();render();return;
case 'memory-search':state.memoryQuery=document.getElementById('memory-query')?.value?.trim()||'';state.memoryKind=document.getElementById('memory-kind')?.value||'fact';state.memoryOffset=0;render();return;
case 'memory-prev':state.memoryOffset=Math.max(0,state.memoryOffset-40);render();return;
case 'memory-next':state.memoryOffset+=40;render();return;
case 'goto-assets':state.view='assets';await loadAssets();render();return;
case 'assets-reload':state.assets=null;await loadScenes();await loadAssets();render();return;
case 'goto-documents':state.view='documents';await loadDocuments();render();return;

case 'toggle-document-import':{
 const w=state.world;if(!w)throw Error('Сначала выбери мир.');
 const enabled=w.genesis_choices?.document_upload_enabled===true;
 if(!enabled&&!confirm('Разрешить ChatGPT сохранять исходные документы в приватной библиотеке этого мира?'))return;
 state.world=dataOrThrow(await state.client.from('lw_worlds').update({genesis_choices:{...(w.genesis_choices||{}),document_upload_enabled:!enabled}}).eq('id',w.id).select().single());
 render();notify(!enabled?'Импорт документов из ChatGPT разрешён.':'Импорт документов из ChatGPT отключён.');return;
}
case 'docs-copy-shared':{
 const sourceId=document.getElementById('docs-source-world')?.value;
 if(!sourceId)throw Error('Выбери мир-источник.');
 const result=await copyReusableDocuments(sourceId);
 render();
 notify('Общие документы: скопировано '+result.copied+', уже сохранено '+result.unchanged+
  (result.errors.length?'. Ошибки: '+result.errors.join(' / '):'.'),result.errors.length>0);
 return;
}
case 'docs-refresh':await loadDocuments();render();return;
case 'docs-import':{
 const files=document.getElementById('doc-files')?.files;
 const result=await importDocuments(files||[]);
 state.docSelected=null;state.docContent=null;render();
 notify('Импортировано: '+result.imported+', без изменений: '+result.unchanged+(result.issues.length?'. Ошибки: '+result.issues.join(' / '):'.'),result.issues.length>0);
 return;
}
case 'doc-open':await readDocument(el.dataset.id);render();return;
case 'doc-close':state.docSelected=null;state.docContent=null;render();return;
case 'doc-copy':if(state.docContent)await clipboard(state.docContent);return;
case 'doc-replace':{
 const source=state.documents.find(d=>d.doc_key===el.dataset.key);
 if(!source)throw Error('Исходный документ не найден.');
 const selector=document.createElement('input');
 selector.type='file';selector.accept='.docx,.txt,.md,.markdown';
 selector.onchange=()=>withBusy(async()=>{
  if(!selector.files?.length)return;
  const result=await importDocuments(selector.files,source.doc_key);
  state.docSelected=null;state.docContent=null;render();
  notify('Редакций сохранено: '+result.imported+'. '+result.issues.join(' '),result.issues.length>0);
 });
 selector.click();return;
}

case 'goto-story':state.view='story';render();return;
case 'new-world':state.view='world-setup';render();return;
case 'cancel-world-setup':state.view='library';render();return;
case 'world-menu-delete':{
 const world=state.worlds.find(w=>w.id===el.dataset.id);
 if(!world)throw Error('Мир не найден.');
 state.worldContext=null;state.modal={type:'delete-world',worldId:world.id,name:world.name};render();return;
}
case 'confirm-delete-world':{
 const modal=state.modal;
 if(modal?.type!=='delete-world')throw Error('Подтверждение удаления не открыто.');
 await deleteWorld(modal.worldId);return;
}
case 'cancel-delete-world':state.modal=null;render();return;
case 'close-world-menu':state.worldContext=null;render();return;
case 'open-world':state.worldContext=null;await openWorld(el.dataset.id);state.view=state.world.genesis_approved?'assets':'builder';if(state.view==='assets')await loadAssets();render();return;
case 'goto-genesis':state.view='genesis';render();return;

case 'quick-answer':{
 const step=QUICK_GENESIS_STEPS[state.quickStep];
 if(!step||!step.options.some(o=>o.id===el.dataset.choice))throw Error('Выбор недоступен.');
 state.quickAnswers[state.quickStep]=el.dataset.choice;state.quickStep++;
 render();return;
}
case 'quick-back':state.quickStep=Math.max(0,state.quickStep-1);render();return;
case 'quick-auto':
case 'quick-generate':{
 const automated=action==='quick-auto';
 const w=state.world;if(!w||w.genesis_approved)throw Error('Для нового Генезиса создай новую вселенную.');
 const d=getForm('quick-genesis-form');
 const name=cleanText(d.world_title,140);
 if(!name)throw Error('Назови мир.');
 const count=Number(d.npc_count),age=Number(d.hero_age);const schoolAge=String(d.school_entry_age||'').trim(),birthDate=String(d.birth_date||'').trim();
 if(!Number.isInteger(count)||count<2||count>6)throw Error('Выбери от 2 до 6 NPC.');
 if(!Number.isInteger(age)||age<0||age>120)throw Error('Укажи допустимый возраст героя.');
 if(schoolAge&&(!Number.isInteger(Number(schoolAge))||Number(schoolAge)<1||Number(schoolAge)>120))throw Error('Возраст поступления должен быть от 1 до 120.');
 if(birthDate&&!validStoryClock(birthDate))throw Error('Дата рождения должна быть YYYY-MM или YYYY-MM-DD.');
 const start=cleanText(d.start_period,30);if(!validStoryClock(start))throw Error('Дата начала: YYYY-MM, YYYY-MM-DD либо YYYY-MM-DDTHH:MM:SS.');
 const previous=w.genesis_choices||{};const c={hero_name:cleanText(d.hero_name,100),hero_age:String(age),school_entry_age:schoolAge,birth_date:birthDate,simulation_mode:d.start_mode==='life'?'life':'off',npc_count:String(count),base_world:d.base_world==='existing'?'existing':'original',world_title:name,world_idea:cleanText(d.world_idea,3000),npc_ideas:cleanText(d.npc_ideas,1800),current_period:start,quick_answers:state.quickAnswers.slice(0,QUICK_GENESIS_STEPS.length),...(previous.divergence?{divergence:previous.divergence}:{}),...(previous.source_material?{source_material:previous.source_material}:{}),...(previous.custom_details?{custom_details:previous.custom_details}:{})};
 const world={...w,name,clock_start:start,premise:c.world_idea||w.premise,genesis_choices:c};
 const prompt=quickGenesisPrompt(world,c);
 if(!automated)await clipboard(prompt);
 state.world=dataOrThrow(await state.client.from('lw_worlds').update({name,clock_start:start, premise:world.premise, genesis_choices:c,genesis_draft:null,updated_at:new Date().toISOString()}).eq('id',w.id).select().single());
 await loadWorlds();
 if(automated){
   const result=await runAI({kind:'genesis',world_id:w.id});
   await openWorld(w.id);state.view='genesis';render();
   notify('ИИ создал '+result.draft.characters.length+' персонажей. Проверь их и утверди Генезис.');
 }else notify('Выборы сохранены. Запрос для ИИ скопирован — открой ChatGPT, затем верни JSON в поле ниже.');
 return;
}
case 'open-chatgpt':window.open('https://chatgpt.com/','_blank','noopener,noreferrer');return;
case 'ai-refresh':await checkAiConnection();render();notify(state.aiReady?'AI подключён: теперь можно генерировать автоматически.':state.aiReason,true);return;
case 'genesis-auto':{
 await saveGenesisChoices();const result=await runAI({kind:'genesis',world_id:state.world.id});
 await openWorld(state.world.id);state.view='genesis';render();notify('ИИ создал '+result.draft.characters.length+' персонажей. Проверь и утверди Генезис.');return;
}
case 'genesis-save':await saveGenesisChoices();notify('Выборы сохранены в облаке.');return;
case 'genesis-demo':await saveGenesisChoices(true,'demo');render();notify('Демо-предыстория готова. Это только шаблон.');return;
case 'genesis-copy':{const c=getForm('genesis-form');await clipboard(genesisPrompt(state.world,c));await saveGenesisChoices();return;}

case 'genesis-paste':{
 const box=document.getElementById('genesis-json');if(!box)throw Error('Поле для ответа не найдено.');
 if(!navigator.clipboard?.readText){notify('Вставь ответ в поле вручную: долгим нажатием → «Вставить».',true);return;}
 let raw;
 try{raw=await navigator.clipboard.readText();}
 catch{notify('Браузер запретил чтение буфера. Вставь ответ в поле вручную.',true);return;}
 if(!raw?.trim())throw Error('Буфер обмена пуст. Сначала скопируй JSON из ChatGPT.');
 box.value=raw;
 await saveGenesisChoices(false,'import');
 render();notify('JSON проверен. Просмотри персонажей и утверди Генезис.');return;
}
case 'genesis-parse':await saveGenesisChoices(false,'import');render();notify('JSON корректный. Проверь персонажей и утверди.');return;
case 'genesis-approve':await approveGenesis();return;
case 'add-character':state.modal={type:'character',character:null};render();return;
case 'edit-character':state.modal={type:'character',character:state.characters.find(c=>c.id===el.dataset.id)};render();return;
case 'close-modal':state.modal=null;state.revision=null;render();return;

case 'set-story-mode':{
 const mode=el.dataset.mode;
 if(!['story','relationship'].includes(mode))throw Error('Неизвестный режим.');
 state.storyMode=mode;
 localStorage.setItem('lw_story_mode_'+state.world.id,mode);
 document.querySelectorAll('[data-action="set-story-mode"]').forEach(button=>{
  const active=button.dataset.mode===mode;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 });
 const status=document.getElementById('story-mode-status');
 if(status)status.textContent='Выбран режим '+(mode==='story'?String(state.world.model_story||'gpt-6').toUpperCase():String(state.world.model_relationships||'gpt-5.6').toUpperCase())+' · Высокое. Выбери модель вручную в ChatGPT; общая память сохраняется.';
 return;
}

case 'sim-mode':{
 const w=state.world;if(!w||!w.genesis_approved)throw Error('Сначала утверди Генезис.');
 const mode=el.dataset.mode;
 if(!['off','life','skip'].includes(mode))throw Error('Неизвестный режим времени.');
 const previous=w.genesis_choices?.simulation_mode||'off';
 if(mode==='life'&&state.scenes.length>0&&previous!=='life')throw Error('Прогон детства нужно начинать до первой сыгранной сцены, иначе это будет переписывание прошлого. Создай новый мир или используй обычное ускорение.');
 state.world=dataOrThrow(await state.client.from('lw_worlds').update({genesis_choices:{...(w.genesis_choices||{}),simulation_mode:mode}}).eq('id',w.id).select().single());
 render();notify(mode==='off'?'Симуляция остановлена. Полная история продолжится с текущего состояния.':mode==='life'?'Включён прогон предыстории.':'Включено ускорение времени.');return;
}
case 'sim-choice':{
 const w=state.world,scene=state.memoryScenes.at(-1),decisions=readSceneNote(scene?.prompt_note)?.decisions||[];
 if(!scene)throw Error('Для выбора не найдена сохранённая симуляция.');
 if(!decisions.some(d=>d.id===el.dataset.choice))throw Error('Выбор больше не действителен.');
 localStorage.setItem('lw_sim_choice_'+w.id+'_'+scene.id,el.dataset.choice);
 render();notify('Выбор сохранён на этом устройстве. Следующий запрос учтёт его последствия.');return;
}
case 'sim-copy':{
 const w=state.world,kind=w.genesis_choices?.simulation_mode;
 if(!['life','skip'].includes(kind))throw Error('Сначала выбери режим симуляции.');
 const span=document.getElementById('sim-span')?.value||'quarter';
 const scene=state.memoryScenes.at(-1),decisions=readSceneNote(scene?.prompt_note)?.decisions||[];
 const chosen=scene?localStorage.getItem('lw_sim_choice_'+w.id+'_'+scene.id)||'':'';
 if(decisions.length&&!chosen)throw Error('Предыдущая симуляция закончилась решением. Выбери действие или нажми «Начать играть отсюда» для полной сцены.');
 const selected=decisions.find(d=>d.id===chosen);
 const decision=selected?selected.label+'. '+selected.description:'';
 const clock=document.getElementById('story-clock')?.value||storyClock(w);
 if(!validStoryClock(clock))throw Error('Укажи игровую дату.');
 const memory=compactMemory(makeContinuity(state.characters,state.memoryScenes));
 const prompt=simulationPrompt(w,state.characters,memory,state.scenes,{kind,span,decision,clock});
 await clipboard(prompt);
 notify('Запрос симуляции скопирован. В ChatGPT получи JSON, затем вставь через «Сцена + последствия».');return;
}

case 'auto-scene':{
 if(!state.world||!state.world.genesis_approved)throw Error('Сначала утверди Генезис.');
 const note=document.getElementById('story-note')?.value||'';
 const length=document.getElementById('scene-length')?.value||state.sceneLength;
 const result=await runAI({kind:'scene',world_id:state.world.id,mode:state.storyMode||'story',length,note});
 await openWorld(state.world.id);state.view='story';render();
 notify('Сцена создана и сохранена автоматически ('+result.model+').');return;
}
case 'sim-auto':{
 const w=state.world,kind=w?.genesis_choices?.simulation_mode;
 if(!['life','skip'].includes(kind))throw Error('Сначала выбери режим симуляции.');
 const scene=state.memoryScenes.at(-1);
 const decisions=readSceneNote(scene?.prompt_note)?.decisions||[];
 const chosen=scene?localStorage.getItem('lw_sim_choice_'+w.id+'_'+scene.id)||'':'';
 if(decisions.length&&!chosen)throw Error('Сначала выбери решение героя для следующего отрезка.');
 const result=await runAI({kind:'simulation',world_id:w.id,span:document.getElementById('sim-span')?.value||'quarter',choice_id:chosen});
 await openWorld(w.id);state.view='story';render();
 notify('Время продвинулось до '+result.world_time+'. Сцена и последствия сохранены.');return;
}
case 'copy-scene-prompt':if(!state.world)throw Error('Нет мира');if(!validStoryClock(document.getElementById('story-clock')?.value||storyClock()))throw Error('Сначала установи текущий период в разделе «Мир» (например, 1999-06).');await clipboard(scenePrompt(state.world,state.characters,state.scenes,state.storyMode||'story',document.getElementById('story-note')?.value||'',document.getElementById('scene-length')?.value||state.sceneLength)+'\n\nАКТУАЛЬНАЯ ПАМЯТЬ ВЕТКИ (собственные знания каждого отделяй от общих):\n'+JSON.stringify(compactMemory(makeContinuity(state.characters,state.memoryScenes)),null,2));return;
case 'copy-scene-packet':{if(!state.world)throw Error('Нет мира');const basic=scenePrompt(state.world,state.characters,state.scenes,state.storyMode||'story',document.getElementById('story-note')?.value||'',document.getElementById('scene-length')?.value||state.sceneLength);const clock=document.getElementById('story-clock')?.value||storyClock();if(!validStoryClock(clock))throw Error('Сначала установи текущий период в разделе «Мир» (например, 1999-06).');await clipboard(scenePackagePrompt(basic,makeContinuity(state.characters,state.memoryScenes),clock));return;}
case 'demo-scene':await appendScene(demoScene(state.world,state.characters,state.scenes.length),'demo');return;
case 'revise':{const scene=state.scenes.find(s=>s.id===el.dataset.id);if(!scene)throw Error('Сцена не найдена');state.revision={scene,prefix:'',note:''};state.modal={type:'revision',scene};render();return;}
case 'revision-mark':markRevision();return;
case 'revision-copy':{if(!state.revision)throw Error('Открой правку');state.revision.note=document.getElementById('revision-note')?.value||'';const index=state.scenes.findIndex(s=>s.id===state.revision.scene.id);const history=state.memoryScenes;const pos=history.findIndex(s=>s.id===state.revision.scene.id);const effective=pos>=0?history.slice(0,pos):state.scenes.slice(0,index);await clipboard(revisionPrompt(state.world,state.characters,state.revision.prefix,state.revision.note,effective)+'\n\nПАМЯТЬ ДО ТОЧКИ ВМЕШАТЕЛЬСТВА (не добавляй сведения из отменённого хвоста):\n'+JSON.stringify(compactMemory(makeContinuity(state.characters,effective)),null,2));return;}
case 'revision-commit':await commitRevision();return;
case 'switch-branch':await switchBranch(el.dataset.id);return;
case 'load-more':state.recentLimit=Math.min(200,state.recentLimit+40);await loadScenes();render();return;
case 'logout':dataOrThrow(await state.client.auth.signOut());state.session=null;state.user=null;state.world=null;render();return;
case 'disconnect-db':localStorage.removeItem(cfgKey);state.config=null;state.client=null;state.session=null;render();return;
case 'export-world':await exportWorld();return;
case 'import-open':state.modal={type:'import'};render();return;
case 'import-file':await importBackup(document.getElementById('backup-file').files?.[0]);return;
}}

async function submitHandler(form){
 if(form.id==='world-setup-form'){
   const d=getForm('world-setup-form');
   const categories=d.source_id?[...form.querySelectorAll('input[name="copy_category"]:checked')].map(el=>el.value):[];
   await newWorld({name:d.name,genre:d.genre,source_id:d.source_id,categories});
   return;
 }

 if(form.id==='doc-text-form'){
  const values=getForm('doc-text-form');
  const title=values.title?.trim();
  if(!title||!DOC_CATEGORIES.some(k=>k.id===values.category))throw Error('Название и тип источника обязательны.');
  await insertDocument({title,category:values.category,text:values.content});
  await loadDocuments();render();notify('Новый текстовый источник сохранён.');return;
 }
switch(form.id){
case 'setup-form':{const d=getForm('setup-form');if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(d.url.trim()))throw Error('Project URL должен выглядеть как https://xxxx.supabase.co');if(!d.key.trim()||/service_role|secret/i.test(d.key))throw Error('Вставь только publishable / anon key, не секретный ключ');state.config={url:d.url.trim().replace(/\/$/,''),key:d.key.trim()};localStorage.setItem(cfgKey,JSON.stringify(state.config));await connect();render();return;}
case 'login-form':{const d=getForm('login-form');const email=d.email.trim().toLowerCase();if(!email||!d.password)throw Error('Введи email и пароль.');const v=dataOrThrow(await state.client.auth.signInWithPassword({email,password:d.password}));if(!v.session||!v.user)throw Error('Не удалось получить сессию.');localStorage.setItem('lw_login_email',email);state.session=v.session;state.user=v.user;await loadWorlds();render();notify('Ты в своём мире!');return;}
case 'password-form':{const d=getForm('password-form');if(!state.session)throw Error('Для смены пароля сначала войди.');if(d.new_password.length<12)throw Error('Пароль должен содержать минимум 12 символов.');if(d.new_password!==d.repeat_password)throw Error('Пароли не совпадают.');dataOrThrow(await state.client.auth.updateUser({password:d.new_password}));render();notify('Пароль сохранён. При следующих входах используй его.');return;}
case 'world-form':await saveWorld(getForm('world-form'));render();return;
case 'toggle-auto-save':{
 const w=state.world;if(!w)throw Error('Сначала выбери мир.');
 const on=w.genesis_choices?.auto_save_enabled===true;
 if(!on&&!confirm('Разрешить сохранение подтверждённых сцен из ChatGPT без отдельной страницы согласования? Только для этого мира.'))return;
 state.world=dataOrThrow(await state.client.from('lw_worlds').update({genesis_choices:{...(w.genesis_choices||{}),auto_save_enabled:!on}}).eq('id',w.id).select().single());
 render();notify(!on?'Автосохранение сцен разрешено для этого мира.':'Автосохранение отключено; требуется подтверждение.');return;
}
case 'models-form':{const d=getForm('models-form');state.world=dataOrThrow(await state.client.from('lw_worlds').update({model_story:d.model_story,model_relationships:d.model_relationships}).eq('id',state.world.id).select().single());render();notify('Модели записаны как предпочтения (платный API не включается).');return;}
case 'character-form':await saveCharacter(getForm('character-form'));return;
case 'scene-form':{const d=getForm('scene-form');if(!d.body?.trim())throw Error('Вставь текст сцены.');await appendScene(d.body,'manual');return;}
case 'scene-package-form':{const d=getForm('scene-package-form');const packet=parseScenePackage(d.payload);const note=packSceneNote(packet.changes,document.getElementById('story-note')?.value||'',packet.decisions);await appendScene(packet.scene,'chatgpt-manual',{world_time:packet.world_time||undefined,note});state.view=state.world?.genesis_choices?.simulation_mode&&state.world.genesis_choices.simulation_mode!=='off'?'story':'memory';render();return;}
}}
document.addEventListener('change',e=>{if(e.target?.id==='world-setup-source'){const choices=document.getElementById('world-setup-categories');if(choices)choices.hidden=!e.target.value;}if(e.target?.id==='scene-length'&&state.world){state.sceneLength=e.target.value;localStorage.setItem('lw_scene_length_'+state.world.id,state.sceneLength);}});
let worldPressTimer=null,worldTouchStart=null;
function clearWorldPress(){if(worldPressTimer!==null){clearTimeout(worldPressTimer);worldPressTimer=null;}worldTouchStart=null;}
document.addEventListener('contextmenu',e=>{
 const card=e.target.closest?.('.world-card[data-action="open-world"]');
 if(!card||state.view!=='library')return;
 e.preventDefault();clearWorldPress();
 showWorldContextMenu(card.dataset.id,e.clientX,e.clientY);
});
document.addEventListener('touchstart',e=>{
 clearWorldPress();
 const card=e.target.closest?.('.world-card[data-action="open-world"]');
 if(!card||state.view!=='library'||e.touches.length!==1)return;
 const touch=e.touches[0];
 worldTouchStart={worldId:card.dataset.id,x:touch.clientX,y:touch.clientY};
 const start=worldTouchStart;
 worldPressTimer=setTimeout(()=>{
  worldPressTimer=null;
  if(worldTouchStart!==start)return;
  state.suppressWorldClickUntil=Date.now()+WORLD_CLICK_SUPPRESS_MS;
  showWorldContextMenu(start.worldId,start.x,start.y);
  worldTouchStart=null;
 },WORLD_LONG_PRESS_MS);
},{passive:true});
document.addEventListener('touchmove',e=>{
 if(!worldTouchStart)return;
 if(e.touches.length!==1||Math.abs(e.touches[0].clientX-worldTouchStart.x)>12||Math.abs(e.touches[0].clientY-worldTouchStart.y)>12)clearWorldPress();
},{passive:true});
document.addEventListener('touchend',clearWorldPress,{passive:true});
document.addEventListener('touchcancel',clearWorldPress,{passive:true});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&state.worldContext){e.preventDefault();state.worldContext=null;render();return;}
 const card=e.target.closest?.('.world-card[data-action="open-world"]');
 if(card&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))){
  e.preventDefault();const rect=card.getBoundingClientRect();
  showWorldContextMenu(card.dataset.id,rect.left+24,rect.top+24);
 }
});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');
 if(!el)return;
 if(el.dataset.action==='open-world'&&suppressWorldOpen(state.suppressWorldClickUntil,Date.now())){e.preventDefault();return;}
 e.preventDefault();withBusy(()=>actionHandler(el.dataset.action,el));
});
document.addEventListener('submit',e=>{e.preventDefault();withBusy(()=>submitHandler(e.target));});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);notify(errtext(e.reason),true);});
(async()=>{if(state.config){try{await connect();}catch(e){console.error(e);notify('Не удалось подключиться к Supabase: '+errtext(e),true);state.config=null;}}render();if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});})().catch(e=>{notify(errtext(e),true);render();});
