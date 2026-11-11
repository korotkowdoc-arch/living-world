import test from 'node:test';
import assert from 'node:assert/strict';
import {auditNarrativeScene} from '../public/narrative-audit.mjs';
const line='Лия сказала Гарри: «Я ещё злюсь, но хочу поговорить».';
test('auditor separates source mismatch error from uncertain actor and learned-fact warnings',()=>{
 const r=auditNarrativeScene({scene:line,world_time:'2010-10-01',previous_time:'2010-09-01',
  known_characters:['Гарри','Лия'],changes:{psychology:[{id:'x',character:'Лия',
   aspect:'trigger',observation:'Обижается',certainty:'interpretation',evidence:'Она улыбнулась'}],
   characters:[{name:'Гарри',learned:[{fact:'Лия купила дом',via:'Тайная записка'}]}]}});
 assert.equal(r.passed,false);
 assert.ok(r.issues.some(x=>x.code==='UNVERIFIED_PSYCHOLOGY_OR_OFFSCREEN'));
 assert.ok(r.issues.some(x=>x.code==='KNOWLEDGE_CHANNEL_NEEDS_REVIEW'));
});
test('a dangerous time regression is an error; plans are only informational',()=>{
 const r=auditNarrativeScene({scene:line,world_time:'2010-08-01',previous_time:'2010-10-01',
  changes:{npc_intentions:[{id:'plan',actor:'Лия',plan:'Уйти',motive:'Злится',evidence:'хочу поговорить'}]}});
 assert.equal(r.passed,false);
 assert.ok(r.issues.some(x=>x.code==='TIME_REGRESSION'));
 assert.ok(r.issues.some(x=>x.code==='PLANS_NOT_EVENTS'));
});
test('offscreen claims need to have actually appeared in scene body',()=>{
 const r=auditNarrativeScene({scene:line,world_time:'2010-10-01',
  known_characters:['Гарри','Лия'],changes:{npc_offscreen:[{
   id:'a',actor:'Лия',event:'Получила новую работу',basis:'reported',evidence:'Говорила про работу',
   happened_at:'2010-10-30'}]}});
 assert.ok(r.issues.some(x=>x.code==='UNVERIFIED_PSYCHOLOGY_OR_OFFSCREEN'));
 assert.ok(r.issues.some(x=>x.code==='OFFSCREEN_FROM_FUTURE'));
});
test('clean annotated scene passes static audit without claiming semantic omniscience',()=>{
 const r=auditNarrativeScene({scene:line,world_time:'2010-10-01',
  known_characters:['Гарри','Лия'],changes:{psychology:[{id:'t',character:'Лия',aspect:'inner_conflict',
   observation:'Сердится, но хочет говорить',certainty:'interpretation',
   evidence:'Я ещё злюсь, но хочу поговорить'}]}});
 assert.equal(r.passed,true);
 assert.match(r.scope,/Статическая/);
});
