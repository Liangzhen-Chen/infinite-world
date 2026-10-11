import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openSoakRun,nextSoakTask,summarizeSoak} from './m3-soak-state.mjs';
export * from './m3-soak-state.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),directory=args[args.indexOf('--directory')+1];
 if(args.includes('--run')){
  if(!args.includes('--directory')||!directory)throw Error('缺少隔离目录');
  const value=(flag,fallback)=>args.includes(flag)?Number(args[args.indexOf(flag)+1]):fallback;
  const {runSoak}=await import('./m3-soak-runner.mjs');const result=await runSoak({directory,turns:value('--turns',150),budgetYuan:value('--budget',50),maxTasks:value('--max-tasks',Infinity)});console.log(JSON.stringify(result));if(['failed','attempts-exhausted','budget-limited'].includes(result.status))process.exitCode=1;
 }else{
 if(!args.includes('--directory')||!directory||!args.some(a=>['--init','--report'].includes(a)))throw Error('用法：node tools/m3-soak.mjs --directory 隔离报告目录 --init|--report|--run [--turns 150 --budget 50]');
 const run=args.includes('--init')?await openSoakRun(directory):await read(path.join(path.resolve(directory),'run.json'));
 console.log(JSON.stringify({next:nextSoakTask(run),report:summarizeSoak(run)}));
 }
}
