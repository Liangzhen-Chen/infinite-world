// WATER 探针（只读，不写盘、不改世界、不 import 测试文件）：陶枝单独在场、青灯店的真实客流里，原生店是否在家户计划来源里。
// 用法：node tools/water-probe.mjs > out.json （云上运行；输出 JSON）。
// 场景参数出处：tests/s5-w4-economy.test.mjs
//   :224-239 openShop（建引擎、applyIntentSetup 的 minute:600/location:bld_hw_qingdeng/coins:300/inventory/present:[林穗]、租铺面 days:2、开柜台 100、营业）；
//   第 10 项“陶枝单独在场”的居民钱袋 coins={徐玲:0,吴硕:0,颜哲:0,陶枝:3}；campaignSeed 默认 'w4-flow'；先推进到 719，再越过午夜 30 分钟（waitPastMidnight，:239）。
// 做法：包住 registerHouseholdFoodSources.fn（household-budget.mjs 导出的可替换入口）与 engine.assertNpcAutonomyAction（business.mjs serve 每件货成交前都会调用），
// 记录每次家户来源读取（分钟、居民位置、店主状态、返回的来源与 considered、前置门槛逐店通过/淘汰原因），客流结束后对照成交记录。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from './a3-score.mjs';
import {registerHouseholdFoodSources} from '../server-plugin/household-budget.mjs';
import {currentShops} from '../server-plugin/shop.mjs';
import {customerReachMinutes} from '../server-plugin/market.mjs';
import {placeSettlement,personHousehold} from '../server-plugin/entity-view.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';

const DAY=1440,LANDLORD='npc_hw_linsui',PLACE='bld_hw_qingdeng',A='npc_hw_xuling',B='npc_hw_wushuo',D='npc_hw_yanzhe',E='npc_hw_taozhi';
const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
const engine=new WorldEngine(structuredClone(world)),initial=engine.createCharacter(seed,{},'w4-flow');
const coins={[A]:0,[B]:0,[D]:0,[E]:3};
const facts=Object.keys(initial.state.npcs).filter(id=>id!==LANDLORD).map(id=>({path:['state','npcs',id,'coins'],value:coins[id]??0}));
const prepared=applyIntentSetup(engine,initial,{minute:600,location:PLACE,coins:300,inventory:{item_bread:5,item_parchment:1},present:[LANDLORD],abilitiesByActor:{player:{skills:{skill_literacy:500}}},facts});
const f={engine,document:prepared.document};
const act=async(action,slots,id)=>{const out=await engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId:id});f.document=applyPatches(f.document,out.patches);return out.result;};
const leased=await engine.reduce(f.document,{tool:'world_trade',args:{operation:'lease',seller:LANDLORD,consent:true,days:2},eventId:'w4-lease'});
f.document=applyPatches(f.document,leased.patches);const business=leased.result.business;
await act('business:open_counter',{business,coins:100},'w4-counter');
await act('core:settlement.business_open',{business},'w4-open');

const advance=async(minutes,id)=>{const out=await engine.reduce(f.document,{tool:'world_time',args:{minutes},eventId:id});f.document=applyPatches(f.document,out.patches);};
const keeperView=state=>{const n=state.npcs?.[LANDLORD],s=scheduleAt(engine,LANDLORD,state.minute,state);return {location:n?.location,activity:n?.activity,status:n?.status,scheduleTravel:Boolean(n?.scheduleTravel),cognitionTravel:Boolean(n?.cognitionTravel),slot:s?{location:s.location,activity:s.activity,services:s.services,until:s.until}:null};};
const shopsView=state=>currentShops(engine,state).map(s=>({id:s.id,keeper:s.keeper,settlement:s.settlement,location:s.location,goods:(s.restock??[]).map(r=>r.item)}));

// foodSources 前置门槛逐店复核（与 shop.mjs registerHouseholdFoodSources 同一顺序：聚落/同户 -> 路程 -> 营业窗口），只报第一道淘汰原因。
function gates(d,owner,view){
  const state=d.get('state'),now=state.minute,location=view?.self.location??(owner==='player'?state.location:state.npcs?.[owner]?.location),place=placeSettlement(engine,state,location).value;
  const members=personHousehold(engine,state,owner).value?.members??[owner],out=[];
  for(const shop of currentShops(engine,state)){
    const row={shop:shop.id,keeper:shop.keeper,shopLocation:shop.location,shopSettlement:shop.settlement,buyerPlace:place};
    if(shop.settlement!==place){out.push({...row,rejected:'聚落不同（shop.mjs 循环首行 shop.settlement!==place）'});continue;}
    if(shop.keeper!==owner&&members.includes(shop.keeper)){out.push({...row,rejected:'卖家是同户成员'});continue;}
    if(view&&shop.keeper!==owner){out.push({...row,rejected:'主观视图只认本人店'});continue;}
    let travel=0;
    if(location!==shop.location){try{travel=engine.route(location,shop.location,'walk',now,d.get('randomSeed')).minutes;}catch(error){out.push({...row,rejected:`路线抛错 ${error.code??error.message}`});continue;}}
    if(!Number.isFinite(travel)||travel>customerReachMinutes(engine)){out.push({...row,travel,reach:customerReachMinutes(engine),rejected:'路程超过 customerReachMinutes'});continue;}
    // nextFoodService 同款：从 now+travel 起找店主在该店位置且带 trade 服务的作息段。
    let opening=null;
    for(let at=now+travel;at<now+travel+31*DAY;){
      const slot=facilityRuntime().scheduleAt?.(engine,shop.keeper,at,state);
      if(!slot){opening=at===now+travel?{minute:at,location:shop.location??state.npcs?.[shop.keeper]?.location}:null;break;}
      if((shop.location===undefined||slot.location===shop.location)&&slot.services?.includes('trade')){opening={minute:at,location:slot.location};break;}
      at=slot.until;
    }
    if(!opening||opening.location!==shop.location){out.push({...row,travel,opening,rejected:'店主营业窗口/位置不符（nextFoodService）'});continue;}
    out.push({...row,travel,opening,passed:'到店可达且营业（之后只剩库存份额 sellerShare 过滤）'});
  }
  return out;
}

const log=[],original=registerHouseholdFoodSources.fn;
registerHouseholdFoodSources.fn=(d,eng,owner,opts={})=>{
  const state=d.get('state'),result=original(d,eng,owner,opts),view=opts?.view;
  log.push({event:'foodSources',minute:state.minute,owner,subjective:Boolean(view),ownerLocation:view?.self.location??state.npcs?.[owner]?.location,
    keeper:keeperView(state),currentShops:shopsView(state),gates:gates(d,owner,view),
    considered:result.considered??null,sources:result.map(r=>({source:r.source,seller:r.seller,item:r.item,at:r.at,quantity:r.quantity,unitPrice:r.unitPrice}))});
  return result;
};
const assertAuto=engine.assertNpcAutonomyAction.bind(engine);
engine.assertNpcAutonomyAction=(state,actors,span)=>{log.push({event:'serve-item-check（wants 即将调用）',minute:state.minute,actors,start:span?.start});return assertAuto(state,actors,span);};

// 719 与 720 两个时刻的 currentShops 与店主状态（719 取真实前态；720 取同一前态把分钟改为 720 的投影，客流里读到的真实 720 状态见 foodSources 记录里的 keeper 字段）。
const m=f.document.state.minute%DAY;if(m<719)await advance(719-m,'probe-to-noon');
const at719={minute:f.document.state.minute,keeper:keeperView(f.document.state),currentShops:shopsView(f.document.state)};
const projected720={...f.document.state,minute:720};
const at720Projection={minute:720,keeper:keeperView(projected720),currentShops:shopsView(projected720)};
const minutes=DAY-(f.document.state.minute%DAY)+30;
await advance(minutes,'probe-flow');

const flows=Object.values(f.document.state.records).filter(r=>r.category==='customer_flow').map(r=>({shop:r.shop,day:r.day,minute:r.minute,visits:r.visits.map(v=>({npc:v.npc,item:v.item,quantity:v.quantity,paid:v.paid,outcome:v.outcome}))}));
console.log(JSON.stringify({scenario:'陶枝单独在场、青灯店（s5-w4-economy 第10项变体）',at719,at720Projection,flows,log},null,1));
