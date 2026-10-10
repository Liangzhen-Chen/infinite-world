import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {planWildlifeMigration} from '../server-plugin/wildlife-migration.mjs';
import {applyPatches,atomicJSON} from '../server-plugin/storage.mjs';
import {validateWorld} from './validate-world.mjs';
const[input,output,option,worldFile]=process.argv.slice(2);
if(!input||!output)throw new Error('用法：node tools/migrate-wildlife.mjs 原文档.json 新副本.json');
if(option!==undefined&&(option!=='--world'||!worldFile))throw new Error('可选世界归档需使用--world 世界归档.json');
if([input,output,worldFile].filter(Boolean).some(f=>path.basename(f).toLowerCase()==='secrets.json'))throw new Error('拒绝接触密钥文件');
if(path.resolve(input).toLowerCase()===path.resolve(output).toLowerCase())throw new Error('必须使用独立输出副本');
try{await fs.access(output);throw new Error('输出已存在，拒绝覆盖');}catch(e){if(e.code!=='ENOENT')throw e;}
const source=JSON.parse(await fs.readFile(input,'utf8')),world=worldFile?JSON.parse(await fs.readFile(worldFile,'utf8')):await loadWorld();
if(!validateWorld(world).ok)throw new Error('世界归档校验失败');
if(source.worldVersion!==world.version)throw new Error('存档与世界归档版本不符');
const patches=planWildlifeMigration(source,world.rules,world.monsters);
await atomicJSON(output,applyPatches(source,patches));console.log(JSON.stringify({output,patches:patches.length,scope:'保留人物、财物、记忆与旧实例；仅建立当前日期的未见种群，不补过往出生和掉落'}));
