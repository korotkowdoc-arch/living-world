import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEGACY_405_AUDIT as audit} from '../public/legacy-405-audit.mjs';
import {projectCausalMemory,searchCausalMemory,causalSummary,causalSceneBrief,validateThreadTransitions} from '../public/world-causality.mjs';

const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const raw=json('../audit/y1-legacy405-source.json'),lineage=json('../audit/y1-81-scenes-index.json');
const evidence=[1,2,3].flatMap(n=>json('../audit/y1-evidence-scenes-'+n+'.json'));
const evidenceById=new Map(evidence.map(s=>[s.id,s]));
function syntheticLineage(){
 const byScene=new Map(lineage.scenes.map(s=>[s.id,{id:s.id,world_time:s.world_time,changes:{facts:evidenceById.get(s.id)?.facts||[],open_threads:[],resolved_threads:[]}}]));
 for(const row of raw.entries)byScene.get(row.opened_scene_id).changes.open_threads.push(row.text);
 return lineage.scenes.slice().reverse().map(s=>byScene.get(s.id));
}
test('source snapshot preserves every one of 405 valid branch note records',()=>{
 assert.equal(raw.entries.length,405);
 assert.equal(lineage.scenes.length,81);
 assert.equal(audit.entries.length,405);
 assert.equal(audit.base_head_scene_id,lineage.base_head_scene_id);
 const ids=new Set(lineage.scenes.map(s=>s.id));
 for(let i=0;i<405;i++){
  assert.equal(audit.entries[i].ordinal,i+1);
  assert.equal(audit.entries[i].original_text,raw.entries[i].text);
  assert.equal(audit.entries[i].opened_scene_id,raw.entries[i].opened_scene_id);
  assert.ok(ids.has(audit.entries[i].opened_scene_id));
  assert.ok(audit.entries[i].decision.classification);
  const e=audit.entries[i].decision.evidence;
  if(e){
   assert.ok(audit.entries[i].opened_at<e.world_time);
   assert.ok(evidenceById.get(e.scene_id)?.facts.includes(e.fact),
    'invalid closure citation at record '+(i+1));
  }
 }
 for(const arc of audit.curated_arcs){
  assert.ok(evidenceById.get(arc.provenance.scene_id)?.facts.includes(arc.provenance.fact));
  assert.ok(['active','paused'].includes(arc.status));
 }
});
test('405 legacy notes become eight evidence-anchored arcs, without deleting any history',()=>{
 const scenes=syntheticLineage();
 const mem=projectCausalMemory(scenes,{legacyAudit:audit});
 assert.equal(mem.scanned_scenes,81);
 assert.equal(mem.open_threads.length,405);
 assert.equal(mem.counts.legacy_total,405);
 assert.equal(mem.counts.legacy_reviewed,405);
 assert.equal(mem.counts.legacy_unreviewed,0);
 assert.equal(mem.counts.tracked_active,4);
 assert.equal(mem.counts.tracked_paused,4);
 assert.equal(mem.managed_threads.length,8);
 assert.equal(mem.legacy_review.evidence_pending,130);
 assert.equal(searchCausalMemory(mem,{kind:'legacy_audit',limit:100}).total,405);
 assert.ok(searchCausalMemory(mem,{kind:'storyline',query:'Камень'}).items.some(x=>x.id==='y1-stone'));
 const brief=causalSceneBrief(causalSummary(mem));
 assert.equal(brief.open_threads.length,0);
 assert.ok(brief.managed_threads.some(x=>x.id==='y1-stone'));
 assert.equal(brief.legacy_review.classified,405);
});
test('future scenes develop migrated arcs by stable ID and checkpoints preserve them',()=>{
 const scenes=syntheticLineage();
 const changes={thread_updates:[{id:'y1-stone',action:'advance',
  summary:'Противник предпринял действие',reason:'Состоявшееся действие из новой сцены',
  source_kind:'scene',evidence:'Противник предпринял действие'}]};
 const old=projectCausalMemory(scenes,{legacyAudit:audit});
 assert.doesNotThrow(()=>validateThreadTransitions(old.managed_threads,changes.thread_updates));
 const next=projectCausalMemory([...scenes,{id:'future',world_time:'2015-04-01',changes}],
  {legacyAudit:audit});
 assert.equal(next.managed_threads.find(x=>x.id==='y1-stone').history.length,2);
 const resumed=projectCausalMemory([],{seed:next,legacyAudit:audit});
 assert.equal(resumed.managed_threads.find(x=>x.id==='y1-stone').history.length,2);
 assert.equal(resumed.legacy_review.classified,405);
});
test('invalidated branches and altered original notes fail closed: no imaginary arcs',()=>{
 const original=syntheticLineage();
 assert.equal(projectCausalMemory(original.slice(0,-1),{legacyAudit:audit}).counts.tracked_active,0);
 const tampered=syntheticLineage();
 const source=tampered.find(s=>s.changes.open_threads.length);
 source.changes.open_threads[0]='Подменённая неподтверждённая запись';
 const mem=projectCausalMemory(tampered,{legacyAudit:audit});
 assert.equal(mem.counts.tracked_active,0);
 assert.ok(mem.warnings.some(w=>w.code==='LEGACY_AUDIT_SOURCE_MISMATCH'));
 const absent=projectCausalMemory(original);
 assert.equal(absent.counts.tracked_active,0);
});
