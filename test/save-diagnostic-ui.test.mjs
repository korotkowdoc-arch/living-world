import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../bridge/index.js',import.meta.url),'utf8');

test('companion has one-click owner-authenticated disposable world diagnostic',()=>{
 assert.match(app,/run-save-diagnostic/);
 assert.match(app,/runSaveDiagnosticFromCompanion/);
 assert.match(app,/\/api\/diagnostics\/save-test/);
 assert.match(app,/state\.client\.auth\.getSession\(\)/);
 assert.match(app,/state\.saveDiagnostic=result/);
});
test('diagnostic route uses an explicit origin allowlist and owner verification',()=>{
 assert.match(server,/DIAGNOSTIC_ORIGIN='https:\/\/livingworld-35q\.pages\.dev'/);
 assert.match(server,/verifyBearer\(request,env,\{mcp:false\}\)/);
 assert.match(server,/runSaveDiagnostic\(env,identity\)/);
 assert.match(server,/if\(path==='\/api\/diagnostics\/save-test'\)/);
 assert.match(server,/temp(orary)?_world_removed/);
});
test('the technical smoke test exercises actual production save and cleans its own world',()=>{
 assert.match(server,/call\('save_scene_auto',args,env,identity\)/);
 assert.match(server,/companionState\(env,identity,worldId\)/);
 assert.match(server,/method:'DELETE',returnRepresentation:true/);
 assert.doesNotMatch(server,/id:'4aba8c0d-fc68-4387-8adf-c404538fb4f2'/);
});
