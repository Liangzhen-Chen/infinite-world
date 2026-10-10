import fs from 'node:fs/promises';
import {spawnSync}from'node:child_process';
const files=[['server-plugin/engine.mjs','server-plugin/compat/v2-phase1-engine.mjs'],
    ['server-plugin/activities.mjs','server-plugin/compat/v2-phase1-activities.mjs'],
    ['world/meta/rules.json','tests/fixtures/native-v2/rules.json']];
for(const [source,target]of files){
    const result=spawnSync('git',['show',`36f370f:${source}`],{encoding:'utf8'});
    if(result.status!==0)throw new Error(`无法取得已提交的阶段1版本：${source}`);
    let text=result.stdout;
    if(target.endsWith('engine.mjs'))text=text.replaceAll("from './storage.mjs'","from '../storage.mjs'")
        .replaceAll("from './retrieval.mjs'","from '../retrieval.mjs'").replace("from'./activities.mjs'","from'./v2-phase1-activities.mjs'");
    await fs.mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});await fs.writeFile(target,text);
}
