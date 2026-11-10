// 定位耗时用的剖析入口（只取 CPU 剖析，不判定通过或失败；默认门禁 run 的行为、超时、检查强度都不受影响）。
// 用法（经门禁 run-script）：node tools/test-cpu-prof.mjs <限时秒> <tests/a.test.mjs> [<tests/b.test.mjs> ...]
// 父进程为每个测试文件各起一个子进程并行运行；子进程里由一个工作线程用 inspector 采样主线程（间隔 10ms），
// 测试跑完或到限时即停止采样，把剖析写到 .out/prof/<测试名>.cpuprofile，并打印 PROFILE 行。
// 到限时：工作线程写完剖析并打印后，父进程看到 why=limit 就对该子进程发 SIGKILL（只代表剖析截止，不代表测试结果）。
//
// 为什么用工作线程：被剖析的测试常做长时间同步计算，主线程不让出事件循环，主线程里的 setTimeout 永远触发不了
// （云上曾因此一个剖析文件都没写出来）。计时、停止、写盘都放在工作线程里，不依赖主线程让出。
// 依据与不确定处（如实）：
// - Node 文档 inspector.Session.connectToMainThread()：仅工作线程可用，把会话连到主线程的 inspector。
// - 我对实现的理解是：主线程这一侧的 inspector 消息经 Environment::RequestInterrupt（V8 interrupt）派发，
//   因此主线程忙于同步 JS 时仍会处理 Profiler.stop。这一点文档没有明说，是读实现与实测得出；
//   本机用 30 秒死循环的人造测试验证过（限时 5 秒如期写出剖析）。若某 Node 版本行为不同，会表现为到限时仍无文件，
//   外层门禁的超时仍会兜底。
// - 剖析的是「主线程」的 JS；工作线程自身不在剖析内。
import inspector from 'node:inspector';import fs from 'node:fs';import path from 'node:path';
import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
const TEST=/^tests\/[a-z0-9-]+\.test\.mjs$/;
if(!isMainThread){
 // 工作线程：连接主线程，开始采样，等限时或主线程的 done 消息，然后停止并同步写盘。
 const {limit,name,dir}=workerData;
 const keep=setInterval(()=>{},1000); // 等待 inspector 回调期间保持工作线程存活（否则事件循环空了会提前退出）
 const s=new inspector.Session();s.connectToMainThread();
 const post=(m,p)=>new Promise((ok,bad)=>s.post(m,p,(e,v)=>e?bad(e):ok(v)));
 await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:10000});await post('Profiler.start');
 const t0=Date.now();let written=false,timer;
 const finish=async why=>{
  if(written)return;written=true;clearTimeout(timer);
  const {profile}=await post('Profiler.stop');fs.mkdirSync(dir,{recursive:true});
  const out=path.join(dir,`${name}.cpuprofile`);
  const fd=fs.openSync(out,'w');fs.writeSync(fd,JSON.stringify(profile));fs.fsyncSync(fd);fs.closeSync(fd);
  // 同步写 stdout（fd 1），保证写完盘再报，且不依赖主线程转发。
  fs.writeSync(1,`PROFILE ${name} why=${why} secs=${Math.round((Date.now()-t0)/1000)} bytes=${fs.statSync(out).size}\n`);
  process.exit(0); // 只结束本工作线程
 };
 timer=setTimeout(()=>{finish('limit');},limit*1000);
 parentPort.on('message',m=>{if(m==='done')finish('done');});
}else{
 const [mode,...rest]=process.argv.slice(2);
 if(mode==='--child'){
  const [limit,file]=rest,name=path.basename(file,'.test.mjs'),dir=path.resolve('.out/prof');
  const w=new Worker(new URL(import.meta.url),{workerData:{limit:Number(limit),name,dir}});w.unref(); // 不让工作线程拖住主线程事件循环，否则 beforeExit 永不触发
  // 等工作线程已连上并开始采样再跑测试（它的 Profiler.start 由主线程处理，此时主线程空闲）。
  await new Promise(ok=>setTimeout(ok,500));
  // 测试正常结束：主线程事件循环将空时通知工作线程停止并写出；工作线程未退出前它保持进程存活。
  let sent=false;
  process.on('beforeExit',()=>{if(!sent){sent=true;w.ref();w.postMessage('done');}});
  await import(pathToFileURL(path.resolve(file)).href);
 }else{
  const limit=Number(mode),files=rest;
  if(!(limit>0&&limit<=3500)||!files.length||!files.every(f=>TEST.test(f)&&fs.existsSync(f)))throw Error('用法：<限时秒 ≤3500> <tests/x.test.mjs> ...');
  const runs=files.map(f=>new Promise(ok=>{
   const c=spawn(process.execPath,[process.argv[1],'--child',String(limit),f],{stdio:['ignore','pipe','pipe']});
   const log=fs.createWriteStream(path.resolve('.out',`prof-${path.basename(f,'.test.mjs')}.log`));
   // 两路输出写同一个日志：都不自动关闭日志，等子进程 close（两路都已读完）后再关，避免 write after end。
   c.stdout.pipe(log,{end:false});c.stderr.pipe(log,{end:false});
   c.stdout.on('data',b=>{for(const l of String(b).split('\n'))if(l.startsWith('PROFILE ')){
    console.log(l);
    // 主线程可能卡在同步计算里无法正常退出：限时剖析已写完，直接杀子进程。
    if(/ why=limit /.test(l+' '))c.kill('SIGKILL');
   }});
   c.on('close',code=>{log.end();console.log(`CHILD ${f} exit=${code}`);ok();});
  }));
  await Promise.all(runs);
 }
}
