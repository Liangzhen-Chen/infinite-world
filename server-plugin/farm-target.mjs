const key=id=>`agriculture:${id}`;
import {mealMouthsOf,farmTargetDays} from './primitives-body.mjs';
import {granaryCapacity} from './facility-state.mjs';
// 农事聚落的粮食目标持有 = min(餐口 × farmTargetDays, 粮仓容量 − 种粮)：村子不会想存装不下的粮。
// 容量出处：agriculture.settlements[].granaryCapacity（加上已建公共粮仓设施，facility-state.granaryCapacity，与 agriculture.mjs 收粮上限同一函数）；
// 种粮占同一仓（agriculture.mjs:397 收粮检查：food + seedBank ≤ capacity），有农事记录取其 seedBank，开局前取 profile.initialSeed。
// 本模块在 L1：原放在 L0 的 agriculture-migration（迁移归存档）里，会让 L0 向上依赖 primitives-body 与 facility-state。
export function farmTargetFood(engine,state,profile,minute){
    const s=state.settlements[profile.settlement],rec=state.records?.[key(profile.settlement)];
    const capacity=granaryCapacity(engine,state,profile.settlement,rec?.granary?.capacity??profile.granaryCapacity),seed=rec?.field?.seedBank??profile.initialSeed;
    return Math.min(Math.ceil(mealMouthsOf(engine,state,profile.settlement,s.population??0)*farmTargetDays(engine,minute,profile)),Math.max(0,capacity-seed));
}
// 开局存粮 = 开局日的目标持有（同上）：常态 = 目标，不再有写死的开局存量。
export function openingFood(engine,state,profile,day){return farmTargetFood(engine,state,profile,day*1440);}
