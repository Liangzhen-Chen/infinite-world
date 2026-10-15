// S0 度量一键产出：依次运行词汇表、import 图、派生黑名单、动作清单、意图语料、run-001 推演，打印各自基线数字。
// 用法：npm run metrics   （跳过较慢的推演：node tools/s0-metrics.mjs --fast）
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'..');
const steps=[
 ['词汇表','tools/ontology.mjs'],['import 图','tools/import-graph.mjs'],['派生黑名单','tools/derived-scan.mjs'],
 ['动作清单','tools/export-actions.mjs',['--check']],['意图语料','tools/intent-score.mjs'],
 ...(process.argv.includes('--fast')?[]:[['run-001 推演','tools/probe-score.mjs']]),
];
let failed=0;
for(const [name,file,args=[]]of steps){
 const r=spawnSync(process.execPath,[file,...args],{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024});
 const lines=(r.stdout??'').trim().split('\n').filter(l=>/^[a-z0-9-]+: /.test(l));
 console.log(`[${name}] ${r.status===0?'ok':'失败'}`);for(const l of lines)console.log(`  ${l}`);
 if(r.status!==0){failed++;if(r.stderr)console.log(r.stderr.trim().split('\n').slice(-5).map(l=>`  ${l}`).join('\n'));}
}
if(failed)process.exitCode=1;
