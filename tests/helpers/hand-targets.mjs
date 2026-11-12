// 测试用的手推期望：不调用被测的目标持有 / 货物权重原语，只读规则数据与记录，按规律写出来。
import assert from 'node:assert/strict';
import {mealMouthsOf} from '../../server-plugin/primitives-body.mjs';
import {foodSatiety} from '../../server-plugin/market.mjs';
import {granaryCapacity} from '../../server-plugin/facility-state.mjs';
import {placeSettlement,personBusinesses,settlementPopulation} from '../../server-plugin/entity-view.mjs';
import {isItemClass,craftingParam} from '../../server-plugin/item-class.mjs';
import {usageItemGrams,upkeepSelfSupplyOf} from '../../server-plugin/household-budget.mjs';
import {shopStores,derivedShops} from '../../server-plugin/shop.mjs';

// 农事聚落粮食目标持有 = min(ceil(餐口 × 目标日数), 粮仓容量 − 种粮)：
//  · 目标日数 = 距下次收获天数 + reserveDays；收获日（年内第几日）= crop.sowDays[1] + crop.growthDays，一年 360 日，当日是收获日则距收获 0 天；
//  · 餐口：本夹具无异族/特殊代谢居民，餐口 = 人口（前置断言与餐口原语一致，只作前置，不参与期望）；
//  · 容量：本夹具无已建公共粮仓设施，容量 = 记录里的基础容量（前置断言与含设施容量一致）。
export function handTarget(engine,state,profile,minute){
    const s=state.settlements[profile.settlement],rec=state.records[`agriculture:${profile.settlement}`];
    const crop=engine.rules.agriculture.crop,harvest=crop.sowDays[1]+crop.growthDays,dayOfYear=Math.floor(minute/1440)%360;
    const days=((harvest-dayOfYear)%360+360)%360+profile.reserveDays;
    assert.equal(mealMouthsOf(engine,state,profile.settlement,s.population),s.population,'前置：餐口 = 人口');
    assert.equal(granaryCapacity(engine,state,profile.settlement,rec.granary.capacity),rec.granary.capacity,'前置：无设施仓容');
    return Math.min(Math.ceil(s.population*days),Math.max(0,rec.granary.capacity-rec.field.seedBank));
}
// 自产粮（统计产粮）聚落的季节储备天数，手推（不调用 selfSupplyDays）：
//  当日期望产量 = 名义 foodPerDay × g_s（g_s = cropSeasonFactors[s] × 该季天气倍数期望，见 handSeasonYield；一季 90 日，一年 360 日），需求 = 人口；以"天"计的当日亏空 = (需求 − 产量) ÷ 需求。
//  从 minute 起往后一年，分成五段（本季剩余、其后三季各 90、本季已过的部分），每段内亏空率不变，所以累计亏空的最大值落在某段末尾；
//  储备天数 = 最大累计亏空（季节储备） + 结转储备 reserveDays。
export function handSelfReserve(engine,minute,foodPerDay,population,place){
    const f=handSeasonYield(engine.rules,place),doy=Math.floor(minute/1440)%360,season=Math.floor(doy/90),done=doy%90;
    const blocks=[[season,90-done],[(season+1)%4,90],[(season+2)%4,90],[(season+3)%4,90]];
    if(done>0)blocks.push([season,done]);
    let cum=0,worst=0;
    for(const [s,len] of blocks){cum+=len*(population-foodPerDay*f[s])/population;worst=Math.max(worst,cum);}
    // 加结转储备：农事规则的 reserveDays（各档案一致，现为 90；手推，不调被测的 agricultureReserveDays）。
    return worst+handReserveDays(engine.rules);
}
// 结转储备天数手推：所有农事档案 reserveDays 逐个收集，前置断言全部一致后取该值。
export function handReserveDays(rules){
    const values=[...new Set(rules.agriculture.settlements.map(p=>p.reserveDays))];
    assert.equal(values.length,1,'前置：农事档案 reserveDays 一致');
    return values[0];
}
// 每季期望产量倍数手推：g_s = cropSeasonFactors[s] × E_s，E_s = Σ(季节权重 × 该天气的 crop) ÷ Σ权重；天气顺序写死为规则数据的列序（晴、阴、雨、暴雨、雪、雾，world/meta/rules.json seasonalWeights 列）。
// 聚落不在任何气候区（rules.weather.regions[].locations 都不含它，如生成的远方聚落）→ 没有天气行，引擎不缩放产量，g_s = 1。
export function handSeasonYield(rules,place){
    const order=['clear','cloudy','rain','storm','snow','fog'],w=rules.weather;
    if(!w.regions.some(r=>r.locations.includes(place)))return [1,1,1,1];
    assert.deepEqual(Object.keys(w.states),order,'前置：天气状态键序 = 权重列序');
    return w.cropSeasonFactors.map((factor,s)=>{
        let num=0,den=0;order.forEach((k,i)=>{num+=w.seasonalWeights[s][i]*w.states[k].crop;den+=w.seasonalWeights[s][i];});
        return factor*num/den;
    });
}
// 一件食物折成"口粮件数"的比例 = 该物饱腹值 ÷ 口粮饱腹值。物品行自带饱腹值的直接读行数据；
// 燕麦等没有自带值、要沿配方推的，唯一保留对 foodSatiety 的依赖（它的推导由 market-food-pool.test 单独手推验证），这里只用于换算单位，不参与目标持有与价格的期望。
export function handSatiety(engine,item){
    const own=engine.byId.get(item)?.nutrition?.satiety;
    return own>0?own:foodSatiety(engine,item);
}
// 聚落燕麦稀缺度手推 = 需求 ÷ 供给（不调用 marketSupply / goodsWeight / farmTargetFood），返回未夹取的比值；报价时再夹到 priceFactorLimits.region，价 = 目录基价 × 运输因子 × 夹取后的稀缺度。
// 可食物资同属一池，每件货折成燕麦件数 = 自身饱腹 ÷ 燕麦饱腹（读法见 handSatiety）：
//  · 供给 = 公仓燕麦存量 food（一件燕麦 = 1）+ 本聚落各经营者（店主与带 trade 服务的人）行囊里的食物类存货折算；玩家行囊与其他居民的私户行囊不计（I12）；
//  · 需求 = 本聚落各店货架里食物类每行的 (maximum + reserve) 折算（货架目标）+ 公仓目标持有（handTarget：min(餐口 × (距收获天数 + reserveDays)，容量 − 种粮)，按 state.minute）。
// food 由调用方给（夹具把公仓存量改了之后，不读被测的库存原语）。
export function handOatsScarcity(engine,state,food,place='loc_hw'){
    const sat=i=>handSatiety(engine,i),unit=i=>sat(i)/sat('item_oats'),stores=engine.rules.economy.shops.stores;
    const owners=new Set([...stores.map(s=>s.keeper),...engine.world.npcs.filter(n=>n.shopType||(n.services??[]).includes('trade')).map(n=>n.id)]);
    let held=food*unit('item_oats');
    for(const id of owners){
        const npc=state.npcs[id];if(!npc||placeSettlement(engine,state,npc.location).value!==place)continue;
        for(const [item,q] of Object.entries(npc.inventory??{}))if(sat(item)>0)held+=(q?.quantity??q)*unit(item);
    }
    const shelf=stores.filter(s=>s.settlement===place).flatMap(s=>s.restock??[]).filter(r=>sat(r.item)>0).reduce((n,r)=>n+(r.maximum+(r.reserve??0))*unit(r.item),0);
    const profile=engine.rules.agriculture.settlements.find(p=>p.settlement===place);
    const target=shelf+handTarget(engine,state,profile,state.minute)*unit('item_oats');
    return {held,target,ratio:target/held};
}
// 食物池某件货当前的成交深度因子手推：depth = max(0, 1 + 深度影响 × 净成交 ÷ 开盘存量)。
//  · 净成交 = 今日（state.minute 所在日）本聚落食物池的成交记录（market_trade：卖 +、买 −）× 各自饱腹 ÷ 报价货饱腹（报价货件数）；
//  · 开盘存量 = max(1, 现供给 + 净成交)，现供给 = handOatsScarcity 的持有（燕麦件数）折成报价货件数 = 持有 × 燕麦饱腹 ÷ 报价货饱腹。
// 只读记录与规则数据，不调用被测的 marketSupply / goodsWeight。
export function handFoodDepth(engine,state,item,place='loc_hw'){
    const sat=i=>handSatiety(engine,i),today=Math.floor(state.minute/1440);
    const deals=Object.values(state.records??{}).filter(r=>r.category==='market_trade'&&r.day===today&&r.place===place&&r.goods==='goods:food');
    const net=deals.reduce((n,r)=>n+(r.side==='sell'?r.quantity:-r.quantity)*sat(r.item)/sat(item),0);
    const held=handOatsScarcity(engine,state,state.settlements[place].food,place).held*sat('item_oats')/sat(item);
    return {net,depth:Math.max(0,1+engine.world.marketRules.depthImpact*net/Math.max(1,held+net))};
}
// 燃料用度池某件货的区域价手推（不读 marketSupply 与报价解释）：价 = 目录基价 × 夹取(需求 ÷ max(1,供给))（环境、运输因子 1：产地在本聚落，调用方断言）。
// 前置（本函数内断言）：夹具里每户自给为 0（调用方把 householdSubsistence.maximumJourneyMinutes 压到 1）、没有派生店铺、没有制造耗料记录、补给间隔 = 交易周期。
//  · 供给 = (公仓木料 × 木基准克 + 本聚落各经营者行囊里的燃料类货 × 各自基准克) ÷ 报价货基准克；
//  · 需求 = max((货架燃料行 (maximum+reserve) × 基准克 + 补给间隔 × 日用度 × 聚落户数 + Σ名册户欠量) ÷ 报价货基准克, 1)；日用度 = (炊事 + 当季取暖公斤) × 1000。
export function handFuelPrice(engine,state,item,place='loc_hw'){
    const cycle=engine.rules.economy.tradeCycleDays,cls='fuel',weight=id=>usageItemGrams(engine,id,cls),unit=weight(item),q=v=>typeof v==='number'?v:v?.quantity??0;
    const pool=engine.world.items.filter(i=>isItemClass(engine,i.id,cls)&&!(i.nutrition?.satiety>0)&&weight(i.id)>0);
    assert.ok(engine.world.recipes.filter(r=>r.output?.item==='item_wood').every(r=>r.minutes<=cycle*1440),'前置：木料本地生产周期不超过交易周期');
    // 前置：报价货与木料的产地都在本聚落（运输因子 = 1，价里不含运费）。
    for(const id of [item,'item_wood'])assert.equal(placeSettlement(engine,state,engine.byId.get(id).origin).value,place,`前置：${id} 产地在 ${place}，运输因子 1`);
    assert.equal(state.records?.[`craft-use:${place}`],undefined,'前置：没有制造耗料记录');
    assert.deepEqual(derivedShops(engine.world),[],'前置：没有按人物派生的店铺');
    const stores=shopStores(engine.world),owners=new Set([...stores.map(s=>s.keeper),...engine.world.npcs.filter(n=>n.shopType||(n.services??[]).includes('trade')).map(n=>n.id)]);
    for(const [id,business] of personBusinesses(engine,state))if(business?.open.value&&business.shopType.value)assert.ok(owners.has(id),`前置：派生的营业者 ${id} 已在经营者集合里`);
    const roster=Object.keys(state.npcs).filter(id=>placeSettlement(engine,state,state.npcs[id].location).value===place),keyOf=id=>engine.world.households.find(h=>h.members.includes(id))?.id??id,keys=[...new Set(roster.map(keyOf))];
    for(const id of roster)assert.equal(upkeepSelfSupplyOf(engine,state,id).fuel??0,0,`前置：${id} 没有可达的公共来源，自给 0`);
    let heldGrams=state.settlements[place].wood*weight('item_wood');
    for(const id of owners){const npc=state.npcs[id];if(!npc||placeSettlement(engine,state,npc.location).value!==place)continue;for(const it of pool)heldGrams+=q(npc.inventory?.[it.id])*weight(it.id);}
    const shelfGrams=stores.filter(s=>s.settlement===place).flatMap(s=>s.restock??[]).filter(r=>pool.some(i=>i.id===r.item)).reduce((n,r)=>n+(r.maximum+(r.reserve??0))*weight(r.item),0);
    const fuel=craftingParam(engine,'household.fuelKgPerDay'),N=(fuel.cooking+(fuel.heating[engine.calendar(state.minute).season]??0))*1000;
    const houses=engine.world.settlementProfiles.find(p=>p.id===place).householdCount;
    assert.equal(settlementPopulation(engine,state,place).householdCount.value,houses,'前置：动态户数 = 档案户数');
    const owed=keys.reduce((n,k)=>n+(state.family?.upkeep?.[k]?.fuelDebtG??0),0);
    const supply=heldGrams/unit,demand=Math.max((shelfGrams+cycle*N*houses+owed)/unit,1);
    const [floor,cap]=engine.rules.economy.priceFactorLimits.region,ratio=demand/Math.max(1,supply);
    return {supply,demand,ratio,price:engine.byId.get(item).basePrice*Math.min(cap,Math.max(floor,ratio))};
}
