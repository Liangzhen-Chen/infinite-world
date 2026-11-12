// 补给间隔：市场目标持有、远方聚落开局存粮、滚动耗料窗口共用的纯函数（只读引擎的路线与规则，不依赖 stock.mjs，避免 stock → … → goods-escrow → stock 的导入环）。
import {placeSettlement} from './entity-view.mjs';

// 非农事聚落的补给间隔（天）：粮从农事聚落（agriculture.settlements，唯一有粮食生产的聚落类）运来，间隔 = 最近供粮聚落的 walk 往返路程天数
// （路线按季节开闭，取一年各月里最快的一条＝路开着时的正常路程；route.minutes 已含每日歇息）。周贸易班线两端都是农事聚落，不覆盖非农事聚落，所以不是这里的来源。
// 一年里到不了任何供粮聚落：直接报错列出聚落，不编造天数。同一世界数据对象内按聚落记忆。市场的目标持有与远方聚落的开局存粮共用这一条规律（常态 = 目标）。
const roundTripMemo=new WeakMap();
// 两聚落间的往返天数：一年各月里最快的一条 walk 路线，2 × route.minutes ÷ 1440；一年里都走不通（地理不连通）返回 null。
function roundTripDays(engine,seed,from,to){
 const memo=roundTripMemo.get(engine.world)??new Map();roundTripMemo.set(engine.world,memo);
 const key=`${from}>${to}`;if(memo.has(key))return memo.get(key);
 let best=null;
 for(let month=0;month<12;month++){
  try{const r=engine.route(from,to,'walk',month*30*1440,seed);if(best===null||r.minutes<best)best=r.minutes;}
  catch(error){if(!error.message.startsWith('没有当前季节'))throw error;}
 }
 const days=best===null?null:2*best/1440;memo.set(key,days);return days;
}
// 粮的补给间隔（非农事聚落）：最近的别的农事聚落的往返天数；供粮聚落不含本聚落自己。没有任何可达的供粮聚落：报错列出聚落，不编造天数。
export function resupplyDays(engine,seed,place){
 let best=null;
 for(const p of engine.rules.agriculture?.settlements??[]){
  if(p.settlement===place)continue;
  const t=roundTripDays(engine,seed,p.settlement,place);if(t!==null&&(best===null||t<best))best=t;
 }
 if(best===null)throw Error(`聚落 ${place} 到不了任何供粮（农事）聚落，推不出补给间隔`);
 return best;
}
// 某货在某聚落的补给间隔（天，非食物货）= 往返该货产地的天数；产地 = 物品目录的 origin（建筑换算成所在聚落，与 transport.unitFreight 同一来源）：
//  · 产地在别的聚落：往返路程天数（真不连通才报错）；
//  · 产地就是本聚落：本地生产周期 = max(生产这件货的配方里最短的工时 ÷ 1440, 一个交易周期 economy.tradeCycleDays)；没有配方产出这件货，退回一个交易周期；
//  · 没有 origin 或产地不在任何聚落：没有往返路程可推，同样退回一个交易周期。
export function itemResupplyDays(engine,state,seed,item,place){
 const origin=engine.byId.get(item)?.origin??null,from=origin?placeSettlement(engine,state,origin).value:null,cycle=engine.rules.economy.tradeCycleDays;
 if(!from)return cycle;
 if(from===place){
  // 本地产地：配方工时只有几分钟到几小时，货不会按那么短的节拍补；取交易周期（与家户留存 reserveUpkeep 同一个周期 economy.tradeCycleDays）为下限。
  const minutes=Math.min(...engine.world.recipes.filter(r=>r.output?.item===item).map(r=>r.minutes));
  return Number.isFinite(minutes)?Math.max(minutes/1440,cycle):cycle;
 }
 const t=roundTripDays(engine,seed,from,place);
 if(t===null)throw Error(`聚落 ${place} 到不了 ${item} 的产地聚落 ${from}，推不出补给间隔`);
 return t;
}
// 滚动耗料累计的窗口（天）= 各聚落、各货补给间隔的上限（向上取整，至少一个交易周期）：粮的补给间隔（非农事聚落）、非食物货往返各产地聚落的天数；推不出的（不连通）不参与取上限，读它的需求时自会报错。
export function craftUseWindowDays(engine,state,seed,places){
 let window=engine.rules.economy.tradeCycleDays;
 const origins=new Set();
 for(const it of engine.world.items){const o=it.origin?placeSettlement(engine,state,it.origin).value:null;if(o)origins.add(o);}
 for(const place of places){
  try{window=Math.max(window,resupplyDays(engine,seed,place));}catch(error){if(!error.message.startsWith('聚落 '))throw error;}
  for(const o of origins){if(o===place)continue;const t=roundTripDays(engine,seed,o,place);if(t!==null)window=Math.max(window,t);}
 }
 return Math.ceil(window);
}
