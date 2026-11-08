import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/reference_docs.sql',import.meta.url),'utf8');
test('reference documents migration has a complete active CREATE TRIGGER statement',()=>{
 assert.doesNotMatch(sql,/\\\\n/, 'SQL comments must use actual newlines, not literal backslash-n');
 const uncommented=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
 assert.match(uncommented,/create trigger lw_reference_docs_immutable before update on public\.lw_reference_docs\s+for each row execute function public\.lw_reference_docs_block_changes\(\);/i);
 assert.match(uncommented,/create table if not exists public\.lw_reference_docs/i);
 assert.match(uncommented,/create or replace view public\.lw_reference_doc_manifest/i);
});
test('reference library migration keeps authorized world ownership and does not delete existing scenes',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/);
 assert.doesNotMatch(sql,/drop table.*lw_(?:scenes|worlds|characters)/i);
});
