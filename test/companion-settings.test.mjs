import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {companionSettings,companionGuidance,mergeCompanionPreferences} from '../public/companion-settings.mjs';

const sceneId='11111111-1111-4111-8111-111111111111';
const world={model_story:'gpt-6',model_relationships:'gpt-5.6',
 genesis_choices:{auto_save_enabled:true,hero_name:'Гарри Поттер',simulation_mode:'skip'}};

test('defaults are stable, show live world settings and do not override subscription model',()=>{
 const config=companionSettings(world,sceneId,'2010-08-01T07:00:00');
 assert.equal(config.simulation_mode,'skip');
 assert.equal(config.auto_save_enabled,true);
 assert.equal(config.scene_mode,'story');
 assert.equal(config.scene_length,'large');
 assert.equal(config.simulation_span,'quarter');
 assert.equal(config.pending_decision,null);
 assert.match(companionGuidance(config).model_notice,/НЕ переключает модель/);
});

test('all scene settings survive Supabase JSON merge without losing autosave or Genesis',()=>{
 const choices=mergeCompanionPreferences(world.genesis_choices,{
  scene_mode:'relationship',scene_length:'detailed',simulation_span:'quarter',
  next_scene_time:'2010-08-02T08:00:00',
  director_note:'Учитывай конфликт без магического спасителя',
  pending_decision:{source_scene_id:sceneId,choice_id:'b',label:'Искать работу',description:'Спросить торговца'}
 });
 const cloud={...world,genesis_choices:choices};
 const cfg=companionSettings(cloud,sceneId,'2010-08-01T07:00:00');
 assert.equal(cfg.auto_save_enabled,true);
 assert.equal(choices.hero_name,'Гарри Поттер');
 assert.equal(cfg.scene_mode,'relationship');
 assert.equal(cfg.scene_length,'detailed');
 assert.equal(cfg.simulation_span,'quarter');
 assert.equal(cfg.next_scene_time,'2010-08-02T08:00:00');
 assert.equal(cfg.pending_decision.choice_id,'b');
 assert.match(companionGuidance(cfg).scene_emphasis,/психология/);
 assert.match(companionGuidance(cfg).player_choice,/Искать работу/);
 assert.match(companionGuidance(cfg).director_note,/конфликт/);
});

test('choices selected on iPhone cannot leak into a later head or fork',()=>{
 const choices=mergeCompanionPreferences(world.genesis_choices,{pending_decision:{
  source_scene_id:sceneId,choice_id:'a',label:'Попробовать',description:'Без гарантий'}});
 const later=companionSettings({...world,genesis_choices:choices},
  '22222222-2222-4222-8222-222222222222','2010-08-01T07:00:00');
 assert.equal(later.pending_decision,null);
 assert.equal(later.pending_decision_ignored,true);
 assert.match(companionGuidance(later).player_choice,/Нового подтверждённого выбора нет/);
});

test('stale or invalid clock is not forwarded as the next scene clock',()=>{
 const choices=mergeCompanionPreferences(world.genesis_choices,{next_scene_time:'2010-07-01T00:00:00'});
 const cfg=companionSettings({...world,genesis_choices:choices},sceneId,'2010-08-01T07:00:00');
 assert.equal(cfg.next_scene_time,null);
 assert.equal(cfg.next_scene_time_ignored,true);
});

test('rejects unsupported values instead of silently changing mode',()=>{
 assert.throws(()=>mergeCompanionPreferences({}, {scene_length:'infinite'}),/объём/);
 assert.throws(()=>mergeCompanionPreferences({}, {simulation_span:'decade'}),/шаг/);
 assert.throws(()=>mergeCompanionPreferences({}, {simulation_mode:'unknown'}),/режим симуляции/);
 assert.throws(()=>mergeCompanionPreferences({}, {pending_decision:{source_scene_id:'bad',choice_id:'a',label:'x'}}),/Решение/);
 assert.throws(()=>mergeCompanionPreferences({}, {secret:'x'}),/Неизвестный параметр/);
});

test('PWA syncs to Supabase; OAuth preflight and world state return those settings and choices',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
 assert.match(app,/async function persistCompanionSettings|function persistCompanionSettings/);
 assert.match(app,/\.from\('lw_worlds'\)\.select\('\*'\)/);
 assert.match(app,/mergeCompanionPreferences/); // serialized cloud merge rather than local-only mode
 assert.match(app,/await persistCompanionSettings\(\{scene_mode:mode\}\)/);
 assert.match(app,/await persistCompanionSettings\(\{pending_decision:/);
 assert.match(app,/await persistCompanionSettings\(\{simulation_mode:mode\}\)/);
 assert.match(app,/if\(e\.target\?\.id==='world-setup-upload-files'\)/);
 assert.match(bridge,/companion_settings:companionSettings\(base\.world/);
 assert.match(bridge,/companion_guidance:companionGuidance\(/);
 assert.match(bridge,/decisions:decisionSchema/);
 assert.match(bridge,/packSceneNote\(packet\.changes,'',packet\.decisions\)/);
});
