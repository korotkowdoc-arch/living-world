import test from 'node:test';
import assert from 'node:assert/strict';
import {packSceneNote,readSceneNote} from '../public/continuity.mjs';
import {buildChatCheckpoint} from '../public/story-memory.mjs';
import {isReplayableCheckpoint,replayFromCheckpoint} from '../public/checkpoint-replay.mjs';
import {projectCompanion} from '../public/world-ledger.mjs';
import {projectCharacterMemory} from '../public/world-character-memory.mjs';
import {projectCausalMemory} from '../public/world-causality.mjs';
import {projectWorldDepth} from '../public/world-depth.mjs';
const world={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Мир'},
 branchId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 id1='cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
 id2='cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const a={id:id1,parent_scene_id:null,world_time:'2010-01-01T08:00:00',
 prompt_note:packSceneNote({
 facts:['Гарри заработал первые 100'],open_threads:['Вернуть книгу'],
 economy:[{id:'opening-1',action:'opening',account:'Гарри',currency:'GALLEON',
  amount:100,scale:0,reason:'Состояние зафиксировано',source:'Получено 100'}],
 items:[{id:'item-acq-1',action:'acquire',item_id:'book-1',label:'Книга',owner:'Гарри',
  reason:'Купил книгу',source:'Книга получена'}],
 characters:[{name:'Гарри',mood:'ожидание',learned:[{fact:'Лия хочет поговорить',via:'Разговор'}]}],
 psychology:[{id:'psych-1',character:'Гарри',aspect:'inner_conflict',
  observation:'Злится, но хочет помочь',certainty:'interpretation',evidence:'Гарри задумался'}],
 relationships:[{id:'rel-1',from:'Гарри',to:'Лия',dimension:'trust',shift:'ambivalent',
  interpretation:'interpretation',rationale:'Пока не доверяет',evidence:'Гарри задумался'}],
 memories:[{id:'book-joke',title:'Книга',detail:'Давнее обещание',kind:'promise',participants:['Гарри','Лия'],known_by:['Гарри','Лия']}]
 }),body:'Гарри задумался'};
const b={id:id2,parent_scene_id:id1,world_time:'2010-02-02T14:00:00',
 prompt_note:packSceneNote({
 facts:['Гарри отдал книгу Лии'],resolved_threads:['Вернуть книгу'],
 economy:[{id:'debit-1',action:'debit',account:'Гарри',currency:'GALLEON',
  amount:20,scale:0,reason:'Покупка книги',source:'Уплатил 20'}],
 items:[{id:'item-gift-1',action:'gift',item_id:'book-1',owner:'Гарри',recipient:'Лия',
  reason:'Вернул',source:'Книгу передали'}],
 characters:[{name:'Гарри',mood:'облегчение',beliefs:['Лия может простить']}],
 psychology:[{id:'psych-2',character:'Гарри',aspect:'coping',observation:'Пытается поговорить',
  certainty:'interpretation',evidence:'Гарри предложил мириться'}],
 recollections:[{id:'rec-1',actor:'Гарри',memory_id:'book-joke',meaning:'Шутка помогла помириться',
  certainty:'interpretation',evidence:'Гарри предложил мириться'}]
 }),body:'Гарри предложил мириться'};
const get=s=>readSceneNote(s.prompt_note)?.delta||{};

test('replayable checkpoint recovers independently confirmed resources and active actor memory',()=>{
 const doc=buildChatCheckpoint({world,branch:{id:branchId,head_scene_id:id1},
  lineage:[a],characters:[{name:'Гарри',role:'hero'}]});
 const snapshot=JSON.parse(doc.content);
 assert.equal(isReplayableCheckpoint(snapshot),true);
 const restored=replayFromCheckpoint(snapshot,[b],{
  verified_source_head:true,expected_head:id2,world_id:world.id,baselines:[]});
 assert.equal(restored.recovered,true);
 assert.equal(restored.scanned_world_scenes,2);
 const directAssets=projectCompanion([a,b],{getDelta:get,strict:true});
 const directPeople=projectCharacterMemory([{name:'Гарри',role:'hero'}],[a,b],{getDelta:get});
 const directCausal=projectCausalMemory([a,b],{getDelta:get});
 const directDepth=projectWorldDepth([a,b],{getDelta:get});
 assert.deepEqual(restored.economy.accounts,directAssets.accounts);
 assert.deepEqual(restored.economy.items,directAssets.items);
 assert.deepEqual(restored.characters.characters,directPeople.characters);
 assert.deepEqual(restored.causality.open_threads,directCausal.open_threads);
 assert.deepEqual(restored.causality.resolved_threads,directCausal.resolved_threads);
 assert.deepEqual(restored.depth.relationships,directDepth.relationships);
 assert.deepEqual(restored.depth.psychology,directDepth.psychology);
 assert.equal(restored.story_memories.length,1);
});
test('cannot use new checkpoint as canon without ancestry verification',()=>{
 const snapshot=JSON.parse(buildChatCheckpoint({world,branch:{id:branchId,head_scene_id:id1},
  lineage:[a],characters:[]}).content);
 assert.throws(()=>replayFromCheckpoint(snapshot,[b],{world_id:world.id}),/проверки предка/);
 assert.throws(()=>replayFromCheckpoint(snapshot,[{...b,parent_scene_id:'wrong'}],{
  verified_source_head:true,world_id:world.id}),/разрыв/);
 assert.throws(()=>replayFromCheckpoint(snapshot,[b],{
  verified_source_head:true,world_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}),/другому миру/);
 assert.throws(()=>replayFromCheckpoint(snapshot,[b],{
  verified_source_head:true,expected_head:id1,world_id:world.id}),/поменялось/);
});
test('a corrected branch never replays its canceled sibling tail',()=>{
 const snapshot=JSON.parse(buildChatCheckpoint({world,branch:{id:branchId,head_scene_id:id1},
  lineage:[a],characters:[]}).content);
 const canceled={id:'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',parent_scene_id:id1,
  world_time:'2010-02-01T10:00:00',body:'Отменённое событие',
  prompt_note:packSceneNote({facts:['Отменённое событие'],
   open_threads:['Отменённое обещание'],
   memories:[{id:'canceled-only',title:'Отменённое воспоминание'}]})};
 assert.throws(()=>replayFromCheckpoint(snapshot,[canceled,b],{
  verified_source_head:true,expected_head:id2,world_id:world.id}),/разрыв/);
 const restored=replayFromCheckpoint(snapshot,[b],{
  verified_source_head:true,expected_head:id2,world_id:world.id});
 assert.equal(restored.head_scene_id,id2);
 assert.equal(restored.delta_scenes,1);
 assert.doesNotMatch(JSON.stringify(restored.causality),/Отменённое/);
 assert.doesNotMatch(JSON.stringify(restored.story_memories),/canceled-only|Отменённое/);
});
test('older checkpoint without causal details remains readable but cannot seed history',()=>{
 const snapshot=JSON.parse(buildChatCheckpoint({world,branch:{id:branchId,head_scene_id:id1},
  lineage:[a],characters:[]}).content);
 delete snapshot.causal_facts;
 assert.equal(isReplayableCheckpoint(snapshot),false);
 assert.throws(()=>replayFromCheckpoint(snapshot,[b],{
  verified_source_head:true,world_id:world.id}),/неполон/);
});
