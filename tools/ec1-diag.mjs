// EC-1 全量对照失败的取证探针（只读：不改引擎源码、不写存档、不写任何文件；输出 JSON Lines 到 stdout；云上用 run-script 运行，本机不要运行）。
// 用法：node tools/ec1-diag.mjs <情形名> [逗号分隔的关注编号]
// 情形名：
//  sales-a1-lt        簇 1：运行 tests/a1-lt-scenarios.test.mjs 原夹具，记录每笔零售成交（eventId 以 customer: 开头）与与铁匠有关的账本转移
//  sales-w2-s2        簇 1：运行 tests/w2-s2.test.mjs 原夹具，记录每笔零售成交与三位导师（npc_bs_077_1/078_1/079_1）有关的账本转移
//  sales-s5-w4        簇 1：运行 tests/s5-w4-economy.test.mjs 原夹具，记录每笔零售成交与林穗、陶枝、段岩有关的账本转移
//  finance-a3-domain  簇 2：运行 tests/a3-domain-properties.test.mjs 原夹具，financeChange 抛“当事人资金不足”前记被扣方、金额、该方与其户池现金
//  finance-daily-b2   簇 2：运行 tests/daily-b2-mechanisms.test.mjs 原夹具（含 #6 farm.private_harvest 与 #9），同上
//  migration          簇 3：重建 tests/npc-life-migration.test.mjs 的默认夹具（fixture()+hungry()，迁居者 npc_hw_xuling），输出窗口、交集与没有成交的原因
//  sales-s5-w4-wood   簇 4：运行 tests/s5-w4-economy.test.mjs 原夹具，对关注物品（默认 item_wood）每次可售量检查输出 stock-check（见 woodStock 注释：各持有行 stock/retained/committed/upkeep/available 与扣成 0 的项）
//  migration 另输出 migration-serve / migration-serve-shop：每个客流时刻对迁居者逐步重放 walkIns 与 serve（是否入顾客名单、wants、预算、钱、店里库存与可售量、逐数量报价、决策与拒绝原因；字段见 migrationServe 注释）
//  trade-windows-7 / trade-windows-8   ec1b-trade-windows #7/#8：原测试文件整份运行，客流每个结算时刻对 A/D/E 逐步重放（tw7-serve / tw8-serve 与 -shop 行：选客条件、tripped、wants、预算、可售、逐数量报价、决策与拒绝原因）+ 账本转移 + pool-topup
//  w2-s2-pre-buy      w2-s2：w2s2-mentor（导师蜂蜜/面包/木柴的物理库存、可售量各项、各持有行）、w2s2-buyer（买蜜的邻居：户、缺口、蜂蜜 wants）、sale（谁几点买几份）、pool-topup
//  assert-<文件>      s5-04 m1 law s5-f-tender s3-finance finance-assets m3-acceptance m3-language s5-w4 food-habit npc-life-migration npc-life-t164 quest-sources household-labor：
//                     assert-fail（fn、actual、expected、message、at、recentLedger、poolTopups、recentStock=持有/留存/承诺/报价摘要）与 assert-summary
// 复用方式：簇 1、2 直接 import 对应测试文件（node:test 在普通进程里 import 后照常运行测试，测试自己的夹具原样使用，不复制）；
// 簇 3 的夹具在测试文件内部没有导出，按 tests/npc-life-migration.test.mjs:21-59 与 :95-103 逐行重建（出处写在下面）。
// 输出行都带 type：start / sale / ledger / finance-fail / finance-summary / migration-windows / migration-reasons / migration-buys / error。
// 簇 1 sale 字段：seq、minute（结算时刻，取自 eventId）、day、minuteOfDay、shop（店或 trader_居民）、seller（卖方人物，店取店主）、sellerHousehold、
//   buyer、buyerIsResident、buyerHousehold、sameHousehold、item、from、to、amount、writer、eventId（同一笔成交会有钱与物两行）；ledger 行是关注人物的其他转移（含玩家购买，eventId 为界面事件号，没有分钟）。
//   对应的 customer_flow 记录在测试文档里，这里读不到；其键由 eventId 的店、日、分钟唯一确定（customer_flow:店:日:分钟）。
// 簇 2 finance-fail 字段：id（被扣方）、delta、before（扣前余额）、sourceEvent、minute、household（被扣方所在户编号）、householdMembers、memberCoins（成员钱袋）、pooledCoins、playerCoins、stack（调用栈前 8 行）。
// 簇 3 migration-windows：day、flowTimes、shopWindows、moverWindows（清醒且不在别的服务岗位的段）、moverOnDuty（作息里有非 trade 服务的段）、intersections（各店窗口与迁居者段的最早交集，同聚落才算）；
//   migration-reasons：对每个流时刻或无流时刻的情形给出 noWindow / noMoney / noNeed / slotNotShopping 及依据（coins、status、slot、procurementShortfall）；migration-buys：推进到首夜后账本上迁居者的食物购买。
import {register} from 'node:module';

register('./ec1-diag-hooks.mjs',import.meta.url);
const [caseName,watchArg]=process.argv.slice(2);
const out=o=>console.log(JSON.stringify(o));
const DAY=1440;
const world=await (await import('./load-world.mjs')).loadWorld();
const households=world.households??[];
const householdOf=id=>households.find(h=>h.members?.includes(id))?.id??null;
const stores=world.rules?.economy?.shops?.stores??[];
const sellerOf=shop=>String(shop).startsWith('trader_')?String(shop).slice(7):stores.find(s=>s.id===shop)?.keeper??null;
let seq=0;

function tracer(watch){
 return {push(entry){
  try{
   const {from='',to='',amount,writer,eventId}=entry;
   const id=typeof eventId==='string'?eventId:'';
   if(id.startsWith('customer:')){
    const [,shop,t,buyer,item]=id.split(':'),minute=Number(t),seller=sellerOf(shop);
    out({type:'sale',seq:++seq,minute,day:Math.floor(minute/DAY),minuteOfDay:minute%DAY,shop,seller,sellerHousehold:seller?householdOf(seller):null,buyer,buyerIsResident:buyer!=='player',buyerHousehold:householdOf(buyer),
     sameHousehold:Boolean(seller)&&householdOf(seller)!==null&&householdOf(seller)===householdOf(buyer),item,from,to,amount,writer,eventId:id});
   }else if(watch.some(w=>String(from).includes(w)||String(to).includes(w)))out({type:'ledger',seq:++seq,from,to,amount,writer,eventId:id});
  }catch(error){out({type:'error',where:'tracer',message:String(error?.message??error)});}
 }};
}

async function runTests(file,watch){
 globalThis.__LEDGER_TRACE__=tracer(watch);
 await import(new URL(`../tests/${file}`,import.meta.url));
}

async function financeHook(file){
 const {personHousehold}=await import('../server-plugin/entity-view.mjs');
 let count=0;
 globalThis.__DIAG_FINANCE__=info=>{
  try{
   const {id,delta,before,sourceEvent,d,e,stack}=info,state=d.get('state');
   const members=personHousehold(e,state,id).value?.members??[id];
   const memberCoins=Object.fromEntries(members.map(m=>[m,m==='player'?state.player?.coins:state.npcs?.[m]?.coins??null]));
   count++;
   out({type:'finance-fail',id,delta,before,sourceEvent,minute:state.minute,household:personHousehold(e,state,id).value?.id??null,householdMembers:members,memberCoins,
    pooledCoins:Object.values(memberCoins).reduce((n,v)=>n+(v??0),0),playerCoins:state.player?.coins,stack:String(stack).split('\n').slice(1,9).map(s=>s.trim())});
  }catch(error){out({type:'error',where:'finance-hook',message:String(error?.message??error)});}
 };
 process.on('exit',()=>out({type:'finance-summary',file,failures:count,note:count?'':'没有捕获到“当事人资金不足”：钩子未装上（finance-bank.mjs 该行已变）或本次未触发'}));
 await import(new URL(`../tests/${file}`,import.meta.url));
}

// 簇 3：重建 tests/npc-life-migration.test.mjs 的 fixture() 默认参数（:21-39）+ hungry（:59）+ 缺粮谋生用例的开头（:95-103）。
async function migration(){
 const fs=await import('node:fs/promises');
 const {WorldEngine}=await import('../server-plugin/engine.mjs');
 const {applyPatches}=await import('../server-plugin/storage.mjs');
 const biz=await import('../server-plugin/business.mjs');
 const {scheduleAt}=await import('../server-plugin/npc-schedule.mjs');
 const {householdBudget}=await import('../server-plugin/household-budget.mjs');
 const seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
 const start=10*DAY+600,firstNight=11*DAY;
 const mover='npc_hw_xuling',host='npc_yp_fengya',friend='npc_hw_taozhi',fromHome='bld_hw_riverhome',shop='bld_hw_herbs',away='bld_yp_kitchen';
 const tie=(a,b,type='旧友')=>({with:b,type,trust:60,affection:50});
 const w=structuredClone(world),find=id=>w.npcs.find(n=>n.id===id),life=w.rules.npcLife;
 delete w.rules.householdSubsistence;
 life.health={...life.health,bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0}]};
 const m=life.migration;
 life.migration={...m,stranger:undefined,livelihood:{...m.livelihood,chancePerDay:1},refuge:{...m.refuge,chancePerDay:1}};
 find(mover).schedule={default:[{start:0,end:480,location:fromHome,activity:'睡眠',services:[]},{start:480,end:1080,location:shop,activity:'在药铺帮手、教人认药',services:['teach']},{start:1080,end:1440,location:fromHome,activity:'歇息',services:[]}]};
 find(mover).relationships.push(tie(mover,host));find(host).relationships.push(tie(host,mover));
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{name:'试'},'npc-migration-test');
 doc.state.minute=start;doc.state.location='loc_bs_liquan';
 for(const row of Object.values(doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(start/DAY)-1;
 for(const row of Object.values(doc.state.settlements))row.starvation=-100;
 Object.assign(doc.state.npcs[mover],{location:shop,activity:'在药铺帮手、教人认药'});
 Object.assign(doc.state.npcs[friend],{location:shop});
 Object.assign(doc.state.npcs[host],{location:away});
 doc.state.settlements.loc_hw.starvation=5;
 Object.assign(doc.state.npcs[mover],{coins:57,inventory:{[w.items[0].id]:2}});
 const state=doc.state,reader={document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)};
 // 窗口与交集（读基础作息，同 business.flowTimesOfDay）
 const reasons=[];
 for(const day of [10,11]){
  const shopRows=[...biz.shopWindows(engine,state,day).entries()].map(([key,v])=>({key,keeper:v.keeper,windows:v.windows}));
  const customers=biz.customerWindows(engine,state,day),moverWindows=customers.get(mover)??[];
  const onDuty=[];for(let at=day*DAY,g=0;at<(day+1)*DAY&&g<48;g++){const slot=scheduleAt(engine,mover,at,state);if(!slot)break;const end=slot.until>at?slot.until:(day+1)*DAY;if((slot.services??[]).some(s=>s!=='trade'))onDuty.push({start:at,end,activity:slot.activity,services:slot.services});at=end;}
  const intersections=shopRows.filter(r=>r.keeper!==mover).map(r=>{let first=null;for(const sw of r.windows)for(const mw of moverWindows){if(sw.settlement!==mw.settlement)continue;const t=Math.max(sw.start,mw.start);if(t<Math.min(sw.end,mw.end)&&(first===null||t<first))first=t;}return {shop:r.key,keeper:r.keeper,earliest:first};});
  out({type:'migration-windows',day,flowTimes:biz.flowTimesOfDay(engine,state,day),shopWindows:shopRows,moverWindows,moverOnDuty:onDuty,intersections});
  for(const x of intersections)if(x.earliest===null)reasons.push({day,shop:x.shop,reason:'noWindow',basis:'迁居者清醒且不在别的服务岗位的窗口与该店营业窗口没有同聚落的交集'});
 }
 let budget=null;try{const b=householdBudget(reader,engine,mover);budget={satiety:Number(b.resources.procurementShortfall.satiety),hydration:Number(b.resources.procurementShortfall.hydration)};}catch(error){budget={error:String(error?.message??error)};}
 const npc=state.npcs[mover];
 if((npc.coins??0)<1)reasons.push({reason:'noMoney',basis:{coins:npc.coins}});
 if(budget&&!budget.error&&!(budget.satiety>0)&&!(budget.hydration>0))reasons.push({reason:'noNeed',basis:budget});
 out({type:'migration-reasons',mover,coins:npc.coins,status:npc.status,procurementShortfall:budget,reasons,slotAt:Object.fromEntries([360,480,720,1080,1200].map(t=>{const s=scheduleAt(engine,mover,10*DAY+t,state);return [t,s&&{location:s.location,activity:s.activity,services:s.services}];}))});
 // 推进到首夜，按测试的方法在账本上找迁居者的食物购买
 const foodIds=new Set(w.items.filter(i=>i.tags?.includes('food')).map(i=>i.id)),trace=[];
 globalThis.__LEDGER_TRACE__={push:e=>trace.push(e)};
 globalThis.__DIAG_FLOW__=migrationServe(mover);
 const res=await engine.reduce(doc,{tool:'world_time',args:{minutes:firstNight+1-doc.state.minute},eventId:`a-${doc.state.minute}`});
 doc=applyPatches(doc,res.patches);delete globalThis.__LEDGER_TRACE__;delete globalThis.__DIAG_FLOW__;
 const buys=trace.filter(t=>t.writer==='shop'&&String(t.from).startsWith(`${mover}|coin_river|`)&&t.amount>0&&foodIds.has(String(t.eventId).split(':').at(-1)));
 const customerEvents=trace.filter(t=>String(t.eventId).startsWith('customer:')).map(t=>t.eventId);
 out({type:'migration-buys',count:buys.length,buys,customerEventsAll:[...new Set(customerEvents)].slice(0,40)});
}

// 迁居者在每个客流结算时刻（第 10、11 天）的 serve 判定逐步重放（只读；与 business.mjs walkIns/serve 同一顺序，用钩子登记的模块内函数 globalThis.__DIAG_BIZ__）。
// 输出 migration-serve：t、openShops、walkInFailures（walkIns 各条件逐条，空即进入顾客名单）、inWalkIns，
// 再对同聚落每家店给 shops[].steps：tripped（本店当日已评估）、keeperHome（本户）、reach（往返步行 vs customerReachMinutes）、
// 逐件货 items[]：shelf（是否在货架）、service（到店服务时刻与顾客段/店窗口是否装得下）、want（quantity、severity）、budget（cash、floor、cap、tripCost）、
// available（店里可售量：stock、retained、committed、upkeep、available，物理库存 physical）、quotes（逐个数量：totalCoins、是否≤cap、option.feasible、深度拒绝）、decision（outcome、reason）、result（stop 的步骤）。
// opts：days（含两端的日范围，默认 10–11）、actors（逐个重放的人物，默认只有 mover）、accept(d)（按草稿筛哪一次夹具才输出）、type（输出行类型，店行为 `${type}-shop`）。
function migrationServe(mover,opts={}){
 const {days=[10,11],actors=[mover],accept=()=>true,type='migration-serve'}=opts;
 const one=(d,engine,t,mover)=>{
  const day=Math.floor(t/DAY);
  const B=globalThis.__DIAG_BIZ__??{},row={type,t,day,minuteOfDay:t%DAY,actor:mover};
  try{
   if(!B.openShops||!B.walkIns||!B.wants){out({...row,step:'hook-unavailable',have:Object.keys(B)});return;}
   const state=d.get('state'),npc=state.npcs[mover],seed=d.get('randomSeed');
   const slot=B.scheduleAt(engine,mover,t,state),fails=[];
   if(!npc)fails.push('noNpc');else{
    if(!B.personSimulation(engine,{},mover).value)fails.push('notFullPerson');
    if((npc.coins??0)<1)fails.push(`noMoney(coins=${npc.coins})`);
    if(['死亡','濒死','昏迷','患病'].includes(npc.status))fails.push(`status(${npc.status})`);
    if(state.player.companions?.includes(mover))fails.push('companion');
    if((engine.byId.get(mover)?.age??engine.rules.npcLife.adultAge)<engine.rules.npcLife.adultAge)fails.push('minor');
    for(const k of ['scheduleTravel','cognitionTravel','caring','levy'])if(npc[k])fails.push(`${k}(${JSON.stringify(npc[k]).slice(0,120)})`);
    if(B.householdWorkTime(engine,state,mover,t).unattended)fails.push('householdUnattended');
    if(!B.shoppingSlot(slot))fails.push(`slotNotShopping(${slot?.activity},${JSON.stringify(slot?.services)})`);
    if(B.personConstraint(engine,state,mover,t))fails.push(`personConstraint(${JSON.stringify(B.personConstraint(engine,state,mover,t)).slice(0,120)})`);
    if(engine.npcObligationAt(state,mover,t))fails.push('obligation');
   }
   const shops=B.openShops(d,engine,t),residents=B.walkIns(d,engine,t),me=residents.find(r=>r.id===mover);
   out({...row,step:'selection',slot:slot&&{location:slot.location,activity:slot.activity,until:slot.until,services:slot.services},coins:npc?.coins,openShops:shops.map(s=>({id:s.id,keeper:s.keeper,kind:s.kind,settlement:s.settlement,until:s.until})),walkInFailures:fails,inWalkIns:Boolean(me),residentsCount:residents.length});
   if(!me)return;
   const routes=new Map(),reach=B.customerReachMinutes(engine),serviceMinutes=B.actionCostRule(engine,'trade.retail').timeMin,gaps=new Map();
   for(const shop of shops){
    const sh={shop:shop.id,keeper:shop.keeper,steps:[],items:[]};
    const tripped=B.recordsWhere(state.records,'category','customer_flow').filter(r=>r.day===day&&r.shop===shop.id).flatMap(r=>r.visits).some(v=>v.npc===mover);
    const keeperHome=shop.kind==='resident'?new Set(B.personHousehold(engine,state,shop.keeper).value?.members??[]):null;
    const outbound=B.walkMinutes(engine,me.slot.location,shop.location,Math.max(t,0),seed,routes);
    sh.steps.push({keeperIsMover:shop.keeper===mover,tripped,keeperHome:Boolean(keeperHome?.has(mover)),sameSettlement:me.settlement===shop.settlement,outboundMinutes:outbound.minutes,reach});
    if(shop.keeper===mover||tripped||keeperHome?.has(mover)||me.settlement!==shop.settlement||outbound.minutes>reach){sh.result='skipped-before-shelf';out({...row,type:`${type}-shop`,...sh});continue;}
    const inbound=B.walkMinutes(engine,shop.location,me.slot.location,t+outbound.minutes,seed,routes),travelCoins=outbound.coins+inbound.coins;
    const shelf=B.shelfOf(d,engine,shop);sh.shelf=shelf;
    for(const item of shelf){
     const it={item},atShop=t+outbound.minutes,serviceAt=Math.max(atShop,t),finishAt=serviceAt+serviceMinutes,returnAt=finishAt+inbound.minutes;
     it.service={serviceAt,finishAt,returnAt,customerSegmentUntil:me.slot.until??(day+1)*DAY,shopUntil:shop.until??(day+1)*DAY};
     if(returnAt>(me.slot.until??(day+1)*DAY)||finishAt>(shop.until??(day+1)*DAY)){it.result='noTime(往返或服务超出顾客段/店窗口)';sh.items.push(it);break;}
     try{
      engine.assertNpcAutonomyAction(state,[mover,shop.keeper],{start:t,minutes:returnAt-t});
      engine.assertNpcObligationAction(d,[mover],{start:t,minutes:returnAt-t,location:me.slot.location,kind:'trade'});
      engine.assertNpcObligationAction(d,[shop.keeper],{start:serviceAt,minutes:serviceMinutes,location:shop.location,kind:'trade'});
     }catch(error){it.result=`conflict(${error.code}: ${error.message})`;sh.items.push(it);continue;}
     const projected={...d.document,state:{...state,minute:t,npcs:{...state.npcs,[mover]:{...npc,location:me.slot.location,activity:me.slot.activity}}}};
     const read={document:projected,get:(...p)=>p.reduce((v,k)=>v?.[k],projected)};
     const want=B.wants(d,engine,mover,item,gaps,t,shop,read);it.want=want;
     if(!want.quantity){it.result='noWant(wants 对这件货为 0)';sh.items.push(it);continue;}
     const view=B.subjectiveView(engine,projected,mover),budget=B.householdBudget(read,engine,mover,{view});
     const floor=Math.min(budget.cash,...budget.timeline.map(r=>r.balance)),tripCost=travelCoins,cap=Math.max(0,floor-tripCost-(engine.byId.get(item)?.nutrition?0:budget.resources.market.spent));
     it.budget={cash:budget.cash,floor,tripCost,cap,marketSpent:budget.resources.market.spent,until:budget.until};
     const stock=B.saleableStock(d,engine,shop.keeper,item,{business:shop.kind!=='resident'});
     it.available={stock:stock.stock,retained:stock.retained,committed:stock.committed,upkeep:stock.upkeep,available:stock.available,physical:engine.quantity(d,shop.keeper,item)};
     if(cap<1){it.result='noCap(cap<1)';sh.items.push(it);break;}
     let quantity=Math.min(want.quantity,stock.available),quote=null;it.quotes=[];
     const business={keeper:shop.keeper,markup:shop.markup};let supply=null,baseValue=null;
     for(;quantity>0;quantity--){
      supply??=B.quoteSupply(d,engine,{item,location:shop.location,business});
      baseValue??=B.regionalTradeBase(d,engine,item,shop.location,t)*B.wildlifePriceFactor(engine,d.document,item,shop.location);
      const q=B.marketQuote(d,engine,{seller:shop.keeper,buyer:mover,item,quantity,location:shop.location,minute:t,base:baseValue,business,supply});
      const option=B.householdOptions(budget,{item,quantity,totalCoins:q.totalCoins+tripCost}).find(o=>o.operation==='buy'),entry={quantity,totalCoins:q.totalCoins,withinCap:q.totalCoins>=1&&q.totalCoins<=cap,feasible:option?.feasible};
      if(entry.withinCap&&entry.feasible){try{B.assertMarketDepth(d,engine,q);quote=q;entry.depth='ok';}catch(error){entry.depth=`reject(${error.message})`;}}
      it.quotes.push(entry);if(quote)break;
     }
     if(!quote){it.result=stock.available<1?'noStock(可售量 0)':'noAffordableQuote(买不起任何一个数量)';sh.items.push(it);continue;}
     const estimate=B.subjectiveMarketQuote(engine,projected,view,{item,seller:shop.keeper,buyer:mover,quantity,});
     const noise=engine.world.marketRules.customerChoice?.noisePermille??0,draw=B.rollDice(seed,'market:purchase',`${mover}:${shop.id}:${item}`,t,0,2*noise+1)-1-noise;
     const decisionView={...view,self:{...view.self,coins:Math.max(view.self.coins,budget.cash),obligations:view.self.obligations.filter(o=>o.resource!==B.REFERENCE||o.start!==undefined||o.terms?.service)}};
     const decision=B.npcDecision(decisionView,{kind:'purchase',from:shop.keeper,cost:{coins:quote.totalCoins+tripCost,minutes:returnAt-t},reward:Math.floor(estimate.explanation.value.value*quantity),needSatisfaction:Math.trunc(want.severity*(1000+draw)/1000)});
     it.decision={outcome:decision.outcome,reason:decision.reason,quantity,totalCoins:quote.totalCoins};it.result=decision.outcome==='agree'?'would-buy':`declined(${decision.outcome})`;
     sh.items.push(it);if(decision.outcome==='defer')break;
    }
    sh.result=sh.items.some(i=>i.result==='would-buy')?'would-buy':'no-purchase';
    out({...row,type:`${type}-shop`,...sh});
   }
  }catch(error){out({...row,type:'error',where:'migrationServe',message:String(error?.stack??error)});}
 };
 return (d,engine,t)=>{
  const day=Math.floor(t/DAY);if(day<days[0]||day>days[1]||!accept(d))return;
  for(const a of actors)one(d,engine,t,a);
 };
}

// 户池补足记录（只读回调，globalThis.__DIAG_POOL__ 由 ec1-diag-hooks 装在扣前补足钩子里）：每次钩子真的转了钱就输出 pool-topup（payer、amount、writer、eventId、minute、topped）。
function installPool(){globalThis.__DIAG_POOL__=info=>{try{out({type:'pool-topup',...info});}catch(error){out({type:'error',where:'pool-hook',message:String(error?.message??error)});}};}

// ec1b-trade-windows #7 / #8：原测试文件整份运行（夹具原样），客流每个结算时刻对顾客逐步重放（选客 walkIns 各条件、tripped、wants、预算、可售、逐数量报价、决策与拒绝原因，字段同 migration-serve）。
// 用 accept 按夹具区分：#7 只有徐凌（D）一位晚起者（没有陈白 E）；#8 有 E 且 D 只有 1 铜。另输出这两个夹具里与 A/D/E/店主林穗有关的账本转移与 pool-topup。
async function tradeWindows(label,accept){
 const A='npc_hw_luowei',D='npc_hw_xuling',E='npc_hw_chenbai',seller='npc_hw_linsui';
 installPool();globalThis.__LEDGER_TRACE__=tracer([A,D,E,seller]);
 globalThis.__DIAG_FLOW__=migrationServe(null,{days:[0,0],actors:[A,D,E],accept:d=>accept(d,{A,D,E}),type:label});
 await import(new URL('../tests/ec1b-trade-windows.test.mjs',import.meta.url));
}

// w2-s2 重放到购买之前：原测试文件整份运行。每个客流结算时刻，若导师（npc_bs_078_1）的店开着，输出 w2s2-mentor：导师蜂蜜/面包/木柴的 物理库存、可售量各项（stock、retained、committed、upkeep、available）、
// 户内各持有行（household-budget.householdResources：stock/food/seed/committed/inUse/upkeep/retained/available）；再对同聚落每位有资格上门的居民输出 w2s2-buyer：
// 户、procurementShortfall（饱腹/水分）、对蜂蜜的 wants（quantity、severity）。谁、几点买了几份蜜见同时输出的 sale 行（eventId 带店、分钟、买家、物品）。
async function w2s2PreBuy(){
 const hb=await import('../server-plugin/household-budget.mjs'),{personHousehold}=await import('../server-plugin/entity-view.mjs');
 const mentor='npc_bs_078_1',items=['item_honey','item_bread','item_wood'];let last='';
 installPool();globalThis.__LEDGER_TRACE__=tracer([mentor]);
 globalThis.__DIAG_FLOW__=(d,engine,t)=>{
  try{
   const B=globalThis.__DIAG_BIZ__??{},state=d.get('state');
   if(!B.openShops||!state.npcs?.[mentor])return;
   const shops=B.openShops(d,engine,t).filter(s=>s.keeper===mentor);if(!shops.length)return;
   const res=hb.householdResources(d,engine,mentor),rows=items.map(item=>{
    const s=B.saleableStock(d,engine,mentor,item,{business:false});
    return {item,physical:engine.quantity(d,mentor,item),saleable:{stock:s.stock,retained:s.retained,committed:s.committed,upkeep:s.upkeep,available:s.available},
     holdings:res.rows.filter(r=>r.item===item).map(r=>({holder:r.holder,stock:r.stock,food:r.food,seed:r.seed,committed:r.committed,inUse:r.inUse,upkeep:r.upkeep??0,retained:r.retained,available:r.available}))};
   });
   const mine=JSON.stringify(rows);if(mine!==last){last=mine;out({type:'w2s2-mentor',t,day:Math.floor(t/DAY),minuteOfDay:t%DAY,household:personHousehold(engine,state,mentor).value?.id??null,members:res.members,rows});}
   const gaps=new Map();
   for(const r of B.walkIns(d,engine,t)){
    if(r.id===mentor||r.settlement!==shops[0].settlement)continue;
    const projected={...d.document,state:{...state,minute:t}},read={document:projected,get:(...p)=>p.reduce((v,k)=>v?.[k],projected)};
    const b=B.householdBudget(read,engine,r.id),w=B.wants(d,engine,r.id,'item_honey',gaps,t,shops[0],read);
    out({type:'w2s2-buyer',t,buyer:r.id,household:personHousehold(engine,state,r.id).value?.id??null,coins:state.npcs[r.id]?.coins,
     shortfall:{satiety:Number(b.resources.procurementShortfall.satiety),hydration:Number(b.resources.procurementShortfall.hydration)},honeyWant:{quantity:w.quantity,severity:w.severity}});
   }
  }catch(error){out({type:'error',where:'w2s2PreBuy',message:String(error?.stack??error)});}
 };
 await import(new URL('../tests/w2-s2.test.mjs',import.meta.url));
}

// 数值型失败断言取证（s5-04、m1、law、s5-f-tender、s3-finance、finance-assets、m3-*、s5-w4、food-habit、npc-life-*、quest-sources、household-labor）：
// 原测试文件整份运行；把 node:assert/strict 的 equal/strictEqual/deepEqual/deepStrictEqual/notEqual/ok/match 在内存里包一层，失败时先输出 assert-fail 再原样抛出（不吞、不改结果）：
//  fn、actual（实际值）、expected（期望值）、message、at（调用栈里的测试文件行）、
//  recentLedger（失败前最近 40 笔账本转移：from、to、amount、writer、eventId）、poolTopups（失败前累计的户池补足笔数与最近 8 笔）、
//  recentStock（失败前最近 6 次可售量检查：卖方、买家、物品、数量、可售量各项、该户各持有行 stock/retained/committed/upkeep/available、报价摘要——即持有、留存、承诺、价格因子的来源分解）。
async function assertCapture(file){
 const assertModule=(await import('node:assert/strict')).default,hb=await import('../server-plugin/household-budget.mjs');
 const ledger=[],stocks=[],pool=[];let fails=0;
 const clip=(v,n=900)=>{try{const s=JSON.stringify(v);return s&&s.length>n?`${s.slice(0,n)}…(${s.length})`:v;}catch{return String(v);}};
 globalThis.__LEDGER_TRACE__={push(e){ledger.push({from:e.from,to:e.to,amount:e.amount,writer:e.writer,eventId:e.eventId});if(ledger.length>40)ledger.shift();}};
 globalThis.__DIAG_POOL__=info=>{pool.push(info);};
 globalThis.__DIAG_STOCK__=({d,engine,quote,stock})=>{
  try{
   const res=hb.householdResources(d,engine,quote.seller);
   stocks.push({minute:d.get('state','minute'),seller:quote.seller,buyer:quote.buyer,item:quote.item,quantity:quote.quantity,side:quote.side,saleable:{stock:stock.stock,retained:stock.retained,committed:stock.committed,upkeep:stock.upkeep,available:stock.available},
    holdings:res.rows.filter(r=>r.item===quote.item).map(r=>({holder:r.holder,stock:r.stock,retained:r.retained,committed:r.committed,upkeep:r.upkeep??0,available:r.available})),quote:clip(quote,700)});
   if(stocks.length>6)stocks.shift();
  }catch(error){stocks.push({error:String(error?.message??error)});}
 };
 for(const fn of ['equal','strictEqual','deepEqual','deepStrictEqual','notEqual','ok','match']){
  const original=assertModule[fn];if(typeof original!=='function')continue;
  assertModule[fn]=function(...args){
   try{return original.apply(this,args);}
   catch(error){
    fails++;
    const at=String(error?.stack??'').split('\n').filter(l=>l.includes('/tests/')).slice(0,3).map(l=>l.trim());
    const [actual,expected,message]=fn==='ok'?[args[0],true,args[1]]:args;
    out({type:'assert-fail',file,seq:fails,fn,actual:clip(actual),expected:clip(expected),message:typeof message==='string'?message:(message?.message??null),at,
     recentLedger:ledger.slice(),poolTopups:{count:pool.length,last:pool.slice(-8)},recentStock:stocks.slice()});
    throw error;
   }
  };
 }
 process.on('exit',()=>out({type:'assert-summary',file,failures:fails,poolTopups:pool.length}));
 await import(new URL(`../tests/${file}`,import.meta.url));
}

// 簇 4：s5-w4 #1 在 market.mjs:355 报“对方库存不足：扣除自用和已承诺存量后不够出售”（木材）。钩子在可售量读出后回调（globalThis.__DIAG_STOCK__），
// 对关注的物品（默认 item_wood，可用第二个参数换，逗号分隔）输出 stock-check：卖方、数量、可售量各项，以及该户每个持有行的
// stock / food / seed / seedTarget / committed / inUse / upkeep / retained / available（retained=max(inUse,food+seed)+upkeep；available=max(0,stock−retained−committed)），
// 用来找出是哪一项把可售量扣成 0；另给成员、户日用量 householdDailyUse、用度类 householdUsage、承诺记录 householdCommitments。failing=true 表示本次将被拒（数量 > 可售量，卖方非玩家）。
async function woodStock(file,watch){
 const hb=await import('../server-plugin/household-budget.mjs'),{personHousehold}=await import('../server-plugin/entity-view.mjs');
 const items=new Set(watch);let n=0;
 globalThis.__DIAG_STOCK__=({d,engine,quote,stock})=>{
  try{
   if(!items.has(quote.item))return;
   const state=d.get('state'),res=hb.householdResources(d,engine,quote.seller),members=res.members;
   const rows=res.rows.filter(r=>r.item===quote.item).map(r=>({holder:r.holder,stock:r.stock,food:r.food,seed:r.seed,seedTarget:r.seedTarget,committed:r.committed,inUse:r.inUse,upkeep:r.upkeep??0,retained:r.retained,available:r.available}));
   out({type:'stock-check',seq:++n,minute:state.minute,seller:quote.seller,buyer:quote.buyer,item:quote.item,quantity:quote.quantity,side:quote.side,business:quote.business??null,
    failing:quote.seller!=='player'&&quote.quantity>stock.available,saleable:{stock:stock.stock,retained:stock.retained,committed:stock.committed,upkeep:stock.upkeep,available:stock.available},
    household:personHousehold(engine,state,quote.seller).value?.id??null,members,sharedMeals:res.sharedMeals,rows,
    dailyUse:hb.householdDailyUse(engine,state,members,quote.item),usage:hb.householdUsage(engine,state,members),commitments:hb.householdCommitments(state,quote.seller,quote.item),
    inventories:Object.fromEntries(members.map(m=>[m,state.npcs?.[m]?.inventory?.[quote.item]??null]))});
  }catch(error){out({type:'error',where:'woodStock',message:String(error?.stack??error)});}
 };
 process.on('exit',()=>out({type:'stock-summary',file,checks:n,note:n?'':'没有捕获到可售量检查：钩子未装上（market.mjs 该行已变）或本次未触发'}));
 await import(new URL(`../tests/${file}`,import.meta.url));
}

const cases={
 'sales-s5-w4-wood':()=>woodStock('s5-w4-economy.test.mjs',(watchArg??'item_wood').split(',')),
 'sales-a1-lt':()=>runTests('a1-lt-scenarios.test.mjs',(watchArg??'npc_hw_duanyan').split(',')),
 'sales-w2-s2':()=>runTests('w2-s2.test.mjs',(watchArg??'npc_bs_077_1,npc_bs_078_1,npc_bs_079_1').split(',')),
 'sales-s5-w4':()=>runTests('s5-w4-economy.test.mjs',(watchArg??'npc_hw_linsui,npc_hw_taozhi,npc_hw_duanyan').split(',')),
 'finance-a3-domain':()=>financeHook('a3-domain-properties.test.mjs'),
 'finance-daily-b2':()=>financeHook('daily-b2-mechanisms.test.mjs'),
 'migration':migration,
 'trade-windows-7':()=>tradeWindows('tw7-serve',(d,{D,E})=>Boolean(d.get('state','npcs',D))&&!d.get('state','npcs',E)&&d.get('state','npcs',D,'coins')>1),
 'trade-windows-8':()=>tradeWindows('tw8-serve',(d,{D,E})=>Boolean(d.get('state','npcs',E))&&d.get('state','npcs',D,'coins')===1),
 'w2-s2-pre-buy':w2s2PreBuy,
 'assert-s5-04':()=>assertCapture('s5-04.test.mjs'),
 'assert-m1':()=>assertCapture('m1-repair-learning-preconditions.test.mjs'),
 'assert-law':()=>assertCapture('law.test.mjs'),
 'assert-s5-f-tender':()=>assertCapture('s5-f-tender.test.mjs'),
 'assert-s3-finance':()=>assertCapture('s3-finance-scenarios.test.mjs'),
 'assert-finance-assets':()=>assertCapture('finance-assets.test.mjs'),
 'assert-m3-acceptance':()=>assertCapture('m3-acceptance.test.mjs'),
 'assert-m3-language':()=>assertCapture('m3-language.test.mjs'),
 'assert-s5-w4':()=>assertCapture('s5-w4-economy.test.mjs'),
 'assert-food-habit':()=>assertCapture('food-habit.test.mjs'),
 'assert-npc-life-migration':()=>assertCapture('npc-life-migration.test.mjs'),
 'assert-npc-life-t164':()=>assertCapture('npc-life-t164.test.mjs'),
 'assert-quest-sources':()=>assertCapture('quest-sources.test.mjs'),
 'assert-household-labor':()=>assertCapture('s5-law-household-labor.test.mjs')
};
out({type:'start',case:caseName,known:Object.keys(cases)});
if(!cases[caseName]){out({type:'error',message:`未知情形 ${caseName}`});process.exitCode=1;}
else{try{await cases[caseName]();}catch(error){out({type:'error',message:String(error?.stack??error)});process.exitCode=1;}}
