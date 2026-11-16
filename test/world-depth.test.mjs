import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDepthDelta,validateOffscreenWindow,projectWorldDepth,actorDepth,depthSemanticWarnings,compareWorldBranches} from '../public/world-depth.mjs';
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


test('new offscreen NPC event is canonical without being in the reader-facing scene',()=>{
 const delta=validateDepthDelta({npc_offscreen:[{
  id:'draco-fam-1',actor:'Драко Малфой',happened_at:'2015-04-02',
  location:'Поместье Малфоев',event:'Драко отказался выполнить требование отца.',
  basis:'simulated',causal_basis:'Уже установлен конфликт личного выбора Драко и семейных обязательств.',
  known_by:['Драко Малфой']}]},'Гарри играл в карты и не знал о разговоре.');
 assert.equal(delta.npc_offscreen[0].basis,'simulated');
 assert.equal(delta.npc_offscreen[0].evidence,'');
 assert.equal(validateOffscreenWindow(delta,'2015-03-31T18:40:00','2015-04-04T12:00:00'),true);
 const depth=projectWorldDepth([{id:'x',world_time:'2015-04-04',changes:delta}]);
 assert.equal(depth.confirmed_offscreen.length,1);
 assert.throws(()=>validateOffscreenWindow(delta,'2015-04-03','2015-04-04'),/задним числом/);
 assert.throws(()=>validateOffscreenWindow(delta,'2015-03-31','2015-04-01'),/будущем/);
});
test('NPC simulation never leaks secret knowledge without a channel',()=>{
 const base={id:'secret',actor:'Драко Малфой',happened_at:'2015-04-03',event:'Получил письмо от отца.',
  basis:'simulated',causal_basis:'У отца уже есть причина требовать ответа.',
  known_by:['Драко Малфой','Гарри Поттер']};
 assert.throws(()=>validateDepthDelta({npc_offscreen:[base]},'Гарри ничего не узнал.'),/knowledge_channels/);
 const valid=validateDepthDelta({npc_offscreen:[{...base,knowledge_channels:[{person:'Гарри Поттер',via:'Драко переслал письмо Гарри'}]}]},'Гарри ничего не узнал.');
 assert.equal(valid.npc_offscreen[0].knowledge_channels[0].via,'Драко переслал письмо Гарри');
});

test('offscreen actors can evolve multidimensional relationships without narrating private meetings to Harry',()=>{
 const off={id:'private-talk',actor:'Драко Малфой',happened_at:'2015-04-02',
  event:'Драко встретился с Пэнси и поссорился с ней о письме Люциуса.',
  location:'Хогвартс',basis:'simulated',known_by:['Драко Малфой'],
  causal_basis:'Ранее установлен конфликт Драко с семейным влиянием и его самостоятельное общение с Пэнси.'};
 const delta={
  npc_offscreen:[off],
  psychology:[{id:'draco-conflict',basis:'simulated',related_offscreen_id:'private-talk',
   character:'Драко Малфой',aspect:'inner_conflict',observation:'Хочет независимости, но зависит от семьи.',
   certainty:'interpretation'}],
  relationships:[{id:'draco-pansy',basis:'simulated',related_offscreen_id:'private-talk',
   from:'Драко Малфой',to:'Пэнси Паркинсон',dimension:'irritation',shift:'increased',
   interpretation:'interpretation',rationale:'Драко разозлился из-за спора.',unresolved:true}]};
 const text='Гарри и Лия отдыхали и не знали, что происходило у Малфоя.';
 const parsed=validateDepthDelta(delta,text);
 assert.equal(parsed.psychology[0].evidence,'');
 assert.equal(parsed.relationships[0].basis,'simulated');
 assert.equal(parsed.relationships[0].related_offscreen_id,'private-talk');
 const ledger=projectWorldDepth([{id:'new',world_time:'2015-04-04',changes:parsed}]);
 assert.equal(ledger.relationships.find(e=>e.from==='Драко Малфой').dimensions.irritation.shift,'increased');
 assert.ok(ledger.psychology.some(e=>e.name==='Драко Малфой'));
 const packet=parseScenePackage(JSON.stringify({scene:text,world_time:'2015-04-04',changes:delta}));
 assert.equal(packet.changes.relationships[0].basis,'simulated');
});
test('no phantom offscreen romance without linked actual autonomous event',()=>{
 const text='Гарри играл в карты.';
 const rel={id:'fake',basis:'simulated',related_offscreen_id:'missing',from:'Драко Малфой',
  to:'Пэнси Паркинсон',dimension:'affection',shift:'increased',
  interpretation:'interpretation',rationale:'Думает о ней.'};
 assert.throws(()=>validateDepthDelta({relationships:[rel]},text),/npc_offscreen basis=simulated/);
 const off={id:'draco',actor:'Драко Малфой',happened_at:'2015-04-02',
  event:'Сказал Пэнси об отказе отца.',basis:'simulated',causal_basis:'Предыдущий конфликт.'};
 assert.throws(()=>validateDepthDelta({npc_offscreen:[off],
  relationships:[{...rel,related_offscreen_id:'draco',from:'Гарри Поттер'}]},text),
  /совпадающим действующим NPC/);
 assert.throws(()=>validateDepthDelta({npc_offscreen:[off],
  psychology:[{id:'mind',basis:'simulated',related_offscreen_id:'draco',character:'Драко Малфой',
   aspect:'desire',observation:'Наверняка влюбился',certainty:'explicit'}]},text),/интерпретация/);
});
