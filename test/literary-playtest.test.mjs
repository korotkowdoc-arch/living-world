import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {literaryPlaytestReport} from '../public/literary-playtest.mjs';
import {activeLineage} from '../public/world-ledger.mjs';

const make=(id,domain='investigation',progress='stall',parent=null)=>({
 id,parent_scene_id:parent,world_time:'1998-11-01',changes:{
  narrative_beats:[{domain,progress,evidence:'Гарри снова открыл архив.'}]
 }
});
test('30 annotated investigation scenes produce a caution, not a fake literary verdict',()=>{
 const scenes=Array.from({length:30},(_,i)=>make('s'+i,'investigation','stall',i?'s'+(i-1):null));
 const report=literaryPlaytestReport(scenes,{complete:true});
 assert.equal(report.saved_scenes,30);
 assert.equal(report.coverage.tagged_scenes,30);
 assert.equal(report.longest_single_domain_run,30);
 assert.equal(report.ready_for_human_review,true);
 assert.equal(report.domain_scene_counts.relationship,0);
 assert.ok(report.editorial_signals.some(s=>s.code==='INVESTIGATION_MONOPOLY'));
 assert.ok(report.editorial_signals.some(s=>s.code==='SOCIAL_LIFE_UNSEEN'));
 assert.ok(report.editorial_signals.some(s=>s.code==='MAIN_PLOT_UNSEEN'));
 assert.match(report.verdict,/НЕТ АВТОМАТИЧЕСКОЙ ЛИТЕРАТУРНОЙ ОЦЕНКИ/);
});
test('missing tags are unknown even if the prose mentions romance',()=>{
 const scenes=Array.from({length:30},(_,i)=>({
  id:'old'+i,world_time:'1998-11-01',
  body:'Гарри и Лия провели вечер вместе.',changes:{}
 }));
 const result=literaryPlaytestReport(scenes,{complete:true});
 assert.equal(result.coverage.untagged_scenes,30);
 assert.deepEqual(result.editorial_signals,[]);
 assert.equal(result.domain_scene_counts.relationship,0);
});
test('real changes are counted separately from imperfect domain annotations',()=>{
 const scenes=[{
  id:'s0',world_time:'1998-09-01',changes:{
   relationships:[{id:'rel',from:'Гарри',to:'Лия'}],
   npc_offscreen:[{id:'off',basis:'simulated',actor:'Пэнси'}],
   calendar_updates:[{id:'Y1-06',outcome:'altered'}],
   npc_schedule_updates:[{id:'meet',action:'create'}],
   npc_plan_updates:[{intention_id:'plan',actor:'Пэнси',status:'blocked'}]
  }}];
 const result=literaryPlaytestReport(scenes,{complete:true});
 assert.equal(result.ready_for_human_review,false);
 assert.deepEqual(result.recorded_changes,{
  independent_npc_events:1,relationship_observations:1,calendar_outcomes:1,
  appointment_changes:1,npc_plan_updates:1
 });
});
test('invalidated branch changes do not leak into valid-branch acceptance report',()=>{
 const root=make('root','main','advance',null);
 const bad={...make('bad','investigation','stall','root'),changes:{
  npc_offscreen:[{basis:'simulated',id:'secret',actor:'Драко'}]}};
 const good=make('good','relationship','quiet','root');
 const valid=activeLineage([root,bad,good],'good');
 const result=literaryPlaytestReport(valid,{complete:true});
 assert.equal(result.recorded_changes.independent_npc_events,0);
 assert.equal(result.domain_scene_counts.relationship,1);
});
test('less than thirty real saved scenes cannot satisfy the acceptance threshold',()=>{
 const result=literaryPlaytestReport(Array.from({length:29},(_,i)=>make('s'+i)),{complete:true});
 assert.equal(result.ready_for_human_review,false);
 assert.equal(result.required_scenes,30);
 assert.equal(result.saved_scenes,29);
 const incomplete=literaryPlaytestReport(Array.from({length:31},(_,i)=>make('s'+i)),{complete:false});
 assert.equal(incomplete.ready_for_human_review,false);
 assert.equal(incomplete.saved_scenes,30);
});
test('bridge reports only persisted active lineage and never calls a model for acceptance',()=>{
 const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 assert.match(bridge,/name:'get_literary_playtest_report'/);
 assert.match(bridge,/if\(name==='get_literary_playtest_report'\)/);
 assert.match(bridge,/literaryPlaytestReport\(full\.lineage/);
 assert.match(bridge,/getDelta:s=>readSceneNote\(s\.prompt_note\)\?\.delta/);
});
