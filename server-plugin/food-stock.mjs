// 聚落存粮可撑天数：所有判"缺粮程度"的钟（冬荒 granary_short 等）共用的唯一原语，与定价读同一来源。
// = 可食池实际持有 ÷ 每日餐口需求。实际持有取自 marketSupply 对粮食货的返回（spotSupply：聚落粮仓公账库存 + 经营者与居民卖方的在售存货，不含担保远期），
// 即定价的 holdActual 同一份数；每日餐口需求 = 餐口（mealMouthsOf，每口每日一份，与粮仓日结同一单位）。
// 公粮配给（household-subsistence.mjs publicShare）不走这里：配给是从公仓里发的，只能读公仓库存。
import {marketSupply} from './market.mjs';
import {mealMouthsOf} from './primitives-body.mjs';
import {resupplyDays} from './supply-interval.mjs';

// 返回天数；聚落不存在、没有人口、没有餐口时返回 null（无从判断）。
export function foodStockDays(d,engine,place){
 const state=d.get('state'),s=state.settlements?.[place];
 if(!s||!(s.population>0))return null;
 const mouths=mealMouthsOf(engine,state,place,s.population);
 if(!(mouths>0))return null;
 const grain=engine.rules.economy.shops.stockItems.food,q=marketSupply(d,engine,grain,place);
 return (q.spotSupply??q.supply)/mouths;
}

// 缺粮阈值（天）：阈值天数 = 系数 × 该聚落自己的储备视野天数，而不是绝对天数。
//  · 系数 = 规则里的阈值天数 ÷ 农事档案的 reserveDays（rules.agriculture.settlements[].reserveDays，现为 90）：冬荒钟 granary_short 的 45、90 天 → 0.5、1.0；
//  · 储备视野：农事聚落取自己的 reserveDays；非农事聚落取补给间隔 resupplyDays（粮靠外来补给，平时池持有 = 补给间隔天数，supply-interval.mjs）。
// 农事聚落自己的 reserveDays 就是系数分母，所以阈值仍是规则里的 45/90 天，行为不变；远方聚落在池持有跌到自己补给间隔的一半或一倍以下才进入阶段。
export function shortThresholdDays(d,engine,place,days){
 const farm=engine.rules.agriculture?.settlements??[],own=farm.find(p=>p.settlement===place),reference=farm[0]?.reserveDays;
 if(own)return days/reference*own.reserveDays;
 return days/reference*resupplyDays(engine,d.get('randomSeed'),place,{minute:d.get('state','minute'),state:d.get('state')});
}
