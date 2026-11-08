import {DOC_CATEGORIES,DOCUMENT_CONTENT_LIMIT,normalizedDocumentText} from './reference-documents.mjs';
export const WORLD_BACKUP_FORMAT='living-world-cloud-v1.0';
export const LEGACY_BACKUP_FORMAT='living-world-cloud-v0.3';
const hex=buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function backupSha256(content,subtle=globalThis.crypto?.subtle){
 if(!subtle)throw Error('Не удалось проверить резервную копию: SHA-256 недоступен.');
 return hex(await subtle.digest('SHA-256',new TextEncoder().encode(content)));
}
export async function sealWorldBackup(payload,subtle=globalThis.crypto?.subtle){
 const source={...payload,format:WORLD_BACKUP_FORMAT};
 delete source.integrity;
 return {...source,integrity:{algorithm:'sha256-json-v1',sha256:await backupSha256(JSON.stringify(source),subtle)}};
}
export async function validateWorldBackup(payload,subtle=globalThis.crypto?.subtle){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Резервная копия должна быть объектом.');
 const modern=payload.format===WORLD_BACKUP_FORMAT,legacy=payload.format===LEGACY_BACKUP_FORMAT;
 if(!modern&&!legacy)throw Error('Неподдерживаемый формат резервной копии.');
 if(!payload.world||!Array.isArray(payload.characters)||!Array.isArray(payload.branches)||!Array.isArray(payload.scenes))
  throw Error('В резервной копии отсутствует мир, ветки, сцены или персонажи.');
 if(modern){
  if(!payload.integrity||payload.integrity.algorithm!=='sha256-json-v1'||!/^[a-f0-9]{64}$/.test(payload.integrity.sha256))throw Error('У нового формата нет контрольной суммы архива.');
  const copy={...payload};delete copy.integrity;
  const actual=await backupSha256(JSON.stringify(copy),subtle);
  if(actual!==payload.integrity.sha256)throw Error('Контрольная сумма резервной копии не совпала. Архив повреждён или был изменён.');
 }
 const documents=modern?payload.documents:[];
 if(!Array.isArray(documents))throw Error('Новый формат должен содержать полный список редакций документов.');
 const kinds=new Set(DOC_CATEGORIES.map(c=>c.id)),keys=new Set();
 for(const doc of documents){
  if(!doc||typeof doc!=='object'||Array.isArray(doc))throw Error('Некорректный документ в резервной копии.');
  if(!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(doc.doc_key)||!kinds.has(doc.category)||!Number.isInteger(doc.revision)||doc.revision<1)
   throw Error('Некорректная редакция или категория документа.');
  if(typeof doc.title!=='string'||!doc.title||doc.title.length>250)throw Error('Неизвестное название документа.');
  const normalized=normalizedDocumentText(doc.content);
  if(normalized.length>DOCUMENT_CONTENT_LIMIT)throw Error('Документ слишком большой.');
  const key=doc.doc_key+'@'+doc.revision;
  if(keys.has(key))throw Error('В архиве повторяется редакция: '+key);
  keys.add(key);
  const digest=await backupSha256(normalized,subtle);
  if(digest!==doc.sha256)throw Error('Повреждён исходный документ '+doc.title+'.');
 }
 const branchIds=new Set(),sceneIds=new Set();
 for(const b of payload.branches){
  if(typeof b?.id!=='string'||branchIds.has(b.id))throw Error('В архиве некорректный или повторяющийся ID ветки.');
  branchIds.add(b.id);
 }
 for(const scene of payload.scenes){
  if(typeof scene?.id!=='string'||sceneIds.has(scene.id)||typeof scene.body!=='string'||typeof scene.world_time!=='string')
   throw Error('В архиве повторяющаяся или некорректная сцена.');
  sceneIds.add(scene.id);
 }
 for(const s of payload.scenes){
  if(!branchIds.has(s.branch_id)||s.parent_scene_id&&!sceneIds.has(s.parent_scene_id))
   throw Error('В архиве нарушена связь сцены с веткой или родительской сценой.');
 }
 for(const b of payload.branches){
  if(b.head_scene_id&&!sceneIds.has(b.head_scene_id))throw Error('Отсутствует последняя сцена одной из веток.');
  if(b.parent_branch_id&&!branchIds.has(b.parent_branch_id))throw Error('В архиве отсутствует родительская ветка.');
 }
 if(payload.world.active_branch_id&&!branchIds.has(payload.world.active_branch_id))throw Error('Действующая ветка отсутствует в архиве.');
 return {format:payload.format,legacy,documents,scenes:payload.scenes.length,branches:payload.branches.length,characters:payload.characters.length};
}
