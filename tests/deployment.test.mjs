import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import{tmpRoot}from'../tools/tmp-root.mjs';
import {pathToFileURL}from'node:url';
import YAML from 'yaml';
import {prepareDeployment,activateDeployment}from'../tools/deploy-engine.mjs';
test('部署：冻结包校验在写入前执行，先备份，聊天和旧扩展保留',async t=>{
    const root=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-deploy-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const bundle=await prepareDeployment(path.join(root,'bundle')),installation=path.join(root,'install');
    assert.equal(bundle.files.some(file=>file.path.includes('tests/fixtures')),false);
    assert.equal(bundle.files.some(file=>file.path.includes('world/drafts/')),false);
    for(const name of ['core.js','seed.json'])assert.ok(bundle.files.some(file=>file.path===`plugin/server-plugin/legacy/${name}`));
    const packaged=await import(pathToFileURL(path.join(bundle.destination,'plugin/index.mjs')).href);
    await packaged.init({post(){},get(){}},{baseRoot:path.join(root,'campaigns')});
    await fs.mkdir(installation);await fs.writeFile(path.join(installation,'config.yaml'),'enableServerPlugins: false\nenableServerPluginsAutoUpdate: true\n');
    const extension=path.join(installation,'public/scripts/extensions/third-party/infinite-fields');await fs.mkdir(extension,{recursive:true});
    await fs.writeFile(path.join(extension,'index.js'),'legacy protected');
    let backedUp=false;const makeBackup=async()=>{assert.equal(YAML.parse(await fs.readFile(path.join(installation,'config.yaml'),'utf8')).enableServerPlugins,false);backedUp=true;return 'verified-test-backup';};
    const result=await activateDeployment(bundle.destination,{installation,makeBackup});
    assert.equal(backedUp,true);assert.equal(result.chatsChanged,false);assert.equal(result.restartRequired,true);
    assert.equal(await fs.readFile(path.join(extension,'index.js'),'utf8'),'legacy protected');
    assert.equal(JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8')).js,'runtime.js');
    assert.match(await fs.readFile(path.join(extension,'runtime.js'),'utf8'),/from '.\/state-read.mjs'/);
    assert.match(await fs.readFile(path.join(extension,'state-read.mjs'),'utf8'),/readStateSection/);
    const config=YAML.parse(await fs.readFile(path.join(installation,'config.yaml'),'utf8'));assert.equal(config.enableServerPlugins,true);assert.equal(config.enableServerPluginsAutoUpdate,false);
    await fs.appendFile(path.join(bundle.destination,'extension','runtime.js'),'\n// corrupt');
    backedUp=false;await assert.rejects(activateDeployment(bundle.destination,{installation,makeBackup}),/校验失败/);assert.equal(backedUp,false);
});
test('部署：包内每个运行时模块的相对 import 都能在包里找到（清单不再漏依赖）',async t=>{
    const root=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-deploy-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const bundle=await prepareDeployment(path.join(root,'bundle')),inPack=new Set(bundle.files.map(f=>f.path)),missing=[];
    const spec=/\b(?:import|export)\s*(?:[^'"();]*?\bfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
    for(const f of inPack){
        if(!/^plugin\/(?:tools|server-plugin)\/.*\.m?js$/.test(f))continue;
        const text=await fs.readFile(path.join(bundle.destination,f),'utf8');
        for(const m of text.matchAll(spec)){
            const target=path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1]??m[2]));
            if(!inPack.has(target))missing.push(`${f} -> ${target}`);
        }
    }
    assert.deepEqual(missing,[]);
});
