// K13: read-only observations and a resumable runner. No decision function
// supplies a statistic's expected value. P observations never alter targets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';
import {auditLedger,parseAccount,withLedger} from '../server-plugin/ledger.mjs';
import {allFacilities,facilityView} from '../server-plugin/facility-state.mjs';
import {shopStores} from '../server-plugin/shop.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {transportAssetView} from '../server-plugin/transport.mjs';
import {computeMetrics,median,gini} from './balance-metrics.mjs';
import {auditPopulations} from './w4-audit-ecology.mjs';

const DAY=1440;
export const fixture=JSON.parse(await fs.readFile(new URL('../tests/fixtures/s5-law/soak.json',import.meta.url),'utf8'));
const numeric=x=>typeof x==='number'?x:x&&Number.isFinite(x.numerator)&&x.denominator?x.numerator/x.denominator:null;
const sum=xs=>xs.reduce((a,b)=>a+b,0);
export function distribution(values){
 const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);
 const q=p=>{if(!xs.length)return null;const at=(xs.length-1)*p,lo=Math.floor(at);return xs[lo]+(xs[Math.ceil(at)]-xs[lo])*(at-lo);};
 return {n:values.length,measured:xs.length,missing:values.length-xs.length,median:median(xs),p10:q(.1),p90:q(.9)};
}
export function tailBand(numerator,denominator){
 const proportion=denominator?numerator/denominator:null;
 return {numerator,denominator,proportion,interpretation:proportion===null?'无暴露':proportion<=.05?'0–5%初试带':proportion<=.10?'5–10%敏感性带':'超过10%，须查机制与共同冲击'};
}
// Independent arithmetic over recorded facts, also used by hand fixtures.
export function resourceAccount({stock,food,seed,committed,inUse=0}){
 const retained=Math.max(inUse,food+seed)+committed;
 return {stock,retained,saleable:Math.max(0,stock-retained),shortfall:Math.max(0,retained-stock)};
}
export function cashAccount({cash,receivables=[],payables=[]}){
 return {cash,receivable:sum(receivables.map(r=>Math.max(0,r.amount-(r.paid??0)))),payable:sum(payables.map(r=>Math.max(0,r.amount-(r.paid??0))))};
}
export function rentObservation({rent,output,price=1}){
 const outputValue=output*price;return {rent,output,outputValue,ratio:outputValue>0?rent/outputValue:null,zeroOutput:outputValue===0};
}
export function sirObservation(p){
 const h=p.health??{S:p.count,I:0,R:0};return {...h,count:p.count,prevalence:p.count?h.I/p.count:null,conserved:h.S+h.I+h.R===p.count};
}
export function channelObservation(rows){
 const eligible=rows.filter(r=>r.consent&&r.deliverable&&r.payment);
 return {attempts:rows.length,eligible:eligible.length,depthOnlyRejected:eligible.filter(r=>r.rejected&&r.reasons.length===1&&['depth','reference-band'].includes(r.reasons[0])).length};
}
export function capacityObservation(rows){
 const byAsset={};for(const r of rows){const a=byAsset[r.asset]??={capacity:r.capacity,load:0,bookings:0};a.load+=r.load;a.bookings++;}
 return Object.entries(byAsset).map(([asset,r])=>({asset,...r,ratio:r.capacity>0?r.load/r.capacity:null,overbooked:r.bookings>1||r.load>r.capacity}));
}
function region(e,s,id){
 const seen=new Set();while(id&&!seen.has(id)){seen.add(id);if(s.settlements?.[id])return id;const b=s.created?.[id]??e.byId.get(id);id=b?.settlement??b?.parent??b?.region;}return 'unknown';
}
function balances(document){
 const out={};for(const [key,amount]of Object.entries(document.ledger?.accounts??{})){const a=parseAccount(key);if(a.resource==='coin_river'){const row=out[a.owner]??={cash:0,escrow:0,other:0};row[['purse','counter','treasury'].includes(a.purpose)?'cash':a.purpose==='escrow'?'escrow':'other']+=amount;}}
 return out;
}
export function lawObservations(engine,document){
 const s=document.state,records=Object.values(s.records??{}),money=balances(document),obligations=Object.values(s.obligations??{});
 const facilities=allFacilities(engine,s).map(b=>{
  const v=facilityView(engine,s,b.id),row=s.buildings?.[b.id]??{};
  return {id:b.id,region:region(engine,s,b.id),material:v.material,kind:v.kind,condition:v.condition,factor:v.factor,burning:v.burning,owner:row.owner??null,ownerCash:money[row.owner]?.cash??null};
 });
 const native=shopStores(engine.world),shops=new Map(native.map(b=>[b.id,{id:b.id,owner:b.keeper,location:b.location??engine.byId.get(b.keeper)?.workplace?.location,status:'营业',native:true}]));
 for(const r of records.filter(r=>r.category==='business'))shops.set(r.id,{id:r.id,owner:r.owner,location:r.location,status:r.status,suspended:r.suspended??false,endedAt:r.endedAt??null,decision:r.lifecycle??null});
 const households=(engine.world.households??[]).map(h=>{
  const members=h.members??[],claims=obligations.filter(r=>members.includes(r.creditor)&&r.resource==='coin_river'&&!['completed','void','cancelled'].includes(r.status)),debts=obligations.filter(r=>members.includes(r.debtor)&&r.resource==='coin_river'&&!['completed','void','cancelled'].includes(r.status));
  return {id:h.id,region:h.settlement??region(engine,s,h.homeLocation),members:members.length,memberIds:members,occupation:members.map(id=>engine.byId.get(id)?.occupation??'unknown').join('/'),stratum:h.stratum??h.class??'unclassified',...cashAccount({cash:sum(members.map(id=>money[id]?.cash??0)),receivables:claims,payables:debts})};
 });
 const rents=records.filter(r=>r.kind==='asset_lease').map(r=>{
  const farms=records.filter(f=>f.category==='private_farm'&&f.lease===r.id),output=sum(farms.map(f=>f.harvestedQty??0)),price=numeric(r.tenancy?.cropPrice??r.rentBasis?.quoteBasis?.unitPrice);
  const claims=obligations.filter(o=>o.kind==='rent'&&o.contract===r.id),share=r.tenancy?.rentMode==='share';
  const amount=share?(r.shareAssessed??0)*(r.tenancy?.rentPayment==='kind'?price??0:1):null;
  return {id:r.id,asset:r.subject,assetClass:r.use,region:r.settlement??region(engine,s,r.subject),tenant:r.tenant,paidAtLease:r.paid??0,claims:claims.map(o=>({id:o.id,amount:o.amount,paid:o.paid,resource:o.resource,status:o.status})),assessed:amount,deadline:r.deadline,farms:farms.map(f=>({id:f.id,status:f.status,sownDay:f.sownDay,harvestedQty:f.harvestedQty??0})),...rentObservation({rent:amount,output,price:price??0}),ratio:amount!==null&&price!==null&&output>0?amount/(output*price):null,priceKnown:price!==null,coverage:share?'真实分成核定额/真实产值':'定额租收付须合并原租约与后续义务结算，未以paid字段冒充总额',harvests:r.harvests??[]};
 });
 const settlements=Object.entries(s.settlements??{}).map(([id,r])=>({id,population:r.population??0,publicGranary:r.granary!==false,unmetMeals:r.unmetMeals??0,starvation:r.starvation??0,food:r.food??null,agriculture:s.records?.[`agriculture:${id}`]?.lastReport??null}));
 const populations=records.filter(r=>r.category==='ecology').flatMap(r=>Object.entries(r.populations??{}).map(([id,p])=>({id,habitat:r.habitat,...sirObservation(p)})));
 const shipments=records.filter(r=>r.category==='transport').map(r=>({id:r.id,asset:r.asset,status:r.status,load:r.load,capacityKg:transportAssetView(engine,document,r.asset)?.capacityKg??null,departAt:r.departAt,arrivedAt:r.arrivedAt??null}));
 const occupation=capacityObservation(shipments.filter(r=>['booked','moving','delayed','intercepted'].includes(r.status)).map(r=>({asset:r.asset,capacity:r.capacityKg,load:r.load.kg})));
 const read=engine.primitiveDraft(document),reserves=[];
 // One representative per authored household; no independent all-household
 // balance is created. The allocation result is preserved, not an expectation.
 for(const h of households){const who=h.memberIds.find(id=>s.npcs?.[id]);if(!who)continue;
  const budget=householdResources(read,engine,who,{days:1,marketSubstitution:false});
  reserves.push({id:h.id,owner:who,shortfall:budget.shortfall,rows:budget.rows.map(r=>({holder:r.holder,item:r.item,stock:r.stock,food:r.food,seed:r.seed,committed:r.committed,inUse:r.inUse,...resourceAccount(r),reportedAvailable:r.available}))});
 }
 return {minute:s.minute,households,facilities,shops:[...shops.values()],rents,settlements,populations,shipments,
  reserves,transportOccupancy:occupation,obligations,personalities:Object.entries(s.npcs??{}).filter(([,n])=>n.businessAttachmentPermille!==undefined||n.maintenancePreference!==undefined).map(([id,n])=>({id,businessAttachmentPermille:n.businessAttachmentPermille??null,maintenancePreference:n.maintenancePreference??null})),
  prices:records.filter(r=>r.category==='regional_quote').map(r=>({id:r.id,place:r.place??r.settlement,item:r.item,price:r.price,basePrice:r.basePrice,ratio:r.basePrice>0?r.price/r.basePrice:null})),
  // Original facts retained so later reconciliation does not need a rerun.
  financial:records.filter(r=>['market_trade','employment_pay','village_fiscal','finance_profit','title_income','office_salary','business_receipt','market_trip','epidemic','legal_deposit'].includes(r.category)||r.kind==='workshop'),
  ledgerErrors:document.ledger?auditLedger(document.ledger):['账本未开'],
  ecologyErrors:auditPopulations(document,{monsters:engine.world.monsters.filter(r=>r.wildlife)}),
  metrics:computeMetrics(document,{world:engine.world}).metrics};
}
function grouped(rows,value,dimensions){
 const out={};for(const dimension of dimensions){const groups={};for(const row of rows)(groups[String(row[dimension]??'unknown')]??=[]).push(value(row));out[dimension]=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,distribution(v)]));}return out;
}
export function summarizeRun(snapshots,{scenario,complete=false}={}){
 const first=snapshots[0],last=snapshots.at(-1);if(!first)return {complete:false,reason:'no snapshots'};
 const facilities=first.facilities.map(f=>{let streak=0,maxStreak=0,closed=0;for(const snapshot of snapshots.slice(1)){const r=snapshot.facilities.find(r=>r.id===f.id);streak=r?.factor<1?streak+1:0;maxStreak=Math.max(maxStreak,streak);if(r?.factor===0)closed++;}const end=last.facilities.find(r=>r.id===f.id);return {...f,initialCondition:f.condition,condition:end?.condition??null,delta:end?end.condition-f.condition:null,persistent:maxStreak>=3,closedObservations:closed};});
 const hunger=last.settlements.map(s=>{const initial=first.settlements.find(r=>r.id===s.id);return {...s,missing:initial?s.unmetMeals-initial.unmetMeals:null,initialPopulation:initial?.population??null};});
 const eligible=hunger.filter(r=>r.publicGranary),missing=sum(eligible.map(r=>r.missing??0)),population=sum(eligible.map(r=>r.initialPopulation??0));
 const switches=first.shops.map(shop=>{let previous=shop.suspended?'暂闭':shop.status,count=0;for(const snapshot of snapshots.slice(1)){const r=snapshot.shops.find(r=>r.id===shop.id),status=r?.suspended?'暂闭':r?.status;if(r&&status!==previous){count++;previous=status;}}return {id:shop.id,count,lastStatus:previous};});
 const wealthMedian=median(first.households.map(h=>h.cash));
 const hh=last.households.map(h=>({...h,wealthBand:(first.households.find(r=>r.id===h.id)?.cash??0)<=0?'opening-zero':(first.households.find(r=>r.id===h.id)?.cash??0)<=wealthMedian?'opening-below-median':'opening-above-median'}));
 return {complete,scenario,days:(last.minute-first.minute)/DAY,observations:snapshots.length,
  NUM_W7:{grade:'G',status:scenario!=='baseline'?'冲击组另报':!complete?'未完成':missing<=population?'年度已观测组通过':'失败',missing,population,limit:population,coverage:'有公共粮仓聚落；无公共粮仓者另列，不能作为全人口通过',excluded:hunger.filter(r=>!r.publicGranary).map(r=>r.id),bySettlement:hunger},
  facilities:{n:facilities.length,tail:tailBand(facilities.filter(r=>r.persistent).length,facilities.length),normalComparable:'尚未证明每个主体连续有支付能力及可达供给；总组不冒充A1条件分母',groups:grouped(facilities,r=>r.delta,['region','material','kind','initialCondition']),rows:facilities},
  households:{cash:grouped(hh,r=>r.cash,['region','stratum','occupation','wealthBand']),cashGini:gini(last.households.map(r=>r.cash)),incomeExpenseRatio:{status:'未覆盖',reason:'钱袋净变动不是毛收入；缺完整必要消费篮子及自产自用估值流水，不把应收或借款记为收入。'},rows:hh},
  rents:{groups:grouped(last.rents,r=>r.priceKnown?r.ratio:null,['region','assetClass']),rows:last.rents},
  prices:distribution(last.prices.map(r=>r.ratio)),shopSwitches:{distribution:distribution(switches.map(r=>r.count)),rows:switches,scope:'月末状态切换下界；月内往返另查事件'},
  disease:{prevalence:distribution(last.populations.map(r=>r.prevalence)),peakInfected:Math.max(...snapshots.map(x=>sum(x.populations.map(p=>p.I)))),conservationFailures:snapshots.flatMap(x=>x.populations.filter(r=>!r.conserved))},
  transport:{n:last.shipments.length,statuses:last.shipments.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{}),occupancy:distribution(snapshots.flatMap(s=>(s.transportOccupancy??[]).map(r=>r.ratio))),overbooked:snapshots.flatMap(s=>(s.transportOccupancy??[]).filter(r=>r.overbooked))},
  ledgerErrors:snapshots.flatMap(x=>x.ledgerErrors.map(error=>({minute:x.minute,error}))),ecologyErrors:snapshots.flatMap(x=>x.ecologyErrors.map(error=>({minute:x.minute,...error}))),
  dependencies:{'NUM-LAW-D1':'S6完整选择协议未完成；不据此跳过S5缺陷','NUM-Z/NUM-P4':'S7两条参照线未完成','NUM-W8/W10':'一年不替代30年财富趋势/非灾年10年收支均值'},metrics:last.metrics};
}
export function scenarioWorld(world,scenario){
 const w=structuredClone(world);if(scenario==='poor-harvest'){
  const effects=w.rules.weather?.states;if(!effects)throw Error('missing weather states');
  for(const row of Object.values(effects))if(typeof row.crop==='number')row.crop*=fixture.shock.multiplier;
 }else if(scenario!=='baseline')throw Error(`unknown scenario ${scenario}`);
 return w;
}
async function json(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temp=`${file}.tmp`;await fs.writeFile(temp,JSON.stringify(value)+'\n');await fs.rename(temp,file);}
export async function runLawSoak({years=1,seeds=10,out,limitMinutes=250,only=null,shard=0,shards=1}={}){
 if(!out||years!==1||seeds!==10)throw Error('K13 fixes one calendar year and all ten seeds; use --only to resume a specified pair without changing the manifest');
 const started=Date.now(),world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
 const yearDays=world.rules.calendar.daysPerMonth*world.rules.calendar.monthsPerYear,manifest={format:'s5-law-soak@2',fixture,yearDays,worldHash:digest(world)};
 await fs.mkdir(out,{recursive:true});const manifestFile=path.join(out,'manifest.json');
 try{const old=JSON.parse(await fs.readFile(manifestFile,'utf8'));if(digest(old)!==digest(manifest))throw Error('manifest differs; do not mix runs');}catch(error){if(error.code!=='ENOENT')throw error;await json(manifestFile,manifest);}
 await json(path.join(out,`process-${shard}.json`),{pid:process.pid,started:new Date().toISOString(),command:process.argv});
 const results=[];
 for(const seed of fixture.seeds)for(const scenario of fixture.scenarios){
  if(fixture.seeds.indexOf(seed)%shards!==shard)continue;
  const key=`${seed}-${scenario}`,dir=path.join(out,key),checkpoint=path.join(dir,'checkpoint.json'),resultFile=path.join(dir,'result.json');
  try{const previous=JSON.parse(await fs.readFile(resultFile,'utf8'));if(previous.complete){results.push(previous);continue;}}catch(error){if(error.code!=='ENOENT')throw error;}
  if(only&&key!==only)continue;
  if(Date.now()-started>limitMinutes*60000)break;
  const engine=new WorldEngine(scenarioWorld(world,scenario));let document,snapshots=[],elapsedDays=0,runStarted=Date.now();
  try{
   try{const saved=JSON.parse(await fs.readFile(checkpoint,'utf8'));({document,snapshots,elapsedDays}=saved);}catch(error){if(error.code!=='ENOENT')throw error;document=withLedger(engine,engine.createCharacter(legacy,{},seed)).document;snapshots=[lawObservations(engine,document)];await json(checkpoint,{document,snapshots,elapsedDays});}
   while(elapsedDays<yearDays){
    if(Date.now()-started>limitMinutes*60000)break;
    const days=Math.min(world.rules.calendar.daysPerMonth,yearDays-elapsedDays);
    const input={tool:'world_time',args:{minutes:days*DAY},eventId:`K13:${seed}:day-${elapsedDays+days}`};
    const next=await engine.reduce(document,input);document=applyPatches(document,next.patches);elapsedDays+=days;
    snapshots.push(lawObservations(engine,document));await json(checkpoint,{document,snapshots,elapsedDays});
   }
   const report={seed,...summarizeRun(snapshots,{scenario,complete:elapsedDays===yearDays}),elapsedMs:Date.now()-runStarted};
   await json(resultFile,report);results.push(report);
  }catch(error){const report={seed,scenario,complete:false,elapsedDays,error:error.stack,elapsedMs:Date.now()-runStarted};await json(resultFile,report);results.push(report);}
 }
 const summary={pid:process.pid,elapsedMs:Date.now()-started,expected:20,complete:results.filter(r=>r.complete).length,runs:results.map(r=>({seed:r.seed,scenario:r.scenario,complete:r.complete,days:r.days??r.elapsedDays,error:r.error??null,NUM_W7:r.NUM_W7,facilities:r.facilities?.tail,price:r.prices,ledgerErrors:r.ledgerErrors?.length,ecologyErrors:r.ecologyErrors?.length}))};
 await json(path.join(out,`summary-${shard}.json`),summary);console.log(JSON.stringify({complete:summary.complete,expected:20,elapsedMs:summary.elapsedMs,out}));return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=name=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
 await runLawSoak({years:Number(arg('--years')??1),seeds:Number(arg('--seeds')??10),out:arg('--out'),limitMinutes:Number(arg('--limit-minutes')??250),only:arg('--only'),shard:Number(arg('--shard')??0),shards:Number(arg('--shards')??1)});
}
