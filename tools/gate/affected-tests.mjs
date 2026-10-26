// usage: node F:/dnd-tools/affected-tests.mjs [base=master]   (run inside a worktree)
// Prints test files that transitively import any file changed vs base (plus changed test files).
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const base=process.argv[2]||'master';
// Committed changes vs base, plus uncommitted and untracked files (cards hand in uncommitted work).
const sh=cmd=>execSync(cmd,{encoding:'utf8'}).split('\n').filter(Boolean);
const changed=[...new Set([...sh(`git diff --name-only ${base}...HEAD`),...sh('git diff --name-only HEAD'),...sh('git ls-files --others --exclude-standard')])].map(f=>path.posix.normalize(f));
const roots=['server-plugin','tools','tests','world','compat'].filter(d=>fs.existsSync(d));
const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.posix.join(d,e.name);if(e.isDirectory()){if(e.name!=='node_modules'&&!e.name.startsWith('.'))walk(p);}else if(/\.(mjs|js)$/.test(e.name))files.push(p);}};roots.forEach(walk);
const importers=new Map();// target -> set(importer)
const re=/(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|readFileSync\([^)]*['"](\.{0,2}\/?[\w./-]+\.json)['"]/g;
for(const f of files){const src=fs.readFileSync(f,'utf8');for(const m of src.matchAll(re)){const spec=m[1]||m[2];if(!spec)continue;const t=path.posix.normalize(path.posix.join(path.posix.dirname(f),spec));if(!importers.has(t))importers.set(t,new Set());importers.get(t).add(f);}}
const seen=new Set(changed),queue=[...changed];
while(queue.length){const t=queue.pop();for(const i of importers.get(t)||[])if(!seen.has(i)){seen.add(i);queue.push(i);}}
// data/world changes: any test reading world/ via load-world is affected; include tests importing load-world when world/ changed
if(changed.some(f=>f.startsWith('world/')))for(const f of files)if(f.startsWith('tests/')&&/load-world|loadWorld/.test(fs.readFileSync(f,'utf8')))seen.add(f);
const tests=[...seen].filter(f=>/^tests\/.*\.test\.mjs$/.test(f)&&fs.existsSync(f)).sort();
console.log(tests.join('\n'));
