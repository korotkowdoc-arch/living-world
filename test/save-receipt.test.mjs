import test from 'node:test';
import assert from 'node:assert/strict';
import {sameSceneRequest,savedSceneStatus} from '../public/save-receipt.mjs';
const row={
 id:'10000000-0000-4000-8000-000000000001',
 world_id:'10000000-0000-4000-8000-000000000002',
 branch_id:'10000000-0000-4000-8000-000000000003',
 parent_scene_id:null,
 body:'Гарри получил письмо и сохранил его.',
 world_time:'1995-07',
 prompt_note:'LW1:{"v":1,"delta":{"facts":["Получил письмо."]}}'
};
const request={request_id:row.id,world_id:row.world_id,branch_id:row.branch_id,expected_head:null,scene:row.body,world_time:row.world_time,prompt_note:row.prompt_note};
test('repeat of exact scene ID is successful and does not mutate world again',()=>{
 assert.equal(sameSceneRequest(row,request),true);
 assert.deepEqual(savedSceneStatus(row,request),{saved:true,already_saved:true,scene_id:row.id,branch_id:row.branch_id,world_time:row.world_time,parent_scene_id:null});
});
test('same request ID with altered scene, time, branch, parent, or resource delta is rejected',()=>{
 for(const changes of [
  {scene:'Иная сцена'},{world_time:'1995-08'},{branch_id:'other'},
  {expected_head:'parent'},{prompt_note:'LW1:{"v":1,"delta":{"facts":["Другая история"]}}'},
  {world_id:'another'}
 ]){
  assert.throws(()=>savedSceneStatus(row,{...request,...changes}),/ID сцены уже использован/);
 }
});
test('not yet saved is not mistaken for success',()=>{
 assert.equal(savedSceneStatus(null,request).saved,false);
});
