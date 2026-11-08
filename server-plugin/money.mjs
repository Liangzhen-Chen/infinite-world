// S1a 货币适配器（L1）：把旧状态里存钱的字段映射为账本账户，并给旧写入点一个
// 同时写新账本的入口（绞杀式双写：旧字段照写，读取暂不改）。
// 账户键 = <所属实体>|<资源>|<用途>：
//   人（玩家、名册人物、生灵）     <id>|coin_river|purse          state.player.coins / state.npcs.<id>.coins / state.creatures.<id>.coins
//   聚落公账                      <聚落>|coin_river|treasury     state.settlements.<id>.treasury
//   势力/神殿/国家公库             <id>|coin_river|treasury       faction-assets:<id>.coins（未开户时为世界数据 resources.treasuryCopper）
//   自建组织公库                  <id>|coin_river|treasury       organization:<id>.treasury（没有势力公库的组织）
//   政体国库                      polity:<id>|coin_river|treasury records.polity:<id>.coins（未开户时为 rules.military.polities.treasuryCopper）
//   钱庄库银                      <钱庄>|coin_river|vault        records.<钱庄>.coins（未开户时为 rules.economy.credit.banks.reserveCopper）
//   法律公库/交存/医药会款        <记录键>|coin_river|fund        records.legal_treasury:* / legal_deposit:* / medicine_fund:*
//   工位费                        <工位>|coin_river|fund          state.workshopFunds.<工位>
//   复活点香火                    <地点>|coin_river|shrine        state.shrineTreasuries.<地点>
//   托管（契约、委托、工程、入会费、周贸易在途货款）
//                                 <记录键>|coin_river|escrow      records.<id>.escrow / state.quests.<id>.escrow / state.projects.<id>.public.escrow /
//                                                                 records.organization_proposal.escrow / records.settlement_trade.escrowCopper
// 源汇（world/ontology/resources.json 的 sourcesAndSinks）带用途，用途即流量类别（wage、tax、trade、interest、bounty、fee……）。
import {accountKey,transfer,declareLedgerWriter,registerLedgerOpening,ledgerActive,registerUpgradeBooking,registerTransferProjection,tallyDrift,LEDGER_COIN} from './ledger.mjs';
import {actorId} from './npc-state.mjs';
import {groupAccountView,changeGroupCoins} from './group-account.mjs';
import {holdingSet,declareHoldingWriter,isEffective,aliveHoldings} from './holdings.mjs';
import {priceRead} from './stock.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';

// 本地记账铜钱（rules.economy.credit.coinages 中 item 为 null 的 coinage_river）。其他铸币仍是物品，S1b 迁。
declareHoldingWriter('money',{kinds:[]});
export const COIN=LEDGER_COIN;
export const purse=(engine,id)=>accountKey(engine?actorId(engine.world,id):id,COIN,'purse');
export const treasury=id=>accountKey(id,COIN,'treasury');
export const vault=id=>accountKey(id,COIN,'vault');
export const fund=key=>accountKey(key,COIN,'fund');
export const escrow=key=>accountKey(key,COIN,'escrow');
export const workshopFund=id=>accountKey(id,COIN,'fund');
// 同一事务内的过路账户（如饷箱：先从出钱方拨入，再逐人发出），事务末余额必须为零。
export const transit=id=>accountKey(id,COIN,'transit');
export const shrineFund=location=>accountKey(location,COIN,'shrine');
export const polityTreasury=id=>accountKey(`polity:${id}`,COIN,'treasury');
export const source=(kind,purpose)=>accountKey(`src:${kind}`,COIN,purpose);
export const sink=(kind,purpose)=>accountKey(`sink:${kind}`,COIN,purpose);

// 资金当事人（玩家、人物、聚落、势力、组织）的账户：与 finance-bank.financeBalance 的取数顺序一致。
export function partyAccount(engine,state,id){
    if(state?.records?.[id]?.category==='bank'||engine?.rules.economy?.credit?.banks?.some(b=>b.id===id))return vault(id);
    if(state?.settlements?.[id])return treasury(id);
    if(groupAccountView(engine,state,id))return treasury(id);
    if(state?.records?.[`organization:${id}`]?.category==='organization')return treasury(id);
    return purse(engine,id);
}
// Mirror a booked protocol payment into the existing money owner, using the
// same owner resolution as ordinary finance payments. No new booking occurs.
export function mirrorPartyCoins(d,engine,id,delta,eventId,writer){
    const state=d.get('state');
    const bank=state.records?.[id],base=engine.rules.economy?.credit?.banks?.find(b=>b.id===id);
    if(bank?.category==='bank'||base){
        const row=bank??{category:'bank',id,name:base.name,location:base.location,coins:base.reserveCopper??0,goods:{...base.reserveCoins??{}},accounts:{}};
        const coins=row.coins+delta;if(!Number.isSafeInteger(coins)||coins<0)throw Error('Invalid bank balance');
        holdingSet(d,engine,['state','records',id],{...row,coins},writer,eventId);return coins;
    }
    if(groupAccountView(engine,state,id))return changeGroupCoins(d,engine,id,delta,{kind:'金融契约',sourceEvent:eventId,minute:state.minute},BOOKED);
    if(state.settlements?.[id]){
        const value=(state.settlements[id].treasury??0)+delta;
        if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid treasury balance');
        d.set(['state','settlements',id,'treasury'],value);return value;
    }
    const org=state.records?.[`organization:${id}`];
    if(org?.category==='organization'){
        const value=(org.treasury??0)+delta;
        if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid organization balance');
        holdingSet(d,engine,['state','records',`organization:${id}`],{...org,treasury:value,ledger:[...org.ledger??[],{coins:delta,sourceEvent:eventId}]},writer,eventId);return value;
    }
    if(state.records?.[`protocol_assets:${id}`]){
        const path=['state','records',`protocol_assets:${id}`,'coins'],value=(d.get(...path)??0)+delta;
        if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid estate balance');
        d.set(path,value);return value;
    }
    const path=engine.actorPath(id),value=(path.reduce((v,k)=>v?.[k],d.document)?.coins??0)+delta;
    if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid party balance');
    d.set([...path,'coins'],value);return value;
}

// 唯一的双写入口：旧写入点在改旧字段的同一处调用它。
export function moveCoins(d,{from,to,amount,writer,eventId=null}){
    if(!amount||from===to)return 0;
    return transfer(d,{from,to,amount,writer,eventId});
}
export const booksOpen=ledgerActive;

// ---- 旧字段里的全部余额（开账与对账的唯一取数处） --------------------------------
const num=n=>typeof n==='number'?n:0;
const RECORD_FUNDS=new Set(['legal_treasury','legal_deposit','medicine_fund']);
export function legacyMoney(engine,state){
    const out=new Map(),add=(key,n)=>{n=num(n);if(n)out.set(key,(out.get(key)??0)+n);};
    add(purse(null,'player'),state.player?.coins);
    for(const [id,n] of Object.entries(state.npcs??{}))add(purse(null,id),n?.coins);
    for(const [id,c] of Object.entries(state.creatures??{}))add(purse(null,id),c?.coins);
    for(const [id,s] of Object.entries(state.settlements??{}))add(treasury(id),s?.treasury);
    const records=state.records??{},groups=new Set((engine.world.factions??[]).map(f=>f.id));
    for(const key of Object.keys(records))if(key.startsWith('faction-assets:'))groups.add(key.slice('faction-assets:'.length));
    for(const id of [...groups].sort())if(!state.settlements?.[id])add(treasury(id),groupAccountView(engine,state,id)?.coins);
    const polities=new Set((engine.rules.military?.polities??[]).map(p=>p.id));
    const banks=new Map((engine.rules.economy?.credit?.banks??[]).map(b=>[b.id,b]));
    for(const [key,row] of Object.entries(records)){
        if(!row||typeof row!=='object')continue;
        const c=row.category;
        if(c==='money_account'){add(row.account,row.coins);continue;}
        if(c==='obligation_collection'){add(row.account,row.coins);continue;}
        if(c==='protocol_assets'){add(purse(null,row.owner),row.coins);for(const [purpose,n]of Object.entries(row.funds??{}))add(accountKey(row.owner,COIN,purpose),n);}
        else if(c==='organization'){const id=key.slice('organization:'.length);if(!groupAccountView(engine,state,id)&&!state.settlements?.[id])add(treasury(id),row.treasury);}
        else if(c==='polity_treasury'){polities.delete(key.slice('polity:'.length));add(accountKey(key,COIN,'treasury'),row.coins);}
        else if(c==='bank'){banks.delete(key);add(vault(key),row.coins);}
        else if(RECORD_FUNDS.has(c))add(fund(key),row.coins);
        else if(c==='settlement_trade')add(escrow(key),row.escrowCopper);
        // 议案的入会费只在议事中托管；议决后记录保留原数额作凭据，钱已入公库或退回。
        else if(c==='organization_proposal'){if(row.status==='议事中')add(escrow(row.feePayer?`motion_${key}`:key),row.escrow);}
        // S5-F2: a contract frozen in a tender-unit resource holds that resource in kind (goods-escrow.mjs), not coin_river.
        else if(c!=='quest_receipt'&&typeof row.escrow==='number'&&!(c==='contract'&&row.resource&&row.resource!==COIN))add(escrow(key),row.escrow);
    }
    // 未开户的政体国库与钱庄库银取世界数据（与 military.polityRow、credit.bankRow 的缺省一致）。
    for(const id of polities)add(polityTreasury(id),(engine.rules.military?.polities??[]).find(p=>p.id===id)?.treasuryCopper);
    for(const [id,b] of banks)add(vault(id),b.reserveCopper);
    for(const [id,q] of Object.entries(state.quests??{}))add(escrow(id),q?.escrow);
    for(const [id,p] of Object.entries(state.projects??{}))add(escrow(id),p?.public?.escrow);
    for(const [id,n] of Object.entries(state.workshopFunds??{}))add(workshopFund(id),n);
    for(const [id,n] of Object.entries(state.shrineTreasuries??{}))add(shrineFund(id),n);
    return out;
}
registerLedgerOpening((engine,state)=>[...legacyMoney(engine,state)].sort(([a],[b])=>a<b?-1:a>b?1:0));
// S1b: 世界版本更新补发或改写的钱同样经 src:pack_converted / sink:pack_removed 入账（ledger.bookUpgrade）。
declareLedgerWriter('world-upgrade',{sources:{'src:pack_converted':{[COIN]:Infinity}},sinks:['sink:pack_removed']});
registerUpgradeBooking('coin',(d,engine,before,after)=>{
    const a=legacyMoney(engine,before.state),b=legacyMoney(engine,after.state);
    for(const key of new Set([...a.keys(),...b.keys()])){
        const delta=(b.get(key)??0)-(a.get(key)??0);if(!delta)continue;
        if(delta>0)transfer(d,{from:accountKey('src:pack_converted',COIN,'upgrade'),to:key,amount:delta,writer:'world-upgrade'});
        else transfer(d,{from:key,to:accountKey('sink:pack_removed',COIN,'upgrade'),amount:-delta,writer:'world-upgrade'});
    }
});

// 单边旧写入（某个账户加减）的双写：books = {account: 对方账户键, writer, eventId?}；
// 成对旧写入中已由另一处 moveCoins 记过账的一边传 BOOKED。
// 缺对方账户的调用（漏改的写入点、测试直接调用的辅助函数）不拦旧结算——旧字段仍是权威——
// 而是在账本记一条未入账漂移，对账测试见到即失败。
export const BOOKED=Object.freeze({booked:true});
export function bookSide(d,account,delta,books){
    if(books===BOOKED||!delta)return 0;
    if(!books?.account||!books?.writer){
        if(ledgerActive(d)){d.set(['ledger','drift'],[...(d.get('ledger','drift')??[]),{account,unbooked:delta,minute:d.get('state','minute')??null}].slice(-50));tallyDrift(d,'unbooked');}
        return 0;
    }
    return delta>0?moveCoins(d,{from:books.account,to:account,amount:delta,writer:books.writer,eventId:books.eventId??null})
        :moveCoins(d,{from:account,to:books.account,amount:-delta,writer:books.writer,eventId:books.eventId??null});
}

// ---- S1c 价格输入读账户：货币量（现款、公库）经账户余额读取，旧字段只作过渡期对照 ----------
// account: 账户键（partyAccount / purse / treasury …）；legacy: 取旧字段的函数。见 stock.priceRead。
export const coinRead=(src,{point,account,legacy})=>priceRead(src,{point,scope:'coin',account,legacy});

// Opening facts belong to an account, not to its owner's personal purse.
export const dedicatedCoinKey=(owner,purpose)=>`money_account:${accountKey(owner,COIN,purpose)}`;
export function dedicatedCoinAccount(state,owner,purpose){return state.records?.[dedicatedCoinKey(owner,purpose)]??null;}
registerTransferProjection((d,{from,to,fromAccount:a,toAccount:b,amount,eventId,writer})=>{
    const dedicated=ac=>ac.resource===COIN&&['counter','legal_treasury'].includes(ac.purpose);
    if(!dedicated(a)&&!dedicated(b)||!d.document?.state)return;
    const origin=dedicated(a)?dedicatedCoinAccount(d.get('state'),a.owner,a.purpose):null;
    const destination=dedicated(b)?dedicatedCoinAccount(d.get('state'),b.owner,b.purpose):null;
    if(origin)holdingSet(d,d.engine,['state','records',dedicatedCoinKey(a.owner,a.purpose),'coins'],d.get('ledger','accounts',from)??0,'money',eventId);
    if(destination)holdingSet(d,d.engine,['state','records',dedicatedCoinKey(b.owner,b.purpose),'coins'],d.get('ledger','accounts',to)??0,'money',eventId);
    else if(origin&&dedicated(b)&&a.purpose===b.purpose&&!b.owner.startsWith('sink:')&&!b.owner.startsWith('src:')){
        holdingSet(d,d.engine,['state','records',dedicatedCoinKey(b.owner,b.purpose)],{category:'money_account',owner:b.owner,purpose:b.purpose,account:to,
            coins:d.get('ledger','accounts',to)??0,originAccount:from,transferredBy:eventId,...(origin.seat?{seat:origin.seat}:{})},'money',eventId);
    }
    // transition.bookTransfer cannot mirror an unknown dedicated source. Its
    // ordinary destination must still receive the single real booked payment.
    const procedural=d.get('state','records',`protocol_assets:${a.owner}`,'funds',a.purpose)??0;
    if(origin&&writer==='transition'&&procedural<amount&&to===partyAccount(d.engine,d.get('state'),b.owner))mirrorPartyCoins(d,d.engine,b.owner,amount,eventId,'money');
});
// A counter is this owner's free cash, distinct from earmarked public funds.
export function counterClaimAccounts(d,owner){
    const row=dedicatedCoinAccount(d.get('state'),owner,'counter'),amount=row&&Math.min(row.coins,d.get('ledger','accounts',row.account)??0);
    return amount>0?[[row.account,amount]]:[];
}
registerAdvanceHook('counterClaimAccounts',counterClaimAccounts);
// Runtime payments out of a dedicated account post as 'money'.
declareLedgerWriter('money');
// Private counter spending is an owner's action. It cannot grant loan consent.
export function spendCounterCoins(d,engine,{owner,actor,to,amount,eventId}){
    if(typeof eventId!=='string'||!eventId)throw Error('Counter payment requires eventId');
    const receipt=`counter_payment:${eventId}`,old=d.get('state','records',receipt);
    if(old){if(old.owner!==owner||old.actor!==actor||old.to!==to||old.amount!==amount)throw Error('Counter payment eventId reused');return structuredClone(old.result);}
    const row=dedicatedCoinAccount(d.get('state'),owner,'counter');
    if(actor!==owner||!row||!Number.isSafeInteger(amount)||amount<1||row.coins<amount||!ledgerActive(d)||(d.get('ledger','accounts',row.account)??0)<amount||
        !(to==='player'||d.get('state','npcs',to)||d.get('state','creatures',to)))throw Error('Counter payment requires its owner and sufficient funds');
    const person=actor==='player'?d.get('state','player'):d.get('state','npcs',actor)??d.get('state','creatures',actor);
    const target=to==='player'?d.get('state','location'):d.get('state','npcs',to,'location')??d.get('state','creatures',to,'location');
    if(!person||!isEffective(engine,d,owner)||person.hp<=0||person.capacity==='none'||['死亡','昏迷','失能'].includes(person.status)||
        target!==d.get('state','location')||row.seat!==undefined&&row.seat!==d.get('state','location')||aliveHoldings(d,{kind:'frozen',subject:row.account}).length||
        (actor==='player'?d.get('state','location'):person.location)!==d.get('state','location'))throw Error('Counter owner cannot act here');
    moveCoins(d,{from:row.account,to:partyAccount(engine,d.get('state'),to),amount,writer:'money',eventId});
    mirrorPartyCoins(d,engine,to,amount,eventId,'money');
    const result={from:row.account,amount};
    holdingSet(d,engine,['state','records',receipt],{category:'counter_payment',owner,actor,to,amount,result},'money');
    return result;
}

// 15 §15.1.1: a business pays its running costs (wages, stock) from its counter, never from the owner's own purse.
// The balance a payment may use: the recorded counter, capped by the ledger, and nothing while it is frozen.
export function counterCash(d,owner){
    const row=dedicatedCoinAccount(d.get('state'),owner,'counter');
    if(!row||aliveHoldings(d,{kind:'frozen',subject:row.account}).length)return 0;
    return Math.max(0,Math.min(row.coins,d.get('ledger','accounts',row.account)??0));
}
// The owner puts working capital in. The first deposit opens the account at the shop's seat (provenance: the
// opening event); later deposits are the same real purse -> counter transfer as business:fund_counter.
export function depositCounter(d,engine,{owner,seat,business,amount,eventId,writer='money'}){
    if(!Number.isSafeInteger(amount)||amount<1||!ledgerActive(d))throw Error('Counter deposit requires a positive amount and open books');
    const state=d.get('state');
    if(!dedicatedCoinAccount(state,owner,'counter'))holdingSet(d,engine,['state','records',dedicatedCoinKey(owner,'counter')],
        {category:'money_account',owner,purpose:'counter',account:accountKey(owner,COIN,'counter'),coins:0,seat,business,sourceEvent:eventId,openedBy:eventId},'money',eventId);
    const row=dedicatedCoinAccount(d.get('state'),owner,'counter');
    moveCoins(d,{from:purse(engine,owner),to:row.account,amount,writer,eventId});
    mirrorPartyCoins(d,engine,owner,-amount,eventId,writer);
    return {account:row.account,amount};
}
// A business outlay: the counter pays first (up to what it holds), whatever it lacks comes from the owner's own purse (up to what the purse
// holds); both legs are real transfers and the purse leg mirrors its legacy coins. Short in total -> fails loudly before anything is written.
// The caller books the receiving side (mirrorPartyCoins) as for any moveCoins payment.
export function payCounterThenPurse(d,engine,{owner,to,amount,writer,eventId}){
    if(!Number.isSafeInteger(amount)||amount<1)throw Error('Payment requires a positive whole amount');
    const row=dedicatedCoinAccount(d.get('state'),owner,'counter'),fromCounter=row?Math.min(counterCash(d,owner),amount):0,fromPurse=amount-fromCounter;
    // Pre-check against what moveCoins will really accept: the smaller of the legacy coins and the ledger purse account.
    const legacyCoins=d.get(...engine.actorPath(owner),'coins')??0,purseCoins=Math.min(legacyCoins,d.get('ledger','accounts',purse(engine,owner))??legacyCoins);
    if(fromPurse>purseCoins)throw Error(`Payment ${amount} exceeds the counter (${fromCounter}) plus the purse (${purseCoins})`);
    if(fromCounter)moveCoins(d,{from:row.account,to,amount:fromCounter,writer,eventId});
    if(fromPurse){moveCoins(d,{from:purse(engine,owner),to,amount:fromPurse,writer,eventId});mirrorPartyCoins(d,engine,owner,-fromPurse,eventId,writer);}
    return {fromCounter,fromPurse};
}
// A payment out of the counter to any money party, limited to what the counter holds.
export function payFromCounter(d,engine,{owner,to,amount,writer,eventId}){
    const row=dedicatedCoinAccount(d.get('state'),owner,'counter');
    if(!row||!Number.isSafeInteger(amount)||amount<1||amount>counterCash(d,owner))throw Error('Counter payment exceeds the counter cash');
    moveCoins(d,{from:row.account,to:partyAccount(engine,d.get('state'),to),amount,writer,eventId});
    mirrorPartyCoins(d,engine,to,amount,eventId,writer);
    return {from:row.account,amount};
}
