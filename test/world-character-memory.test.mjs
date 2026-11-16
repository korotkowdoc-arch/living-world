import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCharacterMemory,actorMemory,knowledgeHas,offscreenCandidateBrief} from '../public/world-character-memory.mjs';
import {activeLineage} from '../public/world-ledger.mjs';
const base=[
 {role:'hero',name:'Гарри',goals:'Поступить в школу',knowledge:'Знает только своё детство',location:'Лондон'},
 {role:'npc',name:'Лия',goals:'Переехать',knowledge:'Не знает тайного счета',location:'Лондон'}
];
const a={id:'a',parent_scene_id:null,world_time:'1998-09',changes:{characters:[{name:'Гарри',location:'Хогвартс',learned:[{fact:'Есть банковский счёт',via:'Личное письмо банка'}]},{name:'Лия',beliefs:['Гарри что-то скрывает']}]}};
const b={id:'b',parent_scene_id:'a',world_time:'1998-10',changes:{characters:[{name:'Лия',learned:[{fact:'Есть банковский счёт',via:'Гарри лично рассказал'}],goals:'Найти место для жизни'}]}};
const changed={id:'invalidated',parent_scene_id:'a',world_time:'1998-10',changes:{characters:[{name:'Лия',learned:[{fact:'Секретный проход',via:'Нашла записку'}]}],new_characters:[{name:'Макс',description:'Сосед',causal_link:'Познакомились в магазине',goals:'Работа',knowledge:'Знает соседей'}]}};
test('knowledge belongs to the actor who learned it through real channels',()=>{
 const state=projectCharacterMemory(base,[a,b]);
 assert.equal(knowledgeHas(state,'Гарри','Есть банковский счёт'),true);
 assert.equal(knowledgeHas(state,'Лия','Есть банковский счёт'),true);
 assert.equal(knowledgeHas(state,'Лия','Секретный проход'),false);
 const lia=state.characters.find(x=>x.name==='Лия');
 assert.equal(lia.knowledge.length,1);
 assert.equal(lia.knowledge[0].via,'Гарри лично рассказал');
 assert.equal(lia.beliefs[0].text,'Гарри что-то скрывает');
 assert.equal(lia.state.goals,'Найти место для жизни');
 assert.equal(lia.state.location,'Лондон');
 assert.equal(lia.knowledge[0].scene_id,'b');
});
test('discarded branch knowledge and introduced NPC never leak into valid lineage',()=>{
 const all=[a,b,changed];
 const normal=projectCharacterMemory(base,activeLineage(all,'b'));
 assert.equal(knowledgeHas(normal,'Лия','Секретный проход'),false);
 assert.equal(normal.characters.some(c=>c.name==='Макс'),false);
 const alternative=projectCharacterMemory(base,activeLineage(all,'invalidated'));
 assert.equal(knowledgeHas(alternative,'Лия','Секретный проход'),true);
 const max=alternative.characters.find(x=>x.name==='Макс');
 assert.equal(max.origin,'scene');
 assert.equal(max.introduced_scene_id,'invalidated');
});
test('new character relationships and beliefs retain historical provenance',()=>{
 const current=projectCharacterMemory(base,[a,b,changed]);
 assert.equal(current.warnings.length,0);
 const lia=actorMemory(current,['Лия']);
 assert.equal(lia.length,1);
 assert.equal(lia[0].knowledge_total,2);
 assert.ok(lia[0].recent_updates.some(x=>x.type==='state'));
 assert.deepEqual(actorMemory(current,['Не существует']),[]);
});
test('reintroduced known NPC gets warning rather than a second identity',()=>{
 const old={id:'intro',changes:{new_characters:[{name:'Лия',description:'Новая Лия',goals:'Нет'}]}};
 const state=projectCharacterMemory(base,[old]);
 assert.equal(state.characters.length,2);
 assert.equal(state.warnings[0].code,'DUPLICATE_NPC_INTRODUCTION');
});


test('Draco changes offscreen after a long absence without granting Harry his secrets',()=>{
 const cast=[...base,{role:'npc',name:'Драко Малфой',goals:'Получить независимость от отца',location:'Хогвартс'}];
 const filler=Array.from({length:40},(_,j)=>({id:'f'+j,world_time:'2015-03',body:'Гарри с Лией гуляли.',changes:{}}));
 const event={id:'npc',world_time:'2015-04-03',body:'Гарри играл с Уиллом.',changes:{
  npc_offscreen:[{id:'private',actor:'Драко Малфой',event:'Поссорился с Люциусом',
   happened_at:'2015-04-02',basis:'simulated',known_by:['Драко Малфой']}],
  characters:[{name:'Драко Малфой',goals:'Найти собственный способ заработать',
   learned:[{fact:'Люциус отказался поддержать новую идею',via:'Личная ссора'}]}]}};
 const ledger=projectCharacterMemory(cast,[...filler,event]);
 const draco=ledger.characters.find(c=>c.name==='Драко Малфой');
 assert.equal(draco.state.goals,'Найти собственный способ заработать');
 assert.ok(draco.history.some(x=>x.type==='offscreen'&&x.event==='Поссорился с Люциусом'));
 assert.equal(knowledgeHas(ledger,'Драко Малфой','Люциус отказался поддержать новую идею'),true);
 assert.equal(knowledgeHas(ledger,'Гарри','Люциус отказался поддержать новую идею'),false);
 const candidates=offscreenCandidateBrief(ledger,{recentScenes:['Гарри с Лией гуляли.']});
 assert.ok(candidates.some(c=>c.name==='Драко Малфой'));
});

test('preflight shortlist favors persistent cast over 2010 one-offs and rotates dormant names',()=>{
 const old=Array.from({length:25},(_,i)=>({
  name:'Прохожий '+String(i).padStart(2,'0'),origin:'scene',
  state:{goals:'Обычные дела',location:'Лондон'},last_recorded_time:'2010-08-01',
  history_count:1}));
 const core={name:'Драко Малфой',origin:'baseline',state:{goals:'Отстоять свои решения'},
  last_recorded_time:'2015-03-17',history_count:8};
 const active={name:'Уилл Кинкейд',origin:'scene',state:{goals:'Играть и учиться'},
  last_recorded_time:'2015-02-01',history_count:5};
 const data={characters:[...old,core,active]};
 const a=offscreenCandidateBrief(data,{currentTime:'2015-03-31',limit:8,cycle:0});
 const b=offscreenCandidateBrief(data,{currentTime:'2015-03-31',limit:8,cycle:1});
 assert.ok(a.some(x=>x.name==='Драко Малфой'));
 assert.ok(a.some(x=>x.name==='Уилл Кинкейд'));
 assert.ok(a.some(x=>x.name.startsWith('Прохожий')));
 assert.notDeepEqual(a.filter(x=>x.name.startsWith('Прохожий')).map(x=>x.name),
  b.filter(x=>x.name.startsWith('Прохожий')).map(x=>x.name));
});

test('dead archival figures and unsupported unknown goals cannot become active offscreen NPCs',()=>{
 const ledger={characters:[
  {name:'Драко Малфой',origin:'baseline',state:{goals:'Учиться и спорить с отцом'},last_recorded_time:'2015-03-17'},
  {name:'Артур Морроу',origin:'scene',state:{health:'Мёртв.',location:'Умер в 2005 году.',goals:'Не применимо.'},last_recorded_time:'2015-03-27'},
  {name:'Эллис Вейл',origin:'scene',state:{health:'Неизвестно.',location:'Неизвестно',goals:'Не установлены.'},last_recorded_time:'2015-03-24'}]};
 const actual=offscreenCandidateBrief(ledger,{currentTime:'2015-03-31',limit:12});
 assert.deepEqual(actual.map(x=>x.name),['Драко Малфой']);
});
