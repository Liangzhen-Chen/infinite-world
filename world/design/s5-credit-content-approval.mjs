// S5-03 fixed currency candidates. Preparation makes no model calls and does
// not publish. The ordinary L1/L2/L4 content gate remains the publication gate.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultReviewRequest,readApprovedContent,runContentPipeline} from '../../tools/content-pipeline.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';

export const revision='s5-credit-currency-2';
const root='world/drafts/s5-credit-content';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const rules=await read('world/meta/rules.json'),catalog=await read('world/meta/items.json'),ontology=await read('world/ontology/resources.json');
let foundation;try{foundation=await read(`${root}/foundation.json`);}catch(e){if(e.code!=='ENOENT')throw e;}
const original=foundation??{credit:rules.economy.credit,items:catalog.filter(i=>['item_coin_civic','item_coin_coast','item_copper_sheet','item_silver_wire','item_parchment'].includes(i.id)),resources:ontology.entries.filter(r=>r.money)};
const {credit,items}=original,resources={entries:original.resources},bank=credit.banks[0];
// These are proposed author facts, not claims about already published lore.
// Metal weights use the existing physical catalog wherever it has a unit.
// The purse copper's missing unit weight is explicitly pending calibration.
const metals={copper:{item:'item_copper_sheet'},silver:{item:'item_silver_wire'}};
const currencies=credit.coinages.map(c=>{
 const resource=c.id.replace(/^coinage_/,'coin_'),money=resources.entries.find(r=>r.id===resource).money;
 return {resource,coinage:c.id,item:c.item,money:{...money,weight:c.item?items.find(i=>i.id===c.item).weight:0.005},
  basis:c.item?'existing catalog weight and resource metal/fineness/issuer':'author candidate: copper unit 5g; calibration pending',
  bounds:{weight:[0.001,0.02],fineness:[0,1]}};
});
const noteItem={id:'item_banknote_hw',name:'河湾兑付券',basePrice:items.find(i=>i.id==='item_parchment').basePrice,weight:0.001,aliases:['河湾券'],quality:'木',durability:100,scope:null,origin:bank.location,shelfLifeDays:null,
 tags:['coin','paper'],use:'向小驿站汇兑柜请求按券面条款兑付；实际汇价由准备金、信用与流通量派生。',
 description:'小驿站汇兑柜发行的纸质兑付券。一券承诺兑付一百文西陲铜钱；承诺不等于市价，柜台现金不足时不能凭空兑付。',
 inspection:'核对发行者和兑付条款。此券是可转移的信用货币，不是某位储户具名存单的副本。',storage:'保持干燥；破损或伪造的纸张不能增加发行量或准备金。'};
const note={resource:'coin_hw_note',coinage:'coinage_hw_note',item:noteItem.id,
 money:{metal:'none',weight:noteItem.weight,fineness:1,issuer:bank.id,coinage:'coinage_hw_note',item:noteItem.id,backedBy:{coin:'coin_river',ratio:100}},
 basis:'S5-03 author candidate; backed paper branch of 15 §15.3; not a deposit claim',bounds:{weight:[0.0005,0.003],ratio:[1,1000]}};
currencies.push(note);
const table={schema:'currency@1',metals,currencies,
 issuer:{id:bank.id,location:bank.location,minReserveRatio:0.2,issueDailyMaximum:1000,exchangeAccepted:currencies.map(c=>c.resource),
  basis:'15 §15.3/§15.5; existing physical bank; proposed charter, not existing authority',bounds:{minReserveRatio:[0.1,0.5],issueDailyMaximum:[1,10000]}},
 parameters:{activeWindow:{table:'balance/economy',id:'money.activeWindow'},kFloor:{table:'balance/economy',id:'money.kFloor'},reserveRatio:{table:'balance/credit',id:'reserve.ratio'}},
 bootstrap:'neutral-until-first-goods-trade',
 note:'货币价值、汇率、准备金信心、购买力都为派生视图；发行量、准备金转移与实际成交为事实。尚无真实商品成交的开局取中性充裕度1，不伪造交易额；出现成交后只读实际近期流量。纸券目录基价仅为空白纸材基准，不作币价。'};
const tender=[...rules.law.codes.map(code=>({id:code.id,kind:'code',legalTender:{unit:'coin_river',accepted:currencies.filter(c=>c.resource!=='coin_hw_note'||code.id==='law_hw_property').map(c=>c.resource)}})),...rules.law.templates.map(code=>({id:code.id,kind:'template',legalTender:{unit:'coin_river',accepted:currencies.filter(c=>c.resource!=='coin_hw_note').map(c=>c.resource)}}))];
const cleanup={bank:bank.id,removeBankFields:['loanMonthlyInterest'],depositInterest:{periodDays:credit.depositInterest.periodDays},
 note:'删除已停止消费的独立存息、天气季节利率；存息仅由同一网点基准贷息×spread派生。rateTerms.per 缺省 anchor，须在实际义务中快照。'};
const actionsFile=await read('world/actions/core.json');
const actionRows=structuredClone(actionsFile.actions.filter(a=>['core:trade.exchange','core:trade.withdraw'].includes(a.id)));
for(const a of actionRows){
 if(a.id==='core:trade.withdraw'){if(!a.slots.some(s=>s.name==='debt'))a.slots.push({name:'debt',kind:'text'});continue;}
 delete a.slots.find(s=>s.name==='item').options;
 if(!a.slots.some(s=>s.name==='buyer'))a.slots.push({name:'buyer',kind:'entity',entity:'person'});
 if(!a.slots.some(s=>s.name==='mode'))a.slots.push({name:'mode',kind:'choice',options:['exchange','issue','redeem']});
}
export const entries=[{id:'s5-credit-currencies',row:table},{id:'s5-credit-note',row:noteItem},{id:'s5-credit-tender',row:tender},{id:'s5-credit-cleanup',row:cleanup},{id:'s5-credit-actions',row:actionRows}];
export const draftFor=entry=>({id:entry.id,row:entry.row});
export const contextFor=entry=>({basis:'用户 s503-credit / s503b-credit；15 §15.3、§15.5；产品原则：派生优先、账本守恒。',
 sourceFacts:{bank,coinages:credit.coinages,resources:resources.entries.filter(r=>r.money),metalItems:items.filter(i=>Object.values(metals).some(m=>m.item===i.id)),
  missing:'当前世界没有纸币发行章程、legalTender 条款、铜钱单枚重量或信用币。以上增项都是本卡待审核的作者候选，不冒充既有事实。',
  boundaries:'用户本卡授权新增货币与银行规则候选；不新增人物或场所。仅发行路径可经src:issue创造信用货币，准备金约束与发行预算均须满足；普通贷款只转移现金。存单仍是同一债权的原件，不能当作新发行货币。',
  implementation:'币价按金属商品价×实际含量×信用×充裕度，纸币按挂钩价×准备金信心×充裕度；柜台按当刻比价双向转移。纸券目录basePrice只是纸材锚，不是币价。5g铜钱、1g纸券、100文兑付比、日发1000券为待标定作者候选。'},candidate:entry.id});
async function approved(){
 const drafts=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});
 assert.equal(drafts.length,entries.length,'信用规则候选尚未完成审批');
 for(const e of entries)assert.deepEqual(drafts.find(d=>d.id===e.id),draftFor(e));
 return drafts;
}
// Superseding tender clauses are checked here before older content gates
// inspect the unchanged remainder. This is an audit projection, not a runtime
// rules edition or a saved-game compatibility path.
export async function previousCreditTender(codes){
 const normalize=await creditTenderNormalizer();return codes.map(normalize);
}
export async function creditTenderNormalizer(){
 await approved();return value=>{
  const code=structuredClone(value);
  const t=tender.find(t=>t.id===code.id);assert.ok(t,'未登记的通货法域');assert.deepEqual(code.recognition?.legalTender,t.legalTender,'未审批的通货认可条款');
  delete code.recognition.legalTender;if(!Object.keys(code.recognition).length)delete code.recognition;
  return code;
 };
}
export async function verifyPublished(){
 await approved();assert.deepEqual(await read('world/rules/tables/currency.json'),table);
 const currentRules=await read('world/meta/rules.json'),currentItems=await read('world/meta/items.json'),currentResources=await read('world/ontology/resources.json'),currentActions=await read('world/actions/core.json');
 assert.deepEqual(currentItems.find(i=>i.id===noteItem.id),noteItem);
 for(const c of currencies)assert.deepEqual(currentResources.entries.find(r=>r.id===c.resource)?.money,c.money);
 for(const t of tender)assert.deepEqual((t.kind==='code'?currentRules.law.codes:currentRules.law.templates).find(c=>c.id===t.id)?.recognition?.legalTender,t.legalTender);
 for(const a of actionRows)assert.deepEqual(currentActions.actions.find(c=>c.id===a.id),a);
 assert.deepEqual(currentRules.economy.credit.depositInterest,cleanup.depositInterest);
 assert.equal(currentRules.economy.credit.banks.find(b=>b.id===bank.id).loanMonthlyInterest,undefined);
 return {verified:entries.length};
}
export async function run(args=process.argv.slice(2)){
 if(args.includes('--review')){
  assert.ok(process.env.DEEPSEEK_API_KEY,'DEEPSEEK_API_KEY unavailable');await fs.mkdir(root,{recursive:true});
  if(!foundation)await fs.writeFile(`${root}/foundation.json`,JSON.stringify(original,null,2)+'\n');
  try{await fs.access(`${root}/budget.json`);}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(`${root}/budget.json`,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:0.3,cards:{S503C:{limitYuan:0.3,spentYuan:0,reservedYuan:0,maxRequests:8}},requests:{}}));}
  const budget=await read(`${root}/budget.json`);budget.cards.S503C.maxRequests=12;await fs.writeFile(`${root}/budget.json`,JSON.stringify(budget,null,2)+'\n');
  const {summary}=await runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,
   validateDraft:(d,e)=>{try{assert.deepEqual(d,draftFor(e));return [];}catch(error){return [error.message];}},
   reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('Fixed credit candidate');},buildReviewRequest:defaultReviewRequest,
   client:new DeepSeekClient({budgetYuan:0.3,logFile:`${root}/usage.jsonl`}),cardId:'S503C',
   allocation:{cardId:'S503C',incrementLimitYuan:0.3,maxRequests:12,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:5});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S503C}));
 }
 if(args.includes('--prepare')){
  await fs.mkdir(root,{recursive:true});
  await fs.writeFile(`${root}/candidate.json`,JSON.stringify({revision,status:'pending-review',entries,drafts:entries.map(draftFor)},null,2)+'\n');
  for(const e of entries)await fs.writeFile(`${root}/${e.id}.review-request.json`,JSON.stringify(defaultReviewRequest(e,draftFor(e),contextFor(e)),null,2)+'\n');
  console.log('credit-content: prepared; pending L1/L2/L4; model calls=0; published=0');
 }
 if(args.includes('--verify'))console.log(JSON.stringify(await verifyPublished()));
 if(args.includes('--publish')){
  await approved();
  const next=structuredClone(rules),nextResources=structuredClone(ontology);
  next.economy.credit.coinages=[...credit.coinages.map(c=>({...c,note:'币值按实际含量、当地金属价、信用与活跃流通量派生；面值不作固定汇率。'})),{id:note.coinage,name:noteItem.name,polity:bank.id,item:noteItem.id,fineness:1,faceCopper:100,note:'按兑付条款与实际准备金、流通量派生币值；不同于具名存单。'}];
  delete next.economy.credit.banks.find(b=>b.id===bank.id).loanMonthlyInterest;
  next.economy.credit.depositInterest={periodDays:credit.depositInterest.periodDays};
  for(const t of tender){const c=(t.kind==='code'?next.law.codes:next.law.templates).find(c=>c.id===t.id);c.recognition={...c.recognition,legalTender:t.legalTender};}
  for(const c of currencies){let r=nextResources.entries.find(r=>r.id===c.resource);if(!r){r={id:c.resource,label:noteItem.name,family:'currency',unit:'券',broader:'coin',ledger:true};nextResources.entries.push(r);}r.money={...c.money};}
  for(const [id,label]of [['src:issue','有准备金约束的信用货币发行'],['sink:redeem','信用货币实际兑付销毁']])if(!nextResources.sourcesAndSinks.some(s=>s.id===id))nextResources.sourcesAndSinks.push({id,label});
  await fs.writeFile('world/rules/tables/currency.json',JSON.stringify(table,null,2)+'\n');
  // Keep unrelated world rows byte-for-byte, including the one-line catalog.
  const replaceSection=async(file,before,after,indent)=>{let text=await fs.readFile(file,'utf8');const format=v=>JSON.stringify(v,null,2).split('\n').map((l,i)=>i?' '.repeat(indent)+l:l).join(text.includes('\r\n')?'\r\n':'\n');const a=format(before),b=format(after);assert.ok(text.includes(a),`Unexpected format ${file}`);text=text.replace(a,b);await fs.writeFile(file,text);};
  await replaceSection('world/meta/rules.json',rules.economy.credit,next.economy.credit,4);
  const live=await read('world/meta/rules.json');for(const key of ['codes','templates'])await replaceSection('world/meta/rules.json',live.law[key],next.law[key],4);
  let itemText=await fs.readFile('world/meta/items.json','utf8');const oldNote=catalog.find(i=>i.id===noteItem.id);
  if(oldNote){assert.ok(itemText.includes(JSON.stringify(oldNote)));itemText=itemText.replace(JSON.stringify(oldNote),JSON.stringify(noteItem));}
  else{const end=itemText.lastIndexOf(']');assert.ok(end>=0);itemText=itemText.slice(0,end).trimEnd()+',\n'+JSON.stringify(noteItem)+'\n'+itemText.slice(end);}
  await fs.writeFile('world/meta/items.json',itemText);
  await fs.writeFile('world/ontology/resources.json',JSON.stringify(nextResources,null,1)+'\n');
  let actionText=await fs.readFile('world/actions/core.json','utf8');for(const a of actionRows){const old=actionsFile.actions.find(x=>x.id===a.id);assert.ok(actionText.includes(JSON.stringify(old)));actionText=actionText.replace(JSON.stringify(old),JSON.stringify(a));}await fs.writeFile('world/actions/core.json',actionText);
  console.log(JSON.stringify({published:entries.length}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
