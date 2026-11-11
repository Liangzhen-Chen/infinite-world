// Offline analysis of committed monthly checkpoints; never reads a running
// engine's memory and never changes a world or a checkpoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {marketQuote} from '../server-plugin/market.mjs';
import {maintenanceOptions} from '../server-plugin/building-maintenance.mjs';
import {transportAssetView} from '../server-plugin/transport.mjs';
import {computeMetrics} from './balance-metrics.mjs';
import {distribution,tailBand,summarizeRun,scenarioWorld,fixture} from './s5-law-soak.mjs';

const sum=xs=>xs.reduce((a,b)=>a+b,0);
export function observedFlows(snapshots){
 const facts=new Map();for(const s of snapshots)for(const r of s.financial){const id=r.id??r.eventId??(r.issuer&&`profit:${r.issuer}`);if(id)facts.set(`${r.category}:${id}`,r);}
 const rows=[...facts.values()],first=snapshots[0],last=snapshots.at(-1),people=new Map();
 const familyOf=new Map(last.households.flatMap(h=>(h.memberIds??[]).map(id=>[id,h.id])));
 const person=id=>{if(!people.has(id))people.set(id,{id,receipts:0,payments:0,wageEarned:0,wagePaid:0,wageArrears:0,salaryEarned:0,salaryPaid:0,sales:0,purchases:0});return people.get(id);};
 const pay=(from,to,n)=>{if(familyOf.has(from)&&familyOf.get(from)===familyOf.get(to))return;person(from).payments+=n;person(to).receipts+=n;};
 const trades=rows.filter(r=>r.category==='market_trade'&&r.minute>=first.minute);
 for(const r of trades){person(r.seller).sales+=r.totalCoins;person(r.buyer).purchases+=r.totalCoins;pay(r.buyer,r.seller,r.totalCoins);}
 const wages=[];
 for(const r of rows.filter(r=>r.category==='employment_pay')){
  const contract=rows.find(c=>c.id===r.contract),p=contract?.worker?person(contract.worker):null;
  wages.push({id:r.id,contract:r.contract,worker:contract?.worker??null,owner:contract?.owner??null,...r.result,minutes:r.minutes,wage:r.wage,balanced:r.result.earned===r.result.paid+r.result.arrears});
  if(p){p.wageEarned+=r.result.earned;p.wagePaid+=r.result.paid;p.wageArrears+=r.result.arrears;pay(contract.owner,contract.worker,r.result.paid);}
 }
 for(const r of rows.filter(r=>r.category==='office_salary'&&r.assessedAt>=first.minute)){const p=person(r.holder);p.salaryEarned+=r.monthlyCopper;p.salaryPaid+=r.paid;pay(r.settlement,r.holder,r.paid);}
 const households=last.households.map(h=>{
  const members=(h.memberIds??[]).map(id=>people.get(id)).filter(Boolean),receipts=sum(members.map(p=>p.receipts)),payments=sum(members.map(p=>p.payments)),opening=first.households.find(x=>x.id===h.id)?.cash??null;
  return {...h,openingCash:opening,cashChange:opening===null?null:h.cash-opening,observedReceipts:receipts,observedPayments:payments,observedCashFlowRatio:payments>0?receipts/payments:null,
   wageEarned:sum(members.map(p=>p.wageEarned)),salaryEarned:sum(members.map(p=>p.salaryEarned)),unexplainedCashChange:opening===null?null:h.cash-opening-receipts+payments};
 });
 return {trades,wages,households,scope:'已记录市场成交、雇佣工资、官俸；同户内部转移不计收支。未覆盖自用产出、贷款、所有税租/消费，不称NUM-W10完整必要支出比。',
  householdCashFlowRatio:distribution(households.map(r=>r.observedCashFlowRatio)),unexplained:distribution(households.map(r=>r.unexplainedCashChange))};
}
export function persistentReserves(snapshots){
 return snapshots[0].households.map(h=>{let run=0,longest=0,observed=0;for(const s of snapshots.slice(1)){const b=s.reserves?.find(r=>r.id===h.id);if(!b){run=0;continue;}observed++;const short=Object.values(b.shortfall??{}).some(n=>n>0);run=short?run+1:0;longest=Math.max(longest,run);}return {id:h.id,region:h.region,observed,longest,persistent:longest>=3};});
}
export function groupObservations(rows,{dimensions,value,abnormal,observed=()=>true}){
 return Object.fromEntries(dimensions.map(d=>{const groups=new Map();for(const r of rows){const k=String(r[d]??'unknown');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}return [d,Object.fromEntries([...groups].map(([key,rr])=>{const known=rr.filter(observed);return [key,{...distribution(rr.map(value)),tail:tailBand(known.filter(abnormal).length,known.length),unobserved:rr.length-known.length}];}))];}));
}
export function shopLifecycleObservations(snapshots){
 const ids=[...new Set(snapshots.flatMap(s=>s.shops.map(r=>r.id)))];
 const rows=ids.map(id=>{
  const known=snapshots.flatMap(s=>s.shops.filter(r=>r.id===id));
  if(known.every(s=>s.native))return {id,count:null,scope:'原生商店目录无续营状态流；不能将目录标签当作实际营业观测'};
  let previous=null,count=0;for(const s of known){const status=s.suspended?'暂闭':s.status;if(previous!==null&&status!==previous)count++;previous=status;}
  return {id,count,lastStatus:previous,observations:known.length};
 });
 return {rows,distribution:distribution(rows.map(s=>s.count)),scope:'有经营状态记录者的月末切换下界；原生商店状态未覆盖，设施与成交另报'};
}
export function facilityExposure(snapshots,damageRecords){
 const rows=snapshots[0].facilities.map(first=>{
  const damage=damageRecords.filter(r=>r.category==='facility_damage'&&r.building===first.id),history=snapshots.map(s=>s.facilities.find(r=>r.id===first.id));
  let streak=0,longest=0,closedStreak=0,closedLongest=0;
  for(const f of history.slice(1)){streak=f?.factor<1?streak+1:0;longest=Math.max(longest,streak);closedStreak=f?.factor===0?closedStreak+1:0;closedLongest=Math.max(closedLongest,closedStreak);}
  return {id:first.id,region:first.region,material:first.material,initialCondition:first.condition,hazardClass:damage.length?'有外部损伤记录':'无外部损伤记录',externalDamage:sum(damage.map(r=>r.amount)),sources:damage.map(r=>({minute:r.minute,cause:r.cause,sourceEvent:r.sourceEvent})),persistent:longest>=3,persistentlyClosed:closedLongest>=3,conditionDelta:history.at(-1)?.condition-first.condition,observedClosed:history.filter(f=>f?.factor===0).length};
 });
 return {rows,groups:groupObservations(rows,{dimensions:['hazardClass','region','material','initialCondition'],value:r=>r.conditionDelta,abnormal:r=>r.persistent}),closedTail:tailBand(rows.filter(r=>r.persistentlyClosed).length,rows.length),scope:'降容与停用分列；外部损伤单列，不冒充无灾正常可比组。月末观测不等于精确停工天数。'};
}
function humanEpidemics(snapshots){
 const rows=new Map();for(const s of snapshots)for(const r of s.financial.filter(r=>r.category==='epidemic'))rows.set(r.id,r);
 return [...rows.values()].map(r=>({id:r.id,origin:r.origin,status:r.status,since:r.since,endedAt:r.endedAt??null,households:Object.keys(r.households).length,patients:new Set(Object.values(r.households).flatMap(h=>h.patients??[])).size}));
}
export function publicTransportObservations(records,rules,endMinute){
 const rows=records.filter(r=>r.category==='settlement_trade').map(r=>r.status==='refused'?{...r,workers:0}:r).map(r=>({id:r.id,seller:r.seller,buyer:r.buyer,quantity:r.quantity,workers:r.workers,carrier:r.carriage??null,loadKg:r.quantity*rules.unitKg,capacityKg:r.workers*rules.carryKgPerWorker,
  occupancy:r.workers>0?r.quantity*rules.unitKg/(r.workers*rules.carryKgPerWorker):null,dispatchAt:r.dispatchAt,homeAt:r.homeAt??null,workerDays:r.carriage?0:r.workers*(Math.min(endMinute,r.homeAt??endMinute)-r.dispatchAt)/1440,status:r.status}));
 const peaks={};for(const seller of new Set(rows.map(r=>r.seller))){const points=rows.filter(r=>r.seller===seller&&!r.carrier&&r.workers>0).flatMap(r=>[{minute:r.dispatchAt,delta:r.workers},{minute:r.homeAt??endMinute,delta:-r.workers}]).sort((a,b)=>a.minute-b.minute||a.delta-b.delta);let busy=0,peak=0;for(const p of points){busy+=p.delta;peak=Math.max(peak,busy);}peaks[seller]={peak,upperLimit:rules.workersMaximum,overLimit:peak>rules.workersMaximum};}
 return {rows,n:rows.length,statusCounts:rows.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{}),loadRatio:distribution(rows.map(r=>r.occupancy)),workerDays:sum(rows.map(r=>r.workerDays)),peaks,scope:'n包括被拒的派运尝试；refused未派工，占用为0、装载率不适用。实际出发至回乡全程占用；carriage另走承运资产，不重复占村劳力。workersMaximum只验证配置上限，不替代逐刻可用劳力证明。'};
}
export async function analyzeLawSoak(out){
 const world=await loadWorld(),runs=[];
 for(const seed of fixture.seeds)for(const scenario of fixture.scenarios){
  const dir=path.join(out,`${seed}-${scenario}`);let saved;
  try{saved=JSON.parse(await fs.readFile(path.join(dir,'checkpoint.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;runs.push({seed,scenario,complete:false,reason:'未启动/无检查点'});continue;}
  let result;try{result=JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const {document,snapshots,elapsedDays}=saved,engine=new WorldEngine(scenarioWorld(world,scenario)),report=summarizeRun(snapshots,{scenario,complete:elapsedDays===world.rules.calendar.daysPerMonth*world.rules.calendar.monthsPerYear});
  const flow=observedFlows(snapshots),read=engine.primitiveDraft(document),last=snapshots.at(-1),prices=[];
  for(const h of flow.households){
   if(h.stratum!=='unclassified')continue;const ids=new Set(h.memberIds??[]);
   const isTenant=last.rents.some(r=>r.assetClass==='field'&&ids.has(r.tenant)),isOfficial=h.salaryEarned>0,isWorker=h.wageEarned>0,isMerchant=last.shops.some(r=>ids.has(r.owner));
   h.stratum=isTenant?'已记录佃户':isOfficial?'已领官俸户':isWorker?'已挣雇工工资户':isMerchant?'经营户（规模未分）':'阶层未记录';
  }
  // Existing traded items, plus each authored crop seed/product. Not chosen
  // after seeing which prices pass. Zero supply groups still get a quote/error.
  const items=[...new Set([...flow.trades.map(r=>r.item),...world.domainRules.privateField.crops.flatMap(r=>[r.seed,r.product])])].sort();
  for(const place of Object.keys(document.state.settlements))for(const item of items){try{const q=marketQuote(read,engine,{item,location:place,quantity:1});prices.push({place,item,unit:q.listPrice,base:engine.byId.get(item).basePrice,ratio:q.listPrice/engine.byId.get(item).basePrice,supply:q.supply,demand:q.demand});}catch(error){prices.push({place,item,error:error.message,ratio:null});}}
  const transactionPrices=flow.trades.map(r=>({...r,unit:r.totalCoins/r.quantity,ratio:engine.byId.get(r.item)?.basePrice>0?r.totalCoins/r.quantity/engine.byId.get(r.item).basePrice:null}));
  const raw=Object.values(document.state.records),quoteHistory=raw.filter(r=>r.category==='primitive_receipt').flatMap(r=>{
   const context=r.receipt.consequences?.find(c=>c.program?.context)?.program.context;
   return (r.receipt.applied??[]).filter(a=>a.result?.kind==='regional_quote'&&a.result.price).map(a=>{const value=typeof a.result.price==='number'?a.result.price:a.result.price.numerator/a.result.price.denominator,base=engine.byId.get(a.result.item)?.basePrice;return {eventId:r.receipt.eventId,minute:context?.minute??null,place:context?.settlement??null,item:a.result.item,unit:value,base,ratio:base>0?value/base:null};});
  });
  const publicTransport=publicTransportObservations(raw,engine.rules.settlementTrade,document.state.minute);
  const foodItems=[...new Set(flow.trades.filter(r=>engine.byId.get(r.item)?.nutrition?.satiety>0).map(r=>r.item))];
  const foodCycle=foodItems.map(item=>{const trades=flow.trades.filter(r=>r.item===item),flows=Object.entries(document.ledger.flows??{}).filter(([key])=>key.split('|')[1]===item&&key.startsWith('sink:consume|'));
   return {item,purchasedQuantity:sum(trades.map(r=>r.quantity)),lastPurchaseDay:Math.max(...trades.map(r=>r.day)),mealConsumed:sum(flows.filter(([key])=>key.endsWith('|meal')).map(([,n])=>n)),allConsumePurposes:flows,totalConsumed:sum(flows.map(([,n])=>n))};});
  const restocking=raw.filter(r=>r.category==='shop_ledger').map(r=>({shop:r.shop,keeper:r.keeper,windowStart:Math.min(...r.entries.map(x=>x.minute)),windowEnd:Math.max(...r.entries.map(x=>x.minute)),attempts:r.entries.length,failed:r.entries.filter(x=>x.wanted>0&&!x.added).length,reasons:r.entries.reduce((o,x)=>(o[x.reason??'added']=(o[x.reason??'added']??0)+1,o),{})}));
  const maintenance=last.facilities.filter(f=>f.factor<1&&f.owner&&document.state.npcs[f.owner]).map(f=>{
   const options=maintenanceOptions(engine,document,f.owner,f.id),stock=document.state.npcs[f.owner].inventory;
   return {id:f.id,owner:f.owner,condition:f.condition,cash:f.ownerCash,inventory:stock,options,scope:'期末原因诊断；不把这一刻可行性倒推全年'};
  });
  const commercial=report.facilities.rows.filter(f=>last.shops.some(s=>s.location===f.id)),reserves=persistentReserves(snapshots);
  // Catalog stores have no lifecycle status record. Their fixed catalog label
  // cannot prove zero closures; keep them in n with an unknown switch count.
  report.shopSwitches=shopLifecycleObservations(snapshots);
  const persistedTraits=Object.entries(document.state.npcs).filter(([,n])=>n.maintenanceDelayPermille!==undefined||n.businessAttachmentPermille!==undefined).map(([id,n])=>({id,maintenanceDelayPermille:n.maintenanceDelayPermille??null,businessAttachmentPermille:n.businessAttachmentPermille??null}));
  const groupedHouseholds=flow.households.map(h=>({...h,...reserves.find(r=>r.id===h.id),wealthBand:report.households.rows.find(r=>r.id===h.id)?.wealthBand}));
  const shipments=last.shipments.map(r=>({...r,capacity:transportAssetView(engine,document,r.asset)?.capacityKg??null}));
  const extended={seed,...report,error:result?.error??null,elapsedMs:result?.elapsedMs??null,flow,
   // scenarioWorld clones serialized runtime facts. loadWorld.balance is
   // non-enumerable, so pass the original validated tables explicitly here.
   metrics:computeMetrics(document,{world:engine.world,tables:world.balance}).metrics,
   facilityExposure:facilityExposure(snapshots,raw),
   decisionTraits:{population:Object.keys(document.state.npcs).length,persisted:persistedTraits,maintenanceDelay:distribution(persistedTraits.map(n=>n.maintenanceDelayPermille)),businessAttachment:distribution(persistedTraits.map(n=>n.businessAttachmentPermille)),degradedOwnerDelayAtEnd:distribution(maintenance.map(r=>r.options?.delayPermille??null)),scope:'只统计已落盘偏好；未落盘不当作零偏好。期末查询仅覆盖受损业主，不外推全人口人格分布。S6临时冲动状态尚无实际协议。'},
   populationDistribution:{opening:{level:snapshots[0].metrics['level.distribution'],skill:snapshots[0].metrics['skill.tierDistribution']},closing:{level:last.metrics['level.distribution'],skill:last.metrics['skill.tierDistribution']},scope:'已建档人物/技能从业者的原始分母，不外推全人口或长期稳态'},
   cycleCoverage:{yearDays:elapsedDays,declaredCropGrowthDays:engine.rules.agriculture.crop.growthDays,initialLeasesBeyondYear:snapshots[0].rents.filter(r=>r.deadline>document.state.minute).map(r=>r.id),privateCropsStillGrowing:raw.filter(r=>r.category==='private_farm'&&r.status==='growing').map(r=>({id:r.id,sownDay:r.sownDay,grownDays:r.grownDays}))},
   prices:{quotes:distribution(prices.map(r=>r.ratio)),quoteRows:prices,transactions:distribution(transactionPrices.map(r=>r.ratio)),transactionRows:transactionPrices,history:distribution(quoteHistory.map(r=>r.ratio)),historyRows:quoteHistory},
   commercialFacilities:{n:commercial.length,tail:tailBand(commercial.filter(r=>r.persistent).length,commercial.length),rows:commercial},maintenance,
   reserves:{tail:tailBand(reserves.filter(r=>r.persistent).length,reserves.filter(r=>r.observed).length),rows:reserves,groups:groupObservations(groupedHouseholds,{dimensions:['region','stratum','wealthBand','occupation'],value:r=>r.observedCashFlowRatio,abnormal:r=>r.persistent,observed:r=>r.observed>0}),scope:'一日物理口粮/饮水库存缺口，尚未发生采购；不是缺餐人日，不冒充D2不理性尾部；组内分布是已记录现金流比，非NUM-W10'},
   facilityGroups:groupObservations(report.facilities.rows,{dimensions:['region','material','initialCondition','kind'],value:r=>r.delta,abnormal:r=>r.persistent}),
   epidemics:humanEpidemics(snapshots),shipments,publicTransport,restocking,foodCycle,
   tradesPerMonth:Array.from({length:world.rules.calendar.monthsPerYear},(_,month)=>({month:month+1,n:flow.trades.filter(r=>Math.floor((r.minute-snapshots[0].minute)/(world.rules.calendar.daysPerMonth*1440))===month).length}))};
  await fs.writeFile(path.join(dir,'analysis.json'),JSON.stringify(extended,null,2));runs.push(extended);
 }
 const completed=runs.filter(r=>r.complete),paired=fixture.seeds.map(seed=>({seed,baseline:runs.find(r=>r.seed===seed&&r.scenario==='baseline'),shock:runs.find(r=>r.seed===seed&&r.scenario==='poor-harvest')}));
 const groups=Object.fromEntries(fixture.scenarios.map(scenario=>{const rr=runs.filter(r=>r.scenario===scenario),done=rr.filter(r=>r.complete);return [scenario,{n:rr.length,complete:done.length,
  missingMeals:distribution(done.map(r=>r.NUM_W7.missing)),population:distribution(done.map(r=>r.NUM_W7.population)),facilityPersistent:distribution(done.map(r=>r.facilities.tail.proportion)),commercialPersistent:distribution(done.map(r=>r.commercialFacilities.tail.proportion)),
  price:distribution(done.flatMap(r=>r.prices.quoteRows.map(p=>p.ratio))),tradePrice:distribution(done.flatMap(r=>r.prices.transactionRows.map(p=>p.ratio))),
  shopSwitches:distribution(done.flatMap(r=>r.shopSwitches.rows.map(s=>s.count))),humanEpidemicCases:distribution(done.map(r=>sum(r.epidemics.map(e=>e.patients)))),wildlifePeakInfected:distribution(done.map(r=>r.disease.peakInfected)),transportBookings:distribution(done.map(r=>r.transport.n)),
  publicTransportBookings:distribution(done.map(r=>r.publicTransport.n)),publicTransportLoad:distribution(done.flatMap(r=>r.publicTransport.rows.map(p=>p.occupancy))),historicQuoteRatio:distribution(done.flatMap(r=>r.prices.historyRows.map(p=>p.ratio))),
  foodPurchased:distribution(done.map(r=>sum(r.foodCycle.map(f=>f.purchasedQuantity)))),purchasedFoodConsumed:distribution(done.map(r=>sum(r.foodCycle.map(f=>f.totalConsumed)))),lastTradeDay:distribution(done.map(r=>r.flow.trades.length?Math.max(...r.flow.trades.map(t=>t.day)):null)),
  ledgerErrors:sum(done.map(r=>r.ledgerErrors.length)),ecologyErrors:sum(done.map(r=>r.ecologyErrors.length)),wageInvariantErrors:sum(done.map(r=>r.flow.wages.filter(w=>!w.balanced).length)),rentContracts:sum(done.map(r=>r.rents.rows.length))}];}));
 const targetData=JSON.parse(await fs.readFile(new URL('../world/rules/tables/balance/targets.json',import.meta.url),'utf8'));
 const targets=(targetData.rows??targetData.targets??[]).filter(r=>r.stage==='S5'&&r.metric.startsWith('NUM-')).map(t=>({id:t.metric,grade:t.grade,target:t.target??t.bands??null,status:'未完成规定验收',observed:null,reason:t.method}));
 const w7=targets.find(r=>r.id==='NUM-W7');if(w7){w7.observed={missing:groups.baseline.missingMeals,perPersonYear:distribution(completed.filter(r=>r.scenario==='baseline').map(r=>r.NUM_W7.population?r.NUM_W7.missing/r.NUM_W7.population:null))};w7.status=completed.some(r=>r.scenario==='baseline'&&r.NUM_W7.missing>r.NUM_W7.limit)?'失败（已观测公共粮仓组超标）':groups.baseline.complete===10?'已观测公共粮仓组年度截面；全人口覆盖未完成':'年度运行未完成';w7.reason='有公共粮仓的缺餐累计数；无公共粮仓组没有同口径人日，不能给全世界通过。';}
 const w8=targets.find(r=>r.id==='NUM-W8');if(w8){w8.observed=distribution(completed.filter(r=>r.scenario==='baseline').map(r=>r.households.cashGini));w8.reason='仅钱袋基尼，不含资产负债，不能代替财富基尼或30年趋势。';}
 const p1=targets.find(r=>r.id==='NUM-P1');if(p1){const all=completed.flatMap(r=>r.metrics['seats.holders']?.value?.violations??[]);p1.observed={violations:all.length,rows:all,caps:completed.map(r=>({seed:r.seed,scenario:r.scenario,cap:r.metrics['seats.holders']?.value?.cap??null}))};p1.status=all.length?'失败（已观测NPC超额）':'已观测NPC无超额；完整名额验收未完成';p1.reason='离线重算显式传入loadWorld的非枚举balance表；仍缺玩家名额/递补及30年性质流。';}
 for(const id of ['NUM-P2','NUM-P3']){const t=targets.find(r=>r.id===id);if(t){t.observed=completed.filter(r=>r.scenario==='baseline').map(r=>({seed:r.seed,...r.populationDistribution}));t.reason='保留每技能族从业者和已知等级分母及期初/期末分布；已建档子集不等于3.5万人口，一年不等于30年稳态。';}}
 const w10=targets.find(r=>r.id==='NUM-W10');if(w10){w10.observed={partialCashFlowRatio:distribution(completed.filter(r=>r.scenario==='baseline').flatMap(r=>r.flow.households.map(h=>h.observedCashFlowRatio))),completeNecessaryExpenseRatios:0};w10.reason='缺自用产出、食住衣燃料必要支出全口径及非灾年10年均值；已记录现金流比另报，不替代目标。';}
 for(const id of ['NUM-W1','NUM-W2','NUM-W3','NUM-W4','NUM-W6']){const t=targets.find(r=>r.id===id);if(t){const wages=completed.filter(r=>r.scenario==='baseline').flatMap(r=>r.flow.wages);t.observed={paidWorkEvents:wages.length,earnedPer480Minutes:distribution(wages.map(w=>w.minutes>0?w.earned*480/w.minutes:null))};t.reason='有限雇佣事件保留，未覆盖各职业族各阶完整年收入/单人生存篮子分母，不以零样本作达标。';}}
 const summary={format:'K13-analysis@1',seeds:fixture.seeds,expected:20,complete:completed.length,groups,targets,
  declaredRandomness:{maintenance:world.rules.facilities.maintenance,business:world.rules.businessLifecycle??world.rules.economy.businessLifecycle??null,householdBuffer:world.marketRules.householdBuffer,scope:'现有持久偏好/每次噪声参数；不是S6统一logit或有限时长冲动状态。未把stubborn概率当作年度异常主体比例。'},
  P:{A1:'按设施/商业设施分母分别列；持续有钱与可达供给条件仍需路径证据，不能用总组稀释',A2:'暂闭/退出独立；月末切换是下界',D1:'S6依赖未完成',D2:'不把物理库存缺口或一次异常等同于年度非理性尾部',C1:'年度没有显式私约拒绝记录；由真实私约控制夹具另验',C2:'账本、工资、运力分项；未发生事件不冒充机制全覆盖',C3:'真实market_trip与market_trade记录保留，无交易地点不删'},
  paired:paired.map(p=>({seed:p.seed,complete:p.baseline?.complete&&p.shock?.complete,baselineMissing:p.baseline?.NUM_W7?.missing??null,shockMissing:p.shock?.NUM_W7?.missing??null})),
  principles:['系统性不现实追溯规律及其交互，不能局部打补丁掩盖。','分布允许随机与少数离群；0–5%初试、5–10%敏感性，不将共灾冒充个体噪声。','不调参凑数、不挑种子、不删失败组、不在日结后回填目标值。']};
 await fs.writeFile(path.join(out,'analysis-summary.json'),JSON.stringify(summary,null,2));return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const s=await analyzeLawSoak(process.argv[2]);console.log(JSON.stringify({complete:s.complete,expected:s.expected,groups:s.groups,targets:s.targets}));}
