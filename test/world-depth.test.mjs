import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDepthDelta,projectWorldDepth,actorDepth,depthSemanticWarnings,compareWorldBranches} from '../public/world-depth.mjs';
import {packSceneNote,parseScenePackage} from '../public/continuity.mjs';

const quote='Гарри долго смотрел на Лию и ответил: «Помню ту книгу».';
const s1={id:'1',world_time:'2010-09',body:quote,
 changes:{memories:[{id:'book',title:'Книга'}],
  psychology:[{id:'psy1',character:'Гарри',aspect:'inner_conflict',observation:'Хочет доверять, но обижен',
   certainty:'interpretation',evidence:'Гарри долго смотрел на Лию'}],
  relationships:[{id:'rel1',from:'Гарри',to:'Лия',dimension:'trust',shift:'increased',
   interpretation:'interpretation',rationale:'Рассказал о переживаниях',evidence:'ответил: «Помню ту книгу»'}],
  recollections:[{id:'rec1',actor:'Гарри',memory_id:'book',meaning:'Шутка стала болезненной',
   certainty:'interpretation',evidence:'«Помню ту книгу»'}],
  npc_intentions:[{id:'plan1',actor:'Лия',plan:'Поговорить позже',motive:'Не ухудшать ссору',
   evidence:'Гарри долго смотрел на Лию'}] }};
const s2={id:'2',world_time:'2010-09',body:'Лия сказала: «Я не обещаю забыть».',
 changes:{relationships:[{id:'rel2',from:'Лия',to:'Гарри',dimension:'trust',shift:'decreased',
  interpretation:'explicit',rationale:'Она обижена',evidence:'Я не обещаю забыть'}],
  psychology:[{id:'psy2',character:'Лия',aspect:'boundary',observation:'Не будет сразу прощать',
   certainty:'explicit',evidence:'Я не обещаю забыть'}]}};
const s3={id:'3',world_time:'2010-10',body:'Гарри говорит: «Я правда хотел помочь».',
 changes:{relationships:[{id:'rel3',from:'Гарри',to:'Лия',dimension:'trust',shift:'ambivalent',
 interpretation:'interpretation',rationale:'После попытки примирения',evidence:'Я правда хотел помочь'}]}};

test('evidence-backed psychological and relationship changes preserve subjective certainty',()=>{
 const delta=validateDepthDelta(s1.changes,quote);
 assert.equal(delta.psychology[0].certainty,'interpretation');
 assert.equal(delta.relationships[0].from,'Гарри');
 assert.equal(delta.recollections[0].memory_id,'book');
 assert.equal(delta.npc_intentions[0].status,'intention_not_completed');
 assert.deepEqual(delta.npc_offscreen,[]);
 assert.throws(()=>validateDepthDelta({psychology:[{...s1.changes.psychology[0],evidence:'Ничего подобного не было'}]},quote),/точным фрагментом/);
 assert.throws(()=>validateDepthDelta({relationships:[{...s1.changes.relationships[0],from:'Лия',to:'Лия'}]},quote),/отношение к себе/);
 assert.throws(()=>validateDepthDelta({npc_offscreen:[{id:'off1',actor:'Лия',event:'Переехала',basis:'reported',evidence:'несыгранное событие'}]},quote),/точным фрагментом/);
});
test('dialogue causes directed, multidimensional ties but does not turn plans into events',()=>{
 const ledger=projectWorldDepth([s1,s2,s3]);
 assert.equal(ledger.relationships.length,2);
 const harry=ledger.relationships.find(r=>r.from==='Гарри');
 const lia=ledger.relationships.find(r=>r.from==='Лия');
 assert.equal(harry.dimensions.trust.shift,'ambivalent');
 assert.equal(lia.dimensions.trust.shift,'decreased');
 assert.equal(harry.history.length,2);
 assert.equal(ledger.confirmed_offscreen.length,0);
 assert.equal(ledger.npc_intentions.length,1);
 const actor=actorDepth(ledger,['Гарри']);
 assert.equal(actor.recollections.length,1);
 assert.equal(actor.relationships.length,2);
});
test('an unknown memory reference generates caution rather than fake evidence',()=>{
 assert.deepEqual(depthSemanticWarnings({recollections:s1.changes.recollections},[]).map(x=>x.code),['MEMORY_REFERENCE_UNKNOWN']);
 assert.equal(depthSemanticWarnings({recollections:s1.changes.recollections,memories:[{id:'book'}]},[]).length,0);
});
test('branch comparison excludes canceled tail events and preserves sources',()=>{
 const old=[s1,s2],current=[s1,s3];
 const diff=compareWorldBranches(old,current);
 assert.equal(diff.common_prefix_scenes,1);
 assert.deepEqual(diff.previous_branch_tail.map(x=>x.scene_id),['2']);
 assert.deepEqual(diff.current_branch_tail.map(x=>x.scene_id),['3']);
 assert.ok(diff.relationship_changes.some(x=>x.between.includes('гарри')));
 assert.equal(diff.fork_after_scene_id,'1');
});
test('scene packet importer preserves full structured depth memory',()=>{
 const packet=parseScenePackage(JSON.stringify({scene:quote,world_time:'2010-09',
  changes:{facts:['Встреча'],psychology:s1.changes.psychology,
   relationships:s1.changes.relationships,recollections:s1.changes.recollections,
   npc_intentions:s1.changes.npc_intentions,memories:[]}}));
 assert.equal(packet.changes.psychology.length,1);
 assert.equal(packet.changes.relationships.length,1);
 assert.equal(packet.changes.recollections.length,1);
 assert.equal(packet.changes.npc_intentions[0].status,'intention_not_completed');
 assert.ok(packSceneNote(packet.changes));
});
