// EC-1 全量对照失败的取证探针（只读：不改引擎源码、不写存档、不写任何文件；输出 JSON Lines 到 stdout；云上用 run-script 运行，本机不要运行）。
// 用法：node tools/ec1-diag.mjs <情形名> [逗号分隔的关注编号]
// 情形名：
//  sales-a1-lt        簇 1：运行 tests/a1-lt-scenarios.test.mjs 原夹具，记录每笔零售成交（eventId 以 customer: 开头）与与铁匠有关的账本转移
//  sales-w2-s2        簇 1：运行 tests/w2-s2.test.mjs 原夹具，记录每笔零售成交与三位导师（npc_bs_077_1/078_1/079_1）有关的账本转移
//  sales-s5-w4        簇 1：运行 tests/s5-w4-economy.test.mjs 原夹具，记录每笔零售成交与林穗、陶枝、段岩有关的账本转移
//  finance-a3-domain  簇 2：运行 tests/a3-domain-properties.test.mjs 原夹具，financeChange 抛“当事人资金不足”前记被扣方、金额、该方与其户池现金
//  finance-daily-b2   簇 2：运行 tests/daily-b2-mechanisms.test.mjs 原夹具（含 #6 farm.private_harvest 与 #9），同上
//  migration          簇 3：重建 tests/npc-life-migration.test.mjs 的默认夹具（fixture()+hungry()，迁居者 npc_hw_xuling），输出窗口、交集与没有成交的原因
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
 const res=await engine.reduce(doc,{tool:'world_time',args:{minutes:firstNight+1-doc.state.minute},eventId:`a-${doc.state.minute}`});
 doc=applyPatches(doc,res.patches);delete globalThis.__LEDGER_TRACE__;
 const buys=trace.filter(t=>t.writer==='shop'&&String(t.from).startsWith(`${mover}|coin_river|`)&&t.amount>0&&foodIds.has(String(t.eventId).split(':').at(-1)));
 const customerEvents=trace.filter(t=>String(t.eventId).startsWith('customer:')).map(t=>t.eventId);
 out({type:'migration-buys',count:buys.length,buys,customerEventsAll:[...new Set(customerEvents)].slice(0,40)});
}

const cases={
 'sales-a1-lt':()=>runTests('a1-lt-scenarios.test.mjs',(watchArg??'npc_hw_duanyan').split(',')),
 'sales-w2-s2':()=>runTests('w2-s2.test.mjs',(watchArg??'npc_bs_077_1,npc_bs_078_1,npc_bs_079_1').split(',')),
 'sales-s5-w4':()=>runTests('s5-w4-economy.test.mjs',(watchArg??'npc_hw_linsui,npc_hw_taozhi,npc_hw_duanyan').split(',')),
 'finance-a3-domain':()=>financeHook('a3-domain-properties.test.mjs'),
 'finance-daily-b2':()=>financeHook('daily-b2-mechanisms.test.mjs'),
 'migration':migration
};
out({type:'start',case:caseName,known:Object.keys(cases)});
if(!cases[caseName]){out({type:'error',message:`未知情形 ${caseName}`});process.exitCode=1;}
else{try{await cases[caseName]();}catch(error){out({type:'error',message:String(error?.stack??error)});process.exitCode=1;}}
