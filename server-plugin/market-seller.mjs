// EC-1b 卖方原语：零售成交（店铺→顾客、居民→居民）的“谁在卖、什么时候卖、怎么成交”只有这一处。
// 店铺卖方仍由 business.mjs 的 openShops 登记（租约、营业窗口、货架），居民卖方由 residentSellers 登记；二者共用 customer_flow 的 serve() 与 settleSale()。
// 居民不伪装成店：没有 shop 记录、租约、柜台、经营回执与货架补货行，成交仍写 market_trade（recordMarketDeal）与商税、财务销售记账。
import {transferItems} from './items.mjs';
import {moveCoins,purse,mirrorPartyCoins} from './money.mjs';
import {recordMarketDeal,saleableStock} from './market.mjs';
import {assessTradeTax,taxableSale} from './finance-tax.mjs';
import {recordFinanceSale} from './finance-assets.mjs';
import {scheduleAt} from './npc-schedule.mjs';
import {placeSettlement} from './entity-view.mjs';
import {isEffective} from './lifecycle-state.mjs';

const SLEEPING=/睡眠|睡觉|熟睡/,DOWN=['死亡','濒死','昏迷','患病'];
const quantityOf=v=>typeof v==='number'?v:v?.quantity??0;

// 居民此刻能不能做买卖：清醒、没有在路上、所在时段没有别的服务岗位（接待交易的岗位除外）。店铺的营业窗口仍按作息里的 trade 服务（openShops），
// 居民卖方沿用同一份作息：有 trade 服务的时段当然能卖，没有任何服务岗位的空闲时段也能卖，值守别的服务（教学、办公……）的时段不能。
export function sellingWindow(npc,slot){
  return Boolean(slot)&&!SLEEPING.test(slot.activity??'')&&!npc.scheduleTravel&&!npc.cognitionTravel&&!(slot.services??[]).some(service=>service!=='trade');
}

// t 时刻愿意把自己吃不完的食物卖出的居民：可售余量（saleableStock.available，已扣自用与承诺）至少一整件的食物，且此刻在卖方窗口内。
// taken：已作为店铺登记的店主编号（不重复）。返回的行与 openShops 的 NPC 行同一形状，id 与 shop.mjs 食物来源登记的 trader_<编号> 同号，
// 所以预算里“计划来源”与这里的执行对得上；不在计划里的居民，客流按储备缺口折份数（wants 的既有回退）。
export function residentSellers(d,engine,t,taken=new Set()){
  const state=d.get('state'),out=[];
  for(const id of Object.keys(state.npcs??{}).sort()){
    const npc=state.npcs[id];
    if(!npc||taken.has(id)||!isEffective(engine,state,id)||DOWN.includes(npc.status)||state.player?.companions?.includes(id))continue;
    // 窗口与可售货是合取条件，两者都只读（scheduleAt 与 saleableStock 不写状态），所以先判便宜的窗口：不在卖方窗口的人（夜里、值守别的岗位）不必再逐件读户预算，结果与原先同一。
    const slot=scheduleAt(engine,id,t,state);
    if(!sellingWindow(npc,slot))continue;
    const goods=Object.entries(npc.inventory??{}).filter(([item,v])=>quantityOf(v)>0&&engine.byId.get(item)?.nutrition&&saleableStock(d,engine,id,item).available>=1).map(([item])=>item).sort();
    if(!goods.length)continue;
    out.push({kind:'resident',id:`trader_${id}`,keeper:id,location:slot.location,until:slot.until,settlement:placeSettlement(engine,state,slot.location).value,markup:1,goods});
  }
  return out;
}

// 一笔零售成交的账：付款、转物、商税、财务销售记账、成交记录，只在这里写。调用方给出报价账单 bill（可传函数，到成交记录那一步才取，
// 使价按转物之后的供给读）、成交额 cost 与件数。
// pay：默认买方钱袋 → 卖方钱袋（writer 默认 'shop'，两侧 mirrorPartyCoins）；柜台、同户转账等特殊付款由调用方传入闭包，闭包内自己动钱。
// tax：默认卖方按 taxableSale 判是否应税并 assessTradeTax；调用方也可传闭包（玩家店柜台先划税再交）。
// order：五步的先后，默认 pay→transfer→tax→finance→deal（店铺客流的原顺序）；其余调用点各自保持原有的账序（手动售出 pay→tax→transfer→finance→deal；
// 持货人出让与在场报价进货 transfer→pay→deal→tax→finance），所以 ledger 事件序、成交记录与价格史与合并前逐位一致，合并只去掉重复代码，不改行为。
export const SALE_ORDER={retail:['pay','transfer','tax','finance','deal'],counter:['pay','tax','transfer','finance','deal'],wholesale:['transfer','pay','deal','tax','finance']};
export function settleSale(d,engine,{seller,buyer,item,quantity,cost,bill,eventId,location,writer='shop',pay=null,tax=null,transferOptions=undefined,instances=null,order=SALE_ORDER.retail}){
  let moved=null,due=0;
  const steps={
    pay:()=>{
      if(pay)pay();
      else{
        moveCoins(d,{from:purse(engine,buyer),to:purse(engine,seller),amount:cost,writer,eventId});
        mirrorPartyCoins(d,engine,buyer,-cost,eventId,writer);mirrorPartyCoins(d,engine,seller,cost,eventId,writer);
      }
    },
    transfer:()=>{moved=transferItems(d,engine,seller,buyer,item,quantity,instances,transferOptions);},
    tax:()=>{due=tax?tax():taxableSale(engine,d.get('state'),seller,item)?assessTradeTax(d,engine,{seller,cost,location,sourceEvent:eventId}).amount:0;},
    finance:()=>{recordFinanceSale(d,engine,{buyer,seller,item,quantity,cost,tax:due,eventId});},
    deal:()=>{recordMarketDeal(d,typeof bill==='function'?bill():bill,cost,quantity,eventId);}
  };
  for(const step of order)steps[step]();
  return {cost,tax:due,moved};
}
