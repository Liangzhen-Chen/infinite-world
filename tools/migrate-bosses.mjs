import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {applyPatches,atomicJSON} from '../server-plugin/storage.mjs';
import {validateWorld} from './validate-world.mjs';
const[input,output,option,worldFile]=process.argv.slice(2);
if(!input||!output)throw new Error('用法：node tools/migrate-bosses.mjs 原文档.json 新副本.json');
if(option!==undefined&&(option!=='--world'||!worldFile))throw new Error('可选世界归档需使用--world 世界归档.json');
if([input,output,worldFile].filter(Boolean).some(f=>path.basename(f).toLowerCase()==='secrets.json'))throw new Error('拒绝接触密钥文件');
if(path.resolve(input).toLowerCase()===path.resolve(output).toLowerCase())throw new Error('必须使用独立输出副本');
try{await fs.access(output);throw new Error('输出已存在，拒绝覆盖');}catch(e){if(e.code!=='ENOENT')throw e;}
const source=JSON.parse(await fs.readFile(input,'utf8')),world=worldFile?JSON.parse(await fs.readFile(worldFile,'utf8')):await loadWorld();
const validation=validateWorld(world);if(!validation.ok)throw new Error('世界归档校验失败');
if(source.worldVersion!==world.version)throw new Error('存档与世界归档版本不符');
const patches=planBossMigration(source,world.rules,world.bosses);
await atomicJSON(output,applyPatches(source,patches));console.log(JSON.stringify({output,patches:patches.length,scope:'保留健康、财物和记忆，补巢穴及已知身份标签；旧败亡不复活，不回填过往战术'}));
