import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGenesis,genesisPrompt,scenePrompt,revisionPrompt,demoGenesis,demoScene,escapeHTML} from '../public/logic.mjs';
const world={id:'w',name:'Проверка',genre:'Фэнтези',clock_start:'1998-09-01T08:00:00',world_rules:'Нет смартфонов',premise:'Альтернативный мир',history:'Прошлое',timeline:'Календарь'};
const choices={hero_name:'Героиня',npc_count:'4',turning_point:'Побег',childhood:'На улице',origin:'Изгой'};
test('demo genesis yields hero + exactly 4 independent NPCs',()=>{
 const d=demoGenesis(world,choices);assert.equal(d.characters.length,5);assert.equal(d.characters[0].role,'hero');assert.equal(d.characters[0].name,'Героиня');
 for(const c of d.characters)assert.ok(c.knowledge&&c.goals&&c.relationships);
});
test('JSON import tolerates Markdown fences and validates character fields',()=>{
 const d=demoGenesis(world,choices);const raw='```json\n'+JSON.stringify(d,null,2)+'\n```';assert.deepEqual(parseGenesis(raw,4,'Героиня'),d);
});
test('reject malformed JSON with readable message',()=>{assert.throws(()=>parseGenesis('{"nope":',4,'Героиня'),/Ошибка JSON|Не найден JSON-объект/);});
test('reject wrong number of NPCs',()=>{const d=demoGenesis(world,choices);d.characters.pop();assert.throws(()=>parseGenesis(JSON.stringify(d),4,'Героиня'),/Нужно 5 персонажей/);});
test('reject missing field',()=>{const d=demoGenesis(world,choices);delete d.characters[2].knowledge;assert.throws(()=>parseGenesis(JSON.stringify(d),4,'Героиня'),/knowledge/);});
test('reject duplicate names',()=>{const d=demoGenesis(world,choices);d.characters[2].name=d.characters[1].name;assert.throws(()=>parseGenesis(JSON.stringify(d),4,'Героиня'),/уникальны/);});
test('generation prompt includes world, causal requirements and fields',()=>{const p=genesisPrompt(world,choices);assert.match(p,/Нет смартфонов/);assert.match(p,/НЕ сцену/);assert.match(p,/Героиня/);assert.match(p,/knowledge/);});
test('scene prompt reads supplied state but does not invent deleted scene',()=>{const p=scenePrompt(world,[{name:'Героиня',role:'hero',knowledge:'Не знает тайну'}],[{body:'Валидная сцена'}]);assert.match(p,/Не знает тайну/);assert.match(p,/Валидная сцена/);});
test('revision includes only authoritative prefix and correction',()=>{const p=revisionPrompt(world,[],'Она ответила.','Не должна уходить.',[]);assert.match(p,/Она ответила/);assert.match(p,/Не должна уходить/);assert.doesNotMatch(p,/Аннулированная сцена/);});
test('escape HTML in user-generated scenes',()=>{assert.equal(escapeHTML('<script>"x"</script>'),'&lt;script&gt;&quot;x&quot;&lt;/script&gt;');});
test('demo scene is visibly identified as demo',()=>{assert.match(demoScene(world,demoGenesis(world,choices).characters,0),/ДЕМО/);});
