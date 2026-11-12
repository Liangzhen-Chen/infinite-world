// ec1-diag 的加载钩子（只在内存里改读到的源码，不改任何文件）：
//  · finance-bank.mjs：“当事人资金不足”抛错点前加一行记录回调 globalThis.__DIAG_FINANCE__；
//  · market.mjs：assertMarketDepth 读出可售量（saleableStock）之后加一行记录回调 globalThis.__DIAG_STOCK__（参数 d、engine、quote、stock），
//    让探针在“对方库存不足：扣除自用和已承诺存量后不够出售”抛出之前读到可售量各项。
// 回调由 tools/ec1-diag.mjs 安装。源码里找不到目标行时原样返回，不报错（探针会在输出里说明未安装）。
// 用法：由 tools/ec1-diag.mjs 经 node:module register 载入；云上运行，本机不要运行。
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 if(url.endsWith('/server-plugin/finance-bank.mjs')&&result.source!=null){
  const text=String(result.source);
  const target="if(!Number.isSafeInteger(balance)||balance<0)throw preconditionFailure('当事人资金不足');";
  if(text.includes(target)){
   const patched="if(!Number.isSafeInteger(balance)||balance<0){globalThis.__DIAG_FINANCE__?.({id,delta,before:balance-delta,sourceEvent,d,e,stack:new Error().stack});throw preconditionFailure('当事人资金不足');}";
   return {...result,source:text.replace(target,patched)};
  }
 }
 if(url.endsWith('/server-plugin/market.mjs')&&result.source!=null){
  const text=String(result.source);
  const target="const stock=saleableStock(d,engine,quote.seller,quote.item,{business:quote.side==='sell'});";
  if(text.includes(target))return {...result,source:text.replace(target,`${target}globalThis.__DIAG_STOCK__?.({d,engine,quote,stock});`)};
 }
 // household-budget.mjs：扣前补足钩子（ledger.registerPreDebit 登记处）真的补了钱之后，记录回调 globalThis.__DIAG_POOL__（payer、amount、writer、eventId、minute、topped）。只记录，补足照常发生，返回值不变。
 if(url.endsWith('/server-plugin/household-budget.mjs')&&result.source!=null){
  const text=String(result.source),target='householdPoolTopUp(d,d.engine,a.owner,amount,`debit:${writer}:${eventId??\'none\'}:${a.owner}`);';
  if(text.includes(target)){
   const patched='{const __minute=look(\'state\',\'minute\'),__topped=householdPoolTopUp(d,d.engine,a.owner,amount,`debit:${writer}:${eventId??\'none\'}:${a.owner}`);globalThis.__DIAG_POOL__?.({payer:a.owner,amount,writer,eventId:eventId??null,minute:__minute,topped:__topped});}';
   return {...result,source:text.replace(target,()=>patched)};
  }
 }
 // business.mjs：settleCustomerFlow 开头加回调 globalThis.__DIAG_FLOW__(d,engine,t)，文件末尾把 serve 用到的模块内函数登记到 globalThis.__DIAG_BIZ__
 // （逐名取，取不到的名字略过，不让加载失败）。探针只读它们，不改任何状态。
 if(url.endsWith('/server-plugin/business.mjs')&&result.source!=null){
  const text=String(result.source),target='export function settleCustomerFlow(d,engine,t){';
  if(text.includes(target)){
   const names=['walkIns','wants','shelfOf','walkMinutes','shoppingSlot','openShops','customerReachMinutes','householdBudget','householdOptions','saleableStock','quoteSupply','marketQuote','regionalTradeBase','wildlifePriceFactor','assertMarketDepth','subjectiveView','subjectiveMarketQuote','npcDecision','rollDice','actionCostRule','personHousehold','personSimulation','personConstraint','householdWorkTime','scheduleAt','placeSettlement','recordsWhere','REFERENCE'];
   const expose=`\n;globalThis.__DIAG_BIZ__={};for(const [k,get] of Object.entries({${names.map(n=>`${n}:()=>${n}`).join(',')}})){try{globalThis.__DIAG_BIZ__[k]=get();}catch{}}\n`;
   return {...result,source:text.replace(target,`${target}globalThis.__DIAG_FLOW__?.(d,engine,t);`)+expose};
  }
 }
 return result;
}
