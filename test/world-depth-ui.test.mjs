import test from 'node:test';
import assert from 'node:assert/strict';
import {renderWorldDepthView,renderBranchComparisonView} from '../public/world-depth-ui.mjs';
const entry={id:'psy',aspect:'inner_conflict',observation:'Сердится, но хочет помочь',
 certainty:'interpretation',scene_id:'scene-1',world_time:'2011-03'};
const depth={scanned_scenes:3,
 psychology:[{name:'Гарри',aspects:{inner_conflict:entry},observations:[entry],latest_emotions:[]}],
 relationships:[{from:'Гарри',to:'Лия',dimensions:{trust:{id:'r',dimension:'trust',
  shift:'ambivalent',rationale:'Помнит обещание',interpretation:'interpretation',
  scene_id:'scene-2',world_time:'2011-04'}},history:[],conflicts:[]}],
 recollections:[{actor:'Гарри',memory_id:'joke-1',meaning:'Книга уже не смешная',
  certainty:'interpretation',scene_id:'scene-2',world_time:'2011-04'}],
 confirmed_offscreen:[],npc_intentions:[{actor:'Лия',plan:'Поговорить на выходных',
 motive:'Есть свои дела',scene_id:'scene-3',world_time:'2011-05'}]};
test('deep world memory UI links reactions and source scenes without scoring emotions numerically',()=>{
 const html=renderWorldDepthView(depth);
 assert.match(html,/Гарри/);
 assert.match(html,/Лия/);
 assert.match(html,/Интерпретация/);
 assert.match(html,/scene-1/);
 assert.match(html,/Направленные отношения/);
 assert.match(html,/намерения \(не произошедшие события\)/);
 assert.match(html,/get_world_depth|depth-copy-retro|depth-copy-npc/);
});
test('depth memory UI filters and escapes actor-controlled content',()=>{
 const html=renderWorldDepthView({...depth,psychology:[{name:'<script>alert(1)</script>',
  aspects:{trait:{...entry,observation:'<img src=x onerror=alert(1)>'}}}]});
 assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(html,/<img src=/);
 assert.match(html,/&lt;script&gt;/);
 const filtered=renderWorldDepthView(depth,{query:'снежный'});
 assert.doesNotMatch(filtered,/Сердится, но хочет помочь/);
});
test('fork diff keeps invalidated promises and new knowledge separated',()=>{
 const html=renderBranchComparisonView({
  common_prefix_scenes:3,fork_after_scene_id:'scene-3',
  previous_branch_tail:[{scene_id:'scene-old'}],current_branch_tail:[{scene_id:'scene-new'}],
  invalidated_facts:['Старая сделка'],new_facts:['Новая встреча'],
  relationship_changes:[{between:'Гарри → Лия',dimension:'trust',
   was:{shift:'increased'},now:{shift:'ambivalent'}}],
  psychology_changes:[{actor:'Гарри',aspect:'trust',was:{observation:'Доверял'},
   now:{observation:'Сомневается'}}],
  open_threads_only_in_previous:[{text:'Старое обещание',opened_scene_id:'scene-old'}],
  open_threads_only_in_current:[{text:'Новое обещание',opened_scene_id:'scene-new'}],
  knowledge_only_in_previous:[{actor:'Лия',fact:'Старый секрет',scene_id:'scene-old'}],
  knowledge_only_in_current:[{actor:'Гарри',fact:'Новая правда',scene_id:'scene-new'}]
 });
 for(const x of ['scene-old','scene-new','Старое обещание','Новое обещание','Старый секрет','Новая правда'])assert.ok(html.includes(x));
 assert.match(html,/не переносятся автоматически/);
});
