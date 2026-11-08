/** Compare one immutable scene row with a retried MCP write.
 * The request_id is the scene primary key, so a lost network reply never
 * requires a second scene or another resource transaction.
 */
export function sameSceneRequest(row,request){
 if(!row||!request)return false;
 return row.id===request.request_id&&row.world_id===request.world_id&&
  row.branch_id===request.branch_id&&row.parent_scene_id===request.expected_head&&
  row.body===request.scene&&row.world_time===request.world_time&&
  row.prompt_note===request.prompt_note;
}
export function savedSceneStatus(row,request){
 if(!row)return {saved:false};
 if(!sameSceneRequest(row,request))throw Error('ID сцены уже использован для другого текста, времени или набора последствий. Не изменяй request_id при повторной попытке.');
 return {saved:true,already_saved:true,scene_id:row.id,branch_id:row.branch_id,
  world_time:row.world_time,parent_scene_id:row.parent_scene_id};
}
