import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyEffects} from '../server-plugin/effects.mjs';
import {advanceHazardClocks,assertHazardRules,validateHazardRules} from '../server-plugin/seasonal-hazards.mjs';
import {pureHazardFires,hazardRouteClosure,hazardPriceFactor,famineAt} from '../server-plugin/hazard-calendar.mjs';
import {thinGranaries} from './helpers/granary-fixture.mjs';
import {goodsClass,goodsWeight} from '../server-plugin/market.mjs';
import {farmTargetFood} from '../server-plugin/agriculture-migration.mjs';
import {regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {advanceNpcLife,npcLifeLines} from '../server-plugin/npc-life.mjs';
import {advanceNpcNeeds} from '../server-plugin/npc-intelligence.mjs';
import {traitsOf} from '../server-plugin/traits.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {hazardClockRules} from '../world/design/seasonal-hazards.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const rec=(doc,key)=>doc.state.records[key];
const hazards=doc=>Object.fromEntries(Object.entries(doc.state.records).filter(([k])=>/^(hazard-|epidemic:)/.test(k)));
// Every clock moved into spring with certain stages, so a few days show all of
// them. A pure clock's day-0 stage lies before the campaign's first minute and
// is never applied (old saves start from their own date): flood and price
// apply their second stage on day 2 (or day `flood`) and the third after that.
// The mechanism tests run on U3's own four clocks; the other places' clocks
// (D1) are checked by tests/data-coverage.test.mjs.
const U3_CLOCKS=['flood:loc_hw','epidemic:loc_hw','price:loc_bs','famine:loc_hw'];
function spring(w,{rates=false,flood=2}={}){
 w.rules.hazardClock.clocks=w.rules.hazardClock.clocks.filter(r=>U3_CLOCKS.includes(r.id));
 for(const r of w.rules.hazardClock.clocks){
  r.seasons=[0];r.intervalDays=r.kind==='epidemic'||r.kind==='famine'?1:r.kind==='flood'?flood:2;
  for(const s of r.stages){s.probability=1;if(s.condition.kind==='all')s.condition=s.condition.conditions[0];if(s.condition.kind==='weather')s.condition={kind:'always'};if(s.condition.kind==='granary_short')s.condition.days=1000;}
 }
 if(rates)Object.assign(w.rules.hazardClock.diseases[0],rates===true?{householdRate:6,routeRate:1}:rates);
 return w;
}
function setup(seed='hazard-test',mutate=w=>w){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}mutate(w);
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},seed);
 const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return {doc:applyPatches(c,out.patches),out};};
 const wait=async(c,minutes,id='wait')=>(await run(c,'world_time',{minutes},id)).doc;
 return {w,engine,doc,run,wait};
}
// A draft for calling advance and effect functions directly.
function draft(doc){
 return {document:structuredClone(doc),patches:[],messages:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
  set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(m){this.messages.push(m);}};
}

test('灾害时钟另表登记且通过校验；坏规则拒绝',()=>{
 assert.deepEqual(world.rules.hazardClock,hazardClockRules);
 assert.deepEqual(validateHazardRules(world),[]);
 // Water-borne disease follows a flood only where people already go hungry.
 assert.deepEqual(world.rules.hazardClock.clocks.find(r=>r.kind==='epidemic').stages[0].condition.conditions.map(c=>c.kind),['hazard_phase','hunger']);
 // hazard_phase names the referenced stage (not its position): 河湾疫病等的是汛期时钟的洪峰阶段。
 assert.deepEqual(world.rules.hazardClock.clocks.find(r=>r.kind==='epidemic').stages[0].condition.conditions[0],{kind:'hazard_phase',clock:'flood:loc_hw',stage:'crest'});
 const kinds=new Set(world.rules.hazardClock.clocks.map(r=>r.kind));assert.deepEqual([...kinds].sort(),['epidemic','famine','flood','price']);
 for(const change of [
  t=>t.clocks[1].stages[0].effects.push({kind:'route_closure',routes:['route_hw_bs'],minutes:DAY}), // closure only from pure clocks
  t=>t.clocks[1].disease='disease_missing',
  t=>t.clocks[0].stages[0].effects.push({kind:'flood',locations:['loc_missing'],minutes:DAY}),
  t=>t.clocks[1].interventions[0].phases=[9],
  t=>t.clocks[2].stages[0].effects[0].factor=9,
  t=>{t.clocks[1].stages[0].condition.conditions[0].stage='no_such_stage';}, // a reference to a stage the clock does not have
  t=>{const c=t.clocks[1].stages[0].condition.conditions[0];delete c.stage;c.minimum=2;}, // positions are no longer a valid reference
  t=>t.diseases[0].fatality={cared:0.5,alone:0.1},
  t=>t.clocks[0].seasons=[0,2],
 ]){const bad=structuredClone(world);change(bad.rules.hazardClock);assert.ok(validateHazardRules(bad).length,String(change));}
});

test('四类时钟按季节与种子分阶段推进，大步与分步、重放一致',async()=>{
 const {engine,doc,wait}=setup('hazard-replay',w=>spring(w,{rates:true}));
 const large=await wait(doc,12*DAY,'large');
 let split=doc;for(let i=0;i<12;i++)split=await wait(split,DAY,`d${i}`);
 assert.deepEqual(hazards(split),hazards(large));
 assert.deepEqual(split.state.settlements,large.state.settlements);
 assert.deepEqual(hazards(await wait(doc,12*DAY,'large')),hazards(large));
 for(const id of ['flood:loc_hw','famine:loc_hw','price:loc_bs','epidemic:loc_hw']){
  const row=rec(large,`hazard-clock:${id}`);assert.equal(row.category,'hazard_clock',id);assert.ok(row.phase>=2,id);
  assert.deepEqual(row.history.map(h=>h.phase),row.history.map((_,i)=>row.history[0].phase+i));
  assert.ok(row.history.every(h=>h.minute%DAY===0&&h.sourceEvent===`hazard:${id}:${h.minute}`));
 }
 // Pure clocks follow their seeded history exactly.
 const flood=engine.rules.hazardClock.clocks[0];
 assert.deepEqual(rec(large,'hazard-clock:flood:loc_hw').history.map(h=>h.minute),pureHazardFires(engine,doc.randomSeed,flood,0).map(f=>f.minute).filter(m=>m>doc.state.minute));
 // Real seasons: the default flood comes in summer and differs with the seed.
 const real=new WorldEngine(world),r=world.rules.hazardClock.clocks[0];
 const fires=pureHazardFires(real,'a',r,0);assert.ok(fires.length&&fires.every(f=>Math.floor(f.minute/DAY/90)===1));
 assert.notDeepEqual(pureHazardFires(real,'a',r,0),pureHazardFires(real,'b',r,0));
 assert.deepEqual(pureHazardFires(real,'a',r,0),pureHazardFires(new WorldEngine(structuredClone(world)),'a',structuredClone(r),0));
 // Nothing happens before the first season check: spring days leave no record.
 const quiet=setup('hazard-quiet');assert.deepEqual(hazards(await quiet.wait(quiet.doc,10*DAY)),{});
});

test('汛期：洪峰封路、河边地点受淹（浸湿规则）、田地减产，退水后复通',async()=>{
 const {engine,doc,wait}=setup('hazard-flood',w=>spring(w,{flood:10}));
 const crest=await wait(doc,10*DAY-doc.state.minute+60);
 const closure=hazardRouteClosure(engine,doc.randomSeed,'route_loc_hw_dock',crest.state.minute);
 assert.deepEqual([closure.clock,closure.stage],['flood:loc_hw','crest']);
 assert.throws(()=>engine.route('loc_hw','loc_hw_dock','walk',crest.state.minute,doc.randomSeed),/没有当前季节可通行的路线/);
 assert.equal(rec(crest,'hazard-route:route_hw_yandu').until,closure.until);
 assert.ok(traitsOf(engine,crest.state,'feature_hw_plot').tags.includes('wet'));
 assert.ok(rec(crest,'hazard-flood:loc_hw_dock').soaked.includes('feature_hw_plot'));
 assert.doesNotThrow(()=>engine.route('loc_hw','loc_hw_dock','walk',closure.until,doc.randomSeed));
 // The managed fields of 河湾 lose standing-crop quality against the same days without the damage.
 const plain=setup('hazard-flood',w=>{spring(w,{flood:10});const s=w.rules.hazardClock.clocks[0].stages[1];s.effects=s.effects.filter(e=>e.kind!=='crop_damage');});
 const other=await plain.wait(plain.doc,10*DAY-doc.state.minute+60);
 const field=c=>c.state.records['agriculture:loc_hw'].field.cohorts.filter(r=>!r.harvestedUnits);
 assert.ok(field(crest).length);
 field(crest).forEach((row,i)=>assert.ok(Math.abs(row.qualitySum-field(other)[i].qualitySum*0.7)<1e-9));
 // An unmanaged settlement instead gets a yield factor that its daily field output reads.
 const loose=structuredClone(doc);delete loose.state.records['agriculture:loc_hw'];
 const d=draft(loose);
 applyEffects(d,engine,[{kind:'crop_damage',settlement:'loc_hw',percent:50,minutes:5*DAY}],{settlement:'loc_hw',minute:doc.state.minute,sourceEvent:'t',clock:'t'},'world');
 assert.equal(d.get('state','records','hazard-yield:loc_hw').shifts.t.factor,0.5);
 const hit=await wait(d.document,DAY,'hit'),even=await wait(loose,DAY,'even');
 assert.ok(hit.state.settlements.loc_hw.food<even.state.settlements.loc_hw.food);
});

test('冬荒：存粮不足时粮价上涨，出现迁居与偷盗动机',async()=>{
 const {engine,doc,wait}=setup('hazard-famine',spring);
 const c=await wait(doc,3*DAY);
 const row=rec(c,'hazard-clock:famine:loc_hw');assert.deepEqual(row.history.map(h=>h.stage),['tight','famine']);
 assert.equal(row.history[0].trigger.evidence,'settlement:loc_hw');
 assert.ok(famineAt(c.state,'loc_hw'));
 // 冬荒不再写手工价格倍数：粮价的上涨来自市场自己的供需（公仓缺粮、缺口户的需求），
 // 所以冬荒期间事件价格因子对粮食与非粮食都是 1；冬荒记录（famineAt）与迁居、偷盗动机仍在。
 assert.equal(hazardPriceFactor(engine,c.state,'item_oats','loc_hw'),1);
 assert.equal(hazardPriceFactor(engine,c.state,'item_oats','bld_hw_qingdeng'),1);
 assert.equal(hazardPriceFactor(engine,c.state,'item_staff','loc_hw'),1);
 // 价 = 区域基准 × 稀缺度（首笔深度、品质、立场和修正均为 1，冬荒期事件价格因子为 1，上面已断言）。按现行定价手推（不复制被测函数）：
 //  · 区域基准 = 目录基价 3 × 运输因子 1.16（产地 loc_bs 到 loc_hw 一条 24 公里路，单位运费 24×1×0.02 = 0.48，1 + 0.48÷3）= 3.48；
 //  · 稀缺度 = 目标持有 ÷ 实际持有，两边都折成口粮件数（每件货 × 饱腹权重 ÷ 口粮权重）：
 //    实际持有 = 林穗店里的食物类存货（公开在售）+ 公仓燕麦存量；其他居民的私户背包不计（I12）；
 //    目标持有 = 林穗货架目标（各行 maximum + reserve）+ 公仓粮食目标（农事聚落 = min(餐口 × (距收获天数 + reserveDays)，容量 − 种粮)，即 farmTargetFood）；
 //  · 稀缺度落在 [0.5, 3] 之内，不夹取。
 const d=draft(c),st=d.get('state'),unit=i=>goodsWeight(engine,i)/goodsWeight(engine,'item_ration'),food=i=>goodsClass(engine,i)==='goods:food';
 const linsui=st.npcs.npc_hw_linsui,shelfRows=engine.rules.economy.shops.stores.filter(x=>x.keeper==='npc_hw_linsui').flatMap(x=>x.restock??[]).filter(r=>food(r.item));
 const held=Object.entries(linsui.inventory??{}).filter(([i])=>food(i)).reduce((n,[i,q])=>n+(q.quantity??q)*unit(i),0)+st.settlements.loc_hw.food*unit('item_oats');
 const target=shelfRows.reduce((n,r)=>n+(r.maximum+(r.reserve??0))*unit(r.item),0)+farmTargetFood(engine,st,engine.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw'),st.minute)*unit('item_oats');
 assert.ok(target/held>=0.5&&target/held<=3);
 assert.ok(Math.abs(regionalTradePrice(d,engine,'item_ration','loc_hw')-3.48*target/held)<=1e-9);
 // Not short of food: the condition holds the clock at phase 0.
 const fed=setup('hazard-famine',w=>{spring(w);w.rules.hazardClock.clocks.find(r=>r.kind==='famine').stages[0].condition.days=1;});
 assert.equal(rec(await fed.wait(fed.doc,3*DAY),'hazard-clock:famine:loc_hw'),undefined);
 // U7 needs: a full person in the famine village takes up a food goal.
 const w2=structuredClone(world);for(const n of w2.npcs){delete n.schedule;if(!n.id.startsWith('npc_hw_'))delete n.tier;}
 const e2=new WorldEngine(w2),d2=draft(e2.createCharacter(legacy,{},'hazard-famine'));
 d2.set(['state','records','hazard-famine:loc_hw'],{category:'hazard_famine',settlement:'loc_hw',since:0,until:30*DAY,sourceEvent:'hazard:famine:loc_hw:0'});
 advanceNpcNeeds(d2,e2,DAY);
 const goals=Object.values(d2.get('state','npcs')).flatMap(n=>Object.values(n.goals??{}).flat()).filter(g=>g?.need==='food');
 assert.ok(goals.length);for(const g of goals){assert.deepEqual(g.motives,['migrate','steal']);assert.match(g.steps[0].content,/口粮/);}
});

test('物价波动：接周贸易区域报价与商店报价的季节系数，回落后复原',async()=>{
 const {engine,doc,wait}=setup('hazard-price',spring);
 const peak=await wait(doc,3*DAY);
 assert.deepEqual(rec(peak,'hazard-clock:price:loc_bs').history.map(h=>h.stage),['peak']);
 assert.equal(hazardPriceFactor(engine,peak.state,'item_oats','loc_bs_yupo'),1.3);
 const d=draft(peak),price=regionalTradePrice(d,engine,'item_oats','loc_bs_yupo');
 const quote=d.get('state','records',`quote:region:${Math.floor(peak.state.minute/DAY)}:loc_bs_yupo:item_oats`);
 // S5-02：报价不存档；灾害/季节仍为派生组成，不能再读取已删除的报价真相。
 assert.equal(quote,undefined);assert.equal(hazardPriceFactor(engine,peak.state,'item_oats','loc_bs_yupo'),1.3);
 assert.equal(engine.rules.settlementTrade.seasonFactors,undefined,'周贸易区域价不再有手写季节系数');assert.ok(price>=1);
 // 基准3×灾害1.3×供需0.5×其余1，不对展示单价取整。
 // 待重推（MKTW 持有量口径）：稀缺度 0.5 的前提来自旧供需口径，新口径下按持有量重推，未改值。
 assert.equal(regionalTradePrice(d,engine,'item_ration','loc_bs'),1.9500000000000002);
 // A shop's day quote starts from the same figure.
 const calm=setup('hazard-price');
 const plainDraft=draft(await calm.wait(calm.doc,3*DAY));
 assert.ok(regionalTradePrice(plainDraft,calm.engine,'item_oats','loc_bs_yupo')<price);
 const eased=await wait(peak,4*DAY);
 assert.deepEqual(rec(eased,'hazard-clock:price:loc_bs').history.map(h=>h.stage),['peak','ease']);
 assert.equal(hazardPriceFactor(engine,eased.state,'item_ration','loc_bs'),1);
 // 灾害回落为1，基准3×供需0.5=1.5。
 // 待重推（MKTW 持有量口径）：同上，未改值。
 assert.equal(regionalTradePrice(draft(eased),engine,'item_ration','loc_bs'),1.5);
});

test('疫病：有病名与途径，户间、沿路线传播；医师、隔离、净水、祭祀按规则减传播',async()=>{
 const s=setup('hazard-epidemic',w=>spring(w,{rates:{householdRate:1.5,routeRate:0.3}}));
 const start=await s.wait(s.doc,2*DAY-s.doc.state.minute+60);
 const ep0=rec(start,'epidemic:epidemic:loc_hw:1');
 assert.equal(ep0.disease,'disease_river_flux');assert.equal(Object.keys(ep0.households).length,2);
 const after=await s.wait(start,10*DAY),ep=rec(after,'epidemic:epidemic:loc_hw:1');
 const rows=Object.values(ep.households);
 assert.ok(rows.some(h=>h.source==='household'&&h.settlement==='loc_hw'));
 assert.ok(rows.some(h=>h.source==='route'&&h.via==='route_hw_bs'&&h.settlement==='loc_bs'));
 for(const h of rows)assert.ok(h.infectiousAt>h.exposedAt&&h.recoversAt>h.infectiousAt);
 // Same epidemic, same rolls: each measure taken on day 5 never adds a case.
 const spread=async measure=>{
  const d=draft(start);
  const r=applyEffects(d,s.engine,[{kind:'epidemic_measure',measure,minutes:20*DAY}],{settlement:'loc_hw',minute:start.state.minute,sourceEvent:`m:${measure}`,clock:'epidemic:loc_hw'},'world');
  assert.equal(r.applied,true);return Object.keys(rec(await s.wait(d.document,10*DAY),'epidemic:epidemic:loc_hw:1').households).length;
 };
 const base=rows.length,results={};
 for(const m of ['quarantine','purify','ritual','treatment'])results[m]=await spread(m);
 assert.ok(results.quarantine<base,JSON.stringify(results));assert.ok(results.purify<base,JSON.stringify(results));
 assert.ok(results.ritual<=base);assert.ok(results.treatment<=base);
 assert.ok(results.quarantine<=results.ritual);
 // Purified water does nothing against a cough carried through the air.
 const air=setup('hazard-epidemic',w=>{spring(w,{rates:{householdRate:1.5,routeRate:0.3}});w.rules.hazardClock.diseases[0].route='air';});
 const airStart=await air.wait(air.doc,2*DAY-air.doc.state.minute+60),d=draft(airStart);
 applyEffects(d,air.engine,[{kind:'epidemic_measure',measure:'purify',minutes:20*DAY}],{settlement:'loc_hw',minute:airStart.state.minute,sourceEvent:'m',clock:'epidemic:loc_hw'},'world');
 assert.deepEqual(rec(await air.wait(d.document,10*DAY),'epidemic:epidemic:loc_hw:1').households,rec(await air.wait(airStart,10*DAY),'epidemic:epidemic:loc_hw:1').households);
 // No epidemic in progress: a measure is refused and changes nothing.
 const none=draft(s.doc);
 assert.equal(applyEffects(none,s.engine,[{kind:'epidemic_measure',measure:'quarantine',minutes:DAY}],{settlement:'loc_hw',minute:s.doc.state.minute,sourceEvent:'x',clock:'epidemic:loc_hw'},'world').applied,false);
});

test('玩家干预经现有议事入口：须到场，生成世界事件并改变立场',async()=>{
 // The flood here does not close the dock road, so the purify site is reachable.
 const s=setup('hazard-act',w=>{spring(w,{rates:true});const crest=w.rules.hazardClock.clocks[0].stages[1];crest.effects=crest.effects.filter(e=>e.kind!=='route_closure');});
 let c=await s.wait(s.doc,3*DAY-s.doc.state.minute);
 const intervene=(doc,choice,id)=>s.run(doc,'world_settlement',{operation:'faction_intervene',clock:'epidemic:loc_hw',choice},id);
 await assert.rejects(intervene(c,'treat','far'),/登记地点/);
 const seen=await s.run(c,'world_settlement',{operation:'faction_inspect',clock:'epidemic:loc_hw'},'look');
 assert.equal(seen.out.result.epidemic.disease,'河泻症');assert.ok(seen.out.result.choices.some(x=>x.id==='purify'));
 const dock=(await s.run(c,'world_move',{destination:'loc_hw_dock'},'dock')).doc;
 await assert.rejects(intervene(dock,'purify','nospell'),/尚未学会/);
 c=(await s.run(c,'world_move',{destination:'bld_hw_herbs'},'go')).doc;
 const before=standing(s.engine,c.state,'loc_hw','player'),coins=c.state.player.coins;
 const done=await intervene(c,'treat','treat');c=done.doc;
 assert.equal(done.out.result.success,true);assert.equal(c.state.player.coins,coins-40);
 const ep=rec(c,'epidemic:epidemic:loc_hw:1');assert.equal(ep.measures.at(-1).measure,'treatment');
 const event=rec(c,'world_event:treat');assert.equal(event.verb,'help');assert.ok(event.tags.includes('hazard')&&event.tags.includes('treatment'));
 assert.ok(standing(s.engine,c.state,'loc_hw','player')>before);
 assert.equal(rec(c,'hazard-clock:epidemic:loc_hw').interventions.at(-1).choice,'treat');
 // Replaying the same call on the same save gives the same patches.
 const at=(await s.run(seen.doc,'world_move',{destination:'bld_hw_herbs'},'go')).doc;
 assert.deepEqual((await intervene(at,'treat','treat')).out.patches,done.out.patches);
});

test('疫病接 npc-life 病症：按病名发病、可致死，医师治疗降低病死率',async()=>{
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;if(!n.id.startsWith('npc_hw_'))delete n.tier;}
 const t=w.rules.hazardClock;Object.assign(t.diseases[0],{incubationDays:[1,1],courseDays:[4,4],householdRate:1,graveShare:1,fatality:{cared:1,alone:1}});
 const engine=new WorldEngine(w);assertHazardRules(engine);
 const doc=engine.createCharacter(legacy,{},'hazard-death'),d=draft(doc),at=(Math.floor(doc.state.minute/DAY)+1)*DAY;
 d.set(['state','minute'],at);
 assert.equal(applyEffects(d,engine,[{kind:'epidemic',disease:'disease_river_flux',settlement:'loc_hw',cases:3}],{settlement:'loc_hw',minute:at,sourceEvent:'seed',clock:'epidemic:loc_hw'},'world').applied,true);
 let now=at;
 for(let i=0;i<4;i++){const next=now+DAY;advanceHazardClocks(d,engine,{before:now,after:next});advanceNpcLife(d,engine,now,next);d.set(['state','minute'],next);now=next;}
 const ills=Object.values(d.get('state','family','illnesses')).filter(r=>r.epidemic==='epidemic:epidemic:loc_hw:1');
 assert.ok(ills.length);assert.ok(ills.every(r=>r.diseaseName==='河泻症'&&r.disease==='disease_river_flux'));
 const deaths=Object.values(d.get('state','family','deaths')??{}).filter(x=>ills.some(r=>r.id===x.illness));
 assert.ok(deaths.length);assert.ok(deaths.every(x=>x.cause==='病故'));
 const sick=ills.find(r=>r.status==='患病中');
 if(sick)assert.match(npcLifeLines(engine,d.get('state'),sick.patient).join(''),/河泻症/);
 // Treatment halves the odds of those in bed when the physician comes.
 const t2=draft(doc);t2.set(['state','minute'],at);
 applyEffects(t2,engine,[{kind:'epidemic',disease:'disease_river_flux',settlement:'loc_hw',cases:2}],{settlement:'loc_hw',minute:at,sourceEvent:'seed',clock:'epidemic:loc_hw'},'world');
 advanceHazardClocks(t2,engine,{before:at,after:at+DAY});advanceHazardClocks(t2,engine,{before:at+DAY,after:at+2*DAY});
 applyEffects(t2,engine,[{kind:'epidemic_measure',measure:'treatment',minutes:10*DAY}],{settlement:'loc_hw',minute:at+2*DAY,sourceEvent:'treat',clock:'epidemic:loc_hw'},'world');
 const treated=Object.values(t2.get('state','family','illnesses')).filter(r=>r.epidemic&&r.status==='患病中');
 assert.ok(treated.length);for(const r of treated){assert.equal(r.treated,'treat');assert.equal(r.fatality.alone,0.5);}
});

test('既有四个粮食复核时钟结果不变：灾害另表、另记账',async()=>{
 const strip=w=>{delete w.rules.hazardClock;};
 const a=setup('clock-test'),b=setup('clock-test',strip);
 // 开局各村存粮 = 目标持有，买方没有需求、周贸易不发货，粮食复核时钟的"交割已核对"阶段无从到达；两边同样压低买方实存（前置条件在夹具里断言）。
 thinGranaries(a.engine,a.doc);thinGranaries(b.engine,b.doc);
 const grain=doc=>Object.values(doc.state.records).filter(r=>r.category==='world_clock');
 const x=await a.wait(a.doc,14*DAY-a.doc.state.minute),y=await b.wait(b.doc,14*DAY-b.doc.state.minute);
 assert.deepEqual(grain(x),grain(y));assert.equal(grain(x).length,4);assert.ok(grain(x).every(r=>r.phase===2));
 // Even with every hazard forced into spring the grain clocks pass the same stages.
 const f=setup('clock-test',spring);thinGranaries(f.engine,f.doc);
 const z=await f.wait(f.doc,14*DAY-f.doc.state.minute);
 const shape=rows=>rows.map(r=>({id:r.id,phase:r.phase,history:r.history.map(h=>({minute:h.minute,name:h.name,trigger:h.trigger.met,roll:h.roll}))}));
 assert.deepEqual(shape(grain(z)),shape(grain(y)));
 assert.ok(!Object.values(z.state.records).some(r=>r.category==='world_clock'&&r.id.includes(':loc_hw')));
});
