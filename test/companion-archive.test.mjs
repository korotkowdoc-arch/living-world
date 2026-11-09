import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildYearArchive,reconcileYearDocuments} from '../public/year-archive.mjs';
import {packSceneNote} from '../public/continuity.mjs';

const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source={id:id(1),name:'История',active_branch_id:id(2)};
const branch={id:id(2),head_scene_id:id(5)};
const scenes=[
 {id:id(3),world_time:'2010-07',prompt_note:packSceneNote({facts:['Первый подтверждённый факт'],open_threads:['Обещано вернуть книгу']})},
 {id:id(4),parent_scene_id:id(3),world_time:'2010-12',prompt_note:packSceneNote({facts:['Сохранилась дружба'],items:[{id:'item1',action:'acquire',item_id:'book',owner:'Гарри',label:'Книга',reason:'Найдена',source:'Сцена'}]})},
 {id:id(5),parent_scene_id:id(4),world_time:'2011-01',prompt_note:packSceneNote({facts:['Начался новый год']})}
];

test('a completed year is preserved while future events do not enter the annual document',()=>{
 const doc=buildYearArchive({world:source,branch,scenes,characters:[],from:'2010-01',to:'2010-12'});
 assert.match(doc.content,/Обещано вернуть книгу/);
 assert.match(doc.content,/Сохранилась дружба/);
 assert.match(doc.content,/Книга/);
 assert.doesNotMatch(doc.content,/Начался новый год/);
 const result=reconcileYearDocuments({documents:[{doc_key:doc.key,category:'year_document',content:doc.content}],
  world:source,branch,scenes,characters:[]});
 assert.equal(result.documents.length,1);
 assert.equal(result.liveSummaries.length,0);
});

test('OAuth bridge automatically archives when year advances, but never masks save receipt',()=>{
 assert.match(bridge,/async function archiveElapsedYears\(/);
 assert.match(bridge,/buildYearArchive\(\{world,branch,scenes:validScenes/);
 assert.match(bridge,/async function writeSystemArchive\(/);
 assert.match(bridge,/category:'year_document'/);
 assert.match(bridge,/format:'LW_STATE_CHECKPOINT_V1'/);
 assert.match(bridge,/category:'checkpoint'/);
 assert.match(bridge,/const saved=await appendSceneWithReceipt\(env,identity,body,expectedScene\)/);
 assert.match(bridge,/return \{mode,\.\.\.saved,year_archive\};/);
 assert.match(bridge,/catch\(error\)\{year_archive=\{status:'needs_review'/);
 assert.match(bridge,/function activeCheckpoint\(doc,ancestorIds\)/);
 assert.match(bridge,/filter\(doc=>activeCheckpoint\(doc,ancestors\)\)/);
});

test('full lineage replay no longer stops after exactly 3000 rows',()=>{
 assert.match(bridge,/const maxRows=30000,pageSize=500/);
 assert.doesNotMatch(bridge,/offset<=3000;offset\+=500/);
 assert.match(bridge,/В мире более 30000 записей, все сцены сохранены/);
});

test('choices and scene settings are transmitted from Supabase instead of localStorage',()=>{
 assert.match(app,/function persistCompanionSettings\(patch\)/);
 assert.match(app,/mergeCompanionPreferences\(fresh\.genesis_choices\|\|\{\},patch\)/);
 assert.match(app,/case 'sim-choice'[\s\S]*?persistCompanionSettings\(\{pending_decision/);
 assert.doesNotMatch(app,/localStorage\.setItem\('lw_sim_choice_/);
 assert.match(bridge,/companion_settings:companionSettings\(base\.world/);
 assert.match(bridge,/companion_guidance:companionGuidance\(companionSettings/);
 assert.match(bridge,/packSceneNote\(packet\.changes,'',packet\.decisions\)/);
});
