import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

function slice(start,end){
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'App section not found: '+start);
 return app.slice(a,b);
}

test('mobile bottom navigation fits exactly six actions in six columns',()=>{
 const nav=slice('function mobileNav(){','function renderApp(){');
 assert.equal([...nav.matchAll(/\['[^']+','[^']+','[^']+'\]/g)].length,6);
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(css,/\.mobilebar button\{[^}]*min-height:58px/);
 assert.match(css,/#toast\{pointer-events:none;/);
 assert.match(html,/id="activity" role="status"/);
 assert.match(sw,/living-world-v1\.5\.5-shell/);
});

test('Story, Assets and Memory expose live scene reload, without navigating away',()=>{
 const story=slice('function renderStory(){','function renderDocuments(){');
 assert.match(story,/btn\('story-reload','Перечитать сцены'\)/);
 const handlers=slice('async function actionHandler(action,el){','async function submitHandler(form){');
 assert.match(handlers,/case 'story-reload':await reloadSceneData\(\);return;/);
 assert.match(handlers,/case 'assets-reload':await reloadSceneData\(\);return;/);
 assert.match(handlers,/case 'memory-reload':await reloadSceneData\(\);return;/);
 assert.match(handlers,/case 'navigate':await openSection\(el\.dataset\.view\);return;/);
});

function mockStore(){
 const world={id:'world-a',active_branch_id:'branch-a',genesis_choices:{auto_save_enabled:true}};
 const branches=[{id:'branch-a',world_id:'world-a',head_scene_id:'scene-001'}];
 const scene={id:'scene-001',parent_scene_id:null,world_time:'1995-10',prompt_note:'structured'};
 const tables={lw_worlds:[world],lw_branches:branches,lw_scenes:[scene]};
 const reads=[];
 const client={
  from(table){
   let filters=[];
   const api={
    select(){return api;},
    eq(field,value){filters.push([field,value]);return api;},
    order(){return api;},
    range(from,to){
     const rows=tables[table].filter(row=>filters.every(([k,v])=>row[k]===v)).slice(from,to+1);
     return Promise.resolve({data:rows,error:null});
    },
    single(){
     const row=tables[table].find(row=>filters.every(([k,v])=>row[k]===v));
     reads.push(table);
     return Promise.resolve({data:row??null,error:row?null:Error('Missing row')});
    },
    then(ok,bad){
     reads.push(table);
     return Promise.resolve({data:tables[table].filter(row=>filters.every(([k,v])=>row[k]===v)),error:null}).then(ok,bad);
    }
   };
   return api;
  },
  async rpc(name,args){
   assert.equal(name,'lw_recent_scenes');
   assert.equal(args.p_branch_id,'branch-a');
   return {data:[scene],error:null};
  }
 };
 const state={client,world:{...world},branches:[{id:'branch-a',head_scene_id:null}],
  scenes:[],memoryScenes:[],recentLimit:40,assets:null,characters:[],
  characterLedger:null,causalLedger:null,assetIssue:null};
 const sandbox={
  state,
  dataOrThrow(r){if(r.error)throw r.error;return r.data;},
  activeLineage(rows,head){return rows.filter(row=>row.id===head);},
  readSceneNote(note){return note==='structured'?{delta:{items:[{id:'bun',label:'Булка'}],facts:['Гарри встретил Мэй']}}:null;},
  projectCompanion(rows,{getDelta}){return {scanned_scenes:rows.length,items:rows.flatMap(s=>getDelta(s).items||[]),new_characters:[],issues:[],audit:[]};},
  projectCharacterMemory(rows,lineage){return {scanned_scenes:lineage.length};},
  projectCausalMemory(rows,{getDelta}){return {counts:{facts:rows.flatMap(s=>getDelta(s).facts||[]).length}};}
 };
 vm.runInNewContext(slice('async function refreshWorldAndBranch(){','const SECTION_NAMES='),sandbox);
 return {state,reads,refresh:sandbox.refreshWorldAndBranch,loadScenes:sandbox.loadScenes,loadAssets:sandbox.loadAssets};
}

test('scene refresh reloads current head from database, not stale app snapshot',async()=>{
 const db=mockStore();
 await db.loadScenes();
 await db.loadAssets(false);
 assert.equal(db.state.branches[0].head_scene_id,'scene-001');
 assert.equal(db.state.scenes.length,1);
 assert.equal(db.state.assets.scanned_scenes,1);
 assert.equal(db.state.assets.items.length,1);
 assert.equal(db.state.causalLedger.counts.facts,1);
 assert.ok(db.reads.includes('lw_worlds'));
 assert.ok(db.reads.includes('lw_branches'));
});

test('Assets opened independently also reads the latest head',async()=>{
 const db=mockStore();
 assert.equal(db.state.branches[0].head_scene_id,null);
 await db.loadAssets();
 assert.equal(db.state.branches[0].head_scene_id,'scene-001');
 assert.equal(db.state.assets.items[0].label,'Булка');
});

test('busy clicks are explained, and requested navigation opens after in-flight work',async()=>{
 const notifications=[],visited=[];
 const state={busy:true,busyLabel:'Сохранение сцены',pendingView:null};
 const status={hidden:true,textContent:''};
 const ctx={state,document:{getElementById(){return status;}},
  notify(message,error=false){notifications.push({message,error});},
  async openSection(view){visited.push(view);},console};
 vm.runInNewContext(slice('function showActivity(message=', 'function dataOrThrow('),ctx);
 await ctx.withBusy(async()=>{throw Error('should not run')},'Открыть память','memory');
 assert.equal(state.pendingView,'memory');
 assert.equal(visited.length,0);
 assert.match(notifications[0].message,/после завершения/);
 state.busy=false;
 await ctx.withBusy(async()=>{},'Завершить действие');
 assert.equal(state.pendingView,null);
 assert.deepEqual(visited,['memory']);
 assert.equal(status.hidden,true);
 state.busy=true;
 await ctx.withBusy(async()=>{},'Повторное сохранение');
 assert.ok(notifications.some(n=>n.error&&n.message.includes('Повтори действие')));
});

test('all section routes read data before changing view, and scroll after entering',async()=>{
 const events=[];
 const state={view:'story',world:{id:'w'},scenes:[],assets:null,lastSceneRefreshAt:null,
  branches:[{id:'b',head_scene_id:null}],memoryScenes:[]};
 const ctx={state,Set,Date,
  async loadWorlds(){events.push('worlds');},
  async loadScenes(){events.push('scenes');},
  async loadAssets(){events.push('assets');},
  async loadDocuments(){events.push('docs');},
  render(){events.push('render:'+state.view);},
  window:{scrollTo(){events.push('scroll');}},
  notify(message){events.push('notify:'+message);}
 };
 vm.runInNewContext(slice('const SECTION_NAMES=','let mammothLoader=null;'),ctx);
 await ctx.openSection('assets');
 assert.deepEqual(events,['scenes','assets','render:assets','scroll']);
 events.length=0;
 await ctx.openSection('story');
 assert.deepEqual(events,['scenes','render:story','scroll']);
 await assert.rejects(ctx.openSection('wrong'),/Неизвестный раздел/);
 assert.equal(state.view,'story');
});

test('manual scene append refreshes external changes before writing',()=>{
 const fn=slice('async function appendScene(','async function switchBranch(');
 assert.match(fn,/await loadScenes\(\)/);
 assert.match(fn,/p_expected_head:branch\.head_scene_id\|\|null/);
});
