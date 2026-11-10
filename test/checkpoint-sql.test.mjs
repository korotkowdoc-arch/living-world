import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/checkpoint_recovery.sql',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('SQL checkpoint recovery proves owner and active head ancestry, not chronological created_at',()=>{
 assert.match(sql,/create or replace function public\.lw_bridge_v4_since_checkpoint/);
 assert.match(sql,/v_owner uuid := auth\.uid\(\)/);
 assert.match(sql,/w\.owner_id=v_owner for share/);
 assert.match(sql,/b\.owner_id=v_owner for share/);
 assert.match(sql,/with recursive walk/);
 assert.match(sql,/w\.id<>p_anchor/);
 assert.match(sql,/v_anchor_depth is null/);
 assert.match(sql,/jsonb_build_object\(/);
 assert.match(sql,/v_head/);
 assert.doesNotMatch(sql,/delete\s+from\s+public\.lw_/i);
 assert.doesNotMatch(sql,/update\s+public\.lw_/i);
});
test('verified old-scene search includes ONLY active ancestry, with source clues',()=>{
 assert.match(sql,/create or replace function public\.lw_bridge_v4_search_active_scenes/);
 assert.doesNotMatch(sql,/^as \$(?!\$)\s*$/m);
 assert.doesNotMatch(sql,/^\$;\s*$/m);
 assert.match(sql,/with recursive ancestry/);
 assert.match(sql,/join ancestry/);
 assert.match(sql,/p_query/);
 assert.match(sql,/body_position/);
 assert.match(sql,/revoke all on function public\.lw_bridge_v4_search_active_scenes/);
 assert.match(bridge,/rpc\/lw_bridge_v4_search_active_scenes/);
});
test('bridge cryptographically signs generated checkpoints and verifies before replay',()=>{
 assert.match(bridge,/seal\(env,'checkpoint-attestation-v1'/);
 assert.match(bridge,/checkpoint_attestation/);
 assert.match(bridge,/unseal\(env,'checkpoint-attestation-v1'/);
 assert.match(bridge,/signed\.body_fingerprint!==await fingerprint\(JSON\.stringify\(canonical\)\)/);
 assert.match(bridge,/rpc\/lw_bridge_v4_since_checkpoint/);
 assert.match(bridge,/replayFromCheckpoint\(/);
 assert.match(bridge,/head_scene_id!==after\.head/);
});
test('document import consent remains owner-scoped and off by default',()=>{
 assert.match(bridge,/document_upload_enabled!==true/);
 assert.match(app,/toggle-document-import/);
 assert.match(app,/Импорт документов из ChatGPT/);
 assert.match(app,/genesis_choices:\{\.\.\.\(w\.genesis_choices\|\|\{\}\),document_upload_enabled:!enabled\}/);
 assert.doesNotMatch(sql,/document_upload_enabled/i);
});
