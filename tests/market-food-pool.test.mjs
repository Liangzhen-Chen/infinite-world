// MKTW：市场整类去除手写倍数后的源头机制测试。期望一律按规则手推，推导写在各断言上方，不用被测函数算期望。
// 范围：可食物资并池、需求口径（买下一件货后需求不变）、hazard_phase 按阶段名、非农事聚落粮价因子并入市场、被测代码无按聚落/季节/物品 id 的分支。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {documentReader} from '../server-plugin/read-scope.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {personBusinesses,placeSettlement} from '../server-plugin/entity-view.mjs';
import {marketSupply,goodsClass,goodsWeight,foodSatiety} from '../server-plugin/market.mjs';
import {stageReached} from '../server-plugin/seasonal-hazards.mjs';
import {forestWaterPriceFactor} from '../server-plugin/forest-water.mjs';

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
 const given=applyIntentSetup(engine,doc,{facts:[{path:['state','npcs',pick,'inventory',bread],value:1}]});assert.deepEqual(given.setupUnmet,[]);
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
