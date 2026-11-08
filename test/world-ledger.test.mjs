import test from 'node:test';
import assert from 'node:assert/strict';
import {activeLineage,projectCompanion,validateCompanionDelta,validateNextEvents,formatAmount} from '../public/world-ledger.mjs';
const changes=(economy=[],items=[],new_characters=[])=>({economy,items,new_characters});
const e=(id,action,account,amount,extra={})=>({id,action,account,amount,currency:'GALLEON',scale:0,reason:'Произошло в сцене',source:'Прямая фраза в диалоге',...extra});
const i=(id,action,item_id,extra={})=>({id,action,item_id,reason:'Сыгранный факт',source:'Прямая сцена',...extra});
const a={id:'a',parent_scene_id:null,world_time:'1998-09',changes:changes([e('pay1','opening','Гарри',1000)],[i('cloak','acquire','cloak01',{label:'Мантия',owner:'Гарри'})])};
const b={id:'b',parent_scene_id:'a',world_time:'1998-10',changes:changes([e('buycar','debit','Гарри',200)],[i('car','acquire','bentley01',{label:'Bentley',owner:'Гарри'})])};
const c={id:'c',parent_scene_id:'b',world_time:'1998-11',changes:changes([],[i('gift','gift','cloak01',{owner:'Гарри',recipient:'Гермиона'})])};
const invalidated={id:'oldtail',parent_scene_id:'b',world_time:'1998-11',changes:changes([e('bad','debit','Гарри',800)],[i('lost','destroy','cloak01')])};
test('branch divergence never leaks revoked purchases, gifts or expenses',()=>{
 const history=[a,b,c,invalidated];
 const active=activeLineage(history,c.id);
 assert.deepEqual(active.map(s=>s.id),['a','b','c']);
 const state=projectCompanion(active,{strict:true});
 assert.equal(state.accounts.find(x=>x.person==='Гарри').balance,800);
 assert.equal(state.items.find(x=>x.id==='cloak01').owner,'Гермиона');
 assert.equal(state.items.find(x=>x.id==='bentley01').owner,'Гарри');
 const changed=projectCompanion(activeLineage(history,invalidated.id),{strict:true});
 assert.equal(changed.accounts.find(x=>x.person==='Гарри').balance,0);
 assert.equal(changed.items.find(x=>x.id==='cloak01').exists,false);
});
test('unknown starting balance remains unknown after income and expenses',()=>{
 const p=projectCompanion([{id:'unknown',world_time:'1999-06',changes:changes([e('inherit','credit','Гарри',150000),e('buy','debit','Гарри',20000)])}],{strict:true});
 const wallet=p.accounts[0];
 assert.equal(wallet.known,false);assert.equal(wallet.balance,null);assert.equal(wallet.observed_delta,130000);
 assert.match(formatAmount(wallet),/неизвестно/);
});
test('gift transfers owner, loan only holder, return restores holder',()=>{
 const seq=[{id:'x',world_time:'1990-01',changes:changes([],[
  i('acq','acquire','book1',{label:'Старинная книга',owner:'Гарри'}),
  i('lend','loan','book1',{recipient:'Пэнси'}),
  i('return','return','book1',{recipient:'Гарри'}),
  i('give','gift','book1',{recipient:'Гермиона',owner:'Гарри'})
 ])}];
 const p=projectCompanion(seq,{strict:true});
 const book=p.items[0];assert.equal(book.owner,'Гермиона');assert.equal(book.holder,'Гермиона');assert.equal(book.history.length,4);
});
test('currency scale supports minor units and does not mix pounds and galleons',()=>{
 const p=projectCompanion([{id:'a',changes:changes([
 {id:'a',action:'opening',account:'Гарри',currency:'GBP',scale:2,amount:1299,reason:'Запись',source:'Сцена'},
 e('b','opening','Гарри',100)
 ])}],{strict:true});
 assert.equal(p.accounts.length,2);
 assert.match(formatAmount(p.accounts.find(a=>a.currency==='GBP')),/12,99 GBP/);
});
test('new NPCs exist only on valid branch',()=>{
 const npc={name:'Элис',description:'Соседка',causal_link:'Познакомилась на рынке',goals:'Найти работу',knowledge:'Знает только соседей'};
 const old={id:'old',parent_scene_id:'a',world_time:'1998-10',changes:changes([],[],[npc])};
 const p1=projectCompanion(activeLineage([a,b,old],'old'),{strict:true});
 const p2=projectCompanion(activeLineage([a,b,old],'b'),{strict:true});
 assert.equal(p1.new_characters.length,1);
 assert.equal(p2.new_characters.length,0);
});
test('unconfirmed, repeated and unaffordable transactions are rejected',()=>{
 assert.throws(()=>validateCompanionDelta({economy:[e('e1','credit','Гарри',10),e('e1','credit','Гарри',10)]}),/повторяется/);
 assert.throws(()=>validateCompanionDelta({economy:[{...e('e1','credit','Гарри',10),source:''}]}),/подтверждение/);
 assert.throws(()=>projectCompanion([a,{id:'overdraft',world_time:'1998-11',changes:changes([e('bad','debit','Гарри',1001)])}],{strict:true}),/Недостаточно/);
 assert.throws(()=>projectCompanion([{id:'a',changes:changes([],[i('bad','gift','absent',{recipient:'Гермиона'})])}],{strict:true}),/отсутствует/);
 assert.throws(()=>activeLineage([a], 'missing'),/отсутствует сцена/);
});
test('money transfers are balanced and source scene is recorded',()=>{
 const p=projectCompanion([
  {id:'a',world_time:'1998-10',changes:changes([e('g','opening','Гарри',120),e('h','opening','Лия',3)])},
  {id:'b',world_time:'1998-11',changes:changes([e('t','transfer','Гарри',20,{to:'Лия'})])}
 ],{strict:true});
 assert.equal(p.accounts.find(a=>a.person==='Гарри').balance,100);
 assert.equal(p.accounts.find(a=>a.person==='Лия').balance,23);
 assert.equal(p.audit.find(x=>x.id==='t').scene_id,'b');
});

test('explicit verified balance may be reconciled after unknown earlier expenses',()=>{
 const p=projectCompanion([
  {id:'first',world_time:'1998-09',changes:changes([e('earned','credit','Гарри',120),e('spent','debit','Гарри',25)])},
  {id:'bank',world_time:'1998-10',changes:changes([e('statement','reconcile','Гарри',240,{reason:'Выписка банка',source:'Банкир объявил остаток'})])},
  {id:'gift',world_time:'1998-11',changes:changes([e('gift','debit','Гарри',40)])}
 ],{strict:true});
 const a=p.accounts[0];
 assert.equal(a.known,true);
 assert.equal(a.balance,200);
 assert.equal(a.entries.length,4);
});

test('precommit validation catches overspending and gifts of nonexistent property',()=>{
 const current=projectCompanion([a,b],{strict:true});
 const over=changes([e('overspend','debit','Гарри',850)]);
 assert.throws(()=>validateNextEvents(current,over),/Недостаточно/);
 const nonexistent=changes([],[i('badgift','gift','missing-cloak',{owner:'Гарри',recipient:'Лия'})]);
 assert.throws(()=>validateNextEvents(current,nonexistent),/отсутствует/);
 assert.equal(validateNextEvents(current,changes([e('affordable','debit','Гарри',250)])).balances.find(x=>x.person==='Гарри').balance,550);
});
test('precommit blocks duplication of an existing NPC and item, and validates transfer custody',()=>{
 const current=projectCompanion([a,b],{strict:true});
 assert.throws(()=>validateNextEvents(current,changes([],[i('same','acquire','cloak01',{label:'Мантия',owner:'Гарри'})])),/уже был введён/);
 assert.throws(()=>validateNextEvents(current,changes([],[],[{name:'Рон',description:'Друг',causal_link:'Со школы',goals:'Играть',knowledge:'Знает школу'}]),[{name:'Рон'}]),/уже существует/);
 assert.equal(validateNextEvents(current,changes([],[i('loan','loan','cloak01',{holder:'Гарри',recipient:'Гермиона'})])).items.find(x=>x.id==='cloak01').holder,'Гермиона');
});
