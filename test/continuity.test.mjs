import test from 'node:test';
import assert from 'node:assert/strict';
import {parseScenePackage, packSceneNote, makeContinuity, readSceneNote, scenePackagePrompt, validStoryClock} from '../public/continuity.mjs';
const base = { name:'Мира', role:'npc', knowledge:'Знает о торговле', location:'Лавка', mood:'Спокойна', goals:'Сохранить дело' };
const p = { scene:'Мира закрыла лавку и отправилась на набережную.', world_time:'1998-09-01T09:00:00', changes:{facts:['Мира закрыла лавку'],open_threads:['Найти пропавший товар'],resolved_threads:[],offscreen_events:['Поставщик уехал'],characters:[{name:'Мира',location:'Набережная',mood:'Тревожится',learned:[{fact:'Поставщик уехал',via:'Лично увидела экипаж'}],beliefs:['Кража связана с конкурентом']}]} };
test('parse fenced full scene package',()=>{const out=parseScenePackage('```json\n'+JSON.stringify(p)+'\n```');assert.equal(out.scene,p.scene);assert.equal(out.changes.characters[0].learned[0].via,'Лично увидела экипаж');});
test('reject learning without a channel',()=>{const bad=structuredClone(p);bad.changes.characters[0].learned=[{fact:'Тайна сделки'}];assert.throws(()=>parseScenePackage(JSON.stringify(bad)),/fact и via/);});
test('reject invalid JSON without silently accepting a partial result',()=>{assert.throws(()=>parseScenePackage('{"scene": "broken'),/JSON/);});
test('store scene changes in existing note field',()=>{const c=parseScenePackage(JSON.stringify(p)).changes;const note=packSceneNote(c,'Сохраняй хронологию');assert.equal(readSceneNote(note).director_note,'Сохраняй хронологию');});
test('plain legacy director notes remain valid and are ignored by change extractor',()=>{assert.equal(readSceneNote('Просто текст заметки'),null);});
test('active branch excludes invalidated events, resolves exact open threads and keeps personal channels',()=>{
 const d=parseScenePackage(JSON.stringify(p)).changes;
 const accepted={id:'1',prompt_note:packSceneNote(d)};
 const discarded={id:'2',prompt_note:packSceneNote({facts:['НЕВАЛИДНАЯ ВЕТКА'],open_threads:[],resolved_threads:[],offscreen_events:[],characters:[]})};
 const solved={id:'3',prompt_note:packSceneNote({facts:[],open_threads:[],resolved_threads:['Найти пропавший товар'],offscreen_events:[],characters:[]})};
 const mem=makeContinuity([base],[accepted,solved]);
 assert.equal(mem.characters.Мира.location,'Набережная');
 assert.equal(mem.characters.Мира.learned[0].via,'Лично увидела экипаж');
 assert.deepEqual(mem.open_threads,[]);
 assert.equal(mem.facts.includes('НЕВАЛИДНАЯ ВЕТКА'),false);
 assert.equal(makeContinuity([base],[accepted,discarded]).facts.includes('НЕВАЛИДНАЯ ВЕТКА'),true);
});
test('generation prompt includes exact clock, knowledge channels and world state',()=>{const mem=makeContinuity([base],[]);const prompt=scenePackagePrompt('Продолжи историю',mem,'1998-09-01T08:00:00');assert.match(prompt,/1998-09-01T08:00:00/);assert.match(prompt,/канал/);assert.match(prompt,/Мира/);});
test('oversized memory note is rejected instead of truncated into invalid JSON',()=>{assert.throws(()=>packSceneNote({facts:['X'.repeat(11000)]}),/10000/);});

test('month-level historical precision is preserved without inventing a day',()=>{
 assert.equal(validStoryClock('1999-06'),true);
 assert.equal(validStoryClock('1999-06-25'),true);
 assert.equal(validStoryClock('1999-06-25T11:20:00'),true);
 assert.equal(validStoryClock('1999-06-31'),false);
 assert.equal(validStoryClock('1999-13'),false);
 const p2=structuredClone(p);
 p2.world_time='1999-06';
 assert.equal(parseScenePackage(JSON.stringify(p2)).world_time,'1999-06');
 const prompt=scenePackagePrompt('Продолжи историю',makeContinuity([base],[]),'1999-06');
 assert.match(prompt,/"world_time": "1999-06"/);
 assert.match(prompt,/не придумывай дату/);
});
