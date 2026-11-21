import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 validScheduleInterval,validateNpcScheduleUpdates,projectNpcScheduleLedger,
 validateNpcScheduleTransitions,npcMeetingFeasibility,npcScheduleBrief
} from '../public/npc-schedule.mjs';
import {parseScenePackage,packSceneNote,readSceneNote} from '../public/continuity.mjs';
import {projectWorldDepth,validateDepthDelta} from '../public/world-depth.mjs';
import {activeLineage} from '../public/world-ledger.mjs';
import {sceneDirectorBrief,sceneDirectorGuidance} from '../public/scene-director.mjs';
import {auditNarrativeScene} from '../public/narrative-audit.mjs';

const dialogue='Пэнси сказала: «Встретимся в пятницу у библиотеки в три». Лия согласилась.';
const appointment={
 id:'library-meet',action:'create',actor:'Пэнси',
 participants:['Пэнси','Лия'],start_at:'1998-09-05T15:00',end_at:'1998-09-05T16:00',
 location:'Библиотека',purpose:'Встреча подруг',state:'confirmed',
 reason:'Обе согласились на встречу',evidence:'Лия согласилась.'
};
const people=[
 {name:'Пэнси',state:{location:'Библиотека',health:'Здорова',goals:'Учиться'}},
 {name:'Лия',state:{location:'Библиотека',health:'Здорова',goals:'Поговорить'}},
 {name:'Гарри',state:{location:'Большой зал',health:'Здоров'}}
];
const scene=(id,parent,changes,world_time='1998-09-04T12:00')=>({
 id,parent_scene_id:parent,changes,world_time,body:dialogue
});

test('strict exact local timestamps: no fabricated day, hour, timezone, invalid dates or 8-day slot',()=>{
 assert.equal(validScheduleInterval('1998-09-05T15:00','1998-09-05T16:00'),true);
 assert.equal(validScheduleInterval('1998-09-05','1998-09-05'),false);
 assert.equal(validScheduleInterval('1998-02-29T15:00','1998-02-29T16:00'),false);
 assert.equal(validScheduleInterval('1998-09-05T15:00Z','1998-09-05T16:00Z'),false);
 assert.equal(validScheduleInterval('1998-09-05T16:00','1998-09-05T15:00'),false);
 assert.equal(validScheduleInterval('1998-09-05T15:00','1998-09-13T15:00'),false);
});

test('scheduling events are optional, quote-bound and cannot assign a third-party actor',()=>{
 assert.deepEqual(validateNpcScheduleUpdates(undefined,dialogue),[]);
 const tagged=validateNpcScheduleUpdates([appointment],dialogue);
 assert.equal(tagged[0].state,'confirmed');
 assert.equal(tagged[0].basis,'scene');
 assert.deepEqual(tagged[0].participants,['Пэнси','Лия']);
 assert.throws(()=>validateNpcScheduleUpdates([{...appointment,evidence:'Этого никто не говорил'}],dialogue),/дословно/);
 assert.throws(()=>validateNpcScheduleUpdates([{...appointment,actor:'Драко'}],dialogue),/участником/);
 assert.throws(()=>validateNpcScheduleUpdates([{...appointment,participants:['Лия','Лия']}],dialogue),/уникальными/);
 assert.throws(()=>validateNpcScheduleUpdates([{...appointment,state:'completed'}],dialogue),/tentative или confirmed/);
 assert.throws(()=>validateNpcScheduleUpdates([{...appointment,action:'reschedule',start_at:'1998-09'}],dialogue),/точный интервал/);
 assert.throws(()=>validateNpcScheduleUpdates([appointment,appointment],dialogue),/дважды/);
});

test('a confirmed offscreen event can ground a meeting change, but not another NPC action',()=>{
 const update={...appointment,basis:'offscreen',related_offscreen_id:'event-1',evidence:''};
 const valid=[{id:'event-1',actor:'Пэнси',basis:'simulated'}];
 assert.equal(validateNpcScheduleUpdates([update],'',valid)[0].related_offscreen_id,'event-1');
 assert.throws(()=>validateNpcScheduleUpdates([update],'',[{id:'event-1',actor:'Гарри'}]),/того же инициатора/);
 assert.throws(()=>validateNpcScheduleUpdates([update],'',[]),/npc_offscreen/);
});

test('tentative proposals do not double-book, but two confirmed overlapping commitments do',()=>{
 const first=validateNpcScheduleUpdates([appointment],dialogue);
 assert.equal(validateNpcScheduleTransitions({},first,people,'1998-09-04T12:00'),true);
 const second={...appointment,id:'extra-class',actor:'Лия',participants:['Лия'],
  start_at:'1998-09-05T15:30',end_at:'1998-09-05T16:30',purpose:'Личное занятие'};
 const both=validateNpcScheduleUpdates([appointment,second],dialogue);
 assert.throws(()=>validateNpcScheduleTransitions({},both,people,'1998-09-04T12:00'),/Двойная запись/);
 const tentative=validateNpcScheduleUpdates([{...appointment,state:'tentative'},second],dialogue);
 assert.equal(validateNpcScheduleTransitions({},tentative,people,'1998-09-04T12:00'),true);
});

test('confirming a tentative event still checks conflicts, cancelled or completed IDs never reopen',()=>{
 const a={...appointment,state:'tentative'};
 const d={npc_schedule_updates:[a,{...appointment,id:'lesson',actor:'Лия',participants:['Лия'],
  purpose:'Занятие',state:'confirmed'}]};
 assert.throws(()=>validateNpcScheduleTransitions(d,[{id:'library-meet',action:'confirm',actor:'Пэнси'}]),
  /Двойная запись/);
 const cleared={npc_schedule_updates:[appointment,{id:'library-meet',action:'cancel',actor:'Пэнси'}]};
 assert.throws(()=>validateNpcScheduleTransitions(cleared,[{id:'library-meet',action:'confirm',actor:'Пэнси'}]),
  /Завершённое/);
 assert.throws(()=>validateNpcScheduleTransitions(d,[{id:'unmade',action:'cancel',actor:'Пэнси'}]),
  /Нет доказанного расписания/);
});

test('no retrospective scheduling or premature completion; elapsed event not auto-completed',()=>{
 const note=validateNpcScheduleUpdates([appointment],dialogue);
 assert.throws(()=>validateNpcScheduleTransitions({},note,people,'1998-09-06T17:00'),/задним числом|истекшее/);
 const from={npc_schedule_updates:note};
 assert.throws(()=>validateNpcScheduleTransitions(from,
  [{id:'library-meet',action:'complete',actor:'Пэнси'}],people,'1998-09-04T17:00'),/будущем|ещё не наступила/);
 const report=npcScheduleBrief({depth:from,clock:'1998-09-06T18:00',complete:true});
 assert.equal(report.totals.past_unresolved,1);
 assert.equal(projectNpcScheduleLedger(from).events[0].state,'confirmed');
});

test('meeting feasibility blocks confirmed overlaps; an empty diary never guarantees freedom',()=>{
 const depth={npc_schedule_updates:[appointment]};
 const colliding=npcMeetingFeasibility({characters:people,depth,participants:['Лия'],
  start_at:'1998-09-05T15:30',end_at:'1998-09-05T16:00',
  location:'Библиотека',clock:'1998-09-04T12:00',complete:true});
 assert.equal(colliding.status,'blocked');
 assert.equal(colliding.blockers[0].code,'KNOWN_SCHEDULE_CONFLICT');
 const empty=npcMeetingFeasibility({characters:people,depth:{},participants:['Лия'],
  start_at:'1998-09-06T15:30',end_at:'1998-09-06T16:00',
  location:'Библиотека',clock:'1998-09-04T12:00',complete:true});
 assert.equal(empty.status,'possible_unconfirmed');
 assert.match(empty.disclaimer,/НЕ означает согласие/);
});

test('unknown travel and partial archive demand review; deceased characters block',()=>{
 const slot={start_at:'1998-09-06T15:30',end_at:'1998-09-06T16:00',location:'Библиотека'};
 const far=npcMeetingFeasibility({characters:people,depth:{},participants:['Гарри'],...slot,complete:true});
 assert.equal(far.status,'needs_review');
 assert.ok(far.reviews.some(x=>x.code==='TRAVEL_UNVERIFIED'));
 const unknown=npcMeetingFeasibility({characters:[],depth:{},participants:['Лия'],...slot,complete:false});
 assert.equal(unknown.status,'needs_review');
 assert.ok(unknown.reviews.some(x=>x.code==='INCOMPLETE_MEMORY'));
 const dead=npcMeetingFeasibility({characters:[{name:'Лия',state:{health:'Умерла'}}],
  depth:{},participants:['Лия'],...slot,complete:true});
 assert.equal(dead.status,'blocked');
 assert.ok(dead.blockers.some(x=>x.code==='DECEASED'));
});

test('invalidated meetings and their cancellations never leak into the actual branch',()=>{
 const root=scene('root',null,{npc_schedule_updates:validateNpcScheduleUpdates([appointment],dialogue)});
 const dead=scene('discarded','root',{npc_schedule_updates:validateNpcScheduleUpdates([
  {id:'library-meet',action:'cancel',actor:'Пэнси',reason:'Отменила',evidence:'Лия согласилась.'}
 ],dialogue)});
 const valid=scene('valid','root',{npc_plan_updates:[]});
 const actual=projectWorldDepth(activeLineage([root,dead,valid],'valid'));
 const deleted=projectWorldDepth(activeLineage([root,dead,valid],'discarded'));
 assert.equal(projectNpcScheduleLedger(actual).events[0].state,'confirmed');
 assert.equal(projectNpcScheduleLedger(deleted).events[0].state,'cancelled');
});

test('legacy scenes remain readable and old deep checkpoints lacking schedule records stay conservative',()=>{
 const raw={scene:dialogue,world_time:'1998-09-04T12:00',
  changes:{npc_schedule_updates:[appointment]}};
 const parsed=parseScenePackage(JSON.stringify(raw));
 assert.equal(parsed.changes.npc_schedule_updates[0].start_at,'1998-09-05T15:00');
 const packed=readSceneNote(packSceneNote(parsed.changes));
 assert.equal(packed.delta.npc_schedule_updates[0].id,'library-meet');
 assert.equal(validateDepthDelta(parsed.changes,dialogue).npc_schedule_updates.length,1);
 const audit=auditNarrativeScene({scene:dialogue,world_time:raw.world_time,changes:{
  npc_schedule_updates:[{...appointment,evidence:'Фальшивый текст'}]}});
 assert.ok(audit.issues.some(x=>x.code==='UNVERIFIED_PSYCHOLOGY_OR_OFFSCREEN'));
 const old=parseScenePackage(JSON.stringify({scene:'Урок окончен.',world_time:'1998-09',
  changes:{facts:['Они учились']}}));
 assert.deepEqual(old.changes.npc_schedule_updates,[]);
});

test('Scene Director reports commitments as review opportunities, never as automatic canon',()=>{
 const schedule=npcScheduleBrief({depth:{npc_schedule_updates:[appointment]},
  clock:'1998-09-05T15:00',complete:true});
 const brief=sceneDirectorBrief({clock:'1998-09-05T15:00',npcSchedule:schedule,complete:true});
 assert.ok(brief.opportunities.some(x=>x.id==='appointment:library-meet'&&x.status==='time_window_review'));
 assert.equal(brief.npc_schedule.totals.confirmed,1);
 assert.match(sceneDirectorGuidance(brief),/пустой календарь не доказывает свободу/);
});

test('MCP and hidden PWA wire schedules to full scene ancestry',()=>{
 const worker=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(worker,/name:'get_npc_meeting_feasibility'/);
 assert.match(worker,/validateNpcScheduleTransitions/);
 assert.match(worker,/npc_schedule:npcScheduleBrief/);
 assert.match(worker,/npcSchedule:assets\?\.npc_schedule/);
 assert.match(app,/npcScheduleBrief\(\{characters:characters\.characters,depth,clock,complete\}\)/);
 assert.match(app,/Договорённости и встречи/);
});
