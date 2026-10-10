import fs from'node:fs/promises';
import path from'node:path';
import{loadWorld}from'./load-world.mjs';
import{planAgricultureMigration}from'../server-plugin/agriculture-migration.mjs';
import{applyPatches,atomicJSON}from'../server-plugin/storage.mjs';
const[input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('用法：node tools/migrate-agriculture.mjs 原文档.json 新副本.json；不覆盖原存档');
if([input,output].some(file=>path.basename(file).toLowerCase()==='secrets.json'))throw new Error('拒绝接触密钥文件');
if(path.resolve(input).toLowerCase()===path.resolve(output).toLowerCase())throw new Error('迁移输出必须是独立副本');
try{await fs.access(output);throw new Error('输出副本已存在，拒绝覆盖');}catch(e){if(e.code!=='ENOENT')throw e;}
const source=JSON.parse(await fs.readFile(input,'utf8')),world=await loadWorld(),patches=planAgricultureMigration(source,world.rules);
await atomicJSON(output,applyPatches(source,patches));console.log(JSON.stringify({output,patches:patches.length,scope:'保留旧粮、财物、时钟和记忆；不发源开局储粮或过去作物'}));
