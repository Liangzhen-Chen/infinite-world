// 测试用的手推期望：不调用被测的目标持有 / 货物权重原语，只读规则数据与记录，按规律写出来。
import assert from 'node:assert/strict';
import {mealMouthsOf} from '../../server-plugin/primitives-body.mjs';
import {foodSatiety} from '../../server-plugin/market.mjs';
import {granaryCapacity} from '../../server-plugin/facility-state.mjs';

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
//  当日产量 = 名义 foodPerDay × cropSeasonFactors[季]（一季 90 日，一年 360 日），需求 = 人口；以"天"计的当日亏空 = (需求 − 产量) ÷ 需求。
//  从 minute 起往后一年，分成五段（本季剩余、其后三季各 90、本季已过的部分），每段内亏空率不变，所以累计亏空的最大值落在某段末尾；
//  储备天数 = max(最大累计亏空, 交易周期 economy.tradeCycleDays)。
export function handSelfReserve(engine,minute,foodPerDay,population){
    const f=engine.rules.weather.cropSeasonFactors,doy=Math.floor(minute/1440)%360,season=Math.floor(doy/90),done=doy%90;
    const blocks=[[season,90-done],[(season+1)%4,90],[(season+2)%4,90],[(season+3)%4,90]];
    if(done>0)blocks.push([season,done]);
    let cum=0,worst=0;
    for(const [s,len] of blocks){cum+=len*(population-foodPerDay*f[s])/population;worst=Math.max(worst,cum);}
    return Math.max(worst,engine.rules.economy.tradeCycleDays);
}
// 一件食物折成"口粮件数"的比例 = 该物饱腹值 ÷ 口粮饱腹值。物品行自带饱腹值的直接读行数据；
// 燕麦等没有自带值、要沿配方推的，唯一保留对 foodSatiety 的依赖（它的推导由 market-food-pool.test 单独手推验证），这里只用于换算单位，不参与目标持有与价格的期望。
export function handSatiety(engine,item){
    const own=engine.byId.get(item)?.nutrition?.satiety;
    return own>0?own:foodSatiety(engine,item);
}
