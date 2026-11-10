// 估值角色（修订记录 G0 第 7 条“价格四角色”之一：成交 / 估值 / 已签条款 / 源汇资格）。
// 质押、典当、遗产与责任上限需要的是“这东西现在值多少”：不是某次成交价，也不是目录基价。
// 本模块只是登记表和分派：各领域登记自己的估值依据（物品走市场估值投影，股份走组织净资产，地产走租金资本化），
// 找不到依据的如实返回 unvaluable，由调用方明确处理——绝不静默当作 0。
import {explainDerived} from './derived.mjs';
import {stateMemo,withReadIndex} from './storage.mjs';
const valuers=new Map();
// 脱离当地供需的物品基准估值，复用 economy:value 自身的基准与修正。
// 不乘市场稀缺、货架深度或交易价差，也不再次应用该槽。
registerValuer('baseline',(d,e,{item,quantity=1,holder=null})=>{
    if(!(e.byId.get(item)?.basePrice>0))return {value:null,unvaluable:'没有估值基准'};
    const projection=explainDerived(e,d.document,'economy:value',item,{kind:'item',holder});
    return {value:projection.value*quantity,basis:'derived-baseline'};
});
export function registerValuer(role,fn){valuers.set(role,fn);}
// asset.role：'goods' 零售估值 / 'collateral' 整批清算 {item,quantity,location,holder}
// | 'share' {issuer,fraction} | 'property' {subject,fraction}
// 返回 {value:整数,basis} 或 {value:null,unvaluable:原因}
// 估值只读：事务草稿若提供 peek（不复制整棵状态），读取走 peek。
const reader=d=>typeof d.peek==='function'?{document:d.document,cursor:d.cursor,memo:d.memo,get:(...p)=>d.peek(...p),peek:(...p)=>d.peek(...p)}:d;
export function valuation(d,e,asset){
    const fn=valuers.get(asset.role);
    if(!fn)return {value:null,unvaluable:`没有登记「${asset.role}」的估值依据`};
    // 估值只读（见上）：固定状态下的只读入口，推进之外也走记录索引与状态记忆。
    const r=withReadIndex(()=>fn(reader(d),e,asset));
    return Number.isFinite(r?.value)?{...r,value:Math.floor(r.value)}:{value:null,unvaluable:r?.unvaluable??'没有可派生的估值依据'};
}
// 持有（holdings 行）的估值：按持有种类选估值角色。无依据者返回 unvaluable。
export function holdingValuation(d,e,h){
    const part=h.terms?.share??1;
    if(h.kind==='share')return valuation(d,e,{role:'share',issuer:h.subject,fraction:part});
    if(h.kind==='owns'){
        if(e.byId?.get(h.subject)?.id?.startsWith('item_'))return valuation(d,e,{role:'goods',item:h.subject,quantity:1,holder:h.holder});
        return valuation(d,e,{role:'property',subject:h.subject,fraction:part,right:'owns',holder:h.holder});
    }
    if(h.kind==='leases')return valuation(d,e,{role:'property',subject:h.subject,fraction:part,right:'leases',holder:h.holder,contract:h.terms?.contract});
    return {value:null,unvaluable:'这种持有是使用权或身份，没有可派生的估值依据'};
}
// 物品现值（整数；没有估值依据时为 null）。“罚没/赔偿/案值/税基/礼物值多少”一律走这里，
// 不再读目录基价当现价：同一件东西在不同地点、不同供需下值不同（市场估值投影，见 finance-assets 的 goods 角色）。
// holder 是物品持有人（品质随实际单件）；location 缺省为当前所在地。
export function goodsWorth(d,e,{item,quantity=1,location,holder=null,apart=false}){
    return valuation(d,e,{role:'goods',item,quantity,location,holder,apart}).value;
}
// 事件推导只有状态快照、没有事务草稿时，用它造一个只读读取器（估值只读）。
export function stateReader(state){
    const document={state,randomSeed:state.randomSeed};
    return {document,get:(...p)=>p.reduce((x,k)=>x?.[k],document),peek:(...p)=>p.reduce((x,k)=>x?.[k],document),
        memo:(scope,inputs,build,identity)=>stateMemo(state,scope,[stateReader,document.randomSeed,...inputs],build,null,identity)};
}
