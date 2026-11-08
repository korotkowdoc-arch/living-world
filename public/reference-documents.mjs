/** Document library: immutable revisions, source hierarchy and plain-text lexical retrieval.
 * Document content is treated as world evidence, never as executable instructions.
 */
export const DOC_CATEGORIES=Object.freeze([
 {id:'core_rules',label:'Законы и приоритеты мира',priority:100,order:0},
 {id:'glossary',label:'Глоссарий и терминология',priority:90,order:1},
 {id:'director_calibration',label:'Режиссёрские калибровки',priority:88,order:2},
 {id:'year_document',label:'Завершённые игровые годы',priority:80,order:3},
 {id:'checkpoint',label:'Текущее состояние / checkpoint',priority:78,order:4},
 {id:'character_start',label:'Стартовая модель героя',priority:60,order:5},
 {id:'character_baseline',label:'Стартовые модели NPC',priority:55,order:6},
 {id:'year_anchors',label:'Календарные и причинные ориентиры',priority:45,order:7},
 {id:'world_lore',label:'Дополнительные материалы мира',priority:40,order:8},
 {id:'style_example',label:'Стилистические примеры',priority:35,order:9},
 {id:'other',label:'Другое',priority:20,order:10}
]);
export const DOCUMENT_CONTENT_LIMIT=750000;
export function docCategory(category){
 return DOC_CATEGORIES.find(x=>x.id===category)||DOC_CATEGORIES.at(-1);
}
export function guessCategory(filename=''){
 const n=filename.toLowerCase().normalize('NFKD');
 if(/core.rules|основн.*правил/.test(n))return 'core_rules';
 if(/rosman|glossary|глоссар/.test(n))return 'glossary';
 if(/director|калибров|режиссёр|режиссер/.test(n))return 'director_calibration';
 if(/year.document|year_document|итог.*год/.test(n))return 'year_document';
 if(/checkpoint|стоп.кадр/.test(n))return 'checkpoint';
 if(/start.model|start_model/.test(n))return 'character_start';
 if(/baseline/.test(n))return 'character_baseline';
 if(/anchors|якор/.test(n))return 'year_anchors';
 if(/пример|example|стил/.test(n))return 'style_example';
 return 'world_lore';
}
export function normalizedDocumentText(raw){
 if(typeof raw!=='string')throw Error('Документ должен содержать текст.');
 const out=raw.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();
 if(!out)throw Error('В документе нет текста.');
 if(out.length>DOCUMENT_CONTENT_LIMIT)throw Error('Документ превышает 750 000 символов. Раздели его на самостоятельные части.');
 return out;
}
export function latestDocumentVersions(rows=[]){
 const latest=new Map();
 for(const row of rows){
  if(!row||typeof row.doc_key!=='string'||!Number.isInteger(row.revision))continue;
  const previous=latest.get(row.doc_key);
  if(!previous||row.revision>previous.revision)latest.set(row.doc_key,row);
 }
 return [...latest.values()].sort((a,b)=>docCategory(b.category).priority-docCategory(a.category).priority||a.title.localeCompare(b.title,'ru'));
}
export function citationId(doc){return doc.doc_key+'@'+doc.revision;}
const normalize=v=>String(v||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
export function findDocExcerpts(content,needles,{radius=600,max=5}={}){
 const text=normalizedDocumentText(content);
 const queries=[...new Set((needles||[]).map(normalize).filter(x=>x.length>=3))].slice(0,25);
 if(!queries.length)return [];
 const search=normalize(text),ranges=[];
 for(const q of queries){
  let from=0;
  for(let count=0;count<8;count++){
   const at=search.indexOf(q,from);if(at===-1)break;
   ranges.push({start:Math.max(0,at-radius),end:Math.min(text.length,at+q.length+radius),query:q});
   from=at+q.length;
  }
 }
 ranges.sort((a,b)=>a.start-b.start);
 const merged=[];
 for(const r of ranges){
  const last=merged.at(-1);
  if(last&&r.start<=last.end+120){last.end=Math.max(last.end,r.end);last.queries.add(r.query);}
  else merged.push({start:r.start,end:r.end,queries:new Set([r.query])});
 }
 return merged.sort((a,b)=>b.queries.size-a.queries.size||a.start-b.start).slice(0,max).map(r=>({
   start:r.start,end:r.end,text:(r.start?'…':'')+text.slice(r.start,r.end)+(r.end<text.length?'…':''),
   matched:[...r.queries]
 }));
}
export function referenceManifest(rows=[]){
 return latestDocumentVersions(rows).map(row=>({
  id:row.id,doc_key:row.doc_key,revision:row.revision,category:row.category,title:row.title,
  sha256:row.sha256,content_length:row.content_length??row.content?.length??null,
  priority:docCategory(row.category).priority
 }));
}
export function buildSourcePreflight(rows=[],{intent='',actors=[],maxExcerptChars=20000}={}){
 const manifest=referenceManifest(rows);
 const entries=latestDocumentVersions(rows);
 const needles=[...new Set([
   ...(Array.isArray(actors)?actors:[]),
   ...normalize(intent).match(/[\p{L}\p{N}-]{4,}/gu)||[]
 ])].filter(x=>typeof x==='string'&&x.length>=4).slice(0,18);
 const selected=[],missingFull=[];
 let budget=maxExcerptChars;
 for(const doc of entries){
  const required=['core_rules','glossary'].includes(doc.category);
  const source=String(doc.content||'');
  const sourceSize=doc.content_length??source.length;
  if(required&&source){
    const slice=source.slice(0,Math.max(0,Math.min(budget,doc.category==='core_rules'?18000:14000)));
    if(slice){selected.push({reference:citationId(doc),category:doc.category,title:doc.title,full_text:slice,complete:slice.length===source.length});budget-=slice.length;}
    if(slice.length<sourceSize)missingFull.push(citationId(doc));
  }else if(source&&budget>1000){
    const extracts=findDocExcerpts(source,needles,{radius:380,max:2});
    if(extracts.length){
      const excerpt=extracts.map(x=>x.text).join('\n---\n').slice(0,Math.min(budget,3400));
      if(excerpt){selected.push({reference:citationId(doc),category:doc.category,title:doc.title,excerpts:excerpt,complete:false});budget-=excerpt.length;}
    }
  }
 }
 return {manifest,selected,full_text_required:[...new Set(missingFull)],lookup_method:'exact+lexical',
  completeness_note:'Короткие выдержки не доказывают отсутствие фактов. Если возникает спор, загрузи полный текст источника по doc_key и revision.'};
}
export async function digestText(text,cryptoSubtle=globalThis.crypto?.subtle){
 if(!cryptoSubtle)throw Error('В браузере недоступна криптографическая проверка документа.');
 const bytes=new TextEncoder().encode(normalizedDocumentText(text));
 const hash=await cryptoSubtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function extractDocumentFile(file,{mammoth}={}){
 if(!file||typeof file.name!=='string')throw Error('Выбери файл.');
 if(file.size>6*1024*1024)throw Error('Файл превышает 6 МБ. Раздели документ.');
 const extension=file.name.split('.').at(-1).toLowerCase();
 if(['txt','md','markdown'].includes(extension))return normalizedDocumentText(await file.text());
 if(extension==='docx'){
  if(!mammoth?.convertToHtml)throw Error('Для DOCX не загрузился локальный обработчик. Перезагрузи страницу.');
  const result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},{convertImage:()=>({})});
  // Parse DOM as text only; never insert untrusted converted HTML into the site.
  if(typeof DOMParser==='undefined')throw Error('Браузер не поддерживает чтение DOCX.');
  const parsed=new DOMParser().parseFromString(result.value,'text/html');
  const output=[];
  const parseNode=(node)=>{
   if(node.nodeType!==1)return;
   const tag=node.tagName.toLowerCase();
   if(tag==='table'){
    for(const tr of node.querySelectorAll('tr')){
     const cells=[...tr.children].filter(c=>c.matches('td,th')).map(c=>c.textContent.trim().replace(/\s+/g,' '));
     if(cells.length)output.push(cells.join(' | '));
    }
    output.push('');return;
   }
   if(['p','h1','h2','h3','h4','h5','h6','li','blockquote'].includes(tag)){
    const text=node.textContent.trim();
    if(text)output.push((/^h\d$/.test(tag)?'# '.repeat(Math.min(5,Number(tag.slice(1)))):'')+text);
    return;
   }
   for(const child of node.children)parseNode(child);
  };
  for(const child of parsed.body.children)parseNode(child);
  return normalizedDocumentText(output.join('\n\n'));
 }
 throw Error('Поддерживаются DOCX, TXT и Markdown. PDF нужно извлечь в текст отдельно.');
}