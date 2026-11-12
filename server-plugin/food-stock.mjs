// 聚落存粮可撑天数：所有判"缺粮程度"的钟（冬荒 granary_short 等）共用的唯一原语，与定价读同一来源。
// = 可食池实际持有 ÷ 每日餐口需求。实际持有取自 marketSupply 对粮食货的返回（spotSupply：聚落粮仓公账库存 + 经营者与居民卖方的在售存货，不含担保远期），
// 即定价的 holdActual 同一份数；每日餐口需求 = 餐口（mealMouthsOf，每口每日一份，与粮仓日结同一单位）。
// 公粮配给（household-subsistence.mjs publicShare）不走这里：配给是从公仓里发的，只能读公仓库存。
import {marketSupply} from './market.mjs';
import {mealMouthsOf} from './primitives-body.mjs';

// 返回天数；聚落不存在、没有人口、没有餐口时返回 null（无从判断）。
export function foodStockDays(d,engine,place){
 const state=d.get('state'),s=state.settlements?.[place];
 if(!s||!(s.population>0))return null;
 const mouths=mealMouthsOf(engine,state,place,s.population);
 if(!(mouths>0))return null;
 const grain=engine.rules.economy.shops.stockItems.food,q=marketSupply(d,engine,grain,place);
 return (q.spotSupply??q.supply)/mouths;
}
