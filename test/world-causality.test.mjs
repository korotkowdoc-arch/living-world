import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCausalMemory,causalSummary,searchCausalMemory} from '../public/world-causality.mjs';
import {activeLineage} from '../public/world-ledger.mjs';
const a={id:'a',parent_scene_id:null,world_time:'1995-07',changes:{facts:['Гарри обещал вернуть книгу.'],open_threads:['Вернуть книгу'],offscreen_events:['Сосед уехал']}};
const b={id:'b',parent_scene_id:'a',world_time:'1995-08',changes:{facts:['Гарри купил дом.'],resolved_threads:['Вернуть книгу']}};
const invalid={id:'old',parent_scene_id:'a',world_time:'1995-08',changes:{facts:['Гарри потерял книгу'],open_threads:['Книга украдена']}};
test('old causal events stay queryable even after many scenes and resolved threads close',()=>{
 const fillers=Array.from({length:350},(_,i)=>({id:'f'+i,parent_scene_id:i===0?'b':'f'+(i-1),world_time:'1995-10',changes:{facts:['Случай '+i]}}));
 const log=projectCausalMemory([a,b,...fillers]);
 assert.equal(log.counts.facts,352);
 assert.equal(log.open_threads.length,0);
 assert.equal(log.resolved_threads.length,1);
 const memory=searchCausalMemory(log,{kind:'fact',query:'обещал'});
 assert.equal(memory.total,1);assert.equal(memory.items[0].scene_id,'a');
 assert.equal(causalSummary(log).counts.facts,352);
 assert.equal(causalSummary(log).facts.length,80);
});
test('abandoned branches cannot leak promised events or obligations',()=>{
 const good=projectCausalMemory(activeLineage([a,b,invalid],'b'));
 const cancelled=projectCausalMemory(activeLineage([a,b,invalid],'old'));
 assert.equal(searchCausalMemory(good,{query:'потерял'}).total,0);
 assert.equal(searchCausalMemory(cancelled,{query:'потерял'}).total,1);
 assert.equal(good.open_threads.length,0);
 assert.ok(cancelled.open_threads.some(t=>t.text==='Книга украдена'));
 assert.ok(cancelled.open_threads.some(t=>t.text==='Вернуть книгу'));
 assert.equal(good.open_threads.length,0);
});
test('reopened threads preserve their lifecycle and source scenes',()=>{
 const log=projectCausalMemory([a,b,{id:'c',world_time:'1996-01',changes:{open_threads:['Вернуть книгу']}}]);
 assert.equal(log.open_threads[0].status,'open');
 assert.deepEqual(log.open_threads[0].history.map(h=>h.type),['open','resolve','open']);
 assert.equal(log.open_threads[0].history[0].scene_id,'a');
});
test('unknown resolved thread is an audit warning, not a fabricated previous promise',()=>{
 const log=projectCausalMemory([{id:'x',changes:{resolved_threads:['Уплатить долг']}}]);
 assert.equal(log.warnings[0].code,'UNTRACKED_RESOLUTION');
 assert.equal(log.resolved_threads[0].opened_scene_id,null);
});
