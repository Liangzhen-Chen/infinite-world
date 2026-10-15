// S0 事件推演出分：运行 tests/probes/<run>/e*.mjs 的全部预期检查，按“合理/部分/错误/缺失”统计合理率，
// 与 tests/probes/<run>/baseline.json 对照（基线为合理的预期不得退步）。
// 用法：node tools/probe-score.mjs [--run run-001] [--only E02,E03] [--json] [--write-baseline]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT=path.resolve(import.meta.dirname,'..');
export const VERDICTS=['合理','部分','错误','缺失'];

export async function loadExpectations(run='run-001',only=null){
 const dir=path.join(ROOT,'tests/probes',run);
 const files=fs.readdirSync(dir).filter(f=>/^e\d+\.mjs$/.test(f)).sort();
 const list=[];
 for(const f of files){
  const event=f.slice(0,3).toUpperCase();if(only&&!only.includes(event))continue;
  const mod=await import(pathToFileURL(path.join(dir,f)).href);
  for(const x of mod.default)list.push({...x,file:`tests/probes/${run}/${f}`});
 }
 return list;
}
export function baselinePath(run='run-001'){return path.join(ROOT,'tests/probes',run,'baseline.json');}
export function readBaseline(run='run-001'){const p=baselinePath(run);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{verdicts:{}};}

export async function evaluate(expectation){
 try{
  const r=await expectation.check();
  if(!VERDICTS.includes(r?.verdict))return{verdict:'缺失',evidence:`脚本未返回有效判定：${JSON.stringify(r)}`,scriptError:true};
  return r;
 }catch(error){return{verdict:'缺失',evidence:`脚本异常：${error.message}`,scriptError:true};}
}
export function tally(results){
 const counts=Object.fromEntries(VERDICTS.map(v=>[v,0]));for(const r of results)counts[r.verdict]++;
 const total=results.length;
 return{total,counts,rate:total?counts['合理']/total:0,partialRate:total?(counts['合理']+counts['部分']*0.5)/total:0};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:null;};
 const run=get('--run')??'run-001',only=get('--only')?.split(',').map(s=>s.trim().toUpperCase())??null;
 const started=Date.now(),list=await loadExpectations(run,only),results=[];
 for(const x of list){const r=await evaluate(x);results.push({id:x.id,event:x.event,no:x.no,text:x.text,...r});}
 const t=tally(results),baseline=readBaseline(run);
 const regressions=results.filter(r=>baseline.verdicts[r.id]==='合理'&&r.verdict!=='合理');
 const improved=results.filter(r=>baseline.verdicts[r.id]&&baseline.verdicts[r.id]!=='合理'&&r.verdict==='合理');
 if(args.includes('--write-baseline')&&!only){
  fs.writeFileSync(baselinePath(run),JSON.stringify({metric:'probe-score',run,note:'S0 登记的 run-001 脚本化判定。合理=CORE 外的“必须保持”组；其余为目标分（target），只升不降。',
   total:t.total,counts:t.counts,rate:Number(t.rate.toFixed(4)),verdicts:Object.fromEntries(results.map(r=>[r.id,r.verdict]))},null,1)+'\n');
 }
 const byEvent={};for(const r of results){byEvent[r.event]??=Object.fromEntries(VERDICTS.map(v=>[v,0]));byEvent[r.event][r.verdict]++;}
 const report={metric:'probe-score',run,...t,rate:Number(t.rate.toFixed(4)),scriptErrors:results.filter(r=>r.scriptError).length,regressions:regressions.map(r=>r.id),improved:improved.map(r=>r.id),seconds:Math.round((Date.now()-started)/1000)};
 if(args.includes('--json'))console.log(JSON.stringify({...report,byEvent,results},null,1));
 else{
  for(const r of results)console.log(`${r.id.padEnd(7)} ${r.verdict}  ${r.text.slice(0,28)}${r.evidence?` —— ${r.evidence.slice(0,140)}`:''}`);
  console.log(Object.entries(byEvent).map(([e,c])=>`${e} ${VERDICTS.map(v=>c[v]).join('/')}`).join('  '));
  console.log(`probe-score: ${run} ${t.total} 条预期：合理 ${t.counts['合理']}、部分 ${t.counts['部分']}、错误 ${t.counts['错误']}、缺失 ${t.counts['缺失']}；合理率 ${(t.rate*100).toFixed(1)}%（含半计部分 ${(t.partialRate*100).toFixed(1)}%）；脚本异常 ${report.scriptErrors}；较基线退步 ${regressions.length}、进步 ${improved.length}；${report.seconds}s`);
 }
 if(regressions.length||report.scriptErrors)process.exitCode=1;
}
