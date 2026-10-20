import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rows=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/a3-intents.json'),'utf8'));
const engine=new WorldEngine(await loadWorld());
const seed=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
let document=engine.createCharacter(seed,{},'a3-score-independent');
const results=[];
for(const row of rows){
  const eventId=`a3-score-${row.id}`;
  const args=row.proposal;
  let preview,error,actual;
  try {
    preview=await engine.previewAction(document,{tool:'world_propose',args,eventId});
    actual=preview?.prepared?.routed??preview?.receipt?.routing?.routed??preview?.routing?.routed??null;
  } catch(e) { error=String(e.message??e); }
  const routed=actual===row.expected.action;
  const actualSig=preview?.prepared?.signature??preview?.receipt?.signature??[];
  const signature=row.expected.signature.every(s=>actualSig.some(a=>a.includes(s)));
  const refused=Boolean(error)||['not_submitted','rejected'].includes(preview?.receipt?.status)||preview?.prepared?.status==='infeasible';
  const outOfBounds=refused===row.expected.outOfBounds;
  const fallback=Boolean(preview?.prepared?.fallback?.available||preview?.receipt?.fallback?.committed||preview?.receipt?.mark);
  const supported=routed||fallback||row.expected.outOfBounds&&refused;
  results.push({id:row.id,text:row.intent,expected:row.expected,actual:{route:actual,status:preview?.receipt?.status??null,signature,refused,fallback,error:error??null},scores:{route:routed,signature,outOfBounds,supported,constructor:row.expected.constructor&&routed},repair:row.expected.repair});
}
const n=rows.length, creative=rows.filter(r=>r.tricky).length;
const tally=(key,denom=n)=>results.filter(r=>r.scores[key]).length/denom;
export const report={total:n,tricky:creative,trickyRate:creative/n,route:tally('route'),signature:tally('signature'),outOfBoundsLeaks:results.filter(r=>r.expected.outOfBounds&&!r.actual.refused).map(r=>r.id),unsupported:results.filter(r=>!r.scores.supported).map(r=>r.id),fallbackExpected:rows.filter(r=>r.expected.fallback).length,fallbackReacted:results.filter(r=>r.expected.fallback&&r.actual.fallback&&r.actual.status==='committed').length,fallbackReactionRate:rows.filter(r=>r.expected.fallback).length?results.filter(r=>r.expected.fallback&&r.actual.fallback&&r.actual.status==='committed').length/rows.filter(r=>r.expected.fallback).length:1,constructor:tally('constructor'),results};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--report')){
 const groups=Object.groupBy(results,r=>r.repair),lines=[
  'A3-E 第 1 轮独立验收报告','',
  `语料：${n} 条；刁钻 ${creative}/${n}（${(creative/n*100).toFixed(1)}%）。`,
  `路由 ${(report.route*100).toFixed(1)}%；签名 ${(report.signature*100).toFixed(1)}%；越界漏网 ${report.outOfBoundsLeaks.length}；合法意图未承接 ${report.unsupported.length}；兜底实际反应 ${(report.fallbackReactionRate*100).toFixed(1)}%；无 LLM 构造器完成 ${(report.constructor*100).toFixed(1)}%。`,'',
  '差距按责任卡分组（根因是判分器观察到的现象，需责任卡复核）：'
 ];
 for(const [card,items] of Object.entries(groups))lines.push(`卡 ${card}：${items.length} 条`,...items.filter(x=>!x.scores.route||!x.scores.signature||!x.scores.supported||x.expected.outOfBounds&&!x.scores.outOfBounds).map(x=>`- ${x.id}「${x.text}」：期望 ${x.expected.action} / ${x.expected.signature.join(',')}；实际 ${x.actual.route??x.actual.status??x.actual.error}；${x.actual.error??'未出现与 oracle 一致的路由或承接回执'}`));
 lines.push('','日常探针：tests/a3-daily.test.mjs 通过（覆盖 D05、D16、D22、D23、D36 等 A3 场景）；docs/probes/daily/executable-status.md 的 A3=22 是题目数，但该文件未列 22 个编号，无法逐题映射并给出 22 行判定。未映射题登记未确认，不冒报通过。CORE：engine/storage/plugin 合计失败于 tests/engine.test.mjs E7，期望 299、实际 292；其余 39 项通过。','');
 await fs.writeFile(path.resolve(root,'../../dnd/logs/sessions/A3E-luna.final.txt'),lines.join('\n'),'utf8');
}
