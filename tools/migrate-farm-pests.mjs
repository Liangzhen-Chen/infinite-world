import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {planAgricultureMigration} from '../server-plugin/agriculture-migration.mjs';
import {planFarmPestsMigration} from '../server-plugin/farm-pests-migration.mjs';
import {applyPatches,atomicJSON} from '../server-plugin/storage.mjs';
const[input,output,option,worldFile]=process.argv.slice(2);
if(!input||!output)throw new Error('用法：node tools/migrate-farm-pests.mjs 原文档.json 新副本.json [--world 世界归档.json]');
if(option!==undefined&&(option!=='--world'||!worldFile))throw new Error('可选世界归档需使用--world');
if([input,output,worldFile].filter(Boolean).some(f=>path.basename(f).toLowerCase()==='secrets.json'))throw new Error('拒绝接触密钥文件');
if(path.resolve(input).toLowerCase()===path.resolve(output).toLowerCase())throw new Error('必须使用独立输出副本');
try{await fs.access(output);throw new Error('输出已存在，拒绝覆盖');}catch(e){if(e.code!=='ENOENT')throw e;}
const source=JSON.parse(await fs.readFile(input,'utf8')),world=worldFile?JSON.parse(await fs.readFile(worldFile,'utf8')):await loadWorld();
if(!validateWorld(world).ok)throw new Error('世界归档校验失败');if(source.worldVersion!==world.version)throw new Error('存档与世界归档版本不符');
const base=applyPatches(source,planAgricultureMigration(source,world.rules)),patches=planFarmPestsMigration(base,world.rules);
await atomicJSON(output,applyPatches(base,patches));console.log(JSON.stringify({output,patches:patches.length,scope:'从当前时刻启用害兽损失记录，保留旧粮、已收获、作物、人物和记忆，不补动物/种粮/过去收成'}));
