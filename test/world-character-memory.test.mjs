import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCharacterMemory,actorMemory,knowledgeHas} from '../public/world-character-memory.mjs';
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
