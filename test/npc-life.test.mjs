import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {npcLifeBrief,projectNpcPlanLedger,validateNpcPlanUpdates,validateNpcPlanTransitions} from '../public/npc-life.mjs';
import {projectWorldDepth,validateDepthDelta} from '../public/world-depth.mjs';
import {projectCharacterMemory} from '../public/world-character-memory.mjs';
import {activeLineage} from '../public/world-ledger.mjs';
import {parseScenePackage,packSceneNote,readSceneNote} from '../public/continuity.mjs';
import {sceneDirectorBrief,sceneDirectorGuidance} from '../public/scene-director.mjs';

const baseline=[
 {name:'Гарри',role:'hero',goals:'Учиться'},
 {name:'Лия',role:'npc',goals:'Найти дом',location:'Лондон'},
 {name:'Пэнси',role:'npc',goals:'Укрепить дружбу',location:'Хогвартс'}
];
const phrase='Лия решила отложить разговор до утра. Пэнси вежливо попрощалась.';
const intention={id:'plan-home',actor:'Лия',plan:'Найти дом',motive:'Жить вместе',obstacle:'Нет подходящего жилья',
 evidence:'Лия решила отложить разговор до утра.'};
const update={intention_id:'plan-home',actor:'Лия',status:'paused',reason:'Выдохлась',
 evidence:'Лия решила отложить разговор до утра.'};
const row=(id,parent,delta,body=phrase)=>({id,parent_scene_id:parent,world_time:'1998-09-04',body,
 changes:delta});

test('NPC plan transitions require an exact scene quote or a linked offscreen event',()=>{
 assert.deepEqual(validateNpcPlanUpdates(undefined,phrase),[]);
 assert.equal(validateNpcPlanUpdates([update],phrase)[0].basis,'scene');
 assert.throws(()=>validateNpcPlanUpdates([{...update,evidence:'Не было этой реплики.'}],phrase),/дословную/);
 assert.throws(()=>validateNpcPlanUpdates([{...update,status:'magically_finished'}],phrase),/статус/);
 assert.throws(()=>validateNpcPlanUpdates([{...update,actor:'Пэнси',basis:'offscreen',related_offscreen_id:'off-1'}],
 phrase,[{id:'off-1',actor:'Лия'}]),/должны совпадать/);
 const ok=validateNpcPlanUpdates([{...update,status:'completed',basis:'offscreen',related_offscreen_id:'off-1'}],
 phrase,[{id:'off-1',actor:'Лия'}]);
 assert.equal(ok[0].status,'completed');
 assert.equal(ok[0].related_offscreen_id,'off-1');
});

test('valid active branch alone determines life plans and excludes invalidated relationships',()=>{
 const root=row('root',null,{npc_intentions:[intention],characters:[{name:'Лия',goals:'Искать жильё вместе с Гарри'}]});
 const invalid=row('invalid','root',{npc_plan_updates:[{...update,status:'completed'}],
  relationships:[{id:'r-invalid',from:'Лия',to:'Гарри',dimension:'attraction',shift:'increased',
   interpretation:'interpretation',rationale:'Изменились чувства',evidence:'Лия решила отложить разговор до утра.'}]});
 const valid=row('valid','root',{npc_plan_updates:[update],
  relationships:[
  {id:'r-trust',from:'Лия',to:'Гарри',dimension:'trust',shift:'increased',
    interpretation:'interpretation',rationale:'Общее дело',evidence:'Лия решила отложить разговор до утра.'},
  {id:'r-irritation',from:'Лия',to:'Гарри',dimension:'irritation',shift:'increased',
    interpretation:'interpretation',rationale:'Тяжёлый день',evidence:'Лия решила отложить разговор до утра.'}
  ]});
 const selected=activeLineage([root,invalid,valid],'valid');
 const people=projectCharacterMemory(baseline,selected);
 const depth=projectWorldDepth(selected);
 const brief=npcLifeBrief({characters:people.characters,depth,complete:true});
 const lia=brief.actor_profiles.find(x=>x.name==='Лия');
 assert.equal(lia.goals,'Искать жильё вместе с Гарри');
 assert.equal(lia.pending_plans[0].state,'paused');
 assert.equal(lia.social_connections.find(r=>r.to==='Гарри').dimensions.trust.shift,'increased');
 assert.equal(lia.social_connections.find(r=>r.to==='Гарри').dimensions.irritation.shift,'increased');
 assert.equal(lia.social_connections.find(r=>r.to==='Гарри').dimensions.attraction,undefined);
 assert.ok(!brief.actor_profiles.some(x=>x.name==='Гарри'));
 assert.equal(brief.plan_ledger.total,1);
 assert.equal(brief.complete,true);
 assert.equal(npcLifeBrief({characters:people.characters,depth:projectWorldDepth(activeLineage([root,invalid,valid],'invalid'))})
  .actor_profiles.find(x=>x.name==='Лия').pending_plans.length,0);
});

test('terminal plans cannot be reactivated in the same continuity, plans are not events',()=>{
 const ledger={npc_intentions:[intention],npc_plan_updates:[{...update,status:'completed'}]};
 const projected=projectNpcPlanLedger(ledger);
 assert.equal(projected.plans[0].state,'completed');
 assert.throws(()=>validateNpcPlanTransitions(ledger,[update]),/Закрытое намерение/);
 assert.throws(()=>validateNpcPlanTransitions(ledger,[{...update,intention_id:'unknown'}]),/неизвестное намерение/);
 assert.throws(()=>validateNpcPlanTransitions({npc_intentions:[intention]},[{...update,actor:'Гарри'}]),/другому NPC/);
 assert.equal(validateNpcPlanTransitions({npc_intentions:[intention]},[update]),true);
 const unknown=projectNpcPlanLedger({npc_intentions:[],npc_plan_updates:[update]});
 assert.equal(unknown.plans.length,0);
 assert.equal(unknown.warnings[0].code,'UPDATE_UNKNOWN_INTENTION');
});

test('scene packet and deep projection record an offscreen plan update without transferring knowledge',()=>{
 const body='Лия решила отложить разговор до утра.';
 const payload={scene:body,world_time:'1998-09-04',changes:{
  npc_intentions:[intention],npc_plan_updates:[update]}};
 const parsed=parseScenePackage(JSON.stringify(payload));
 assert.equal(parsed.changes.npc_plan_updates[0].status,'paused');
 const note=readSceneNote(packSceneNote(parsed.changes));
 assert.equal(note.delta.npc_plan_updates[0].intention_id,'plan-home');
 assert.deepEqual(validateDepthDelta(parsed.changes,body).npc_plan_updates,parsed.changes.npc_plan_updates);
 const depth=projectWorldDepth([row('a',null,parsed.changes,body)]);
 assert.equal(depth.npc_plan_updates[0].scene_id,'a');
 assert.equal(depth.npc_intentions[0].actor,'Лия');
 assert.equal(npcLifeBrief({characters:baseline,depth,complete:true}).actor_profiles
  .find(x=>x.name==='Лия').pending_plans[0].state,'paused');
});

test('director considers grounded NPC initiative independently of mystery threads and ignores deceased actor',()=>{
 const life=npcLifeBrief({characters:[
  {name:'Пэнси',initial_role:'npc',state:{goals:'Встретиться с подругой',location:'Хогвартс'}},
  {name:'Умерший свидетель',initial_role:'npc',state:{goals:'Найти адрес',health:'Умер в 1985 году'}}
 ],depth:{npc_intentions:[{id:'visit',actor:'Пэнси',plan:'Увидеть подругу',motive:'Соскучилась',
 scene_id:'scene-a'}],
 relationships:[{from:'Пэнси',to:'Лия',dimensions:{affection:{shift:'increased',scene_id:'scene-b'}}}]},complete:true});
 const director=sceneDirectorBrief({world:{name:'AU'},clock:'1998-09-04',
  npcLife:life,complete:true,causalMemory:{managed_threads:[{id:'main',kind:'main',title:'Учёба',status:'active'}]}});
 const candidate=director.opportunities.find(x=>x.id==='life:Пэнси');
 assert.ok(candidate);
 assert.equal(candidate.status,'causal_eligibility_review');
 assert.ok(!director.opportunities.some(x=>x.title==='Умерший свидетель'));
 assert.match(sceneDirectorGuidance(director),/npc_plan_updates/);
 assert.match(sceneDirectorGuidance(director),/не свершившийся факт/);
 assert.equal(life.actor_profiles.some(x=>x.name==='Умерший свидетель'),false);
});

test('source bridge and collapsed app use real current state, not original NPC cards',()=>{
 const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(bridge,/name:'get_npc_life'/);
 assert.match(bridge,/validateNpcPlanTransitions/);
 assert.match(bridge,/npc_life:npcLifeBrief\(\{characters:people\.characters,depth,complete:true\}\)/);
 assert.match(bridge,/npcLife:assets\?\.npc_life/);
 assert.match(app,/projectCharacterMemory\(state\.characters,state\.memoryScenes/);
 assert.match(app,/npcLifeBrief\(\{characters:characters\.characters,depth,complete\}\)/);
 assert.match(app,/Самостоятельная жизнь NPC/);
});
