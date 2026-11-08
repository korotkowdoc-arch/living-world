import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationPrompt,SIMULATION_SPANS} from '../public/simulation.mjs';
import {parseScenePackage,packSceneNote,readSceneNote,isNondecreasingStoryTime} from '../public/continuity.mjs';
const world={id:'test',name:'Хогвартс AU',genre:'Фэнтези',premise:'Студенты поступают в 18',world_rules:'Поступление в Хогвартс не ранее 18 лет',history:'',timeline:'',clock_start:'1989-07',genesis_choices:{current_period:'1989-07',school_entry_age:'18',birth_date:'1980-07-31'}};
const hero={role:'hero',name:'Гарри',description:'9 лет',status:'Ребёнок',goals:'Найти друзей',health:'Здоров',relationships:'Не установлены'};
const other={role:'npc',name:'Лия',personality:'Самостоятельная',goals:'Учиться',relationships:'Не знает Гарри',knowledge:'Знает только своё прошлое'};
const memory={facts:[],open_threads:[],characters:[]};
test('life simulation keeps school age and user-controlled stop',()=>{
 const prompt=simulationPrompt(world,[hero,other],memory,[],{kind:'life',span:'quarter',clock:'1989-07'});
 assert.match(prompt,/ПРОГОН БИОГРАФИИ/);
 assert.match(prompt,/Поступление в Хогвартс не ранее 18 лет/);
 assert.match(prompt,/3 месяца/);
 assert.match(prompt,/1980-07-31/);
 assert.match(prompt,/decisions/);
 assert.match(prompt,/ОСТАНОВИСЬ/);
});
test('skip preserves input decision and stops at turning point',()=>{
 const prompt=simulationPrompt(world,[hero,other],memory,[{world_time:'1998-09',body:'Прошло лето'}],{kind:'skip',span:'year',decision:'Гарри отказался от сделки',clock:'1998-09'});
 assert.match(prompt,/УСКОРЕНИЕ ДЕЙСТВУЮЩЕЙ ИСТОРИИ/);
 assert.match(prompt,/Гарри отказался от сделки/);
 assert.match(prompt,/1 год/);
 assert.match(prompt,/не решай за игрока/);
});
test('simulation refuses invalid inputs',()=>{
 assert.throws(()=>simulationPrompt(world,[],memory,[],{}),/Генезис/);
 assert.throws(()=>simulationPrompt(world,[hero],memory,[],{kind:'fast'}),/неизвестен/);
 assert.throws(()=>simulationPrompt(world,[hero],memory,[],{kind:'skip',span:'2000 years'}),/длительность/);
 assert.throws(()=>simulationPrompt(world,[hero],memory,[],{kind:'skip',clock:'wrong'}),/дату/);
 assert.equal(SIMULATION_SPANS.length,5);
});
test('structured choices are validated and preserved in scene notes',()=>{
 const d={scene:'Сосед подошёл к Гарри.',world_time:'1989-10',decisions:[{id:'help',label:'Помочь',description:'Гарри предложит помощь без гарантии успеха'},{id:'refuse',label:'Отказаться',description:'Гарри укажет на риск'}],changes:{facts:['Сосед подошёл к Гарри'],open_threads:[],resolved_threads:[],offscreen_events:[],characters:[]}};
 const parsed=parseScenePackage(JSON.stringify(d));
 const note=packSceneNote(parsed.changes,'',parsed.decisions);
 assert.equal(readSceneNote(note).decisions.length,2);
 assert.equal(readSceneNote(note).decisions[0].id,'help');
 const fail=structuredClone(d);fail.decisions[1].id='help';
 assert.throws(()=>parseScenePackage(JSON.stringify(fail)),/повторяющийся id/);
});
test('chronology rejects clear backward motion but respects unknown day',()=>{
 assert.equal(isNondecreasingStoryTime('1989-07','1989-10'),true);
 assert.equal(isNondecreasingStoryTime('1989-10','1989-07'),false);
 assert.equal(isNondecreasingStoryTime('1989-10-17','1989-10'),true);
 assert.equal(isNondecreasingStoryTime('1989-10','1989-10-17'),true);
 assert.equal(isNondecreasingStoryTime('1989-10-19','1989-10-17'),false);
});
