import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGenesis,genesisJsonSkeleton,genesisPrompt,scenePrompt,revisionPrompt,demoGenesis,demoScene,escapeHTML,QUICK_GENESIS_STEPS,quickGenesisPrompt} from '../public/logic.mjs';
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

test('four decisions guide AI without being invented past facts',()=>{
 const c={hero_name:'Мира',hero_age:'18',npc_count:'3',
   quick_answers:QUICK_GENESIS_STEPS.map(step=>step.options[0].id),
   world_title:'Проверка нового мира',world_idea:'Магическая академия',
   npc_ideas:'Ника — подруга героя'};
 const p=quickGenesisPrompt(world,c);
 assert.match(p,/четыре решения|ЧЕТЫРЕ РЕШЕНИЯ/i);
 assert.match(p,/ситуации буквально произошли/);
 assert.match(p,/самостоятельно|САМОСТОЯТЕЛЬНО/);
 assert.match(p,/Ника — подруга героя/);
 assert.match(p,/ровно 4 объекта|ровно 4 самостоятельных|ровно 3 самостоятельных NPC|ровно 4 объектов/i);
 assert.match(p,/Мира/);
 assert.match(p,/knowledge/);
});
test('rapid genesis validates each choice and hero name',()=>{
 const c={hero_name:'Ника',npc_count:'4',quick_answers:['confront','plan','freedom','autonomous']};
 assert.ok(quickGenesisPrompt(world,c).includes('Ника'));
 assert.throws(()=>quickGenesisPrompt(world,{...c,quick_answers:['unknown','plan','freedom','autonomous']}),/недействителен/);
 assert.throws(()=>quickGenesisPrompt(world,{...c,hero_name:'Главный герой'}),/имя главного героя/);
 assert.throws(()=>quickGenesisPrompt(world,{...c,npc_count:'7'}),/от 2 до 6/);
});
test('high effort scene labels differ while continuity remains the same',()=>{
 const chars=[{name:'Мира',role:'hero',knowledge:'Не знает тайну'}];
 const p1=scenePrompt(world,chars,[], 'story');
 const p2=scenePrompt(world,chars,[], 'relationship');
 assert.match(p1,/GPT-6 · Высокое/);
 assert.match(p2,/GPT-5.6 · Высокое/);
 assert.match(p1,/Не знает тайну/);
 assert.match(p2,/Не знает тайну/);
 assert.match(p2,/вручную/);
});

test('scene length presets request large, normal and detailed treatments',()=>{
 const args=[world,[{name:'Героиня',role:'hero'}],[],'story',''];
 assert.match(scenePrompt(...args,'normal'),/1[\s\u00a0]?500–3[\s\u00a0]?000 слов/);
 assert.match(scenePrompt(...args,'large'),/3[\s\u00a0]?000–5[\s\u00a0]?000 слов/);
 assert.match(scenePrompt(...args,'detailed'),/5[\s\u00a0]?000–8[\s\u00a0]?000 слов/);
 assert.match(scenePrompt(...args,'detailed'),/ВНУТРИ сцены/);
});
test('quick genesis keeps a later school entry and simulates childhood first',()=>{
 const c={hero_name:'Гарри Поттер',hero_age:'9',school_entry_age:'18',birth_date:'1980-07-31',npc_count:'4',
 quick_answers:QUICK_GENESIS_STEPS.map(step=>step.options[0].id),
 simulation_mode:'life',world_idea:'Хогвартс: поступление в 18'};
 const prompt=quickGenesisPrompt(world,c);
 assert.match(prompt,/МИНИМАЛЬНЫЙ ВОЗРАСТ ПОСТУПЛЕНИЯ/);
 assert.match(prompt,/Хогвартс AU с поступлением в 18/);
 assert.match(prompt,/1980-07-31/);
 assert.match(prompt,/возраст в момент начала симуляции\/игры 9/);
 assert.match(prompt,/симуляция предыстории/);
});

test('Genesis prompt embeds a complete valid JSON schema, not loose character objects or strings',()=>{
 for(const count of [2,3,4,5,6]){
  const hero='Гарри Поттер';
  const schema=genesisJsonSkeleton(hero,count);
  const roundtrip=JSON.parse(JSON.stringify(schema));
  assert.deepEqual(roundtrip,schema);
  assert.equal(schema.characters.length,count+1);
  assert.equal(schema.characters[0].role,'hero');
  assert.equal(schema.characters[0].name,hero);
  assert.deepEqual(schema.characters.slice(1).map(x=>x.role),Array(count).fill('npc'));
  for(const field of ['past_changes','open_threads','uncertainties'])assert.ok(Array.isArray(schema[field]));
  for(const character of schema.characters){
   for(const field of ['role','name','causal_link','description','personality','goals','relationships','knowledge','location','health','mood','status','inventory']){
    assert.equal(typeof character[field],'string','Invalid '+field);
   }
  }
  assert.deepEqual(parseGenesis(JSON.stringify(schema),count,hero),schema);
  const prompt=genesisPrompt({...world,name:'Гарри Поттер AU',clock_start:'2010-07-31T08:00:00'},{
   hero_name:hero,npc_count:String(count),hero_age:'14',birth_date:'1996-07-31'
  });
  const payload=prompt.split('ЭТАЛОН СТРУКТУРЫ JSON:\n')[1].split('\n\nСОДЕРЖАНИЕ:')[0];
  assert.deepEqual(JSON.parse(payload),schema);
  assert.match(prompt,/обычные прямые двойные кавычки|обычные прямые двойные кавычки|обычные прямые/);
  assert.match(prompt,/past_changes, open_threads, uncertainties — ТОЛЬКО массивы строк/);
  assert.match(prompt,/characters — ТОЛЬКО массив объектов JSON/);
  assert.match(prompt,/ВЫВОДИ ТОЛЬКО ЗАПОЛНЕННЫЙ JSON-ОБЪЕКТ/);
  assert.match(prompt,/не меняй заданные пользователем даты, возраст/);
  assert.match(prompt,/2010-07-31T08:00:00/);
  assert.match(prompt,/1996-07-31/);
 }
});

test('quick-start JSON prompt inherits strict JSON structure and user world dates',()=>{
 const c={hero_name:'Гарри Поттер',hero_age:'14',npc_count:'4',
  birth_date:'1996-07-31',world_title:'Альтернативная Британия',
  quick_answers:QUICK_GENESIS_STEPS.map(step=>step.options[0].id)};
 const prompt=quickGenesisPrompt({...world,clock_start:'2010-07-31T08:00:00'},c);
 const payload=prompt.split('ЭТАЛОН СТРУКТУРЫ JSON:\n')[1].split('\n\nСОДЕРЖАНИЕ:')[0];
 assert.equal(JSON.parse(payload).characters.length,5);
 assert.equal(JSON.parse(payload).characters[0].name,'Гарри Поттер');
 assert.match(prompt,/2010-07-31T08:00:00/);
 assert.match(prompt,/1996-07-31/);
 assert.match(prompt,/Не придумывай будущие исходы/i);
});

test('strict JSON importer stays strict rather than rewriting invalid raw answers',()=>{
 const sample=genesisJsonSkeleton('Гарри Поттер',4);
 const invalid=JSON.stringify(sample).replaceAll('"','“');
 assert.throws(()=>parseGenesis(invalid,4,'Гарри Поттер'),/Ошибка JSON/);
});
