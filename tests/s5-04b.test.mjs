import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {dedicatedCoinAccount,depositCounter,payFromCounter} from '../server-plugin/money.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {groupAccountView} from '../server-plugin/group-account.mjs';
import {currentShops} from '../server-plugin/shop.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const mill='bld_hw_mill',owner='npc_hw_linsui',DAY=1440;
const withWage=(multiplier,w=world)=>new WorldEngine({...w,derived:{...w.derived,modifiers:[...w.derived.modifiers,{id:'wage-market',pack:'business',target:'economy:wage',stage:'mul',value:multiplier}]}});
const clean=f=>assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
function write(f,fn,engine=f.engine){const d=engine.primitiveDraft(f.document),result=fn(d);f.document=applyPatches(f.document,d.patches);return result;}
const time=async(f,minutes,id,engine=f.engine)=>{const out=await engine.reduce(f.document,{tool:'world_time',args:{minutes},eventId:id});f.document=applyPatches(f.document,out.patches);};
// 前提（非考查对象）：林穗在磨坊有一项缺人的工程，雇主有钱，阿燕缺钱求活计；谁应聘由生产招工系统在午夜按各人自己的需要与意愿选出。
// 工程用工按到岗分钟计工计钱，没有配方批次限制，便于手算。
async function hired({counter=0,engine=new WorldEngine(world)}={}){
 const initial=engine.createCharacter(seed,{},'s504b'),worker='npc_hw_ayan';
 // W4 F026 起居民会在正午上门买货；本组考查的是工钱来源，其余居民设为无钱，没人上门买林穗的货（上门客流另有 s5-w4-economy 测试，与 W4 其他店铺测试同一做法）。
 const penniless=Object.keys(initial.state.npcs).filter(id=>id!==owner&&id!==worker).map(id=>({path:['state','npcs',id,'coins'],value:0}));
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:mill,present:[owner,worker],facts:[...penniless,
  {path:['state','projects'],value:{...initial.state.projects,proj_x:{id:'proj_x',type:'工程',name:'磨坊加固',status:'施工中',creator:owner,settlement:'loc_hw',location:mill,remainingDays:10,remainingWork:10,days:10}}},
  {path:['state','npcs',owner],value:{...initial.state.npcs[owner],location:mill,coins:5000}},
  {path:['state','npcs',worker],value:{...initial.state.npcs[worker],location:mill,coins:0,goals:{short:[{id:'need-job',kind:'money',content:'需要工钱',progress:0}]}}}
 ]});
 assert.deepEqual(prepared.setupUnmet,[]);
 const f={engine,document:prepared.document};
 // 店主先把营运资金调入柜台（真实的钱袋->柜台划转），再由午夜撮合招工。
 if(counter)write(f,d=>depositCounter(d,engine,{owner,seat:mill,business:'shop_hw_mill',amount:counter,eventId:'open-counter'}));
 await time(f,DAY-600,'hire');
 f.row=Object.values(f.document.state.records).find(r=>r.laborMarket===1&&r.owner===owner&&r.project==='proj_x');assert.ok(f.row);f.worker=f.row.worker;
 // 到岗分钟 = 480 - 从家走到磨坊的路网分钟（与既有真实到岗测试同一手算口径）。
 f.minutes=480-engine.route(engine.byId.get(f.worker).home.location,mill,'walk',f.row.starts,f.document.randomSeed).minutes;
 return f;
}
const rec=f=>f.document.state.records[f.row.id];

test('wage counter: a business pays its hands from the counter, never from the owner purse (15 §15.1.1)',async()=>{
 const f=await hired({counter:30});
 // 开户资金30铜来自店主钱袋（5000-30=4970）；签约日薪=第0阶(20+40)/2=30。
 assert.equal(f.row.wage,30);assert.equal(f.document.state.npcs[owner].coins,4970);
 const purse=f.document.state.npcs[f.worker].coins;
 await time(f,f.row.nextWork-f.document.state.minute,'shift1');
 // 第1日到岗m分钟：应付 ceil(30×m/480)（m=480-通勤，通勤≤105时不足30）。柜台30-付出；店主钱袋仍为4970。
 const pay=Math.ceil(30*f.minutes/480);
 assert.equal(rec(f).paid,pay);assert.equal(dedicatedCoinAccount(f.document.state,owner,'counter').coins,30-pay);
 assert.equal(f.document.state.npcs[owner].coins,4970);assert.equal(f.document.state.npcs[f.worker].coins,purse+pay);clean(f);
});

test('wage counter: when the counter runs short the shortfall is wage debt even though the owner carries cash',async()=>{
 const f=await hired({counter:30});
 // 店主在支付货款时从柜台付出25（非考查前提），柜台只剩5。
 write(f,d=>payFromCounter(d,f.engine,{owner,to:'npc_hw_shendu',amount:25,writer:'business',eventId:'supplier-bill'}));
 await time(f,f.row.nextWork-f.document.state.minute,'shift1');
 const earned=Math.ceil(30*f.minutes/480);assert.ok(earned>5);
 // 柜台5铜全付，其余成为工钱债权（债权额=应得，已付5）；个人钱袋的4970铜一分不动。
 assert.equal(rec(f).paid,5);assert.equal(dedicatedCoinAccount(f.document.state,owner,'counter').coins,0);
 const debt=Object.values(f.document.state.records).find(r=>r.kind==='wage'&&r.contract===f.row.id);
 assert.ok(debt);assert.equal(debt.amount,earned);assert.equal(debt.paid,5);
 assert.equal(f.document.state.npcs[owner].coins,4970);assert.equal(rec(f).status,'罢工');
 // 欠薪不清，雇员据此离职并立案（既有欠薪投诉路径）。
 await time(f,3*DAY,'complaint');
 assert.equal(rec(f).status,'已辞工');assert.ok(f.document.state.records[debt.id].defaulted.case);clean(f);
});

test('absence: a working day with no minute on the job is a recorded breach, not a silent skip',async()=>{
 const f=await hired();
 // 第1个工作日整天生病：没有任何到岗分钟。
 f.document.state.npcs[f.worker].status='患病';
 await time(f,f.row.nextWork-f.document.state.minute,'absent');
 assert.equal(rec(f).paid,0);assert.equal(rec(f).workedMinutes,0);
 assert.equal(rec(f).breaches.length,1);assert.deepEqual([rec(f).breaches[0].kind,rec(f).breaches[0].by,rec(f).breaches[0].day],['缺勤',f.worker,1]);
 clean(f);
});

test('low wage: the worker, by npcDecision, quits a signed wage the local derived wage has clearly outrun',async()=>{
 const f=await hired();
 const after=async(multiplier,base)=>{
  const g={engine:withWage(multiplier,base),document:structuredClone(f.document),row:f.row};
  await time(g,DAY,`drift-${multiplier}`,g.engine);
  return rec(g);
 };
 // 签约日薪30，跳槽门槛同为 ×1.2 = 36。行情×1.1 => 当地工价33，未明显偏低：照做。
 assert.equal(f.row.wage,30);assert.equal((await after(1.1)).status,'有效');
 // 行情×2 => 当地工价60 > 36：雇工自己决定辞工，留有来源，合同关闭，签下的工钱条款（30）不被改写。
 const left=await after(2);
 assert.equal(left.status,'已辞工');assert.equal(left.wage,30);
 assert.deepEqual([left.quit.by,left.quit.via,left.quit.outcome,left.quit.wage,left.quit.local],[f.worker,'npc-decision','agree',30,60]);
});

test('low wage: a red line against quitting is the worker own; no caller can quit for him',async()=>{
 const f=await hired();
 const w=structuredClone(world);w.npcs.find(n=>n.id===f.worker).redLines=['quit_job'];
 const g={engine:withWage(2,w),document:structuredClone(f.document),row:f.row};
 await time(g,DAY,'drift-red',g.engine);
 assert.equal(rec(g).status,'有效');
});

// ---- NPC 店主自治：进货、调价、用工都是店主自己的决定，钱从柜台出，可对账 ----
const DAY0=1440;
async function week(){
 // 前提（非考查对象）：几位店主终日营业；严辙的黏土、林穗的干粮货架空了；阿燕缺钱求活计，会做咸酪，林穗备好料具。
 const w=structuredClone(world),placeOf={npc_hw_linsui:'bld_hw_qingdeng',npc_hw_duanyan:'bld_hw_forge',npc_hw_yanzhe:'loc_bs'};
 for(const n of w.npcs.filter(n=>placeOf[n.id])){delete n.tier;n.schedule={default:[{start:0,end:1440,location:placeOf[n.id],activity:'营业',services:['trade']}]};}
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s504b-shops'),L=initial.state.npcs.npc_hw_linsui,Y=initial.state.npcs.npc_hw_yanzhe,A=initial.state.npcs.npc_hw_ayan;
 // W4 F026 起居民会在正午上门买货；本组考查店主自己的进货、调价、用工，其余居民设为无钱，没人上门买（上门客流另有 s5-w4-economy 测试）。
 const penniless=Object.keys(initial.state.npcs).filter(id=>!placeOf[id]&&id!=='npc_hw_ayan').map(id=>({path:['state','npcs',id,'coins'],value:0}));
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_qingdeng',abilitiesByActor:{npc_hw_ayan:{skills:{skill_life_3_core:300},recipes:['recipe_w3_salted_curd']}},facts:[...penniless,
  {path:['state','npcs','npc_hw_yanzhe'],value:{...Y,inventory:{...Y.inventory,item_clay:0}}},
  {path:['state','npcs','npc_hw_linsui'],value:{...L,inventory:{...L.inventory,item_ration:0,item_fresh_curd:{quantity:10},item_salt:{quantity:10},item_cooking_pot:{quantity:1,durability:100},item_kitchen_knife:{quantity:1,durability:100}}}},
  {path:['state','npcs','npc_hw_ayan'],value:{...A,coins:0,inventory:{item_cooking_pot:{quantity:1,durability:100},item_kitchen_knife:{quantity:1,durability:100}},goals:{short:[{id:'need-job',kind:'money',content:'需要工钱',progress:0}]}}}
 ]});
 assert.deepEqual(prepared.setupUnmet,[]);
 const f={engine,document:prepared.document,start:structuredClone(prepared.document)};
 for(let day=0;day<7;day++)await time(f,DAY0,`week-${day}`);
 return f;
}
const counterOf=(f,id)=>dedicatedCoinAccount(f.document.state,id,'counter');

test('npc shopkeepers: within a week each stocks up, reprices and hires by his own decision, paid from his counter',async()=>{
 const f=await week(),s0=f.start.state,s=f.document.state;
 // 进货：严辙的黏土route货，第1日午夜补2份。基价3×2=6参照价；该聚落次序下货款18（价格系数封顶3：3×6）。
 // W4 F010：外路来货另付挑夫运费 = route_hw_bs 24km × 计费重 max(2×1kg,1kg)=2kg × 0.02 = 0.96 → 1；无关卡，无关税。实付 18+1=19。
 const buy=s.records['shop:shop_bs_yanzhe'].entries.find(e=>e.item==='item_clay'&&e.day===1);
 assert.deepEqual([buy.added,buy.referenceCopper,buy.paidCopper],[2,6,19]);assert.deepEqual(buy.cost,{goods:18,freight:1,duties:0});
 // 钱从严辙的钱袋经他的柜台付出：钱袋200-19=181，柜台付清归0；货款18进河湾公库，运费1经 sink:export 离开模拟经济。
 assert.equal(s.npcs.npc_hw_yanzhe.coins,s0.npcs.npc_hw_yanzhe.coins-19);assert.equal(counterOf(f,'npc_hw_yanzhe').coins,0);
 assert.equal(s.npcs.npc_hw_yanzhe.inventory.item_clay.quantity,2);
 // 调价：实付是参照价的 19/6≈3.17 倍，按本行加成1.2成本加成≈3.8，被店铺加成上限1.4封顶（价格系数上限 shop [1,1.4]）。
 const pricing=s.records['shop_pricing:npc_hw_yanzhe'];
 // 世界价格既有有理数格式：1.2=1200000/1000000，1.4=1400000/1000000。
 // 倍率/成本/决定的原有数值断言保留，同时要求改价回执不把小数写入存档。
 assert.deepEqual([pricing.previous,pricing.markup,pricing.standard,pricing.basis.paidCopper,pricing.basis.referenceCopper,pricing.decision.outcome],[{numerator:1200000,denominator:1000000},{numerator:1400000,denominator:1000000},{numerator:1200000,denominator:1000000},19,6,'agree']);
 assert.equal(currentShops(f.engine,s).find(shop=>shop.keeper==='npc_hw_yanzhe').markup,1.4,'新有理数存档读回同一倍率');
 const legacyPricing=structuredClone(s);legacyPricing.records['shop_pricing:npc_hw_yanzhe'].markup=1.2;
 assert.equal(currentShops(f.engine,legacyPricing).find(shop=>shop.keeper==='npc_hw_yanzhe').markup,1.2,'旧数字倍率仍可读取');
 // 林穗的干粮：2份货款3（参照价6的一半）；W4 F010 外路另付运费 route_hw_bs 24km × 计费重 max(2×0.2kg,1kg)=1kg × 0.02 = 0.48 → 1，实付4。
 // 4/6×1 低于下限1，加成不变，没有调价记录。
 const ration=s.records['shop:shop_hw_qingdeng'].entries.find(e=>e.item==='item_ration'&&e.day===1);
 assert.deepEqual([ration.added,ration.referenceCopper,ration.paidCopper],[2,6,4]);assert.deepEqual(ration.cost,{goods:3,freight:1,duties:0});assert.equal(s.records['shop_pricing:npc_hw_linsui'],undefined);
 // 用工：阿燕应聘咸酪活计，日薪30；林穗先自己把30（=日薪×周期1日）从钱袋注入柜台，才有人可雇。
 const job=Object.values(s.records).find(r=>r.laborMarket===1&&r.owner==='npc_hw_linsui'&&r.worker==='npc_hw_ayan');
 assert.ok(job);assert.equal(job.wage,30);assert.equal(job.workerConsent.via,'npc-decision');
 // 首班工时：咸酪45分钟÷(1+300/3000)=40.9→41分钟；工钱 ceil(30×41/480)=3，出自柜台，不出自林穗钱袋。
 assert.equal(job.shifts[0].minutes,41);assert.equal(job.shifts[0].paid,3);
 // 柜台：注资30 -（第2日补货又付4，货架补到上限4后不再进货）-（首班工钱3）= 23。
 const later=s.records['shop:shop_hw_qingdeng'].entries.filter(e=>e.item==='item_ration'&&e.day>=2).reduce((n,e)=>n+e.paidCopper,0);
 assert.equal(job.paid,3);assert.equal(counterOf(f,'npc_hw_linsui').coins,30-later-job.paid);assert.equal(later,4);assert.equal(counterOf(f,'npc_hw_linsui').coins,23);
 // 林穗钱袋只出过第1日的进货款4与30注资（第2日进货款与工钱都从柜台走）：不含任何工钱。
 assert.equal(s.npcs.npc_hw_linsui.coins,s0.npcs.npc_hw_linsui.coins-4-30);
 clean(f);
});

// ---- 香火：寺观一天的香火 = 当天真实来访者各自决定的供奉之和 ----
test('incense: a temple day takes exactly what its real visitors decide to give',async()=>{
 const temple='temple:bld_bs_temple:deity_lintel',seat='bld_bs_temple',other='temple:bld_bs_reed_dao:deity_bank';
 const devout=['npc_hw_sulan','npc_hw_chenbai','npc_hw_xuling'],doubter='npc_hw_gucen',stranger='npc_hw_meiling',stayHome='npc_hw_luqing';
 // 前提（非考查对象）：几位完整人物上午在灯祠；谁信奉哪家由各人的信仰记录决定（灯祠信众三位，一位心存疑虑，一位信奉芦衡观，一位仍在家）。
 const w=structuredClone(world);
 for(const id of [...devout,doubter,stranger]){const n=w.npcs.find(x=>x.id===id);assert.ok(n,id);n.schedule={default:[{start:0,end:1440,location:seat,activity:'礼拜与听讲',services:[]}]};}
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s504b-incense');
 const faith=(id,temple,extra={})=>({path:['state','npcs',id],value:{...initial.state.npcs[id],coins:20,faith:{deity:'deity_lintel',institution:seat,temple,church:'门印证契堂',observedSince:null,lastBreach:-1,...extra},activity:'日常起居',status:'正常'}});
 const prepared=applyIntentSetup(engine,initial,{minute:600,facts:[...devout.map(id=>faith(id,temple)),faith(doubter,temple,{doubt:true,override:true}),faith(stranger,other,{deity:'deity_bank'}),faith(stayHome,temple)]});
 assert.deepEqual(prepared.setupUnmet,[]);
 for(const id of [...devout,doubter,stranger])prepared.document.state.npcs[id].location=seat;// 上午已在灯祠
 const f={engine,document:prepared.document},account=()=>groupAccountView(engine,f.document.state,temple),before=account().coins;
 await time(f,DAY,'incense-day');
 // 三位信众各按“寻常仪式”的一文（rules.faith.ordinaryRite.coins=1，faith:offering 缺省系数1）供奉：1×3=3；
 // 存疑者、他教者、未到场者一文不给。
 const rows=account().ledger.filter(r=>r.kind==='香火捐献'&&r.minute<DAY);
 assert.deepEqual(rows.map(r=>r.party).sort(),[...devout].sort());assert.ok(rows.every(r=>r.coins===1));
 assert.equal(account().coins-before,3);
 for(const id of devout)assert.equal(f.document.state.npcs[id].coins,19);
 for(const id of [doubter,stranger,stayHome])assert.equal(f.document.state.npcs[id].coins,20);
 // 同一人同一日只供奉一次：每人当日一条供奉记录。
 assert.equal(Object.keys(f.document.state.records).filter(k=>k.startsWith('faith_offering:')).length,3);
 clean(f);
});

// ---- 丝绸链：蚕种+桑叶 -> 蚕茧 -> 生丝 -> 素绸，全程是真实交易、真实赶路和真实制作 ----
test('silk chain: from bought eggs and leaf to a bolt of silk in the real world (content published through the approval pipeline)',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s504b-silk'),merchant='npc_hw_yanzhe';
 // 前提（非考查对象）：旅人在白石镇、手里有钱，会农事和裁缝手艺，带着陶锅、织架、尖梭和两份清水。
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:'loc_bs',coins:300,present:[merchant],
  inventory:{item_cooking_pot:1,item_loom:1,item_shuttle:1,item_water:2},abilitiesByActor:{player:{skills:{skill_life_0_core:200,skill_life_4_core:400}}}});
 assert.deepEqual(prepared.setupUnmet,[]);
 let doc=prepared.document;
 const run=async(tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});doc=applyPatches(doc,out.patches);return out.result;};
 const make=async(recipe)=>{
  // 手艺有档次：逐个事件编号试到出现“成功”档（与既有制造测试同法，档次由事件决定）。
  for(let i=0;i<60;i++){const out=await engine.reduce(doc,{tool:'world_craft',args:{recipe},eventId:`${recipe}-${i}`});if(out.result.degree==='成功'||out.result.degree==='大成功'){doc=applyPatches(doc,out.patches);return out.result;}}
  throw new Error(`未得到成功档：${recipe}`);
 };
 const have=item=>{const v=doc.state.inventory[item];return typeof v==='number'?v:v?.quantity??0;};
 const stock=item=>{const v=doc.state.npcs[merchant].inventory[item];return typeof v==='number'?v:v?.quantity??0;};
 // 1 买原料：严辙现货 4 张蚕种纸、16 束桑叶（经审批发布的一次性现货）。
 assert.equal([stock('item_silkworm_eggs'),stock('item_mulberry_leaf')].join(),'4,16');
 const coins=doc.state.player.coins,eggs=await run('world_trade',{seller:merchant,item:'item_silkworm_eggs',quantity:1},'buy-eggs'),leaf=await run('world_trade',{seller:merchant,item:'item_mulberry_leaf',quantity:5},'buy-leaf');
 assert.equal(doc.state.player.coins,coins-eggs.cost-leaf.cost);assert.equal([have('item_silkworm_eggs'),have('item_mulberry_leaf'),stock('item_silkworm_eggs'),stock('item_mulberry_leaf')].join(),'1,5,3,11');
 // 2 赶到桑坂村作业间喂蚕：1+8 -> 6 捧蚕茧。
 await run('world_move',{destination:'bld_sb_workroom',mode:'walk'},'to-workroom');assert.equal(doc.state.location,'bld_sb_workroom');
 await make('recipe_sb_rear_silkworms');
 assert.equal([have('item_silkworm_eggs'),have('item_mulberry_leaf'),have('item_silk_cocoon')].join(),'0,0,6');
 // 3 到河湾青灯酒馆灶上缫丝：6 捧茧 + 2 份水 -> 2 缕生丝（陶锅不耗）。
 await run('world_move',{destination:'bld_hw_qingdeng',mode:'walk'},'to-tavern');
 await make('recipe_sb_reel_silk');
 assert.equal([have('item_silk_cocoon'),have('item_water'),have('item_raw_silk'),have('item_cooking_pot')].join(),'0,0,2,1');
 // 4 到河湾织坊织架上织绸：2 缕生丝 -> 1 段素绸。
 await run('world_move',{destination:'bld_hw_weaving',mode:'walk'},'to-weaving');
 await make('recipe_sb_weave_silk');
 assert.equal([have('item_raw_silk'),have('item_silk_cloth')].join(),'0,1');
 // 账目：钱只付给严辙和织坊/灶台的工位费；全程对账无漂移。
 clean({engine,document:doc});
});
