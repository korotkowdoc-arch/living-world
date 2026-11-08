import test from 'node:test';
import assert from 'node:assert/strict';
import {backupSha256,sealWorldBackup,validateWorldBackup,WORLD_BACKUP_FORMAT,LEGACY_BACKUP_FORMAT} from '../public/world-backup.mjs';

const scene={
 id:'scene1',branch_id:'branch1',parent_scene_id:null,body:'Гарри нашёл монету.',
 world_time:'1995-07',prompt_note:'LW1:{"v":1,"delta":{"economy":[{"id":"coin","amount":1}]}}'
};
const source={format:WORLD_BACKUP_FORMAT,world:{id:'world1',active_branch_id:'branch1',name:'Мир'},characters:[{name:'Гарри'}],
 branches:[{id:'branch1',head_scene_id:'scene1'}],scenes:[scene],documents:[]};

test('full world backup seals every scene, branch and source document',async()=>{
 const text='События только из сыгранной цепочки.';
 const sha256=await backupSha256(text);
 const full=await sealWorldBackup({...source,documents:[{doc_key:'rules',revision:1,category:'core_rules',title:'CORE RULES',content:text,sha256}]});
 const status=await validateWorldBackup(full);
 assert.equal(status.scenes,1);assert.equal(status.documents.length,1);
 assert.equal(full.integrity.algorithm,'sha256-json-v1');
 await assert.rejects(validateWorldBackup({...full,scenes:[{...scene,body:'Подменённая сцена'}]}),/Контрольная сумма/);
});
test('modifying a saved scene, branching or rules invalidates archive checksum',async()=>{
 const full=await sealWorldBackup(source);
 for(const corrupt of [
  {...full,scenes:[{...scene,body:'Другое прошлое'}]},
  {...full,branches:[{id:'branch1',head_scene_id:null}]},
  {...full,world:{...full.world,name:'Подмена'}},
  {...full,documents:[{doc_key:'new',revision:1,category:'core_rules',title:'Rule',content:'x',sha256:'0'.repeat(64)}]}
 ])await assert.rejects(validateWorldBackup(corrupt),/Контрольная сумма/);
});
test('missing scenes in archive are not quietly accepted',async()=>{
 const bad=await sealWorldBackup({...source,scenes:[]});
 await assert.rejects(validateWorldBackup(bad),/Отсутствует последняя сцена/);
});
test('older v0.3 backup can still be restored, without inventing missing documents',async()=>{
 const legacy={...source,format:LEGACY_BACKUP_FORMAT};delete legacy.documents;
 const state=await validateWorldBackup(legacy);
 assert.equal(state.legacy,true);assert.deepEqual(state.documents,[]);
});
test('different versions of one document are supported but duplicates are rejected',async()=>{
 const content='Версия правил';
 const sha256=await backupSha256(content);
 const doc={doc_key:'rules',revision:1,category:'core_rules',title:'Rules',content,sha256};
 const good=await sealWorldBackup({...source,documents:[doc,{...doc,revision:2}]});
 assert.equal((await validateWorldBackup(good)).documents.length,2);
 const dup=await sealWorldBackup({...source,documents:[doc,{...doc}]});
 await assert.rejects(validateWorldBackup(dup),/повторяется редакция/);
});
