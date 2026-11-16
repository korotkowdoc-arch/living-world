import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCausalMemory,causalSummary,causalSceneBrief,searchCausalMemory,validateThreadUpdates,validateThreadTransitions} from '../public/world-causality.mjs';
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


test('structured but unshown autonomous NPC events appear in causal offscreen search',()=>{
 const scene={id:'x',world_time:'2015-04-04',body:'Гарри занимался чарами.',
  changes:{npc_offscreen:[{id:'evt',actor:'Драко Малфой',event:'Написал матери письмо.',
   happened_at:'2015-04-02',basis:'simulated',known_by:['Драко Малфой']}]}};
 const log=projectCausalMemory([scene]);
 assert.equal(log.counts.offscreen_events,1);
 const result=searchCausalMemory(log,{kind:'offscreen',query:'Драко'});
 assert.equal(result.total,1);
 assert.equal(result.items[0].happened_at,'2015-04-02');
 assert.deepEqual(result.items[0].known_by,['Драко Малфой']);
});

test('legacy 405-style notes remain searchable but are never counted as active story arcs',()=>{
 const many=Array.from({length:100},(_,i)=>({id:'s'+i,world_time:'2015-03',
  changes:{open_threads:['Незавершённое обстоятельство '+i]}}));
 const full=projectCausalMemory(many),preview=causalSceneBrief(causalSummary(full),{actorNames:['Драко']});
 assert.equal(full.open_threads.length,100);
 assert.equal(full.counts.legacy_unreviewed,100);
 assert.equal(full.counts.tracked_active,0);
 assert.equal(preview.open_threads.length,0);
 assert.equal(preview.unshown_open_threads,100);
 assert.equal(searchCausalMemory(full,{kind:'open_thread',query:'обстоятельство 1'}).total>0,true);
});
const start=(id,title='Философский камень')=>({
 id,action:'open',title,kind:'main',objective:'Противник хочет получить Камень',
 stakes:'Опасность для школы и магического мира',summary:'Угроза проявилась',
 reason:'Подтверждён план противника',source_kind:'anchor',source_ref:'Y1-12'
});
const step=(id,action,summary='Ситуация изменилась')=>({
 id,action,summary,reason:'Реальные последствия нового события',
 source_kind:'scene',evidence:'Драко встретился с Пэнси.'
});
test('stable storyline is opened once, advances, pauses, resumes and closes with consequences',()=>{
 const original=start('y1-stone');
 const later=[step('y1-stone','advance'),step('y1-stone','pause'),
  step('y1-stone','resume'),step('y1-stone','resolve','Противник больше не может завладеть Камнем')];
 const scenes=[{id:'1',world_time:'2015-04-01',changes:{thread_updates:[original]}},
  ...later.map((u,i)=>({id:String(i+2),world_time:'2015-04-'+String(i+2).padStart(2,'0'),
   changes:{thread_updates:[u]}}))];
 const ledger=projectCausalMemory(scenes);
 assert.equal(ledger.counts.tracked_active,0);
 assert.equal(ledger.counts.tracked_resolved,1);
 assert.equal(ledger.managed_threads.length,1);
 assert.deepEqual(ledger.managed_threads[0].history.map(h=>h.action),
  ['open','advance','pause','resume','resolve']);
 assert.equal(searchCausalMemory(ledger,{kind:'storyline',query:'Философский'}).total,1);
 const reopened=projectCausalMemory([...scenes,{id:'6',world_time:'2015-04-07',changes:{
  thread_updates:[step('y1-stone','reopen','Появился новый способ достать Камень')]}}]);
 assert.equal(reopened.counts.tracked_active,1);
 assert.equal(reopened.managed_threads[0].history.length,6);
 assert.ok(causalSceneBrief(causalSummary(reopened)).managed_threads.some(t=>t.id==='y1-stone'));
});
test('schema rejects unsupported nuisance lines and fake scene evidence',()=>{
 const text='Драко встретился с Пэнси.';
 assert.equal(validateThreadUpdates([start('y1-stone')],text).length,1);
 assert.throws(()=>validateThreadUpdates([step('y1-stone','advance')],'Гарри спит.'),/evidence/);
 assert.throws(()=>validateThreadUpdates([start('same'),start('same')],text),/дублирование/);
 assert.throws(()=>validateThreadUpdates([{id:'noise',action:'open',summary:'Может быть работа',
  reason:'Интересно',source_kind:'anchor',source_ref:'Y1-12'}],text),/название, цель, ставки/);
 assert.throws(()=>validateThreadUpdates([{...step('old','advance'),
  source_kind:'offscreen',source_ref:'imaginary'}],text,[]),/npc_offscreen/);
 assert.throws(()=>validateThreadTransitions([],[step('unknown','advance')]),/несуществующую/);
 assert.throws(()=>validateThreadTransitions([{id:'y1-stone',status:'active'}],[start('y1-stone')]),/дубль/);
 assert.throws(()=>validateThreadTransitions([{id:'y1-stone',status:'resolved'}],[step('y1-stone','advance')]),/reopen/);
});
test('managed threads survive validated checkpoints and do not borrow invalidated branch tail',()=>{
 const origin={id:'a',parent_scene_id:null,changes:{thread_updates:[start('y1-stone')]}};
 const discarded={id:'b',parent_scene_id:'a',changes:{thread_updates:[step('y1-stone','resolve')]}};
 const valid={id:'c',parent_scene_id:'a',changes:{thread_updates:[step('y1-stone','advance')]}};
 const full=projectCausalMemory(activeLineage([origin,discarded,valid],'c'));
 const restored=projectCausalMemory([],{seed:full});
 assert.equal(restored.counts.tracked_active,1);
 assert.equal(restored.managed_threads[0].history.length,2);
 assert.equal(restored.managed_threads[0].history.at(-1).action,'advance');
});

