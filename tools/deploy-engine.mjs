import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import YAML from 'yaml';
import {backup,root}from'./backup.mjs';
import {digest}from'../server-plugin/storage.mjs';

const extensionPath='public/scripts/extensions/third-party/infinite-fields';
export async function prepareDeployment(destination=path.join(root,'dist','engine-deployment')){
    destination=path.resolve(destination);
    const sources=['tools/load-world.mjs','tools/npc-autonomy-planner.mjs','tools/deepseek-client.mjs','tools/narrative-claims.mjs','extension/tools.mjs','extension/message-view.mjs','extension/turn.mjs','extension/prompt.mjs','extension/history-window.mjs','prompt/constitution.md','prompt/style.md'];
    async function copyDirectory(relative){
        for(const name of await fs.readdir(path.join(root,relative))){
            if(relative==='world'&&name==='drafts')continue;
            const file=path.join(relative,name),stat=await fs.lstat(path.join(root,file));
            if(stat.isSymbolicLink())throw new Error('部署拒绝符号链接');
            if(stat.isDirectory())await copyDirectory(file);else sources.push(file);
        }
    }
    await copyDirectory('server-plugin');await copyDirectory('world');
    // The plugin must resolve its runtime dependency without the development checkout.
    await copyDirectory('node_modules/opencc-js');
    const files=[];
    for(const source of sources){
        const bytes=await fs.readFile(path.join(root,source)),target=path.join(destination,'plugin',source);
        await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
        files.push({path:path.relative(destination,target).replaceAll('\\','/'),sha256:digest(bytes.toString('utf8'))});
    }
    const entry="export {info,init} from './server-plugin/index.mjs';\n";
    await fs.writeFile(path.join(destination,'plugin','index.mjs'),entry);
    files.push({path:'plugin/index.mjs',sha256:digest(entry)});
    await fs.mkdir(path.join(destination,'extension'),{recursive:true});
    for(const name of ['runtime.js','turn.mjs','state-read.mjs','tools.mjs','generation.mjs','prompt.mjs','message-view.mjs','history-window.mjs','style.css']){
        const bytes=await fs.readFile(path.join(root,'extension',name));await fs.writeFile(path.join(destination,'extension',name),bytes);
        files.push({path:`extension/${name}`,sha256:digest(bytes.toString('utf8'))});
    }
    const manifest=JSON.parse(await fs.readFile(path.join(root,'extension','manifest.json'),'utf8'));
    manifest.js='runtime.js';manifest.version='2.0.0';
    const text=JSON.stringify(manifest,null,2)+'\n';await fs.writeFile(path.join(destination,'extension','manifest.json'),text);
    files.push({path:'extension/manifest.json',sha256:digest(text)});
    const report={format:1,stage:'prepared',activation:false,files};
    await fs.writeFile(path.join(destination,'deployment.json'),JSON.stringify(report,null,2));
    return {destination,...report};
}

export async function activateDeployment(destination,{installation=path.join(root,'SillyTavern'),makeBackup=backup}={}){
    const report=JSON.parse(await fs.readFile(path.join(destination,'deployment.json'),'utf8'));
    // Validate the complete frozen bundle before changing any live file.
    for(const file of report.files){
        if(!/^(plugin|extension)\/[a-zA-Z0-9_./-]+$/.test(file.path)||file.path.split('/').includes('..'))throw new Error('部署路径无效');
        if(digest(await fs.readFile(path.join(destination,file.path),'utf8'))!==file.sha256)throw new Error(`部署文件校验失败：${file.path}`);
    }
    const saved=await makeBackup('before-engine-deployment');
    for(const file of report.files){
        const target=path.join(installation,file.path.startsWith('plugin/')?'plugins/infinite-fields':extensionPath,file.path.replace(/^(plugin|extension)\//,''));
        await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(destination,file.path),target);
    }
    const configPath=path.join(installation,'config.yaml'),config=YAML.parse(await fs.readFile(configPath,'utf8'));
    config.enableServerPlugins=true;config.enableServerPluginsAutoUpdate=false;
    await fs.writeFile(configPath,YAML.stringify(config));
    return {activation:true,backup:saved,restartRequired:true,chatsChanged:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const prepared=await prepareDeployment();
    const report=process.argv.includes('--activate')?await activateDeployment(prepared.destination):prepared;
    await fs.mkdir(path.join(root,'docs','测试报告'),{recursive:true});
    await fs.writeFile(path.join(root,'docs','测试报告','阶段1部署准备.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({destination:prepared.destination,activation:report.activation,files:prepared.files.length,backup:report.backup}));
}
