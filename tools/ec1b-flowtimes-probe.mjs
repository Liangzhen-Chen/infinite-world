// EC-1b 客流时刻只读探针：对 F:/dnd-tmp/ec1/tests-rederive.md 里“未改”用例的场景，输出新规律下的 flowTimesOfDay、shopWindows、customerWindows，
// 以及在内存里推一天客流的结果（customer_flow 记录的店、分钟、访问摘要），供云上取实际时刻后重推期望。
// 只读：不写盘、不改世界文件、不 import 测试文件、不调模型；每个场景在内存里 createCharacter 后按场景参数改世界/状态。场景参数逐项注明出自测试的哪几行。
// 用法：node tools/ec1b-flowtimes-probe.mjs [场景名]   （云上运行，本机不要运行；不带参数跑全部）
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {advanceCustomerFlow,flowTimesOfDay,shopWindows,customerWindows} from '../server-plugin/business.mjs';

const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
const DAY=1440,only=process.argv[2];
const seg=(start,end,location,activity,services=[])=>({start,end,location,activity,services});

// 场景：mutateWorld(w) 改世界定义，mutateDoc(doc) 改开局状态（都在内存），ids 是要输出顾客窗口的人，shops 为关心的店编号。
const scenarios=[
 {name:'real-world-default',source:'tests/s5-w4-economy.test.mjs:278-345、:412（F026 客流：A=npc_hw_xuling B=npc_hw_wushuo D=npc_hw_yanzhe E=npc_hw_taozhi，店 shop_hw_qingdeng；真实作息，状态取 createCharacter 开局，不含 applyIntentSetup 的玩家入住与钱数，仅供取各人窗口）',
  ids:['npc_hw_xuling','npc_hw_wushuo','npc_hw_yanzhe','npc_hw_taozhi','npc_hw_linsui','npc_hw_ayan','npc_hw_shendu']},
 {name:'s5-04b',source:'tests/s5-04b.test.mjs:66、:160（owner 与 npc_hw_shendu、npc_hw_linsui、npc_hw_ayan；真实作息）',
  ids:['npc_hw_shendu','npc_hw_linsui','npc_hw_ayan']},
 {name:'periodic-main-fixture',source:'tests/s5-law-periodic-market.test.mjs:18-42（owner=npc_hw_linsui 窗口 [720,1440) trade，buyer=npc_hw_luowei 全天醒，seller=npc_hw_yanzhe；minute=DAY）',
  ids:['npc_hw_linsui','npc_hw_luowei','npc_hw_yanzhe'],
  mutateWorld(w){
   for(const n of w.npcs)if(['npc_hw_linsui','npc_hw_luowei','npc_hw_yanzhe'].includes(n.id)){
    delete n.tier;if(n.id==='npc_hw_luowei')n.tier='full';
    n.schedule={default:n.id==='npc_hw_linsui'?[seg(0,720,'bld_hw_qingdeng','休息'),seg(720,1440,'bld_hw_qingdeng','休息',['trade'])]:[seg(0,1440,'bld_hw_qingdeng','休息')]};
   }},
  mutateDoc(doc){doc.state.minute=DAY;}},
 {name:'periodic-override-480-800',source:'tests/s5-law-periodic-market.test.mjs:52-58（店主改为 [480,800) 营业，其余在家睡眠；buyer 全天醒；“native noon boundary…”用例及变体）',
  ids:['npc_hw_linsui','npc_hw_luowei'],
  mutateWorld(w){
   for(const n of w.npcs){
    if(n.id==='npc_hw_linsui'){delete n.tier;n.schedule={default:[seg(0,480,'loc_hw','睡眠'),seg(480,800,'bld_hw_qingdeng','营业',['trade']),seg(800,1440,'loc_hw','睡眠')]};}
    if(n.id==='npc_hw_luowei'){n.tier='full';n.schedule={default:[seg(0,1440,'bld_hw_qingdeng','休息')]};}
   }},
  mutateDoc(doc){doc.state.minute=700;}},
 {name:'household-meals-fixture',source:'tests/s5-law-household-meals.test.mjs:23-60（店主 npc_hw_linsui [720,1440) trade，npc_hw_luowei 全天醒；用例 :161-173）',
  ids:['npc_hw_linsui','npc_hw_luowei'],
  mutateWorld(w){
   for(const n of w.npcs){
    if(n.id==='npc_hw_linsui'){n.tier='full';n.schedule={default:[seg(0,720,'bld_hw_qingdeng','休息'),seg(720,1440,'bld_hw_qingdeng','休息',['trade'])]};}
    if(n.id==='npc_hw_luowei'){n.tier='full';n.schedule={default:[seg(0,1440,'bld_hw_qingdeng','休息')]};}
   }},
  mutateDoc(doc){doc.state.minute=0;}}
];

function summarize(engine,state,day,ids){
 const shops=[...shopWindows(engine,state,day).entries()].map(([key,row])=>({shop:key,keeper:row.keeper,windows:row.windows}));
 const customers=customerWindows(engine,state,day),pick=Object.fromEntries(ids.filter(id=>customers.has(id)).map(id=>[id,customers.get(id)]));
 return {day,flowTimes:flowTimesOfDay(engine,state,day),shopWindows:shops,customerWindowsOfIds:pick,allCustomerCount:customers.size,idsNotCustomers:ids.filter(id=>!customers.has(id))};
}

for(const s of scenarios){
 if(only&&only!==s.name)continue;
 const w=structuredClone(world);s.mutateWorld?.(w);
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},`ec1b-probe-${s.name}`);s.mutateDoc?.(doc);
 doc.ledger=openLedger(engine,doc);
 const d=engine.primitiveDraft(doc);
 const out={scenario:s.name,source:s.source,minute:doc.state.minute,days:[0,1,2].map(day=>summarize(engine,d.get('state'),day,s.ids))};
 // 在内存里推一天客流（不写盘）：看哪些店、哪些分钟有记录，访问摘要（人、件、结局）
 try{
  const from=Math.floor(doc.state.minute/DAY)*DAY-1;
  advanceCustomerFlow(d,engine,from,from+1+DAY);
  out.flowResult=Object.values(d.get('state','records')).filter(r=>r.category==='customer_flow').map(r=>({shop:r.shop,day:r.day,minute:r.minute,visits:r.visits.map(v=>({npc:v.npc,item:v.item??null,quantity:v.quantity??null,paid:v.paid??null,outcome:v.outcome}))}));
 }catch(error){out.flowError=String(error?.message??error);}
 console.log(`## ${s.name}\n${JSON.stringify(out,null,1)}`);
}
