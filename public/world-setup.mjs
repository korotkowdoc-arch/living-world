import {REUSABLE_SOURCE_CATEGORIES} from './reference-documents.mjs';

/** World creation must select sources before saving or generating any story. */
export function validateNewWorldSetup(input={},existingWorlds=[]){
 const name=String(input.name||'').trim().slice(0,140);
 if(!name)throw Error('Назови новую вселенную перед началом.');
 const genre=String(input.genre||'Фэнтези').trim().slice(0,100)||'Фэнтези';
 const sourceId=String(input.source_id||'').trim();
 const source=sourceId?existingWorlds.find(w=>w.id===sourceId):null;
 if(sourceId&&!source)throw Error('Мир-источник не найден среди твоих вселенных.');
 const selected=Array.isArray(input.categories)?input.categories:[];
 const categories=[...new Set(selected)].filter(c=>REUSABLE_SOURCE_CATEGORIES.includes(c));
 if(sourceId&&!categories.length)throw Error('Выбери хотя бы один тип документов для переноса либо отключи перенос.');
 if(!sourceId&&selected.length)throw Error('Для переноса документов сначала выбери мир-источник.');
 return {name,genre,source_id:sourceId||null,categories:sourceId?categories:[]};
}
export function latestReusableDocs(records=[],categories=[]){
 const allow=new Set(categories.filter(c=>REUSABLE_SOURCE_CATEGORIES.includes(c)));
 const latest=new Map();
 for(const d of records){
  if(!d||!allow.has(d.category)||!d.doc_key||!Number.isInteger(d.revision))continue;
  const current=latest.get(d.doc_key);
  if(!current||d.revision>current.revision)latest.set(d.doc_key,d);
 }
 return [...latest.values()].sort((a,b)=>String(a.title).localeCompare(String(b.title),'ru'));
}
export function validateDeleteWorldName(actual,typed){
 return typeof actual==='string'&&typeof typed==='string'&&actual.length>0&&typed.trim()===actual;
}
