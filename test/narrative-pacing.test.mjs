import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateNarrativeBeats,narrativePacingBrief,narrativePacingGuidance} from '../public/narrative-pacing.mjs';
import {parseScenePackage,packSceneNote,readSceneNote} from '../public/continuity.mjs';
import {auditNarrativeScene} from '../public/narrative-audit.mjs';
import {scenePrompt} from '../public/logic.mjs';
import {activeLineage} from '../public/world-ledger.mjs';

const text='Гермиона опустила книгу. Лия устало улыбнулась. Гарри перестал расспрашивать женщину.';
const beat=(domain,progress='advance',thread_id='')=>({domain,progress,
 evidence:domain==='relationship'?'Лия устало улыбнулась.':'Гарри перестал расспрашивать женщину.',
 thread_id});

test('new narrative metadata is optional for legacy scenes, but evidence-bound when supplied',()=>{
 assert.deepEqual(validateNarrativeBeats(undefined,text),[]);
 assert.equal(validateNarrativeBeats([beat('investigation','stall','lia-record')],text).length,1);
 assert.throws(()=>validateNarrativeBeats([{...beat('investigation'),evidence:'Фальшивой цитаты не было.'}],text),/дословным/);
 assert.throws(()=>validateNarrativeBeats([beat('relationship'),beat('relationship')],text),/повторная/);
 assert.throws(()=>validateNarrativeBeats([beat('investigation','victory')],text),/advance/);
 assert.throws(()=>validateNarrativeBeats([beat('investigation','stall','Bad ID')],text),/thread_id/);
 assert.throws(()=>validateNarrativeBeats(Array.from({length:5},()=>beat('main')),text),/четырёх/);
});

const make=(id,domain,progress='advance',thread_id='')=>({
 id,world_time:'1998-11-01',body:text,
 changes:{narrative_beats:[beat(domain,progress,thread_id)]}
});
test('director sees a repeated investigation and meaningful areas neglected, not a forced romance',()=>{
 const chapters=[make('a','investigation','stall','lia-record'),
 make('b','investigation','stall','lia-record'),make('c','investigation','stall','lia-record'),
 make('d','investigation','stall','lia-record')];
 const result=narrativePacingBrief(chapters,{complete:true,window:12,
 managedThreads:[{id:'lia-record',status:'active',kind:'background',title:'Архив Лии'}]});
 assert.equal(result.consecutive_single_focus.count,4);
 assert.equal(result.domain_scene_counts.investigation,4);
 assert.equal(result.coverage.untagged_scenes,0);
 assert.deepEqual(result.underrepresented_review,['main','relationship','character','everyday']);
 assert.ok(result.signals.some(s=>s.code==='SINGLE_THREAD_SPOTLIGHT'));
 assert.ok(result.signals.some(s=>s.code==='INVESTIGATION_STALLED'&&s.thread_id==='lia-record'));
 assert.match(narrativePacingGuidance(result),/Не придумывай зацепку/);
 assert.match(narrativePacingGuidance(result),/не назначай обязательный секс/);
});

test('legacy chapters are not silently classified by textual guesses',()=>{
 const legacy={id:'old',body:'Свидание Гарри и Лии.',world_time:'1998-09-01',changes:{facts:['Гарри встретил Лию']}};
 const result=narrativePacingBrief([legacy,make('new','relationship')],{complete:false});
 assert.equal(result.coverage.tagged_scenes,1);
 assert.equal(result.coverage.untagged_scenes,1);
 assert.equal(result.complete,false);
 assert.equal(result.domain_scene_counts.relationship,1);
 assert.deepEqual(result.underrepresented_review,[]);
});

test('pacing consumes only confirmed branch lineage and ignores discarded revisions',()=>{
 const root={...make('root','main'),parent_scene_id:null};
 const invalid={...make('invalid','investigation','stall','archival'),parent_scene_id:'root'};
 const current={...make('current','relationship'),parent_scene_id:'root'};
 const good=activeLineage([root,invalid,current],'current');
 const result=narrativePacingBrief(good,{complete:true});
 assert.equal(result.domain_scene_counts.investigation,0);
 assert.equal(result.domain_scene_counts.relationship,1);
});

test('scene package persists the same citation-checked beats in the causal note',()=>{
 const payload={scene:text,world_time:'1998-11-01',changes:{narrative_beats:[beat('investigation','stall','lia-record')]}};
 const parsed=parseScenePackage(JSON.stringify(payload));
 assert.equal(parsed.changes.narrative_beats[0].thread_id,'lia-record');
 const reread=readSceneNote(packSceneNote(parsed.changes));
 assert.deepEqual(reread.delta.narrative_beats,parsed.changes.narrative_beats);
 const invalid=auditNarrativeScene({scene:text,world_time:'1998-11-01',changes:{
  narrative_beats:[{...beat('investigation'),evidence:'Такой реплики нет.'}]}});
 assert.ok(invalid.issues.some(e=>e.code==='INVALID_NARRATIVE_BEATS'));
});

test('manual ChatGPT narrative prompt includes pacing without API calls',()=>{
 const brief=narrativePacingBrief([make('a','investigation'),make('b','investigation'),
   make('c','investigation')],{complete:true});
 const prompt=scenePrompt({name:'Проверка',genre:'AU',world_rules:'Причинность',genesis_choices:{}},
   [{name:'Гарри',role:'hero'}],[], 'story','','normal',brief);
 assert.match(prompt,/СКРЫТЫЙ РЕДАКТОР ТЕМПА/);
 assert.match(prompt,/Три и более подряд сцен/);
 assert.match(prompt,/РЕЖИССЁРСКОЕ УТОЧНЕНИЕ/);
 const worker=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 assert.match(worker,/name:'get_narrative_pacing'/);
 assert.match(worker,/narrative_pacing:assets\.narrative_pacing/);
 assert.match(worker,/changes\.narrative_beats=validateNarrativeBeats/);
});
