// W8-A 价格调用迁移：原先直读目录基价当“现价”的调用点，改读估值角色（valuation.mjs 的 goods/property）。
// 口径：同一件东西在不同地点、不同供需下值不同。市场估值 = 区域基准价 × 稀缺系数 × 品质系数（不含商家价差）；
// 稀缺 = clamp(需求 / 供给, 0.5 ~ 3)，需求 = max(货架上限与储备之和, 1)，供给 = 本聚落同类货的可售存量（含货架）。
// 前提全部由真实动作或真实夹具产生（偷窃、过关、走私、办灯会、签远期合同）；预期值写明手算过程，不取引擎输出当预期。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {withAgricultureRules} from '../world/design/agriculture-foundation.mjs';
import {withLawRules} from '../world/design/law-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {valuation,goodsWorth} from '../server-plugin/valuation.mjs';
import {openGoodsObligation} from '../server-plugin/obligation-conditional.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,item as worldItem,scene,stack,monthDayMinute,primed} from './helpers/daily-b2.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const reader=document=>({document,get:(...p)=>p.reduce((x,k)=>x?.[k],document)});

// ---- 罚没/赔偿的案值：偷来的东西值多少，看案发地当时的市场，不是目录价 ----
test('偷窃案值按案发地市场估值：河湾村布匹供过于求，50 文基价的布案值 25（旧：50）',async()=>{
 // 夹具同 law.test：林穗在青灯坊持有 2 匹布；玩家当面扒 1 匹（世界动作 world_crime）。布的基价设为 50 以便手算。
 const w=withLawRules(structuredClone(world));
 for(const npc of w.npcs)if(['npc_hw_linsui','npc_hw_gucen','npc_hw_chenbai','npc_hw_hezhou'].includes(npc.id)){delete npc.schedule;delete npc.tier;}
 w.items.find(i=>i.id==='item_linen_cloth').basePrice=50;
 const engine=new WorldEngine(w);let document=engine.initialFromLegacy(seed,'w8a-theft');
 document.state.location='bld_hw_qingdeng';document.state.npcs.npc_hw_linsui.inventory.item_linen_cloth=2;
 // 手算：河湾村货架上布存 7 匹（另有林穗的 2 匹也计入可售存量），需求 = 货架上限之和 ≥ 1 的最小口径 1，
 //       稀缺 = clamp(1/≥7, 0.5, 3) = 0.5（下限）；品质 1；估值 = 50 × 0.5 = 25。
 let out;
 for(let i=0;i<500;i++){
  const attempt=await engine.reduce(document,{tool:'world_crime',args:{operation:'steal',target:'npc_hw_linsui',item:'item_linen_cloth'},eventId:`w8a_theft_${i}`});
  if(attempt.result.checkSuccess){out={...attempt,document:applyPatches(document,attempt.patches)};break;}
 }
 assert.ok(out,'找到一次成功的真实偷窃检定');
 const row=out.document.state.records[out.result.case];
 assert.equal(row.value,25,'案值 = 50 × 0.5 = 25，而不是目录价 50');
 assert.notEqual(row.value,w.items.find(i=>i.id==='item_linen_cloth').basePrice);
});

// ---- 税基：关税按入境地当前市场估值 ----
async function tariffTrip(t,{from,to}){
 // 同 daily-b2 D37：粗布 50 文、各政体关税 500 基点（5%）、聚落级别加成 0、免税额 0；路设守卫成关卡。
 const world=variant(w=>{
  const cloth=worldItem(w,'item_linen_cloth');cloth.basePrice=50;cloth.tags=[...cloth.tags,'trade_goods'];
  const tax=w.rules.economy.credit.taxes;tax.personalAllowance=0;for(const regime of Object.values(tax.regimes))regime.tariff=500;for(const k of Object.keys(tax.levelBps))tax.levelBps[k]=0;
  w.routes.find(r=>r.id==='route_hw_bs').guards=['npc_hw_gucen'];
 });
 const ui=await uiSession(t,{world,mutate:scene(from,monthDayMinute(9,22,9,0),s=>{s.player.coins=100;s.inventory.item_linen_cloth=stack(10,{weight:0.4});})});
 await primed(ui);
 const r=await ui.choose('move',{destination:to},{target:to});assert.ok(r.ok,r.error);
 const after=await ui.read();
 return Object.values(after.state.records).find(x=>x.category==='tariff_passage');
}
test('关税税基 = 入境地市场估值（货物自己不压低入境地价）：10 匹布过白石镇关卡税基 500，税 25；同一批布在河湾村只值 250',async t=>{
 // 白石镇（loc_bs）：本聚落没有布的可售存量，供给 0（运来的这批货不计入），需求 1 → 稀缺 = clamp(1/max(1,0)) = 1 → 10 × 50 × 1 = 500；
 // 税 = 500 × 5% = 25。（旧口径恒为 10 × 目录价 50 = 500，数值相同，但不再是“恒等于目录价”。）
 const trip=await tariffTrip(t,{from:'loc_hw',to:'loc_bs'});
 assert.equal(trip.value,500);assert.equal(trip.amount,25);
 // 对照：同样 10 匹布，若入境地是河湾村——货架布 7 匹、需求 1 → 稀缺 = clamp(1/7) = 0.5（下限）→ 10 × 50 × 0.5 = 250。
 const w=variant(x=>{worldItem(x,'item_linen_cloth').basePrice=50;});
 const engine=new WorldEngine(w),document=engine.createCharacter(seed,{},'w8a-tariff-base');
 document.state.location='loc_bs';document.state.inventory.item_linen_cloth=stack(10,{weight:0.4});
 const d=reader(document);
 assert.equal(goodsWorth(d,engine,{item:'item_linen_cloth',quantity:10,location:'loc_hw',holder:'player',apart:true}),250);
 assert.equal(goodsWorth(d,engine,{item:'item_linen_cloth',quantity:10,location:'loc_bs',holder:'player',apart:true}),500);
 // 不排除自带货时（持有人就在当地）：白石镇供给 10 → 稀缺 clamp(1/10)=0.5 → 250；这正是 apart 要避免的“货压低自己的税基”。
 assert.equal(goodsWorth(d,engine,{item:'item_linen_cloth',quantity:10,location:'loc_bs',holder:'player'}),250);
});

// ---- 走私货值 ----
async function seizure(extra={}){
 // 夹具同 verbs-extra 的走私：城门到码头设关卡，守卫廉洁（贿赂无效）；玩家带 3 份炽炎核心，装 2 份走私，过关被查获。
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 w.routes.push({id:'route_w8a_checkpoint',from:'loc_hw_gate',to:'loc_hw_dock',lengthKm:.1,speedKmh:5,modes:['walk'],closedSeasons:[],toll:1,risk:0});
 w.rules.smuggling.checkpoints.push({route:'route_w8a_checkpoint',location:'loc_hw_gate',guards:['npc_hw_gucen'],taxBps:1500});
 w.rules.law.polities[0].integrity.npc_hw_gucen=100;extra.edit?.(w);
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'w8a-smuggle');doc.state.minute=600;doc.state.player.coins=5000;doc.state.player.attributes.敏捷=1;
 for(const n of Object.values(doc.state.npcs))Object.assign(n,{location:'loc_capital',activity:'闲谈',status:'正常'});
 doc.state.location='loc_hw_gate';Object.assign(doc.state.npcs.npc_hw_gucen,{location:'loc_hw_gate',activity:'当值'});
 Object.assign(doc.state.npcs.npc_hw_linsui,{location:'loc_hw_dock',activity:'当值',coins:1000});
 doc.state.inventory.item_ember_core={quantity:3,quality:w.items.find(i=>i.id==='item_ember_core').quality,durability:100};
 const act=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
 const loaded=await act('world_trade',{operation:'smuggle',seller:'npc_hw_linsui',item:'item_ember_core',quantity:2,coins:500,location:'loc_hw_dock'},'load');
 await act('world_move',{destination:'loc_hw_dock'},'catch');
 return {engine,doc,shipment:doc.state.records[loaded.shipment]};
}
test('走私被查获的案值 = 查验地对这批货的市场估值',async()=>{
 const {engine,doc,shipment}=await seizure();
 assert.equal(shipment.status,'已查获');
 const incident=Object.values(doc.state.records).find(r=>r.category==='legal_case'&&r.offense==='smuggling');
 assert.ok(incident);
 // 手算：炽炎核心基价 12；河湾村同类材料货存量远超需求，稀缺取下限 0.5；2 份 = 2 × 12 × 0.5 = 12（旧：目录价 12 × 2 = 24）。
 assert.equal(engine.byId.get('item_ember_core').basePrice,12);
 assert.equal(incident.value,12);assert.notEqual(incident.value,12*2);
});

// ---- 节庆开销：主办人是否愿意办，看奖品按当地市场值多少钱 ----
test('NPC 主办灯会的成本里，奖品（一盏灯）按河湾村市场估值计，不是目录价',async()=>{
 // 世界规则修正（生产用的 derived 槽）：本地灯的市价翻倍（节庆前夕灯贵）。灯基价 6，河湾村灯的供需相当（稀缺 1）。
 const w={...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'w8a-lantern-dear',pack:'core',target:'economy:value',stage:'mul',value:2,when:"subject == 'item_lantern'"}]}};
 const engine=new WorldEngine(w),host='npc_hw_chenbai';
 const loaded=applyIntentSetup(engine,engine.createCharacter(seed,{},'w8a-festival'),{minute:1200,location:'bld_hw_council',present:[host],coins:38,inventory:{},
  itemInstances:[{id:'w8a_lantern',template:'thing',kind:'item',item:'item_lantern',owner:host,location:'bld_hw_council',carriedBy:host}],
  holdings:[{id:'w8a-venue-title',kind:'owns',holder:host,subject:'bld_hw_council',terms:{share:1}}]});
 assert.deepEqual(loaded.setupUnmet,[]);
 const slots={festival:'w8a_fest',name:'中秋灯会',coins:20,request:{kind:'ordinary',host,endsAt:1260,riddles:[{id:'w8a_riddle',question:'一口咬掉牛尾巴，打一字',answers:['告'],reward:{item:'item_lantern',quantity:1}}]}};
 const out=await engine.reduce(loaded.document,{tool:'world_act',args:{action:'core:settlement.festival_plan',slots},eventId:'w8a-plan'});
 const doc=applyPatches(loaded.document,out.patches);
 const row=Object.values(doc.state.records).find(r=>r.category==='festival');
 const cb=row.decision.trace.find(t=>t.stage==='cost_benefit').basis;
 // 手算：奖品市场估值 = 6 × 稀缺 1 × 修正 2 = 12；决策成本 = 钱 12 × moneyWeight 1 + 时长 60 分 ÷ timeDivisor 30 = 12 + 2 = 14。
 // 旧口径按目录价 6 算：6 + 2 = 8。
 assert.equal(goodsWorth(reader(loaded.document),engine,{item:'item_lantern',quantity:1,location:'bld_hw_council',holder:host}),12);
 assert.equal(cb.cost,14);
});

// ---- 无从估价：不回落到目录价冒充 ----
test('当地对这样东西没有估值基准时，粮仓如实拒绝出售（无从估价），不拿目录价顶替，钱粮不动',async()=>{
 // 世界副本：燕麦没有基准价（和 D37 一样在副本里改数据）；其余同 agriculture 测试。
 const w=withAgricultureRules(structuredClone(world));w.items.find(i=>i.id==='item_oats').basePrice=0;
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'w8a-unvaluable');
 doc.state.location='bld_hw_council';doc.state.minute=Math.floor(doc.state.minute/1440)*1440+540;
 Object.assign(doc.state.npcs.npc_hw_chenbai,{location:'bld_hw_council',status:'正常',activity:'办公'});
 const before=structuredClone(doc);
 assert.equal(valuation(reader(doc),engine,{role:'goods',item:'item_oats',quantity:2,location:'loc_hw'}).unvaluable,'没有估值基准');
 await assert.rejects(engine.reduce(doc,{tool:'world_farm',args:{operation:'buy',quantity:2},eventId:'buy-unvaluable'}),/无从估价/);
 assert.deepEqual(doc,before,'被拒的购买不改存档');
});

// ---- 已签合同价冻结 ----
test('已签远期合同的价款冻结：市场此后变化，旧合同不变，新签合同和估值按新市场',async()=>{
 const seller='npc_hw_duanyan',item='item_steel_arming_sword',location='bld_hw_forge';
 const engine=new WorldEngine(world);
 const prepared=applyIntentSetup(engine,engine.createCharacter(seed,{},'w8a-frozen'),{minute:600,location,coins:100000,facts:[
  {path:['state','npcs',seller,'location'],value:location},{path:['state','npcs',seller,'inventory',item],value:100}]});
 assert.deepEqual(prepared.setupUnmet,[]);
 let document=withLedger(engine,prepared.document).document;
 const mutate=fn=>{const d=engine.primitiveDraft(document),r=fn(d);document=applyPatches(document,d.patches);return r;};
 // 手算（同 s5-08）：钢剑基价 230，铁匠铺货存 100、货架需求 2，稀缺 = clamp(2/100) = 0.5 → 单价 115，10 把 = 1150。
 const sign=id=>mutate(d=>openGoodsObligation(d,engine,{id,kind:'forward',debtor:seller,creditor:'player',item,quantity:10,prepayment:1150,deadline:2000,location},`sign:${id}`));
 sign('old');
 assert.equal(document.state.obligations.old.terms.forward.consideration,1150);
 // 市场变了：铁匠铺存货只剩 1 把。已签的 10 把算已承诺，需求 = max(货架 2, 已承诺 10) = 10；
 // 可售供给 max(0, 1 − 10) = 0，分母取 1；稀缺 = clamp(10/1) = 3（上限）→ 单价 230 × 3 = 690，10 把 = 6900。
 const ledgerlessStock=document.state.npcs[seller].inventory[item];
 document=applyIntentSetup(engine,document,{facts:[{path:['state','npcs',seller,'inventory',item],value:typeof ledgerlessStock==='object'?{...ledgerlessStock,quantity:1}:1}]}).document;
 assert.equal(document.state.obligations.old.terms.forward.consideration,1150,'已签合同价款不随市场变');
 const now=goodsWorth(reader(document),engine,{item,quantity:10,location,holder:seller});
 assert.equal(now,6900,'同一批货按新市场估值');assert.notEqual(now,document.state.obligations.old.terms.forward.consideration);
});
