// 行情见闻（卡 E2，新规律）：人到了哪个聚落，就见到那里的行情——铺面上摆的货与本地人家缺的日用、各值多少；
// 见到的行情是本人的一条亲历记忆（key 为 market:<聚落>，带见到的时刻与过期时刻），经现有的交谈渠道
// （npc-cognition：每天与信得过的熟人当面转述）传给别人；转述保留数量时，听的人也知道那里的价与缺口。
// 谁见到：作息里当天到过外聚落的人（营生跨聚落）、劳动行程到站的人（npc-labor 到站时记）；
// 出门在外的人也带着自家聚落的行情出去。开局的见闻同样由作息派生（第一次推进时按各人当天的作息补记），不撒种子数据。
// 行情过一个交易周期（rules.economy.tradeCycleDays）就过期，不再当作现价。不按物品、聚落、人物分支。
import {registerAdvance} from './advance-registry.mjs';
import {scheduleAt} from './npc-schedule.mjs';
import {placeSettlement,personHousehold,personSimulation} from './entity-view.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {npcAgeAt} from './npc-state.mjs';
import {stateReader,goodsWorth} from './valuation.mjs';
import {upkeepWants} from './market.mjs';
import {currentShops} from './shop.mjs';
import {digest} from './storage.mjs';
import {appendHeard} from './npc-cognition.mjs';

const DAY=1440,SLEEP=/睡眠|睡觉|熟睡/;
export const marketKey=settlement=>`market:${settlement}`;
const settlementOf=(e,state,location)=>placeSettlement(e,state,location).value??null;
const homeOf=(e,state,id)=>personHousehold(e,state,id).value?.settlement??settlementOf(e,state,state.npcs[id]?.location);
const bump=(rows,key,n)=>{rows[key]=(Object.hasOwn(rows,key)?rows[key]:0)+n;};
const cycle=e=>{const n=e.rules.economy?.tradeCycleDays;if(!Number.isSafeInteger(n)||n<1)throw Error('rules.economy.tradeCycleDays 须为正整数（行情见闻的有效期）');return n;};

// 一个聚落此刻的行情：铺面货架上经营的货、本地铺面与人家缺的货（件数），每件按本地市场估值（goodsWorth，与本地零售同一口径）。
// 同一状态里每个聚落只算一次。
const sightings=new WeakMap();
export function marketSighting(e,state,settlement,location){
 let rows=sightings.get(state);if(!rows)sightings.set(state,rows=new Map());
 if(rows.has(settlement))return rows.get(settlement);
 const read=stateReader(state),wants={},items=new Set();
 for(const shop of currentShops(e,state))if(shop.settlement===settlement)for(const r of shop.restock??[]){
  if(r.own)continue;items.add(r.item);
  if(r.source==='settlement')continue;
  const gap=Math.floor(r.maximum-e.quantity(read,shop.keeper,r.item));if(gap>=1)bump(wants,r.item,gap);
 }
 for(const id of Object.keys(state.npcs??{}).sort()){
  if(homeOf(e,state,id)!==settlement)continue;
  for(const w of upkeepWants(state,e,id)){items.add(w.item);bump(wants,w.item,w.quantity);}
 }
 const values={};
 for(const item of [...items].sort()){const v=goodsWorth(read,e,{item,quantity:1,location});if(Number.isFinite(v)&&v>0)values[item]=v;}
 const row={settlement,location,minute:state.minute,expires:state.minute+cycle(e)*DAY,values,wants};
 rows.set(settlement,row);return row;
}
// 本人记下一条亲历的行情：同一聚落只留最近见到的那一条（旧的亲历见闻被新的取代）。
export function noteMarketSighting(d,e,who,location,minute=d.get('state','minute'),sighting=null){
 const state=d.get('state'),n=state.npcs?.[who],settlement=settlementOf(e,state,location);if(!n||!settlement)return false;
 const seen=sighting??marketSighting(e,state,settlement,location),key=marketKey(settlement);
 if(!Object.keys(seen.values).length)return false;
 const stream=n.memoryStream??[];
 if(stream.some(m=>m.key===key&&m.sourceType==='亲历'&&m.minute>=minute))return false;
 const name=e.byId.get(settlement)?.name??settlement;
 const row={id:`market_seen_${digest([who,settlement,minute]).slice(0,24)}`,key,kind:'market',value:{...seen,minute,expires:minute+cycle(e)*DAY},minute,occurredAt:minute,location,
  participants:[],sourceType:'亲历',salience:2,content:`在${name}见到的行情：铺面上的货价与本地人家缺的日用。`};
 d.set(['state','npcs',who,'memoryStream'],[...stream.filter(m=>!(m.key===key&&m.sourceType==='亲历')),row]);
 return true;
}
// 人到了一站，亲眼见到某几件货的真实行情（采买没成时也见到了）：把它们并进本人这一聚落的亲历见闻（没有就新记一条），
// 价按当地市场估值（goodsWorth，与见闻里别的货同一口径、读真实供需），后续规划就改用它而不是中性估价。
export function noteMarketPrices(d,e,who,location,items,minute=d.get('state','minute')){
 const state=d.get('state'),n=state.npcs?.[who],settlement=settlementOf(e,state,location);if(!n||!settlement)return false;
 const read=stateReader(state),seen={};
 for(const item of [...new Set(items)].sort()){const v=goodsWorth(read,e,{item,quantity:1,location});if(Number.isFinite(v)&&v>0)seen[item]=v;}
 if(!Object.keys(seen).length)return false;
 const key=marketKey(settlement),stream=n.memoryStream??[],old=stream.find(m=>m.key===key&&m.sourceType==='亲历'&&m.value?.values);
 const base=old?.value??marketSighting(e,state,settlement,location),name=e.byId.get(settlement)?.name??settlement;
 const row={id:old?.id??`market_seen_${digest([who,settlement,minute]).slice(0,24)}`,key,kind:'market',value:{...base,values:{...base.values,...seen},minute,expires:minute+cycle(e)*DAY},minute,occurredAt:minute,location,
  participants:[],sourceType:'亲历',salience:2,content:`在${name}见到的行情：铺面上的货价与本地人家缺的日用。`};
 d.set(['state','npcs',who,'memoryStream'],[...stream.filter(m=>!(m.key===key&&m.sourceType==='亲历')),row]);
 return true;
}
// 集市渠道：买卖双方当面交货时，各自把亲眼见过的行情讲给对方（经 npc-cognition 的转述，同交谈一样会省略、会过期）。
export function exchangeMarketNews(d,e,a,b,minute,location){
 const state=d.get('state');if(!state.npcs?.[a]||!state.npcs?.[b]||a===b)return 0;
 let told=0;
 for(const [from,to] of [[a,b],[b,a]])for(const m of (state.npcs[from].memoryStream??[]).filter(m=>m.kind==='market'&&m.sourceType==='亲历'&&m.value?.values&&!(m.value.expires<minute)))
  if(appendHeard(d,e,from,to,m,minute,'market',`message_${digest([m.id,from,to,'market']).slice(0,24)}`,location))told++;
 return told;
}
// 本人知道的某聚落行情：所有记着这一聚落行情的记忆（亲历的、听来的）里，见到时刻最近且还没过期的那一条。
export function knownMarket(view,settlement){
 const key=marketKey(settlement);let best=null;
 for(const m of view.knowledge.memories){
  const v=m.key===key?m.value:null;if(!v||typeof v!=='object'||!v.values||v.expires<view.minute||v.minute>view.minute)continue;
  if(!best||v.minute>best.minute)best=v;
 }
 return best;
}
// 一天里本人醒着到过的外聚落（按作息逐段读）。
function visited(e,state,id,from,to){
 const out=new Map();
 for(let t=from;t<to;){const s=scheduleAt(e,id,t,state);if(!s)break;const sid=s.location&&!SLEEP.test(s.activity??'')&&!s.travel?settlementOf(e,state,s.location):null;if(sid&&!out.has(sid))out.set(sid,s.location);t=Math.max(t+1,Math.min(to,s.until));}
 return out;
}
function pass(d,e,from,to,at){
 // 同一时刻各聚落的行情只看一次（记见闻只改各人的记忆，不改行情）。
 const state=d.get('state'),seen=new Map(),sight=(sid,location)=>{if(!seen.has(sid))seen.set(sid,marketSighting(e,state,sid,location));return seen.get(sid);};
 for(const id of Object.keys(state.npcs??{}).sort()){
  const n=state.npcs[id];
  if(!n||!isEffective(e,state,id)||!personSimulation(e,state,id).value||!(npcAgeAt(e,state,id,at)>=e.rules.npcLife.adultAge))continue;
  const home=homeOf(e,state,id),places=visited(e,state,id,from,to);
  const away=[...places].filter(([sid])=>sid!==home);if(!away.length)continue;
  for(const [sid,location] of away)noteMarketSighting(d,e,id,location,at,sight(sid,location));
  // 出门的人也带着自家聚落的行情：家里的事他当天就知道。
  const homeAt=places.get(home)??n.location;if(home&&homeAt&&settlementOf(e,state,homeAt)===home)noteMarketSighting(d,e,id,homeAt,at,sight(home,homeAt));
 }
}
// 每天零点按前一天的作息补记；第一次推进时（还没有记过）按当天的作息补记开局的见闻。
registerAdvance({id:'market_news',order:990,
 nextMinute:(e,d,now)=>(Math.floor(now/DAY)+1)*DAY,
 advance(e,d,{before,after}){
  const through=d.get('state','marketNews','through');
  if(through===undefined){pass(d,e,before,before+DAY,before);d.set(['state','marketNews'],{through:before});}
  for(let day=Math.floor(Math.max(before,d.get('state','marketNews','through'))/DAY)+1;day*DAY<=after;day++){
   pass(d,e,(day-1)*DAY,day*DAY,day*DAY);d.set(['state','marketNews','through'],day*DAY);
  }
 }
});
