import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('autosave opens an in-app Yes/No dialog, not a blocked mobile native confirm',()=>{
 assert.match(app,/case 'toggle-auto-save':\{[\s\S]*?state\.modal=\{type:'enable-auto-save',worldId:w\.id,name:w\.name\}/);
 assert.match(app,/m\.type==='enable-auto-save'/);
 assert.match(app,/btn\('confirm-auto-save','Да, разрешить','gold'\)/);
 assert.match(app,/btn\('cancel-auto-save','Нет'\)/);
 assert.match(app,/case 'confirm-auto-save':/);
 assert.match(app,/case 'cancel-auto-save':state\.modal=null;render\(\);return;/);
 assert.doesNotMatch(app,/if\(!on&&!confirm\('Разрешить сохранение/);
});
test('autosave is persisted for current owner and verified from Supabase before reporting success',()=>{
 assert.match(app,/async function updateWorldAutoSave\(worldId,enabled\)/);
 assert.match(app,/\.select\('id,owner_id,genesis_choices'\)\.eq\('id',worldId\)\.eq\('owner_id',state\.user\.id\)/);
 assert.match(app,/const merged=\{\.\.\.\(before\.genesis_choices\|\|\{\}\),auto_save_enabled:enabled\}/);
 assert.match(app,/\.update\(\{genesis_choices:merged,updated_at:new Date\(\)\.toISOString\(\)\}\)/);
 assert.match(app,/check\?\.genesis_choices\?\.auto_save_enabled!==enabled/);
 assert.match(app,/state\.world=\{\.\.\.w,genesis_choices:check\.genesis_choices\}/);
 assert.match(app,/Автосохранение включено и проверено в Supabase/);
});
test('switching off is immediate and does not re-open the enable dialog',()=>{
 assert.match(app,/if\(!on\)\{[\s\S]*?state\.modal=\{type:'enable-auto-save'[\s\S]*?return;\s*\}\s*await updateWorldAutoSave\(w\.id,false\)/);
});
