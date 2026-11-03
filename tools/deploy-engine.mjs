import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import YAML from 'yaml';
import {backup,root}from'./backup.mjs';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

// 静态 import 图：从已列入的运行时代码（tools/、server-plugin/）出发，把相对路径引用到的文件补进清单，避免漏带依赖；
// 测试与草稿目录永不进包。
const IMPORT_SPEC=/\b(?:import|export)\s*(?:[^'"();]*?\bfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
export async function importClosure(sources,base=root){
    const known=new Set(sources),queue=sources.filter(f=>/\.(?:mjs|js)$/.test(f)&&/^(?:tools|server-plugin)\//.test(f));
    while(queue.length){
        const file=queue.pop(),text=await fs.readFile(path.join(base,file),'utf8');
        for(const m of text.matchAll(IMPORT_SPEC)){
            const rel=path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1]??m[2]));
            if(rel.startsWith('..')||known.has(rel)||/^(?:tests|world\/drafts)\//.test(rel))continue;
            try{if(!(await fs.stat(path.join(base,rel))).isFile())continue;}catch{continue;}
            known.add(rel);sources.push(rel);if(/\.(?:mjs|js)$/.test(rel))queue.push(rel);
        }
    }
    return sources;
}
const extensionPath='public/scripts/extensions/third-party/infinite-fields';
export async function prepareDeployment(destination=path.join(root,'dist','engine-deployment')){
    destination=path.resolve(destination);
    const sources=['tools/load-world.mjs','tools/npc-autonomy-planner.mjs','tools/deepseek-client.mjs','tools/narrative-claims.mjs','prompt/constitution.md','prompt/style.md',
        // balance-tables.mjs 用 fs 读（非 import），import 图补不到。
        'schemas/balance-table.schema.json','schemas/balance-targets.schema.json',
        // load-world.mjs reads the town-income schema with fs at start-up, as well.
        'schemas/town-income.schema.json'];
    async function copyDirectory(relative){
        for(const name of await fs.readdir(path.join(root,relative))){
            if(relative==='world'&&name==='drafts')continue;
            const file=path.join(relative,name),stat=await fs.lstat(path.join(root,file));
            if(stat.isSymbolicLink())throw new Error('部署拒绝符号链接');
            if(stat.isDirectory())await copyDirectory(file);else sources.push(file.replaceAll('\\','/'));
        }
    }
    await copyDirectory('server-plugin');await copyDirectory('world');
    await copyDirectory('extension');await copyDirectory('assets');
    // The plugin must resolve its runtime dependency without the development checkout.
    await copyDirectory('node_modules/opencc-js');
    await importClosure(sources);
    const files=[];
    for(const source of sources){
        if(source.startsWith('assets/'))continue;
        const bytes=await fs.readFile(path.join(root,source)),target=path.join(destination,'plugin',source);
        await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
        files.push({path:path.relative(destination,target).replaceAll('\\','/'),sha256:digest(bytes)});
    }
    const entry="export {info,init} from './server-plugin/index.mjs';\n";
    await fs.writeFile(path.join(destination,'plugin','index.mjs'),entry);
    files.push({path:'plugin/index.mjs',sha256:digest(entry)});
    await fs.mkdir(path.join(destination,'extension'),{recursive:true});
    for(const source of sources.filter(source=>source.startsWith('extension/')||source.startsWith('assets/'))){
        const relative=source.startsWith('extension/')?source.slice('extension/'.length):source;
        if(['manifest.json','index.js','core.js','seed.json'].includes(relative))continue;
        const bytes=await fs.readFile(path.join(root,source)),target=path.join(destination,'extension',relative);
        await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
        files.push({path:`extension/${relative.replaceAll('\\','/')}`,sha256:digest(bytes)});
    }
    const manifest=JSON.parse(await fs.readFile(path.join(root,'extension','manifest.json'),'utf8'));
    manifest.js='runtime.js';manifest.version='2.0.0';
    const text=JSON.stringify(manifest,null,2)+'\n';await fs.writeFile(path.join(destination,'extension','manifest.json'),text);
    files.push({path:'extension/manifest.json',sha256:digest(text)});
    // The isolated package provides the same public entry name. Activation is
    // still explicit; preparing this package does not touch an installation.
    const startHTML=await fs.readFile(path.join(root,'extension/start/play-town.html'));
    await fs.mkdir(path.join(destination,'public'),{recursive:true});
    await fs.writeFile(path.join(destination,'public/play-town.html'),startHTML);
    files.push({path:'public/play-town.html',sha256:digest(startHTML)});
    const report={format:1,stage:'prepared',activation:false,files};
    await fs.writeFile(path.join(destination,'deployment.json'),JSON.stringify(report,null,2));
    return {destination,...report};
}

export async function activateDeployment(destination,{installation=path.join(root,'SillyTavern'),makeBackup=backup}={}){
    const report=JSON.parse(await fs.readFile(path.join(destination,'deployment.json'),'utf8'));
    // Validate the complete frozen bundle before changing any live file.
    for(const file of report.files){
        if((!/^(plugin|extension)\/[a-zA-Z0-9_./-]+$/.test(file.path)&&file.path!=='public/play-town.html')||file.path.split('/').includes('..'))throw new Error('部署路径无效');
        if(digest(await fs.readFile(path.join(destination,file.path)))!==file.sha256)throw new Error(`部署文件校验失败：${file.path}`);
    }
    const saved=await makeBackup('before-engine-deployment');
    for(const file of report.files){
        const base=file.path.startsWith('plugin/')?'plugins/infinite-fields':file.path.startsWith('public/')?'public':extensionPath;
        const target=path.join(installation,base,file.path.replace(/^(plugin|extension|public)\//,''));
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
