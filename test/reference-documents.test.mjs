import test from 'node:test';
import assert from 'node:assert/strict';
import {docCategory,guessCategory,latestDocumentVersions,referenceManifest,findDocExcerpts,buildSourcePreflight,normalizedDocumentText,DOCUMENT_CONTENT_LIMIT,extractDocumentFile} from '../public/reference-documents.mjs';

test('document filename classification respects rules and stylistic examples',()=>{
 assert.equal(guessCategory('PROJECT_CORE_RULES_V1_7.docx'),'core_rules');
 assert.equal(guessCategory('PROJECT_ROSMAN_GLOSSARY_V2_1.docx'),'glossary');
 assert.equal(guessCategory('YEAR_DOCUMENT_Y1_1998-1999.docx'),'year_document');
 assert.equal(guessCategory('PROJECT_YEAR_ANCHORS_Y1_Y7.docx'),'year_anchors');
 assert.equal(guessCategory('HARRY_POTTER_START_MODEL.docx'),'character_start');
 assert.equal(guessCategory('PROJECT_CHARACTER_BASELINES_Y1.docx'),'character_baseline');
 assert.equal(guessCategory('пример_v2_цельная_сцена.docx'),'style_example');
 assert.equal(docCategory('core_rules').priority>docCategory('style_example').priority,true);
});
test('manifest uses newest revision and retains source hashes',()=>{
 const rows=[
 {id:'a',doc_key:'rules',revision:1,category:'core_rules',title:'Rules',sha256:'a'.repeat(64),content:'Old'},
 {id:'b',doc_key:'rules',revision:2,category:'core_rules',title:'Rules v2',sha256:'b'.repeat(64),content:'Current'},
 {id:'c',doc_key:'styles',revision:1,category:'style_example',title:'Style',sha256:'c'.repeat(64),content:'Example'}
 ];
 assert.equal(latestDocumentVersions(rows).length,2);
 const manifest=referenceManifest(rows);
 assert.equal(manifest.find(x=>x.doc_key==='rules').revision,2);
 assert.equal(manifest.find(x=>x.doc_key==='rules').sha256,'b'.repeat(64));
});
test('preflight always includes important rules, but never claims extracts are full documents',()=>{
 const docs=[
 {id:'r',doc_key:'rules',revision:1,category:'core_rules',title:'Правила',content:'Персонажи автономны. Знания только через канал.',sha256:'a'.repeat(64)},
 {id:'g',doc_key:'terms',revision:1,category:'glossary',title:'Имена',content:'Снегг, Макгонагалл, Азкабан.',sha256:'b'.repeat(64)},
 {id:'y',doc_key:'year1',revision:1,category:'year_document',title:'Первый год',content:'Гарри встретил Гермиону в Хогвартсе. Лия живёт с Гарри и ждёт его.',sha256:'c'.repeat(64)}
 ];
 const view=buildSourcePreflight(docs,{intent:'Гарри говорит с Гермионой',actors:['Гарри']});
 assert.equal(view.manifest.length,3);
 assert.ok(view.selected.some(x=>x.reference==='rules@1'&&x.complete===true));
 assert.ok(view.selected.some(x=>x.reference==='terms@1'&&x.complete===true));
 assert.ok(view.selected.some(x=>x.reference==='year1@1'&&x.complete===false));
 assert.match(view.completeness_note,/не доказывают отсутствие/);
});
test('lexical search returns bounded source excerpts with positions',()=>{
 const text='В начале Гарри не знает о тайне.\n'.repeat(100);
 const hits=findDocExcerpts(text,['тайне','нет такого'],{radius:100,max:2});
 assert.ok(hits.length<=2);
 assert.ok(hits.every(x=>x.text.length<=800));
 assert.ok(hits.some(x=>x.matched.includes('тайне')));
});
test('preserves Cyrillic and rejects empty/oversized source',()=>{
 assert.equal(normalizedDocumentText('  Июнь 1999\r\nЛия  '),'Июнь 1999\nЛия');
 assert.throws(()=>normalizedDocumentText('  '),/нет текста/);
 assert.throws(()=>normalizedDocumentText('A'.repeat(DOCUMENT_CONTENT_LIMIT+1)),/превышает/);
});
test('plain text import is local and does not need API key',async()=>{
 const file={name:'world.txt',size:20,text:async()=>'  Знания персонажей  '};
 assert.equal(await extractDocumentFile(file),'Знания персонажей');
 await assert.rejects(extractDocumentFile({name:'wrong.pdf',size:20}),/Поддерживаются/);
});

test('director calibrations are always supplied; style examples only shape relevant scenes',()=>{
 const docs=[
  {doc_key:'rules',revision:1,category:'core_rules',title:'Core',content:'Сыгранное выше канона',sha256:'a'.repeat(64)},
  {doc_key:'calibration',revision:1,category:'director_calibration',title:'Director',content:'Гарри шутит по-разному, не превращать в словесный тик.',sha256:'b'.repeat(64)},
  {doc_key:'style',revision:1,category:'style_example',title:'Example',content:'Пример цельной сцены со значимыми диалогами и переходами.',sha256:'c'.repeat(64)}
 ];
 const ordinary=buildSourcePreflight(docs,{intent:'Гарри изучает книгу'});
 assert.ok(ordinary.selected.some(x=>x.reference==='calibration@1'));
 assert.ok(!ordinary.selected.some(x=>x.reference==='style@1'));
 const relationships=buildSourcePreflight(docs,{intent:'Близость и разговор после ссоры'});
 const style=relationships.selected.find(x=>x.reference==='style@1');
 assert.equal(style.role,'Стилевой ориентир, не доказательство событий');
});
