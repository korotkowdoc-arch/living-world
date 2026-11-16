import test from 'node:test';
import assert from 'node:assert/strict';
import {scenePackagePrompt,parseScenePackage} from '../public/continuity.mjs';
import {readFileSync} from 'node:fs';
test('copied GPT scene-packet prompt contains exactly one syntactically valid JSON example including deeper causal fields',()=>{
 const prompt=scenePackagePrompt('Напиши сцену.',{facts:[],open_threads:[],offscreen_events:[],characters:{}},'2010-10');
 const match=prompt.match(/Верни ТОЛЬКО один валидный JSON-объект без Markdown:\n(\{[\s\S]*\})\nУказанная/);
 assert.ok(match,'Unable to locate the complete JSON example');
 const obj=JSON.parse(match[1]);
 assert.equal(obj.world_time,'2010-10');
 assert.ok(Array.isArray(obj.changes.thread_updates));
 assert.equal(obj.changes.open_threads.length,0);
 for(const field of ['memories','psychology','relationships','recollections','npc_offscreen','npc_intentions','economy','items','characters'])
  assert.ok(Array.isArray(obj.changes[field]),field);
 assert.equal(obj.changes.psychology[0].certainty,'interpretation');
 assert.equal(obj.changes.npc_offscreen[0].basis,'simulated');
 assert.match(prompt,/дата.*NPC|npc_offscreen.*simulated/s);
 assert.ok(!match[1].includes(String.raw`\\n`),'Example must use real line breaks, not escaped literal newline text');
});

test('new scene packets reject old free-text unresolved note spam',()=>{
 assert.throws(()=>parseScenePackage(JSON.stringify({
  scene:'Гарри увидел знакомого.',world_time:'2015-04-02',
  changes:{open_threads:['Нужно узнать, почему он здесь.']}
 })),/Нельзя больше открывать свободные текстовые open_threads/);
 const ok=parseScenePackage(JSON.stringify({
  scene:'Гарри увидел знакомого.',world_time:'2015-04-02',
  changes:{facts:['Гарри увидел знакомого.'],thread_updates:[]}
 }));
 assert.equal(ok.changes.thread_updates.length,0);
});
test('interface distinguishes managed story arcs from legacy notes',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/Действующие арки/);
 assert.match(app,/Исторические заметки на разбор/);
 assert.match(app,/m\.counts\.tracked_active/);
});

test('both GPT prompt routes omit unresolved historical note spam but keep managed arcs',()=>{
 const old='Проверить токен из архива Morrow Vale';
 const prompt=scenePackagePrompt('Продолжай.',{
  facts:[],open_threads:[old],managed_threads:[{id:'y1-stone',
   title:'Философский камень',status:'active',summary:'Противник продолжает готовиться'}],
  offscreen_events:[],characters:{}
 },'2015-04-01');
 assert.ok(!prompt.includes(old));
 assert.match(prompt,/legacy_unreviewed_count/);
 assert.match(prompt,/y1-stone/);
 const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 assert.match(bridge,/open_threads:\[\]/);
 assert.match(bridge,/managed_threads:\(memory\.managed_threads/);
 assert.match(bridge,/thread_updates/);
});
