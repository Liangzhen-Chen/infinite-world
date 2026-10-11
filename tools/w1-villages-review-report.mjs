import fs from 'node:fs/promises';
import {hashContent} from './content-pipeline.mjs';
const root='world/drafts/w1/villages',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const bones=await read(`${root}/foundation.json`),snap=await read(`${root}/l4-read-hashes.json`),budget=await read(`${root}/budget.json`),byId=new Map([...bones.npcs,...bones.residents,...bones.locations].map(x=>[x.id,x]));
const notes={},batches=[],soft=[];
for(const v of ['yp','wt','lq','sb'])for(const kind of ['npcs','residents','locations']){
 const directory=`${root}/${v}/${kind}`,summary=await read(`${directory}/summary.json`);
 for(const batch of summary.batches){const required=new Set([...batch.sample,...batch.flagged]);let rewrites=0;
  for(const id of batch.ids){const row=await read(`${directory}/${id}.json`),entry=byId.get(id);if(row.status!=='passed'||row.errors.length||row.review.contradictions.some(c=>c.severity==='hard'))throw Error(`${id}仍待处理`);if(row.attempts>1||row.manualCorrection)rewrites++;
   for(const c of row.review.contradictions)soft.push({id,...c});
   if(!required.has(id))continue;const draftHash=hashContent(row.draft),reviewHash=hashContent(row.review);if(snap[id]?.draftHash!==draftHash||snap[id]?.reviewHash!==reviewHash)throw Error(`${id}尚未实际复读当前版本`);
   const detail=entry.tier==='full'?`${entry.name}，${entry.age}岁，${entry.occupation}；说话样例“${row.draft.voiceSamples[0]}”。核对户籍、日程、三条关系及两件私人往事，样例不登记新交易或预约。`:entry.tier==='roster'?`${entry.name}，${entry.age}岁，${entry.occupation}；当前烦恼“${row.draft.currentConcern}”。轻册不实例化现金与日程，未成年人不进入恋爱。`:`${entry.name}，${entry.rooms.length}个登记房间；“${row.draft.description.slice(0,65)}”。感官陈设不形成可领取库存；仅私宅投影进入许可字段。`;
   notes[id]={...snap[id],note:`Codex通读：${detail}`,retainedSoftIssues:row.review.contradictions};
  }
  batches.push({v,kind,index:batch.index,count:batch.count,passed:batch.passed,rewrites,required:required.size,manual:batch.manual.length});
 }
}
await fs.writeFile(`${root}/l4-notes.json`,JSON.stringify(notes,null,2)+'\n');
const report={status:'candidate-review-complete',formalWrite:false,total:542,full:120,roster:266,locations:156,households:120,routes:156,batches,l4ReadRequired:Object.keys(notes).length,spentYuan:budget.spentYuan,softIssues:soft,softInterpretation:'保留L2软问题原文。职业劳动、私人记忆润色与台词场合示例不授予收费、物品或交易结果；它们也不是当前场景的实时状态。已发现的硬数值、时间、名称、权限和材料功能冲突定点修正并重新L2。',nextBatchWritingRequirements:['不要复写“劳动时穿着便于某职业活动的旧布衣”，第二外貌细节应在骨架逐人设计。','避免每个人都以起身、午歇、收工列流水账；只挑一项能看见的习惯。','避免地点连续复用同一组三项感官素材，按具体地块分配。','地点说明不写工作站、库存或收费服务的实现状态；由字段和执行器决定。'],pending:'本批仅四村人口、户籍与生活地理候选。经济产量与税贸、地方治理、每村五问题十传闻、节日仍待后续；正式发布、world_upgrade/T1和W1波次评分由主线完成。'};
await fs.writeFile(`${root}/review.json`,JSON.stringify(report,null,2)+'\n');
const lines=['|批次|条目/通过|重写或定点修正|L4必读|人工队列|','|---|---:|---:|---:|---:|',...batches.map(b=>`|${b.v}/${b.kind}/${b.index}|${b.count}/${b.passed}|${b.rewrites}|${b.required}|${b.manual}|`),`累计费用 ${budget.spentYuan.toFixed(6)} 元，上限20元；固定样本未换。L2软问题逐条保留于 review.json，L4通读及指纹在 l4-notes.json。`,'后续起草禁用职业旧布衣套句与全日作息流水账；按具体地块分配感官细节。已过内容不因文风整批重写。','本批为四村人口/户籍/生活地点候选，未写正式目录；经济税贸、地方问题传闻、节日与发布后验收仍待完成。'];
await fs.writeFile(`${root}/review.md`,lines.join('\n')+'\n');
console.log(JSON.stringify({entries:542,required:Object.keys(notes).length,softIssues:soft.length,cost:budget.spentYuan}));
