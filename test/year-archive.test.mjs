import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packSceneNote} from '../public/continuity.mjs';
import {buildYearArchive,isYearArchiveActive,yearArchiveKey} from '../public/year-archive.mjs';

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

test('year archive derives only active confirmed events and branch-bound head',()=>{
 const doc=buildYearArchive(args());
 assert.equal(doc.scene_count,1);
 assert.equal(doc.source_head,final.id);
 assert.match(doc.content,/Гарри помог Мэй перенести ящики/);
 assert.match(doc.content,/Возможность будущей работы в кафе/);
 assert.match(doc.content,/Булка/);
 assert.match(doc.content,/Личные знания: 1/);
 assert.match(doc.content,/личный разговор/);
 assert.match(doc.content,new RegExp(final.id));
 assert.doesNotMatch(doc.content,/Жил в Лондоне/);
 assert.match(doc.content,new RegExp('LW_ARCHIVE_ACTIVE_HEAD: '+final.id));
 assert.equal(doc.key,yearArchiveKey('1995-01','1995-10',branch.id));
 assert.equal(doc.unstructured_scenes,0);
});

test('invalidated fork archive is excluded but surviving shared past remains valid',()=>{
 const doc=buildYearArchive(args());
 const record={category:'year_document',content:doc.content};
 assert.equal(isYearArchiveActive(record,[old.id,final.id]),true);
 assert.equal(isYearArchiveActive(record,[old.id]),false);
 assert.equal(isYearArchiveActive(record,[]),false);
 assert.equal(isYearArchiveActive({category:'core_rules',content:doc.content},[]),true);
});

test('cannot archive a future year, empty year, wrong branch or stale head',()=>{
 assert.throws(()=>buildYearArchive({...args(),to:'1995-12'}),/ещё не завершён/);
 assert.throws(()=>buildYearArchive({...args(),from:'1993-01',to:'1993-12'}),/нет подтверждённых сцен/);
 assert.throws(()=>buildYearArchive({...args(),branch:{...branch,head_scene_id:old.id}}),/устаревшей цепочке/);
 assert.throws(()=>buildYearArchive({...args(),world:{...world,active_branch_id:'changed'}}),/действующая ветка/);
 assert.throws(()=>buildYearArchive({...args(),to:'1997-10'}),/не длиннее/);
});

test('unstructured scenes are flagged instead of hallucinating consequences',()=>{
 const draft=buildYearArchive({...args(),scenes:[old,{...final,prompt_note:'обычная сцена'}]});
 assert.equal(draft.unstructured_scenes,1);
 assert.match(draft.content,/Нет структурированного пакета последствий/);
 assert.doesNotMatch(draft.content,/Гарри помог Мэй перенести ящики/);
});

test('archive is wired in UI and inactive documents are filtered from preflight',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 assert.match(app,/case 'year-archive-build'/);
 assert.match(app,/case 'year-archive-save'/);
 assert.match(app,/existingKey:draft\.key/);
 assert.match(app,/await refreshWorldAndBranch\(\);\s*const branch=state\.branches/);
 assert.match(app,/state\.activeLineage=lineage/);
 assert.match(bridge,/isYearArchiveActive\(doc,assets\?\.valid_scene_ids\)/);
 assert.match(bridge,/valid_scene_ids:lineage\.map\(s=>s\.id\)/);
});
