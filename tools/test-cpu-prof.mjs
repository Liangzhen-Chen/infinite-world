// 定位耗时用的剖析入口（只取 CPU 剖析，不判定通过或失败；默认门禁 run 的行为、超时、检查强度都不受影响）。
// 用法（经门禁 run-script）：node tools/test-cpu-prof.mjs <限时秒> <tests/a.test.mjs> [<tests/b.test.mjs> ...]
// 父进程为每个测试文件各起一个子进程并行运行；子进程在本进程内用 inspector 采样（间隔 10ms），测试跑完或到限时即停止采样，
// 把剖析写到 .out/prof/<测试名>.cpuprofile。到限时的子进程写完剖析后退出，只代表剖析截止，不代表测试结果。
import inspector from 'node:inspector';import fs from 'node:fs';import path from 'node:path';
import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const TEST=/^tests\/[a-z0-9-]+\.test\.mjs$/;
const [mode,...rest]=process.argv.slice(2);
if(mode==='--child'){
 const [limit,file]=rest,name=path.basename(file,'.test.mjs'),dir=path.resolve('.out/prof');
 const s=new inspector.Session();s.connect();
 const post=(m,p)=>new Promise((ok,bad)=>s.post(m,p,(e,v)=>e?bad(e):ok(v)));
 await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:10000});await post('Profiler.start');
 const t0=Date.now();let written=false;
 const finish=async why=>{
  if(written)return;written=true;
  const {profile}=await post('Profiler.stop');fs.mkdirSync(dir,{recursive:true});
  const out=path.join(dir,`${name}.cpuprofile`);fs.writeFileSync(out,JSON.stringify(profile));
  console.log(`PROFILE ${name} why=${why} secs=${Math.round((Date.now()-t0)/1000)} bytes=${fs.statSync(out).size}`);
 };
 setTimeout(()=>finish('limit').then(()=>process.exit(0)),Number(limit)*1000).unref();
 process.on('beforeExit',()=>{finish('done');});
 await import(pathToFileURL(path.resolve(file)).href);
}else{
 const limit=Number(mode),files=rest;
 if(!(limit>0&&limit<=3500)||!files.length||!files.every(f=>TEST.test(f)&&fs.existsSync(f)))throw Error('用法：<限时秒 ≤3500> <tests/x.test.mjs> ...');
 const runs=files.map(f=>new Promise(ok=>{
  const c=spawn(process.execPath,[process.argv[1],'--child',String(limit),f],{stdio:['ignore','pipe','pipe']});
  const log=fs.createWriteStream(path.resolve('.out',`prof-${path.basename(f,'.test.mjs')}.log`));
  c.stdout.pipe(log);c.stderr.pipe(log);
  c.stdout.on('data',b=>{for(const l of String(b).split('\n'))if(l.startsWith('PROFILE '))console.log(l);});
  c.on('exit',code=>{console.log(`CHILD ${f} exit=${code}`);ok();});
 }));
 await Promise.all(runs);
}
