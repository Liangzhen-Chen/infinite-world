// run from a worktree root: node F:/dnd-tmp/bench-fp.mjs <days-per-step> <steps>
import path from 'node:path';import {pathToFileURL} from 'node:url';
const fx=await import(pathToFileURL(path.resolve('tests/farm-pests-fixture.mjs')).href);
const step=Number(process.argv[2]||30),n=Number(process.argv[3]||2);
const{c,run}=fx.setup('bench');let s=c;const t0=Date.now();
for(let i=0;i<n;i++)s=await fx.wait(run,s,step*1440,`b${i}`);
console.log(JSON.stringify({step,n,ms:Date.now()-t0}));
