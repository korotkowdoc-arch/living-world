import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packSceneNote,parseScenePackage} from '../public/continuity.mjs';
import {STAGE_CONTROL_FORMAT,CHAT_CHECKPOINT_FORMAT,STAGE_YEAR_FORMAT,STAGE_CONTROL_KEY,
 stageScenes,chooseStageControl,buildChatCheckpoint,buildStoryYear,stageYearMetadata,
 validStageYearDocs,validateSceneMemories,indexStoryMemories,searchStoryMemories,
 chooseCheckpoint} from '../public/story-memory.mjs';

const world={id:'11111111-1111-4111-8111-111111111111',name:'AU Гарри Поттер',active_branch_id:'22222222-2222-4222-8222-222222222222'};
const bid=world.active_branch_id;
const ids=['33333333-3333-4333-8333-333333333331','33333333-3333-4333-8333-333333333332',
 '33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333334'];
const stage={id:'44444444-4444-4444-8444-444444444444',title:'До Хогвартса',start_after_scene_id:null};
const m={id:'joke-01',kind:'joke',title:'Обещанная книга',detail:'Гарри подшутил о книге, которую вернёт',
 quote:'Я верну её в четверг!',participants:['Гарри','Лия'],known_by:['Гарри','Лия'],
 emotional_context:'Старая внутренняя шутка',tags:['книга','четверг'],related_to:''};
const a={id:ids[0],world_time:'2010-07-31',body:'Гарри сказал: Я верну её в четверг!',
 prompt_note:packSceneNote({facts:['Гарри и Лия встретились'],open_threads:['Вернуть книгу'],memories:[m],
  characters:[{name:'Лия',mood:'недоверие',learned:[{fact:'Гарри обещал вернуть книгу',via:'Гарри сказал лично'}]}]})};
const b={id:ids[1],parent_scene_id:ids[0],world_time:'2011-08-01',body:'Они снова вспомнили книгу.',
 prompt_note:packSceneNote({facts:['Прошёл год'],memories:[{id:'callback-02',kind:'shared_memory',
  title:'Книга снова вспомнилась',detail:'Шутка про четверг остаётся между ними',
  participants:['Гарри','Лия'],known_by:['Гарри','Лия'],tags:['книга'],related_to:'joke-01'}]})};
const c={id:ids[2],parent_scene_id:ids[1],world_time:'2014-09-01',body:'Лия вернулась к разговору.',
 prompt_note:packSceneNote({facts:['Начался новый период']})};
const branch={id:bid,head_scene_id:ids[2]},lineage=[a,b,c];

test('stage respects causal scene ancestry, not New Year or a 12-month interval',()=>{
 assert.deepEqual(stageScenes(lineage,stage).map(s=>s.id),ids.slice(0,3));
 assert.deepEqual(stageScenes(lineage,{...stage,start_after_scene_id:ids[0]}).map(s=>s.id),ids.slice(1,3));
 assert.throws(()=>stageScenes(lineage,{...stage,start_after_scene_id:ids[3]}),/аннулировано/);
});

test('checkpoint carries all current-stage events, source IDs, character knowledge and recent full scenes',()=>{
 const doc=buildChatCheckpoint({world,branch,lineage,characters:[],stage,
  handoff_note:'Лия опасается новых обещаний Гарри.',evidence_scene_ids:[ids[0]]});
 const body=JSON.parse(doc.content);
 assert.equal(body.format,CHAT_CHECKPOINT_FORMAT);
 assert.equal(body.stage.title,'До Хогвартса');
 assert.equal(body.chronology.length,3);
 assert.equal(body.source_scene_ids[0],ids[0]);
 assert.equal(body.source_scene_ids[2],ids[2]);
 assert.equal(body.characters.find(p=>p.name==='Лия').knowledge[0].fact,'Гарри обещал вернуть книгу');
 assert.equal(body.story_memories[0].title,'Обещанная книга');
 assert.equal(body.story_memories[1].related_to,'joke-01');
 assert.equal(body.recent_full_scenes.at(-1).text,c.body);
 assert.equal(body.handoff_note.evidence_scene_ids[0],ids[0]);
 assert.deepEqual(body.open_threads.map(t=>t.text),['Вернуть книгу']);
 assert.throws(()=>buildChatCheckpoint({world,branch,lineage,stage,handoff_note:'Субъективная мысль'}),/ID сыгранных сцен/);
 assert.throws(()=>buildChatCheckpoint({world,branch,lineage,stage,handoff_note:'Субъективная мысль',evidence_scene_ids:[ids[3]]}),/вне действующей/);
});

test('Year Document closes a named stage spanning calendar years and preserves personal callbacks',()=>{
 const doc=buildStoryYear({world,branch,lineage,characters:[],stage});
 assert.equal(doc.category,'year_document');
 assert.match(doc.content,/# YEAR DOCUMENT · До Хогвартса/);
 assert.match(doc.content,/Я верну её в четверг!/);
 assert.match(doc.content,/точно знают: Гарри, Лия/i);
 assert.match(doc.content,/Обещанная книга/);
 assert.match(doc.content,/Начался новый период/);
 const md=stageYearMetadata({category:'year_document',content:doc.content});
 assert.equal(md.format,STAGE_YEAR_FORMAT);
 assert.equal(md.end_scene_id,ids[2]);
 assert.equal(md.stage_id,stage.id);
});

test('memory index searches exact callbacks with actor scope, does not invent knowledge',()=>{
 const index=indexStoryMemories(lineage);
 assert.equal(index.length,2);
 assert.equal(index[0].known_by.join(','),'Гарри,Лия');
 const hit=searchStoryMemories(lineage,{query:'книга',actor_names:['Лия']});
 assert.equal(hit.total,2);
 assert.equal(searchStoryMemories(lineage,{query:'книга',actor_names:['Снегг']}).total,0);
 assert.equal(searchStoryMemories(lineage,{query:'книга',kind:'joke'}).total,1);
});

test('scene JSON refuses quotes not literally said, accepts one complete annotated memory',()=>{
 assert.deepEqual(validateSceneMemories([m],a.body)[0].quote,'Я верну её в четверг!');
 assert.throws(()=>validateSceneMemories([{...m,quote:'Фразы не было'}],a.body),/буквальной репликой/);
 assert.throws(()=>validateSceneMemories([m,m],a.body),/уникальный/);
 const packet=parseScenePackage(JSON.stringify({scene:a.body,world_time:a.world_time,
  changes:{facts:['Встретились'],memories:[m]}}));
 assert.equal(packet.changes.memories[0].id,'joke-01');
});

test('control and checkpoints ignore invalidated old branch and do not restore cancelled jokes',()=>{
 const control=(source_head,closed_stages=[],open_stage=null)=>JSON.stringify({
  format:STAGE_CONTROL_FORMAT,world_id:world.id,source_head,branch_id:bid,
  closed_stages,open_stage
 });
 const first={revision:1,content:control(ids[0],[],stage)};
 const later={revision:2,content:control(ids[3],[{id:stage.id,title:stage.title,
  start_after_scene_id:null,end_scene_id:ids[3],doc_key:'year-stage-'+stage.id}],null)};
 const chosen=chooseStageControl([later,first],lineage,world.id);
 assert.equal(chosen.selected_revision,1);
 assert.equal(chosen.stale_revision,true);
 assert.equal(chosen.state.open_stage.title,stage.title);
 const doc=buildStoryYear({world,branch,lineage,characters:[],stage});
 const meta=stageYearMetadata({category:'year_document',content:doc.content});
 const docs=[{doc_key:doc.key,category:'year_document',content:doc.content}];
 assert.equal(validStageYearDocs(docs,chosen.state,lineage,world.id).length,0);
 const closed={open_stage:null,closed_stages:[{id:stage.id,title:stage.title,
  end_scene_id:ids[2],doc_key:doc.key}]};
 assert.equal(validStageYearDocs(docs,closed,lineage,world.id).length,1);
 const earlierCheckpoint=buildChatCheckpoint({world,branch,lineage,stage});
 const cp=[{category:'checkpoint',content:earlierCheckpoint.content,doc_key:'valid'}];
 assert.equal(chooseCheckpoint(cp,lineage,world.id).doc.doc_key,'valid');
 const altered=JSON.stringify({...JSON.parse(earlierCheckpoint.content),source_head:ids[3]});
 assert.equal(chooseCheckpoint([{...cp[0],content:altered}],lineage,world.id),null);
});

test('bridge has explicit stage lifecycle and NEVER closes on January 1st',()=>{
 const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 for(const name of ['get_story_stage_state','open_story_stage','create_chat_checkpoint',
  'close_story_stage','get_resume_context','search_story_memories','get_story_scene'])
  assert.match(bridge,new RegExp("name:'"+name+"'"));
 assert.doesNotMatch(bridge,/archiveElapsedYears\(/);
 assert.match(bridge,/year_archive:\{status:'manual_only'\}/);
 assert.match(app,/stage-copy-checkpoint/);
 assert.match(app,/stage-copy-resume/);
 assert.match(app,/stage-copy-search/);
 assert.doesNotMatch(app,/btn\('year-archive-build'/);
 assert.ok(STAGE_CONTROL_KEY);
});
