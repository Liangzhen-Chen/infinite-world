// Report the historical literal count and current semantic candidates side by side.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const pattern=/死亡|\b(?:dead|died|deceased|killed)\b/i;
const semanticPattern=/(?:status\s*(?:===?|!==?)\s*['"](?:死亡|dead|died|deceased|killed)['"]|['"](?:死亡|dead|died|deceased|killed)['"]\s*[,\]]?\s*\.includes\(\s*\w+\.status|\b(?:dead|died|deceased|killed)\b\s*(?:\?|&&|\|\|)|(?:status|diedAt)\s*=\s*['"](?:死亡|dead|died|deceased|killed)['"])/i;
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.mjs')?[path.relative(root,path.join(dir,e.name)).replaceAll('\\','/')]:[]);}
function scan(){
 const all=files(path.join(root,'server-plugin')).sort(),raw=all.filter(f=>pattern.test(fs.readFileSync(path.join(root,f),'utf8')));
 const active=[],legacy=[],remaining=[];
 for(const file of raw){
  const lines=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/);
  if(file.startsWith('server-plugin/compat/')){legacy.push({module:file,lines:lines.flatMap((line,i)=>pattern.test(line)?[{line:i+1,text:line.trim()}]:[])});continue;}
  for(let i=0;i<lines.length;i++){
   const line=lines[i].replace(/\/\/.*$/,'');
   if(semanticPattern.test(line))active.push({module:file,line:i+1,text:line.trim()});
   else if(pattern.test(line))remaining.push({module:file,line:i+1,text:lines[i].trim()});
  }
 }
 const baseline=JSON.parse(fs.readFileSync(new URL('../tests/metrics/death-keyword-modules.baseline.json',import.meta.url),'utf8'));
 return {basis:'计划第一节：rawLiteral 保留历史正则基线；activeSemantic 只统计现行规则里明确参与状态判断/写入的命中行；compat 历史执行器列入 legacy，不计入现行语义；不按模块名白名单排除。',rawLiteral:{before:baseline,after:{count:raw.length,modules:raw}},activeSemantic:{count:new Set(active.map(x=>x.module)).size,modules:[...new Set(active.map(x=>x.module))],matches:active},legacy:{count:legacy.length,modules:legacy},remainingMatches:remaining};
}
export function deathKeywordModules(){return scan();}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(deathKeywordModules(),null,2));
