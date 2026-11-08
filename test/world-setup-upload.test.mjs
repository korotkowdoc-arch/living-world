import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const extract=(begin,end)=>{
 const start=app.indexOf(begin),stop=app.indexOf(end,start+begin.length);
 assert.ok(start>=0&&stop>start,'Missing application section '+begin);
 return app.slice(start,stop);
};

test('new world wizard has two accessible buttons with independent source panels and upload picker',()=>{
 const ui=extract('function toggleWorldSetupDocPanel(mode){','function renderBuilder(){');
 assert.match(ui,/data-action="world-setup-toggle-copy"/);
 assert.match(ui,/Перенести документы из прошлого мира/);
 assert.match(ui,/data-action="world-setup-toggle-upload"/);
 assert.match(ui,/Загрузить документы/);
 assert.match(ui,/id="world-setup-copy-panel"[^>]*hidden/);
 assert.match(ui,/id="world-setup-upload-panel"[^>]*hidden/);
 assert.match(ui,/id="world-setup-upload-files" type="file" accept="\.docx,\.txt,\.md,\.markdown" multiple/);
 assert.match(ui,/aria-controls="world-setup-copy-panel"/);
 assert.match(ui,/aria-controls="world-setup-upload-panel"/);
 assert.match(ui,/aria-expanded="false"/);
 assert.match(ui,/Выбери перенос из другого мира LIVING WORLD, загрузку файлов или оба способа/);
 assert.match(css,/\.world-setup-doc-choices\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.world-setup-doc-panel\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:650px\)\{\.world-setup-doc-choices\{grid-template-columns:1fr\}/);
});

test('new-world handlers capture native File objects before asynchronous creation',()=>{
 const handler=extract('async function submitHandler(form){','document.addEventListener(\'change\',e=>{');
 assert.match(handler,/form\.id==='world-setup-form'/);
 assert.match(handler,/const copyEnabled=!document\.getElementById\('world-setup-copy-panel'\)\?\.hidden/);
 assert.match(handler,/const uploadEnabled=!document\.getElementById\('world-setup-upload-panel'\)\?\.hidden/);
 assert.match(handler,/Array\.from\(document\.getElementById\('world-setup-upload-files'\)\?\.files\|\|\[\]\)/);
 assert.match(handler,/await newWorld\(\{name:d\.name,genre:d\.genre,source_id:sourceId,categories\},uploadFiles\)/);
 const actions=extract('async function actionHandler(action,el){','async function submitHandler(form){');
 assert.match(actions,/case 'world-setup-toggle-copy':toggleWorldSetupDocPanel\('copy'\);return;/);
 assert.match(actions,/case 'world-setup-toggle-upload':toggleWorldSetupDocPanel\('upload'\);return;/);
 assert.match(app,/if\(e\.target\?\.id==='world-setup-upload-files'\)updateWorldSetupFilesSummary\(\)/);
});

function runCreation({uploaded=[{name:'PROJECT_CORE_RULES.docx'}],source=false,failParse=false,failSave=false}={}){
 const events=[],messages=[];
 const state={worlds:[],world:null,view:'world-setup',user:{id:'user-1'},documentsReady:true};
 const docs=[{doc_key:'core',revision:1,category:'core_rules',title:'Исходные правила',content:'original',sha256:'verified'}];
 state.client={
  from(table){
   const query={
    insert(value){events.push('insert:'+table);return query;},
    update(value){events.push('update:'+table);return query;},
    select(){return query;},eq(){return query;},in(){return query;},order(){return query;},
    async limit(){events.push('source-read');return {data:docs,error:null};},
    async single(){return {data:{id:table==='lw_worlds'?'new-world':'new-branch'},error:null};},
    then(success,fail){return Promise.resolve({data:null,error:null}).then(success,fail);}
   };
   return query;
  }
 };
 const ctx={
  state,Array,Error,console,
  async extractDocumentFile(file){events.push('parse:'+file.name);if(failParse)throw Error('Файл повреждён');return 'Проверенный текст: '+file.name;},
  async browserDocxParser(){events.push('docx-engine');return {};},
  guessCategory(name){return /CORE_RULES/i.test(name)?'core_rules':'world_lore';},
  validateNewWorldSetup(setup){events.push('validate');return {...setup,source_id:source?'old-world':null,categories:source?['core_rules']:[]};},
  latestReusableDocs(){events.push('source-validate');return docs;},
  async digestText(){return 'verified';},
  dataOrThrow(value){if(value.error)throw value.error;return value.data;},
  async loadWorlds(){events.push('refresh-worlds');},
  async openWorld(id){events.push('open-world');state.world={id};},
  async copyReusableDocuments(){events.push('copy-documents');return {copied:1,unchanged:0,errors:[]};},
  async insertDocument(doc){events.push('upload:'+doc.filename);if(failSave)throw Error('Supabase отклонил документ');return {skipped:false};},
  async loadDocuments(){events.push('refresh-documents');},
  render(){events.push('render:'+state.view);},
  notify(message,bad=false){messages.push({message,bad});},
  errtext(error){return error?.message||String(error)}
 };
 vm.runInNewContext(extract('async function prepareWorldSetupFiles(', 'async function deleteWorld('),ctx);
 return {ctx,events,messages,state,files:uploaded.map(f=>({...f,size:20}))};
}

test('uploads are validated before world creation, saved in Supabase before Genesis opens',async()=>{
 const h=runCreation({uploaded:[{name:'PROJECT_CORE_RULES.docx'},{name:'PROJECT_ROSMAN_GLOSSARY.md'}]});
 await h.ctx.newWorld({name:'Новый мир',genre:'Фэнтези'},h.files);
 assert.equal(h.state.view,'genesis');
 assert.ok(h.events.indexOf('parse:PROJECT_CORE_RULES.docx')<h.events.indexOf('insert:lw_worlds'));
 assert.ok(h.events.indexOf('parse:PROJECT_ROSMAN_GLOSSARY.md')<h.events.indexOf('insert:lw_worlds'));
 assert.ok(h.events.indexOf('upload:PROJECT_CORE_RULES.docx')<h.events.indexOf('render:genesis'));
 assert.ok(h.events.indexOf('upload:PROJECT_ROSMAN_GLOSSARY.md')<h.events.indexOf('render:genesis'));
 assert.equal(h.events.filter(x=>x==='refresh-documents').length,2);
 assert.match(h.messages[0].message,/Документы сохранены: 2/);
});

test('copy and upload may both be selected and happen before Genesis',async()=>{
 const h=runCreation({source:true});
 await h.ctx.newWorld({name:'Новый мир',genre:'Фэнтези',source_id:'old-world',categories:['core_rules']},h.files);
 assert.equal(h.state.view,'genesis');
 assert.ok(h.events.includes('source-read'));
 assert.ok(h.events.includes('source-validate'));
 assert.ok(h.events.indexOf('copy-documents')<h.events.indexOf('upload:PROJECT_CORE_RULES.docx'));
 assert.ok(h.events.indexOf('upload:PROJECT_CORE_RULES.docx')<h.events.indexOf('render:genesis'));
 assert.match(h.messages[0].message,/Документы сохранены: 2/);
});

test('bad source file never creates an empty world or writes any records',async()=>{
 const h=runCreation({failParse:true});
 await assert.rejects(h.ctx.newWorld({name:'Новый мир',genre:'Фэнтези'},h.files),/Файл повреждён/);
 assert.ok(!h.events.some(x=>x.startsWith('insert:')));
 assert.equal(h.state.view,'world-setup');
});

test('partial upload reports errors and stays in Documents instead of starting Genesis',async()=>{
 const h=runCreation({failSave:true});
 await h.ctx.newWorld({name:'Новый мир',genre:'Фэнтези'},h.files);
 assert.equal(h.state.view,'documents');
 assert.ok(h.events.includes('render:documents'));
 assert.ok(!h.events.includes('render:genesis'));
 assert.equal(h.messages[0].bad,true);
 assert.match(h.messages[0].message,/не все документы сохранены/);
});

test('rejects more than 12 files and unsupported formats before world creation',async()=>{
 const h=runCreation();
 await assert.rejects(h.ctx.newWorld({name:'Новый мир'},Array.from({length:13},(_,n)=>({name:n+'.txt'}))),/12 файлов/);
 await assert.rejects(h.ctx.newWorld({name:'Новый мир'},[{name:'rules.pdf'}]),/Неподдерживаемый файл/);
 assert.ok(!h.events.some(x=>x.startsWith('insert:')));
});
