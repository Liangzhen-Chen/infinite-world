import fs from 'node:fs/promises';
import path from 'node:path';
import {loadRuntimeWorld}from'./load-world.mjs';
import {validateWorld}from'./validate-world.mjs';
import {digest,atomicJSON}from'../server-plugin/storage.mjs';
export async function buildWorld({stage='rules',source=null,destination='dist/world'}={}){
    const world=source??await loadRuntimeWorld(),validation=validateWorld(world,{stage});
    if(!validation.ok)throw new Error(`世界构建拒绝，${validation.errors.length}项错误：\n${validation.errors.join('\n')}`);
    const hash=digest(world);await fs.mkdir(destination,{recursive:true});
    await atomicJSON(path.join(destination,`${hash}.json`),world);
    await atomicJSON(path.join(destination,'manifest.json'),{format:1,stage,version:world.version,hash,counts:validation.counts});
    return {hash,...validation};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
    const flags=process.argv.slice(2),allowed=['--engine','--release','--final'];
    if(flags.length>1||flags.some(flag=>!allowed.includes(flag)))throw new Error('用法：build-world.mjs [--engine|--release|--final]');
    const stage=flags[0]?.slice(2)??'rules';console.log(JSON.stringify(await buildWorld({stage})));
    // K8 守门：只报不拦，打印三条计数并追加 logs/guard/history.jsonl，不影响构建结果与退出码
    await import('./k8-guard.mjs').then(m=>m.buildHook(path.resolve(import.meta.dirname,'..'))).catch(error=>console.log(`k8-guard: 跳过（${error.message}）`));
}
