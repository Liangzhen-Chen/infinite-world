import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareDepth} from '../../../../tools/npc-depth.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {contextFor,patchDraft,validateDraft,checkIncrementalReview,getPath} from '../../../../tools/npc-depth-content.mjs';

const root=path.resolve('world/drafts/w1/lq-depth/author-v2/first-review');
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const options={root,worldRoot:path.resolve('world'),design:path.resolve('world/design/w1-lq-depth.mjs'),authoredBackground:path.join(root,'authored-background.json')};
const terminal=await read(path.join(root,'terminal.json'));
assert.equal(terminal.status,'finished','只在后台首次审核自然结束后核验');
const prepared=await prepareDepth(options),preflight=await read(path.join(root,'T45-official-preflight.json'));
for(const frozen of preflight.frozen){const raw=await fs.readFile(path.resolve('world',frozen.file),'utf8');assert.equal(createHash('sha256').update(raw.replace(/\r\n/g,'\n')).digest('hex'),frozen.sha256LF);}
const ledger=await read('F:/dnd/world/drafts/m4-object/budget.json');
for(const [id,request] of Object.entries(terminal.budgetBefore.requests??{}))assert.deepEqual(ledger.requests[id],request,'不得修改历史请求或未知预留');
for(const [id,card] of Object.entries(terminal.budgetBefore.cards??{}))if(id!=='T08')assert.deepEqual(ledger.cards[id],card,'不得修改其他卡预算');
const requests=Object.entries(ledger.requests).filter(([,r])=>r.card==='T08'),settled=requests.filter(([,r])=>r.status==='settled'),unknown=requests.filter(([,r])=>r.status!=='settled');
const cost=settled.reduce((n,[,r])=>n+r.costUpperYuan,0);
assert.ok(Math.abs(cost-ledger.cards.T08.spentYuan)<1e-10);assert.ok(ledger.cards.T08.spentYuan+ledger.cards.T08.reservedYuan<=3+1e-10);
assert.ok(ledger.spentYuan+ledger.reservedYuan<=20+1e-10);
const rows=[];
for(const entry of prepared.entries){
 assert.deepEqual(prepared.world.npcs.find(n=>n.id===entry.id),entry.before,'没有发布或修改正式人物');
 const record=await read(path.join(root,entry.id+'.json')),context=contextFor(entry,prepared.world);
 assert.equal(record.fingerprint,hashContent({entry,context,revision:prepared.config.revision}));
 const l1=record.draft?validateDraft(record.draft,entry,context).errors:null;
 if(record.draft)assert.deepEqual(record.draft,patchDraft(entry));
 let coverage=false,coverageError=null;
 if(record.review){try{const issues=checkIncrementalReview(record.review,entry,context);coverage=!issues.some(c=>c.severity==='hard');}catch(e){coverageError=e.message;}}
 if(record.status==='passed'){assert.deepEqual(l1,[]);assert.equal(coverage,true);}
 for(const raw of record.rawProviderReviewResponses??[])assert.equal(hashContent(raw.response),raw.hash);
 for(const measurement of record.measurements??[]){const u=measurement.usage,hit=u.prompt_cache_hit_tokens??u.prompt_tokens_details?.cached_tokens??0,miss=u.prompt_cache_miss_tokens??u.prompt_tokens-hit;assert.ok(Math.abs((hit*.04+miss*2+u.completion_tokens*8)/1e6-measurement.costUpperYuan)<1e-12);}
 rows.push({id:entry.id,status:record.status,attempts:record.attempts,l1Errors:l1,l2CoveragePassed:coverage,coverageError,errors:record.errors,warnings:record.warnings,reviewedPaths:record.review?.reviewedPaths??[],backgroundReviews:record.review?.backgroundReviews??[],draftHash:record.draft?hashContent(record.draft):null,reviewHash:record.review?hashContent(record.review):null,rawProviderHashes:(record.rawProviderReviewResponses??[]).map(r=>r.hash),measurements:(record.measurements??[]).map(m=>({label:m.label,costUpperYuan:m.costUpperYuan,usage:m.usage,timestamp:m.timestamp}))});
}
const sourceChecks=[
 ['npc_lq_luanpei','relationships[0].note','npc_lq_luanyu','原家属张嘴后闭口、转身继续干活；候选新增母女已经争论，现有出处不能证明该互动。'],
 ['npc_lq_yunxiu','relationships[1].note','npc_lq_minqiao','原闵巧收衣等待女儿开口；候选新增催促及经常商量退衣，不能把等待写成已发生对话。'],
 ['npc_lq_jushu','relationships[0].note','npc_lq_juli','原鞠理为未商量而闷着、饭桌话少；候选新增催促先商量，现有出处没有该发言。'],
 ['npc_lq_qinglan','relationships[0].note','npc_lq_qingman','原青蔓不敢当面拦下；候选新增母女争论先来顺序，不能用原担忧自证争论。'],
 ['npc_lq_yike','relationships[0].note','npc_lq_yijun','原易君夹在老人和孩子之间、先不接话；候选新增母子争论旧记号保存，现有出处没有该对话。'],
 ['npc_lq_nieya','relationships[1].note','npc_lq_cengye','原曾业怕挪动惹麻烦、端碗绕桌；候选新增催促收材料，现有出处没有该发言。'],
];
const sourceFindings=sourceChecks.map(([id,field,expectedSourceId,reason])=>{const entry=prepared.entries.find(e=>e.id===id),index=Number(field.match(/\[(\d+)\]/)[1]),sourceId=entry.before.relationships[index].with,source=prepared.world.residents.find(p=>p.id===sourceId)??prepared.world.npcs.find(p=>p.id===sourceId);assert.equal(sourceId,expectedSourceId);assert.ok(source?.currentConcern,'须引用真正的原家属关切');return{id,field,value:getPath(entry.facts,field),valueHash:hashContent(getPath(entry.facts,field)),source:{collection:source.tier==='full'?'npcs':'residents',id:sourceId,field:'currentConcern',value:source.currentConcern,valueHash:hashContent(source.currentConcern)},reason,status:'needs-controlled-source-correction',l4Approved:false};});
const report={kind:'T08-first-real-review-evidence',createdAt:new Date().toISOString(),formalWrite:false,sourceAndCandidateUnchanged:true,l2AllPassed:rows.every(r=>r.status==='passed'),l4Approved:false,l4Reason:rows.every(r=>r.status==='passed')?'还须L4处理原来源核查发现，不能自动批准。':'L1/L2尚未全闭合，不登记L4批准或波次评分。',summary:{total:30,passed:rows.filter(r=>r.status==='passed').length,manual:rows.filter(r=>r.status==='manual').length,pending:rows.filter(r=>r.status==='pending').length},budgetRoot:'F:/dnd/world/drafts/m4-object',budgetBefore:{spentYuan:terminal.budgetBefore.spentYuan,reservedYuan:terminal.budgetBefore.reservedYuan,card:terminal.budgetBefore.cards?.T08??{spentYuan:0,reservedYuan:0,limitYuan:3}},budgetAfter:{spentYuan:ledger.spentYuan,reservedYuan:ledger.reservedYuan,card:ledger.cards.T08},modelRequests:requests.length,settledRequests:settled.length,unknownRequests:unknown.map(([id,r])=>({id,...r})),actualCostUpperYuan:cost,rows,sourceFindings,sourceFindingsScope:'全30人原来源与候选正文通读后的六处明确互动来源缺口；不是完整L4批准，也不把所有模型soft提醒当成真错。',nextStep:'预算阻断或同错两修失败时停模型，交主会话规划一次；仅失败叶沿已有受控修订路径，原卡余额不重置。'};
await fs.writeFile(path.join(root,'first-real-review-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...report,rows:undefined,sourceFindings:sourceFindings.map(f=>({id:f.id,field:f.field}))}));
