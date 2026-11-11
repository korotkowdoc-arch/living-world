import test from 'node:test';
import assert from 'node:assert/strict';
import {scenePackagePrompt} from '../public/continuity.mjs';
test('copied GPT scene-packet prompt contains exactly one syntactically valid JSON example including deeper causal fields',()=>{
 const prompt=scenePackagePrompt('Напиши сцену.',{facts:[],open_threads:[],offscreen_events:[],characters:{}},'2010-10');
 const match=prompt.match(/Верни ТОЛЬКО один валидный JSON-объект без Markdown:\n(\{[\s\S]*\})\nУказанная/);
 assert.ok(match,'Unable to locate the complete JSON example');
 const obj=JSON.parse(match[1]);
 assert.equal(obj.world_time,'2010-10');
 for(const field of ['memories','psychology','relationships','recollections','npc_offscreen','npc_intentions','economy','items','characters'])
  assert.ok(Array.isArray(obj.changes[field]),field);
 assert.equal(obj.changes.psychology[0].certainty,'interpretation');
 assert.equal(obj.changes.npc_offscreen[0].basis,'narrated');
 assert.ok(!match[1].includes(String.raw`\\n`),'Example must use real line breaks, not escaped literal newline text');
});
