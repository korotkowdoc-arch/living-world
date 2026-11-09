import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORLD_DRAFT_FIELDS,WORLD_TEXT_FIELDS,CHARACTER_TEXT_FIELDS,
 worldDraftPrompt,parseWorldDraft,worldDraftFieldFromJSON,characterDraftPrompt,parseCharacterDraft,characterDraftFieldFromJSON} from '../public/gpt-prompts.mjs';
import {GENESIS_FIELDS} from '../public/logic.mjs';

const world={id:'11111111-1111-4111-8111-111111111111',name:'Новый AU',genre:'Фэнтези',
 premise:'Мир с магией',world_rules:'В школу поступают в 18 лет',history:'',
 timeline:'Начальная точка 2010 год',clock_start:'2010-07-31T08:00:00',
 genesis_choices:{current_period:'2010-07-31T08:00:00'},genesis_approved:false};
const worldInput=Object.fromEntries(WORLD_DRAFT_FIELDS.map(k=>[k,
 k==='current_period'?world.genesis_choices.current_period:world[k]]));
const baseChar=Object.fromEntries(GENESIS_FIELDS.map(k=>[k,'']));
baseChar.role='npc';baseChar.name='Лия';baseChar.description='Живёт самостоятельно';
const other=[{name:'Гарри Поттер',role:'hero',goals:'Выживание'}];

test('world prompt produces one parseable 8-field JSON template grounded in chosen world',()=>{
 const prompt=worldDraftPrompt(world,worldInput);
 const sample=prompt.split('Ниже СИНТАКСИЧЕСКИ ВАЛИДНЫЙ JSON-шаблон. Замени только текстовые значения-заглушки, сохрани структуру и типы.\n')[1]
  .split('\nПеред отправкой мысленно проверь')[0];
 const template=JSON.parse(sample);
 assert.deepEqual(Object.keys(template),WORLD_DRAFT_FIELDS);
 assert.equal(template.name,'Новый AU');
 assert.equal(template.clock_start,worldInput.clock_start);
 assert.match(prompt,/В школу поступают в 18 лет/);
 assert.match(prompt,/РОВНО ОДИН/);
 assert.match(prompt,/Текстовые наброски можно развить/);
 assert.match(prompt,/не изобретай биографию/i);
 assert.match(prompt,/ТОЛЬКО ГОТОВЫЙ JSON/);
});

test('world JSON importer checks types, keys, dates and immutable selected parameters',()=>{
 const draft={...worldInput,premise:'Полное описание магического мира'};
 assert.deepEqual(parseWorldDraft(JSON.stringify(draft),{source:worldInput}),draft);
 assert.equal(worldDraftFieldFromJSON(JSON.stringify(draft)),null);
 assert.deepEqual(parseWorldDraft('```json\n'+JSON.stringify(draft)+'\n```',{source:worldInput}),draft);
 assert.throws(()=>parseWorldDraft('{“name”:“AU”}'),/Ошибка JSON/);
 assert.throws(()=>parseWorldDraft(JSON.stringify({...draft,past_changes:[]})),/Неверные поля/);
 assert.throws(()=>parseWorldDraft(JSON.stringify({...draft,history:[]})),/history/);
 assert.throws(()=>parseWorldDraft(JSON.stringify({...draft,clock_start:'2011-01-01'}),{source:worldInput}),/clock_start/);
 assert.throws(()=>parseWorldDraft(JSON.stringify({...draft,current_period:'bad'}),{source:worldInput}),/дата/);
});

test('individual world field generation imports only that field, not history or title',()=>{
 for(const key of WORLD_TEXT_FIELDS){
  const p=worldDraftPrompt(world,worldInput,{field:key});
  assert.match(p,new RegExp('ТОЛЬКО ключ '+key));
  assert.deepEqual(parseWorldDraft(JSON.stringify({[key]:'Достоверное описание'}),{field:key}),{[key]:'Достоверное описание'});
  assert.equal(worldDraftFieldFromJSON(JSON.stringify({[key]:'Достоверное описание'})),key);
  assert.throws(()=>parseWorldDraft(JSON.stringify({[key]:'Текст',name:'Другое имя'}),{field:key}),/Неверные поля/);
 }
 const approved={...world,genesis_approved:true};
 assert.throws(()=>worldDraftPrompt(approved,worldInput),/После утверждения/);
 assert.throws(()=>worldDraftPrompt(approved,worldInput,{field:'history'}),/После утверждения/);
 assert.doesNotThrow(()=>worldDraftPrompt(approved,worldInput,{field:'premise'}));
});

test('character prompt contains full 13-field object, role and user identity remain locked',()=>{
 const prompt=characterDraftPrompt(world,other,baseChar,{editing:true});
 const raw=prompt.split('Ниже СИНТАКСИЧЕСКИ ВАЛИДНЫЙ JSON-шаблон. Замени только текстовые значения-заглушки, сохрани структуру и типы.\n')[1]
  .split('\nПеред отправкой мысленно проверь')[0];
 const template=JSON.parse(raw);
 assert.deepEqual(Object.keys(template),GENESIS_FIELDS);
 assert.equal(template.role,'npc');
 assert.equal(template.name,'Лия');
 assert.match(prompt,/Гарри Поттер/);
 assert.match(prompt,/не переписывай его историю/);
 const draft={...baseChar,goals:'Найти работу'};
 assert.deepEqual(parseCharacterDraft(JSON.stringify(draft),{expectedRole:'npc',expectedName:'Лия'}),draft);
 assert.equal(characterDraftFieldFromJSON(JSON.stringify(draft)),null);
 assert.throws(()=>parseCharacterDraft(JSON.stringify({...draft,name:'Другая'}),{expectedName:'Лия'}),/имя/);
 assert.throws(()=>parseCharacterDraft(JSON.stringify({...draft,role:'hero'}),{expectedRole:'npc'}),/роль/);
 assert.throws(()=>parseCharacterDraft(JSON.stringify({...draft,inventory:[]})),/inventory/);
});

test('character one-field JSON does not overwrite any other form values',()=>{
 for(const key of CHARACTER_TEXT_FIELDS){
  const p=characterDraftPrompt(world,other,baseChar,{field:key});
  assert.match(p,new RegExp('только ключ '+key));
  assert.deepEqual(parseCharacterDraft(JSON.stringify({[key]:'Значение'}),{field:key}),{[key]:'Значение'});
  assert.equal(characterDraftFieldFromJSON(JSON.stringify({[key]:'Значение'})),key);
  assert.throws(()=>parseCharacterDraft(JSON.stringify({[key]:'Значение',name:'Чужое'}),{field:key}),/Неверные поля/);
 }
});

test('only one Genesis prompt button renders and its handler saves selections before copy',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const quick=app.slice(app.indexOf('function renderQuickGenesis(){'),app.indexOf('function renderGenesis(){'));
 const genesis=app.slice(app.indexOf('function renderGenesis(){'),app.indexOf('function renderCharacterMemory(){'));
 const builder=app.slice(app.indexOf('function renderBuilder(){'),app.indexOf('const selectField='));
 const modal=app.slice(app.indexOf('function renderModal(){'),app.indexOf('async function checkAiConnection(){'));
 assert.doesNotMatch(quick,/btn\('quick-generate'/);
 assert.doesNotMatch(quick,/aiButton\('quick-auto'/);
 assert.doesNotMatch(genesis,/btn\('genesis-copy'/);
 assert.doesNotMatch(genesis,/aiButton\('genesis-auto'/);
 assert.match(genesis,/btn\('genesis-request','✦ Сформировать JSON-запрос и скопировать'/);
 assert.equal((genesis.match(/btn\('genesis-request'/g)||[]).length,1);
 assert.match(app,/case 'genesis-request':await copyUnifiedGenesisRequest\(\);return;/);
 assert.match(app,/await clipboard\(prompt\)/);
 const genHandler=app.slice(app.indexOf('async function copyUnifiedGenesisRequest(){'),app.indexOf('async function actionHandler('));
 assert.ok(genHandler.indexOf('state.world=dataOrThrow(')<genHandler.indexOf('await clipboard(prompt)'), 'must save options before copying');
 assert.match(genHandler,/\.\.\.old,/);
 assert.match(app,/const c=kind==='import'\?w\.genesis_choices/);
 assert.match(builder,/btn\('world-gpt-all'/);
 assert.match(builder,/worldGPTField\(/);
 assert.match(modal,/character-gpt-field/);
 assert.match(modal,/btn\('character-gpt-apply'/);
});
