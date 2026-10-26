// usage: node F:/dnd-tools/card-gate.mjs <worktree> <base> <name> [jobs=3]
// Card hand-in gate (run outside the sandbox): affected fast-tier tests in parallel, each
// file in its own process; any failure is re-run on <base> (worktree BIS2) to tell a new
// regression from a pre-existing failure. Slow tier: F:/dnd-tools/slow-tests.tsv (run at
// night / stage close). Writes F:/dnd/logs/sessions/<name>.gate.md and .gate.tsv.
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
const [wt,base='master',name='card',jobsArg='3']=process.argv.slice(2);
const jobs=Number(jobsArg),L='F:/dnd/logs/sessions',BASE_WT='F:/dnd-wt/BIS2';
if(!wt)throw Error('usage: card-gate.mjs <worktree> <base> <name> [jobs]');
const slow=new Set(fs.readFileSync('F:/dnd-tools/slow-tests.tsv','utf8').split('\n').filter(Boolean).map(l=>l.split('\t')[0]));
// Coverage-based selection when the nightly map exists; import-graph selection otherwise.
const MAP='F:/dnd-tools/tia-map.json',useMap=fs.existsSync(MAP);
const selector=useMap?['F:/dnd-tools/test-impact/select.mjs',wt,base,'--map',MAP]:['F:/dnd-tools/affected-tests.mjs',base];
const affected=execFileSync(process.execPath,selector,{cwd:wt,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','ignore']}).split('\n').filter(Boolean);
const selectorName=useMap?'覆盖率选测':'import 关系选测';
const fast=affected.filter(f=>!slow.has(f)),skipped=affected.filter(f=>slow.has(f));
const runOne=(cwd,file)=>new Promise(resolve=>{
 const t=Date.now(),p=spawn(process.execPath,['--test','--test-isolation=none',file],{cwd,env:{...process.env,TEMP:'F:/dnd-tmp',TMP:'F:/dnd-tmp'}});
 let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
 const timer=setTimeout(()=>p.kill(),900000);
 p.on('close',()=>{clearTimeout(timer);const pass=/^ℹ pass (\d+)/m.exec(out),fail=/^ℹ fail (\d+)/m.exec(out);
  // Failing case names (the summary block after "failing tests"), for case-level comparison.
  const block=out.split(/^✖ failing tests:/m)[1]??'',cases=[...new Set([...block.matchAll(/^✖ (.+?) \(\d/gm)].map(m=>m[1].trim()))];
  // One progress line per file: watch-progress.sh treats a silent log as stalled.
  console.log(`${new Date().toISOString().slice(11,19)} ${cwd===BASE_WT?'base ':''}${file} fail=${fail?.[1]??'?'} ${Math.round((Date.now()-t)/1000)}s`);
  resolve({file,pass:pass?Number(pass[1]):null,fail:fail?Number(fail[1]):null,cases,seconds:Math.round((Date.now()-t)/1000)});});
});
const pool=async(cwd,files)=>{const q=[...files],res=[];await Promise.all(Array.from({length:jobs},async()=>{while(q.length)res.push(await runOne(cwd,q.shift()));}));return res;};
const started=Date.now();
const results=await pool(wt,fast);
const bad=results.filter(r=>r.fail!==0);
let baseline=[];
if(bad.length){
 execFileSync('git',['-C',BASE_WT,'checkout','-q','--detach',base]);
 baseline=await pool(BASE_WT,bad.map(r=>r.file));
 // A base failure is confirmed only if it fails again (flaky base runs misled the gate once).
 const again=await pool(BASE_WT,baseline.filter(b=>b.fail!==0).map(b=>b.file));
 baseline=baseline.map(b=>{const a=again.find(x=>x.file===b.file);return a?{...b,fail:a.fail,cases:b.cases.filter(c=>a.cases.includes(c))}:b;});
}
const baseOf=f=>baseline.find(b=>b.file===f);
// New regression: any failing case in the branch that the base does not also fail (case level, not file level).
const newCases=r=>{const b=baseOf(r.file);if(!b||b.fail===0)return r.cases.length?r.cases:['(file)'];return r.cases.filter(c=>!b.cases.includes(c));};
const newFail=bad.filter(r=>newCases(r).length);
const sameFail=bad.filter(r=>!newFail.includes(r));
const minutes=Math.round((Date.now()-started)/60000);
fs.writeFileSync(`${L}/${name}.gate.tsv`,results.map(r=>[r.file,r.pass,r.fail,r.seconds,baseOf(r.file)?.fail??''].join('\t')).join('\n')+'\n');
const md=[`# 交卡门禁 ${name}`,`worktree ${wt} vs ${base}（${selectorName}）；受影响 ${affected.length}（快档 ${fast.length}，慢档跳过 ${skipped.length}）；用时 ${minutes} 分钟`,
 `- 通过 ${results.length-bad.length}/${results.length}`,`- **新回归 ${newFail.length}**：${newFail.map(r=>`${r.file} ${r.pass}/${r.fail}〔${newCases(r).join(' | ').slice(0,160)}〕`).join('；')||'无'}`,
 `- 基线同败 ${sameFail.length}：${sameFail.map(r=>r.file).join('；')||'无'}`,`- 慢档未跑：${skipped.join('；')||'无'}`].join('\n');
fs.writeFileSync(`${L}/${name}.gate.md`,md+'\n');
console.log(md);
