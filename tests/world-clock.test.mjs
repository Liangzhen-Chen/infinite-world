import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {assertWorldClockRules,clockRoll,worldClockScene} from '../server-plugin/world-clock.mjs';
import {worldClockRules} from '../world/design/m5-clock-rules.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
function setup(seed='clock-test'){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},seed);
 const wait=async(c,minutes,id='wait')=>{const out=await engine.reduce(c,{tool:'world_time',args:{minutes},eventId:id});return {doc:applyPatches(c,out.patches),out};};
 return {w,engine,doc,wait};
}
const clocks=doc=>Object.values(doc.state.records).filter(r=>r.category==='world_clock');
const economic=doc=>({settlements:doc.state.settlements,quotes:doc.state.quotes,records:Object.fromEntries(Object.entries(doc.state.records).filter(([,r])=>['world_clock','regional_quote','settlement_trade','agriculture','village_fiscal','festival'].includes(r.category)))});

test('正式机制引用既存四村和文化势力；未知效果和缺消费者拒绝',()=>{
 assert.deepEqual(world.rules.worldClock,worldClockRules);
 const {engine,w}=setup();assert.doesNotThrow(()=>assertWorldClockRules(engine));
 for(const change of [r=>r.clocks[0].stages[0].effect.kind='awaken',r=>r.clocks[0].settlement='loc_missing',r=>r.clocks[0].probability=2,r=>r.clocks[0].stages[0].condition.kind='secret']){
  const bad=structuredClone(w);change(bad.rules.worldClock);assert.throws(()=>assertWorldClockRules(new WorldEngine(bad)));
 }
 const missing=structuredClone(w);delete missing.rules.settlementTrade;assert.throws(()=>assertWorldClockRules(new WorldEngine(missing)),/消费者/);
});
test('真实周贸易到货后推进阶段并消费区域报价，不把常量阶段当演变',async()=>{
 const {engine,doc,wait}=setup(),before=structuredClone(doc);
 // S5-02 §15.2/15.4：粮基准3×运输/春季环境项×D/S；未成交，深度/品质/立场/修正均1。
 // 公仓实际粮扣人口×90天口粮；四村没有其他在售粮，D为口粮需求。
 // 两次观察的 [环境后的基准, D, S=公仓粮-D] 分别为：
 // S5-05 / 05 §5.5、RW-06/W1：农副产保留小数累计取整，先吃农副产，余下口粮才扣公仓粮。
 // 原生推进在 minute=10080/20160 取价；无收割/腐坏，第二周四村各转出40粮、转入40粮，净转移0。
 // 7/14天农副产手算：榆坡 floor(5×38.5+31.5+35)=259，259+35+6×21=420；
 // 苇亭 floor(6×49.5+60.5)=357，floor(11×49.5+3×60.5)=726；
 // 梨泉 floor(4×34.2+3×38)=250，floor(6×34.2+6×38+41.8+22.8)=497；
 // 桑坂 floor(5×40.5+2×45)=292，floor(7×40.5+2×45+5×49.5)=621。
 // 公仓粮=期初粮+上述农副产−人口×天数；D=人口×90；下列基准×(D/S) 手算得到独立字面量。
 // 先除后乘，与市场先计算稀缺率的浮点运算顺序一致；保留严格相等断言。
 // 榆坡 [3.443174013650245,7200,17699-7200]、[3.3518376618407357,7200,17300-7200]（期初18000，人口80）；
 // 苇亭 [3.471578672022414,9000,21657-9000]、[3.5941049780937933,9000,21326-9000]（期初22000，人口100）；
 // 梨泉 [3.7863854422265217,8640,21578-8640]、[3.6359916279324778,8640,21153-8640]（期初22000，人口96）；
 // 桑坂 [3.4636753236814712,9900,24522-9900]、[3.551323048345333,9900,24081-9900]（期初25000，人口110）。
 // 环境基准=3×春季0.9×(1+线路公里数×0.01)×实际运输风险；单价不取整。
 // 独立金额字面量；历史观察不充当当前报价缓存。
 // W5: persisted quote anchors are integer micro-copper numerators over 1_000_000 (old float -> round(float*1e6); max change 5e-7 copper).
 // K16: farm hands also fetch household water, so real sowing/seed use shifts a few
 // granary portions (yupo day 14: S=17291-7200 instead of 17300-7200). Check: 2389429*10100/10091 = 2391560.
 // TFA food-supply law: before each observation the public granary also sold grain to the keeper's counter in loc_bs (food-supply market_trade sales, food-supply.mjs / agriculture.mjs drawFoodSupplyGranary),
 // 80 at yupo (40+40), 40 at weiting, 80 at liquan (40+40), 69 at sangban (40+29), all within the first week, so every S above drops by that amount (D unchanged), e.g. yupo day 7:
 // 3.443174013650245*7200/(10494-80) = 2.380531, day 14: 3.3518376618407357*7200/(10091-80) = 2.410671; same exact 1:1 subtraction holds for all eight (S reconstructed from the old anchors differs by exactly the sold amount).
 const anchors={
  loc_bs_yupo:[2380531,2410671],
  loc_bs_weiting:[2477143,2634545],
  loc_bs_liquan:[2544677,2527757],
  loc_bs_sangban:[2356566,2492068],
 };
 let c=(await wait(doc,14*DAY-doc.state.minute)).doc;
 assert.deepEqual(doc,before);
 for(const clock of clocks(c)){
  assert.equal(clock.phase,2);assert.equal(clock.history.length,2);
  assert.ok(clock.history[1].trigger.evidence.some(id=>c.state.records[id]?.deliveredFood>0));
  for(const [index,event] of clock.history.entries()){
   const sid=engine.rules.worldClock.clocks.find(r=>r.id===clock.id).settlement;
   assert.deepEqual(event.effect.price,{numerator:anchors[sid][index],denominator:1000000});assert.ok(Number.isInteger(event.draw));
   assert.equal(c.state.quotes[`region:${event.minute/DAY}:${sid}:item_oats`],undefined);
  }
 }
 assert.equal(worldClockScene(engine,c),'');
 const counter=engine.rules.agriculture.settlements.find(p=>p.settlement==='loc_bs_yupo').counter;
 const visible=structuredClone(c);visible.state.location=counter;assert.match(worldClockScene(engine,visible),/\u6bcf\u4efd2\.410671378009519\u94dc/);
 assert.ok(Object.values(c.state.records).some(r=>r.category==='settlement_trade'&&r.status==='delivered'));
 assert.equal(c.state.player.coins,doc.state.player.coins);assert.deepEqual(c.state.created,doc.state.created);
 const beforeNpcs=Object.keys(doc.state.npcs);assert.deepEqual(Object.keys(c.state.npcs),beforeNpcs);
 // No harvest has occurred: more elapsed weeks alone cannot reach stage three.
 c=(await wait(c,14*DAY,'weeks')).doc;assert.ok(clocks(c).every(r=>r.phase===2));
});
test('同种子30日分步与大步结果一致，既有天气和钱粮账保持一致',async()=>{
 const {engine,doc,wait}=setup();
 const expectedWeather=weatherAt(engine,doc.randomSeed,'loc_bs_yupo',25*DAY);
 const large=(await wait(doc,30*DAY,'large')).doc;
 let split=doc;for(let i=0;i<30;i++)split=(await wait(split,DAY,`small-${i}`)).doc;
 assert.deepEqual(economic(split),economic(large));
 assert.deepEqual(weatherAt(engine,large.randomSeed,'loc_bs_yupo',25*DAY),expectedWeather);
 for(const r of clocks(large))assert.equal(new Set(r.history.map(e=>e.sourceEvent)).size,r.history.length);
});
test('日/月/年边界只触发一次，旧档从当前日期起步不补造过去',async()=>{
 const {engine,doc,wait}=setup();let start=doc;
 while(start.state.minute<359*DAY+540)start=(await wait(start,Math.min(30*DAY,359*DAY+540-start.state.minute),'prepare-year')).doc;
 for(const [id,r]of Object.entries(start.state.records))if(r.category==='world_clock')delete start.state.records[id];
 const one=(await wait(start,30*DAY,'year')).doc;
 let split=start;for(let i=0;i<30;i++)split=(await wait(split,DAY,`day-${i}`)).doc;
 assert.deepEqual(economic(one),economic(split));
 const calendar=engine.calendar(360*DAY);assert.deepEqual([calendar.year,calendar.month,calendar.day],[2,1,1]);
 for(const r of clocks(one)){assert.equal(r.year,2);assert.ok(r.history.every(e=>e.minute>start.state.minute));assert.ok(r.nextAt>one.state.minute);assert.ok(r.phase<3);}
 const replay=await wait(start,30*DAY,'year');assert.deepEqual(economic(replay.doc),economic(one));
});
test('概率取决于种子与绝对日期，阶段未满足时不扣资源',async()=>{
 const {engine,w,doc,wait}=setup();
 for(const r of w.rules.worldClock.clocks)r.probability=0;
 const old=structuredClone(doc.state.inventory),c=(await wait(doc,30*DAY)).doc;
 assert.ok(clocks(c).every(r=>r.phase===0&&r.history.length===0));assert.deepEqual(c.state.inventory,old);
 assert.equal(clockRoll('seed','clock',7),clockRoll('seed','clock',7));assert.notEqual(clockRoll('seed','clock',7),clockRoll('other','clock',7));
 // Weather/ecology predicates read supported consumers and never invent stock.
 const rule=w.rules.worldClock.clocks[0];rule.probability=1;rule.stages=[{name:'生态核对',condition:{kind:'wildlife_population',habitat:w.rules.wildlife.habitats[0].id,species:'missing',minimum:1},effect:{kind:'regional_quote',item:'item_oats'}}];
 const ecology=(await wait(doc,7*DAY)).doc;assert.equal(clocks(ecology)[0].phase,0);
 assert.doesNotThrow(()=>assertWorldClockRules(engine));
});
test('非平凡概率按绝对周次推进，调用分段不改掷值',async()=>{
 const s=setup('probability');for(const r of s.w.rules.worldClock.clocks){r.probability=0.35;r.stages=[r.stages[0]];}
 const large=(await s.wait(s.doc,30*DAY)).doc;let split=s.doc;
 for(let i=0;i<30;i++)split=(await s.wait(split,DAY,`split-${i}`)).doc;
 assert.deepEqual(clocks(large),clocks(split));
 for(const row of clocks(large)){
  const ticks=[7,14,21,28],first=ticks.find(day=>clockRoll(s.doc.randomSeed,row.id,day)<0.35);
  assert.equal(row.history[0]?.minute,first===undefined?undefined:first*DAY);
 }
});
