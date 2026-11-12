// 只读诊断：目标持有规律（farmTargetFood）与非食物货消耗项之后，几个冒烟失败夹具里各聚落、各食物池/货类的 supply / demand / target / 报价。只向 stdout 打印 JSON；不写文件、不调模型、不起服务。
// 用法：node tools/mktw-diag-market.mjs [A0|A1|B|C|D|E|F ...]（缺省全跑）；场景之间互不依赖，一个抛错只在该场景里报 error。
// 场景：
//   A0 = 旧存档形状（initialFromLegacy，存粮 420、种粮 0）的 loc_hw，minute→600；对照用，不再是夹具；
//   A1 = 现行开局（createCharacter，存粮 = 开局日目标持有）的 loc_hw，minute→600；shop-restock / ke-upkeep-demand 改后的夹具形状；
//   B  = s2c-fire 的 fireScene（loc_hw 粮存写死 8000）；
//   C  = s2c-fire E06-6「world_time 调用链」夹具：一次推 240 分钟，与每 20 分钟一推，各时点打印铁匠位置/活动、铁匠铺建筑行、炉膛 thermal、起火记录、木炭与木料价（查 fireSince 为什么没有）；
//   D  = s5-w4-economy 的 finance 夹具（F048 木料、F007 面包典当；legacy 形状）：loc_hw 的面包/木料/燕麦读数；
//   E  = s5-playthrough 开局：createCharacter 后逐日推到第 5 日 11 点，打印小麦（GRAIN）在 loc_hw 的读数与商人存货（进程内推，不起 HTTP 服务；与 characterUiSession 同为 createCharacter + world_time，种子 's5-playthrough'）；
//   F  = ledger-price 的 campaignMoney 第一笔 world_trade：读账户与读旧字段各归约一遍，打印新旧读数不等的价格输入点与第一处补丁差异。
// 每个 (地点, 物品) 打印：
//   settlement：state.settlements[place] 的 food、population；farm：农事记录的仓容、种粮；
//   target.farmTargetFood（被测原语，仅作对照）与 target.hand（按规则数据手推：餐口 × (距收获天数 + reserveDays)，上限 容量 − 种粮）、openingStockFood（日 0）；
//   market：marketSupply 的 supply、demand、scarcity=min(3,max(0.5,demand/max(1,supply)))、shelf、consumption，以及 rows（owner、item、stock、target、committed、available、unit）；
//   price：regionalTradePrice（目录基价 × 环境/运输因子 × 稀缺度）；base：regionalTradeBase；
//   parts（非食物货）：拆 demand = 货架 + 户用消耗 + 制造耗料 + 各行目标——itemWeight、origin、itemResupplyDays（补给间隔天数）、单人户日耗 householdDailyUse（件/日）、
//     householdUsage（每户日耗克数，燃料按户、盐按人）、population、demandMinusConsumption（= 货架 + 各行目标与承诺）、craftUse（滚动日桶）。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {marketSupply,marketQuote,saleableStock,reserveShortfall} from '../server-plugin/market.mjs';
import {tradeQuote} from '../server-plugin/shop.mjs';
import {netAssets} from '../server-plugin/finance-assets.mjs';
import {handOatsScarcity} from '../tests/helpers/hand-targets.mjs';
import {variant as dbVariant,scene as dbScene,setPrice,monthDayMinute,SEED as DB_SEED} from '../tests/helpers/daily-b2.mjs';
import {farmTargetFood,openingStockFood} from '../server-plugin/farm-target.mjs';
import {itemResupplyDays} from '../server-plugin/supply-interval.mjs';
import {householdDailyUse,householdUsage,usageItemGrams,upkeepSelfSupplyOf,upkeepSelfTripsOf,householdBufferTarget,householdResources} from '../server-plugin/household-budget.mjs';
import {isItemClass} from '../server-plugin/item-class.mjs';
import {placeSettlement,personHousehold} from '../server-plugin/entity-view.mjs';
import {regionalTradePrice,regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {probePriceReads,setPriceReadMode} from '../server-plugin/stock.mjs';
import {initialThermalState} from '../server-plugin/magic-object.mjs';
import {applyIntentSetup} from './a3-score.mjs';
import {fireScene} from '../tests/probes/run-001/e06.mjs';
import {fixture as financeFixture} from '../tests/helpers/finance.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const read=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const limits=world.rules.economy.priceFactorLimits.region;
const only=process.argv.slice(2),want=name=>!only.length||only.includes(name);
const attempt=fn=>{try{return fn();}catch(error){return {error:error.message};}};
function report(engine,doc,label,pairs){
 const state=doc.state,out={label,minute:state.minute,items:[]};
 const crop=engine.rules.agriculture.crop,harvest=crop.sowDays[1]+crop.growthDays,doy=Math.floor(state.minute/1440)%360;
 for(const [place,item] of pairs){
  const s=state.settlements?.[place],profile=engine.rules.agriculture.settlements.find(p=>p.settlement===place),rec=state.records?.[`agriculture:${place}`];
  const row={place,item,settlement:s?{food:s.food,population:s.population,foodPerDay:s.foodPerDay,granary:s.granary}:null};
  if(profile){
   const days=((harvest-doy)%360+360)%360+profile.reserveDays;
   row.farm={capacity:rec?.granary?.capacity,seedBank:rec?.field?.seedBank,profileCapacity:profile.granaryCapacity,initialSeed:profile.initialSeed,reserveDays:profile.reserveDays};
   row.target={farmTargetFood:farmTargetFood(engine,state,profile,state.minute),targetDays:days,hand:Math.min(Math.ceil((s?.population??0)*days),Math.max(0,(rec?.granary?.capacity??profile.granaryCapacity)-(rec?.field?.seedBank??profile.initialSeed))),openingStockFood:openingStockFood(engine,profile,0)};
  }
  try{
   const m=marketSupply(read(doc),engine,item,place);
   row.market={supply:m.supply,demand:m.demand,scarcity:Math.min(limits[1],Math.max(limits[0],m.demand/Math.max(1,m.supply))),shelf:m.shelf,consumption:m.consumption,rows:m.rows.map(r=>({owner:r.owner,item:r.item,stock:r.stock,target:r.target,committed:r.committed,available:r.available,unit:r.unit}))};
   if(m.consumption>0){
    const it=engine.byId.get(item);
    row.parts=attempt(()=>({itemWeight:it?.weight,origin:it?.origin,itemResupplyDays:itemResupplyDays(engine,state,doc.randomSeed,item,place),
     singleHouseholdDailyUse:householdDailyUse(engine,state,[null],item),householdUsage:householdUsage(engine,state,[null]).map(u=>({cls:u.cls,gramsPerDay:u.gramsPerDay})),population:s?.population,
     demandMinusConsumption:m.demand-m.consumption,craftUse:state.records?.[`craft-use:${place}`]?.days??null,
     // 用度类池：池成员与各自基准克、名册户（成员数、日用度、户内自给、已欠量）——看"经市场的部分"从哪来、柴按户而名册人均是否偏大。
     pool:attempt(()=>{
      const cls=householdUsage(engine,state,[null]).map(u=>u.cls).find(c=>isItemClass(engine,item,c)),seen=new Set(),households=[];
      if(!cls)return null;
      for(const id of Object.keys(state.npcs??{})){
       if(placeSettlement(engine,state,state.npcs[id].location).value!==place)continue;
       const h=personHousehold(engine,state,id).value,key=h?.id??id;if(seen.has(key))continue;seen.add(key);
       const members=(h?.members??[id]).filter(x=>state.npcs?.[x]);
       households.push({key,members:members.length,need:householdUsage(engine,state,members).find(u=>u.cls===cls).gramsPerDay,self:attempt(()=>upkeepSelfSupplyOf(engine,state,id)[cls]??0),trips:attempt(()=>upkeepSelfTripsOf(engine,state,id).filter(t=>t.cls===cls)),debt:state.family?.upkeep?.[key]?.[`${cls}DebtG`]??0});
      }
      return {cls,per:householdUsage(engine,state,[null]).find(u=>u.cls===cls).per,settlementHouseholdCount:engine.world.settlementProfiles?.find(p=>p.id===place)?.householdCount,tradeCycleDays:engine.rules.economy.tradeCycleDays,members:engine.world.items.filter(i=>isItemClass(engine,i.id,cls)).map(i=>({id:i.id,grams:usageItemGrams(engine,i.id,cls),days:attempt(()=>itemResupplyDays(engine,state,doc.randomSeed,i.id,place))})),households};
     })}));
   }
  }catch(error){row.market={error:error.message};}
  row.price=attempt(()=>regionalTradePrice(read(doc),engine,item,place));row.base=attempt(()=>regionalTradeBase(read(doc),engine,item,place));
  out.items.push(row);
 }
 return out;
}
const HW_PAIRS=[['loc_hw','item_oats'],['loc_hw','item_bread'],['loc_hw','item_mutton'],['loc_hw','item_charcoal'],['loc_hw','item_wood'],['loc_hw','item_salt']];
const results=[];
if(want('A0')){
 const engine=new WorldEngine(structuredClone(world)),doc=engine.initialFromLegacy(seed,'diag-market'),openingMinute=doc.state.minute;
 doc.state.minute=600;doc.state.location='bld_hw_qingdeng';
 const r=report(engine,doc,'A0 旧存档形状（initialFromLegacy，minute→600；对照）',[...HW_PAIRS,['loc_bs_yupo','item_oats'],['loc_bs','item_bread']]);
 r.legacyOpeningMinute=openingMinute;results.push(r);
}
if(want('A1')){
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'diag-market');
 doc.state.minute=600;doc.state.location='bld_hw_qingdeng';
 results.push(report(engine,doc,'A1 现行开局（createCharacter，minute→600）',HW_PAIRS));
}
if(want('B')){
 const S=fireScene();
 results.push(report(S.engine,S.d.document,'B s2c-fire（fireScene，loc_hw 粮存=8000）',[['loc_hw','item_oats'],['loc_hw','item_bread'],['loc_hw','item_charcoal'],['loc_hw','item_wood']]));
}
if(want('C')){
 const who='npc_hw_duanyan';
 const make=()=>{
  const s=fireScene(),f=s.engine.world.locations.find(b=>b.id===s.forge).features.find(x=>x.id==='feature_hw_forge_hearth');
  const thermal=initialThermalState({fuelMg:4000},f.thermalModel,600);thermal.burning=true;
  s.d.set(['state','records',`physical_feature:${f.id}`],{id:f.id,category:'physical_feature',location:s.forge,state:{thermal}});
  for(const [id,n] of Object.entries(s.d.get('state','npcs')))if(id!==who&&n.location===s.forge)s.d.set(['state','npcs',id,'location'],'loc_hw');
  s.engine.byId.get(who).schedule={default:[{start:0,end:620,location:s.forge,activity:'打铁',services:['craft']},{start:620,end:1440,location:'loc_hw',activity:'休息',services:[]}]};
  s.d.set(['state','npcs',who,'location'],s.forge);s.d.set(['state','location'],'loc_hw');s.featureId=f.id;return s;
 };
 const run=async(s,minutes,id)=>{const out=await s.engine.reduce(s.d.document,{tool:'world_time',args:{minutes},eventId:id});for(const p of out.patches){if(p.op==='delete')s.d.remove(p.path);else s.d.set(p.path,p.value);}};
 const snap=s=>{const st=s.d.get('state'),n=st.npcs[who],b=st.buildings?.[s.forge];
  // 铁匠为什么没有在 620 离开：他名下的自主任务、行程记录、日程占用（scheduleTravel/cognitionTravel）、约定。
  const tasks=Object.values(st.npcAutonomy?.tasks??{}).filter(t=>t.npc===who).map(t=>({id:t.id,action:t.action?{kind:t.action.kind,labor:t.action.labor,item:t.action.item,quantity:t.action.quantity,source:t.action.source}:null,status:t.status,from:t.start??t.startAt,to:t.end??t.endAt}));
  const trips=Object.values(st.records??{}).filter(r=>r.category==='market_trip'&&(r.actor===who||r.keeper===who)).map(r=>({id:r.id,departAt:r.departAt,returnAt:r.returnAt,from:r.from,to:r.to}));
  return {minute:st.minute,smith:{location:n.location,activity:n.activity,scheduleTravel:n.scheduleTravel,cognitionTravel:n.cognitionTravel,status:n.status,tasks,trips},forge:b?{burning:b.burning,fireSince:b.fireSince,fireTick:b.fireTick,condition:b.condition}:null,
   hearthBurning:st.records?.[`physical_feature:${s.featureId}`]?.state?.thermal?.burning,
   unattended:Object.keys(st.records??{}).filter(k=>k.startsWith('unattended_furnace')),food:st.settlements.loc_hw.food,
   charcoalPrice:attempt(()=>regionalTradePrice(read(s.d.document),s.engine,'item_charcoal','loc_hw')),woodPrice:attempt(()=>regionalTradePrice(read(s.d.document),s.engine,'item_wood','loc_hw'))};};
 const out={label:'C s2c-fire E06-6 world_time 调用链：整推 240 与每 20 分钟一推',whole:null,sliced:[]};
 try{
  const a=make();out.start=snap(a);await run(a,240,'whole');out.whole=snap(a);
  const b=make();for(let k=0;k<12;k++){await run(b,20,`slice-${k}`);out.sliced.push(snap(b));}
 }catch(error){out.error=error.message;}
 results.push(out);
}
if(want('D')){
 const f=financeFixture();
 results.push(report(f.e,f.doc,'D s5-w4-economy finance 夹具（legacy 形状，minute 600）',[['loc_hw','item_bread'],['loc_hw','item_wood'],['loc_hw','item_oats'],['loc_hw','item_mutton']]));
}
if(want('E')){
 const out={label:'E s5-playthrough 开局逐日推到第 5 日 11 点（createCharacter + world_time；进程内）'};
 try{
  const engine=new WorldEngine(structuredClone(world));let doc=engine.createCharacter(seed,{},'s5-playthrough');
  const GRAIN='item_wheat_grain',TRADER='npc_hw_yanzhe',start=doc.state.minute,target=Math.floor(start/1440)*1440+4*1440+11*60;
  out.start={minute:start,target};
  for(let day=0;doc.state.minute<target&&day<8;day++){
   const minutes=Math.min(1440,target-doc.state.minute),r=await engine.reduce(doc,{tool:'world_time',args:{minutes},eventId:`diag-day-${day}`});doc=applyPatches(doc,r.patches);
  }
  out.readings=report(engine,doc,'GRAIN 与食物池读数',[['loc_hw',GRAIN],['loc_hw','item_oats'],['loc_hw','item_bread']]);
  const t=doc.state.npcs[TRADER];out.trader={location:t?.location,coins:t?.coins,grain:t?.inventory?.[GRAIN]};
 }catch(error){out.error=error.message;}
 results.push(out);
}
if(want('F')){
 const out={label:'F ledger-price campaignMoney 第一笔 world_trade：读账户 vs 读旧字段'};
 try{
  const inn='bld_hw_qingdeng',post='bld_hw_post',host='npc_hw_linsui',worker='npc_hw_ayan',clerk='npc_hw_shendu',placeOf={[host]:inn,[worker]:inn,[clerk]:post};
  const w=structuredClone(world);
  for(const npc of w.npcs.filter(n=>placeOf[n.id]))npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:npc.id===host?['trade']:[]}]};
  const engine=new WorldEngine(w),doc0=engine.createCharacter(seed,{},'ledger-price-money');
  doc0.state.minute=600;doc0.state.location=inn;doc0.state.player.coins=600;
  for(const [id,location] of [[host,inn],[worker,inn],[clerk,post]])Object.assign(doc0.state.npcs[id],{location,activity:'营业',status:'正常'});
  doc0.state.npcs[host].inventory.item_ration=40;
  const prepared=applyIntentSetup(engine,doc0,{facts:[{path:['state','npcs',host,'inventory','item_bread'],value:8}]}),doc=prepared.document;
  const mismatches=[];probePriceReads(r=>{if(r.open&&r.legacy!==r.ledger&&mismatches.length<40)mismatches.push({point:r.point,legacy:r.legacy,ledger:r.ledger});});
  const args={tool:'world_trade',args:{seller:host,item:'item_bread',quantity:3},eventId:'buy'};
  const ledgerOut=await engine.reduce(doc,args);
  setPriceReadMode('legacy');let legacyOut;try{legacyOut=await engine.reduce(doc,args);}finally{setPriceReadMode('ledger');}
  probePriceReads(null);
  out.setupUnmet=prepared.setupUnmet;out.mismatchedReads=mismatches;out.patchCounts={ledger:ledgerOut.patches.length,legacy:legacyOut.patches.length};
  const cut=x=>{const s=JSON.stringify(x);return s&&s.length>400?`${s.slice(0,400)}…`:s;};
  out.patchDiffs=[];
  for(let i=0;i<Math.max(ledgerOut.patches.length,legacyOut.patches.length)&&out.patchDiffs.length<6;i++){
   const a=ledgerOut.patches[i],b=legacyOut.patches[i];
   if(JSON.stringify(a)!==JSON.stringify(b))out.patchDiffs.push({index:i,path:(a??b)?.path,ledger:cut(a?.value),legacy:cut(b?.value)});
  }
  out.resultEqual=JSON.stringify(ledgerOut.result)===JSON.stringify(legacyOut.result);
  // 同模式重跑：判断差异来自读法（账户 vs 旧字段）还是来自引擎内跨次运行的缓存/顺序（同一模式跑两次就不同 = 缓存泄漏）。
  const ledgerAgain=await engine.reduce(doc,args);
  setPriceReadMode('legacy');let legacyAgain;try{legacyAgain=await engine.reduce(doc,args);}finally{setPriceReadMode('ledger');}
  const same=(a,b)=>JSON.stringify(a.patches)===JSON.stringify(b.patches);
  out.stability={ledgerTwiceSame:same(ledgerOut,ledgerAgain),legacyTwiceSame:same(legacyOut,legacyAgain),ledgerVsLegacyAgainSame:same(ledgerOut,legacyAgain),legacyFirstVsAgainSame:same(legacyOut,legacyAgain)};
  const taskIds=o=>o.patches.filter(p=>p.path?.[1]==='records'&&String(p.path[2]).startsWith('market_trip:labor:')).map(p=>p.path[2]);
  out.laborTrips={ledger:taskIds(ledgerOut),ledgerAgain:taskIds(ledgerAgain),legacy:taskIds(legacyOut),legacyAgain:taskIds(legacyAgain)};
  const woodPrice=mode=>{setPriceReadMode(mode);try{return attempt(()=>regionalTradePrice(read(doc),engine,'item_wood','loc_hw'));}finally{setPriceReadMode('ledger');}};
  out.woodPrice={ledger:woodPrice('ledger'),legacy:woodPrice('legacy')};
 }catch(error){out.error=error.stack?.split('\n').slice(0,4).join(' | ')??error.message;}
 results.push(out);
}
// G/H 读数（只读）：s5-02 与 daily-b2 D05 失败测试的前提状态——每个 (地点,物品) 打印 marketSupply 供需明细，并打印一件货的 marketQuote 解释（价格各因子）。
const quoteOf=(engine,doc,args)=>attempt(()=>{const q=marketQuote(read(doc),engine,args);return {listPrice:q.listPrice,totalCoins:q.totalCoins,supply:q.supply,retail:q.retail,business:q.business,explanation:JSON.parse(JSON.stringify(q.explanation,(k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v))};});
if(want('G')){
 const out={label:'G s5-02 夹具（createCharacter + minute 600，青灯坊/铁匠铺）：面包与钢制长剑（#3/#4 的前提：段延 40 把、承诺 20）'};
 try{
  const engine=new WorldEngine(structuredClone(world)),doc0=engine.createCharacter(seed,{},'s502-market'),inn='bld_hw_qingdeng',forge='bld_hw_forge',smith='npc_hw_duanyan',sword='item_steel_arming_sword';
  const prepared=applyIntentSetup(engine,doc0,{minute:600,location:forge,coins:10000,facts:[
   {path:['state','npcs',smith,'inventory',sword],value:40},
   {path:['state','records'],value:{...doc0.state.records,'bulk-procurement':{id:'bulk-procurement',category:'contract',kind:'procurement',parties:['player',smith],subject:sword,quantity:20,fulfilled:0,status:'待履约'}}}]});
  const doc=prepared.document;out.setupUnmet=prepared.setupUnmet;
  out.sword=report(engine,doc,'钢制长剑 @铁匠铺',[['loc_hw',sword]]);
  out.swordQuote=quoteOf(engine,doc,{seller:smith,item:sword,buyer:'npc_hw_ayan',quantity:6,location:forge});
  out.bread=report(engine,doc,'面包 @河湾村',[['loc_hw','item_bread']]);
  out.breadQuote=quoteOf(engine,doc,{seller:'npc_hw_linsui',item:'item_bread',buyer:'player',quantity:1,location:inn});
  out.limits={region:world.rules.economy.priceFactorLimits.region,transport:world.rules.economy.priceFactorLimits.transport};
 }catch(error){out.error=error.stack?.split('\n').slice(0,4).join(' | ')??error.message;}
 results.push(out);
}
if(want('H')){
 const out={label:'H daily-b2 D05：冬季十二月初三午时，燕麦薄饼 8 文、羊肉 15 文（variant + scene），酒馆林穗'};
 try{
  const w=dbVariant(x=>{setPrice(x,'item_oat_flatbread',8);setPrice(x,'item_mutton',15);});
  const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},DB_SEED);
  dbScene('bld_hw_qingdeng',monthDayMinute(12,3,12,0),s=>{s.player.coins=60;})(doc.state,doc);
  out.readings=report(engine,doc,'燕麦薄饼与羊肉 @河湾村',[['loc_hw','item_oat_flatbread'],['loc_hw','item_mutton'],['loc_hw','item_oats']]);
  out.flatbreadQuote=quoteOf(engine,doc,{seller:'npc_hw_linsui',item:'item_oat_flatbread',buyer:'player',quantity:1,location:'bld_hw_qingdeng'});
  out.muttonQuote=quoteOf(engine,doc,{seller:'npc_hw_linsui',item:'item_mutton',buyer:'player',quantity:1,location:'bld_hw_qingdeng'});
  out.limits=world.rules.economy.priceFactorLimits.region;
  // 公仓粮账户与批次（到期日）：判断 D05 的公仓粮是不是因 scene 跳日而到期，导致供给只剩商人持有。
  const day=Math.floor(doc.state.minute/1440),farm=doc.state.records?.['agriculture:loc_hw'];
  out.granary={day,settlementFood:doc.state.settlements?.loc_hw?.food,
   farmBatches:(farm?.batches??[]).map(b=>({kind:b.kind,amount:b.amount,expiresDay:b.expiresDay})).slice(0,40),
   ledgerOpen:Boolean(doc.ledger),
   ledgerGranaryAccounts:Object.entries(doc.ledger?.accounts??{}).filter(([k])=>k.includes('granary')),
   ledgerGranaryLots:Object.entries(doc.ledger?.lots??{}).filter(([k])=>k.includes('granary')).map(([k,v])=>[k,JSON.stringify(v).slice(0,600)])};
 }catch(error){out.error=error.stack?.split('\n').slice(0,4).join(' | ')??error.message;}
 results.push(out);
}
// J：s5-02 失败测试的前提读数（标签均为 ASCII）：#5 同日两次报价、#10 买一件后与次日的报价解释（含 depth 全部分量）、#6 可售存量、#2 净资产与手推比值。
if(want('J')){
 const out={label:'J s5-02 probes'};
 try{
  const engine=new WorldEngine(structuredClone(world)),inn='bld_hw_qingdeng',host='npc_hw_linsui',bread='item_bread';
  const mk=(setup={})=>applyIntentSetup(engine,engine.createCharacter(seed,{},'s502-market'),{minute:600,location:inn,coins:10000,...setup}).document;
  const quote=doc=>tradeQuote(read(doc),engine,{buyer:'player',seller:host,item:bread,quantity:1,location:inn,base:()=>engine.byId.get(bread).basePrice});
  const brief=q=>({listPrice:q.listPrice,totalCoins:q.totalCoins,exactTotal:q.exactTotal,explanation:JSON.parse(JSON.stringify(q.explanation))});
  const buy=async(doc,id)=>applyPatches(doc,(await engine.reduce(doc,{tool:'world_trade',args:{seller:host,item:bread,quantity:1},eventId:id})).patches);
  const food=doc=>{const m=marketSupply(read(doc),engine,bread,inn);return {supply:m.supply,demand:m.demand,rows:m.rows.map(r=>({owner:r.owner,item:r.item,stock:r.stock,target:r.target,committed:r.committed,available:r.available,unit:r.unit}))};};
  // #5
  let doc=mk();out.five={first:brief(quote(doc)),foodBefore:food(doc)};
  doc=await buy(doc,'probe-1');out.five.second=brief(quote(doc));out.five.foodAfter=food(doc);
  // #10：noCustomers（除店主外居民钱袋清零）
  const poor=Object.keys(engine.createCharacter(seed,{},'s502-market').state.npcs).filter(id=>id!==host).map(id=>({path:['state','npcs',id,'coins'],value:0}));
  doc=mk({facts:poor});doc=await buy(doc,'probe-rt');out.ten={afterBuy:brief(quote(doc)),foodAfterBuy:food(doc)};
  doc=applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes:1440},eventId:'probe-next-day'})).patches);
  out.ten.nextDay=brief(quote(doc));out.ten.foodNextDay=food(doc);
  // #6
  doc=mk({facts:[{path:['state','npcs',host,'inventory'],value:{[bread]:{quantity:12,quality:engine.byId.get(bread).quality}}},{path:['state','npcs','npc_hw_ayan','inventory'],value:{}},
   {path:['state','records'],value:{...mk().state.records,contract_market_reserve:{id:'contract_market_reserve',category:'contract',kind:'procurement',parties:['player',host],subject:bread,quantity:4,fulfilled:1,status:'pending'}}}]});
  out.six={business:attempt(()=>saleableStock(read(doc),engine,host,bread,{business:true})),personal:attempt(()=>saleableStock(read(doc),engine,host,bread)),food:food(doc)};
  // 储备档位（按种子抽取）与各项：retained 8 来自哪一档、哪些天数、现金覆盖多少。
  out.six.buffer=attempt(()=>householdBufferTarget(read(doc),engine,host,{incomeDays:1}));
  out.six.bufferDays=attempt(()=>[0,1,2,3].map(incomeDays=>({incomeDays,target:householdBufferTarget(read(doc),engine,host,{incomeDays})})));
  out.six.resources=attempt(()=>{const r=householdResources(read(doc),engine,host);return {rows:r.rows?.filter(x=>x.item===bread).map(x=>({holder:x.holder,item:x.item,stock:x.stock,retained:x.retained,committed:x.committed,available:x.available,food:x.food,seed:x.seed})),keys:Object.keys(r)};});
  out.six.shortfall=attempt(()=>reserveShortfall(read(doc),engine,host));
  out.six.marketRules={personalReserveDays:engine.world.marketRules.personalReserveDays,householdBuffer:engine.world.marketRules.householdBuffer};
  // #2
  doc=mk({facts:[{path:['state','npcs',host,'inventory'],value:{[bread]:{quantity:10,quality:engine.byId.get(bread).quality}}},{path:['state','npcs',host,'coins'],value:200}]});
  const w2={...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'asset-value',pack:'market',target:'economy:value',stage:'add',value:1}]}};
  out.two={netAssets:attempt(()=>netAssets(read(doc),engine,host)),netAssetsWithModifier:attempt(()=>netAssets(read(doc),new WorldEngine(w2),host)),handRatio:attempt(()=>handOatsScarcity(engine,doc.state,doc.state.settlements.loc_hw.food)),food:food(doc)};
 }catch(error){out.error=error.stack?.split('\n').slice(0,4).join(' | ')??error.message;}
 results.push(out);
}
// I：ke-upkeep-demand 夹具（initialFromLegacy，村里柴清空，铁匠铺架上 40 炭）：开局 / 缺柴三日后 / 补柴两日后三个时点的炭报价与供需明细，看"缺柴时柴价上升"的前提是否成立。
if(want('I')){
 const out={label:'I ke-upkeep-demand：缺柴三日前后的炭价与供需',points:[]};
 try{
  const smith='npc_hw_duanyan',forge='bld_hw_forge',item='item_charcoal',DAY=1440;
  const w=structuredClone(world);{const n=w.npcs.find(x=>x.id===smith);delete n.tier;n.schedule={default:[{start:0,end:1440,location:forge,activity:'营业',services:['trade']}]};}
  const engine=new WorldEngine(w);
  const wait=async(doc,minutes,eventId)=>applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes},eventId})).patches);
  const villagers=doc=>Object.keys(doc.state.npcs).filter(id=>placeSettlement(engine,doc.state,doc.state.npcs[id].location).value==='loc_hw');
  const point=(label,doc)=>{
   const d=read(doc),m=attempt(()=>marketSupply(d,engine,item,forge));
   out.points.push({label,minute:doc.state.minute,supply:m.supply,demand:m.demand,consumption:m.consumption,scarcity:Math.min(limits[1],Math.max(limits[0],m.demand/Math.max(1,m.supply))),rows:m.rows?.map(r=>({owner:r.owner,item:r.item,stock:r.stock,committed:r.committed,available:r.available,unit:r.unit})),
    base:attempt(()=>regionalTradeBase(d,engine,item,forge)),limits,
    upkeep:Object.entries(doc.state.family?.upkeep??{}).map(([k,r])=>({key:k,fuelShortDays:r.fuelShortDays,fuelDebtG:r.fuelDebtG})).filter(r=>r.fuelShortDays||r.fuelDebtG),
    households:attempt(()=>{const seen=new Set(),rows=[];for(const id of villagers(doc)){const h=personHousehold(engine,doc.state,id).value,key=h?.id??id;if(seen.has(key))continue;seen.add(key);rows.push({key,self:attempt(()=>upkeepSelfSupplyOf(engine,doc.state,id).fuel??0)});}return rows;})});
  };
  let doc=engine.initialFromLegacy(seed,'ke-upkeep');doc.state.minute=600;
  for(const id of villagers(doc))for(const it of Object.keys(doc.state.npcs[id].inventory??{}))if(isItemClass(engine,it,'fuel')&&!(id===smith&&it===item))delete doc.state.npcs[id].inventory[it];
  doc.state.npcs[smith].inventory[item]={quantity:40,quality:'木',durability:100,weight:engine.byId.get(item).weight};
  doc=await wait(doc,1,'open');point('开局（开张一分钟后）',doc);
  doc=await wait(doc,3*DAY,'cold');point('缺柴三日后',doc);
 }catch(error){out.error=error.stack?.split('\n').slice(0,4).join(' | ')??error.message;}
 results.push(out);
}
// K：w2-s2 的引火包（item_s2_tinder）价：导师所在的白石镇学堂，引火包并入燃料池后的供需明细（ASCII 标签）。
if(want('K')){
 const out={label:'K tinder at bs school'};
 try{
  const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'w2-s2-probe');doc.state.minute=600;
  for(const [place,item] of [['bld_bs_school','item_s2_tinder'],['bld_bs_school','item_wood'],['bld_bs_school','item_charcoal']]){
   const m=attempt(()=>marketSupply(read(doc),engine,item,place));
   out[item]={supply:m.supply,demand:m.demand,consumption:m.consumption,shelf:m.shelf,rows:m.rows?.map(r=>({owner:r.owner,item:r.item,stock:r.stock,available:r.available,unit:r.unit})),price:attempt(()=>regionalTradePrice(read(doc),engine,item,place)),error:m.error};
  }
  out.bsSettlement=doc.state.settlements?.loc_bs?{population:doc.state.settlements.loc_bs.population,wood:doc.state.settlements.loc_bs.wood,food:doc.state.settlements.loc_bs.food}:null;
  out.householdCount=engine.world.settlementProfiles?.find(p=>p.id==='loc_bs')?.householdCount;
 }catch(error){out.error=error.stack?.split('\n').slice(0,4).join(' | ')??error.message;}
 results.push(out);
}
// L：daily-b2 D01 场景（春季三月初五，面包 4 文，酒馆）：跳日后与推进 1 分钟后的公仓粮账户、批次与面包供需；以及推进后 doc 是否带账本（几条测试报 ledger 未定义）。
if(want('L')){
 const out={label:'L daily-b2 D01 scene'};
 try{
  const w=dbVariant(x=>{setPrice(x,'item_bread',4);});
  const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},DB_SEED);
  dbScene('bld_hw_qingdeng',monthDayMinute(3,5,7,30),s=>{s.player.coins=100;})(doc.state,doc);
  const snap=(label,d)=>{const m=attempt(()=>marketSupply(read(d),engine,'item_bread','bld_hw_qingdeng')),farm=d.state.records?.['agriculture:loc_hw'];
   return {label,minute:d.state.minute,day:Math.floor(d.state.minute/1440),hasLedger:Boolean(d.ledger),settlementFood:d.state.settlements?.loc_hw?.food,
    batches:(farm?.batches??[]).map(b=>({amount:b.amount,expiresDay:b.expiresDay,kind:b.kind})),seedBank:farm?.field?.seedBank,
    ledgerGranary:Object.entries(d.ledger?.accounts??{}).filter(([k])=>k.includes('granary')),ledgerLots:Object.entries(d.ledger?.lots??{}).filter(([k])=>k.includes('granary')).map(([k,v])=>[k,JSON.stringify(v).slice(0,400)]),
    supply:m.supply,demand:m.demand,rows:m.rows?.slice(-3).map(r=>({owner:r.owner,item:r.item,stock:r.stock,target:r.target,available:r.available,unit:r.unit})),hand:attempt(()=>handOatsScarcity(engine,d.state,d.state.settlements.loc_hw.food))};};
  out.afterScene=snap('after scene',doc);
  const r=await engine.reduce(doc,{tool:'world_time',args:{minutes:1},eventId:'probe-1min'});doc=applyPatches(doc,r.patches);
  out.afterMinute=snap('after 1 minute',doc);
 }catch(error){out.error=error.stack?.split('\n').slice(0,4).join(' | ')??error.message;}
 results.push(out);
}
// M：daily-b2 D01 的真实读价路径：uiSession（服务端 create → export → 夹具改初始文档 → import → 事件），与测试完全相同的场景与店铺改动；
// 打印推进 1 分钟后的文档是否带账本、公仓粮账户与批次、面包供需，以及买 3 个面包的实付与报价解释。
if(want('M')){
 const out={label:'M daily-b2 D01 via uiSession'};const cleanups=[];
 try{
  const {uiSession}=await import('../tests/helpers/ui-script.mjs'),{primed,stack,openShop}=await import('../tests/helpers/daily-b2.mjs');
  const HOUR=60,INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui';
  const w=dbVariant(x=>{setPrice(x,'item_bread',4);openShop(x,LINSUI,INN,7*HOUR,19*HOUR);});
  const ui=await uiSession({after:fn=>cleanups.push(fn)},{world:w,mutate:dbScene(INN,monthDayMinute(3,5,7,30),s=>{s.player.coins=100;s.npcs[LINSUI].inventory.item_bread=stack(8);s.inventory={...s.inventory};delete s.inventory.item_bread;})});
  const before=await primed(ui),engine=new WorldEngine(w);
  const farm=before.state.records?.['agriculture:loc_hw'],m=attempt(()=>marketSupply(read(before),engine,'item_bread',INN));
  out.before={minute:before.state.minute,hasLedger:Boolean(before.ledger),settlementFood:before.state.settlements?.loc_hw?.food,batches:(farm?.batches??[]).map(b=>({amount:b.amount,expiresDay:b.expiresDay,kind:b.kind})),
   ledgerGranary:Object.entries(before.ledger?.accounts??{}).filter(([k])=>k.includes('granary')),ledgerLots:Object.entries(before.ledger?.lots??{}).filter(([k])=>k.includes('granary')).map(([k,v])=>[k,JSON.stringify(v).slice(0,400)]),
   supply:m.supply,demand:m.demand,rows:m.rows?.map(r=>({owner:r.owner,item:r.item,stock:r.stock,target:r.target,committed:r.committed,available:r.available,unit:r.unit})),hand:attempt(()=>handOatsScarcity(engine,before.state,before.state.settlements.loc_hw.food)),
   quote:quoteOf(engine,before,{seller:LINSUI,item:'item_bread',buyer:'player',quantity:3,location:INN})};
  const r=await ui.choose('trade.buy',{item:'item_bread',quantity:3},{target:LINSUI});
  out.buy={ok:r.ok,error:r.error,cost:r.result?.cost,pricing:r.result?.pricing?JSON.parse(JSON.stringify(r.result.pricing)):null};
 }catch(error){out.error=error.stack?.split('\n').slice(0,4).join(' | ')??error.message;}
 for(const fn of cleanups)try{await fn();}catch{}
 results.push(out);
}
console.log(JSON.stringify(results,null,1));
