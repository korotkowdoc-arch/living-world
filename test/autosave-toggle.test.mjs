import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');

test('each world card offers its own accessible autosave switch, outside the open-world button',()=>{
 const p=app.indexOf('function renderLibrary(){');
 const end=app.indexOf('function renderWorldContextMenu(){',p);
 const library=app.slice(p,end);
 assert.match(library,/const rows=state\.worlds\.map\(w=>/);
 assert.match(library,/w\.genesis_choices\?\.auto_save_enabled===true/);
 assert.match(library,/data-action="open-world"/);
 assert.match(library,/<\/button>\s*<div class="world-save-footer">/);
 assert.match(library,/role="switch"/);
 assert.match(library,/aria-checked="\$\{enabled\}"/);
 assert.match(library,/data-action="world-auto-save-toggle" data-id="\$\{x\(w\.id\)\}"/);
 assert.match(library,/Автосейв сцен/);
 assert.match(library,/Включён/);
 assert.match(library,/Выключен/);
 assert.match(library,/\$\{pending\?'disabled':''\}/);
});
test('card switch directly updates correct world without native confirm or changing active world',()=>{
 assert.match(app,/case 'world-auto-save-toggle':\{[\s\S]*?const worldId=el\.dataset\.id/);
 assert.match(app,/await updateWorldAutoSave\(worldId,world\.genesis_choices\?\.auto_save_enabled!==true\)/);
 const start=app.indexOf('async function updateWorldAutoSave(worldId,enabled)');
 const end=app.indexOf('async function saveWorld(fields)',start);
 const helper=app.slice(start,end);
 assert.ok(helper.length>0);
 assert.doesNotMatch(helper,/confirm\(/);
 assert.doesNotMatch(helper,/state\.world\.id!==worldId/);
 assert.match(helper,/state\.worlds\.find\(w=>w\.id===worldId\)/);
 assert.match(helper,/state\.autoSavePendingWorldId=worldId/);
 assert.match(helper,/state\.worlds=state\.worlds\.map\(w=>w\.id===worldId/);
 assert.match(helper,/if\(state\.world\?\.id===worldId\)/);
});
test('autosave change is written for the authenticated owner and read back from Supabase',()=>{
 assert.match(app,/\.select\('id,owner_id,genesis_choices'\)\.eq\('id',worldId\)\.eq\('owner_id',state\.user\.id\)/);
 assert.match(app,/const merged=\{\.\.\.\(before\.genesis_choices\|\|\{\}\),auto_save_enabled:enabled\}/);
 assert.match(app,/\.update\(\{genesis_choices:merged,updated_at:new Date\(\)\.toISOString\(\)\}\)/);
 assert.match(app,/check\.genesis_choices\?\.auto_save_enabled!==enabled/);
 assert.match(app,/автосейв '\+\(enabled\?'включён':'выключен'\)\+' — проверено в Supabase/);
});
test('global settings link to visible world switches rather than an opaque enable button',()=>{
 const start=app.indexOf('function renderSettings(){');
 const end=app.indexOf('function renderModal(){',start);
 const settings=app.slice(start,end);
 assert.match(settings,/goto-world-auto-save/);
 assert.doesNotMatch(settings,/\$\{btn\('toggle-auto-save'/);
 assert.match(app,/case 'goto-world-auto-save':await loadWorlds\(\);state\.view='library';render\(\);return/);
});
test('per-world autosave switch remains a usable 44px+ mobile target',()=>{
 assert.match(style,/\.world-save-switch\{/);
 assert.match(style,/min-height:60px/);
 assert.match(style,/\.world-save-switch:focus-visible/);
});
