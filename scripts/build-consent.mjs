import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const owner = process.env.BRIDGE_OWNER_USER_ID;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner || '')) {
  throw new Error('Set BRIDGE_OWNER_USER_ID to the UUID verified in Supabase Authentication.');
}
const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'dist-pages');
await rm(target, {recursive: true, force: true});
await mkdir(target, {recursive: true});
await cp(resolve(root, 'public'), target, {recursive: true});
const configFile = resolve(target, 'oauth', 'bridge-config.js');
const config = await readFile(configFile, 'utf8');
const placeholder = "export const BRIDGE_OWNER_USER_ID = '';";
if (!config.includes(placeholder)) throw new Error('The owner UUID placeholder is missing.');
await writeFile(configFile, config.replace(placeholder, `export const BRIDGE_OWNER_USER_ID = '${owner}';`));
console.log(`Built ${target}`);
