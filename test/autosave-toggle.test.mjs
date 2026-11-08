import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {persistWorldAutosave,withAutosaveDeadline} from '../public/world-autosave.mjs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');

function dbClient(worlds,events=[]){
 return {from(table){
  assert.equal(table,'lw_worlds');
  let mode='read',changes=null,filters={};
  const builder={
   select(){return builder;},
   update(body){mode='update';changes=body;return builder;},
   eq(field,value){filters[field]=value;return builder;},
   async single(){
    const row=worlds.find(w=>w.id===filters.id&&w.owner_id===filters.owner_id);
    if(!row)return {data:null,error:new Error('No rows for authenticated owner')};
    if(mode==='update'){
     Object.assign(row,structuredClone(changes));
     events.push({kind:'update',id:row.id,fields:Object.keys(changes)});
    }else events.push({kind:'read',id:row.id});
    return {data:structuredClone(row),error:null};
   }
  };
  return builder;
 }};
}
const worlds=()=>[
 {id:'a',owner_id:'owner',genesis_choices:{hero_name:'Гарри Поттер',simulation_mode:'life'}},
 {id:'b',owner_id:'owner',genesis_choices:{hero_name:'Другой герой',simulation_mode:'off'}},
 {id:'stranger',owner_id:'different',genesis_choices:{auto_save_enabled:false}}
];

test('autosave is a real checkbox with native change event and a separate card, not a generic click button',()=>{
 const p=app.indexOf('function renderLibrary(){'),end=app.indexOf('function renderWorldContextMenu(){',p);
 const library=app.slice(p,end);
 assert.match(library,/data-action="open-world"/);
 assert.match(library,/<\/button>\s*<div class="world-save-footer">/);
 assert.match(library,/<input id="autosave-/);
 assert.match(library,/type="checkbox" data-world-autosave=/);
 assert.match(library,/\$\{enabled\?'checked':''\}/);
 assert.match(library,/role="alert"/);
 assert.doesNotMatch(library,/data-action="world-auto-save-toggle"/);
 assert.match(app,/document\.addEventListener\('change',e=>\{\s*const checkbox=e\.target\?\.closest\?\.\('input\[data-world-autosave\]'\)/);
 assert.doesNotMatch(app,/case 'world-auto-save-toggle'/);
});
test('owner-scoped transaction preserves Genesis and does not affect any other world',async()=>{
 const rows=worlds(),events=[],client=dbClient(rows,events);
 const choices=await persistWorldAutosave({client,userId:'owner',worldId:'a',enabled:true});
 assert.equal(choices.auto_save_enabled,true);
 assert.equal(choices.hero_name,'Гарри Поттер');
 assert.equal(choices.simulation_mode,'life');
 assert.equal(rows[1].genesis_choices.auto_save_enabled,undefined);
 assert.equal(rows[2].genesis_choices.auto_save_enabled,false);
 assert.deepEqual(events.map(x=>x.kind),['read','update','read']);
 assert.deepEqual(events.filter(x=>x.kind==='update').map(x=>x.id),['a']);
 await persistWorldAutosave({client,userId:'owner',worldId:'a',enabled:false});
 assert.equal(rows[0].genesis_choices.auto_save_enabled,false);
});
test('wrong owner cannot change a world, nor fake a successful toggle',async()=>{
 const rows=worlds(),client=dbClient(rows);
 await assert.rejects(
  persistWorldAutosave({client,userId:'owner',worldId:'stranger',enabled:true}),
  /No rows/
 );
 assert.equal(rows[2].genesis_choices.auto_save_enabled,false);
});
test('mismatched readback rejects instead of showing success',async()=>{
 const rows=worlds();let count=0;const client={
  from(){
   let changed=false;
   return {
    select(){return this;},eq(){return this;},
    update(){changed=true;return this;},
    async single(){
     count++;
     if(changed)return {data:{id:'a'},error:null};
     return {data:{id:'a',owner_id:'owner',genesis_choices:{hero_name:'Гарри Поттер',auto_save_enabled:false}},error:null};
    }
   };
  }
 };
 await assert.rejects(persistWorldAutosave({client,userId:'owner',worldId:'a',enabled:true}),/не сохранил/);
 assert.equal(count,3);
});
test('changing a world switch bypasses the global busy lock and updates visible state',async()=>{
 const sourceStart=app.indexOf('async function updateWorldAutoSave(worldId,enabled){');
 const sourceEnd=app.indexOf('async function saveWorld(fields)',sourceStart);
 const handlerStart=app.indexOf("document.addEventListener('change',e=>{\n const checkbox=");
 const handlerEnd=app.indexOf("document.addEventListener('change',e=>{if(e.target?.id==='world-setup-source'",handlerStart);
 assert.ok(sourceStart>0&&sourceEnd>sourceStart&&handlerStart>sourceEnd&&handlerEnd>handlerStart);
 const source=app.slice(sourceStart,sourceEnd)+app.slice(handlerStart,handlerEnd);
 const rows=worlds(),events=[],client=dbClient(rows,events);
 let callback,renderCount=0;
 const state={user:{id:'owner'},client,worlds:rows.map(x=>structuredClone(x)),world:null,
  autoSavePendingWorldId:null,autoSaveErrors:{},busy:true};
 const sandbox={state,persistWorldAutosave,
  render(){renderCount++;},notify(){},errtext:e=>e.message,
  async loadWorlds(){state.worlds=rows.map(x=>structuredClone(x));},
  document:{addEventListener(event,cb){assert.equal(event,'change');callback=cb;}}
 };
 vm.runInNewContext(source,sandbox);
 const input={dataset:{worldAutosave:'a'},checked:true};
 callback({target:{closest(sel){assert.equal(sel,'input[data-world-autosave]');return input;}}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(rows[0].genesis_choices.auto_save_enabled,true);
 assert.equal(state.worlds[0].genesis_choices.auto_save_enabled,true);
 assert.equal(state.busy,true);
 assert.equal(state.autoSavePendingWorldId,null);
 assert.equal(renderCount>=2,true);
});
test('mobile control has a large touch target and visible pending/error styles',()=>{
 assert.match(style,/\.world-save-switch\{[^}]*min-height:64px/);
 assert.match(style,/\.world-save-checkbox\{[^}]*-webkit-appearance:none/);
 assert.match(style,/\.world-save-checkbox:checked/);
 assert.match(style,/\.world-save-error\{/);
});

test('network stalls produce an explicit timeout error rather than endless saving',async()=>{
 await assert.rejects(withAutosaveDeadline(new Promise(()=>{}),5),/Нет ответа Supabase/);
});
test('database failure becomes a persistent card error, even while generic actions are busy',async()=>{
 const sourceStart=app.indexOf('async function updateWorldAutoSave(worldId,enabled){');
 const sourceEnd=app.indexOf('async function saveWorld(fields)',sourceStart);
 const handlerStart=app.indexOf("document.addEventListener('change',e=>{\n const checkbox=");
 const handlerEnd=app.indexOf("document.addEventListener('change',e=>{if(e.target?.id==='world-setup-source'",handlerStart);
 const source=app.slice(sourceStart,sourceEnd)+app.slice(handlerStart,handlerEnd);
 const rows=worlds(),client=dbClient(rows);
 let callback,renders=0;
 const state={user:{id:'owner'},client,worlds:rows,world:null,autoSavePendingWorldId:null,autoSaveErrors:{},busy:true};
 const sandbox={state,
  async persistWorldAutosave(){throw Error('Запись запрещена политикой доступа');},
  render(){renders++;},notify(){},errtext:e=>e.message,
  async loadWorlds(){state.worlds=rows.map(x=>structuredClone(x));},
  document:{addEventListener(event,cb){assert.equal(event,'change');callback=cb;}}
 };
 vm.runInNewContext(source,sandbox);
 callback({target:{closest(){return {dataset:{worldAutosave:'a'},checked:true};}}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(state.autoSaveErrors.a,/Запись запрещена/);
 assert.equal(state.worlds[0].genesis_choices.auto_save_enabled,undefined);
 assert.equal(state.autoSavePendingWorldId,null);
 assert.ok(renders>=2);
});
