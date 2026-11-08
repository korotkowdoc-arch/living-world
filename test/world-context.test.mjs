import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_LONG_PRESS_MS,WORLD_CLICK_SUPPRESS_MS,worldMenuPosition,suppressWorldOpen} from '../public/world-context.mjs';

test('right-click menu never extends past available viewport',()=>{
 assert.deepEqual(worldMenuPosition(100,200,900,700),{x:100,y:200});
 assert.deepEqual(worldMenuPosition(890,690,900,700),{x:672,y:584});
 assert.deepEqual(worldMenuPosition(-40,-40,900,700),{x:8,y:8});
 assert.deepEqual(worldMenuPosition(NaN,undefined,900,700),{x:8,y:8});
});
test('press-and-hold prevents ghost navigation after the menu opens',()=>{
 assert.ok(WORLD_LONG_PRESS_MS>=450&&WORLD_LONG_PRESS_MS<=800);
 assert.ok(WORLD_CLICK_SUPPRESS_MS>=WORLD_LONG_PRESS_MS);
 assert.equal(suppressWorldOpen(1900,1100),true);
 assert.equal(suppressWorldOpen(1900,1900),false);
 assert.equal(suppressWorldOpen(0,100),false);
});
