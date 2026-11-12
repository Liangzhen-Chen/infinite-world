// EC-1a 共用钱袋。补足已做在最底层扣款原语里（ledger.transfer 的扣前补足，household-budget 登记）：任何从 NPC 钱袋扣款的路径余额不足时都先按缺口从同户户池补足，
// 不豁免的调用不必再做什么；确实不该补的调用处传 noHouseholdTopUp: '<理由>'（tests/ec1a-payment-paths.test.mjs 核对清单与理由）。
// 本文件的入口保留作“显式意图”与付款前的判断：
//   npcCanPay  先判“够不够”：本人钱袋够，或同一登记户的户池（household-budget.householdCash，与预算同一口径）够（调用方的付款前检查要用它，原语只管扣款那一刻）；
//   topUpNpc / payFromNpc 提前按缺口补足（household-budget.householdPoolTopUp）；补足量只等于缺口，原语再补时缺口为 0，幂等。
// payFromNpc 返回户池补进付款人钱袋的数额（调用方若持有该 NPC 的钱袋工作副本，须把它加回副本，否则回写会盖掉补足）。
import {purse,moveCoins} from './money.mjs';
import {householdCash,householdPoolTopUp} from './household-budget.mjs';

const isNpc=(d,id)=>id!=='player'&&Boolean(d.get('state','npcs',id));
// 够不够付：本人钱袋（调用方已读到的现金，缺省读状态）够就够；否则看户池。玩家只看本人。
export function npcCanPay(d,engine,payer,amount,own=null){
 const mine=own??(payer==='player'?d.get('state','player','coins'):d.get('state','npcs',payer,'coins'))??0;
 if(mine>=amount)return true;
 return isNpc(d,payer)&&householdCash(d,engine,payer)>=amount;
}
// 只补足、不付款：付款路径自己动钱（如通用清偿 obligation-runtime，来源账户由它决定）时，在“现钱够不够”的检查之前调用。玩家、群体、组织、遗产账户不是 state.npcs 里的人，不补。
export function topUpNpc(d,engine,payer,amount,eventId){
 return isNpc(d,payer)?householdPoolTopUp(d,engine,payer,amount,`${eventId}:${payer}`):0;
}
export function payFromNpc(d,engine,{payer,to,amount,writer,eventId=null}){
 const topped=topUpNpc(d,engine,payer,amount,eventId??writer);
 moveCoins(d,{from:purse(engine,payer),to,amount,writer,eventId});
 return topped;
}
