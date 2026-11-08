import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateNewWorldSetup,latestReusableDocs,validateDeleteWorldName} from '../public/world-setup.mjs';

const source={id:'old-world',name:'Старый мир Гарри'};
const docs=[
 {doc_key:'rules',revision:1,category:'core_rules',title:'Правила'},
 {doc_key:'rules',revision:2,category:'core_rules',title:'Правила v2'},
 {doc_key:'glossary',revision:1,category:'glossary',title:'Имена'},
 {doc_key:'year-history',revision:1,category:'year_document',title:'Сыгранный Y1'},
 {doc_key:'hero',revision:1,category:'character_start',title:'Старый Гарри'},
 {doc_key:'checkpoint',revision:1,category:'checkpoint',title:'Июнь 1999'},
 {doc_key:'style',revision:1,category:'style_example',title:'Стилевой пример'}
];

test('new world requires source selection before any history is generated',()=>{
 const empty=validateNewWorldSetup({name:'Новый Гарри',genre:'Фэнтези',source_id:'',categories:[]},[source]);
 assert.equal(empty.source_id,null);
 assert.deepEqual(empty.categories,[]);
 const chosen=validateNewWorldSetup({name:'Новый Гарри',source_id:source.id,categories:['core_rules','glossary','style_example','year_document']},[source]);
 assert.deepEqual(chosen.categories,['core_rules','glossary','style_example']);
 assert.equal(chosen.source_id,'old-world');
});
test('cannot copy from nonexistent world or silently carry over played state',()=>{
 assert.throws(()=>validateNewWorldSetup({name:'Новая история',source_id:'another',categories:['core_rules']},[source]),/не найден/);
 assert.throws(()=>validateNewWorldSetup({name:'Новая история',source_id:source.id,categories:[]},[source]),/хотя бы один тип/);
 assert.throws(()=>validateNewWorldSetup({name:'',source_id:''},[source]),/Назови/);
 assert.throws(()=>validateNewWorldSetup({name:'Новый Гарри',source_id:'',categories:['core_rules']},[source]),/выбери мир/);
 const filtered=latestReusableDocs(docs,['core_rules','glossary','style_example','year_document','checkpoint','character_start']);
 assert.deepEqual(filtered.map(d=>d.doc_key),['glossary','rules','style']);
 assert.equal(filtered.find(d=>d.doc_key==='rules').revision,2);
});
test('deletion accepts only exact typed world name',()=>{
 assert.equal(validateDeleteWorldName('Прогон 7 - Гарри Поттер AU','Прогон 7 - Гарри Поттер AU'),true);
 assert.equal(validateDeleteWorldName('Прогон 7 - Гарри Поттер AU','Прогон 7'),false);
 assert.equal(validateDeleteWorldName('Прогон 7 - Гарри Поттер AU',null),false);
 assert.equal(validateDeleteWorldName('Прогон 7 - Гарри Поттер AU','Другой мир'),false);
});
test('supabase schema deletes owned world and cascades all existing world-bound content',()=>{
 const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
 const docsSchema=readFileSync(new URL('../supabase/reference_docs.sql',import.meta.url),'utf8');
 for(const table of ['lw_branches','lw_scenes','lw_characters']){
  assert.match(schema,new RegExp('create table if not exists public\\.'+table+' \\([\\s\\S]*?world_id uuid not null references public\\.lw_worlds\\(id\\) on delete cascade'));
 }
 assert.match(docsSchema,/world_id uuid not null references public\.lw_worlds\(id\) on delete cascade/);
 assert.match(schema,/create policy "lw_world_delete" on public\.lw_worlds for delete to authenticated using \(owner_id=\(select auth\.uid\(\)\)\)/);
 // Immutable reference docs must not block world deletion cascade.
 assert.match(docsSchema,/create trigger lw_reference_docs_immutable before update on public\.lw_reference_docs/);
 assert.doesNotMatch(docsSchema,/create trigger lw_reference_docs_immutable before update or delete/);
});
