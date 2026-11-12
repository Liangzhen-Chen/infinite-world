import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,canonical,withRecordIndex,PatchCursor} from '../server-plugin/storage.mjs';
import {forestSites,forestView,harvestForest,harvestSettlementWood,settleFuel,advanceForestWater,forestHabitatCapacity,displaceForestWildlife} from '../server-plugin/forest-water.mjs';
import {waterBasins,waterConnections,advanceWaterCycle,farmWaterFactor,waterExposure,waterResourceFactor} from '../server-plugin/water-cycle.mjs';
import {regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {advanceHazardClocks} from '../server-plugin/seasonal-hazards.mjs';
import {advanceAgriculture} from '../server-plugin/agriculture.mjs';
import {mealMouthsOf} from '../server-plugin/primitives-body.mjs';
import {resupplyDays} from '../server-plugin/supply-interval.mjs';
import {handSelfReserve} from './helpers/hand-targets.mjs';
import {woodcut} from '../server-plugin/sites.mjs';
import {siteAction} from '../server-plugin/sites.mjs';
import {environmentCatalog} from '../server-plugin/environment.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
function draft(doc){return {document:structuredClone(doc),get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
 set(p,v){let target=this.document;for(const k of p.slice(0,-1))target=target[k]??= {};target[p.at(-1)]=structuredClone(v);},
 remove(p){let t=this.document;for(const k of p.slice(0,-1))t=t[k];delete t[p.at(-1)];},say(){}};}
function setup(mutate=()=>{}){
 const w=structuredClone(source);for(const n of w.npcs){delete n.tier;delete n.schedule;}mutate(w);
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'forest-water');return {w,engine,doc,d:draft(doc)};
}
const water=(id,volume,risk=0)=>({id,name:id,kind:'water',owner:'player',access:'public',position:[0,0],state:{capacityMl:1000000,waterMl:volume,pathogenRisk:risk,saltMg:1000,toxinUg:100,turbidity:10,odor:'原水'}});
function river({use=0,pollution=0,rain=0}={}){
 const x=setup(w=>{
  for(const l of w.locations){delete l.site;delete l.features;delete l.biome;l.terrain='平地';} for(const o of Object.values(w.mechanics?.locations??{}))delete o.site;/* 夹具要无据点的世界：连机制覆盖层的据点一并去掉，否则覆盖层把无 quantity 的据点加回而 biome 已删、无从派生 */
  const down=w.locations.find(l=>l.id==='loc_hw');down.features=[water('feature_rw_down',10000)];down.elevationMeters=0;
  w.locations.push({id:'loc_rw_up',name:'上游测试地',parent:null,coordinates:[0,100],terrain:'丘陵',elevationMeters:100,features:[water('feature_rw_up',900000,pollution)]});
  w.rules.weather.regions[0].locations.push('loc_rw_up');
  w.routes=[{id:'route_rw_river',from:'loc_rw_up',to:'loc_hw',modes:['boat'],lengthKm:1,closedSeasons:[]}];
  const r=w.rules.forestWater.water;for(const kind of Object.keys(r.rainShare))r.rainShare[kind]=rain;
  Object.assign(r,{dailyFlowShare:0.5,evaporationShare:0,drinkingMlPerPerson:use,irrigationMlPerArea:0,exposureRate:1});
  w.rules.agriculture.settlements=w.rules.agriculture.settlements.filter(p=>p.settlement==='loc_hw');
  w.rules.hazardClock.clocks=[];
 });
 // All settlement withdrawals remain explicit and local in this river fixture.
 x.d.document.state.settlements={loc_rw_up:{population:100},loc_hw:{...x.doc.state.settlements.loc_hw,population:100}};
 return x;
}
const feature=(d,id)=>d.get('state','records',`physical_feature:${id}`)?.state;

test('流域目录随真实产粮名册变化，日内水量改变仍立即影响资源系数',()=>withRecordIndex(()=>{
 const location={id:'loc_water_producer',terrain:'平地'},engine={world:{locations:[location],routes:[]},byId:new Map([[location.id,location]]),rules:{forestWater:{water:source.rules.forestWater.water},agriculture:{settlements:[]}}};
 const cursor=new PatchCursor({state:{settlements:{[location.id]:{granary:false,foodPerDay:1}},records:{}}});
 const read=()=>cursor.expose(cursor.root.state),set=(path,value)=>{cursor.apply({op:'set',path:['state',...path],value});return read();};
 let state=read();
 assert.deepEqual(waterBasins(engine,state),[]);
 state=set(['settlements',location.id,'food'],100);assert.deepEqual(waterBasins(engine,state),[]);
 state=set(['settlements',location.id,'granary'],true);
 const basin=waterBasins(engine,state)[0];assert.equal(basin.id,`basin:${location.id}`);
 const opening=Math.floor(basin.capacity*engine.rules.forestWater.water.initialShare);
 state=set(['records',`water-cycle:${basin.id}`],{category:'water_cycle',water:{waterMl:opening}});
 assert.equal(waterResourceFactor(engine,state,location.id),1);
 // Hand anchor: withdrawing half the real opening water doubles scarcity,
 // even within the same day; no daily cache may hide this physical change.
 state=set(['records',`water-cycle:${basin.id}`,'water','waterMl'],opening/2);
 assert.equal(waterResourceFactor(engine,state,location.id),2);
 state=set(['settlements',location.id,'foodPerDay'],0);
 assert.deepEqual(waterBasins(engine,state),[]);
}));
function assertWaterLedger(d){
 for(const r of Object.values(d.get('state','records')).filter(r=>r.category==='water_cycle')){
  assert.ok(Math.abs(r.initial+r.rain+r.inflow+r.externalDelta-r.outflow-r.consumed-r.evaporated-r.overflow-r.water.waterMl)<0.001,r.location);
  assert.ok(r.water.waterMl>=0&&r.water.waterMl<=r.water.capacityMl);
 }
}

test('林种由K8地形性状派生；耗尽后缺柴、涨价和事件，休伐按时恢复并守恒',()=>{
 const {engine,d}=setup(),id='loc_hw_northwood',site=forestSites(engine).find(s=>s.location===id),day=Math.floor(d.get('state','minute')/DAY);
 assert.equal(site.kind,'broadleaf');assert.ok(forestSites(engine).some(s=>s.kind==='conifer'));
 assert.ok(forestSites(engine).some(s=>s.location==='loc_wild_yp_north'),'现有地形只写丘陵的再生枯枝，由实际木质特征补足林木来源');
 const before=canonical(d.document);forestView(engine,d.get('state'),id);assert.equal(canonical(d.document),before,'只读不写事实');
 const price=regionalTradePrice(d,engine,'item_wood','loc_hw');
 for(const s of forestSites(engine))harvestForest(d,engine,s.location,s.capacity);
 assert.equal(harvestForest(d,engine,id,1),0);
 assert.equal(harvestSettlementWood(d,engine,'loc_hw',10,d.get('state','minute')),0);
 const s={...d.get('state','settlements','loc_hw'),wood:0};settleFuel(d,engine,'loc_hw',s,0,day);
 assert.equal(s.wood,0);assert.ok(d.get('state','records','forest-supply:loc_hw').shortage>0);
 assert.ok(regionalTradePrice(d,engine,'item_wood','loc_hw')>price);
 assert.ok(Object.values(d.get('state','records')).some(r=>r.category==='world_event'&&r.tags.includes('fuel_shortage')&&r.tags.includes('entity-transition')&&r.summary.includes('缺柴')));
 advanceForestWater(d,engine,day+400);
 // D05 5.5: zero stock cannot reproduce. Keep shortage/price/event coverage
 // above, and test recovery separately from surviving 20% stocks below.
 const empty=d.get('state','records',`forest:${id}`);assert.equal(empty.reserve,0);assert.equal(empty.initial+empty.grown-empty.harvested,0);
 const recovering=setup();for(const s of forestSites(recovering.engine))harvestForest(recovering.d,recovering.engine,s.location,Math.floor(s.capacity*0.8));
 // Published broadleaf r=.0008/day: ordinary N=6000,K=54000 plus 6000
 // old wood crosses 15000 after about 600 days, rather than a linear 400.
 advanceForestWater(recovering.d,recovering.engine,day+600);
 const r=recovering.d.get('state','records',`forest:${id}`);assert.ok(r.reserve>site.capacity*0.25);assert.equal(r.initial+r.grown-r.harvested,r.reserve);
 assert.ok(r.updatedAt>recovering.d.get('state','minute'));assert.ok(Object.values(recovering.d.get('state','records')).some(r=>r.category==='world_event'&&r.tags.includes('forest_recovered')));
});

test('过伐收窄真实栖地容量，野物沿既有路移往有余量的兼容栖地，数量守恒',()=>{
 const {engine,d}=setup(w=>{
  const base=w.locations.find(l=>l.id==='loc_hw_northwood');
  w.locations.push({...structuredClone(base),id:'loc_rw_forest',name:'测试林',parent:'loc_hw',areaKm2:2});
  w.routes.push({id:'route_rw_forest',from:base.id,to:'loc_rw_forest',modes:['walk'],lengthKm:1,closedSeasons:[]});
 });
 const h=engine.rules.wildlife.habitats.find(h=>h.location==='loc_hw_northwood'),to=engine.rules.wildlife.habitats.find(h=>h.location==='loc_rw_forest');
 const species=engine.byId.get('monster_brown_deer'),a=d.get('state','records',`ecology:${h.id}`),b=d.get('state','records',`ecology:${to.id}`);
 assert.ok(b.populations[species.id]);const total=a.populations[species.id].count+b.populations[species.id].count;
 const capacity=forestHabitatCapacity(engine,d.get('state'),h,species);
 harvestForest(d,engine,h.location,forestView(engine,d.get('state'),h.location).capacity);
 assert.ok(forestHabitatCapacity(engine,d.get('state'),h,species)<capacity);
 displaceForestWildlife(d,engine,0);
 const p=d.get('state','records',`ecology:${h.id}`,'populations',species.id),q=d.get('state','records',`ecology:${to.id}`,'populations',species.id);
 assert.equal(p.count+q.count,total);assert.ok(p.emigrated>0);assert.equal(q.immigrated,p.emigrated);
 assert.equal(p.initial+p.born+p.immigrated-p.emigrated-p.predated-p.starved-p.withdrawn,p.count);
});

test('上游取水减少下游实际补给，流向由地形与河道路网派生，水量和溶质守恒',()=>{
 const natural=river(),used=river({use:3000}),day=Math.floor(natural.d.get('state','minute')/DAY);
 const graph=waterConnections(natural.engine);assert.ok(graph.edges.some(e=>e.from==='feature_rw_up'&&e.to==='feature_rw_down'));
 advanceWaterCycle(natural.d,natural.engine,day);advanceWaterCycle(used.d,used.engine,day);
 assert.ok(feature(used.d,'feature_rw_down').waterMl<feature(natural.d,'feature_rw_down').waterMl);
 assert.equal(feature(natural.d,'feature_rw_up').saltMg+feature(natural.d,'feature_rw_down').saltMg,2000);
 assert.equal(feature(natural.d,'feature_rw_up').toxinUg+feature(natural.d,'feature_rw_down').toxinUg,200);
 assertWaterLedger(natural.d);assertWaterLedger(used.d);
 const snapshot=canonical(used.d.document);advanceWaterCycle(used.d,used.engine,day);assert.equal(canonical(used.d.document),snapshot,'日结不重扣');
});

test('降水补给与蒸发、满溢均入账；已有环境取水按实际变化核对，不能重复补水',()=>{
 const {engine,d}=river({rain:0.3}),day=Math.floor(d.get('state','minute')/DAY);
 advanceWaterCycle(d,engine,day);assert.ok(d.get('state','records','water-cycle:feature_rw_up').rain>0);
 const before=feature(d,'feature_rw_down').waterMl;d.set(['state','records','physical_feature:feature_rw_down','state','waterMl'],before-5000);
 advanceWaterCycle(d,engine,day+1);assert.equal(d.get('state','records','water-cycle:feature_rw_down').externalDelta,-5000);assertWaterLedger(d);
});

test('上游污染随水进入下游饮水、U3实际病程和农田产量',()=>{
 const dirty=river({use:100,pollution:100}),clean=river({use:100}),day=Math.floor(dirty.d.get('state','minute')/DAY);
 for(const x of [dirty,clean]){
  Object.assign(x.engine.rules.forestWater.water,{irrigationMlPerArea:10,exposureRate:100});
  advanceWaterCycle(x.d,x.engine,day);
 }
 const risk=feature(dirty.d,'feature_rw_down').pathogenRisk;assert.ok(risk>35);
 assert.ok(farmWaterFactor(dirty.engine,dirty.d.get('state'),'loc_hw',day)<farmWaterFactor(clean.engine,clean.d.get('state'),'loc_hw',day));
 assert.ok(Object.values(dirty.d.get('state','records')).some(r=>r.category==='world_event'&&r.tags.includes('water_pollution')&&r.visibility==='private'));
 advanceHazardClocks(dirty.d,dirty.engine,{before:day*DAY,after:(day+1)*DAY});
 const ep=Object.values(dirty.d.get('state','records')).find(r=>r.category==='epidemic'&&Object.values(r.households).some(h=>h.source==='drinking_water'));
 assert.ok(ep);assert.ok(Object.values(ep.households).every(h=>h.status==='潜伏'&&h.infectiousAt>h.exposedAt));
 dirty.w.npcs.find(n=>n.id==='npc_hw_linsui').tier='full';
 advanceHazardClocks(dirty.d,dirty.engine,{before:(day+1)*DAY,after:(day+5)*DAY});
 assert.ok(Object.values(dirty.d.get('state','family','illnesses')).some(i=>i.disease==='disease_river_flux'),'饮水暴露落实为现有NPC疾病');
 for(const x of [dirty,clean]){
  const p=x.engine.rules.agriculture.settlements[0],r=x.d.get('state','records',`agriculture:${p.settlement}`);
  r.lastDay=day-1;r.field.cohorts=[{id:'crop',sownDay:day-10,areaUnits:1,grownDays:1,qualitySum:0,qualityDays:0,ready:false,harvestedUnits:0,harvestedFood:0,seedSpent:0,seedSources:[]}];
  advanceAgriculture(x.d,x.engine,p.settlement,x.d.get('state','settlements',p.settlement),day);
 }
 const quality=x=>x.d.get('state','records','agriculture:loc_hw','field','cohorts')[0].qualitySum;
 assert.ok(quality(dirty)<quality(clean));
});

test('实际伐木与据点木料采集同扣林木；无许可不能绕过据点边界',()=>{
 const {engine,d}=setup(),location='loc_hw_northwood';d.document.state.location=location;
 engine.check=()=>({success:true});engine.advance=(draft,minutes)=>draft.set(['state','minute'],draft.get('state','minute')+minutes);
 d.document.state.inventory.item_singlebit_axe={quantity:1,durability:100,quality:'木',weight:1};
 const before=forestView(engine,d.get('state'),location).reserve,result=woodcut.call(engine,d,{quantity:2},'cut');
 assert.equal(result.obtained[0].quantity,2);assert.equal(forestView(engine,d.get('state'),location).reserve,before-2);
 const place=engine.byId.get(location);place.site={owner:'npc_hw_miller',mechanisms:[],entryMechanisms:[],resources:[{id:'rw_wood',name:'木料',item:'item_wood',quantity:5,minutes:1}],clues:[],changes:[]};
 // K6 (c60b2a62, legality is a consequence): the owner's permission is a legal gate. Cutting in another's
 // wood still physically happens from the same forest stock and is committed as illegal harvest against him.
 // Going onto the private site to cut is itself the site's entry breach (sites.mjs entryBreach), so the
 // one act commits trespass and illegal harvest, both against the owner.
 const cut=woodcut.call(engine,d,{},'private');
 assert.equal(cut.obtained[0].quantity,1);assert.equal(forestView(engine,d.get('state'),location).reserve,before-3);
 assert.deepEqual(cut.offenses.map(o=>o.offense).sort(),['illegal_harvest','trespass']);
 for(const o of cut.offenses){const row=d.get('state','records',o.record);assert.equal(o.victim,'npc_hw_miller');assert.equal(row.sourceEvent,'private');assert.equal(row.offender,'player');}
 assert.deepEqual(d.get('state','records',cut.offenses.find(o=>o.offense==='illegal_harvest').record).stolen,{item:'item_wood',quantity:1});
 // 06 §6.3: physical presence does not bypass property or entrance gates.
 // A public outdoor forest needs no menu visit, but a blocked entrance still
 // rejects before harvesting or spending time; retain the private-owner case.
 place.site.owner=null;place.site.entryMechanisms=['rw_gate'];
 const blockedMinute=d.get('state','minute');
 assert.throws(()=>woodcut.call(engine,d,{},'blocked'),/机关/);
 assert.equal(d.get('state','minute'),blockedMinute);assert.equal(forestView(engine,d.get('state'),location).reserve,before-3);
 place.site.entryMechanisms=[];d.set(['state','records','site_presence'],{site:location,actor:'player'});
 const gathered=siteAction.call(engine,d,{operation:'gather',target:'rw_wood',quantity:1},'gather');assert.equal(gathered.quantity,1);
 assert.equal(forestView(engine,d.get('state'),location).reserve,before-4);
});

test('无本卡规则的旧世界仍按原结算；长推进与逐日日结资源事实一致',()=>{
 const legacy=setup(w=>{delete w.rules.forestWater;}),s={population:10,wood:0};
 assert.equal(harvestSettlementWood(legacy.d,legacy.engine,'loc_hw',7,0),7);settleFuel(legacy.d,legacy.engine,'loc_hw',s,7,0);assert.equal(s.wood,7);
 const a=river(),b=river(),start=Math.floor(a.d.get('state','minute')/DAY);
 for(let day=start;day<start+5;day++)advanceForestWater(a.d,a.engine,day);
 for(let day=start;day<start+5;day++){b.d.document.state.minute=(day+1)*DAY;advanceForestWater(b.d,b.engine,day);}
 const records=d=>Object.fromEntries(Object.entries(d.get('state','records')).filter(([k])=>k.startsWith('water-cycle:')||k.startsWith('physical_feature:')));
 assert.deepEqual(records(a.d),records(b.d));assertWaterLedger(a.d);
});

test('P3远方林木按周聚合，实际采伐前补齐该地生长；水体预留容量、冻结与未检验隐私仍有效',()=>{
 const {engine,d}=setup(),location='loc_hw_northwood',start=d.get('state','minute'),site=forestSites(engine).find(s=>s.location===location);
 harvestForest(d,engine,location,10000,start);
 engine.advanceLayerContext={countyOf:()=> 'far',layers:new Map([['far','statistics']])};
 const day=Math.floor(start/DAY);advanceForestWater(d,engine,day);
 assert.equal(d.get('state','records',`forest:${location}`).updatedAt,start);
 const time=start+3*DAY;d.set(['state','minute'],time);
 // D05 5.5 / S505C: 6000 old wood remains full; ordinary K=54000,N=44000.
 // floor(54000/(1+(54000/44000-1)*exp(-.0008*3)))+6000=50019.
 const expected=50019;
 assert.equal(forestView(engine,d.get('state'),location).reserve,expected);
 assert.equal(harvestForest(d,engine,location,5),5);assert.equal(d.get('state','records',`forest:${location}`).reserve,expected-5);
 const x=river({rain:0.8,use:100}),b=waterBasins(x.engine).find(b=>b.id==='feature_rw_down'),w=structuredClone(b.feature.state);
 Object.assign(w,{reservedWaterMl:200000,frozenUntil:(day+10)*DAY});
 x.d.set(['state','records',`physical_feature:${b.id}`],{id:b.id,category:'physical_feature',location:b.location,state:w});
 advanceWaterCycle(x.d,x.engine,day);
 const current=feature(x.d,b.id);assert.ok(current.waterMl+current.reservedWaterMl<=current.capacityMl);
 assert.equal(x.d.get('state','records',`water-cycle:${b.id}`).drinking.loc_hw.takenMl,0);
 const view=environmentCatalog(x.engine,x.d.document,{});assert.ok(!JSON.stringify(view).includes('pathogenRisk'));assert.ok(!JSON.stringify(view).includes('toxinUg'));
 b.feature.state.capacityMl=1000;b.feature.state.waterMl=0;
 x.d.set(['state','records',`physical_feature:${b.id}`,'state','frozenUntil'],(day+1)*DAY+1000);
 advanceWaterCycle(x.d,x.engine,day+1);
 assert.ok(x.d.get('state','records',`water-cycle:${b.id}`).drinking.loc_hw.takenMl>0,'日结时封冻已到期，不沿用当天早些时候的冻结状态');
 assert.equal(feature(x.d,b.id).capacityMl,1000000,'目录默认值不覆盖当前物理容量');
 assertWaterLedger(x.d);
});

test('现有world_field工具实际分派采伐并可重放，读环境取得当前林木',async()=>{
 const {engine,doc}=setup();doc.state.location='loc_hw_northwood';
 doc.state.inventory.item_singlebit_axe={quantity:1,durability:100,quality:'木',weight:1};
 engine.check=()=>({success:true});
 const input={tool:'world_field',args:{operation:'site_woodcut',quantity:1},eventId:'rw04-tool'};
 const first=await engine.reduce(doc,input),again=await engine.reduce(doc,input);assert.deepEqual(first,again);
 const next=applyPatches(doc,first.patches);assert.equal(first.result.obtained[0].quantity,1);
 const row=next.state.records['forest:loc_hw_northwood'];assert.equal(row.initial+row.grown-row.harvested,row.reserve);assert.equal(row.harvested,1);
 const inspected=await engine.reduce(next,{tool:'world_field',args:{operation:'environment_inspect'},eventId:'rw04-inspect'});
 assert.equal(inspected.result.forest.reserve,row.reserve);
});

test('非整单位日生长在P3逐日与远方周聚合间保持完全等价',()=>{
 const make=layer=>{const x=setup(w=>{w.locations.find(l=>l.id==='loc_hw_northwood').areaKm2=1.234;});
  x.engine.advanceLayerContext={countyOf:()=> 'county',layers:new Map([['county',layer]])};return x;};
 const a=make('rule'),b=make('statistics'),id='loc_hw_northwood',start=a.d.get('state','minute');
 for(const x of [a,b]){
  harvestForest(x.d,x.engine,id,10000,start);
  for(let day=0;day<10;day++){x.d.set(['state','minute'],(day+1)*DAY);advanceForestWater(x.d,x.engine,day);}
  harvestForest(x.d,x.engine,id,1);
 }
 assert.deepEqual(a.d.get('state','records',`forest:${id}`),b.d.get('state','records',`forest:${id}`));
});

test('同一水源的多个聚居地各记实际饮水，后取水者缺水不抹掉先取水者的污染暴露',()=>{
 const {engine,d}=river({use:1000,pollution:100}),day=Math.floor(d.get('state','minute')/DAY);
 d.document.state.settlements.loc_hw.population=1000;
 d.document.state.settlements.loc_hw_fields={population:100,granary:false};
 advanceWaterCycle(d,engine,day);
 const first=waterExposure(engine,d.get('state'),'loc_hw'),last=waterExposure(engine,d.get('state'),'loc_hw_fields');
 assert.ok(first.takenMl>0&&first.pathogenRisk>35);assert.equal(last.takenMl,0);
 advanceHazardClocks(d,engine,{before:day*DAY,after:(day+1)*DAY});
 assert.ok(Object.values(d.get('state','records')).some(r=>r.category==='epidemic'&&r.origin==='loc_hw'));
 assertWaterLedger(d);
});

test('P3统计粮食产出也扣灌溉水，无详细农田的远方聚落遇旱减产并进入粮价',()=>{
 const make=rain=>{
  const x=setup(w=>{
   w.locations.push({id:'loc_rw_statfarm',name:'统计田地',parent:null,coordinates:[0,10],terrain:'平地'});
   w.rules.weather.regions[0].locations.push('loc_rw_statfarm');
   Object.assign(w.rules.forestWater.water,{capacityMl:1000000,evaporationShare:0,drinkingMlPerPerson:0});
   for(const kind of Object.keys(w.rules.forestWater.water.rainShare))w.rules.forestWater.water.rainShare[kind]=rain;
  });
  // 夹具意图：统计田地（不在农事表）开局存粮正好等于它的目标持有，使粮价稀缺度落在夹取区间内，旱年少产的粮才会显现在价格上。
  // 统计田地自己产粮（foodPerDay>0）：供粮源就是它自己，目标持有按自产口径手推（期望不调用被测的 resupplyDays / 目标原语）：
  //  统计产粮每天入仓、没有收获日，储备视野 = 季节储备（handSelfReserve：从当前季起一年内按 foodPerDay × cropSeasonFactors 与需求逐段累计的最大亏空天数，不低于交易周期）；
  //  目标持有 = ceil(餐口 × 视野)；餐口 = 人口（夹具无异族）。目标随季节变，期望按旱湿推进后的日期重算。
  const farmId='loc_rw_statfarm',pop=100;
  x.d.set(['state','settlements',farmId],{name:'统计田地',population:pop,food:0,foodPerDay:120,wood:0,woodPerDay:0,stone:0,iron:0,treasury:0});
  const selfTarget=minute=>Math.ceil(pop*handSelfReserve(x.engine,minute,120,pop));
  assert.ok(!x.engine.rules.agriculture.settlements.some(p=>p.settlement===farmId),'前置：统计田地不在农事表');
  assert.ok(Math.abs(resupplyDays(x.engine,x.d.get('randomSeed'),farmId,x.d.get('state'))-handSelfReserve(x.engine,x.d.get('state','minute'),120,pop))<=1e-9);
  assert.throws(()=>resupplyDays(x.engine,x.d.get('randomSeed'),farmId),/需要聚落状态/,'没有聚落状态就无法判断自产，直接报错而不是给错值');
  assert.equal(mealMouthsOf(x.engine,x.d.get('state'),farmId,pop),pop,'前置：餐口 = 人口');
  const heldTarget=selfTarget(x.d.get('state','minute'));
  assert.ok(heldTarget>0);x.selfTarget=selfTarget;
  x.d.set(['state','settlements',farmId,'food'],heldTarget);x.heldTarget=heldTarget;
  assert.equal(x.d.get('state','settlements',farmId,'food'),heldTarget,'前置：夹具存粮 = 目标持有');
  const day=Math.floor(x.d.get('state','minute')/DAY);x.d.set(['state','minute'],(day+1)*DAY);
  advanceRegistry.find(r=>r.id==='daily').advance(x.engine,x.d,{before:day*DAY,after:(day+1)*DAY});return x;
 };
 const dry=make(0),wet=make(0.3),key='water-cycle:basin:loc_rw_statfarm';
 assert.ok(dry.d.get('state','records',key).farms.loc_rw_statfarm.takenMl>0);
 assert.ok(dry.d.get('state','settlements','loc_rw_statfarm','food')<wet.d.get('state','settlements','loc_rw_statfarm','food'));
 // 前置：旱湿两边推进一日后的存粮，相对目标持有的稀缺度（目标 ÷ 实存）都落在规则的夹取区间内，价格差才来自产量而不是被夹到同一端。
 const [lo,hi]=dry.engine.rules.economy.priceFactorLimits.region;
 for(const x of [dry,wet]){const s=x.selfTarget(x.d.get('state','minute'))/x.d.get('state','settlements','loc_rw_statfarm','food');assert.ok(s>lo&&s<hi,`稀缺度 ${s} 须在 (${lo}, ${hi}) 内`);}
 const item=dry.engine.rules.settlementTrade.item;
 assert.ok(regionalTradePrice(dry.d,dry.engine,item,'loc_rw_statfarm')>regionalTradePrice(wet.d,wet.engine,item,'loc_rw_statfarm'));
 assertWaterLedger(dry.d);assertWaterLedger(wet.d);
});
