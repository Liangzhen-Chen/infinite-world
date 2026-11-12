// MKTW：市场整类去除手写倍数后的源头机制测试。期望一律按规则手推，推导写在各断言上方，不用被测函数算期望。
// 范围：可食物资并池、需求口径（买下一件货后需求不变）、hazard_phase 按阶段名、非农事聚落粮价因子并入市场、被测代码无按聚落/季节/物品 id 的分支。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {documentReader} from '../server-plugin/read-scope.mjs';
import {householdResources,householdDailyUse} from '../server-plugin/household-budget.mjs';
import {personBusinesses,placeSettlement,personHousehold} from '../server-plugin/entity-view.mjs';
import {marketSupply,goodsClass,goodsWeight,foodSatiety,upkeepDemand} from '../server-plugin/market.mjs';
import {isItemClass} from '../server-plugin/item-class.mjs';
import {stageReached,conditionMet} from '../server-plugin/seasonal-hazards.mjs';
import {forestWaterPriceFactor} from '../server-plugin/forest-water.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {recordCraft} from '../server-plugin/craft-record.mjs';
import {WORK_RULES} from '../server-plugin/works.mjs';
import {craftUseWindowDays,agricultureReserveDays,selfSupplyDays} from '../server-plugin/supply-interval.mjs';
import {shortThresholdDays} from '../server-plugin/food-stock.mjs';
import {handSelfReserve,handSeasonYield,handReserveDays} from './helpers/hand-targets.mjs';
import {seasonYieldFactors} from '../server-plugin/crop-yield.mjs';
import {weatherAt,cropProduction} from '../server-plugin/weather.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';
import {unfoldRemoteAt,remoteEngine} from '../server-plugin/remote-generation.mjs';import {mealMouthsOf} from '../server-plugin/primitives-body.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const quantity=v=>typeof v==='number'?v:v?.quantity??0;
function setup(seed='market-food-pool'){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(w);return {engine,doc:engine.createCharacter(legacy,{},seed)};
}

test('可食物资并池：自身有饱腹的货与可经配方加工成可食品的原料同属一池，权重按饱腹，不可食的货不入池',()=>{
 const {engine}=setup(),by=id=>engine.byId.get(id);
 const pool='goods:food';
 // 推导：面包、干粮、燕麦薄饼自身 nutrition.satiety>0 → 并池规则（satiety>0 一律同池）→ 同属 goods:food，权重 = 各自 satiety。
 for(const id of ['item_bread','item_ration','item_oat_flatbread']){
  assert.ok(by(id).nutrition.satiety>0,`${id} 自身应有饱腹`);
  assert.equal(goodsClass(engine,id),pool,id);assert.equal(goodsWeight(engine,id),by(id).nutrition.satiety,id);
 }
 // 推导：带壳燕麦是生料，没有 nutrition.satiety，但配方 recipe_w3_toasted_oats（燕麦 1 + 木刨花 1 → 锅焙燕麦粒 1）使它能加工成可食品。
 // 刨花不是食物（无 nutrientContent），所以该配方里燕麦是唯一供能成分，份额 = 1，产出比 1:1 → 经此配方的当量 = 锅焙燕麦粒自身的 satiety。
 // 多条去路取最小，故燕麦当量 ≤ 锅焙燕麦粒的 satiety，且 > 0。
 assert.ok(!(by('item_oats').nutrition?.satiety>0),'燕麦自身没有饱腹，不得手填');
 assert.ok(by('item_toasted_oats').nutrition?.satiety>0,'配方链数据：锅焙燕麦粒应有派生饱腹');
 assert.equal(goodsClass(engine,'item_oats'),pool);
 assert.ok(goodsWeight(engine,'item_oats')>0&&goodsWeight(engine,'item_oats')<=by('item_toasted_oats').nutrition.satiety);
 assert.equal(foodSatiety(engine,'item_oats'),goodsWeight(engine,'item_oats'));
 // 推导：铁、水没有饱腹、也没有可食去路 → 不进可食池，权重按件（1）。
 for(const id of ['item_iron','item_water']){assert.notEqual(goodsClass(engine,id),pool,id);assert.equal(goodsWeight(engine,id),1,id);}
});

test('不可食但带 food 标签的货不进可食池，可食池的供需计量不受它影响',()=>{
 const {engine,doc}=setup(),read=documentReader(doc),inn='bld_hw_qingdeng',pool='goods:food';
 // 推导：item_salt 原始标签 mineral、food；加载期由机制标注（world/meta/mechanics/items.json:14-18，经 runtime-world.mjs materializeRuntimeWorld，engine.mjs:251 调用）并入 salt 标签。
 // 没有饱腹，也无配方可加工成可食品（盐不供能）→ 不可食 → 不进 goods:food。
 // 退类规则依次：自身其他 goods: 标签（无）→ goodsTags 表中非 food 的映射 → 物品 id。盐带 salt 标签，goodsTags 表（world/rules/tables/market.json:51）把 salt 映射到 salt，
 // 所以退到第二步，类 = goods:salt（不是退到物品 id）；权重按件 1。
 assert.ok(engine.byId.get('item_salt').tags.includes('food'));
 assert.ok(engine.byId.get('item_salt').tags.includes('salt'),'加载期机制标注给盐加了 salt 标签');
 assert.ok(!engine.byId.get('item_salt').tags.some(t=>t.startsWith('goods:')),'没有自带 goods: 标签，所以走表映射这一步');
 assert.ok(!(engine.byId.get('item_salt').nutrition?.satiety>0));
 assert.equal(engine.world.marketRules.goodsTags.salt,'salt');
 assert.equal(goodsClass(engine,'item_salt'),'goods:salt');assert.equal(goodsWeight(engine,'item_salt'),1);
 // 池内的货都可食；因此可食池的供需只含饱腹单位，盐的库存与持有不会进来：面包报价的 rows 里没有盐。
 const s=marketSupply(read,engine,'item_bread',inn);
 assert.equal(s.goods,pool);assert.ok(s.rows.every(r=>r.item!=='item_salt'));
});

test('同一可食池内，公仓粮与干粮读同一份供需：各食物报价看到同一个池',()=>{
 const {engine,doc}=setup(),read=documentReader(doc),inn='bld_hw_qingdeng';
 // 推导：并池后 stockSupply 的供需用报价货的件数表达 = 池内饱腹总量 ÷ 该货权重。同一池、同一地点，
 // 不同食物报价的供需比 = 池内（需求饱腹 ÷ 供给饱腹）相同。供给为 0 时 demand/max(1,supply) 随件数换算而不同，故只比 supply>0 的情形。
 const a=marketSupply(read,engine,'item_bread',inn),b=marketSupply(read,engine,'item_ration',inn);
 assert.equal(a.goods,b.goods);
 const wa=goodsWeight(engine,'item_bread'),wb=goodsWeight(engine,'item_ration');
 // 饱腹总量 = 件数 × 权重；两种件数表达换回饱腹单位应相等（容差 1e-9 相对）。
 const close=(x,y)=>Math.abs(x-y)<=1e-9*Math.max(Math.abs(x),Math.abs(y),1);
 assert.ok(close(a.supply*wa,b.supply*wb),'供给按饱腹折算后应相同');
 // 需求有 max(…,1) 的下限（件数），只在下限未起作用时比较。
 if(a.demand>1&&b.demand>1)assert.ok(close(a.demand*wa,b.demand*wb),'需求按饱腹折算后应相同');
});

// 待重推：此用例的前提（需求含目标留存与缺口）已随持有口径作废——私户持有与缺口不再进供需；断言仍成立（供需都不变），保留不改值。
test('需求 = 目标留存 + 缺口 + 承诺：非经营者买下一件货后，留存 +1、缺口 −1，需求不变，供给也不变',()=>{
 const {engine,doc}=setup(),read=document=>documentReader(document),inn='bld_hw_qingdeng',bread='item_bread',w0=goodsWeight(engine,bread),state=doc.state;
 const owners=new Set();
 for(const store of engine.rules.economy?.shops?.stores??[])owners.add(store.keeper);
 for(const npc of engine.world.npcs)if(npc.shopType||(npc.services??[]).includes('trade'))owners.add(npc.id);
 for(const [id,business]of personBusinesses(engine,state))if(business?.open.value&&business.shopType.value)owners.add(id);
 // 取聚落里一位非经营者：他是自己户里编号最小的成员（缺口记在他名下），没有面包，且饱腹缺口大于两件面包（保证买一件后缺口只是减少、不触底）。
 const pick=Object.keys(state.npcs).find(id=>{
  if(owners.has(id)||placeSettlement(engine,state,state.npcs[id].location).value!=='loc_hw'||quantity(state.npcs[id].inventory?.[bread])>0)return false;
  const b=householdResources(read(doc),engine,id);
  return b.members?.length&&[...b.members].sort()[0]===id&&b.procurementShortfall.satiety>2*w0;
 });
 assert.ok(pick,'聚落里需要一位有未满足饱腹缺口的非经营者');
 // 给这位非经营者多一件面包：直接改他的行囊（facts 路径不认还不存在的 inventory 键），账本按该状态重开。
 const given={document:structuredClone(doc),setupUnmet:[]};given.document.state.npcs[pick].inventory={...given.document.state.npcs[pick].inventory,[bread]:1};given.document.ledger=openLedger(engine,given.document);
 const before=householdResources(read(doc),engine,pick),after=householdResources(read(given.document),engine,pick);
 // 推导（前提）：多持一件面包，该户先按需要吃掉它，留存 1 件；缺口减少恰好一件面包的饱腹 w0。
 const row=after.rows.find(r=>r.holder===pick&&r.item===bread);
 assert.equal(row.retained,1);
 assert.ok(Math.abs((before.procurementShortfall.satiety-after.procurementShortfall.satiety)-w0)<=1e-9*w0);
 // 推导（结论）：需求中此人的份额 = 留存×权重 + 缺口：之前 0×w0 + S，之后 1×w0 + (S−w0) = S，不变。
 // 非经营者的持有不进供给（私人行囊不是市场存量），所以供给也不变；价格不会因买家多持一件而涨。
 const a=marketSupply(read(doc),engine,bread,inn),b=marketSupply(read(given.document),engine,bread,inn);
 assert.equal(b.supply,a.supply);
 assert.ok(Math.abs(b.demand-a.demand)<=1e-9*a.demand,`需求应不变：${a.demand} → ${b.demand}`);
});

test('hazard_phase 按阶段名：已触发阶段才成立，位置顺序无关；不存在的阶段名与旧的序数写法都被规则校验拒绝',()=>{
 const {engine}=setup(),rule=engine.rules.hazardClock.clocks.find(r=>r.id==='famine:loc_bs');
 // 推导：famine:loc_bs 只有一个阶段 famine（tight 已整段删除）。有状态钟的阶段已触发 = 本年历史里有该阶段名且已应用。
 assert.deepEqual(rule.stages.map(s=>s.id),['famine']);
 const at=100*1440,records=history=>({get:(...p)=>p.reduce((v,k)=>v?.[k],{state:{minute:at,records:{'hazard-clock:famine:loc_bs':{year:1,history}}},randomSeed:'s'})});
 assert.equal(stageReached(records([{stage:'famine',applied:true}]),engine,rule,'famine',at),true);
 assert.equal(stageReached(records([{stage:'famine',applied:false}]),engine,rule,'famine',at),false,'被拒绝的阶段不算已触发');
 assert.equal(stageReached(records([]),engine,rule,'famine',at),false);
 assert.equal(stageReached(records([{stage:'famine',applied:true}]),engine,rule,'tight',at),false,'不存在的阶段名永远不成立，不会错位命中别的阶段');
 // 年份不同（记录属上一年）也不成立：阶段重置按年。
 const lastYear={get:(...p)=>p.reduce((v,k)=>v?.[k],{state:{minute:at+360*1440,records:{'hazard-clock:famine:loc_bs':{year:1,history:[{stage:'famine',applied:true}]}}},randomSeed:'s'})};
 assert.equal(stageReached(lastYear,engine,rule,'famine',at+360*1440),false);
 // 数据里每处 hazard_phase 都用阶段名，且指向的阶段存在。
 const ids=new Map(engine.rules.hazardClock.clocks.map(r=>[r.id,new Set(r.stages.map(s=>s.id))]));
 const refs=[];const walk=c=>{if(c.kind==='all')c.conditions.forEach(walk);else if(c.kind==='hazard_phase')refs.push(c);};
 for(const r of engine.rules.hazardClock.clocks)for(const s of r.stages)walk(s.condition);
 assert.equal(refs.length,9);
 for(const c of refs){assert.equal(c.minimum,undefined);assert.ok(ids.get(c.clock).has(c.stage),`${c.clock}:${c.stage}`);}
});

test('非农事聚落的公仓粮缺口已并入市场：林水因子不再对粮食起作用，任何聚落的燕麦与面包都是 1',()=>{
 const {engine,doc}=setup();
 // 推导：forestWaterPriceFactor 只对水（item_water）与木料给因子，其余物品一律 1；原燕麦缺口分支已删。
 for(const sid of Object.keys(doc.state.settlements))for(const item of ['item_oats','item_bread','item_ration'])assert.equal(forestWaterPriceFactor(engine,doc.state,item,sid),1,`${sid}/${item}`);
});

test('被测代码无新增按聚落、季节、物品 id 的分支（R5④ 扫描）',async()=>{
 const strip=text=>text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`])\/\/.*$/gm,'$1');
 const market=strip(await fs.readFile('server-plugin/market.mjs','utf8'));
 // market.mjs 不含任何物品、聚落、建筑、人物 id 字面量。
 assert.deepEqual(market.match(/['"`](loc_|item_|bld_|npc_)[a-z0-9_]*/g)??[],[]);
 const trade=await fs.readFile('server-plugin/settlement-trade.mjs','utf8');
 const base=strip(trade.slice(trade.indexOf('export function regionalTradeBase'),trade.indexOf('function spareWorkers')));
 assert.equal(/season|calendar\(/i.test(base),false,'区域基准价不读季节');
 assert.equal(/seasonFactors/.test(strip(trade)),false,'周贸易规则不再有手写季节系数');
 const rules=JSON.parse(await fs.readFile('world/meta/rules.json','utf8'));
 assert.equal(rules.settlementTrade.seasonFactors,undefined);
 // 本卡范围内的手写价格倍数已删：冬荒钟（全部）与砾泉旱情钟里没有 price_shift。
 for(const r of rules.hazardClock.clocks.filter(r=>r.kind==='famine'||r.id==='price:loc_bs_liquan'))for(const s of r.stages)assert.equal(s.effects.some(e=>e.kind==='price_shift'),false,`${r.id}:${s.id}`);
});

// 粮仓覆盖率夹具：只留 loc_hw 一个聚落，居民背包清空（卖方存货为 0），粮仓存粮 S、人口 p 可调；账本按该状态重开。
function granaryFixture({food,population}){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'market-food-pool-coverage');
 // 粮仓读账户的 grain 批次（market 读 priceRead region.grain，只认 kind=grain 的未过期批次）：保留托管农事记录，只把粮仓批次换成一批 food。
 const farm=doc.state.records['agriculture:loc_hw'];farm.batches=food?[{id:'probe_stock',kind:'grain',amount:food,harvestDay:-30,expiresDay:400,source:'test'}]:[];if(farm.ledger)farm.ledger.openingFood=food;
 for(const n of Object.values(doc.state.npcs))n.inventory={};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population,granary:true,food,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(engine,doc);
 return {engine,doc};
}

test('稀缺度 = 目标持有 ÷ 实际持有，随覆盖率连续单调',()=>{
 const inn='bld_hw_qingdeng',oats='item_oats',population=30;
 // 推导：覆盖率 c = 粮仓实际持有 ÷ 粮仓目标持有。农事聚落目标 = 餐口 × (距下次收获天数 + reserveDays)；
 // 收获日 = crop.sowDays[1] + crop.growthDays（年内第几日），一年 360 日，距下次收获 = (收获日 − 年内当日) mod 360。
 // 人口固定 30（餐口 30；目标远小于粮仓容量 − 种粮，容量限制不起作用），目标 T = 30 × (距收获 + reserveDays)；存粮取 c × T：c=1.5、1.0、0.5、0.2、0 各一点（c=0 存粮 0）。
 // 居民背包全清空，卖方存货为 0，所以 实际持有 = 存粮；需求 = T + K，K = 货架目标 + 合同承诺，与覆盖率无关（各点 demand−T 应相等）。
 // 稀缺度 = 夹取(需求 ÷ max(1, 供给)，priceFactorLimits.region)：
 //   c=1.5 → (T+K)/(1.5T) ≈ 0.667；c=1.0 → (T+K)/T ≈ 1；c=0.5 → (T+K)/(0.5T) ≈ 2；c=0.2 → (T+K)/(0.2T) ≈ 5 → 顶 3；c=0 → 供给 0，分母取 1，→ 顶 3。
 // 夹取上限取规则 limits[1]（=3）；下方断言按各点推得的比值再夹取，不读被测函数的稀缺度。
 const crop0=world.rules.agriculture.crop,reserve0=world.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw').reserveDays;
 const minute0=granaryFixture({food:0,population}).doc.state.minute;
 const T=population*((((crop0.sowDays[1]+crop0.growthDays-Math.floor(minute0/1440)%360)%360)+360)%360+reserve0);
 const points=[[1.5,Math.round(1.5*T)],[1.0,Math.round(T)],[0.5,Math.round(0.5*T)],[0.2,Math.round(0.2*T)],[0,0]];
 const result=points.map(([c,food])=>{
  const {engine,doc}=granaryFixture({food,population}),limits=engine.rules.economy.priceFactorLimits.region;
  const mouths=mealMouthsOf(engine,doc.state,'loc_hw',population);
  const target=Math.ceil(mouths*(((crop0.sowDays[1]+crop0.growthDays-Math.floor(doc.state.minute/1440)%360)%360+360)%360+reserve0)),s=marketSupply(documentReader(doc),engine,oats,inn);
  assert.equal(s.spotSupply,food,`c=${c} 实际持有 = 粮仓全部库存（不先扣储备）`);
  return {c,limits,target,supply:s.spotSupply,demand:s.demand,K:s.demand-target};
 });
 // 目标与覆盖率的关系：存粮 ÷ 目标 = c（取整误差内）。
 for(const [i,r] of result.slice(0,4).entries())assert.ok(Math.abs(points[i][1]/r.target-r.c)<=1e-6,`覆盖率 ${r.c}`);
 // K 与覆盖率无关：五点相同。
 for(const r of result)assert.ok(Math.abs(r.K-result[0].K)<=1e-9*Math.max(1,r.target),`K 常数 ${r.c}`);
 assert.ok(result[0].K>=0);
 const scarcity=r=>Math.min(r.limits[1],Math.max(r.limits[0],r.demand/Math.max(1,r.supply)));
 const K=result[0].K,expected=[(T+K)/points[0][1],(T+K)/points[1][1],(T+K)/points[2][1],Math.min(3,(T+K)/points[3][1]),3];
 result.forEach((r,i)=>assert.ok(Math.abs(scarcity(r)-Math.min(r.limits[1],expected[i]))<=1e-9,`c=${r.c} 稀缺度`));
 // 连续单调：覆盖率越低稀缺度越高；恰在目标时（c=1，K 相对 27000 极小）约为 1，c=1.5 约 0.67，c=0.5 约 2，c≤0.33 顶 3。
 const values=result.map(scarcity);
 for(let i=1;i<values.length;i++)assert.ok(values[i]>=values[i-1],`单调 ${i}`);
 assert.ok(values[0]<values[1]&&values[1]<values[2]&&values[2]<values[3],'中间点严格递增，没有二值悬崖');
 assert.equal(values[3],result[3].limits[1]);assert.equal(values[4],result[4].limits[1]);
 // 0 供给时不除零：分母取 1，结果有限且被上限夹住。
 assert.ok(Number.isFinite(values[4]));
});

test('农事聚落目标持有随季节：收获后撑到下次收获，收获前只剩结转储备；开局存粮 = 开局日目标，开局 cov = 1',()=>{
 // 推导：目标 = 餐口 × (距下次收获天数 + reserveDays)；收获日 H = crop.sowDays[1] + crop.growthDays（年内日），距下次收获 = (H − 年内当日) mod 360。
 // 取收获后一日（年内 H+1 日 → 距 359 天）与收获前 30 日（年内 H−30 日 → 距 30 天）；人口 30 → 目标 = 30 × (359 + R) 与 30 × (30 + R)，R = reserveDays（均小于容量 − 种粮）。
 const {engine}=setup('market-food-pool-farm'),crop=engine.rules.agriculture.crop,H=crop.sowDays[1]+crop.growthDays,R=engine.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw').reserveDays;
 const targetAt=day=>{
  const f=granaryFixture({food:1000,population:30});f.doc.state.minute=day*1440;
  return marketSupply(documentReader(f.doc),f.engine,'item_oats','bld_hw_qingdeng').rows.find(r=>r.owner==='loc_hw').target;
 };
 assert.equal(targetAt(360+H+1),30*(359+R));
 assert.equal(targetAt(360+H-30),30*(30+R));
 // 容量限制：目标 = min(餐口 × 目标日数, 粮仓容量 − 种粮)。人口 1000 的 loc_hw：餐口 × 目标日数远超容量，目标 = granaryCapacity − initialSeed。
 const hw=engine.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw'),big=granaryFixture({food:1000,population:1000});
 assert.equal(marketSupply(documentReader(big.doc),big.engine,'item_oats','bld_hw_qingdeng').rows.find(r=>r.owner==='loc_hw').target,hw.granaryCapacity-hw.initialSeed);
 // 开局：每个农事聚落开账存粮 = min(ceil(餐口 × (距收获 + R)), 容量 − 种粮)（第 0 日），粮仓行存量恰等于目标（cov = 1）；容量受限的聚落同样 cov = 1。
 const {doc}=setup('market-food-pool-farm-open');
 for(const p of engine.rules.agriculture.settlements){
  const s=doc.state.settlements[p.settlement];if(!s)continue;
  const expected=Math.min(Math.ceil(mealMouthsOf(engine,doc.state,p.settlement,s.population)*((H%360)+p.reserveDays)),p.granaryCapacity-p.initialSeed);
  assert.equal(s.food,expected,p.settlement);
  const row=marketSupply(documentReader(doc),engine,'item_oats',p.settlement).rows.find(r=>r.owner===p.settlement);
  assert.ok(row,p.settlement);assert.equal(row.target,expected);assert.equal(row.stock,expected);
 }
});

test('冬荒钟阈值 = 系数 × 自己的储备视野：远方非农事聚落常态不触发、池跌到补给间隔一半以下才触发；农事村仍是 45 天',()=>{
 // 推导：系数 = 规则阈值天数 ÷ reserveDays = 45 ÷ 90 = 0.5；远方生成聚落是统计产粮的自产粮聚落，储备视野 = 补给间隔 H = 季节储备（handSelfReserve，当前季起一年内最大累计亏空天数，不低于交易周期），阈值 = 0.5 × H；
 // 开局存粮 = ceil(餐口 × H)，所以常态池持有天数 ≈ H ≥ 0.5 × H → 不触发；居民背包清空、公仓降到开局存粮的 40% 后天数 ≈ 0.4 × H < 0.5 × H → 触发（进入 famine 阶段）。
 // 农事村 loc_hw：储备视野 = 自己的 reserveDays = 90，阈值 = 45 ÷ 90 × 90 = 45 天，与此前一致。
 const {engine,doc}=setup('market-food-pool-famine-threshold'),d=engine.primitiveDraft(doc),cond={kind:'granary_short',days:45};
 assert.ok(unfoldRemoteAt(d,engine,'loc_far_duanqi'));
 const overlay=remoteEngine(engine,d.document,w=>new WorldEngine(w)),state=d.get('state');
 const sid=Object.values(state.remote).flatMap(r=>r.skeleton.settlements.map(s=>s.id))[0];
 assert.ok(state.settlements[sid].foodPerDay>0);assert.ok(!overlay.rules.agriculture.settlements.some(p=>p.settlement===sid),'前置：统计产粮、不在农事表');
 const H=handSelfReserve(overlay,state.minute,state.settlements[sid].foodPerDay,state.settlements[sid].population,sid),check=document=>{const dd=overlay.primitiveDraft(document);return conditionMet(dd,overlay,{settlement:sid},cond,dd.get('state','minute'));};
 const normal=check(d.document);
 assert.ok(Math.abs(normal.threshold-0.5*H)<=1e-9*H);assert.equal(normal.met,false);
 const low=structuredClone(d.document);
 for(const n of Object.values(low.state.npcs))n.inventory={};
 low.state.settlements[sid].food=Math.floor(0.4*state.settlements[sid].food);low.ledger=openLedger(overlay,low);
 const dropped=check(low);
 assert.ok(Math.abs(dropped.threshold-0.5*H)<=1e-9*H);assert.equal(dropped.met,true);assert.ok(dropped.value<0.5*H);
 const farm=granaryFixture({food:1000,population:30}),fd=farm.engine.primitiveDraft(farm.doc);
 assert.equal(conditionMet(fd,farm.engine,{settlement:'loc_hw'},cond,fd.get('state','minute')).threshold,45);
});

test('冬荒钟 granary_short 按可食池走：公仓空但池里有存粮不触发；池里也不足才触发',()=>{
 // 推导：存粮可撑天数 = 池实际持有 ÷ 餐口；人口 30 → 餐口 30（mealMouthsOf），阈值 days = 45（规则里的 granary_short 天数）→ 阈值 1350 份。
 // a) 公仓 0、经营者（客栈掌柜）手里 2000 燕麦：池 2000 ÷ 30 ≈ 66.7 天 ≥ 45 → 不触发（只看公仓会得 0 < 45 → 触发）；
 // b) 公仓 1000、掌柜 0：池 1000 ÷ 30 ≈ 33.3 天 < 45 → 触发；c) 公仓 3000、掌柜 0：池 100 天 → 不触发（公仓满，池也满）。
 // （"公仓满但池空"在口径上不可能：池 = 公仓 + 卖方存货，公仓满则池不空。）
 const make=(food,keeperOats)=>{
  const f=granaryFixture({food,population:30});
  if(keeperOats){f.doc.state.npcs.npc_hw_linsui.inventory={item_oats:keeperOats};f.doc.ledger=openLedger(f.engine,f.doc);}
  const d=f.engine.primitiveDraft(f.doc),mouths=mealMouthsOf(f.engine,f.doc.state,'loc_hw',30);
  const r=conditionMet(d,f.engine,{settlement:'loc_hw'},{kind:'granary_short',days:45},d.get('state','minute'));
  return {r,mouths};
 };
 const a=make(0,2000),b=make(1000,0),c=make(3000,0);
 assert.equal(a.r.met,false);assert.ok(Math.abs(a.r.value-2000/a.mouths)<=1e-9);
 assert.equal(b.r.met,true);assert.ok(Math.abs(b.r.value-1000/b.mouths)<=1e-9);
 assert.equal(c.r.met,false);assert.ok(Math.abs(c.r.value-3000/c.mouths)<=1e-9);
});

test('I12：最便宜品种的选取不读私户背包，居民背包里有什么都不改变户用缺口补买的品种',()=>{
 // 推导：cheapestOfClass 只读货架与目录（有货架取货架上最便宜的，没有取目录里同类最便宜的），所以户里缺燃料 3 天时，各燃料品种的 upkeepDemand
 // 在"居民背包空"与"每位居民背包里都有每种燃料 5 件"两种状态下逐品种相同；且至少有一个品种 > 0（选中了最便宜的那种）。
 const {engine,doc}=setup('market-food-pool-cheapest'),state=doc.state,fuel=engine.world.items.filter(i=>isItemClass(engine,i.id,'fuel')).map(i=>i.id);
 assert.ok(fuel.length>1,'燃料类至少两种，选取才有意义');
 const id=Object.keys(state.npcs).find(n=>{
  if(placeSettlement(engine,state,state.npcs[n].location).value!=='loc_hw')return false;
  const h=personHousehold(engine,state,n).value,ms=(h?.members??[n]).filter(m=>state.npcs?.[m]).sort();return ms[0]===n;
 });
 assert.ok(id);
 const h=personHousehold(engine,state,id).value;state.family={...state.family,upkeep:{...state.family?.upkeep,[h?.id??id]:{fuelShortDays:3}}};
 for(const n of Object.values(state.npcs))n.inventory={};
 const demand=s=>fuel.map(i=>upkeepDemand(s,engine,id,i)),before=demand(state);
 assert.ok(before.some(n=>n>0));
 const other=structuredClone(state);for(const n of Object.values(other.npcs))n.inventory=Object.fromEntries(fuel.map(i=>[i,5]));
 assert.deepEqual(demand(other),before);
});

test('私户背包变化不影响报价（I12）：非经营者多持多少货，供给与需求都不变',()=>{
 const {engine,doc}=setup(),inn='bld_hw_qingdeng',state=doc.state,owners=new Set();
 for(const store of engine.rules.economy?.shops?.stores??[])owners.add(store.keeper);
 for(const npc of engine.world.npcs)if(npc.shopType||(npc.services??[]).includes('trade'))owners.add(npc.id);
 for(const [id,business]of personBusinesses(engine,state))if(business?.open.value&&business.shopType.value)owners.add(id);
 const pick=Object.keys(state.npcs).find(id=>!owners.has(id)&&placeSettlement(engine,state,state.npcs[id].location).value==='loc_hw');
 assert.ok(pick,'聚落里需要一位非经营者');
 // 推导：非经营者的背包不是定价方知道的量（I12），实际持有、目标留存、缺口都不进供需；给他 500 件燕麦与 500 件面包，报价的供给、需求恒等。
 const given={document:structuredClone(doc),setupUnmet:[]};given.document.state.npcs[pick].inventory={...given.document.state.npcs[pick].inventory,item_oats:500,item_bread:500};given.document.ledger=openLedger(engine,given.document);
 for(const item of ['item_oats','item_bread']){
  const a=marketSupply(documentReader(doc),engine,item,inn),b=marketSupply(documentReader(given.document),engine,item,inn);
  assert.equal(b.supply,a.supply,item);assert.equal(b.demand,a.demand,item);assert.deepEqual(b.rows,a.rows,item);
 }
});

// 非农事聚落夹具：把 loc_bs_weiting 从农事表里拿掉（它成了非农事聚落，其余农事聚落是供粮聚落），居民背包清空，粮仓存粮、人口、日产粮可调。
function nonFarmFixture({population,food,foodPerDay}){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(w),P='loc_bs_weiting',doc=engine.createCharacter(legacy,{},'market-food-pool-nonfarm');
 engine.rules.agriculture.settlements=engine.rules.agriculture.settlements.filter(p=>p.settlement!==P);
 // 保留托管农事记录（粮仓读 grain 批次），只把粮仓批次换成一批 food。
 const farm=doc.state.records[`agriculture:${P}`];farm.batches=food?[{id:'probe_stock',kind:'grain',amount:food,harvestDay:-30,expiresDay:400,source:'test'}]:[];if(farm.ledger)farm.ledger.openingFood=food;
 for(const n of Object.values(doc.state.npcs))n.inventory={};
 doc.state.settlements[P]={...doc.state.settlements[P],population,granary:true,food,foodPerDay,woodPerDay:0};
 doc.ledger=openLedger(engine,doc);
 return {engine,doc,P};
}

test('自产粮（统计产粮）非农事聚落的目标持有 = 餐口 × 季节储备天数；存量等于目标时稀缺度约为 1',()=>{
 // 推导：不在农事表、foodPerDay>0 的聚落是统计产粮的自产粮聚落（每天入仓，无收获日），供粮源就是它自己，
 // 补给间隔 = 季节储备 = max(一年内最大累计亏空天数, 交易周期)（handSelfReserve 手推），与路程无关。目标 = ceil(餐口 × 间隔天数)。
 // （foodPerDay=0 的非农事聚落没有可定价的粮仓目标，market.mjs 直接跳过，不在本用例范围。）
 // 同一聚落、同一存粮，只改人口：货架目标与合同承诺（K）不随人口变，所以 需求之差 = 目标之差，不必知道 K。
 const oats='item_oats',run=population=>{
  const f=nonFarmFixture({population,food:0,foodPerDay:100}),read=documentReader(f.doc);
  assert.ok(f.doc.state.settlements[f.P].foodPerDay>0);assert.ok(!f.engine.rules.agriculture.settlements.some(p=>p.settlement===f.P),'前置：不在农事表');
  const days=handSelfReserve(f.engine,f.doc.state.minute,100,population,f.P),target=Math.ceil(mealMouthsOf(f.engine,f.doc.state,f.P,population)*days);
  return {f,read,days,target,s:marketSupply(read,f.engine,oats,f.P)};
 };
 const a=run(100),b=run(200);
 assert.ok(a.target>0&&b.target>a.target);
 // 单位：粮仓存量与目标都按燕麦件数（报价货就是燕麦，行权重比 = 1），需求与目标同单位，不再乘权重。
 assert.ok(Math.abs((b.s.demand-a.s.demand)-(b.target-a.target))<=1e-6*b.target,'需求之差 = 目标之差（燕麦件数）');
 // 平时存量约等于目标：粮仓存粮 = 目标，稀缺度 = 需求 ÷ 供给 ≥ 1，且 = (目标 + K) ÷ 目标（K = 货架目标 + 承诺，与存粮无关）。
 const c=nonFarmFixture({population:100,food:a.target,foodPerDay:100}),sc=marketSupply(documentReader(c.doc),c.engine,oats,c.P);
 const K=a.s.demand-a.target;
 assert.ok(K>=-1e-6);
 assert.ok(Math.abs(sc.demand/sc.supply-(a.target+K)/a.target)<=1e-6);
 assert.ok(sc.demand/sc.supply>=1-1e-6);
});

test('远方生成聚落开局存粮 = 餐口 × 补给间隔：粮仓开局 cov = 1，稀缺度由持有量之比给出',()=>{
 // 推导：远方郡展开时每个生成聚落开账存粮 = ceil(餐口 × 补给间隔天数)，自产粮聚落的补给间隔 = 季节储备（见 helpers/hand-targets.mjs handSelfReserve）；
 // 市场的目标持有按同一条规律，所以粮仓行的存量恰等于目标（cov = 1），不再是写死的 80/150 天。
 const {engine,doc}=setup('market-food-pool-remote'),d=engine.primitiveDraft(doc);
 assert.ok(unfoldRemoteAt(d,engine,'loc_far_duanqi'));
 const overlay=remoteEngine(engine,d.document,w=>new WorldEngine(w)),state=d.get('state');
 const sids=Object.values(state.remote).flatMap(r=>r.skeleton.settlements.map(s=>s.id));
 assert.ok(sids.length>0);
 for(const sid of sids){
  // 新规律：生成聚落都是统计产粮（foodPerDay>0）、不在农事表，自产粮：补给间隔 = 季节储备（handSelfReserve：一年内最大累计亏空天数，不低于交易周期），与路程无关。
  assert.ok(state.settlements[sid].foodPerDay>0,`${sid} 统计产粮`);assert.ok(!overlay.rules.agriculture.settlements.some(p=>p.settlement===sid));
  const row=state.settlements[sid],target=Math.ceil(mealMouthsOf(overlay,state,sid,row.population)*handSelfReserve(overlay,state.minute,row.foodPerDay,row.population,sid));
  assert.equal(row.food,target,sid);
  const granaryRow=marketSupply(d,overlay,'item_oats',sid).rows.find(r=>r.owner===sid);
  assert.ok(granaryRow,`${sid} 有粮仓行`);assert.equal(granaryRow.target,target);
 }
});

test('远方生成聚落没有气候区：引擎不缩放产量（g=1），名义产量=需求（农事郡×1.02），真实推进库存不涨过名义盈余也不断',()=>{
 // 推导：引擎的统计产粮只在聚落查得到天气行时才按 季节系数 × 天气倍数 缩放（weather.mjs cropProduction 调 crop-yield.cropYieldFactor）；
 // 生成的远方聚落不在任何气候区（remote-generation.mjs:315），产量恒为名义值，所以 g_s = 1：名义产量 = 需求 ÷ 1 = 需求（农事郡 ×1.02，向上取整），
 // 季节亏空为 0，储备视野 = 结转储备 reserveDays。每日净增 = 名义 − 需求 ≥ 0，库存不会下降，涨幅不超过名义盈余。
 const {engine,doc}=setup('market-food-pool-season'),d=engine.primitiveDraft(doc);
 assert.ok(unfoldRemoteAt(d,engine,'loc_far_duanqi'));
 const overlay=remoteEngine(engine,d.document,w=>new WorldEngine(w)),state=d.get('state'),seed=d.get('randomSeed')??'default-campaign',sids=Object.values(state.remote).flatMap(r=>r.skeleton.settlements.map(s=>s.id));
 assert.ok(sids.length>0);
 const dd=overlay.primitiveDraft(d.document),DAYS=30,start=dd.get('state','minute'),day0=Math.floor(start/1440),before=Object.fromEntries(sids.map(sid=>[sid,dd.get('state','settlements',sid,'food')]));
 for(const sid of sids){
  const row=state.settlements[sid],pop=row.population,fpd=row.foodPerDay;
  assert.ok(fpd>0&&pop>0,`${sid} 统计产粮`);
  assert.ok(!overlay.rules.weather.regions.some(r=>r.locations.includes(sid)),`前置：${sid} 不在任何气候区`);
  assert.equal(weatherAt(overlay,seed,sid,start),null,'前置：没有天气行');
  // 引擎产量路径：一年每天的产量 = 名义值（与储备模型 g=1 一致）。
  for(let k=0;k<360;k++)assert.equal(cropProduction(overlay,seed,sid,(day0+k)*1440,fpd),fpd,`${sid} 第 ${k} 天产量 = 名义`);
  assert.ok(fpd>=pop&&fpd<=Math.ceil(pop*1.02),`${sid} 名义产量 = 需求（农事郡 ×1.02 向上取整）`);
  assert.equal(handSelfReserve(overlay,start,fpd,pop,sid),handReserveDays(overlay.rules),`${sid} 无季节亏空：储备 = 结转储备`);
 }
 // 真实推进 DAYS 天（每日推进走引擎的统计产粮分支）：库存不降到 0，也不涨过 名义盈余 × 天数（盈余 = 名义 − ceil(餐口)）。
 for(let k=0;k<DAYS;k++)advanceRegistry.find(r=>r.id==='daily').advance(overlay,dd,{before:(day0+k)*1440,after:(day0+k+1)*1440});
 for(const sid of sids){
  const row=state.settlements[sid],after=dd.get('state','settlements',sid,'food'),surplus=row.foodPerDay-Math.ceil(mealMouthsOf(overlay,state,sid,row.population));
  assert.ok(surplus>=0,`${sid} 名义盈余不为负`);
  assert.ok(after>0,`${sid} 库存不断`);
  assert.ok(after<=before[sid]+DAYS*surplus+1e-6,`${sid} 库存 ${after} 不涨过 ${before[sid]} + ${DAYS}×${surplus}`);
 }
 // 冬季（season 3）开局：无气候区无季节亏空，存粮 = ceil(人口 × reserveDays)，池持有天数 = H = reserveDays ≥ 阈值 0.5 × H，不触发冬荒。
 const w=engine.primitiveDraft(engine.createCharacter(legacy,{},'market-food-pool-season-winter'));
 w.set(['state','minute'],3*90*1440);assert.ok(unfoldRemoteAt(w,engine,'loc_far_duanqi'));
 const ov2=remoteEngine(engine,w.document,x=>new WorldEngine(x)),ws=w.get('state'),sid=Object.values(ws.remote).flatMap(r=>r.skeleton.settlements.map(s=>s.id))[0],cond={kind:'granary_short',days:45};
 const H=handSelfReserve(ov2,ws.minute,ws.settlements[sid].foodPerDay,ws.settlements[sid].population,sid);
 assert.equal(H,handReserveDays(ov2.rules));
 const wd=ov2.primitiveDraft(w.document),res=conditionMet(wd,ov2,{settlement:sid},cond,wd.get('state','minute'));
 assert.ok(Math.abs(res.threshold-0.5*H)<=1e-9*H);assert.equal(res.met,false);
});

test('有天气区的聚落：引擎按 季节系数 × 当日天气倍数 缩放统计产粮，储备模型的 g_s 与引擎同源且等于天气期望',()=>{
 // 推导：loc_hw 在气候区 climate_hw 里，weatherAt 有行。每一天引擎产量 = 名义 × cropSeasonFactors[季] × states[当日天气].crop（手推，读 weatherAt 的行）；
 // 储备模型取期望 g_s = cropSeasonFactors[s] × E_s：对许多种子、每季各 90 日的天气倍数取平均，应接近手推的 E_s（容差 3%）；且 crop-yield 原语的 g_s 与手推的 handSeasonYield 完全一致。
 const {engine}=setup('market-food-pool-weather-yield'),place='loc_hw',w=engine.rules.weather,nominal=100;
 assert.ok(w.regions.some(r=>r.locations.includes(place)),'前置：loc_hw 在气候区里');
 const hand=handSeasonYield(engine.rules,place),prim=seasonYieldFactors(engine.rules,place);
 assert.equal(hand.length,4);hand.forEach((v,s)=>assert.ok(Math.abs(v-prim[s])<=1e-12,`季${s} g_s 与手推一致`));
 const sums=[0,0,0,0],counts=[0,0,0,0],SEEDS=200;
 for(let i=0;i<SEEDS;i++){
  const seed=`yield-seed-${i}`;
  for(let day=0;day<360;day++){
   const row=weatherAt(engine,seed,place,day*1440);assert.ok(row,'有天气行');
   const expected=Math.max(0,nominal*w.cropSeasonFactors[row.season]*w.states[row.kind].crop);
   assert.ok(Math.abs(cropProduction(engine,seed,place,day*1440,nominal)-expected)<=1e-9,'引擎产量 = 名义 × 季节系数 × 当日天气倍数');
   sums[row.season]+=w.states[row.kind].crop*w.cropSeasonFactors[row.season];counts[row.season]++;
  }
 }
 for(let s=0;s<4;s++)assert.ok(Math.abs(sums[s]/counts[s]/hand[s]-1)<=0.03,`季${s} 引擎平均倍数 ${sums[s]/counts[s]} 接近期望 ${hand[s]}`);
});

test('结转储备天数：各农事档案一致才有定义；不一致或没有档案时报错并列出各档案取值，不按位置挑一个',()=>{
 // 推导：一致时返回手推的统一值；把第二个档案的 reserveDays 改掉 → 不一致，目标（selfSupplyDays）与阈值（shortThresholdDays）都必须报错；清空档案 → 报错。
 const {engine,doc}=setup('market-food-pool-reserve-consistency');
 assert.equal(agricultureReserveDays(engine),handReserveDays(engine.rules));
 // 只读规则的原语，用只带 rules 的替身引擎，不必构造整个世界。
 const withProfiles=settlements=>({rules:{...engine.rules,agriculture:{...engine.rules.agriculture,settlements}}});
 const base=structuredClone(engine.rules.agriculture.settlements);assert.ok(base.length>=2,'前置：至少两个农事档案');
 base[1].reserveDays=base[0].reserveDays+1;
 const odd=withProfiles(base);
 assert.throws(()=>agricultureReserveDays(odd),new RegExp(`${base[1].settlement}=${base[1].reserveDays}`));
 const state=structuredClone(doc.state),far='loc_probe_self';state.settlements[far]={population:100,foodPerDay:100,food:0};
 assert.throws(()=>selfSupplyDays(odd,state,far),/不一致/);
 assert.throws(()=>shortThresholdDays(engine.primitiveDraft(doc),odd,'loc_hw',45),/不一致/);
 const none=withProfiles([]);
 assert.throws(()=>agricultureReserveDays(none),/没有农事档案/);
});

test('没有日产粮的非农事聚落（觉醒部族骨架账）没有粮仓目标：不计该行，价格因子中性',()=>{
 // 推导：原 forest-water 分支对 foodPerDay 缺失或 0 的非农事聚落直接返回因子 1；现在对应为不计粮仓行（存量与目标都不进供需）。
 const f=nonFarmFixture({population:100,food:0,foodPerDay:undefined}),s=marketSupply(documentReader(f.doc),f.engine,'item_oats',f.P);
 assert.ok(s.rows.every(r=>r.owner!==f.P),'没有粮仓行');
});

test('生产耗料经 recordCraft 按（聚落，物品）记日桶：不同写入方都计入、需求随之变化、窗口外的日桶过期',()=>{
 // 推导：recordCraft 带 place 时把 inputs 记入 state.records['craft-use:<聚落>'].days[日][物品]；窗口 W = craftUseWindowDays（各聚落补给间隔上限向上取整）。
 // 铁的池权重 1、报价货就是铁：给 loc_hw 先后由两个写入方（作坊、NPC 自主制造，writer 与行为人不同）各记耗铁 5 与 3，窗内消耗 = 8，需求恰好比没有记录时 +8；
 // 过 W + 1 天后再记 2：旧日桶被丢掉（桶数有上界），窗内消耗 = 2，需求比无记录时 +2。记录里没有的货（水）需求不变。
 const {engine,doc}=setup('market-food-pool-consume'),inn='bld_hw_qingdeng',iron='item_iron',other='item_water',d=engine.primitiveDraft(doc);
 const base=marketSupply(d,engine,iron,inn),baseOther=marketSupply(d,engine,other,inn),day0=Math.floor(d.get('state','minute')/1440);
 recordCraft(d,{engine,actor:'player',place:'loc_hw',recipe:'probe_recipe_a',inputs:{[iron]:5},outputs:{item_iron_nail:5},writer:'works',eventId:'probe-a'});
 recordCraft(d,{engine,actor:Object.keys(doc.state.npcs)[0],place:'loc_hw',recipe:'probe_recipe_b',inputs:{[iron]:3},outputs:{item_iron_nail:3},writer:'npc-autonomy',eventId:'probe-b'});
 assert.equal(d.get('state','records','craft-use:loc_hw','days',String(day0),iron),8);
 const a=marketSupply(d,engine,iron,inn);
 assert.ok(Math.abs((a.consumption-base.consumption)-8)<=1e-9);assert.ok(Math.abs((a.demand-base.demand)-8)<=1e-9);
 assert.equal(marketSupply(d,engine,other,inn).demand,baseOther.demand);
 const W=craftUseWindowDays(engine,d.get('state'),d.get('randomSeed'),Object.keys(d.get('state','settlements')));
 d.set(['state','minute'],d.get('state','minute')+(W+1)*1440);
 const later=marketSupply(d,engine,iron,inn);
 recordCraft(d,{engine,actor:'player',place:'loc_hw',recipe:'probe_recipe_a',inputs:{[iron]:2},outputs:{item_iron_nail:2},writer:'works',eventId:'probe-c'});
 const days=d.get('state','records','craft-use:loc_hw','days');
 assert.equal(days[String(day0)],undefined,'窗口外的日桶已过期');
 assert.ok(Object.keys(days).length<=W);
 const b=marketSupply(d,engine,iron,inn);
 assert.ok(Math.abs((b.consumption-later.consumption)-2)<=1e-9);
});

test('recordCraft 不变量：带 place 的记录没有产物或产物与投入完全相同即抛错（转移不得计入耗料）；有不同产物则正常记账',()=>{
 // 推导：带 place = 声明"投入被消耗"。产物与投入同物同量是转移，必须抛错且不留日桶；投入 5 铁、产出 5 铁钉是真转化，记 5。（产物为空是非物品成果，照常计入，见抄录一条。）
 const {engine,doc}=setup('market-food-pool-invariant'),d=engine.primitiveDraft(doc),iron='item_iron',base={engine,actor:'player',place:'loc_hw',recipe:'probe_recipe',inputs:{[iron]:5},writer:'probe',eventId:'probe-inv'};
 assert.throws(()=>recordCraft(d,{...base,outputs:{[iron]:5}}),/转移不得计入耗料/);
 assert.equal(d.get('state','records','craft-use:loc_hw'),undefined);
 recordCraft(d,{...base,outputs:{item_iron_nail:5}});
 assert.equal(d.get('state','records','craft-use:loc_hw','days',String(Math.floor(d.get('state','minute')/1440)),iron),5);
});

test('抄录耗纸墨计入该聚落的纸墨需求：产物是文书（无物品产物）也是真实耗料',()=>{
 // 推导：works:copy 消耗纸 3、墨 1，产物是作品记录不是物品（outputs 为空），带 place 记入 loc_hw 的日桶；纸、墨各自成池（权重 1），报价货就是它们，
 // 消耗量（consumption）各恰好 +3、+1。比较的是消耗量而不是需求：需求有 max(…,1) 的下限（无货架目标时基线需求被抬到 1），差值会少 1。
 const {engine,doc}=setup('market-food-pool-copy'),inn='bld_hw_qingdeng',d=engine.primitiveDraft(doc),paper=WORK_RULES.paper,ink=WORK_RULES.ink;
 const p0=marketSupply(d,engine,paper,inn),i0=marketSupply(d,engine,ink,inn);
 recordCraft(d,{engine,actor:'player',place:'loc_hw',recipe:'works:copy',inputs:{[paper]:3,[ink]:1},outputs:{},writer:'works',eventId:'probe-copy'});
 const p1=marketSupply(d,engine,paper,inn),i1=marketSupply(d,engine,ink,inn);
 assert.ok(Math.abs((p1.consumption-p0.consumption)-3)<=1e-9);
 assert.ok(Math.abs((i1.consumption-i0.consumption)-1)<=1e-9);
});

test('捐粮是转移不是消耗：捐粮的守恒对凭据不带 place，不改变受粮聚落的耗料与需求',()=>{
 // 推导：agriculture.mjs 捐粮折算入仓时写一条 recipe:granary:intake 的守恒对（投入被捐的粮、产出折成粮仓计量份数），物料总量不变，所以不传 place，
 // 不进 craft-use 日桶：记录前后 loc_hw 的燕麦消耗与需求都不变，也没有 craft-use 记录。
 const {engine,doc}=setup('market-food-pool-donate'),inn='bld_hw_qingdeng',d=engine.primitiveDraft(doc);
 const before=marketSupply(d,engine,'item_oats',inn);
 recordCraft(d,{engine,actor:'player',recipe:'granary:intake',inputs:{item_oat_flour:10},outputs:{item_oats:9},writer:'agriculture',eventId:'probe-donate'});
 const after=marketSupply(d,engine,'item_oats',inn);
 assert.equal(d.get('state','records','craft-use:loc_hw'),undefined);
 assert.equal(after.demand,before.demand);assert.equal(after.supply,before.supply);
});

// 手推：某货在某聚落的补给间隔（天）= 往返该货产地的天数；产地 = 目录 origin 所在聚落；产地就是本聚落取最短生产配方工时 ÷ 1440，无配方（或无产地）退回一个交易周期 economy.tradeCycleDays。
function itemDaysAt(engine,state,seed,item,place){
 const origin=engine.byId.get(item).origin,from=origin?placeSettlement(engine,state,origin).value:null,cycle=engine.rules.economy.tradeCycleDays;
 if(!from)return cycle;
 if(from===place){const ms=engine.world.recipes.filter(r=>r.output?.item===item).map(r=>r.minutes);return ms.length?Math.max(Math.min(...ms)/1440,cycle):cycle;}
 let best=null;
 for(let m=0;m<12;m++){let r=null;try{r=engine.route(from,place,'walk',m*30*1440,seed);}catch(e){if(!e.message.startsWith('没有当前季节'))throw e;}if(r&&(best===null||r.minutes<best))best=r.minutes;}
 assert.ok(best>0,`${item} 产地聚落到得了 ${place}`);
 return 2*best/1440;
}

// 手推：聚落对某货的户用日耗 = 规则人均日耗 × 聚落人口；人均 = 名册户（personHousehold 编号去重，居民按所在聚落取）合计日耗 ÷ 名册人数；名册为空取单人户的规则日耗。
function upkeepDailyAt(engine,state,item,place){
 const seen=new Set();let total=0,persons=0;
 for(const id of Object.keys(state.npcs)){
  if(placeSettlement(engine,state,state.npcs[id].location).value!==place)continue;
  const h=personHousehold(engine,state,id).value,key=h?.id??id;if(seen.has(key))continue;seen.add(key);
  const members=(h?.members??[id]).filter(m=>state.npcs?.[m]);persons+=members.length;total+=householdDailyUse(engine,state,members,item);
 }
 return (persons>0?total/persons:householdDailyUse(engine,state,[null],item))*state.settlements[place].population;
}
// 手推：报价货所在池（同一 goods 类）的户用消耗 = Σ 池内各货 户用日耗 × 该货补给间隔 × 池权重 ÷ 报价货权重（池内同类货共用一个需求，柴池含各种木料燃料）。
function poolConsumptionAt(engine,state,seed,item,place){
 const cls=goodsClass(engine,item);let n=0;
 for(const it of engine.world.items){
  if(goodsClass(engine,it.id)!==cls)continue;
  const daily=upkeepDailyAt(engine,state,it.id,place);
  if(daily>0)n+=daily*itemDaysAt(engine,state,seed,it.id,place)*goodsWeight(engine,it.id);
 }
 return n/goodsWeight(engine,item);
}

test('非食物货的户用日耗进目标持有：规则人均日耗 × 聚落人口 × 补给间隔天数（未上名册的人口也计）',()=>{
 // 推导：consumption = upkeepDailyAt（人均 × 聚落人口）× 该货补给间隔天数（itemDaysAt 手推）；名册户只给出人均率，不逐户加总。
 const {engine,doc}=setup('market-food-pool-upkeep'),inn='bld_hw_qingdeng',state=doc.state,read=documentReader(doc),seed=read.get('randomSeed');
 const pick=engine.world.items.find(i=>!(foodSatiety(engine,i.id)>0)&&upkeepDailyAt(engine,state,i.id,'loc_hw')>0);
 assert.ok(pick,'聚落里有户用耗用的非食物货（柴、盐等）');
 // 聚落人口大于名册人数时（未上名册的人口），需求按人口算，不按名册户逐户加总：人口翻倍，户用消耗翻倍。
 const expected=poolConsumptionAt(engine,state,seed,pick.id,'loc_hw');
 assert.ok(expected>0);
 const big=structuredClone(doc);big.state.settlements.loc_hw.population*=2;
 assert.ok(Math.abs(marketSupply(documentReader(big),engine,pick.id,inn).consumption-2*expected)<=1e-6*expected,'人口翻倍则户用消耗翻倍');
 const s=marketSupply(read,engine,pick.id,inn);
 assert.ok(Math.abs(s.consumption-expected)<=1e-6*expected);
});

test('单农事聚落的世界：给柴报价不崩溃，消耗 = 户用日耗 × 柴的补给间隔（与有没有别的农事聚落无关）',()=>{
 // 推导：非食物货的补给间隔按该货产地（目录 origin）推，不再依赖"最近的别的农事聚落"；柴产地在 loc_hw 本地，间隔 = 本地生产周期（itemDaysAt 手推）。
 const wood='item_wood',inn='bld_hw_qingdeng',{engine,doc}=setup('market-food-pool-single-farm');
 engine.rules.agriculture.settlements=engine.rules.agriculture.settlements.filter(p=>p.settlement==='loc_hw');
 const state=doc.state,read=documentReader(doc),seed=read.get('randomSeed');
 const expected=poolConsumptionAt(engine,state,seed,wood,'loc_hw');
 assert.ok(upkeepDailyAt(engine,state,wood,'loc_hw')>0&&expected>0);
 let s=null;assert.doesNotThrow(()=>{s=marketSupply(read,engine,wood,inn);});
 assert.ok(Math.abs(s.consumption-expected)<=1e-6*expected);
});

test('本地产铁：平时存量 = 目标持有（含铁钉作坊的耗铁）时 cov = 1，稀缺度为 1；本地产地补给间隔不小于一个交易周期',()=>{
 // 推导：铁的产地 bld_hw_forge 在 loc_hw 本地，补给间隔 = max(最短配方天数, economy.tradeCycleDays) ≥ 交易周期（不会只有配方工时的零点几天）；
 // 作坊在窗口内耗铁 6（产出铁钉）计入日桶，铁的目标持有 D = 货架目标 + 承诺 + 户用日耗 × 间隔 + 6；居民背包清空，聚落铁存 S = D → 供给 = D，稀缺度 = 1。
 const iron='item_iron',inn='bld_hw_qingdeng',{engine,doc}=setup('market-food-pool-iron');
 for(const n of Object.values(doc.state.npcs))n.inventory={};
 doc.ledger=openLedger(engine,doc);
 const seed=documentReader(doc).get('randomSeed');
 assert.ok(itemDaysAt(engine,doc.state,seed,iron,'loc_hw')>=engine.rules.economy.tradeCycleDays);
 const d=engine.primitiveDraft(doc);
 const s0=marketSupply(d,engine,iron,inn);
 recordCraft(d,{engine,actor:'player',place:'loc_hw',recipe:'probe_nails',inputs:{[iron]:6},outputs:{item_iron_nail:24},writer:'works',eventId:'probe-nails'});
 const s1=marketSupply(d,engine,iron,inn);
 assert.ok(Math.abs((s1.demand-s0.demand)-6)<=1e-9);
 const D=s1.demand,full=structuredClone(d.document);full.state.settlements.loc_hw.iron=D;full.ledger=openLedger(engine,full);
 const s2=marketSupply(documentReader(full),engine,iron,inn);
 assert.ok(Math.abs(s2.supply-D)<=1e-9*D);assert.ok(Math.abs(s2.demand/s2.supply-1)<=1e-9);
});

test('柴：平时存量 = 目标持有（货架目标 + 承诺 + 户用日耗 × 补给间隔）时 cov = 1，稀缺度为 1',()=>{
 // 推导：目标持有 D = 货架目标 + 合同承诺 + 户用日耗 × 补给间隔天数（户用部分按上一条手推：各户 householdDailyUse 之和 × 柴的补给间隔，柴产地在 loc_hw 本地，itemDaysAt 取本地生产周期）。
 // 居民背包清空（卖方存货 0），聚落柴存 S = D：供给 = S，需求 = D，稀缺度 = 需求 ÷ 供给 = 1（在 [0.5, 3] 之内，不夹取）；目标与存量无关。
 const wood='item_wood',inn='bld_hw_qingdeng',{engine,doc}=setup('market-food-pool-wood');
 for(const n of Object.values(doc.state.npcs))n.inventory={};
 doc.ledger=openLedger(engine,doc);
 const state=doc.state,read=documentReader(doc),seed=read.get('randomSeed');
 const expected=poolConsumptionAt(engine,state,seed,wood,'loc_hw');
 assert.ok(upkeepDailyAt(engine,state,wood,'loc_hw')>0&&expected>0,'聚落里有户用耗柴');
 const s0=marketSupply(read,engine,wood,inn);
 assert.ok(Math.abs(s0.consumption-expected)<=1e-6*expected);
 const D=s0.demand;assert.ok(D>=expected);
 // 账本里的存量按整数件记账（非整数的存量写不进账，会读成 0），所以存量取不小于 D 的最小整数 S = ceil(D)：与 D 相差不到 1 件，
 // 供给 = S 精确，需求仍 = D（目标与存量无关），稀缺度 D ÷ S 与 1 的差不超过 1 ÷ S。
 const S=Math.ceil(D),full=structuredClone(doc);full.state.settlements.loc_hw.wood=S;full.ledger=openLedger(engine,full);
 const s1=marketSupply(documentReader(full),engine,wood,inn);
 assert.equal(s1.supply,S);assert.ok(S-D<1);assert.ok(Math.abs(s1.demand-D)<=1e-9*D);
 assert.ok(Math.abs(s1.demand/s1.supply-1)<=1/S);
});
