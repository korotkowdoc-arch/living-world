import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packSceneNote} from '../public/continuity.mjs';
import {buildYearArchive,yearArchiveMetadata,reconcileYearDocuments,yearArchiveKey} from '../public/year-archive.mjs';

const world={id:'11111111-1111-4111-8111-111111111111',active_branch_id:'22222222-2222-4222-8222-222222222222',name:'Гарри Поттер'};
const branch={id:world.active_branch_id,head_scene_id:'33333333-3333-4333-8333-333333333333'};
const harry={name:'Гарри Поттер',role:'hero',goals:'Выжить',location:'Лондон'};
const old={id:'44444444-4444-4444-8444-444444444444',world_time:'1994-12',prompt_note:packSceneNote({facts:['Жил в Лондоне'],open_threads:['Найти безопасное место']})};
const final={id:branch.head_scene_id,world_time:'1995-10',parent_scene_id:old.id,prompt_note:packSceneNote({
 facts:['Гарри помог Мэй перенести ящики за ужин'],
 open_threads:['Возможность будущей работы в кафе'],
 characters:[{name:'Гарри Поттер',location:'Кингс-Кросс',learned:[{fact:'Мэй работает в кафе',via:'личный разговор'}]}],
 new_characters:[{name:'Мэй',description:'Сотрудница кафе',causal_link:'Встретила Гарри в кафе',goals:'Сохранить работу',knowledge:'Знает имя Гарри'}],
 items:[{id:'eat1',action:'acquire',item_id:'bun',label:'Булка',owner:'Гарри Поттер',holder:'Гарри Поттер',reason:'Получил после работы',source:'Сцена'}]
})};
const args=()=>({world,branch,scenes:[old,final],characters:[harry],from:'1995-01',to:'1995-10'});
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fact=(id,time,text,parent=null,extra={})=>({
 id:uuid(id),world_time:time,parent_scene_id:parent,
 prompt_note:packSceneNote({facts:[text],...extra})
});

test('year archive derives only source-cited confirmed events from the current timeline',()=>{
 const doc=buildYearArchive(args());
 assert.equal(doc.scene_count,1);
 assert.equal(doc.source_head,final.id);
 assert.equal(doc.completed,true);
 assert.match(doc.content,/Гарри помог Мэй перенести ящики/);
 assert.match(doc.content,/Возможность будущей работы в кафе/);
 assert.match(doc.content,/Булка/);
 assert.match(doc.content,/Личные знания: 1/);
 assert.match(doc.content,/личный разговор/);
 assert.doesNotMatch(doc.content,/Жил в Лондоне/);
 assert.equal(doc.key,yearArchiveKey('1995-01','1995-10',branch.id));
 assert.equal(doc.unstructured_scenes,0);
 assert.deepEqual(doc.source_scene_ids,[final.id]);
 const meta=yearArchiveMetadata({category:'year_document',content:doc.content});
 assert.equal(meta.source_head,final.id);
 assert.equal(meta.from,'1995-01');
});

test('a fork in the middle of a year keeps valid facts before and after the correction',()=>{
 const first=fact(1,'1995-01','Гарри нашёл зимнее убежище',null,{open_threads:['Гарри должен Мэй за помощь']});
 const erased=fact(2,'1995-04','ОТМЕНЕНО: Гарри потерял работу',first.id,{resolved_threads:['Гарри должен Мэй за помощь']});
 const oldTail=fact(3,'1995-10','ОТМЕНЕНО: Гарри продал свою метлу',erased.id,{
  items:[{id:'o1',action:'acquire',item_id:'obsolete',label:'Отменённая метла',owner:'Гарри Поттер',reason:'Отменённая линия',source:'Сцена'}]});
 const oldBranch={id:uuid(110),head_scene_id:oldTail.id};
 const originalWorld={...world,active_branch_id:oldBranch.id};
 const archived=buildYearArchive({world:originalWorld,branch:oldBranch,scenes:[first,erased,oldTail],characters:[harry],from:'1995-01',to:'1995-10'});
 const revised=fact(4,'1995-04','Гарри сохранил отношения с Мэй и нашёл другую работу',first.id,{
  open_threads:['Мэй ждёт возврата книги']});
 const after=fact(5,'1995-10','Гарри вернул книгу Мэй',revised.id,{
  resolved_threads:['Мэй ждёт возврата книги'],
  items:[{id:'n1',action:'acquire',item_id:'realbook',label:'Книга Мэй',owner:'Мэй',holder:'Мэй',reason:'Книга зафиксирована',source:'Сцена'}]
 });
 const newBranch={id:uuid(120),head_scene_id:after.id};
 const newWorld={...world,active_branch_id:newBranch.id};
 const current=reconcileYearDocuments({
  documents:[{category:'year_document',doc_key:archived.key,revision:1,content:archived.content}],
  world:newWorld,branch:newBranch,scenes:[first,revised,after],characters:[harry]
 });
 assert.equal(current.documents.length,0,'outdated historical document cannot be treated as-is');
 assert.equal(current.liveSummaries.length,1);
 const doc=current.liveSummaries[0];
 assert.equal(doc.completed,true);
 assert.equal(doc.scenes,3);
 assert.deepEqual(doc.source_scene_ids,[first.id,revised.id,after.id]);
 assert.match(doc.content,/Гарри нашёл зимнее убежище/);
 assert.match(doc.content,/Гарри сохранил отношения с Мэй/);
 assert.match(doc.content,/Гарри вернул книгу Мэй/);
 assert.match(doc.content,/Книга Мэй/);
 assert.match(doc.content,/Гарри должен Мэй за помощь/);
 assert.doesNotMatch(doc.content,/ОТМЕНЕНО/);
 assert.doesNotMatch(doc.content,/Отменённая метла/);
 assert.equal(current.warnings[0].code,'YEAR_RECONCILED_FROM_CURRENT_CHAIN');
});

test('unchanged historical year survives later scenes in a different period',()=>{
 const draft=buildYearArchive(args());
 const doc={category:'year_document',doc_key:draft.key,revision:1,content:draft.content};
 const later=fact(30,'1995-11','Другая осень',final.id);
 const worldLater={...world};
 const branchLater={...branch,head_scene_id:later.id};
 const reconciled=reconcileYearDocuments({documents:[doc],world:worldLater,branch:branchLater,
  scenes:[old,final,later],characters:[harry]});
 assert.equal(reconciled.documents.length,1);
 assert.equal(reconciled.documents[0],doc);
 assert.equal(reconciled.liveSummaries.length,0);
});

test('new events in an already archived month are included in reconstructed year',()=>{
 const draft=buildYearArchive(args());
 const doc={category:'year_document',doc_key:draft.key,revision:1,content:draft.content};
 const later=fact(31,'1995-10','Гарри снова встретил Мэй',final.id);
 const laterBranch={...branch,head_scene_id:later.id};
 const reconciled=reconcileYearDocuments({documents:[doc],world,branch:laterBranch,scenes:[old,final,later],characters:[harry]});
 assert.equal(reconciled.documents.length,0);
 assert.equal(reconciled.liveSummaries.length,1);
 assert.match(reconciled.liveSummaries[0].content,/Гарри помог Мэй/);
 assert.match(reconciled.liveSummaries[0].content,/Гарри снова встретил Мэй/);
});

test('if revision restarts before year end, keep surviving events as provisional rather than discard them',()=>{
 const first=fact(40,'1995-01','Валидное знакомство');
 const canceled=fact(41,'1995-10','ОТМЕНЕНО: свадьба',first.id);
 const oldBranch={...branch,head_scene_id:canceled.id};
 const archive=buildYearArchive({world,branch:oldBranch,scenes:[first,canceled],characters:[harry],from:'1995-01',to:'1995-10'});
 const newScene=fact(42,'1995-08','Гарри продолжает жить в Лондоне',first.id);
 const newBranch={...branch,head_scene_id:newScene.id};
 const reconciled=reconcileYearDocuments({documents:[{category:'year_document',doc_key:archive.key,content:archive.content}],
  world,branch:newBranch,scenes:[first,newScene],characters:[harry]});
 assert.equal(reconciled.liveSummaries[0].completed,false);
 assert.match(reconciled.liveSummaries[0].content,/РАБОЧАЯ СВОДКА ГОДА/);
 assert.match(reconciled.liveSummaries[0].content,/Валидное знакомство/);
 assert.match(reconciled.liveSummaries[0].content,/Гарри продолжает жить в Лондоне/);
 assert.doesNotMatch(reconciled.liveSummaries[0].content,/ОТМЕНЕНО/);
});

test('incomplete structured revisions are explicitly flagged, never reused from invalidated tail',()=>{
 const first=fact(50,'1995-01','Валидный факт');
 const erased=fact(51,'1995-10','ОТМЕНЕНО',first.id);
 const archived=buildYearArchive({world,branch:{...branch,head_scene_id:erased.id},scenes:[first,erased],
  characters:[harry],from:'1995-01',to:'1995-10'});
 const revised={id:uuid(52),world_time:'1995-10',parent_scene_id:first.id,prompt_note:'plain-text revision'};
 const summary=reconcileYearDocuments({documents:[{category:'year_document',content:archived.content,doc_key:archived.key}],
  world,branch:{...branch,head_scene_id:revised.id},scenes:[first,revised],characters:[harry]});
 assert.equal(summary.liveSummaries.length,1);
 assert.equal(summary.liveSummaries[0].unstructured_scenes,1);
 assert.match(summary.liveSummaries[0].content,/Валидный факт/);
 assert.doesNotMatch(summary.liveSummaries[0].content,/ОТМЕНЕНО/);
 assert.ok(summary.warnings.some(w=>w.code==='YEAR_NEEDS_FULL_SCENE_REVIEW'));
});

test('cannot archive a future year, empty year, wrong branch or stale head',()=>{
 assert.throws(()=>buildYearArchive({...args(),to:'1995-12'}),/ещё не завершён/);
 assert.throws(()=>buildYearArchive({...args(),from:'1993-01',to:'1993-12'}),/нет подтверждённых сцен/);
 assert.throws(()=>buildYearArchive({...args(),branch:{...branch,head_scene_id:old.id}}),/устаревшей цепочке/);
 assert.throws(()=>buildYearArchive({...args(),world:{...world,active_branch_id:'changed'}}),/действующей ветки/);
 assert.throws(()=>buildYearArchive({...args(),to:'1997-10'}),/не длиннее/);
});

test('year UI and OAuth preflight use current valid lineage and provide full live year read',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 assert.match(app,/case 'year-archive-build'/);
 assert.match(app,/case 'year-archive-save'/);
 assert.match(app,/existingKey:draft\.key/);
 assert.match(app,/state\.activeLineage=lineage/);
 assert.match(bridge,/reconcileYearDocuments\(/);
 assert.match(bridge,/current_year_reconstructions:/);
 assert.match(bridge,/name:'get_current_year_archive'/);
 assert.match(bridge,/if\(name==='get_current_year_archive'\)/);
 assert.doesNotMatch(bridge,/INVALIDATED_YEAR_ARCHIVES_EXCLUDED/);
 assert.doesNotMatch(bridge,/isYearArchiveActive/);
});
