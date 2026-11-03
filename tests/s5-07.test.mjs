import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches,canonical} from '../server-plugin/storage.mjs';
import {waterBasins,waterConnections,basinState,advanceWaterCycle,farmWaterFactor} from '../server-plugin/water-cycle.mjs';
import {advanceNpcLife} from '../server-plugin/npc-life.mjs';
import {applyEffects} from '../server-plugin/effects.mjs';
import {openObligation,closeObligation,dueObligation} from '../server-plugin/obligation-runtime.mjs';
import {advanceWildlifeAwakening} from '../server-plugin/wildlife-awakening.mjs';
import {faithRainQuota,advanceFaith} from '../server-plugin/faith.mjs';
import {groupAccountView} from '../server-plugin/group-account.mjs';
import {trackSingleItem} from '../server-plugin/items.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {advanceAgriculture} from '../server-plugin/agriculture.mjs';
import {verifyPublished as verifyRainPublished} from '../world/design/s507-rain-approval.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const upstream='basin:loc_hw',downstream='basin:loc_yandu',pool='feature_hw_pool';
const edge=to=>`${upstream}:${to}`;
// Only loc_hw drinks; every other settlement stays registered (its town food accounts need the row) with nobody to drink.
const settlementsFor=(rows,use)=>Object.fromEntries(Object.entries(rows).map(([id,row])=>[id,{...row,population:id==='loc_hw'?use/100:0}]));
function scene({use=0,dirty=false,modifiers=[],declared=true}={}){
 const w=structuredClone(world);
 // Rain, evaporation and farm demand are not the subjects of these river
 // assertions. Author parameters isolate the real native daily water clock.
 Object.assign(w.rules.forestWater.water,{rainShare:{clear:0,cloudy:0,rain:0,storm:0,snow:0,fog:0},evaporationShare:0,dailyFlowShare:0.5,drinkingMlPerPerson:100,irrigationMlPerArea:0});
 w.derived.modifiers.push(...modifiers);
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s507-water');
 const basins=waterBasins(engine),records={...initial.state.records};
 for(const b of basins){
  const water={...basinState(engine,initial.state,b),waterMl:b.id===upstream?1200:b.id===downstream?150:0,saltMg:b.id===upstream?120:0,toxinUg:b.id===upstream?24:0,turbidity:0,pathogenRisk:dirty&&b.id===upstream?80:0};
  if(b.id===upstream&&declared)water.outflow=waterConnections(engine,basins).edges.filter(e=>e.from===upstream).map(e=>({edge:e.id,share:e.to===pool?0.25:e.to===downstream?0.75:0}));
  records[`water-cycle:${b.id}`]={category:'water_cycle',location:b.location,initial:water.waterMl,water};
  if(b.feature)records[`physical_feature:${b.id}`]={id:b.id,category:'physical_feature',location:b.location,state:water};
 }
 // Explicit environmental premises use the same setup loader as native intent
 // scenarios; no synthetic locations, species, draft or runtime are installed.
 const out=applyIntentSetup(engine,initial,{minute:0,facts:[{path:['state','records'],value:records},{path:['state','settlements'],value:settlementsFor(initial.state.settlements,use)}]});
 assert.deepEqual(out.setupUnmet,[]);
 return {engine,document:out.document};
}
function day(f,n=0){
 const draft=f.engine.primitiveDraft(f.document);
 advanceWaterCycle(draft,f.engine,n);
 const document=applyPatches(f.document,draft.patches);
 assert.deepEqual(document,draft.document);
 return {...f,document};
}
const row=(f,id)=>f.document.state.records[`water-cycle:${id}`];
function conserved(f){
 for(const r of Object.values(f.document.state.records).filter(r=>r.category==='water_cycle')){
  assert.equal(r.initial+r.rain+r.inflow+r.externalDelta-r.outflow-r.consumed-r.evaporated-r.overflow,r.water.waterMl);
 }
}

test('半村降雨修正进入两村实际灌溉，水量账与田地供水分别按落区派生',()=>{
 const w=structuredClone(world);
 Object.assign(w.rules.forestWater.water,{rainShare:{clear:0.12,cloudy:0.12,rain:0.12,storm:0.12,snow:0.12,fog:0.12},evaporationShare:0,dailyFlowShare:0,drinkingMlPerPerson:0,irrigationMlPerArea:1000000000});
 w.derived.modifiers.push({id:'partial-rain',pack:'core',target:'weather:precipitation',stage:'mul',value:0.5,when:"subject == 'loc_bs_sangban'"});
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s507-rain');
 const villages=['loc_bs_yupo','loc_bs_sangban'],records=structuredClone(initial.state.records);
 for(const id of villages){
  const b=waterBasins(engine).find(b=>b.location===id),water={...basinState(engine,initial.state,b),waterMl:0,saltMg:0,toxinUg:0,pathogenRisk:0};
  records[`water-cycle:${b.id}`]={category:'water_cycle',location:id,initial:0,water};
  records[`agriculture:${id}`].field.areaUnits=1;
 }
 const out=applyIntentSetup(engine,initial,{minute:0,facts:[{path:['state','records'],value:records},{path:['state','settlements'],value:Object.fromEntries(villages.map(id=>[id,{...initial.state.settlements[id],population:0}]))}]});
 assert.deepEqual(out.setupUnmet,[]);
 const f=day({engine,document:out.document}),full=row(f,'basin:loc_bs_yupo'),half=row(f,'basin:loc_bs_sangban');
 // Capacity 500,000,000 * rain .12 = 60,000,000 ml; half area gets 30,000,000.
 assert.equal(full.rain,60000000);assert.equal(half.rain,30000000);
 assert.equal(full.farms.loc_bs_yupo.rainShare,1);assert.equal(half.farms.loc_bs_sangban.rainShare,0.5);
 // Full rainfall supplies the whole field, no irrigation; half rainfall uses
 // 30,000,000 / 1,000,000,000 = .03 irrigation. Yield = .35+.65*(.5+.03)=.6945.
 assert.equal(full.farms.loc_bs_yupo.takenMl,0);assert.equal(half.farms.loc_bs_sangban.takenMl,30000000);
 assert.equal(farmWaterFactor(engine,f.document.state,'loc_bs_yupo',0),1);
 assert.ok(Math.abs(farmWaterFactor(engine,f.document.state,'loc_bs_sangban',0)-0.6945)<1e-12);
 conserved(f);
});

test('上游先取用再按声明分水，下游读数不再次扣除同一水量',()=>{
 const natural=day(scene()),used=day(scene({use:400}));
 // 1200*.5=600; after 4 people*100 ml, (1200-400)*.5=400.
 // The pool gets 1/4 and Yandu gets 3/4 of that one outgoing budget.
 assert.equal(row(natural,upstream).outflow,600);
 assert.equal(row(used,upstream).consumed,400);
 assert.equal(row(used,upstream).outflow,400);
 assert.equal(row(used,upstream).water.waterMl,400);
 assert.equal(row(natural,downstream).inflow,450);
 assert.equal(row(used,downstream).inflow,300);
 assert.equal(row(used,pool).inflow,100);
 assert.equal(row(used,'feature_w5_echo_melt').inflow,0);
 conserved(natural);conserved(used);
 assert.equal(canonical(day(used).document),canonical(used.document),'重复同一日不再取水或传水');
});

test('污染沿实际支流稀释，溶质随分水守恒',()=>{
 const f=day(scene({dirty:true}));
 // Yandu has 150 clean ml + 450 ml at risk 80: 450*80/600=60.
 assert.equal(row(f,downstream).water.pathogenRisk,60);
 assert.equal(row(f,pool).water.pathogenRisk,80);
 // Source 120 mg salt and 24 ug toxin: half remains upstream.
 assert.equal(row(f,upstream).water.saltMg,60);
 assert.equal(row(f,upstream).water.toxinUg,12);
 assert.equal(row(f,pool).water.saltMg,15);
 assert.equal(row(f,pool).water.toxinUg,3);
 const rows=Object.values(f.document.state.records).filter(r=>r.category==='water_cycle');
 assert.ok(Math.abs(rows.reduce((n,r)=>n+r.water.saltMg,0)-120)<1e-9);
 assert.ok(Math.abs(rows.reduce((n,r)=>n+r.water.toxinUg,0)-24)<1e-9);
 conserved(f);
});

test('分水修正通过 S5-01 槽合成再归一，关闭支流不偷走余数',()=>{
 const f=day(scene({modifiers:[{id:'river-gate',pack:'core',target:'hydrology:split',stage:'mul',value:0,when:"subject == 'loc_hw' && target == 'basin:loc_yandu'"}]}));
 // Close the 3/4 branch: remaining 1/4 normalizes to 1, all 600 ml to pool.
 assert.equal(row(f,upstream).outflow,600);
 assert.equal(row(f,pool).inflow,600);
 assert.equal(row(f,downstream).inflow,0);
 assert.equal(row(f,'feature_w5_echo_melt').inflow,0);
 conserved(f);
});

test('未声明份额的正式水系均分，四条出边合计只花一个预算',()=>{
 const f=day(scene({declared:false}));
 // River Bay has four native outgoing edges: 1200*.5/4=150 per edge.
 assert.equal(row(f,upstream).outflow,600);
 assert.equal(row(f,pool).inflow,150);
 assert.equal(row(f,downstream).inflow,150);
 assert.equal(row(f,'feature_w5_echo_melt').inflow,150);
 conserved(f);
});

test('所有出边关闸时不强行把水送到末条支流',()=>{
 const f=day(scene({modifiers:[{id:'close-gates',pack:'core',target:'hydrology:split',stage:'mul',value:0,when:"subject == 'loc_hw'"}]}));
 // All gates closed: 1200 initial - 0 consumers - 0 outflow = 1200.
 assert.equal(row(f,upstream).water.waterMl,1200);
 assert.equal(row(f,upstream).outflow,0);
 assert.equal(row(f,pool).inflow,0);
 assert.equal(row(f,downstream).inflow,0);
 conserved(f);
});

test('分支整数尾差守恒，零份额支流不分到尾差',()=>{
 const f=scene();
 const records=structuredClone(f.document.state.records);
 records[`water-cycle:${upstream}`].water.waterMl=1102;
 records[`water-cycle:${upstream}`].initial=1102;
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:records}]});
 assert.deepEqual(setup.setupUnmet,[]);
 const out=day({...f,document:setup.document});
 // floor(1102*.5)=551; floor(551*.25)=137; the other branch gets 414.
 assert.equal(row(out,upstream).outflow,551);
 assert.equal(row(out,pool).inflow,137);
 assert.equal(row(out,downstream).inflow,414);
 assert.equal(row(out,'feature_w5_echo_melt').inflow,0);
 conserved(out);
});

test('非法分水不写入半份日结，零份额与合计错误不能混同',()=>{
 const f=scene(),records=structuredClone(f.document.state.records),r=records[`water-cycle:${upstream}`];
 r.water.outflow=r.water.outflow.map(s=>({...s,share:0}));
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:records}]});
 assert.deepEqual(setup.setupUnmet,[]);
 const before=canonical(setup.document),draft=f.engine.primitiveDraft(setup.document);
 assert.throws(()=>advanceWaterCycle(draft,f.engine,0),/份额合计为一/);
 assert.equal(canonical(draft.document),before);
 assert.equal(canonical(setup.document),before);
 // No accepted settlement or transfer occurred on the rejected day.
 assert.equal(r.water.waterMl,1200);
});

test('水文逐日步长、补丁及 JSON 存档往返一致',()=>{
 const f=scene({dirty:true}),draft=f.engine.primitiveDraft(f.document);
 for(let n=0;n<3;n++)advanceWaterCycle(draft,f.engine,n);
 let stepped=f;
 for(let n=0;n<3;n++)stepped=day({...stepped,document:JSON.parse(JSON.stringify(stepped.document))},n);
 assert.deepEqual(stepped.document,applyPatches(f.document,draft.patches));
 assert.deepEqual(stepped.document,draft.document);
 // Three half-outflows: 1200/2/2/2=150 ml left upstream.
 assert.equal(row(stepped,upstream).water.waterMl,150);
 conserved(stepped);
});

test('真实等待三天与每天等待并重载存档的水文账相同',async()=>{
 const f=scene({dirty:true});
 const wait=async(document,minutes,eventId)=>{
  const out=await f.engine.reduce(document,{tool:'world_time',args:{minutes},eventId});
  return applyPatches(document,out.patches);
 };
 const long=await wait(f.document,3*1440,'long');
 let short=f.document;
 for(let n=0;n<3;n++)short=await wait(JSON.parse(JSON.stringify(short)),1440,`day-${n}`);
 const water=document=>Object.fromEntries(Object.entries(document.state.records).filter(([,r])=>r.category==='water_cycle'));
 assert.deepEqual(water(long),water(short));
 // Three daily half-outflows leave 1200 / 2^3 = 150 ml at River Bay.
 assert.equal(long.state.records[`water-cycle:${upstream}`].water.waterMl,150);
 conserved({...f,document:long});conserved({...f,document:short});
});

function ageing({immortal=false,catchUp=false,rate=1,companion=false,maxima=[]}={}){
 const w=structuredClone(world),id='npc_hw_zhongxiu';
 // Explicit author lifecycle declarations exercise the one production clock.
 // No new catch-up constant is published: one year is the tested rule input.
 w.rules.npcLife.lifecycle={lifespan:immortal?null:62,agingCatchUp:1};
 w.rules.npcLife.health.bands=[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0},{fromAge:60,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0.36}];
 if(rate!==1)w.derived.modifiers.push({id:'aging-rate',pack:'core',target:'life:aging',stage:'mul',value:rate});
 for(const [n,value] of maxima.entries())w.derived.modifiers.push({id:`lifespan-${n}`,pack:'core',target:'life:lifespan',stage:'max',value});
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s507-age');
 const person={...initial.state.npcs[id],life:true,attributes:Object.fromEntries(w.rules.attributes.map(a=>[a,10])),
  ...(catchUp?{aging:{minute:0,lifespan:124,riskAge:35,catchUpRemaining:0,annualRisk:0}}:{})};
 const out=applyIntentSetup(engine,initial,{minute:0,facts:[{path:['state','npcs'],value:{[id]:person}},
  {path:['state','created'],value:{...initial.state.created,[id]:{id,age:70}}},
  {path:['state','player'],value:{...initial.state.player,companions:companion?[id]:[]}}]});
 assert.deepEqual(out.setupUnmet,[]);
 return {engine,document:out.document,id};
}
function ageFor(f,before,after){
 const d=f.engine.primitiveDraft(f.document);advanceNpcLife(d,f.engine,before,after);
 return {...f,document:applyPatches(f.document,d.patches)};
}

test('寿命骤降按物种 catch-up 逐日补老，离屏长算与逐日重载等价',()=>{
 const f=ageing({catchUp:true}),one=ageFor(f,0,1440),person=one.document.state.npcs[f.id];
 // Age 70, lifespan 124 -> 62, human-equivalent age previously 35.
 // One day: 35 + 1/360 ordinary + 35/360 catch-up = 35.1, not 70 or death.
 assert.ok(Math.abs(person.aging.riskAge-35.1)<1e-10);
 assert.equal(person.aging.annualRisk,0);assert.equal(person.attributes.力量,10);
 assert.equal(person.diedAt,undefined);
 const long=ageFor(f,0,30*1440);
 let short=f;for(let n=0;n<30;n++)short=ageFor({...short,document:JSON.parse(JSON.stringify(short.document))},n*1440,(n+1)*1440);
 assert.deepEqual(long.document.state.npcs[f.id].aging,short.document.state.npcs[f.id].aging);
 // Linear one-year catch-up + normal aging: 35 + 30/360 + 35*30/360 = 38.
 assert.ok(Math.abs(long.document.state.npcs[f.id].aging.riskAge-38)<1e-9);
 assert.equal(long.document.state.npcs[f.id].diedAt,undefined);
});

test('老化写入实际检定属性并读取 life:aging，不老生命不老化',()=>{
 // Attr decay is the subject here; the existing companion rule defers death.
 // The catch-up test above remains off screen with no companion protection.
 const f=ageing({companion:true}),normal=ageFor(f,0,360*1440),person=normal.document.state.npcs[f.id];
 // Existing approved attribute table: body loses .4/year, mind .3/year.
 assert.ok(Math.abs(person.attributes.力量-9.6)<1e-9);
 assert.ok(Math.abs(person.attributes.精神-9.7)<1e-9);
 // Last band .36; at 71 equivalent years its survival hazard is .64^(71/60).
 assert.ok(Math.abs(person.aging.annualRisk-0.41027939481513465)<1e-9);
 const stopped=ageing({rate:0}),halted=ageFor(stopped,0,30*1440).document.state.npcs[stopped.id];
 assert.equal(halted.attributes.力量,10);
 const accelerated=ageing({rate:2,companion:true}),faster=ageFor(accelerated,0,360*1440).document.state.npcs[accelerated.id];
 // Two years of biological aging in one calendar year: 10 - .4*2 = 9.2.
 assert.ok(Math.abs(faster.attributes.力量-9.2)<1e-9);
 const timeless=ageing({immortal:true}),immortal=ageFor(timeless,0,360*1440).document.state.npcs[timeless.id];
 assert.equal(immortal.attributes.力量,10);assert.equal(immortal.attributes.精神,10);
 assert.equal(immortal.aging.annualRisk,0);assert.equal(immortal.diedAt,undefined);
});

test('不老例外来自实际物种 lifecycle，不能对精怪套用人类衰老',()=>{
 const w=structuredClone(world),species='monster_tile_lamp_wraith',id='creature_s507_timeless';
 w.monsters.find(m=>m.id===species).lifecycle={lifespan:null};
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s507-timeless');
 const setup=applyIntentSetup(engine,initial,{instances:[{id,kind:'creature',template:'agent',species,location:'loc_hw'}]});
 assert.deepEqual(setup.setupUnmet,[]);
 // Birth date and existing attributes are premises, not a manufactured species.
 const premise=applyIntentSetup(engine,setup.document,{facts:[{path:['state','npcs'],value:{}},
  {path:['state','creatures'],value:{...setup.document.state.creatures,[id]:{...setup.document.state.creatures[id],bornAt:-1000*360*1440,attributes:{力量:10,精神:10}}}}]});
 assert.deepEqual(premise.setupUnmet,[]);
 const f=ageFor({engine,document:premise.document},0,2*1440),actor=f.document.state.creatures[id];
 assert.equal(actor.attributes.力量,10);assert.equal(actor.attributes.精神,10);
 assert.equal(actor.aging.annualRisk,0);assert.equal(actor.aging.riskAge,0);
 assert.equal(actor.hp,setup.document.state.creatures[id].hp);
});

test('延寿读取 max 修正槽，两项延寿不相加',()=>{
 const f=ageing({maxima:[124,186]}),out=ageFor(f,0,1440).document.state.npcs[f.id];
 // max(human base 62, gift 124, cultivation 186) = 186, not 372.
 assert.equal(out.aging.lifespan,186);assert.equal(out.aging.annualRisk,0);
 assert.equal(out.attributes.力量,10);
});

test('真实播种后的霜灾减苗不免租，债权人才能另行减免',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s507-frost'),creditor='npc_hw_linsui';
 const loc='loc_hw_fields',npcs=structuredClone(initial.state.npcs);
 Object.assign(npcs[creditor],{location:loc,languages:['lang:common']});
 const setup=applyIntentSetup(engine,initial,{minute:6*1440,location:loc,inventory:{item_wheat_seed:20,item_hoe:1,item_oats:20},facts:[
  {path:['state','npcs'],value:npcs},{path:['state','player'],value:{...initial.state.player,languages:['lang:common']}},
  {path:['state','buildings'],value:{...initial.state.buildings,[loc]:{...initial.state.buildings[loc],owner:'player',condition:100}}}
 ]});
 assert.deepEqual(setup.setupUnmet,[]);
 const sown=await engine.reduce(setup.document,{tool:'world_farm',args:{operation:'private_sow',areaMu:2,item:'item_wheat_seed'},eventId:'frost-sow'});
 let document=applyPatches(setup.document,sown.patches),field=document.state.records[`private-farm:${loc}`];
 assert.equal(field.seed,4); // 2 mu * 2 jin/mu * .5 kg/jin / .5 kg/seed = 4.
 // The already elapsed growing period and parties' presence are premises;
 // the real frost effect and the earned rent claim remain under examination.
 const premises=applyIntentSetup(engine,document,{facts:[
  {path:['state','records'],value:{...document.state.records,[field.id]:{...field,qualitySum:10,qualityDays:10}}},
  {path:['state','npcs'],value:{...document.state.npcs,[creditor]:{...document.state.npcs[creditor],location:loc,languages:['lang:common']}}}
 ]});
 assert.deepEqual(premises.setupUnmet,[]);
 const d=engine.primitiveDraft(premises.document),at=d.get('state','minute');
 openObligation(d,engine,{id:'frost-rent',kind:'rent',actor:'player',debtor:'player',creditor,amount:100,deadline:at+1440,terms:{fieldAreaMu:2}},'rent-signed');
 const damage=applyEffects(d,engine,[{kind:'crop_damage',settlement:'loc_hw',percent:70,minutes:1440,cause:'frost'}],{minute:at,sourceEvent:'frost',settlement:'loc_hw'},'world');
 assert.equal(damage.applied,true);
 assert.equal(d.get('state','records',field.id,'qualitySum'),3); // 10 * (1 - .70) = 3.
 assert.equal(dueObligation(d.get('state'),'frost-rent',at).owed,100);
 assert.throws(()=>closeObligation(d,engine,{id:'frost-rent',actor:'player',party:'player',reason:'creditor_waiver'},'invalid-waiver'),/creditor/);
 assert.equal(dueObligation(d.get('state'),'frost-rent',at).owed,100);
 closeObligation(d,engine,{id:'frost-rent',actor:creditor,party:creditor,reason:'creditor_waiver'},'creditor-waiver');
 assert.equal(dueObligation(d.get('state'),'frost-rent',at).owed,0);
});

test('建筑成精须有真实年岁、逐日时钟与 causes，未知建造时间不凭空补生灵',()=>{
 const w=structuredClone(world),id='bld_hw_home_20';
 w.locations.find(l=>l.id===id).lifecycle={awaken:{minimumYears:1,annualRisk:1,species:'monster_tile_lamp_wraith'}};
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s507-object');
 const at=721*1440;
 const setup=applyIntentSetup(engine,initial,{minute:at,facts:[{path:['state','buildings'],value:{...initial.state.buildings,[id]:{...initial.state.buildings[id],builtAt:0,condition:100}}}]});
 assert.deepEqual(setup.setupUnmet,[]);
 const d=engine.primitiveDraft(setup.document);advanceWildlifeAwakening(d,engine,720);
 const clock=d.get('state','records',`object-awakening:${id}`);
 // At 721 days, age > 2 years. Declared annual hazard 1 after year 1 -> daily 1.
 assert.equal(clock.filled,1);assert.equal(clock.lastDay,720);
 const spirit=d.get('state','creatures',clock.creature);
 assert.equal(spirit.origin,'spirit:object');assert.equal(spirit.anchor,id);
 assert.ok(spirit.causes.some(c=>c.kind==='age'&&c.madeAt===0));
 assert.equal(d.get('holdings','entities',clock.creature,'origin'),'spirit:object');
 assert.equal(engine.scoped(d.document).resolve(clock.creature),clock.creature);
 const before=canonical(d.document);advanceWildlifeAwakening(d,engine,720);
 assert.equal(canonical(d.document),before);
 const unknown=engine.primitiveDraft(initial);advanceWildlifeAwakening(unknown,engine,720);
 assert.equal(unknown.get('state','records',`object-awakening:${id}`),undefined);
 // A new native campaign may omit the creature partition until first creation;
 // absence still means exactly zero spirits, with the same assertion intent.
 assert.equal(Object.values(unknown.get('state','creatures')??{}).filter(c=>c.anchor===id).length,0);
});

test('器物成精保持原物与钱物数量，时钟及单一生灵在存档后继续',()=>{
 const w=structuredClone(world),item='item_clay_oil_lamp';
 w.items.find(r=>r.id===item).lifecycle={awaken:{minimumYears:1,annualRisk:1,species:'monster_tile_lamp_wraith'}};
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s507-lamp');
 const setup=applyIntentSetup(engine,initial,{inventory:{[item]:1},minute:721*1440});assert.deepEqual(setup.setupUnmet,[]);
 const d=engine.primitiveDraft(setup.document),unit=trackSingleItem(d,engine,'player',item,'identify-lamp');
 // Existing inventory is registered by the real identity operation. Creation
 // date is a declared historical premise; no craft success is being examined.
 const known=applyIntentSetup(engine,d.document,{facts:[{path:['state','itemInstances',unit],value:{...d.get('state','itemInstances',unit),madeAt:0}}]});
 assert.deepEqual(known.setupUnmet,[]);
 const clock=engine.primitiveDraft(known.document),coins=known.document.state.player.coins;
 advanceWildlifeAwakening(clock,engine,720);
 const spirit=clock.get('state','records',`object-awakening:${unit}`,'creature');assert.ok(spirit);
 assert.equal(clock.get('state','records',`object-awakening:${unit}`,'filled'),1);
 assert.equal(clock.get('state','inventory',item,'quantity'),1);assert.equal(clock.get('state','player','coins'),coins);
 assert.equal(clock.get('state','creatures',spirit,'anchor'),unit);
 const reloaded=engine.primitiveDraft(JSON.parse(JSON.stringify(clock.document)));
 advanceWildlifeAwakening(reloaded,engine,721);
 assert.equal(reloaded.get('state','records',`object-awakening:${unit}`,'creature'),spirit);
 assert.equal(Object.values(reloaded.get('state','creatures')).filter(r=>r.anchor===unit).length,1);
});

test('E18：一次真实求雨效果分全村与半村受益，供献转账及下一季配额不造钱',async()=>{
 // The approved publication is the actual runtime rule, including both rain
 // footprints. Only unrelated natural weather and water demand are premises.
 assert.equal((await verifyRainPublished()).verified,2);
 for(const scenario of [
  {seed:'s507-E18-reverse',villages:['loc_bs_yupo','loc_bs_sangban'],donors:['npc_yp_zhaofeng','npc_sb_zhangluo']},
  {seed:'s507-E18',villages:['loc_bs_sangban','loc_bs_yupo'],donors:['npc_sb_zhangluo','npc_yp_zhaofeng']}
 ]){
 const w=structuredClone(world),seat='bld_bs_reed_dao',temple=`temple:${seat}:deity_bank`,rite='bank_rain';
 Object.assign(w.rules.forestWater.water,{rainShare:{clear:0,cloudy:0,rain:0.12,storm:0.12,snow:0,fog:0},evaporationShare:0,dailyFlowShare:0,drinkingMlPerPerson:0,irrigationMlPerArea:10000000});
 // A declared weather sequence makes natural precipitation zero; the new
 // effect supplies the only rain; the published faith rule is left intact.
 w.rules.weather.seasonalWeights=w.rules.weather.seasonalWeights.map(()=>[1,0,0,0,0,0]);
 w.rules.weather.persistence=0;
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},scenario.seed);
 const {donors,villages}=scenario;
 const records=structuredClone(initial.state.records),npcs=structuredClone(initial.state.npcs);
 for(const id of villages){
  const b=waterBasins(engine).find(b=>b.location===id),water={...basinState(engine,initial.state,b),waterMl:0,saltMg:0,toxinUg:0,pathogenRisk:0};
  records[`water-cycle:${b.id}`]={category:'water_cycle',location:id,initial:0,water};records[`agriculture:${id}`].field.areaUnits=100;
  // Already-sown crops are a declared prerequisite, not a test of sowing:
  // 179 completed warm growth/quality days at factor 1; today is day 180.
  records[`agriculture:${id}`].lastDay=-1;
  records[`agriculture:${id}`].field.cohorts=[{id:`E18:${id}`,sownDay:-179,areaUnits:100,grownDays:179,qualitySum:179,qualityDays:179,ready:false,harvestedUnits:0,harvestedFood:0}];
 }
 for(const id of donors)Object.assign(npcs[id],{location:seat,coins:30,faith:{deity:'deity_bank',temple,observedSince:0,lastBreach:-1},status:'正常'});
 const setup=applyIntentSetup(engine,initial,{location:seat,minute:0,coins:100,facts:[{path:['state','records'],value:records},{path:['state','npcs'],value:npcs},
  {path:['state','settlements'],value:Object.fromEntries(villages.map(id=>[id,{...initial.state.settlements[id],population:0}]))}]});
 assert.deepEqual(setup.setupUnmet,[]);
 // Native donation opens the actual group account and transfers one real coin.
 const given=await engine.reduce(setup.document,{tool:'world_settlement',args:{operation:'faith_give',org:temple,coins:1},eventId:'E18-initial-offering'});
 const document=applyPatches(setup.document,given.patches);let d=engine.primitiveDraft(document);
 assert.equal(groupAccountView(engine,d.get('state'),temple).coins,1);
 assert.equal(faithRainQuota(engine,d.document,temple,rite).remaining,1);
 const response=applyEffects(d,engine,[{kind:'faith_rain',temple,rite}],{minute:0,sourceEvent:'E18-rain'},'world');
 assert.equal(response.applied,true);assert.equal(faithRainQuota(engine,d.document,temple,rite).remaining,0);
 const second=applyEffects(d,engine,[{kind:'faith_rain',temple,rite}],{minute:0,sourceEvent:'E18-second'},'world');
 assert.equal(second.applied,false);assert.equal(d.get('state','records','faith-rain:E18-second'),undefined);
 advanceWaterCycle(d,engine,0);
 // Rain source .12 * 500M capacity; half village .06 * 500M.
 assert.equal(d.get('state','records',`water-cycle:basin:${villages[0]}`,'rain'),60000000);
 assert.equal(d.get('state','records',`water-cycle:basin:${villages[1]}`,'rain'),30000000);
 assert.equal(d.get('state','records',`water-cycle:basin:${villages[0]}`,'farms',villages[0],'factor'),1);
 assert.ok(Math.abs(d.get('state','records',`water-cycle:basin:${villages[1]}`,'farms',villages[1],'factor')-0.6945)<1e-12);
 assert.equal(d.get('state','records',`rain-benefit:E18-rain:${villages[0]}`,'share'),1);
 assert.equal(d.get('state','records',`rain-benefit:E18-rain:${villages[1]}`,'share'),0.5);
 for(const id of villages)advanceAgriculture(d,engine,id,d.get('state','settlements',id),0);
 // 100 units = 1 ha; clear weather crop multiplier is .9.
 // Full: floor(1700*(179+.9*1)/180)=1699.
 // Half: floor(1700*(179+.9*.6945)/180)=1696.
 assert.equal(d.get('state','records',`agriculture:${villages[0]}`,'field','cohorts')[0].grownFood,1699);
 assert.equal(d.get('state','records',`agriculture:${villages[1]}`,'field','cohorts')[0].grownFood,1696);
 // The donors' completed stay is not the tested journey; the native faith
 // clock sees them at the actual temple, so no remote purse is teleported.
 const elapsed=applyIntentSetup(engine,d.document,{minute:1440});assert.deepEqual(elapsed.setupUnmet,[]);
 d=engine.primitiveDraft(elapsed.document);advanceFaith(d,engine,{after:1440});
 assert.equal(d.get('state','npcs',donors[0],'coins'),18); // 30 - floor(12*1).
 assert.equal(d.get('state','npcs',donors[1],'coins'),24); // 30 - floor(12*.5).
 assert.equal(groupAccountView(engine,d.get('state'),temple).coins,19); // 1+12+6.
 const saved=JSON.parse(JSON.stringify(d.document)),again=engine.primitiveDraft(saved);
 advanceFaith(again,engine,{after:1440});assert.equal(groupAccountView(engine,again.get('state'),temple).coins,19);
 // Next season: base 1 + floor(previous-season income 19 / 6) = 4.
 assert.equal(faithRainQuota(engine,again.document,temple,rite,90*1440).limit,4);
 assert.equal(faithRainQuota(engine,again.document,temple,rite,90*1440).remaining,4);
 // The player's and donors' loss equals treasury growth, including the first gift.
 assert.equal(again.get('state','player','coins')+again.get('state','npcs',donors[0],'coins')+again.get('state','npcs',donors[1],'coins')+groupAccountView(engine,again.get('state'),temple).coins,160);
 assert.deepEqual(auditLedger(again.document.ledger),[]);
 }
});

test('原生祭仪入口实际扣供品、钱与本季雨额，不以显兆冒充降雨',async()=>{
 const w=structuredClone(world),seat='bld_bs_reed_dao',temple=`temple:${seat}:deity_bank`,rite=w.rules.faith.rites.find(r=>r.id==='bank_rain');
 // S5-07's approved rite retains three actual participants. Their already
 // given scoped consent and their completed journey are not under examination.
 const workers=['npc_yp_zhaofeng','npc_sb_zhangluo'];
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s507-native-rite'),host='npc_bs_077_1';
 const npcs=structuredClone(initial.state.npcs);
 for(const id of [host,...workers])Object.assign(npcs[id],{location:seat,activity:'授课',status:'正常'});
 for(const id of workers)npcs[id].faith={deity:'deity_bank',temple,observedSince:0,lastBreach:-1};
 const setup=applyIntentSetup(engine,initial,{location:seat,minute:3*1440+540,coins:100,inventory:{item_resin:10},
  history:workers.map(id=>({id:`rain-consent:${id}`,verb:'consented',actor:id,to:'player',scope:'rite',subject:temple,terms:{purpose:rite.id},at:0,expires:10000,revoked:false,source:{kind:'corpus_premise',row:'S507E'}})),facts:[
  {path:['state','npcs'],value:npcs},
  {path:['state','player'],value:{...initial.state.player,coins:100,faith:{deity:'deity_bank',temple,observedSince:0,lastBreach:-1}}}
 ]});assert.deepEqual(setup.setupUnmet,[]);
 const out=await engine.reduce(setup.document,{tool:'world_settlement',args:{operation:'faith_rite',org:temple,choice:rite.id,workers},eventId:'E18-native'});
 const document=applyPatches(setup.document,out.patches);
 assert.equal(out.result.response.applied,true);
 assert.equal(document.state.player.coins,98);assert.equal(document.state.inventory.item_resin.quantity,9);
 assert.equal(groupAccountView(engine,document.state,temple).coins,2);
 assert.equal(faithRainQuota(engine,document,temple,rite.id).remaining,0);
 assert.equal(document.state.records['faith-rain:E18-native'].coverage[0].share,0.5);
 assert.equal(document.state.records['faith-rain:E18-native'].coverage[1].share,1);
});
