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
import {accountKey,transfer,declareLedgerWriter,registerLedgerOpening,ledgerActive,registerUpgradeBooking,LEDGER_COIN} from './ledger.mjs';
import {actorId} from './npc-state.mjs';
import {groupAccountView,changeGroupCoins} from './group-account.mjs';
import {holdingSet,declareHoldingWriter} from './holdings.mjs';
import {priceRead} from './stock.mjs';

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
    if(state?.settlements?.[id])return treasury(id);
    if(groupAccountView(engine,state,id))return treasury(id);
    if(state?.records?.[`organization:${id}`]?.category==='organization')return treasury(id);
    return purse(engine,id);
}
// Mirror a booked protocol payment into the existing money owner, using the
// same owner resolution as ordinary finance payments. No new booking occurs.
export function mirrorPartyCoins(d,engine,id,delta,eventId,writer){
    const state=d.get('state');
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
        if(c==='protocol_assets'){add(purse(null,row.owner),row.coins);for(const [purpose,n]of Object.entries(row.funds??{}))add(accountKey(row.owner,COIN,purpose),n);}
        else if(c==='organization'){const id=key.slice('organization:'.length);if(!groupAccountView(engine,state,id)&&!state.settlements?.[id])add(treasury(id),row.treasury);}
        else if(c==='polity_treasury'){polities.delete(key.slice('polity:'.length));add(accountKey(key,COIN,'treasury'),row.coins);}
        else if(c==='bank'){banks.delete(key);add(vault(key),row.coins);}
        else if(RECORD_FUNDS.has(c))add(fund(key),row.coins);
        else if(c==='settlement_trade')add(escrow(key),row.escrowCopper);
        // 议案的入会费只在议事中托管；议决后记录保留原数额作凭据，钱已入公库或退回。
        else if(c==='organization_proposal'){if(row.status==='议事中')add(escrow(key),row.escrow);}
        else if(c!=='quest_receipt'&&typeof row.escrow==='number')add(escrow(key),row.escrow);
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
        if(ledgerActive(d))d.set(['ledger','drift'],[...(d.get('ledger','drift')??[]),{account,unbooked:delta,minute:d.get('state','minute')??null}].slice(-50));
        return 0;
    }
    return delta>0?moveCoins(d,{from:books.account,to:account,amount:delta,writer:books.writer,eventId:books.eventId??null})
        :moveCoins(d,{from:account,to:books.account,amount:-delta,writer:books.writer,eventId:books.eventId??null});
}

// ---- S1c 价格输入读账户：货币量（现款、公库）经账户余额读取，旧字段只作过渡期对照 ----------
// account: 账户键（partyAccount / purse / treasury …）；legacy: 取旧字段的函数。见 stock.priceRead。
export const coinRead=(src,{point,account,legacy})=>priceRead(src,{point,scope:'coin',account,legacy});
