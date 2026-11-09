// D12 卡 D：材料属性表（类别行与物品覆盖行）的审批入口：L1 确定性检查、L2 真实模型事实核对、L4 阅读记录核验。
// 沿用 a3w-props-approval 的冻结候选做法：候选就是盘上的数据，只请求审查，不请求改写；预算走 tools/content-budget.mjs
// 的单卡账（调用前按请求上界预留，累计到单卡上限即停并写 budgetStop），调用记录（请求、响应、费用）落在 draftRoot。
// L4 照内容管线规则（先例 tools/w5-rumors.mjs sampleL4/recordL4/approved）：人读（不调模型）——被标记项 + 随机 5 条（batch.sample）
// 须有阅读笔记；波次随机 10 条各给六项评分（整数 3–5，均分 ≥4）。--sample 抽签并列出要读的条目，--l4 <文件> 记录笔记与评分。
// 模型返回格式错只算该条一次失败（错误码 REVIEW_FORMAT，不是预算停止；预算停止会经 content-pipeline.mjs:178 拦住整轮）；
// 审查输出一致性：每条 contradiction 须带 verdict（conflict|no_conflict）；severity=hard 而 verdict=no_conflict（先报后自撤）判无效输出 REVIEW_INCONSISTENT，
// 该条自动重试 1 次，仍矛盾则转 manual（原因写进记录）；不改 L2 判据。
// 同一条最多发 3 次审查请求（1 初审 + 2 修正，requestTransform），仍错则该条转 manual。
// 修订 d12-matprops-2（亮圳 2026-11-09 12:11 批准、李白同意的整类修复）：数据改为结构化出处字段，含水、可食部分、能量由程序推算
// （server-plugin/item-class.mjs deriveFromSources）；之后每条按新 revision 再审。两项调整：
//  ①审查上限按 revision 计数——「每个 revision 内 1 次初审 + 2 次修正」，revision 由审查目录 review-<n> 区分，账本里请求标签
//    content-review-<n>-<id>-review<k> 按 n 计数，旧 revision 的记录与次数保留不删（checkReviewCap）；人工核定记录放在各 revision 自己的目录，对新 revision 自然失效。
//  ②卡账本 maxRequests 由 40 调到 60（追加约 19–20 次再审的批准额度；李白 2026-11-09 13:1x 口径修正后再批 60→75，只用于口径修正后的复审，到额自动停），limitYuan 仍 1.5 元不变（grantMaxRequests，写入账本 authorizations，同 a3w-props 先例）。
//    两项同时记在 docs/决策.md「D12 材料属性整类修复」。
// 审查解析失败即停：extractReview 抛出任何错误（REVIEW_FORMAT、没有 code 的意外异常）都使本次 --review 立即停止后续所有条目的请求（reviewStops，经流水线通用参数 stopOnReviewError），
// 已发请求的记录照常写盘，输出报明条目与错误；REVIEW_INCONSISTENT 沿用上面"重试 1 次"的既定规则，不算解析失败。
// --rejudge [--dry-run]：d3228afb 的 extractReview 作用域错误使 2026-11-09T15:19:49Z 之后的审查回复全被丢弃；按已保存的原始回复离线重放判定（0 新调用，不动账本）。
// --retry-garlic：一次性授权（retryGrants），仅 item_garlic 在 --rejudge 评估为 retryEligible（当前 revision 内全部已保存审查回复都解析不出判定）后可多发 1 次审查，单次金额上限 0.015 元（李白 16:1x 原定 0.01 元，按账本口径预留上界约 0.0145 元超限，李白 2026-11-09 选 A 仅此一条这一次提到 0.015 元；其他条目单次上限仍 0.01 元，卡总额仍 1.5 元；用较小的 max_tokens 压低预留上界）。用完即无余量（次数按账本标签计），不留可复用的放宽。
// 修订 d12-condiment-1（调味佐餐类与新维度 mealCap：单餐可食量上限）：新增类别行与物品覆盖行另开一张卡 D12-CONDIMENT，账本、调用记录、审查记录都与 D 卡分开
// （world/drafts/d12-condiment/ 下自己的 budget.json、usage.jsonl、review-1/；revision 另起，D 卡已审条目的指纹逐字不变），外部模型核对上限 1.0 元，到额自动停（单卡与共享上限都是 1.0 元）。
// 授权来源：李白 2026-11-09 16:5x，亮圳给李白的 5 元小额授权内，单列 1.0 元，不挪用 D 卡。条目范围 = 在 D 卡 review-2 里没有审查记录的条目（condimentEntries）。
// 用法：--review --card condiment（只发上述条目的审查，需 DEEPSEEK_API_KEY）；--card condiment --budget 只读账本（不发请求）。
// 用法：node world/design/matprops-approval.mjs --l1 [--show id,..] | --review [--redo id,..] | --rejudge [--dry-run] | --retry-garlic | --sample | --l4 <json> | --verify   （--review/--retry-garlic 需环境变量 DEEPSEEK_API_KEY）
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomInt} from 'node:crypto';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline, hashContent, parseModelJSON} from '../../tools/content-pipeline.mjs';
import {reserveCeilingYuan} from '../../tools/content-budget.mjs';
import {loadRuntimeWorld} from '../../tools/load-world.mjs';
import {validateMaterialProps, deriveFromSources, memberValues, memberDeviations, MATERIAL_DIMENSIONS} from '../../server-plugin/item-class.mjs';

export const revisionNumber=2;
export const revision=`d12-matprops-${revisionNumber}`;
export const draftRoot='world/drafts/d12-matprops';
export const reviewDirName=`review-${revisionNumber}`;
export const reviewRoot=path.join(draftRoot,reviewDirName);
export const cardId='D12-MATPROPS';
export const cardLimitYuan=1.5, maxRequests=130, maxOverrideRatio=0.15;
// 调味佐餐卡（D12-CONDIMENT）：与 D 卡互不影响的独立账（自己的 budget.json 与 usage.jsonl），额度 1.0 元，条目上限 = 条目数 × 每条每 revision 最多 3 次。
export const condimentCard={
 id:'d12-condiment',cardId:'D12-CONDIMENT',revision:'d12-condiment-1',draftRoot:'world/drafts/d12-condiment',reviewDirName:'review-1',
 limitYuan:1.0,maxRequests:60,
 source:'李白 2026-11-09 16:5x：亮圳给李白的 5 元小额授权内，单列 1.0 元，不挪用 D 卡'};
condimentCard.reviewRoot=path.join(condimentCard.draftRoot,condimentCard.reviewDirName);
condimentCard.allocation={cardId:condimentCard.cardId,incrementLimitYuan:condimentCard.limitYuan,maxRequests:condimentCard.maxRequests,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0};
// 本卡初始账本（共享额度与单卡额度同为 1.0 元，授权来源写入 authorizations）；只在账本文件不存在时由 --review --card condiment 创建，不动 D 卡账本。
export const condimentInitialLedger=()=>({spentYuan:0,reservedYuan:0,limitYuan:condimentCard.limitYuan,waveLimitYuan:condimentCard.limitYuan,
 note:'D12-CONDIMENT 独立账：与 D12-MATPROPS 的 world/drafts/d12-matprops/budget.json 互不影响',
 cards:{[condimentCard.cardId]:{limitYuan:condimentCard.limitYuan,spentYuan:0,reservedYuan:0,maxRequests:condimentCard.maxRequests}},requests:{},historicalUnallocatedSpentYuan:0,
 authorizations:[{id:'d12-condiment-limit-1.0',source:condimentCard.source,after:{limitYuan:condimentCard.limitYuan,maxRequests:condimentCard.maxRequests}}]});
const readJSON=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const tableFile='world/meta/mechanics/material-props.json', overlayFile='world/meta/mechanics/items.json';

// 条目：每个类别行一条（class_<类别键>），每个物品覆盖行一条（物品 id）。
export async function entriesFor(){
 const table=await readJSON(tableFile),overlay=await readJSON(overlayFile);
 const classes=Object.entries(table.classes).map(([key,row])=>({id:`class_${key}`,kind:'material-props-class',key,row,source:{path:`${tableFile}#classes.${key}`,detail:row.basis}}));
 const items=Object.entries(overlay).filter(([,patch])=>patch.props).map(([id,patch])=>({id,kind:'material-props-item',row:patch.props,source:{path:`${overlayFile}#${id}.props`,detail:patch.props.basis}}));
 return [...classes,...items];
}
// 条目分卡（显式范围，不看记录文件在不在）：D 卡条目 = D 卡已冻结批次 review-2/batch-*.json 的 ids 并集；调味佐餐卡条目 = 其余。
// 归档、重审、重问只动记录文件，不动冻结批次，所以不会改变归属。三个函数都可注入批次来源（batches：批次对象数组）。
export const cardIdsOf=batches=>new Set((batches??[]).flatMap(b=>b.ids??[]));
export const splitByCard=(entries,dIds)=>({d:entries.filter(e=>dIds.has(e.id)),condiment:entries.filter(e=>!dIds.has(e.id))});
export async function frozenDBatches(root=path.join('world/drafts/d12-matprops','review-2')){
 const files=(await fs.readdir(root)).filter(f=>/^batch-[0-9]+[.]json$/.test(f)).sort();
 return Promise.all(files.map(f=>readJSON(path.join(root,f))));
}
// 从 D 卡移到调味卡重审的条目：D 卡冻结批次里的条目，因类别行新增单餐量而指纹变了（moved-from-d.json 记着它们在 D 卡审查时的指纹，
// 现在的指纹必须与之不同才算数，见 checkMoved）。它们改在调味卡下重审，费用记 d12-condiment；D 卡其余条目原样。
export const movedFile=path.join(condimentCard.draftRoot,'moved-from-d.json');
export async function loadMoved(file=movedFile){return (await readJSON(file).catch(e=>e.code==='ENOENT'?{entries:[]}:Promise.reject(e))).entries.map(e=>e.id);}
export async function checkMoved(entries,doc,fingerprint=fingerprintOf){
 for(const m of doc.entries){
  const e=entries.find(x=>x.id===m.id);
  if(!e)throw Error(`移交条目不存在：${m.id}`);
  if(await fingerprint(e)===m.oldFingerprint)throw Error(`移交条目指纹没变，应留在 D 卡：${m.id}`);
 }
 return doc.entries.map(m=>m.id);
}
export async function dEntries(entries,{batches,moved}={}){const all=entries??await entriesFor(),m=new Set(moved??await loadMoved());return splitByCard(all,cardIdsOf(batches??await frozenDBatches())).d.filter(e=>!m.has(e.id));}
export async function condimentEntries(entries,{batches,moved}={}){const all=entries??await entriesFor(),m=new Set(moved??await loadMoved()),r=splitByCard(all,cardIdsOf(batches??await frozenDBatches()));return [...r.d.filter(e=>m.has(e.id)),...r.condiment];}
export const draftFor=entry=>({id:entry.id,row:structuredClone(entry.row)});
let worldCache;
const runtime=async()=>worldCache??=await loadRuntimeWorld();
// 指纹 = hashContent({entry, context, revision})（tools/content-pipeline.mjs:89），entry 与下面的上下文逐字进指纹。
// 上下文里只放影响审查内容的表头字段：dimensions（单位与范围）、kcalPerSatiety（推算除数）、note（修订 2 审查时的原文，冻结——
// 改它会使全部条目指纹作废，新的说明文字写在表头 selectionRule，不进上下文）；memberDeviationThreshold 只决定哪些成员须有覆盖行（L1），
// 不进任何条目的推算与上下文，所以不进指纹。类别行带上属于该类别的物品（名称、重量、标签），物品行带上该物品自身与它所属的类别值。
// 物品覆盖行审的是它自己的含水与能量对类别值的偏离，单餐量（mealGrams/mealBasis/mealCap/mealDry）与它无关：
// 类别行后来加了单餐量，不让物品条目的上下文（指纹）跟着变，已审的物品覆盖行结论不作废。
const withoutCap=({mealCapBasis,...row})=>({...row,sources:row.sources?.map(({mealGrams,mealBasis,mealCitation,eatenMoistureFraction,...x})=>x)});
const withoutCapDerived=({mealCap,mealDry,...d})=>d;
export async function contextFor(entry){
 const world=await runtime(),table=await readJSON(tableFile);
 // mealCap（单餐可食量上限）是后加的维度：只在用到它的条目（出处写了 mealGrams 或类别里有它）的上下文里出现，
 // 其余条目的上下文与加这个维度之前逐字相同，已审结论的指纹不因新维度作废。
 const usesCap=entry.row?.sources?.some(x=>x?.mealGrams!==undefined)||false;
 const dimensions=Object.fromEntries(Object.entries(table.dimensions).filter(([k])=>k!=='mealCap'||usesCap).map(([k,v])=>[k,`${v.unit}，范围 ${v.min}–${v.max}`]));
 if(usesCap)dimensions.mealsPerDay=`${table.mealsPerDay} 餐/人·日（把单餐上限换成一段时间总量的换算）`;
 const brief=i=>({id:i.id,name:i.name,weight:i.weight,tags:i.tags});
 if(entry.kind==='material-props-class')return {dimensions,note:table.note,kcalPerSatiety:table.kcalPerSatiety,derived:deriveFromSources(entry.row,table.kcalPerSatiety),members:world.items.filter(i=>(i.tags??[]).includes(entry.key)).map(brief)};
 const item=world.items.find(i=>i.id===entry.id);
 return {dimensions,note:table.note,kcalPerSatiety:table.kcalPerSatiety,derived:deriveFromSources(entry.row,table.kcalPerSatiety),item:{...brief(item),use:item.use,description:item.description},classValues:Object.fromEntries((item.tags??[]).filter(t=>table.classes[t]).map(t=>[t,{row:withoutCap(table.classes[t]),derived:withoutCapDerived(deriveFromSources(table.classes[t],table.kcalPerSatiety))}]))};
}
export async function validateDraft(draft,entry){
 try{assert.deepEqual(draft,draftFor(entry));assert.ok(typeof entry.row.basis==='string'&&entry.row.basis.trim());return [];}
 catch{return ['候选须与盘上数据完全一致且带 basis'];}
}
export function reviewRequest(entry,draft,context){
 return {thinking:{type:'disabled'},temperature:0,max_tokens:1200,response_format:{type:'json_object'},messages:[
  {role:'system',content:'你是游戏世界物性数据的事实审查员。逐项核对材料属性行里每个数值：(1) 是否落在公认的真实世界范围内（对照 basis 里写的出处与你所知的权威数据：USDA FoodData Central、FAO、木材与燃料手册等）；(2) 是否与 basis 自己写的数字和算式一致；(3) 单位与含义是否符合 dimensions（含水率是水占鲜重的质量分数；能量密度是饱腹/kg 干物质，饱腹=kcal÷24 是本游戏的标定约定，不要质疑该约定本身，只核算术）；(4) 类别行的含水率与能量对 members 里的物品是否说得通。只返回 JSON {"contradictions":[{"quote":"basis 或数值原文","field":"维度名或 basis","verdict":"conflict|no_conflict","severity":"hard|soft|style","reason":"具体原因，给出你认为的正确范围"}]}。hard 表示数值明显超出公认范围、算式错、单位错或出处与数值相反；取值在公认区间内但偏边缘、或出处无法确认的写 soft；不要因为 basis 没有穷举所有数据而报错，不要编造你不确定的数据库条目，不确定就用 soft 说明。无问题则空数组。核算后发现无误的项不要列入；若一定要列，verdict 与 severity 必须都写 no_conflict，绝不能写 hard 又在理由里说无误（程序只看这两个字段，不看理由文字）。verdict 先定：核算后确有矛盾写 conflict，核算后发现无误或应撤回写 no_conflict；severity 为 hard 时 verdict 必须是 conflict，核算无误的项不要列入；若列入，verdict 与 severity 都写 no_conflict。reason 不超过 80 字。字符串内不要使用英文双引号，引用原文用「」。字段释义：basis 里并列多套口径——「鲜重 kcal/100g」「干物质 kcal/kg」「X kcal/g 干物质」「饱腹」，换算为：干物质 kcal/kg = 鲜重 kcal/100g × 10 ÷ (1−含水分数)；X kcal/g 干物质 = 1000X kcal/kg 干物质；饱腹/kg 干物质 = kcal/kg 干物质 ÷ 24。比较前先换到同一口径，不要把不同口径的数直接比。行内 sources 是出处原值（moistureFraction 含水分数、kcalPer100gWet 鲜重 kcal/100g、refuseFraction 不可食比例），每个出处代表类别的一个成员；selection.method 为 mean 时，各成员（出处）分别推算含水、干物质比例、干基能量与能量，再对各成员的推算结果取平均（没有取代表的方式）；为 single 时只有一个出处，按它自身推算。moisture、energyDensity、edibleFraction 由程序推出，context.derived 给出推出值：含水取 3 位小数；成员的干基能量 = 鲜重 kcal/100g × 10 ÷ (1−该成员含水) ÷ kcalPerSatiety，类别值为各成员干基能量的平均并取整。severity 为 hard 的项必须带 kind：arithmetic（核算题：含水、可食部分、能量、单餐量、饱腹等能由出处数值算出的量）或 fact（出处数据本身是否符合权威数据库实值，如某食材的含水量）。kind=arithmetic 还必须带 claimedValue（你认为正确的数，数字）、claimedFormula（你的算式，字符串）、target（被质疑的量：moisture、energyDensity、edibleFraction、mealCap，或 basis.satiety、basis.kcal、basis.dryEnergy）、claimedInputs（你计算所用的输入：派生维度写成 {出处名:{输入名:值}}，basis.* 直接写 {输入名:值}；输入名按 target：moisture 用 moistureFraction，edibleFraction 用 refuseFraction，energyDensity 用 moistureFraction 与 kcalPer100gWet，mealCap 用 mealGrams，basis.satiety 与 basis.kcal 用 kcalPer100gWet，basis.dryEnergy 用 kcalPer100gWet 与 moistureFraction）；field 必须与 target 对应（派生维度 field 等于 target，basis.* 的 field 写 basis）；如果你认为出处里的输入数据本身不对（例如含水量应是别的值），那是 fact，不是 arithmetic，写 kind=fact；mealCap 对干物质基准的类（谷、豆、果、菌）不能作算术目标，质疑它请写 fact；target 为 basis.* 时另带 source（出处 name），basis.satiety 与 basis.kcal 另带 grams（所算的克数，数字）。kind=fact 不填这些字段。程序会用不靠模型的推算复核你给的数；算不清就不要标 hard。'},
  {role:'user',content:JSON.stringify({entry:{id:entry.id,kind:entry.kind,row:entry.row},context})}]};
}
// ---- 结构化核对（李白 2026-11-09 决定）：AI 判 hard 的项必须说明是算术题还是事实题，算术题由程序用不靠 AI 的推算复核 ----
// kind=arithmetic：带 claimedValue（数）、claimedFormula（串）、target。target 为派生维度（moisture、edibleFraction、energyDensity、mealCap，
// 用 deriveFromSources 推算）或 basis.satiety / basis.kcal / basis.dryEnergy（basis 里写的量，用行内 sources 按同一公式推算；须带 source 出处名，satiety 与 kcal 另带 grams）。
// 取整口径 = 程序推算自己的口径，无另设容差：moisture、edibleFraction 3 位小数，energyDensity 取整到个位，mealCap 1 位小数（同 deriveFromSources）；
// basis.satiety 2 位小数、basis.kcal 1 位小数、basis.dryEnergy 取整（与 AI 在 basis 里惯用的写法同级）。AI 的 claimedValue 先取到同一口径再比，相等才算同值。
// 判定（详见 programClaim）：AI 的输入与出处逐项一致、按同一公式重算与 claimedValue 不同 = 「程序判定 AI 误判」（misjudged）；输入与出处不一致 = 质疑数据，转 fact；
// 推算与原数据不一致 = 真错（data-error）；claimedValue 与推算相同却仍标 hard = 说不清哪里错，保守当真 hard（agrees）。basis.*——用 AI 自己给的克数/出处算，claimedValue 与推算不同 = AI 自己算错（misjudged），相同 = 保守当真 hard。
// kind=fact：出处数据本身是否符合权威实值，不是算术题，程序不能自动放行（李白：事实题不能自动放行）。一旦判 hard，该条无论有没有编号、重问后结果如何都不计 L2 通过：
// 有编号时重问 1 次，只为收集 AI 按编号核对的意见；重问后程序追加一条 hard「待按编号人工核对」（附编号与 AI 两次意见，review.factPending），状态 manual。
// 缺 kind、缺 claimedValue/claimedFormula/target/claimedInputs（含 target 所需的输入项）、field 与 target 不对应、target 推不出来 = REVIEW_FORMAT，不能放行。AI 的输入与出处不一致 = 它在质疑数据，转 fact 路径。
export const issueKinds=['arithmetic','fact'];
const round3=x=>Math.round(x*1000)/1000,round2=x=>Math.round(x*100)/100,round1=x=>Math.round(x*10)/10;
// field 与 target 须对应：派生维度时 field 等于 target；basis.* 时 field 为 basis。claimedInputs = AI 计算所用的输入，按 target 逐项列出（inputs）：
// 派生维度写成 {出处名:{输入名:值}}（single 只需第一个出处，mean 需全部出处）；basis.* 直接写 {输入名:值}，并带 source（出处名）。
export const claimTargets={
 moisture:{grid:round3,inputs:['moistureFraction']},edibleFraction:{grid:round3,inputs:['refuseFraction']},energyDensity:{grid:Math.round,inputs:['moistureFraction','kcalPer100gWet']},mealCap:{grid:round1,inputs:['mealGrams']},
 'basis.satiety':{grid:round2,grams:true,inputs:['kcalPer100gWet'],formula:'grams × kcalPer100gWet ÷ 100 ÷ kcalPerSatiety',calc:(x,g,k)=>x.kcalPer100gWet===undefined?undefined:g*x.kcalPer100gWet/100/k},
 'basis.kcal':{grid:round1,grams:true,inputs:['kcalPer100gWet'],formula:'grams × kcalPer100gWet ÷ 100',calc:(x,g)=>x.kcalPer100gWet===undefined?undefined:g*x.kcalPer100gWet/100},
 'basis.dryEnergy':{grid:Math.round,inputs:['kcalPer100gWet','moistureFraction'],formula:'kcalPer100gWet × 10 ÷ (1 − moistureFraction) ÷ kcalPerSatiety',calc:(x,g,k)=>memberValues(x,k).e}};
// 程序对一条 arithmetic 项的推算与判定；缺字段或推不出来抛错（由 extractReview 转成 REVIEW_FORMAT）。verdict：
//  misjudged = AI 的输入与出处逐项一致，按同一公式重算与它的 claimedValue 不同（AI 自己算错）；
//  disputes-input = AI 的输入与出处不一致（它在质疑数据本身）：转 fact 路径，不自动放行；
//  data-error = 行里另存的值与出处推算不一致；agrees = 输入一致、值也相同却标 hard（说不清）；
//  not-comparable = mealCap 对干物质基准的类（grain、fruit、legume、mushroom 等 mealBasis=dryMatter）没有鲜重推算路径，不比对，按真 hard 转人工（不判格式错，免得整轮停）。
const sameNum=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-9;
export function programClaim(c,entry,kcalPerSatiety){
 assert.ok(Number.isFinite(c.claimedValue),'arithmetic 项缺 claimedValue（数）');
 assert.ok(typeof c.claimedFormula==='string'&&c.claimedFormula.trim(),'arithmetic 项缺 claimedFormula');
 const t=claimTargets[c.target];
 assert.ok(typeof c.target==='string'&&t,`arithmetic 项 target 无法识别：${c.target}`);
 assert.ok(c.field===(t.calc?'basis':c.target),`arithmetic 项 field 须与 target 对应（派生维度 field=target，basis.* 的 field=basis）：field=${c.field} target=${c.target}`);
 assert.ok(kcalPerSatiety>0&&entry?.row,'缺 kcalPerSatiety 或条目，无法推算');
 assert.ok(c.claimedInputs&&typeof c.claimedInputs==='object'&&!Array.isArray(c.claimedInputs),'arithmetic 项缺 claimedInputs（计算所用的输入）');
 const claimed=t.grid(c.claimedValue),srcs=entry.row.sources??[];
 const need=(o,where)=>{assert.ok(o&&typeof o==='object','claimedInputs 缺 '+where);for(const k of t.inputs)assert.ok(Number.isFinite(o[k]),`claimedInputs 缺 ${where}.${k}（数）`);};
 if(!t.calc){ // 派生维度
  const program=deriveFromSources(entry.row,kcalPerSatiety)[c.target];
  if(program===undefined&&c.target==='mealCap'&&srcs.some(x=>x?.mealBasis==='dryMatter'))return {target:c.target,program:null,stored:null,claimed,verdict:'not-comparable',formula:'mealCap 对干物质基准的类不可作算术目标'};
  assert.ok(program!==undefined,`target ${c.target} 无法由出处推算`);
  const used=(entry.row.selection?.method==='single'?srcs.slice(0,1):srcs);let match=true;
  for(const s of used){const ci=c.claimedInputs[s.name];need(ci,s.name);if(!t.inputs.every(k=>sameNum(ci[k],s[k])))match=false;}
  const stored=entry.row[c.target];
  const verdict=!match?'disputes-input':stored!==undefined&&!sameNum(stored,program)?'data-error':claimed!==program?'misjudged':'agrees';
  return {target:c.target,program,stored:stored??null,claimed,verdict,inputsMatch:match,formula:'deriveFromSources（出处原值逐成员推算后取平均并按取整口径）'};
 }
 const src=srcs.find(x=>x.name===c.source);
 assert.ok(src,`arithmetic 项 target=${c.target} 须带 source（出处 name），当前：${c.source}`);
 if(t.grams)assert.ok(Number.isFinite(c.grams)&&c.grams>0,`target=${c.target} 须带 grams（正数）`);
 need(c.claimedInputs,'claimedInputs');
 const raw=t.calc(src,c.grams,kcalPerSatiety);
 assert.ok(Number.isFinite(raw),`target ${c.target} 无法由出处「${c.source}」推算`);
 const program=t.grid(raw),match=t.inputs.every(k=>sameNum(c.claimedInputs[k],src[k]));
 return {target:c.target,source:c.source,...(t.grams?{grams:c.grams}:{}),program,stored:null,claimed,verdict:!match?'disputes-input':claimed!==program?'misjudged':'agrees',inputsMatch:match,formula:t.formula};
}
const sourceIdList=map=>Object.entries(map??{}).filter(([,v])=>v?.id).map(([name,v])=>`${name}：${v.idType??'编号'} ${v.id}（${v.status??'待核对'}）`);
// extractReview(response, entry, opts)：opts.legacy 只做旧格式解析（重放旧回复用，不要求 kind）；
// opts.kcalPerSatiety 是推算用的表头标定值；opts.sourceIds 是该条目的出处编号（表头 sourceIds[条目 id]）；opts.reasked={arithmetic,fact} 表示这些重问已发过，不再重问。
export function extractReview(response,entry,opts={}){
 let review;const claims=new Map();
 try{
  review=parseModelJSON(response);
  assert.ok(Array.isArray(review?.contradictions),'Missing contradictions array');
  for(const issue of review.contradictions){
   // 核算无误的项（verdict=no_conflict）可把 severity 也写成 no_conflict：只表示“核过、无问题”，不是问题项，下面剔除；
   // 与 conflict 配对或其他任何值仍是格式错误。
   assert.ok(['hard','soft','style'].includes(issue.severity)||(issue.severity==='no_conflict'&&issue.verdict==='no_conflict'));
   assert.ok(['conflict','no_conflict'].includes(issue.verdict),'缺 verdict（conflict|no_conflict）');
   for(const key of ['quote','field','reason'])assert.ok(typeof issue[key]==='string'&&issue[key].trim());
   if(!opts.legacy&&issue.severity==='hard'&&issue.verdict==='conflict'){
    assert.ok(issueKinds.includes(issue.kind),'hard 项缺 kind（arithmetic|fact）');
    if(issue.kind==='arithmetic')claims.set(issue,programClaim(issue,entry,opts.kcalPerSatiety));
   }
  }
 }catch(error){throw Object.assign(new Error(`Invalid contradictions JSON: ${error.message}`),{code:'REVIEW_FORMAT'});}
 // 一致性校验（结构化）：severity=hard 必须 verdict=conflict；模型自己判 no_conflict 却标 hard（先报后自撤）= 无效输出，不算通过也不算 hard。
 const bad=review.contradictions.filter(c=>c.severity==='hard'&&c.verdict==='no_conflict');
 if(bad.length)throw Object.assign(new Error(`审查输出自相矛盾（severity=hard 但 verdict=no_conflict）：${bad.map(c=>c.field).join('、')}`),{code:'REVIEW_INCONSISTENT'});
 review.contradictions=review.contradictions.filter(c=>c.severity!=='no_conflict');
 if(opts.legacy)return review;
 const hard=review.contradictions.filter(c=>c.severity==='hard');
 for(const c of hard)c.programCheck=c.kind==='arithmetic'?claims.get(c):{verdict:'fact'};
 const arith=hard.filter(c=>c.kind==='arithmetic'&&c.programCheck.verdict!=='disputes-input'),mis=arith.filter(c=>c.programCheck.verdict==='misjudged'),facts=hard.filter(c=>c.kind==='fact'||c.programCheck.verdict==='disputes-input'); // 质疑输入的 arithmetic 按 fact 处理
 if(arith.some(c=>c.programCheck.verdict!=='misjudged'))return review; // 程序推算支持 AI（原数据真错）或说不清：照常 hard
 const reasked=opts.reasked??{},ids=sourceIdList(opts.sourceIds),pick=c=>({field:c.field,quote:c.quote,reason:c.reason,kind:c.kind,...(c.claimedValue!==undefined?{claimedValue:c.claimedValue,claimedFormula:c.claimedFormula,target:c.target}:{})});
 const prior=opts.priorFacts??[];
 if(prior.length&&reasked.fact){ // 事实项已按编号重问过：不管 AI 现在怎么说，该条转人工（待按编号人工核对），不计通过
  const second=facts.map(pick);
  review.factPending={status:'待按编号人工核对',sourceIds:ids,first:prior,second};
  review.contradictions.push({quote:prior[0].quote,field:prior[0].field,verdict:'conflict',severity:'hard',kind:'fact',reason:`待按编号人工核对：${ids.join('；')}；AI 初审与按编号重问两次意见见 review.factPending`,programCheck:{verdict:'fact-pending-human'}});
 }
 const wantArith=mis.length>0&&!reasked.arithmetic,wantFact=facts.length>0&&ids.length>0&&!reasked.fact;
 if(!wantArith&&!wantFact)return review; // 已重问过仍对不上，或事实项没有编号可核对：留人工
 const parts=[];
 if(wantArith)for(const c of mis){const p=c.programCheck;parts.push(`「${c.field}」你给 ${p.target} 的正确值是 ${c.claimedValue}（算式 ${c.claimedFormula}），程序按出处推算 ${p.target} = ${p.program}${p.source===undefined?'，与原数据一致':`（${p.formula}${p.grams!==undefined?`，grams=${p.grams}，source=${p.source}`:''}）`}，两者不同；请逐步重新核算，核算无误的项不要列入`);}
 if(wantFact)parts.push(`数据来源类事实项请按出处编号核对（不是算术题）：${ids.join('；')}`);
 throw Object.assign(new Error(parts.join('；')),{code:wantArith?'REVIEW_ARITH_MISJUDGED':'REVIEW_FACT_RECHECK',reask:{arithmetic:wantArith,fact:wantFact},facts:wantFact?facts.map(pick):undefined});
}
// 重放旧回复（--rejudge、retryEligible）沿用旧格式，不要求 kind：旧回复是在没有结构化字段的提示下得到的。
export const legacyExtractReview=(response,entry)=>extractReview(response,entry,{legacy:true});
// 生产默认的审查解析：读表头 kcalPerSatiety 与 sourceIds；每条目记住本次运行里已重问过什么（重问只发 1 次）。env 可注入（claimEnv）。
export async function reviewExtractor(claimEnv=null){
 const env=claimEnv??await readJSON(tableFile).then(t=>({kcalPerSatiety:t.kcalPerSatiety,sourceIds:t.sourceIds??{}})),asked=new Map();
 return (response,entry)=>{
  const st=asked.get(entry?.id)??{};
  try{return extractReview(response,entry,{kcalPerSatiety:env.kcalPerSatiety,sourceIds:env.sourceIds?.[entry?.id],reasked:st,priorFacts:st.priorFacts});}
  catch(error){if(error.reask)asked.set(entry.id,{...st,...(error.reask.arithmetic&&{arithmetic:true}),...(error.reask.fact&&{fact:true,priorFacts:error.facts})});throw error;}
 };
}
// 统计：程序判定 AI 误判（errorHistory 里出现过 REVIEW_ARITH_MISJUDGED）单列；其中重问后通过的另计。人工比例照旧只数 manual 条目，不因此放宽。
// factPendingHuman：事实项判 hard 的条目（含 AI 质疑输入的 arithmetic），一律 manual 待人工，单列计数；人工比例仍按 manual 条目原样计入。
export function factPendingStats(records){
 const hit=(records??[]).filter(r=>r&&r.status!=='passed'&&(r.review?.contradictions??[]).some(c=>c.severity==='hard'&&(c.kind==='fact'||c.programCheck?.verdict==='disputes-input')));
 return {count:hit.length,ids:hit.map(r=>r.id)};
}
export function misjudgeStats(records){
 const hit=(records??[]).filter(r=>r&&(r.errorHistory??[]).includes('REVIEW_ARITH_MISJUDGED'));
 return {count:hit.length,ids:hit.map(r=>r.id),reaskPassed:hit.filter(r=>r.status==='passed').length,reaskPassedIds:hit.filter(r=>r.status==='passed').map(r=>r.id)};
}
const draftRequest=()=>{throw Error('候选已冻结；不请求模型改写');};
// 出处编号（李白 2026-11-09 决定）：凡引用 USDA FoodData Central 的出处，表头 sourceIds[条目 id][出处 name] 必须有一项：
// 带编号（id 为 4–8 位数字串，idType 为 FDC 或 NDB，status 为 待核对|已核对），或明确写 {id:null,status:'未知'}（记不清不编造，列给协调者，该条事实项保持人工）。
// 编号放表头而不放行内：行内容进 L2 指纹，登记编号不应让已审结论作废（同 memberItems 的做法）。
export function checkSourceIds(table,entries){
 const errors=[],ids=table.sourceIds??{};
 for(const e of entries)for(const x of e.row?.sources??[]){
  if(!/FoodData Central/.test(x.citation??''))continue;
  const r=ids[e.id]?.[x.name],w=`sourceIds.${e.id}.${x.name}`;
  if(!r){errors.push(`引用 USDA FoodData Central 的出处缺编号登记：${w}`);continue;}
  if(r.id===null){if(r.status!=='未知')errors.push(`编号未知须写 status:'未知'：${w}`);continue;}
  if(!/^\d{4,8}$/.test(String(r.id))||!['FDC','NDB'].includes(r.idType)||!['待核对','已核对'].includes(r.status))errors.push(`出处编号须为 4–8 位数字、idType 取 FDC|NDB、status 取 待核对|已核对：${w}`);
 }
 for(const [id,m] of Object.entries(ids))for(const name of Object.keys(m)){const e=entries.find(x=>x.id===id);if(!e||!e.row?.sources?.some(x=>x.name===name))errors.push(`sourceIds 登记的出处不存在：${id}.${name}`);}
 return errors;
}
export async function l1(){
 const entries=await entriesFor(),world=await runtime(),errors=[];
 errors.push(...validateMaterialProps(world));
 errors.push(...checkSourceIds(await readJSON(tableFile),entries));
 for(const e of entries)errors.push(...(await validateDraft(draftFor(e),e)).map(x=>`${e.id}: ${x}`));
 const overrides=entries.filter(e=>e.kind==='material-props-item').length;
 if(overrides/world.items.length>maxOverrideRatio)errors.push(`覆盖行占物品总数 ${overrides}/${world.items.length} 超过 ${maxOverrideRatio*100}%：类别划得不对，回头改类别`);
 assert.deepEqual(errors,[]);
 return {L1:'passed',entries:entries.length,overrides,items:world.items.length};
}
export async function sampleL4(card=cardProfiles.d){
 const batchFile=path.join(card.reviewRoot,'batch-0.json'),selectionFile=path.join(card.reviewRoot,'l4-selection.json');
 const batch=await readJSON(batchFile),entries=await card.entries();
 const st=await summarizeApproval(entries,card);
 if(st.unresolved.length)throw Error(`尚有条目既未通过 L2 也无人工核定：${st.unresolved.join(',')}`);
 const pool=[...batch.ids];for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 const selection={fingerprint:batch.fingerprint,wave:pool.slice(0,10),read:[...new Set([...batch.sample,...batch.flagged,...pool.slice(0,10)])]};
 await fs.writeFile(selectionFile,JSON.stringify(selection,null,2)+'\n');
 return selection;
}
export async function recordL4(file,reviewer,card=cardProfiles.d){
 const batchFile=path.join(card.reviewRoot,'batch-0.json'),selectionFile=path.join(card.reviewRoot,'l4-selection.json');
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
// 两张卡各用自己的审查目录、人工核定、L4 与 revision。
export const cardProfiles={
 d:{name:cardId,revision,reviewRoot,manualFile,entries:dEntries},
 condiment:{name:condimentCard.cardId,revision:condimentCard.revision,reviewRoot:condimentCard.reviewRoot,manualFile:path.join(condimentCard.reviewRoot,'manual-verified.json'),entries:condimentEntries}};
// 两种固定标注：reviewed = 当前数据被 L2 审过且 hard 意见自撤（记录指纹须等于核定指纹且有 review）；
// unreviewed = 同条上限后数据有改动、未再经 L2（须写明上次 L2 记录的指纹与改动内容）。
export const manualLabels={reviewed:'人工核定、模型误判',unreviewed:'人工核定、未经L2复审'};
export const manualLabel=manualLabels.reviewed;
const loadRecordDefault=id=>readJSON(path.join(reviewRoot,`${id}.json`)).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
export const fingerprintOf=async(entry,rev=revision)=>hashContent({entry,context:await contextFor(entry),revision:rev});
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
export async function summarizeApproval(entries,card=cardProfiles.d){
 const doc=await readJSON(card.manualFile).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 const loadRecord=id=>readJSON(path.join(card.reviewRoot,`${id}.json`)).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)),fingerprint=e=>fingerprintOf(e,card.revision);
 const st=await approvalState(entries,{manual:await checkManual(doc,entries,fingerprint,loadRecord),loadRecord,fingerprint});
 const recs=[];for(const e of entries){const r=await loadRecord(e.id);if(r&&r.fingerprint===await fingerprint(e))recs.push(r);}
 st.aiMisjudgedByProgram=misjudgeStats(recs);
 st.factPendingHuman=factPendingStats(recs);
 await fs.mkdir(card.reviewRoot,{recursive:true});
 await fs.writeFile(path.join(card.reviewRoot,'approval-summary.json'),JSON.stringify({rule:'人工核定条目不计入人工队列比例（needsSystemicRepair），其余检查同 readApprovedContent；规则解释待李白确认',total:entries.length,l2Passed:st.l2,manualVerified:st.manual,unresolved:st.unresolved,aiMisjudgedByProgram:st.aiMisjudgedByProgram,factPendingHuman:st.factPendingHuman},null,2)+'\n');
 return st;
}
// verify：L1 必过；每条 L2 通过或人工核定；批次检查与 content-pipeline.mjs readApprovedContent 逐项等价：
// ①读 summary.json，逐批核对批指纹（summary 与 batch 文件一致）、L4 已批准、ids 清单、行内容哈希；②sample 与 flagged 的阅读笔记；
// ③条目都在已审查批次里；④记录指纹、无错、无 hard。另加波次随机 10 条六项评分（checkWave）。
// 唯一差别（规则解释待李白确认）：已人工核定的条目允许记录状态不是 passed，且不计入人工队列比例（needsSystemicRepair）——
// 它们已核定，不在待处理队列里；未决条目为空才通过。该差别同样写在 approval-summary.json 的 rule 字段。
export async function verifyPublished(card=cardProfiles.d,{checkL1=true}={}){
 if(checkL1)await l1();
 const reviewRoot=card.reviewRoot,entries=await card.entries(),summary=await readJSON(path.join(reviewRoot,'summary.json'));
 const st=await summarizeApproval(entries,card);
 if(st.unresolved.length)throw Object.assign(Error('尚有条目既未通过 L2 也无人工核定'),{unresolved:st.unresolved});
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
export function checkReviewCap(ledger,id,dirName=reviewDirName,extra=0){
 const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const label=new RegExp(`^content-${esc(dirName)}-${esc(id)}-review\\d+$`);
 const sent=Object.values(ledger?.requests??{}).filter(r=>label.test(r.label??'')&&['sent','settled','unknown'].includes(r.status));
 if(sent.length>=maxReviewsPerEntry+extra)throw Object.assign(new Error(`同条审核在 ${dirName} 内已达 ${maxReviewsPerEntry+extra} 次（初审+2次修正${extra?`+${extra}次一次性授权`:''}）：${id}`),{code:'REVIEW_LIMIT'});
}
// 账本上限分两步批准，按顺序逐步落到账本 authorizations（幂等；账本其余字段不动，旧请求与花费保留）：
//  40→60：亮圳 2026-11-09 12:11 批准、李白同意（整类修复后每条再审 1 次）；
//  60→75：李白 2026-11-09 13:1x 批准（整类口径修正后的复审；limitYuan 1.5 不变，到额自动停，只用于本次口径修正后的复审）；
//  75→100：李白 2026-11-09 14:2x 批准（只复审 25 条，保持原指纹的 7 条不重审；金额上限仍 1.5 元，到额自动停）；
//  100→130：李白 2026-11-09 15:1x 批准（卡 D 审批工具问题：L2 输出 hard 后自撤，加一致性校验与重试、class_egg 按新口径重审；金额上限仍 1.5 元，到额自动停）。
export const grants=[
 {id:'d12-matprops-2-maxrequests-60',from:40,to:60,source:'亮圳 2026-11-09 12:11 批准、李白同意：D 卡整类修复后每条再审 1 次，maxRequests 40→60，limitYuan 仍 1.5 元，只限这一轮'},
 {id:'d12-matprops-2-maxrequests-75',from:60,to:75,source:'李白 2026-11-09 13:1x 批准：整类口径修正后的复审，maxRequests 60→75，limitYuan 仍 1.5 元，到额自动停，只用于本次口径修正后的复审'},
 {id:'d12-matprops-2-maxrequests-100',from:75,to:100,source:'李白 2026-11-09 14:2x 批准：只复审 25 条，保持原指纹的 7 条不重审，maxRequests 75→100，limitYuan 仍 1.5 元，到额自动停'},
 {id:'d12-matprops-2-maxrequests-130',from:100,to:130,source:'李白 2026-11-09 15:1x 批准：L2 一致性校验重试与 class_egg 按新口径重审，maxRequests 100→130，limitYuan 仍 1.5 元，到额自动停'}];
export const grantId=grants[0].id;
// 一次性授权（与 grants 不同：不动账本，只放宽 checkReviewCap 的次数，且只对 entry 指定的那一条）。是否已用掉由账本里该条请求标签数判断（用过一次即达 3+1，再无余量）。
// max_tokens 取值依据：item_garlic 在 review-2 内三次请求的 usage.completion_tokens 实测为 174、104、140，最大 174；174×2=348，向上取整到 50 → 350（原审查请求为 1200）。
// 预留上界按账本同一口径（content-budget.mjs reserveCeilingYuan：UTF-8 字节×miss 费率 + max_tokens×output 费率）核算，超 limitYuan 即拒绝，不自动放宽。
export const retryGrants=[
 {id:'d12-matprops-2-garlic-retry',entry:'item_garlic',extraReviews:1,limitYuan:0.015,maxTokens:350,source:'李白 2026-11-09 16:1x：garlic 原始回复解析不出判定时只允许单条重问 1 次，其余不追加调用；单次上限原定 0.01 元，因预留上界约 0.0145 元超限，李白随后选 A 仅此一条这一次提到 0.015 元，到额自动停，其他条目仍 0.01 元，卡总额仍 1.5 元'}];
export const garlicRetry=retryGrants[0];
export const retryBody=(grant,body)=>({...body,max_tokens:grant.maxTokens});
// 触发条件（纯函数）：授权条目，且当前 revision 内全部已保存审查回复（saved=[{requestId,response}]，调用方已核对哈希，不限时间）都解析不出判定
// （REVIEW_FORMAT 或意外异常）。至少 1 条；出现过可解析回复或 REVIEW_INCONSISTENT（保守：任一次即不算）都不可。
export function retryEligible({id,saved,grant=garlicRetry,extract=legacyExtractReview}){
 const out={eligible:false,requestIds:(saved??[]).map(x=>x.requestId)};
 if(id!==grant.entry)return {...out,reason:`只允许 ${grant.entry}`};
 if(!saved?.length)return {...out,reason:'没有已保存的审查回复'};
 for(const x of saved){
  try{extract(x.response);return {...out,reason:`回复 ${x.requestId} 可解析`};}
  catch(e){if(e.code==='REVIEW_INCONSISTENT')return {...out,reason:`回复 ${x.requestId} 解析为自相矛盾`};}
 }
 return {...out,eligible:true,reason:'全部已保存回复都解析不出判定'};
}
// 读取记录里 phase=review 的全部已保存回复（不限时间），核对哈希；不符抛错。
export async function loadSavedReviews(rec,budgetRoot=draftRoot){
 const out=[];
 for(const e of (rec.responseEvidence??[]).filter(x=>x.phase==='review').sort((x,y)=>x.attempt-y.attempt)){
  const saved=await readJSON(path.join(budgetRoot,e.file));
  if(saved.requestId!==e.requestId||saved.responseHash!==e.responseHash||hashContent(saved.response)!==saved.responseHash)throw Error(`回复文件哈希与记录不符：${rec.id} ${e.requestId}`);
  out.push({requestId:e.requestId,response:saved.response});
 }
 return out;
}
// 发请求前校验：条目须是授权条目、记录须带 retryEligible.eligible、账本里该条次数未用掉这 1 次、本请求（含 max_tokens 覆盖）的预留上界不超过金额上限。
export function assertRetryAllowed({grant=garlicRetry,id,eligible,ledger,body,client}){
 const deny=m=>Object.assign(new Error(`一次性授权 ${grant.id}：${m}`),{code:'RETRY_DENIED'});
 if(id!==grant.entry)throw deny(`只允许 ${grant.entry}，不允许 ${id}`);
 if(eligible!==true)throw deny(`${id} 未被 --rejudge 评估为 retryEligible`);
 try{checkReviewCap(ledger,id,reviewDirName,grant.extraReviews);}catch(e){if(e.code==='REVIEW_LIMIT')throw deny(`${id} 的额外 ${grant.extraReviews} 次已用掉`);throw e;}
 if(body!==undefined){const est=reserveCeilingYuan(client,retryBody(grant,body));if(!Number.isFinite(est))throw deny('无法核算预留上界');if(est>grant.limitYuan+1e-12)throw deny(`本次请求（max_tokens=${grant.maxTokens}）预留上界 ${est.toFixed(6)} 元超过上限 ${grant.limitYuan} 元`);}
}
export function grantMaxRequests(ledger){
 const out=structuredClone(ledger),card=out.cards?.[cardId];
 if(!card)throw Error('缺卡账本');
 for(const g of grants){
  if(out.authorizations?.some(a=>a.id===g.id)){assert.ok(card.maxRequests>=g.to,`${g.id} 已授权但账本上限低于 ${g.to}`);continue;}
  if(card.maxRequests!==g.from||card.limitYuan!==cardLimitYuan||card.reservedYuan!==0||out.reservedYuan!==0)throw Error('卡账本与批准时的快照不符，拒绝调整');
  out.authorizations??=[];
  out.authorizations.push({id:g.id,source:g.source,before:{maxRequests:card.maxRequests,limitYuan:card.limitYuan,spentYuan:card.spentYuan,requests:Object.keys(out.requests??{}).length},after:{maxRequests:g.to,limitYuan:cardLimitYuan},at:new Date().toISOString()});
  card.maxRequests=g.to;
 }
 assert.equal(card.maxRequests,maxRequests);
 return out;
}
async function authorizeIncrease(){
 const file=path.join(draftRoot,'budget.json'),ledger=await readJSON(file),next=grantMaxRequests(ledger);
 if(JSON.stringify(next)!==JSON.stringify(ledger))await fs.writeFile(file,JSON.stringify(next,null,2)+'\n');
}
// REVIEW_INCONSISTENT：该条自动重试 1 次（走同一预算与同条次数上限）。按记录的错误历史（record.errorHistory，流水线每次失败追加）里
// 本条实际出现的 REVIEW_INCONSISTENT 次数判断：已出现 2 次（初次 + 重试）则在发请求前抛 REVIEW_INCONSISTENT_EXHAUSTED，该条转 manual；
// 中间夹别的错误不影响计数，也不会提前判用尽。门只读不写记录。
export function inconsistentGate(record){
 const n=(record?.errorHistory??[]).filter(c=>c==='REVIEW_INCONSISTENT').length;
 if(n>=2)throw Object.assign(new Error('L2 审查输出两次自相矛盾（hard 但自认无误），不当作通过，转人工'),{code:'REVIEW_INCONSISTENT_EXHAUSTED'});
}
// 程序判定误判的重问（REVIEW_ARITH_MISJUDGED）与事实项按编号重问（REVIEW_FACT_RECHECK）各只许 1 次：错误历史里同一代码已出现 2 次，发请求前拒绝，该条转 manual。
export function reaskGate(record){
 for(const code of ['REVIEW_ARITH_MISJUDGED','REVIEW_FACT_RECHECK'])if((record?.errorHistory??[]).filter(c=>c===code).length>=2)throw Object.assign(new Error(`L2 重问后仍对不上（${code}），不再重问，转人工`),{code:'REVIEW_REASK_EXHAUSTED'});
}
// 重问时把程序核对结果（上一轮失败的 feedback，含程序推算值或出处编号）作为一条追加消息发给模型。
export function withProgramHint(body,record){
 const last=(record?.errorHistory??[]).at(-1);
 if(!['REVIEW_ARITH_MISJUDGED','REVIEW_FACT_RECHECK'].includes(last)||!record.feedback?.length)return body;
 return {...body,messages:[...body.messages,{role:'user',content:`【程序核对】上一轮审查回复里的问题项经程序复核：${record.feedback.join('；')}。请据此重新审查，只返回 JSON，格式同前。`}]};
}
export const capReviewsFor=({budgetRoot=draftRoot,client,retry=null,eligible=false,dirName=reviewDirName}={})=>async({body,entry,phase,record})=>{
 if(phase!=='review')return {body};
 inconsistentGate(record);
 reaskGate(record);
 body=withProgramHint(body,record);
 let ledger;try{ledger=await readJSON(path.join(budgetRoot,'budget.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(retry){assertRetryAllowed({grant:retry,id:entry.id,eligible,ledger,body,client});return {body:retryBody(retry,body)};} // 一次性授权模式：只有授权条目能发请求，且用较小 max_tokens
 checkReviewCap(ledger,entry.id,dirName);
 return {body};
};
// 审查解析错误（extractReview 抛出的任何错误，含无 code 的意外异常）一律使整轮停止；REVIEW_INCONSISTENT 走自己的重试规则。
export const reviewStops=error=>!['REVIEW_INCONSISTENT','REVIEW_ARITH_MISJUDGED','REVIEW_FACT_RECHECK'].includes(error?.code);
// --l1 --show <id,...>：逐条打印出处字段（带单位）、推算中间量、推算值与一致性检查结果。
const pct=x=>`${(x*100).toFixed(2)}%`;
export function explainEntry(entry,table,l1Errors=[],itemTags=[]){
 const kps=table.kcalPerSatiety,row=entry.row,L=[`== ${entry.id}（${entry.kind}）`,`kcalPerSatiety = ${kps} kcal/饱腹（表头标定值，${table.kcalPerSatietyBasis?.slice(0,20)}…）`];
 const srcs=Array.isArray(row.sources)?row.sources:[],sel=row.selection??{method:'single'};
 L.push(`selection = ${sel.method}（${sel.reason??'无'}）`);
 for(const x of srcs){
  const o=memberValues(x,kps);
  L.push(`出处「${x.name}」${x.item?`（成员物品 ${x.item}）`:''}：${x.citation}`);
  if(x.moistureFraction!==undefined)L.push(`  含水分数 moistureFraction = ${x.moistureFraction}（水占鲜重，质量分数）→ 干物质比例 = 1 − ${x.moistureFraction} = ${(1-x.moistureFraction).toFixed(4)}（质量分数）`);
  if(x.kcalPer100gWet!==undefined){
   L.push(`  鲜重能量 kcalPer100gWet = ${x.kcalPer100gWet}（kcal/100g 鲜重）`);
   if(o.e!==undefined)L.push(`  干基能量 = ${x.kcalPer100gWet} × 10 ÷ ${(1-x.moistureFraction).toFixed(4)} = ${(x.kcalPer100gWet*10/(1-x.moistureFraction)).toFixed(1)}（kcal/kg 干物质）；÷ ${kps} = ${o.e.toFixed(3)}（饱腹/kg 干物质）`);
  }
  if(x.refuseFraction!==undefined)L.push(`  不可食比例 refuseFraction = ${x.refuseFraction}（质量分数）→ 可食部分 = ${(1-x.refuseFraction).toFixed(4)}`);
 }
 const d=deriveFromSources(row,kps);
 L.push(`推算值（${sel.method==='mean'?'各成员推算后取平均':'单一出处'}）：moisture = ${d.moisture??'无'}（3 位小数）；energyDensity = ${d.energyDensity??'无'}（饱腹/kg 干物质，取整）；edibleFraction = ${d.edibleFraction??'无'}`);
 const stored=['moisture','energyDensity','edibleFraction'].filter(k=>row[k]!==undefined);
 L.push(stored.length?`行里另存了：${stored.map(k=>`${k}=${row[k]}`).join('，')}；与推算值${stored.every(k=>Math.abs(row[k]-d[k])<1e-9)?'一致':'不一致'}`:'行里没有另存 moisture/energyDensity/edibleFraction（只存出处，无重复值，不会冲突）');
 if(entry.kind==='material-props-class'&&sel.method==='mean'){
  for(const m of memberDeviations(row,kps,table.memberItems?.[entry.key]))L.push(`成员偏差 ${m.item}（${m.name}）：${Object.entries(m.dev).map(([k,v])=>`${k} ${pct(v)}`).join('，')}；阈值 ${pct(table.memberDeviationThreshold)}；${m.max>table.memberDeviationThreshold?'超阈值，须有覆盖行':'未超'}`);
 }
 if(entry.kind==='material-props-item'&&Array.isArray(row.sources)){
  const thr=table.memberDeviationThreshold;
  for(const t of itemTags.filter(t=>table.classes[t]?.selection?.method==='mean')){
   const cls=deriveFromSources(table.classes[t],kps);
   for(const x of row.sources){const o=memberValues(x,kps),dev={};
    if(o.m!==undefined&&cls.moisture!==undefined)dev.dryFraction=((1-o.m)-(1-cls.moisture))/(1-cls.moisture);
    if(o.e!==undefined&&cls.energyDensity!==undefined){dev.dmEnergy=(o.e-cls.energyDensity)/cls.energyDensity;dev.freshEnergy=(o.e*(1-o.m)-cls.energyDensity*(1-cls.moisture))/(cls.energyDensity*(1-cls.moisture));}
    const max=Math.max(0,...Object.values(dev).map(Math.abs));
    L.push(`相对类别 ${t} 代表值（干物质比例 ${(1-cls.moisture).toFixed(4)}、干基能量 ${cls.energyDensity} 饱腹/kg 干物质）的偏差 ${x.name}：${Object.entries(dev).map(([k,v])=>`${k} ${pct(v)}`).join('，')}；阈值 ${pct(thr)}；${max>thr?'超阈值，须有覆盖行（本条即覆盖行）':'未超'}`);}
  }
 }
 const own=l1Errors.filter(e=>e.includes(entry.kind==='material-props-class'?`classes.${entry.key}`:`items.${entry.id}.`)||e.includes(entry.id));
 L.push(own.length?`L1 检查：${own.length} 项问题：${own.join('；')}`:'L1 检查：通过（出处字段齐全、范围合法、存值与推算一致、成员偏差有覆盖）');
 return L;
}
export async function show(ids){
 const entries=await entriesFor(),table=await readJSON(tableFile),overlay=await readJSON(overlayFile),world=await runtime(),errors=validateMaterialProps(world),lines=[];
 for(const id of ids){const e=entries.find(x=>x.id===id);if(!e)throw Error(`没有这条：${id}`);lines.push(...explainEntry(e,table,errors,overlay[id]?.tags??[]),'');}
 return lines.join('\n');
}
// --redo <id,...>：新口径重审——把该条 manual 记录归档到 <draftRoot>/review-2-archive/（不删），不动账本；之后 --review 会为该条起新记录。
// 不绕过上限：同条次数按账本里本 revision 的请求标签计数（checkReviewCap），归档记录后已用次数照旧计入。
export async function archiveForRedo(ids,{root=reviewRoot,archiveRoot=path.join(draftRoot,`${reviewDirName}-archive`)}={}){
 await fs.mkdir(archiveRoot,{recursive:true});
 const out=[];
 for(const id of ids){
  const file=path.join(root,`${id}.json`),rec=await readJSON(file);
  if(rec.status!=='manual')throw Error(`只归档 manual 记录：${id} 现为 ${rec.status}`);
  let n=1;while(await fs.stat(path.join(archiveRoot,`${id}.${n}.json`)).then(()=>true,()=>false))n++;
  const dest=path.join(archiveRoot,`${id}.${n}.json`);
  await fs.rename(file,dest);out.push(dest);
 }
 return out;
}
// --review 的流水线调用；全部可注入（client、目录、条目、审查解析），生产默认值即真实路径。审查解析出错即停止后续所有条目（reviewStops）。
export async function runReview({entries,client,root=reviewRoot,budgetRoot=draftRoot,ctx=contextFor,validate=validateDraft,extract=null,claimEnv=null,retry=null,eligible=false,
 cardIdArg=cardId,allocation={cardId,incrementLimitYuan:cardLimitYuan,maxRequests,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},revisionArg=revision,dirName=reviewDirName}){
 extract??=await reviewExtractor(claimEnv);
 const out=await runContentPipeline({entries,root,budgetRoot,revision:revisionArg,contextFor:ctx,
  validateDraft:validate,reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:draftRequest,buildReviewRequest:reviewRequest,extractReview:extract,
  stopOnReviewError:reviewStops,requestTransform:capReviewsFor({budgetRoot,client,retry,eligible,dirName}),client,cardId:cardIdArg,allocation,concurrency:1,batchSize:25});
 return withMisjudgeStats(out,root);
}
// 把「程序判定 AI 误判」单列统计写进 summary.json 和各批文件（流水线已写盘，这里追加字段；批指纹只按行内容算，不受影响）。人工比例（manualRatio、needsSystemicRepair）原样不动。
export async function withMisjudgeStats(out,root){
 const byId=new Map(out.results.map(r=>[r.id,r]));
 out.summary.aiMisjudgedByProgram=misjudgeStats(out.results);
 out.summary.factPendingHuman=factPendingStats(out.results);
 for(const b of out.summary.batches??[]){
  b.aiMisjudgedByProgram=misjudgeStats((b.ids??[]).map(id=>byId.get(id)));
  b.factPendingHuman=factPendingStats((b.ids??[]).map(id=>byId.get(id)));
  await fs.writeFile(path.join(root,`batch-${b.index}.json`),JSON.stringify(b,null,2)+'\n');
 }
 await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(out.summary,null,2)+'\n');
 return out;
}
// 调味佐餐卡账本：文件不存在才创建（初始额 1.0 元）；已存在则必须与本卡的卡号与额度一致，不一致即拒绝（不改动）。
async function condimentLedgerFile(){
 const file=path.join(condimentCard.draftRoot,'budget.json');
 await fs.mkdir(condimentCard.draftRoot,{recursive:true});
 let ledger;try{ledger=await readJSON(file);}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(file,JSON.stringify(condimentInitialLedger(),null,2)+'\n');ledger=await readJSON(file);}
 const c=ledger.cards?.[condimentCard.cardId];
 if(!c||c.limitYuan!==condimentCard.limitYuan||ledger.cards&&Object.keys(ledger.cards).some(k=>k!==condimentCard.cardId))throw Error('调味佐餐卡账本与卡号或额度不符，拒绝使用');
 return {file,ledger};
}
export async function condimentBudget(){
 const {ledger}=await condimentLedgerFile(),c=ledger.cards[condimentCard.cardId];
 return {card:condimentCard.cardId,limitYuan:c.limitYuan,spentYuan:c.spentYuan,reservedYuan:c.reservedYuan,maxRequests:c.maxRequests,requests:Object.keys(ledger.requests??{}).length,sharedLimitYuan:ledger.limitYuan,source:ledger.authorizations?.[0]?.source};
}
export async function condimentReview(){
 await l1();await condimentLedgerFile();
 const entries=await condimentEntries();
 console.log(JSON.stringify({pid:process.pid,mode:'review-condiment',entries:entries.length}));
 const client=new DeepSeekClient({budgetYuan:condimentCard.limitYuan,logFile:path.join(condimentCard.draftRoot,'usage.jsonl')});
 const {summary,halted}=await runReview({entries,client,root:condimentCard.reviewRoot,budgetRoot:condimentCard.draftRoot,cardIdArg:condimentCard.cardId,allocation:condimentCard.allocation,revisionArg:condimentCard.revision,dirName:condimentCard.reviewDirName});
 return {passed:summary.passed,manual:summary.manual,pending:summary.pending,aiMisjudgedByProgram:summary.aiMisjudgedByProgram,factPendingHuman:summary.factPendingHuman,budget:summary.budget.cards[condimentCard.cardId],...reportHalt(halted)};
}
// 全表发布校验：L1 一次；两张卡各自校验（各自的 L2/人工核定/L4），合并结论；未决条目标明属于哪张卡。cards 可注入（测试用）。
export async function verifyAll({cards=cardProfiles,verify=verifyPublished}={}){
 await l1();
 const out={ok:true,cards:{},unresolved:[]};
 for(const [key,card] of Object.entries(cards)){
  try{out.cards[key]={ok:true,...await verify(card,{checkL1:false})};}
  catch(e){
   out.ok=false;out.cards[key]={ok:false,error:e.message};
   const ids=e.unresolved??(await summarizeApproval(await card.entries(),card).catch(()=>null))?.unresolved??[];
   for(const id of ids)out.unresolved.push({id,card:card.name});
  }
 }
 return out;
}
const reportHalt=h=>h?{halted:{entry:h.id,code:h.code,message:h.message,note:'审查解析失败，本次运行已停止后续所有条目的请求'}}:{};

// --rejudge：离线重放。证据 = 记录里 phase=review 的 responseEvidence，对应账本请求时间（measurement.timestamp，缺则取证据 savedAt）晚于 rejudgeCutoff。
export const rejudgeCutoff='2026-11-09T15:19:49Z';
export const rejudgeReason='d3228afb extractReview 作用域错误，李白 2026-11-09 16:1x 批准离线重判，0 新调用';
export async function rejudgeRecord(rec,entry,{budgetRoot=draftRoot,ledger,fingerprint=fingerprintOf,validate=validateDraft,extract=legacyExtractReview,cutoff=rejudgeCutoff,now=new Date().toISOString()}){
 if(rec.fingerprint!==await fingerprint(entry))throw Error(`记录指纹与当前数据不符：${entry.id}`);
 if(!rec.frozenCandidate||rec.frozenCandidate.entryHash!==hashContent(entry)||rec.frozenCandidate.draftHash!==hashContent(draftFor(entry))||!deepEq(rec.draft,draftFor(entry)))throw Error(`冻结候选与当前 draft 不一致：${entry.id}`);
 const evs=(rec.responseEvidence??[]).filter(e=>e.phase==='review').sort((a,b)=>a.attempt-b.attempt),used=[];
 for(const e of evs){
  const file=path.join(budgetRoot,e.file),saved=await readJSON(file);
  if(saved.requestId!==e.requestId||saved.responseHash!==e.responseHash||hashContent(saved.response)!==saved.responseHash)throw Error(`回复文件哈希与记录不符：${entry.id} ${e.requestId}`);
  const at=ledger?.requests?.[e.requestId]?.measurement?.timestamp??saved.savedAt;
  if(at>cutoff)used.push({e,response:saved.response});
 }
 if(!used.length)return {id:entry.id,skipped:'没有 cutoff 之后的已保存审查回复'};
 let inconsistent=0,pick=null,stop=null;
 for(const u of used){
  try{pick={...u,review:extract(u.response,entry)};break;}
  catch(err){if(err.code==='REVIEW_INCONSISTENT'){if(++inconsistent>=2){stop={...u,code:'REVIEW_INCONSISTENT_EXHAUSTED'};break;}}} // 其余（REVIEW_FORMAT、意外异常）看下一条已保存回复
 }
 const previous={status:rec.status,errors:rec.errors,errorHistory:rec.errorHistory??null,errorCode:rec.errorCode??null,warnings:rec.warnings,feedback:rec.feedback??null,review:rec.review??null,needsRetry:rec.needsRetry};
 const out=structuredClone(rec),stamp=(u,outcome)=>({from:'saved-response',requestId:u?.e.requestId??null,responseHash:u?.e.responseHash??null,at:now,reason:rejudgeReason,outcome,previous});
 if(pick){
  const issues=pick.review.contradictions,hard=issues.filter(x=>x.severity==='hard'),l1=await validate(out.draft,entry);
  out.review=pick.review;out.errors=[...(Array.isArray(l1)?l1:l1.errors??[]),...hard];out.warnings=issues.filter(x=>x.severity!=='hard');
  out.status=out.errors.length?'manual':'passed';out.feedback=out.errors.length?out.errors:null;out.errorCode=null;delete out.needsRetry;
  out.rejudge=stamp(pick,out.status);
  return {id:entry.id,record:out,requestId:pick.e.requestId,verdict:out.status,hard:hard.length,soft:out.warnings.map(x=>`${x.severity}:${x.field}`)};
 }
 out.status='manual';
 if(stop){out.errorCode=stop.code;out.rejudge=stamp(stop,'manual-inconsistent');delete out.needsRetry;return {id:entry.id,record:out,requestId:stop.e.requestId,verdict:'manual',hard:0,soft:[],note:'两次自相矛盾，转人工'};}
 out.needsRetry=true;out.rejudge=stamp(null,'needs-retry');
 return {id:entry.id,record:out,requestId:null,verdict:'manual',needsRetry:true,hard:0,soft:[],note:'全部已保存回复都解析不出判定'};
}
const deepEq=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};
// 批文件与摘要按流水线同一规则重算（指纹 = hash(id,draft,review,status)；指纹变了则 L4 抽样与批准作废，重抽 5 条）。账本 budget.json 不动。
export async function refreshBatches(root,records){
 const sum=await readJSON(path.join(root,'summary.json')).catch(()=>null);
 if(!sum)return;
 const files=sum.batches.map(b=>path.join(root,`batch-${b.index}.json`)),byId=new Map(records.map(r=>[r.id,r]));
 for(const f of files){
  const b=await readJSON(f),oldFp=b.fingerprint,rows=b.ids.map(id=>byId.get(id)),fp=hashContent(rows.map(r=>({id:r.id,draft:r.draft,review:r.review,status:r.status})));
  const passed=rows.filter(r=>r.status==='passed'),pool=[...passed];for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
  Object.assign(b,{fingerprint:fp,passed:passed.length,manual:rows.filter(r=>r.status==='manual').map(r=>r.id),pending:rows.filter(r=>r.status==='pending').map(r=>r.id),flagged:rows.filter(r=>r.warnings.length).map(r=>r.id),
   sample:fp===oldFp?b.sample:pool.slice(0,5).map(r=>r.id),l4:fp===oldFp?b.l4:{approved:false,notes:[]}});
  b.manualRatio=b.manual.length/b.count;b.needsSystemicRepair=b.manualRatio>0.1;
  await fs.writeFile(f,JSON.stringify(b,null,2)+'\n');
  sum.batches[sum.batches.findIndex(x=>x.index===b.index)]=b;
 }
 const all=records;Object.assign(sum,{passed:all.filter(r=>r.status==='passed').length,manual:all.filter(r=>r.status==='manual').length,pending:all.filter(r=>r.status==='pending').length});
 await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(sum,null,2)+'\n');
}
export async function rejudge({entries,root=reviewRoot,budgetRoot=draftRoot,dry=false,fingerprint=fingerprintOf,validate=validateDraft,extract=legacyExtractReview,cutoff=rejudgeCutoff,grant=garlicRetry}={}){
 entries??=await dEntries();
 const ledger=await readJSON(path.join(budgetRoot,'budget.json')),rows=[],records=[];let changed=false;
 for(const entry of entries){
  const file=path.join(root,`${entry.id}.json`),rec=await readJSON(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!rec){rows.push({id:entry.id,skipped:'无记录'});continue;}
  records.push(rec);
  let row,cur=rec;
  if(rec.rejudge)row={id:entry.id,skipped:'已重判过'};
  else try{row=await rejudgeRecord(rec,entry,{budgetRoot,ledger,fingerprint,validate,extract,cutoff});if(row.record)cur=row.record;}
  catch(e){row={id:entry.id,rejected:e.message};}
  // 一次性授权条目额外评估 retryEligible（不限 cutoff；哈希不符则拒绝并不写入）
  if(entry.id===grant.entry&&!row.rejected){
   try{const el=retryEligible({id:entry.id,saved:await loadSavedReviews(rec,budgetRoot),grant,extract});cur={...cur,retryEligible:{eligible:el.eligible,requestIds:el.requestIds,reason:el.reason,at:new Date().toISOString()}};row={...row,retryEligible:el.eligible,retryRequestIds:el.requestIds,retryReason:el.reason};}
   catch(e){row={...row,rejected:e.message};}
  }
  rows.push(row);records[records.length-1]=cur;
  if(cur!==rec&&!dry)await fs.writeFile(file,JSON.stringify(cur,null,2)+'\n');
  if(cur!==rec)changed=true;
 }
 if(!dry&&changed)await refreshBatches(root,records);
 return rows.map(({record,...r})=>r);
}
// --retry-garlic：只把授权条目交给流水线；先核对 retryEligible、次数与预留上界（发请求前、归档前），不符直接拒绝并报数，不自动放宽。
// 流水线会按自己收到的条目重写 batch/summary，所以先存后还，再按全部记录重算（refreshBatches）。账本只追加这一次请求。
export async function retryRun({entries,client,root=reviewRoot,budgetRoot=draftRoot,ctx=contextFor,grant=garlicRetry,...rest}){
 const entry=entries.find(e=>e.id===grant.entry);
 if(!entry)throw Error(`没有授权条目 ${grant.entry}`);
 const rec=await readJSON(path.join(root,`${entry.id}.json`)),eligible=rec.retryEligible?.eligible===true;
 assertRetryAllowed({grant,id:entry.id,eligible,ledger:await readJSON(path.join(budgetRoot,'budget.json')),body:reviewRequest(entry,draftFor(entry),await ctx(entry)),client});
 const keep=new Map();
 for(const f of (await fs.readdir(root)).filter(f=>/^(batch-[0-9]+|summary)\.json$/.test(f)))keep.set(f,await fs.readFile(path.join(root,f)));
 const archived=await archiveForRedo([entry.id],{root,archiveRoot:path.join(budgetRoot,`${path.basename(root)}-archive`)});
 const out=await runReview({entries:[entry],client,root,budgetRoot,ctx,retry:grant,eligible,...rest});
 for(const [f,b] of keep)await fs.writeFile(path.join(root,f),b);
 const records=[];for(const e of entries)records.push(await readJSON(path.join(root,`${e.id}.json`)).catch(()=>null));
 if(records.every(Boolean))await refreshBatches(root,records);
 return {...out,archived};
}
export async function run(args=process.argv.slice(2)){
 const condiment=args.includes('--card')&&args[args.indexOf('--card')+1]==='condiment';
 if(args.includes('--l1'))console.log(JSON.stringify(await l1()));
 if(condiment&&args.includes('--budget')){console.log(JSON.stringify(await condimentBudget()));return;}
 if(condiment&&args.includes('--review')){
  // --redo <id,...>：同 D 卡，只归档本卡 review-1 里的 manual 记录（不删），不动账本；同条次数仍按本卡账本标签计（checkReviewCap）。
  if(args.includes('--redo')){
   const ids=args[args.indexOf('--redo')+1].split(','),own=new Set((await condimentEntries()).map(e=>e.id));
   for(const id of ids)if(!own.has(id))throw Error(`--redo 只收调味卡条目：${id}`);
   console.log(JSON.stringify({archived:await archiveForRedo(ids,{root:condimentCard.reviewRoot,archiveRoot:path.join(condimentCard.draftRoot,`${condimentCard.reviewDirName}-archive`)})}));
  }
  console.log(JSON.stringify(await condimentReview()));return;
 }
 if(args.includes('--show'))console.log(await show(args[args.indexOf('--show')+1].split(',')));
 if(args.includes('--rejudge')){
  const rows=await rejudge({dry:args.includes('--dry-run')});
  for(const r of rows)console.log(JSON.stringify(r));
  if(rows.some(r=>r.rejected))process.exitCode=1;
 }
 const retry=args.includes('--retry-garlic');
 if(args.includes('--review')||retry){
  await l1();
  await authorizeIncrease();
  if(!retry&&args.includes('--redo'))console.log(JSON.stringify({archived:await archiveForRedo(args[args.indexOf('--redo')+1].split(','))}));
  const entries=await dEntries();// D 卡路径只处理 D 卡已冻结批次里的条目
  console.log(JSON.stringify({pid:process.pid,mode:retry?'retry-garlic':'review',entries:entries.length}));
  const client=new DeepSeekClient({budgetYuan:cardLimitYuan,logFile:path.join(draftRoot,'usage.jsonl')});
  const {summary,halted}=retry?await retryRun({entries,client}):await runReview({entries,client});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,aiMisjudgedByProgram:summary.aiMisjudgedByProgram,factPendingHuman:summary.factPendingHuman,budget:summary.budget.cards[cardId],...reportHalt(halted)}));
 }
 const card=condiment?cardProfiles.condiment:cardProfiles.d;
 if(args.includes('--sample'))console.log(JSON.stringify(await sampleL4(card)));
 if(args.includes('--l4'))console.log(JSON.stringify(await recordL4(args[args.indexOf('--l4')+1],'主会话人读',card)));
 if(args.includes('--verify'))console.log(JSON.stringify(args.includes('--card')?await verifyPublished(card):await verifyAll()));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
