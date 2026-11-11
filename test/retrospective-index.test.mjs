import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRetroIndex,parseRetroIndex,retroKey,validateRetroAnnotations,activeRetroMemories,
 searchRetroMemories,retroIndexCoverage} from '../public/retrospective-index.mjs';
const worldId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sceneId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const headId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const scene={id:sceneId,world_time:'1999-02-18',body:'Лия сказала Гарри: «Пока ты помнишь четверг, я могу смеяться». Гарри кивнул.'};
const entry={id:'thursday',kind:'joke',title:'Четверг',
 detail:'Общее воспоминание, которое позже изменило смысл',
 evidence:'Лия сказала Гарри: «Пока ты помнишь четверг, я могу смеяться».',
 quote:'Пока ты помнишь четверг, я могу смеяться',participants:['Лия','Гарри'],
 known_by:[{actor:'Лия',channel:'сказала вслух Гарри',
  evidence:'Лия сказала Гарри: «Пока ты помнишь четверг, я могу смеяться»'}],
 tags:['четверг','личная шутка'],emotional_context:'Тепло после конфликта'};
test('retroannotation requires exact source evidence and knowledge channel',()=>{
 const valid=validateRetroAnnotations(scene.body,[entry]);assert.equal(valid[0].known_by_names[0],'Лия');
 assert.throws(()=>validateRetroAnnotations(scene.body,[{...entry,evidence:'Здесь такого не было'}]),/дословно/);
 assert.throws(()=>validateRetroAnnotations(scene.body,[{...entry,quote:'выдуманная цитата'}]),/дословно/);
 assert.throws(()=>validateRetroAnnotations(scene.body,[{...entry,known_by:[{actor:'Снегг',channel:'магически',evidence:'не было'}]}]),/канал/);
});
test('retro memories are separate document annotations, never mutations of scene body',()=>{
 const src=scene.body,doc=makeRetroIndex({worldId,scene,head:headId,entries:[entry],digest:'a'.repeat(64)});
 assert.equal(scene.body,src);
 assert.equal(doc.key,retroKey(sceneId));
 const saved={doc_key:doc.key,content:doc.content};
 const parsed=parseRetroIndex(saved);
 assert.equal(parsed.source_scene_id,sceneId);
 assert.equal(parsed.source_digest,'a'.repeat(64));
 assert.equal(parsed.entries[0].certainty,'reviewed_annotation_not_independent_canon');
 const active=activeRetroMemories([saved],[sceneId],worldId);
 assert.equal(active.length,1);
 assert.equal(active[0].interpretation_not_world_truth,true);
 assert.equal(searchRetroMemories(active,{query:'четверг',actor_names:['Лия']}).total,1);
 assert.equal(searchRetroMemories(active,{query:'четверг',actor_names:['Снегг']}).total,0);
 assert.equal(activeRetroMemories([saved],[],worldId).length,0);
 assert.equal(activeRetroMemories([saved],[sceneId],'dddddddd-dddd-4ddd-8ddd-dddddddddddd').length,0);
});
test('review progress lists source scenes that still need evidence-based indexing',()=>{
 const saved=makeRetroIndex({worldId,scene,head:headId,entries:[entry],digest:'a'.repeat(64)});
 const other={id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',world_time:'2000-03'};
 const report=retroIndexCoverage([scene,other],[{doc_key:saved.key,content:saved.content}],worldId);
 assert.equal(report.source_scene_count,2);
 assert.equal(report.indexed_scene_count,1);
 assert.deepEqual(report.pending.map(x=>x.scene_id),[other.id]);
});
