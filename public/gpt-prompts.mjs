import {validStoryClock} from './continuity.mjs';
import {CHARACTER_FIELDS,GENESIS_FIELDS} from './logic.mjs';

/** Pure ChatGPT request/response contracts. No OpenAI API request is made. */
export const WORLD_DRAFT_FIELDS=Object.freeze([
 'name','genre','premise','world_rules','history','timeline','clock_start','current_period'
]);
export const WORLD_TEXT_FIELDS=Object.freeze(['premise','world_rules','history','timeline']);
export const CHARACTER_TEXT_FIELDS=Object.freeze(CHARACTER_FIELDS.filter(f=>f!=='name'));
const trimmed=(v,max=50000)=>String(v??'').trim().slice(0,max);
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);

function strictPrompt(schema){
 return `СТРОГОЕ ТРЕБОВАНИЕ К ОТВЕТУ:
Верни РОВНО ОДИН синтаксически корректный JSON-объект, без Markdown, вводного текста, комментариев и пояснений.
Ключи и строки заключай только в прямые двойные кавычки " (U+0022), НЕ используй “ ” или « » как кавычки JSON.
Внутренние кавычки экранируй, переносы строки внутри значений записывай как \\n, не оставляй висящую запятую.
Не превращай массив в отдельные строки; не используй undefined, null и не добавляй новые ключи.
Ниже СИНТАКСИЧЕСКИ ВАЛИДНЫЙ JSON-шаблон. Замени только текстовые значения-заглушки, сохрани структуру и типы.
${JSON.stringify(schema,null,2)}
Перед отправкой мысленно проверь результат: JSON.parse(ответ) должен работать без исправлений.
ВЫВЕДИ ТОЛЬКО ГОТОВЫЙ JSON.`;
}
function decode(raw){
 let text=trimmed(raw,400000).replace(/^\uFEFF/,'');
 if(text.startsWith('```'))text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'');
 let data;
 try{data=JSON.parse(text);}catch(e){throw Error('Ошибка JSON: '+e.message+'. Скопируй один полный JSON-объект без пояснений.');}
 if(!isRecord(data))throw Error('Ответ должен быть ровно одним JSON-объектом.');
 return data;
}
function exactTextShape(data,fields){
 const keys=Object.keys(data);
 if(keys.length!==fields.length||fields.some(k=>!hasOwn(data,k))||keys.some(k=>!fields.includes(k)))
  throw Error('Неверные поля JSON: нужны только '+fields.join(', ')+'.');
 for(const field of fields){
  if(typeof data[field]!=='string')throw Error('Поле '+field+' должно быть строкой JSON, а не массивом или объектом.');
  if(data[field].length>50000)throw Error('Слишком длинное поле '+field+'.');
  if(/<заполни|<уникальное|<описание/i.test(data[field]))throw Error('Поле '+field+' всё ещё содержит метку шаблона.');
 }
 return data;
}
export function worldDraftPrompt(world,form,{field=null}={}){
 if(field!==null&&!WORLD_TEXT_FIELDS.includes(field))throw Error('Это поле мира нельзя генерировать отдельно.');
 const source=Object.fromEntries(WORLD_DRAFT_FIELDS.map(k=>[k,trimmed(form[k]??(k==='current_period'?world?.genesis_choices?.current_period:world?.[k]),50000)]));
 if(!source.name)throw Error('Для запроса назови мир.');
 if(!validStoryClock(source.clock_start))throw Error('Сначала укажи правильную дату начала мира.');
 if(source.current_period&&!validStoryClock(source.current_period))throw Error('Некорректен текущий период.');
 if(world?.genesis_approved&&(!field||field==='history'))throw Error('После утверждения Генезиса нельзя генерировать всю исходную биографию мира или переписывать подтверждённое прошлое. Для других полей используй запрос по отдельному полю.');
 const isField=!!field;
 const schema=isField?{[field]:'<заполни '+field+'>'}:{
  ...source,
  premise:source.premise||'<заполни premise>',
  world_rules:source.world_rules||'<заполни world_rules>',
  history:source.history, // An empty confirmed past stays empty.
  timeline:source.timeline||'<заполни timeline>'
 };
 return `LIVING WORLD — запрос в ChatGPT на ${isField?'одно поле описания мира ('+field+')':'полное описание создаваемого мира'}.
Ты НЕ ведёшь сцену и НЕ записываешь ничего в приложение; верни JSON для вставки и проверки в LIVING WORLD.

Мир и введённые пользователем данные:
${JSON.stringify(source,null,2)}
ID мира для чтения правил, если доступен OAuth-мост: ${world?.id||'не установлен'}.
Если подключён LIVING WORLD Bridge OAuth, прочитай применимые документы этого мира. Не заменяй их каноном или домыслами. Если подключение недоступно, работай только с входными данными.

СОДЕРЖАНИЕ:
- Пользовательские даты, жанр, название и установленные правила являются обязательными условиями. НЕ меняй их.
- Текстовые наброски можно развить и сделать содержательнее, но без замены их смысла.
- Поле history — ТОЛЬКО реально заданные подтверждённые события прошлого. Если фактов не указано, оставь строку пустой: не изобретай биографию как состоявшуюся.
- Поле timeline — календарь и возможные узлы; не предписывай итог будущих событий.
- Учитывай автономность NPC, причинное получение знаний и границы магии/политики по правилам мира.
- ${isField?'Ответ должен содержать ТОЛЬКО ключ '+field+'. Ничего не изменяй за пределами этого поля.':'Ответ должен содержать все восемь полей. Название, жанр, clock_start и current_period оставь в точности как во входных данных.'}

${strictPrompt(schema)}`;
}
/** Detect the exact one-field vs full-schema response from the pasted JSON itself.
 * This survives iPhone PWA reloads while ChatGPT was generating the answer.
 */
export function worldDraftFieldFromJSON(raw){
 const keys=Object.keys(decode(raw));
 return keys.length===1&&WORLD_TEXT_FIELDS.includes(keys[0])?keys[0]:null;
}
export function parseWorldDraft(raw,{field=null,source=null}={}){
 if(field!==null&&!WORLD_TEXT_FIELDS.includes(field))throw Error('Недопустимое поле мира.');
 const fields=field?[field]:WORLD_DRAFT_FIELDS;
 const data=exactTextShape(decode(raw),fields);
 if(field)return {[field]:data[field]};
 if(!data.name.trim()||!data.genre.trim())throw Error('Название и жанр не могут быть пустыми.');
 if(!validStoryClock(data.clock_start))throw Error('Неверная дата начала мира.');
 if(data.current_period&&!validStoryClock(data.current_period))throw Error('Неверная текущая дата.');
 if(source){
  for(const k of ['name','genre','clock_start','current_period']){
   const original=trimmed(source[k]);
   if(original!==data[k])throw Error('GPT изменил обязательное поле '+k+'. В исходных настройках: '+original);
  }
 }
 return data;
}
export function characterDraftPrompt(world,people,fields,{field=null,editing=false}={}){
 if(field!==null&&!CHARACTER_TEXT_FIELDS.includes(field))throw Error('Недоступное для генерации поле персонажа.');
 const profile=Object.fromEntries(GENESIS_FIELDS.map(k=>[k,trimmed(fields[k],20000)]));
 profile.role=profile.role==='hero'?'hero':'npc';
 const list=(Array.isArray(people)?people:[]).map(p=>({
  name:trimmed(p.name,120),role:p.role,
  goals:trimmed(p.goals,1200),relationships:trimmed(p.relationships,1200)
 })).slice(0,30);
 const isField=!!field;
 const skeleton=isField?{[field]:'<заполни '+field+'>'}:Object.fromEntries(
  GENESIS_FIELDS.map(k=>[k,
   k==='role'?profile.role:
   k==='name'?(profile.name||'<уникальное имя персонажа>'):
   profile[k]||'<заполни '+k+'>'
  ])
 );
 return `LIVING WORLD — создание ${isField?'одного текстового поля '+field:'полной анкеты'} ${editing?'уже существующего':'нового'} автономного персонажа через ChatGPT.
Не создавай сцену, не меняй хранилище; верни только JSON для проверки в приложении.

МИР:
${JSON.stringify({id:world?.id,name:world?.name,genre:world?.genre,premise:trimmed(world?.premise,5000),
 world_rules:trimmed(world?.world_rules,10000),history:trimmed(world?.history,7000),
 timeline:trimmed(world?.timeline,5000),clock_start:world?.clock_start,
 genesis_approved:!!world?.genesis_approved},null,2)}

СУЩЕСТВУЮЩИЕ ПЕРСОНАЖИ (не назначай им новые отношения или знания автоматически):
${JSON.stringify(list,null,2)}
УЖЕ ВВЕДЁННЫЕ ПОЛЯ РЕДАКТИРУЕМОГО ПЕРСОНАЖА:
${JSON.stringify(profile,null,2)}
${world?.id?'При наличии OAuth-моста прочитай применимые правила этого мира. Не заменяй данные каноном.':'Если нет документов, не приписывай знания и прошлое без основания.'}

СОДЕРЖАНИЕ:
- Предлагай психологически самостоятельного человека с целями, недостатками, интересами, личными связями и ограничениями.
- Не превращай его в спутника героя по умолчанию. Знания и связи должны иметь правдоподобное происхождение.
- Не объявляй несыгранное прошлое, новые обещания, дружбу, имущество или знакомства уже установленным каноном.
- Сохраняй явно заданные имя и роль. ${editing?'Персонаж уже существует: не переписывай его историю и характер вопреки сыгранным изменениям.':'Если имя не задано, придумай уникальное в рамках мира.'}
- ${isField?'Верни только ключ '+field+' и один текстовый ответ. Остальные поля анкеты не изменяй.':'Верни role и ВСЕ 12 текстовых полей персонажа, даже если некоторые значения должны остаться пустыми из-за отсутствия доказательств.'}

${strictPrompt(skeleton)}`;
}
export function characterDraftFieldFromJSON(raw){
 const keys=Object.keys(decode(raw));
 return keys.length===1&&CHARACTER_TEXT_FIELDS.includes(keys[0])?keys[0]:null;
}
export function parseCharacterDraft(raw,{field=null,expectedRole=null,expectedName=null}={}){
 if(field!==null&&!CHARACTER_TEXT_FIELDS.includes(field))throw Error('Недопустимое поле персонажа.');
 const data=exactTextShape(decode(raw),field?[field]:GENESIS_FIELDS);
 if(field)return {[field]:data[field]};
 if(!['hero','npc'].includes(data.role))throw Error('Роль персонажа должна быть hero или npc.');
 if(!data.name.trim())throw Error('Не указано имя персонажа.');
 if(expectedRole&&data.role!==expectedRole)throw Error('GPT изменил роль персонажа.');
 if(expectedName&&data.name!==expectedName)throw Error('GPT изменил установленное имя персонажа.');
 return data;
}
