import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fc from 'fast-check';
import { loadWorld } from '../tools/load-world.mjs';
import { withWeatherRules } from '../world/design/weather-foundation.mjs';
import { WorldEngine } from '../server-plugin/engine.mjs';
import { applyPatches } from '../server-plugin/storage.mjs';
import { weatherAt, daylightAt, localWeather, humidityAt, cropProduction,weatherEdge } from '../server-plugin/weather.mjs';
import { farmWaterFactor } from '../server-plugin/water-cycle.mjs';
import { hazardYieldFactor } from '../server-plugin/hazard-calendar.mjs';
import { magicYieldFactor } from '../server-plugin/magic-economy.mjs';
import { validateWorld } from '../tools/validate-world.mjs';
import {planRuleStateMigration}from'../server-plugin/rule-state-migration.mjs';
import {planAgricultureMigration}from'../server-plugin/agriculture-migration.mjs';
import {planWildlifeMigration}from'../server-plugin/wildlife-migration.mjs';
import {planFarmPestsMigration}from'../server-plugin/farm-pests-migration.mjs';
import {spellBlueprints}from'../world/design/spell-blueprints.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const source=await loadWorld(),world=withWeatherRules(source);world.rules.weather.regions.push(...source.rules.weather.regions.filter(r=>r.sequenceScope==='local'));
    const engine=new WorldEngine(world),legacy=engine.initialFromLegacy(seed,'weather-test');
    const migrated=applyPatches(legacy,planRuleStateMigration(legacy,world.rules)),farm=applyPatches(migrated,planAgricultureMigration(migrated,world.rules)),wild=applyPatches(farm,planWildlifeMigration(farm,world.rules,world.monsters)),c=applyPatches(wild,planFarmPestsMigration(wild,world.rules));
    const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result};};
    return{world,engine,c,run};
}
test('气候参数、引用、概率和旬日校验；未知地点不借父级气候生成',async()=>{
    const{world,engine}=await setup();assert.equal(validateWorld(world).ok,true);
    assert.equal(weatherAt(engine,'s','loc_undefined',540),null);
    for(const mutate of [w=>w.rules.weather.regions[0].locations.push('loc_fake'),w=>w.rules.weather.regions[1].locations.push('loc_hw'),
        w=>w.rules.weather.seasonalWeights[0].fill(0),w=>w.rules.weather.regions[0].latitude=100,w=>w.rules.weather.persistence=1,w=>w.rules.calendar.marketDays=[31]]){
        const bad=structuredClone(world);mutate(bad);assert.equal(validateWorld(bad).ok,false);
    }
    assert.equal(engine.calendar(4*1440).market,true);assert.equal(engine.calendar(10*1440).ten,'中旬');
    assert.equal(engine.calendar(359*1440+1439).year,1);assert.equal(engine.calendar(360*1440).year,2);
    assert.equal(engine.formatCalendar(540),'春历元年 雨月 1日 09:00');
});
test('同一日期气候与调用顺序、引擎重建和战役回放无关，不写或扩增存档',async()=>{
    const{world,engine,c}=await setup(),before=structuredClone(c);
    await fc.assert(fc.asyncProperty(fc.integer({min:0,max:500*360-1}),async day=>{
        const at=day*1440+540,a=weatherAt(engine,c.randomSeed,'loc_hw_dock',at),b=weatherAt(new WorldEngine(world),c.randomSeed,'loc_hw_dock',at);
        assert.deepEqual(a,b);assert.deepEqual(a,weatherAt(engine,c.randomSeed,'loc_hw_gate',at)?{...weatherAt(engine,c.randomSeed,'loc_hw_gate',at),location:'loc_hw_dock'}:null);
        assert.ok(a.humidityPercent>=0&&a.humidityPercent<=100);
    }),{numRuns:40});
    assert.deepEqual(c,before);
    const a=weatherAt(engine,'s1','loc_hw',540),b=weatherAt(engine,'s2','loc_hw',540);assert.notDeepEqual(a,b);
    const reordered=structuredClone(world);reordered.rules.weather.states=Object.fromEntries(Object.entries(reordered.rules.weather.states).reverse());
    assert.deepEqual(a,weatherAt(new WorldEngine(reordered),'s1','loc_hw',540));
});
test('按纬度和季节生成昼长，室内不受户外命中修正；旧世界无天气规则保持原行为',async()=>{
    const{engine,c}=await setup();assert.ok(daylightAt(45,90).durationMinutes>daylightAt(45,270).durationMinutes);
    assert.equal(daylightAt(0,90).durationMinutes,720);
    assert.equal(weatherAt(engine,c.randomSeed,'bld_hw_qingdeng',540).hitModifier,0);
    const old=await loadWorld();delete old.rules.weather;const archived=new WorldEngine(old);
    assert.equal(weatherAt(archived,c.randomSeed,'loc_hw',540),null);assert.equal(cropProduction(archived,'s','loc_hw',540,38),38);
    assert.equal(humidityAt(archived,c,'loc_hw_dock'),70);
});
test('天气观察即时且只读，禁止遥知异地与凭工具改天，湿度实际供生活魔法使用',async()=>{
    const{engine,c,run}=await setup(),before=structuredClone(c);c.state.location='loc_hw_dock';
    const out=await run(c,'world_weather',{operation:'inspect'},'look_weather');assert.deepEqual(out.document,c);
    assert.equal(out.result.weather.humidityPercent,humidityAt(engine,c,'loc_hw_dock'));
    assert.match(engine.scene(c,'天气'),/天气与昼长/);
    await assert.rejects(run(c,'world_weather',{location:'loc_capital'},'remote'),/只能观察/);
    await assert.rejects(run(c,'world_weather',{operation:'make_rain'},'change'),/不能/);
    c.state.weather.loc_hw_dock={humidityPercent:0};assert.equal(humidityAt(engine,c,'loc_hw_dock'),0);
    assert.deepEqual(before.state.weather,{});
});
test('雨雪实际延长路程，暴雨船路关闭，零距离室内出入保持一步耗时',async()=>{
    const{world,engine,c}=await setup();
    let rainyDay,stormDay;
    for(let day=0;day<90;day++){const w=weatherAt(engine,c.randomSeed,'loc_hw',day*1440+540);if(w.kind==='rain')rainyDay??=day;if(w.kind==='storm')stormDay??=day;}
    assert.notEqual(rainyDay,undefined);assert.notEqual(stormDay,undefined);
    const ordinary=structuredClone(world);delete ordinary.rules.weather;const old=new WorldEngine(ordinary);
    const rainy=engine.route('loc_hw','loc_hw_northwood','walk',rainyDay*1440+540,c.randomSeed),dry=old.route('loc_hw','loc_hw_northwood','walk',rainyDay*1440+540);
    assert.ok(rainy.movingMinutes>dry.movingMinutes);
    assert.equal(engine.route('loc_hw','bld_hw_qingdeng','walk',rainyDay*1440+540,c.randomSeed).minutes,1);
    const boats=structuredClone(world);boats.routes=[{id:'route_weather_boat',from:'loc_hw',to:'loc_yandu',lengthKm:32,modes:['boat'],closedSeasons:[],toll:0,risk:0}];
    await assert.rejects(async()=>new WorldEngine(boats).route('loc_hw','loc_yandu','boat',stormDay*1440+540,c.randomSeed),/没有.*路线/);
});
test('季节与天气改变真实粮食入库，长等待与分日结算守恒',async()=>{
    // This verifies the archived daily-production rule; managed agriculture has its own conservation tests.
    const{engine}=await setup(),c=engine.initialFromLegacy(seed,'weather-test',{prepare:false});c.state.settlements.loc_hw.food=20000;
    const run=async(doc,tool,args,eventId)=>({document:applyPatches(doc,(await engine.reduce(doc,{tool,args,eventId},{replay:true})).patches)});
    const long=(await run(c,'world_time',{minutes:20*1440},'long')).document;let split=c;
    // The daily legacy food rule multiplies cropProduction by hazard, magic and RW-04 basin-water factors.
    let expected=c.state.settlements.loc_hw.food,accrued=0,issued=0;
    for(let day=0;day<20;day++){
        split=(await run(split,'world_time',{minutes:1440},`day_${day}`)).document;
        // D05 §5.5 / S5-05 W1: sum physical production, then floor its cumulative
        // amount. Keep the full coefficient chain and the conservation assertion.
        accrued+=cropProduction(engine,c.randomSeed,'loc_hw',day*1440,c.state.settlements.loc_hw.foodPerDay)
            *hazardYieldFactor(split.state,'loc_hw',day*1440+720)
            *magicYieldFactor(split.state,'loc_hw',day*1440+720)
            *farmWaterFactor(engine,split.state,'loc_hw',day);
        const production=Math.floor(accrued)-issued;issued+=production;
        expected+=production-c.state.settlements.loc_hw.population;
    }
    // TFA food-supply law (food-supply.mjs, drawn through agriculture.mjs drawFoodSupplyGranary): loc_hw sells granary grain to a counter in loc_bs.
    // Every unit leaves loc_hw.food and is booked as a food-supply market_trade sale, so expected = production - population*days - sum(those sale quantities).
    const sold=Object.values(split.state.records).filter(r=>r?.category==='market_trade'&&r.seller==='loc_hw'&&String(r.eventId).startsWith('food-supply:')).reduce((n,r)=>n+r.quantity,0);
    assert.ok(sold>0);expected-=sold;
    assert.deepEqual(long.state.settlements,split.state.settlements);
    assert.equal(long.state.settlements.loc_hw.food,expected);
    assert.ok(cropProduction(engine,c.randomSeed,'loc_hw',270*1440,100)<cropProduction(engine,c.randomSeed,'loc_hw',180*1440,100));
});

test('跨日旅程逐日取天气并计入沿途休息，不能借初始晴天穿过已封闭季节',async()=>{
    const{engine,c}=await setup(),edge={id:'route_long_test',from:'loc_hw',to:'loc_bs',lengthKm:160,closedSeasons:[]},speed=engine.rules.travel.walkKmh;
    const actual=weatherEdge(engine,c.randomSeed,edge,'walk',540,0,0,speed),budget=engine.rules.travel.dailyTravelMinutes;
    assert.ok(actual.moving>160/speed*60);
    assert.equal(actual.elapsed,actual.moving+Math.floor((actual.moving-1)/budget)*(1440-budget));
    assert.deepEqual(actual,weatherEdge(new WorldEngine(structuredClone(engine.world)),c.randomSeed,edge,'walk',540,0,0,speed));
    assert.equal(weatherEdge(engine,c.randomSeed,{...edge,closedSeasons:[3]},'walk',269*1440+540,0,0,speed),null);
    const zero=weatherEdge(engine,c.randomSeed,{...edge,lengthKm:0},'walk',540,budget,budget,speed);
    assert.equal(zero.elapsed,1441);assert.equal(zero.moving,budget+1);
});
test('天气和夜间视线参与实际交锋，同一种子战果重放一致',async()=>{
    const{engine,c,run}=await setup();c.state.location='loc_hw_gate';c.state.minute=0;
    const out=await run(c,'world_combat',{target:'npc_hw_gucen',intent:'shove'},'night_shove');
    assert.equal(out.result.weather.nightModifier,engine.rules.combat.terrain.dark.hit);
    assert.equal(out.result.weather.hitModifier,localWeather(engine,c).hitModifier);
    const replay=await run(structuredClone(c),'world_combat',{target:'npc_hw_gucen',intent:'shove'},'night_shove');assert.deepEqual(out,replay);
});

test('户外凝露实际使用生成湿度，跨年天气重建与存档往返保持同日一致',async()=>{
    const{world,c}=await setup(),spell=spellBlueprints().find(row=>row.mechanism==='condense');
    // T19 publishes these IDs; replace the spell with this isolated blueprint.
    world.spells=world.spells.filter(row=>row.id!==spell.id);world.spells.push(spell);
    if(!world.skills.some(row=>row.id===spell.skill))world.skills.push({id:spell.skill,name:spell.name,attribute:'精神',profession:'profession_mage'});
    const engine=new WorldEngine(world);c.state.location='loc_hw_dock';c.state.player.mp=50;c.state.player.maxMp=50;
    c.state.spells[spell.id]={source:{type:'isolated-fixture'}};c.state.skills[spell.skill]={proficiency:120,daily:{},breakthroughs:[]};
    let result,after;
    for(let i=0;i<100;i++){const out=await engine.reduce(c,{tool:'world_cast',args:{spell:spell.id,target:'feature_hw_cup'},eventId:`weather_condense_${i}`});if(out.result.success){result=out.result;after=applyPatches(c,out.patches);break;}}
    assert.ok(result);assert.equal(result.condensedMl,Math.floor(spell.effectSpec.power*humidityAt(engine,after,'loc_hw_dock')/100));
    assert.equal(after.state.records['physical_feature:feature_hw_cup'].state.waterMl,result.condensedMl);
    for(const minute of [359*1440+1439,360*1440,500*360*1440]){
        const doc=structuredClone(c);doc.state.minute=minute;
        assert.deepEqual(localWeather(engine,doc),localWeather(new WorldEngine(JSON.parse(JSON.stringify(world))),JSON.parse(JSON.stringify(doc))));
    }
});

test('新增局部气候区保留旧区逐日天气，新区可独立重建和重放',async()=>{
 const source=await loadWorld(),old=structuredClone(source);old.rules.weather.regions=old.rules.weather.regions.filter(r=>r.sequenceScope!=='local');
 const prior=new WorldEngine(old),current=new WorldEngine(source),reordered=structuredClone(source);reordered.rules.weather.regions=[...old.rules.weather.regions,...source.rules.weather.regions.filter(r=>r.sequenceScope==='local').reverse()];const reorderedEngine=new WorldEngine(reordered),rebuilt=new WorldEngine(source);
 const oldLocations=old.rules.weather.regions.map(r=>r.locations[0]);
 for(let day=0;day<720;day++)for(const location of oldLocations)assert.deepEqual(weatherAt(current,'compatible-village-weather',location,day*1440+540),weatherAt(prior,'compatible-village-weather',location,day*1440+540));
 const local=source.rules.weather.regions.filter(r=>r.sequenceScope==='local');assert.equal(local.length,4);
 for(const region of local)for(const day of [0,29,90,179,270,359,360,719]){const actual=weatherAt(current,'local-village-weather',region.locations[0],day*1440+540);assert.deepEqual(actual,weatherAt(rebuilt,'local-village-weather',region.locations[0],day*1440+540));assert.deepEqual(actual,weatherAt(reorderedEngine,'local-village-weather',region.locations[0],day*1440+540));}
 const changed=structuredClone(source);changed.rules.weather.regions.find(r=>r.id===local[0].id).temperatures[0]+=5;const changedEngine=new WorldEngine(changed);
 assert.notEqual(weatherAt(changedEngine,'local-village-weather',local[0].locations[0],540).temperatureC,weatherAt(current,'local-village-weather',local[0].locations[0],540).temperatureC);
 assert.deepEqual(weatherAt(changedEngine,'local-village-weather',local[1].locations[0],540),weatherAt(current,'local-village-weather',local[1].locations[0],540));
 const bad=structuredClone(source);bad.rules.weather.regions.find(r=>r.sequenceScope==='local').sequenceScope='global';assert.equal(validateWorld(bad).ok,false);
});
