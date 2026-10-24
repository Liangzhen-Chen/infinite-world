// S4: publish explicit trial procedure without inventing offenses or offices.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from '../../tools/content-pipeline.mjs';
import {trialProcedureFor} from './s4-law-content-data.mjs';

const root='world/drafts/s4-law-content',revision='s4law-content-1';
const rulesFile='world/meta/rules.json',bindingsFile='world/law/bindings.json';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const current=await read(rulesFile),bindings=await read(bindingsFile);
let foundation;
try{foundation=await read(`${root}/foundation.json`);}catch(error){if(error.code!=='ENOENT')throw error;}
const original=foundation??{codes:current.law.codes,bindings};
const regions=await read('world/geo/regions.json'),factions=await read('world/lore/factions.json');
const sourceFacts={county:regions.filter(r=>r.id==='county_xichui_longqu').map(({id,province,ruler,places,seat,prose})=>({id,province,ruler,places,seat,rule:prose.rule})),
 appellateTemplate:current.law.templates.find(t=>t.id==='law_royal_xichui'),
 reviewer:factions.filter(f=>f.id==='faction_huancheng_government').map(({id,leader,leaderTitle,method,offices})=>({id,leader,leaderTitle,method,offices})),
 localCharter:factions.filter(f=>f.id==='faction_bs_government').map(({id,method,demands,offices})=>({id,method,demands,offices}))};
const basis={
 source:'用户卡 s4law-content 初始值；05 §5.2.4/§5.2.7、附录A §A.7/§A.18',
 calibration:'占位值，待 BalSim/试玩标定；程序期限仍以法典为唯一定义处，不复制到平衡表。',
 weights:'eyewitness 1 × 证人立场、视线及完整度派生；statement 0.5；confession 2；document 3 × 核验真伪与完整度；mark 1；stanceDiscount 0.5。',
 thresholds:'只覆盖原有 penalties：theft_attempt、assault_attempt 为轻档2；theft、assault 为中档3；homicide 为重档5。不新增罪名，各村现有同档刑罚一致，故不按文化擅改数值。',
 review:'环城郡署现任伊岑·衡阶是既有西陲巡抚兼领环城郡；西陲王国诉讼章规定上级复审，law-codes courtHierarchy 对未落地的本郡治所沿省治承接。指定现有上级主官复核，原审本人必须回避，不赋权教师或上诉收件员。',
 fees:'五部原法典均无 procedure.costs 或 procedureCosts 费用条目，故 filingFee 0；不新设收费。',
 bounds:{weights:[0,5],stanceDiscount:[0,1],convictionThreshold:[1,10],appealWindowMinutes:[1440,10080],filingFee:[0,0]},
};
export const entries=original.codes.map(code=>({id:code.id,kind:'trial-procedure',before:code,
 row:trialProcedureFor(code),basis}));
entries.push({id:'s4law_baishi_binding',kind:'law-binding',row:{place:'loc_bs',slot:'place.lawCode',value:'law_royal_xichui',source:'world/geo/regions.json#county_xichui_longqu/ruler、places、prose.rule；world/meta/rules.json#law.templates/law_royal_xichui'},
 basis:{source:'垄渠郡 places 含河湾、白石，ruler.polity=王国，province=prov_xichui；白石公署仅递件登记，各村按本村规约议事。',
 boundary:'只绑定已有西陲王国诉讼章；子地点继承，原有学塾寺观和四村显式法典优先。不造白石法典、罪名、法庭、裁判或新人物。',
 gap:'郡治渠阳城 seat.location=null；白石现有章程未授权 judge_case/review_case，也无司法席位任免链。绑定适用法不等于已有可执行法院，新审理与三项白石罚款 todo 的真实前提仍缺。',
 offices:'四村 details.governance.permissions.head 明确在登记议事屋按本村法典审理，故权在真实主官；未见允许另设佐理/典史审席的章程。河湾原法典列陈柏为审判者，未见可任命司法席位章程，不为测试造席位。'}});
const draftFor=e=>({id:e.id,row:e.row});
const contextFor=e=>({before:e.before??null,basis:e.basis,sourceFacts});
const validateDraft=(d,e)=>{try{assert.deepEqual(d,draftFor(e));if(e.before)assert.deepEqual(Object.keys(d.row.procedure.evidence.convictionThreshold).sort(),Object.keys(e.before.penalties).sort());return [];}catch(error){return [error.message];}};
async function approved(){const rows=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});assert.equal(rows.length,entries.length,'司法程序尚有未审批内容');return rows;}
export async function verifyPublished(codes=current.law.codes,rows=bindings){
 const drafts=await approved();
 for(const d of drafts){
  if(d.id==='s4law_baishi_binding'){assert.deepEqual(rows, [...original.bindings,d.row],'正式绑定与审批内容不同');continue;}
  const before=original.codes.find(c=>c.id===d.id);
  assert.deepEqual(codes.find(c=>c.id===d.id),{...before,...d.row},`${d.id} 正式法典与审批内容不同`);
 }
 return {verified:drafts.length};
}
// Preserve the older exact-content gate after verifying every superseding byte.
export async function previousLawEdition(codes,rows){
 await verifyPublished(codes,rows);
 return structuredClone(original);
}
export async function run(args=process.argv.slice(2)){
 if(args.includes('--review')){
  await fs.mkdir(root,{recursive:true});
  if(!foundation)await fs.writeFile(`${root}/foundation.json`,JSON.stringify(original,null,2)+'\n');
  try{await fs.access(`${root}/budget.json`);}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(`${root}/budget.json`,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:1,cards:{S4LAW:{limitYuan:1,spentYuan:0,reservedYuan:0,maxRequests:24}},requests:{}}));}
  const {summary}=await runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,validateDraft,
   reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('用户授权的固定程序候选');},buildReviewRequest:defaultReviewRequest,
   client:new DeepSeekClient({budgetYuan:1,logFile:`${root}/usage.jsonl`}),cardId:'S4LAW',
   allocation:{cardId:'S4LAW',incrementLimitYuan:1,maxRequests:24,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:6});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S4LAW}));
 }
 if(args.includes('--publish')){
  const drafts=await approved(),next=structuredClone(current);
  for(const d of drafts.filter(d=>d.id!=='s4law_baishi_binding')){
   const i=next.law.codes.findIndex(c=>c.id===d.id),before=original.codes.find(c=>c.id===d.id);
   assert.ok(JSON.stringify(next.law.codes[i])===JSON.stringify(before)||JSON.stringify(next.law.codes[i])===JSON.stringify({...before,...d.row}),'发布前法典已有未审批改动');
   next.law.codes[i]={...before,...d.row};
  }
  const nextBindings=[...original.bindings,drafts.find(d=>d.id==='s4law_baishi_binding').row];
  assert.ok(JSON.stringify(bindings)===JSON.stringify(original.bindings)||JSON.stringify(bindings)===JSON.stringify(nextBindings),'发布前绑定已有未审批改动');
  // Keep the existing rules file's formatting, changing only approved code rows.
  let text=await fs.readFile(rulesFile,'utf8');
  const newline=text.includes('\r\n')?'\r\n':'\n';
  const formatted=row=>JSON.stringify(row,null,2).split('\n').map((line,i)=>i?'      '+line:line).join(newline);
  for(let i=0;i<current.law.codes.length;i++){
   const before=formatted(current.law.codes[i]),after=formatted(next.law.codes[i]);
   if(before!==after){assert.ok(text.includes(before),'法典行格式已变，拒绝整文件重排');text=text.replace(before,after);}
  }
  await fs.writeFile(rulesFile,text);
  await fs.writeFile(bindingsFile,JSON.stringify(nextBindings,null,2)+'\n');
  console.log(JSON.stringify({published:drafts.length}));
 }
 if(args.includes('--verify'))console.log(JSON.stringify(await verifyPublished((await read(rulesFile)).law.codes,await read(bindingsFile))));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
