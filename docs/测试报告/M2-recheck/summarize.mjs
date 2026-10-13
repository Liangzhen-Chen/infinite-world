import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON} from '../../../server-plugin/storage.mjs';
const out=import.meta.dirname,root=path.resolve(out,'../../..');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const report=await read(path.join(out,'真实试玩.json'));
const names=['guide','npc_courier','npc_delivery','npc_home_visit','npc_offscreen','npc_private','npc_quest_social','npc_shove','npc_social','npc_voices'];
const sessions=[];
for(const id of names){
 const scenario=await read(path.join(root,'tests/playtests',id+'.json'));
 const result=report.results.find(r=>r.id===id);
 const turns=result?.turns??[],errors=turns.flatMap(t=>t.errors??[]);
 sessions.push({id,expectedTurns:scenario.turns.length,completedTurns:turns.length,
  complete:turns.length===scenario.turns.length&&!result?.error&&!errors.length,
  assertions:result?.assertions??0,passed:result?.passed??0,ledgerPass:result?.ledgerPass===true,
  consistencyPass:result?.consistencyPass===true,reviewComplete:result?.review?.complete===true,
  errors:[...(result?.error?[result.error]:[]),...errors],
  failedAssertions:turns.flatMap(t=>(t.assertions??[]).filter(a=>!a.pass).map(assertion=>({turn:t.index,input:t.input,assertion}))),
  incompleteReviews:[...(result?.review?.parts??[]).filter(p=>p.error),
   ...(result?.npcAcceptance?.parts??[]).filter(p=>!p.complete),
   ...(result?.review?.voiceBlind?.error?[result.review.voiceBlind]:[])]});
}
const ledger=await read(report.budgetFile);
await fs.copyFile(report.budgetFile,path.join(out,'persistent-budget.json'));
await fs.copyFile(path.join(path.dirname(report.budgetFile),'usage.jsonl'),path.join(out,'persistent-usage.jsonl'));
const requests=Object.values(ledger.requests).flatMap(r=>r.attempts);
const rows=Array.from({length:17},(_,i)=>{
 const id='N'+(i+1),row=report.m2.rows.find(r=>r.id===id);
 return row??{id,measured:false,pass:false,sessions:[]};
});
const effective=rows.filter(r=>r.measured).length,passed=rows.filter(r=>r.pass).length;
const gates={tenComplete:sessions.every(s=>s.complete),ledger100:report.assertions>0&&report.passed===report.assertions&&sessions.every(s=>s.ledgerPass),
 nCoverage:effective>=12,nRatio:effective>0&&passed/effective>=.9,
 privacy:report.m2.privacyPass===true&&report.m2.privacy.zeroLeakage===true,
 blind:rows.find(r=>r.id==='N12')?.pass===true,
 offscreen:rows.find(r=>r.id==='N17')?.pass===true,
 toolsMeasured:report.toolSelection.complete===true&&report.toolSelection.hasSelectedAction===true,
 budget:ledger.spentYuan+ledger.reservedYuan<=8+1e-12&&requests.length<=450};
const summary={runId:report.runId,pass:Object.values(gates).every(Boolean),runnerAcceptancePass:report.acceptancePass,gates,
 sessions,n:{effective,passed,ratio:effective?passed/effective:null,rows},
 ledger:{passed:report.passed,assertions:report.assertions},tools:report.toolSelection,
 leaks:report.m2.privacy.leaks,privacyFailures:report.m2.privacy.failures,
 blind:report.results.find(r=>r.id==='npc_voices')?.review?.voiceBlind,
 spentYuan:ledger.spentYuan,reservedYuan:ledger.reservedYuan,calls:requests.length,
 unknownCalls:requests.filter(r=>r.status==='unknown').length,modelRoles:report.modelRoles};
await atomicJSON(path.join(out,'result-summary.json'),summary);
const lines=[`T64 M2真实复验：${summary.pass?'通过':'未通过'}。`,
 `本轮新增结算 ${summary.spentYuan.toFixed(8)} 元，未知预留 ${summary.reservedYuan.toFixed(8)} 元，共 ${summary.calls}/450 次调用，含初探。`,
 `账本 ${report.passed}/${report.assertions}；有效N项 ${effective}/17，通过 ${passed}/${effective}。`,
 `工具机会 ${report.toolSelection.opportunities}，漏选 ${report.toolSelection.missed}，错选 ${report.toolSelection.wrong}，参数错误 ${report.toolSelection.parameterWrong}，目标错误 ${report.toolSelection.targetWrong}。`,
 `一致性审查记录的知情泄漏 ${summary.leaks.length}，N6/N16否定证据 ${summary.privacyFailures.length}；私密有效覆盖 ${report.m2.privacyMeasured}，零泄漏门槛 ${gates.privacy?'通过':'未通过'}。`,
 '', '| 场次 | 回合 | 完整 | 账本 |', '|---|---:|---|---:|',
 ...sessions.map(s=>`| ${s.id} | ${s.completedTurns}/${s.expectedTurns} | ${s.complete?'是':'否'} | ${s.passed}/${s.assertions} |`),
 '', '| N项 | 完整有效 | 通过 |', '|---|---|---|',
 ...rows.map(r=>`| ${r.id} | ${r.measured?'是':'否'} | ${r.pass?'是':'否'} |`),
 '',`门槛结果原值：${JSON.stringify(gates)}。CLI原判定 acceptancePass=${report.acceptancePass}。`,
 '', '以下保存失败断言原对象和N项审核原文，未修改断言。'];
for(const s of sessions){
 if(s.errors.length)lines.push('',`${s.id} 执行错误：`, '```json',JSON.stringify(s.errors,null,2),'```');
 for(const fail of s.failedAssertions)lines.push('',`${s.id} 第${fail.turn}回合断言：`,'```json',JSON.stringify(fail.assertion,null,2),'```');
 if(s.incompleteReviews.length)lines.push('',`${s.id} 未完整审核原文：`,'```json',JSON.stringify(s.incompleteReviews,null,2),'```');
}
for(const row of rows.filter(r=>!r.pass))lines.push('',`${row.id} 审核证据原文：`,'```json',JSON.stringify(row.sessions,null,2),'```');
if(summary.leaks.length)lines.push('', '知情泄漏原文：','```json',JSON.stringify(summary.leaks,null,2),'```');
await fs.writeFile(path.join(out,'结果摘要.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({...summary,sessions:sessions.map(({failedAssertions,incompleteReviews,...s})=>({...s,failedAssertions:failedAssertions.length,incompleteReviews:incompleteReviews.length})),n:{effective,passed,rows:rows.map(({id,measured,pass})=>({id,measured,pass}))},tools:{opportunities:summary.tools.opportunities,missed:summary.tools.missed,wrong:summary.tools.wrong,parameterWrong:summary.tools.parameterWrong,targetWrong:summary.tools.targetWrong},blind:summary.blind?{complete:summary.blind.complete,correct:summary.blind.correct,total:summary.blind.total,pass:summary.blind.pass}:null}));
