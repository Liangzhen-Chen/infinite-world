// EC-1a 共用钱袋：NPC 付款的唯一入口。凡是从 NPC 钱袋出钱（付货款、工钱、路费、罚金、赔偿、报酬托管、信用还款与合伙出资）都经这里：
//   npcCanPay  先判“够不够”：本人钱袋够，或同一登记户的户池（household-budget.householdCash，与预算同一口径）够；
//   payFromNpc 不够就先按户池补足（household-budget.householdPoolTopUp，唯一的户内转账原语，只在同一登记户成员钱袋间转，币总量不变），再扣款（money.moveCoins）。
// 返回户池补进付款人钱袋的数额（调用方若持有该 NPC 的钱袋工作副本，须把它加回副本，否则回写会盖掉补足）。
// 不走本入口的付款（各自的理由）由 tests/ec1a-payment-paths.test.mjs 的例外清单逐条登记并扫描：玩家付款、柜台/基金/金库/托管账户出钱、
// 被盗受害人（被抢不是付款）、悬赏认捐（受害人自愿按自己钱袋比例）、监护代管（被监护人的继承财产）、金融原语（finance-bank 自带补足）、
// 店铺零售成交（shop/distribution/business 在成交前已补足）、户池补足本身。
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
