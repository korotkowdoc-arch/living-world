import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAnchorCalendar,calendarDirectorBrief,validateCalendarUpdates,projectCalendarHistory} from '../public/calendar-director.mjs';
import {sceneDirectorBrief,sceneDirectorGuidance} from '../public/scene-director.mjs';
import {activeLineage} from '../public/world-ledger.mjs';
import {parseScenePackage,packSceneNote,readSceneNote} from '../public/continuity.mjs';
import {narrativePacingBrief} from '../public/narrative-pacing.mjs';
import {auditNarrativeScene} from '../public/narrative-audit.mjs';
import {scenePrompt} from '../public/logic.mjs';

const anchors='PROJECT YEAR ANCHORS V2.1\nY1: 1998–1999; Y2: 1999–2000\n'+
 'Окно | ID | Минимальный Event Anchor | Открыто / не закреплено\n'+
 '31 октября | Y1-06 | Тролль | Кто именно спасает, не назначено\n'+
 'Ноябрь | Y1-07 | Первый матч / угроза на метле | Итог не закреплён\n'+
 'Январь–февраль | Y1-09 | Николас Фламель | Не запускать финал\n'+
 '1–15 июня | Y1-12 | Финальный узел | Участники по AU\n'+
 'После финала, июнь | Y1-13 | Последствия | После сыгранного финала\n';
const srcs=[{category:'year_anchors',reference:'anchors@1',content:anchors}];
const row=(id,body,time,changes={},parent=null)=>({
 id,body,world_time:time,parent_scene_id:parent,changes
});
const beat=(domain,progress='advance',id='')=>({
 domain,progress,thread_id:id,evidence:'Открылась дверь.'
});

test('parser takes calendar windows only from an explicit source and preserves precision',()=>{
 const parsed=parseAnchorCalendar(srcs);
 assert.equal(parsed.anchors.length,5);
 const troll=parsed.anchors.find(a=>a.id==='Y1-06');
 assert.equal(troll.start,'1998-10-31');
 assert.equal(troll.end,'1998-10-31');
 assert.equal(troll.precision,'day');
 const winter=parsed.anchors.find(a=>a.id==='Y1-09');
 assert.equal(winter.start,'1999-01-01');
 assert.equal(winter.end,'1999-02-28');
 assert.equal(winter.precision,'month_range');
 const june=parsed.anchors.find(a=>a.id==='Y1-12');
 assert.equal(june.start,'1999-06-01');
 assert.equal(june.end,'1999-06-15');
 assert.equal(june.precision,'day_range');
 const after=parsed.anchors.find(a=>a.id==='Y1-13');
 assert.equal(after.precision,'relative');
 assert.equal(after.start,null);
 assert.equal(parseAnchorCalendar([{category:'year_anchors',reference:'x',content:'Октябрь Y1-06 Тролль'}]).anchors.length,0);
 assert.equal(parseAnchorCalendar([{category:'other',content:anchors}]).anchors.length,0);
});

test('half-month deadlines remain windows and relative follow-up needs a played predecessor',()=>{
 const parsed=parseAnchorCalendar([{category:'year_anchors',reference:'test@1',
  content:'Y1: 1998–1999\\nВторая половина июля 1998 | Y1-01 | Приглашение | Старт\\n'+
   'Январь–первая половина февраля | Y1-09 | Зимняя линия | Окно'}]);
 assert.equal(parsed.anchors.find(a=>a.id==='Y1-01').start,'1998-07-16');
 assert.equal(parsed.anchors.find(a=>a.id==='Y1-01').end,'1998-07-31');
 assert.equal(parsed.anchors.find(a=>a.id==='Y1-09').end,'1999-02-15');
 const before=calendarDirectorBrief({sources:srcs,clock:'1999-06-16',complete:true});
 assert.equal(before.review.some(x=>x.id==='Y1-13'),false);
 const after=calendarDirectorBrief({sources:srcs,clock:'1999-06-16',complete:true,
  recorded:[{id:'Y1-12',outcome:'occurred',scene_id:'x'}]});
 assert.ok(after.review.some(x=>x.id==='Y1-13'&&x.state==='dependency_ready'));
 const unavailable=calendarDirectorBrief({sources:srcs,clock:'1999-06-16',complete:true,
  recorded:[{id:'Y1-12',outcome:'unavailable',scene_id:'x'}]});
 assert.equal(unavailable.review.some(x=>x.id==='Y1-13'),false);
});

test('calendar review does not invent a played troll or impose a past missed anchor',()=>{
 const oct=calendarDirectorBrief({sources:srcs,clock:'1998-10-31',complete:true});
 assert.ok(oct.review.some(a=>a.id==='Y1-06'&&a.state==='window_review'));
 const november=calendarDirectorBrief({sources:srcs,clock:'1998-11-10',complete:true});
 assert.ok(november.review.some(a=>a.id==='Y1-06'&&a.state==='past_unconfirmed'));
 assert.ok(november.review.some(a=>a.id==='Y1-07'&&a.state==='window_review'));
 assert.ok(november.upcoming.some(a=>a.id==='Y1-09'));
 assert.equal(oct.review.some(a=>a.id==='Y1-13'),false);
 assert.match(november.rule,/нельзя разыгрывать задним числом/);
});

test('confirmed calendar updates are source-bound and branch-bound',()=>{
 const original=row('root','Открылась дверь.','1998-10-30',{},null);
 const invalid=row('discarded','Тролль появился в коридоре.','1998-10-31',{
  calendar_updates:[{id:'Y1-06',outcome:'occurred',reason:'Действительно появился',
   source_kind:'scene',evidence:'Тролль появился в коридоре.'}]
 },'root');
 const chosen=row('valid','Открылась дверь.','1998-10-31',{},'root');
 const old=calendarDirectorBrief({sources:srcs,scenes:activeLineage([original,invalid,chosen],'discarded'),
  clock:'1998-11-10',complete:true});
 assert.equal(old.review.some(a=>a.id==='Y1-06'),false);
 const live=calendarDirectorBrief({sources:srcs,scenes:activeLineage([original,invalid,chosen],'valid'),
  clock:'1998-11-10',complete:true});
 assert.ok(live.review.some(a=>a.id==='Y1-06'&&a.state==='past_unconfirmed'));
 assert.equal(projectCalendarHistory(activeLineage([original,invalid,chosen],'valid')).length,0);
});

test('calendar update is optional but requires a real event quote or on-screen offscreen event',()=>{
 assert.deepEqual(validateCalendarUpdates(undefined,'Открылась дверь.'),[]);
 const good=validateCalendarUpdates([{id:'Y1-06',outcome:'altered',
  reason:'Тролль был перенаправлен',evidence:'Открылась дверь.'}],'Открылась дверь.');
 assert.equal(good[0].source_kind,'scene');
 assert.throws(()=>validateCalendarUpdates([{...good[0],evidence:'Не было.'}],'Открылась дверь.'),/дословная/);
 assert.throws(()=>validateCalendarUpdates([{...good[0],outcome:'fixed'}],'Открылась дверь.'),/outcome/);
 assert.throws(()=>validateCalendarUpdates([{...good[0],source_kind:'offscreen',source_ref:'missing'}],'Открылась дверь.',[]),/npc_offscreen/);
 assert.equal(validateCalendarUpdates([{id:'Y1-06',outcome:'altered',reason:'Тролль изменил маршрут',
  source_kind:'offscreen',source_ref:'npc-day'}],'', [{id:'npc-day'}])[0].source_ref,'npc-day');
});

test('a saved calendar update is retained in the causal note and audited',()=>{
 const raw={scene:'Тролль появился в коридоре.',world_time:'1998-10-31',changes:{
  calendar_updates:[{id:'Y1-06',outcome:'occurred',reason:'Состоялся кризис',
   evidence:'Тролль появился в коридоре.'}]}};
 const packet=parseScenePackage(JSON.stringify(raw));
 assert.equal(packet.changes.calendar_updates[0].id,'Y1-06');
 assert.deepEqual(readSceneNote(packSceneNote(packet.changes)).delta.calendar_updates,packet.changes.calendar_updates);
 const audit=auditNarrativeScene({scene:raw.scene,world_time:raw.world_time,changes:{
  calendar_updates:[{...packet.changes.calendar_updates[0],evidence:'Ложная цитата'}]}});
 assert.ok(audit.issues.some(x=>x.code==='INVALID_CALENDAR_UPDATE'));
});

test('Scene Director V2 reviews 30-scene investigation loop without forcing a romance or a book outcome',()=>{
 const scenes=[];
 for(let i=0;i<30;i++)scenes.push(row('s'+i,
  'Открылась дверь.',i<27?'1998-10-30':'1998-10-31',
  {narrative_beats:[beat('investigation','stall','hotel-records')]},
  i?'s'+(i-1):null));
 const pacing=narrativePacingBrief(scenes,{window:12,complete:true});
 const calendar=calendarDirectorBrief({sources:srcs,scenes,clock:'1998-10-31',complete:true});
 const director=sceneDirectorBrief({world:{name:'Тестовый AU-мир'},
  clock:'1998-10-31',scenes,pacing,calendar,complete:true,
  causalMemory:{managed_threads:[{id:'hotel-records',kind:'background',
   title:'Старая гостиница',status:'active',last_scene_id:'s29'}]}});
 assert.equal(director.calendar.review.some(x=>x.id==='Y1-06'),true);
 assert.ok(director.opportunities.some(x=>x.id==='thread:hotel-records'&&x.status==='needs_independent_cause'));
 assert.ok(director.opportunities.some(x=>x.id==='relationship-attention'&&x.status==='consider_only'));
 assert.ok(director.opportunities.some(x=>x.id==='calendar:Y1-06'&&x.status==='date_review'));
 assert.ok(director.warnings.some(x=>x.includes('30')||x.includes('12')));
 assert.ok(director.selection_policy.includes('Нет числовых весов'));
 const guidance=sceneDirectorGuidance(director);
 assert.match(guidance,/Не создавай новую бумажку/);
 assert.match(guidance,/не обязателен|не обязательное|не назначают/);
 const prompt=scenePrompt({name:'Тест',genre:'AU',timeline:anchors},[],scenes,'story','', 'normal',pacing,director);
 assert.match(prompt,/SCENE DIRECTOR V2/);
 assert.match(prompt,/Y1-06/);
 const completeDirector=sceneDirectorBrief({world:{name:'Новый пустой мир'},clock:'1998-10',complete:false});
 assert.equal(completeDirector.calendar.source_ready,false);
 assert.equal(completeDirector.opportunities.some(o=>o.id==='calendar:Y1-06'),false);
});

test('Bridge declares a read-only director tool and does not call OpenAI in its director code',()=>{
 const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 assert.match(bridge,/name:'get_scene_director'/);
 assert.match(bridge,/if\(name==='get_scene_director'\)/);
 assert.match(bridge,/calendar_updates=validateCalendarUpdates/);
 assert.match(bridge,/scene_director:director,scene_director_guidance/);
 assert.match(bridge,/anchor_calendar:anchorCalendar/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/function uiSceneDirector/);
 assert.match(app,/data-action=\"director-copy\"|btn\('director-copy'/);
 assert.match(app,/<details class=\"panel\"/);
});
