// S5-F2 合同托管（实物）。在法定计价单位不是基准币的地方，合同的押金/报酬/货款冻结为“资源 + 整数数量”，
// 托管的就是这种资源本身（兑付券、羊毛……）：从付款人行囊转入合同名下的托管库存，履约或退款时原数转出。
// 账户键仍是 owner|resource|purpose（<合同>|<物品资源>|escrow），不增新账户种类；旧字段仍是合同行的 escrow（单位数量）。
import {accountKey} from './ledger.mjs';
import {itemResource,registerLegacyStock} from './stock.mjs';
import {changeItems} from './items.mjs';
import {preconditionFailure} from './precondition.mjs';
import {resourceItem} from './tender.mjs';

export const escrowGoods=(engine,contract,item)=>accountKey(contract,itemResource(engine,item),'escrow');
registerLegacyStock('contract-goods-escrow',(engine,state,add)=>{
    for(const [key,row] of Object.entries(state.records??{}))
        if(row?.category==='contract'&&row.resource&&row.resource!=='coin_river'&&row.escrow>0)add(escrowGoods(engine,key,resourceItem(engine,row.resource)),row.escrow);
});
// Payer's bag -> the contract's goods escrow.
export function holdGoods(d,engine,{contract,payer,resource,amount,writer,eventId=null}){
    const item=resourceItem(engine,resource);
    if(engine.quantity(d,payer,item)<amount)throw preconditionFailure(`${engine.byId.get(item)?.name??resource}不足：需要${amount}`);
    if(amount)changeItems(d,engine,payer,item,-amount,{books:{account:escrowGoods(engine,contract,item),writer,eventId}});
    return {resource,amount};
}
// The contract's goods escrow -> `to`'s bag (exact quantity, never converted).
export function releaseGoods(d,engine,{contract,to,resource,amount,writer,eventId=null}){
    const item=resourceItem(engine,resource);
    if(amount)changeItems(d,engine,to,item,amount,{books:{account:escrowGoods(engine,contract,item),writer,eventId}});
    return {resource,amount};
}
