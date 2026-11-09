// D12 卡 D：材料属性表（类别行与物品覆盖行）的审批入口：L1 确定性检查、L2 真实模型事实核对、L4 阅读记录核验。
// 沿用 a3w-props-approval 的冻结候选做法：候选就是盘上的数据，只请求审查，不请求改写；预算走 tools/content-budget.mjs
// 的单卡账（调用前按请求上界预留，累计到单卡上限即停并写 budgetStop），调用记录（请求、响应、费用）落在 draftRoot。
// L4 照内容管线规则（先例 tools/w5-rumors.mjs sampleL4/recordL4/approved）：人读（不调模型）——被标记项 + 随机 5 条（batch.sample）
// 须有阅读笔记；波次随机 10 条各给六项评分（整数 3–5，均分 ≥4）。--sample 抽签并列出要读的条目，--l4 <文件> 记录笔记与评分。
// 模型返回格式错只算该条一次失败（错误码 REVIEW_FORMAT，不是预算停止；预算停止会经 content-pipeline.mjs:178 拦住整轮）；
// 同一条最多发 3 次审查请求（1 初审 + 2 修正，requestTransform），仍错则该条转 manual。
// 修订 d12-matprops-2（亮圳 2026-11-09 12:11 批准、李白同意的整类修复）：数据改为结构化出处字段，含水、可食部分、能量由程序推算
// （server-plugin/item-class.mjs deriveFromSources）；之后每条按新 revision 再审。两项调整：
//  ①审查上限按 revision 计数——「每个 revision 内 1 次初审 + 2 次修正」，revision 由审查目录 review-<n> 区分，账本里请求标签
//    content-review-<n>-<id>-review<k> 按 n 计数，旧 revision 的记录与次数保留不删（checkReviewCap）；人工核定记录放在各 revision 自己的目录，对新 revision 自然失效。
//  ②卡账本 maxRequests 由 40 调到 60（追加约 19–20 次再审的批准额度），limitYuan 仍 1.5 元不变（grantMaxRequests，写入账本 authorizations，同 a3w-props 先例）。
//    两项同时记在 docs/决策.md「D12 材料属性整类修复」。
// 用法：node world/design/matprops-approval.mjs --l1 | --review | --sample | --l4 <json> | --verify   （--review 需环境变量 DEEPSEEK_API_KEY）
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomInt} from 'node:crypto';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline, hashContent, parseModelJSON} from '../../tools/content-pipeline.mjs';
import {loadRuntimeWorld} from '../../tools/load-world.mjs';
import {validateMaterialProps, deriveFromSources, MATERIAL_DIMENSIONS} from '../../server-plugin/item-class.mjs';

export const revisionNumber=2;
export const revision=`d12-matprops-${revisionNumber}`;
export const draftRoot='world/drafts/d12-matprops';
export const reviewDirName=`review-${revisionNumber}`;
export const reviewRoot=path.join(draftRoot,reviewDirName);
export const cardId='D12-MATPROPS';
export const cardLimitYuan=1.5, maxRequests=60, previousMaxRequests=40, maxOverrideRatio=0.15;
const readJSON=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const tableFile='world/meta/mechanics/material-props.json', overlayFile='world/meta/mechanics/items.json';

// 条目：每个类别行一条（class_<类别键>），每个物品覆盖行一条（物品 id）。
export async function entriesFor(){
 const table=await readJSON(tableFile),overlay=await readJSON(overlayFile);
 const classes=Object.entries(table.classes).map(([key,row])=>({id:`class_${key}`,kind:'material-props-class',key,row,source:{path:`${tableFile}#classes.${key}`,detail:row.basis}}));
 const items=Object.entries(overlay).filter(([,patch])=>patch.props).map(([id,patch])=>({id,kind:'material-props-item',row:patch.props,source:{path:`${overlayFile}#${id}.props`,detail:patch.props.basis}}));
 return [...classes,...items];
}
export const draftFor=entry=>({id:entry.id,row:structuredClone(entry.row)});
let worldCache;
const runtime=async()=>worldCache??=await loadRuntimeWorld();
// 上下文：表头单位与范围、饱腹换算说明；类别行带上属于该类别的物品（名称、重量、标签），物品行带上该物品自身与它所属的类别值。
export async function contextFor(entry){
 const world=await runtime(),table=await readJSON(tableFile);
 const dimensions=Object.fromEntries(Object.entries(table.dimensions).map(([k,v])=>[k,`${v.unit}，范围 ${v.min}–${v.max}`]));
 const brief=i=>({id:i.id,name:i.name,weight:i.weight,tags:i.tags});
 if(entry.kind==='material-props-class')return {dimensions,note:table.note,kcalPerSatiety:table.kcalPerSatiety,derived:deriveFromSources(entry.row,table.kcalPerSatiety),members:world.items.filter(i=>(i.tags??[]).includes(entry.key)).map(brief)};
 const item=world.items.find(i=>i.id===entry.id);
 return {dimensions,note:table.note,kcalPerSatiety:table.kcalPerSatiety,derived:deriveFromSources(entry.row,table.kcalPerSatiety),item:{...brief(item),use:item.use,description:item.description},classValues:Object.fromEntries((item.tags??[]).filter(t=>table.classes[t]).map(t=>[t,{row:table.classes[t],derived:deriveFromSources(table.classes[t],table.kcalPerSatiety)}]))};
}
export async function validateDraft(draft,entry){
 try{assert.deepEqual(draft,draftFor(entry));assert.ok(typeof entry.row.basis==='string'&&entry.row.basis.trim());return [];}
 catch{return ['候选须与盘上数据完全一致且带 basis'];}
}
export function reviewRequest(entry,draft,context){
 return {thinking:{type:'disabled'},temperature:0,max_tokens:1200,response_format:{type:'json_object'},messages:[
  {role:'system',content:'你是游戏世界物性数据的事实审查员。逐项核对材料属性行里每个数值：(1) 是否落在公认的真实世界范围内（对照 basis 里写的出处与你所知的权威数据：USDA FoodData Central、FAO、木材与燃料手册等）；(2) 是否与 basis 自己写的数字和算式一致；(3) 单位与含义是否符合 dimensions（含水率是水占鲜重的质量分数；能量密度是饱腹/kg 干物质，饱腹=kcal÷24 是本游戏的标定约定，不要质疑该约定本身，只核算术）；(4) 类别行的含水率与能量对 members 里的物品是否说得通。只返回 JSON {"contradictions":[{"quote":"basis 或数值原文","field":"维度名或 basis","severity":"hard|soft|style","reason":"具体原因，给出你认为的正确范围"}]}。hard 表示数值明显超出公认范围、算式错、单位错或出处与数值相反；取值在公认区间内但偏边缘、或出处无法确认的写 soft；不要因为 basis 没有穷举所有数据而报错，不要编造你不确定的数据库条目，不确定就用 soft 说明。无问题则空数组。reason 不超过 80 字。字符串内不要使用英文双引号，引用原文用「」。字段释义：basis 里并列多套口径——「鲜重 kcal/100g」「干物质 kcal/kg」「X kcal/g 干物质」「饱腹」，换算为：干物质 kcal/kg = 鲜重 kcal/100g × 10 ÷ (1−含水分数)；X kcal/g 干物质 = 1000X kcal/kg 干物质；饱腹/kg 干物质 = kcal/kg 干物质 ÷ 24。比较前先换到同一口径，不要把不同口径的数直接比。行内 sources 是出处原值（moistureFraction 含水分数、kcalPer100gWet 鲜重 kcal/100g、refuseFraction 不可食比例），selection 说明多出处时取平均（mean）还是取代表（representative）及理由；moisture、energyDensity、edibleFraction 由程序按出处推出，context.derived 给出推出值（含水取 3 位小数，能量 = 鲜重 kcal/100g × 10 ÷ (1−含水) ÷ kcalPerSatiety 取整）。'},
  {role:'user',content:JSON.stringify({entry:{id:entry.id,kind:entry.kind,row:entry.row},context})}]};
}
export function extractReview(response){
 try{
  const review=parseModelJSON(response);
  assert.ok(Array.isArray(review?.contradictions),'Missing contradictions array');
  for(const issue of review.contradictions){
   assert.ok(['hard','soft','style'].includes(issue.severity));
   for(const key of ['quote','field','reason'])assert.ok(typeof issue[key]==='string'&&issue[key].trim());
  }
  return review;
 }catch(error){throw Object.assign(new Error(`Invalid contradictions JSON: ${error.message}`),{code:'REVIEW_FORMAT'});}
}
const draftRequest=()=>{throw Error('候选已冻结；不请求模型改写');};
export async function l1(){
 const entries=await entriesFor(),world=await runtime(),errors=[];
 errors.push(...validateMaterialProps(world));
 for(const e of entries)errors.push(...(await validateDraft(draftFor(e),e)).map(x=>`${e.id}: ${x}`));
 const overrides=entries.filter(e=>e.kind==='material-props-item').length;
 if(overrides/world.items.length>maxOverrideRatio)errors.push(`覆盖行占物品总数 ${overrides}/${world.items.length} 超过 ${maxOverrideRatio*100}%：类别划得不对，回头改类别`);
 assert.deepEqual(errors,[]);
 return {L1:'passed',entries:entries.length,overrides,items:world.items.length};
}
const batchFile=path.join(reviewRoot,'batch-0.json'),selectionFile=path.join(reviewRoot,'l4-selection.json');
export async function sampleL4(){
 const batch=await readJSON(batchFile),entries=await entriesFor();
 const st=await summarizeApproval(entries);
 if(st.unresolved.length)throw Error(`尚有条目既未通过 L2 也无人工核定：${st.unresolved.join(',')}`);
 const pool=[...batch.ids];for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 const selection={fingerprint:batch.fingerprint,wave:pool.slice(0,10),read:[...new Set([...batch.sample,...batch.flagged,...pool.slice(0,10)])]};
 await fs.writeFile(selectionFile,JSON.stringify(selection,null,2)+'\n');
 return selection;
}
export async function recordL4(file,reviewer){
 const batch=await readJSON(batchFile),selection=await readJSON(selectionFile),notes=await readJSON(file);
 if(selection.fingerprint!==batch.fingerprint||selection.read.some(id=>!notes.notes?.some(r=>r.id===id&&r.note?.trim()))||selection.wave.some(id=>!notes.wave?.some(r=>r.id===id)))throw Error('L4 缺少实际抽样阅读或评分');
 batch.l4={approved:true,reviewer,notes:notes.notes,wave:notes.wave};
 await fs.writeFile(batchFile,JSON.stringify(batch,null,2)+'\n');
 return batch.l4;
}
export function checkWave(wave,ids){
 if(wave?.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.includes(r.id)||r.scores?.length!==6||r.scores.some(x=>!Number.isInteger(x)||x<3||x>5)||!r.note?.trim())||wave.flatMap(r=>r.scores).reduce((a,c)=>a+c,0)/60<4)throw Error('L4 波次随机 10 条六项评分不达标');
}
// 人工核定：L2 已达同条上限仍有 hard 意见、经主会话复算认定为模型误判的条目。与 L2 通过分开记录、分开计数，不改 L2 规则与阈值。
// 只接受：指纹与当前数据一致、带复算算式、有不同于复算者的独立审查者确认、日期、固定标注。
export const manualFile=path.join(reviewRoot,'manual-verified.json');
// 两种固定标注：reviewed = 当前数据被 L2 审过且 hard 意见自撤（记录指纹须等于核定指纹且有 review）；
// unreviewed = 同条上限后数据有改动、未再经 L2（须写明上次 L2 记录的指纹与改动内容）。
export const manualLabels={reviewed:'人工核定、模型误判',unreviewed:'人工核定、未经L2复审'};
export const manualLabel=manualLabels.reviewed;
const loadRecordDefault=id=>readJSON(path.join(reviewRoot,`${id}.json`)).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
export const fingerprintOf=async entry=>hashContent({entry,context:await contextFor(entry),revision});
export async function checkManual(doc,entries,fingerprint=fingerprintOf,loadRecord=loadRecordDefault){
 const ok=new Map();
 for(const r of doc?.entries??[]){
  const entry=entries.find(e=>e.id===r.id);
  if(!entry)throw Error(`人工核定的条目不存在：${r.id}`);
  if(ok.has(r.id))throw Error(`人工核定重复：${r.id}`);
  if(r.fingerprint!==await fingerprint(entry))throw Error(`人工核定指纹与当前数据不符：${r.id}`);
  for(const k of ['recompute','recomputedBy','confirmedBy'])if(typeof r[k]!=='string'||!r[k].trim())throw Error(`人工核定缺 ${k}：${r.id}`);
  if(r.confirmedBy===r.recomputedBy)throw Error(`人工核定缺独立审查者确认（确认者不得是复算者）：${r.id}`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date??''))throw Error(`人工核定缺日期：${r.id}`);
  if(!Object.values(manualLabels).includes(r.label))throw Error(`人工核定缺固定标注（${Object.values(manualLabels).join('／')}）：${r.id}`);
  const rec=await loadRecord(r.id);
  if(r.label===manualLabels.reviewed&&!(rec?.review&&rec.fingerprint===r.fingerprint))throw Error(`标注「${r.label}」要求现存 L2 记录审的是当前数据（指纹相同且有 review）：${r.id}`);
  if(r.label===manualLabels.unreviewed){
   for(const k of ['lastL2Fingerprint','changeDescription'])if(typeof r[k]!=='string'||!r[k].trim())throw Error(`标注「${r.label}」缺 ${k}（上次 L2 记录的指纹与改动内容）：${r.id}`);
   if(r.lastL2Fingerprint===r.fingerprint)throw Error(`上次 L2 记录指纹与当前相同，应用「${manualLabels.reviewed}」：${r.id}`);
  }
  ok.set(r.id,r);
 }
 return ok;
}
const hardIssues=record=>(record?.review?.contradictions??[]).filter(c=>c.severity==='hard');
// 同 content-pipeline.mjs reviewIssues / readApprovedContent：passed 记录必须有 errors 数组，review 结构合法，否则抛错。
function checkPassedRecord(rec){
 if(!Array.isArray(rec.errors))throw Error(`记录缺 errors 字段：${rec.id}`);
 if(!Array.isArray(rec.review?.contradictions))throw Error(`事实审查缺少 contradictions 数组：${rec.id}`);
 for(const c of rec.review.contradictions)if(!['hard','soft','style'].includes(c.severity)||!['quote','field','reason'].every(k=>typeof c[k]==='string'&&c[k].trim()))throw Error(`事实审查的原句、字段、严重度或原因无效：${rec.id}`);
}
// 每条要么 L2 通过（记录 passed、指纹一致、无错、无 hard），要么人工核定；两类分开列出。
export async function approvalState(entries,{manual=new Map(),loadRecord=id=>readJSON(path.join(reviewRoot,`${id}.json`)).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)),fingerprint=fingerprintOf}={}){
 const out={l2:[],manual:[],unresolved:[]};
 for(const e of entries){
  const rec=await loadRecord(e.id);
  if(rec?.status==='passed'&&rec.fingerprint===await fingerprint(e)){checkPassedRecord(rec);if(!rec.errors.length&&!hardIssues(rec).length)out.l2.push(e.id);else if(manual.has(e.id))out.manual.push(e.id);else out.unresolved.push(e.id);}
  else if(manual.has(e.id))out.manual.push(e.id);
  else out.unresolved.push(e.id);
 }
 return out;
}
export async function summarizeApproval(entries){
 const doc=await readJSON(manualFile).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 const st=await approvalState(entries,{manual:await checkManual(doc,entries)});
 await fs.writeFile(path.join(reviewRoot,'approval-summary.json'),JSON.stringify({rule:'人工核定条目不计入人工队列比例（needsSystemicRepair），其余检查同 readApprovedContent；规则解释待李白确认',total:entries.length,l2Passed:st.l2,manualVerified:st.manual,unresolved:st.unresolved},null,2)+'\n');
 return st;
}
// verify：L1 必过；每条 L2 通过或人工核定；批次检查与 content-pipeline.mjs readApprovedContent 逐项等价：
// ①读 summary.json，逐批核对批指纹（summary 与 batch 文件一致）、L4 已批准、ids 清单、行内容哈希；②sample 与 flagged 的阅读笔记；
// ③条目都在已审查批次里；④记录指纹、无错、无 hard。另加波次随机 10 条六项评分（checkWave）。
// 唯一差别（规则解释待李白确认）：已人工核定的条目允许记录状态不是 passed，且不计入人工队列比例（needsSystemicRepair）——
// 它们已核定，不在待处理队列里；未决条目为空才通过。该差别同样写在 approval-summary.json 的 rule 字段。
export async function verifyPublished(){
 await l1();
 const entries=await entriesFor(),summary=await readJSON(path.join(reviewRoot,'summary.json'));
 const st=await summarizeApproval(entries);
 assert.deepEqual(st.unresolved,[],'尚有条目既未通过 L2 也无人工核定');
 const summaryIds=summary.batches.flatMap(b=>b.ids??[]);
 if(new Set(summaryIds).size!==summaryIds.length)throw Error('发布编号重复（摘要批次 ids）');
 const inBatch=new Set(),rowsById=new Map();
 for(const b of summary.batches){
  const current=await readJSON(path.join(reviewRoot,`batch-${b.index}.json`));
  if(!current?.l4?.approved||current.fingerprint!==b.fingerprint)throw Error(`批 ${b.index} 尚未完成 L4 或批指纹与摘要不符`);
  if(!Array.isArray(current.ids))throw Error('批次缺少条目清单');
  const rows=await Promise.all(current.ids.map(id=>readJSON(path.join(reviewRoot,`${id}.json`))));
  if(rows.some(r=>!r)||hashContent(rows.map(r=>({id:r.id,draft:r.draft,review:r.review,status:r.status})))!==current.fingerprint)throw Error(`批 ${b.index} 审查后内容已改变`);
  for(const id of [...current.sample,...current.flagged])if(!current.l4.notes?.some(r=>r.id===id&&typeof r.note==='string'&&r.note.trim()))throw Error(`缺少 L4 阅读记录 ${id}`);
  checkWave(current.l4.wave,entries.map(e=>e.id));
  for(const r of rows){if(inBatch.has(r.id))throw Error(`发布编号重复 ${r.id}`);inBatch.add(r.id);rowsById.set(r.id,r);}
 }
 for(const e of entries)if(!inBatch.has(e.id)||!summaryIds.includes(e.id))throw Error(`条目不在已审查批次 ${e.id}`);
 for(const id of st.l2)assert.deepEqual(rowsById.get(id).draft,draftFor(entries.find(e=>e.id===id)),`${id} 盘上数据与审批回执不符`);
 // 人工核定条目：核定记录里的指纹 = hash(条目内容, 上下文, revision)，checkManual 已要求它等于当前数据的指纹，
 // 所以盘上数据与核定时数据一致已由指纹证明（pipeline 记录里的 draft 对这些条目是旧数据或 null，不作比对）。
 return {total:entries.length,l2Passed:st.l2.length,manualVerified:st.manual,dimensions:MATERIAL_DIMENSIONS.length};
}
// 管线规则：每个 revision 内 1 次初审 + 最多 2 次定点修正；按条目 id 与 revision（审查目录名）累计账本里已发出的审查。
// 旧 revision 的请求标签（content-review-1-…）不计入当前 revision，也不删除。
export const maxReviewsPerEntry=1+2;
export function checkReviewCap(ledger,id,dirName=reviewDirName){
 const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const label=new RegExp(`^content-${esc(dirName)}-${esc(id)}-review\\d+$`);
 const sent=Object.values(ledger?.requests??{}).filter(r=>label.test(r.label??'')&&['sent','settled','unknown'].includes(r.status));
 if(sent.length>=maxReviewsPerEntry)throw Object.assign(new Error(`同条审核在 ${dirName} 内已达 ${maxReviewsPerEntry} 次（初审+2次修正）：${id}`),{code:'REVIEW_LIMIT'});
}
// 亮圳 2026-11-09 12:11 批准：卡账本 maxRequests 40 → 60，limitYuan 仍 1.5。幂等；账本其余字段不动，旧请求与花费保留。
export const grantId='d12-matprops-2-maxrequests-60';
export function grantMaxRequests(ledger){
 const out=structuredClone(ledger),card=out.cards?.[cardId];
 if(!card)throw Error('缺卡账本');
 if(out.authorizations?.some(a=>a.id===grantId)){assert.equal(card.maxRequests,maxRequests);return out;}
 if(card.maxRequests!==previousMaxRequests||card.limitYuan!==cardLimitYuan||card.reservedYuan!==0||out.reservedYuan!==0)throw Error('卡账本与批准时的快照不符，拒绝调整');
 out.authorizations??=[];
 out.authorizations.push({id:grantId,source:'亮圳 2026-11-09 12:11 批准、李白同意：D 卡整类修复后每条再审 1 次，maxRequests 40→60，limitYuan 仍 1.5 元，只限这一轮',
  before:{maxRequests:card.maxRequests,limitYuan:card.limitYuan,spentYuan:card.spentYuan,requests:Object.keys(out.requests??{}).length},after:{maxRequests,limitYuan:cardLimitYuan},at:new Date().toISOString()});
 card.maxRequests=maxRequests;
 return out;
}
async function authorizeIncrease(){
 const file=path.join(draftRoot,'budget.json'),ledger=await readJSON(file),next=grantMaxRequests(ledger);
 if(JSON.stringify(next)!==JSON.stringify(ledger))await fs.writeFile(file,JSON.stringify(next,null,2)+'\n');
}
async function capReviews({body,entry,phase}){
 if(phase!=='review')return {body};
 let ledger;try{ledger=await readJSON(path.join(draftRoot,'budget.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 checkReviewCap(ledger,entry.id);
 return {body};
}
export async function run(args=process.argv.slice(2)){
 if(args.includes('--l1'))console.log(JSON.stringify(await l1()));
 if(args.includes('--review')){
  await l1();
  await authorizeIncrease();
  const entries=await entriesFor();
  console.log(JSON.stringify({pid:process.pid,mode:'review',entries:entries.length}));
  const {summary}=await runContentPipeline({entries,root:reviewRoot,budgetRoot:draftRoot,revision,contextFor,
   validateDraft,reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:draftRequest,buildReviewRequest:reviewRequest,extractReview,
   requestTransform:capReviews,client:new DeepSeekClient({budgetYuan:cardLimitYuan,logFile:path.join(draftRoot,'usage.jsonl')}),cardId,
   allocation:{cardId,incrementLimitYuan:cardLimitYuan,maxRequests,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:25});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards[cardId]}));
 }
 if(args.includes('--sample'))console.log(JSON.stringify(await sampleL4()));
 if(args.includes('--l4'))console.log(JSON.stringify(await recordL4(args[args.indexOf('--l4')+1],'主会话人读')));
 if(args.includes('--verify'))console.log(JSON.stringify(await verifyPublished()));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
