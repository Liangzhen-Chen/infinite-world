import {creatureTraits} from './traits.mjs';
// S1b 物品、粮与库存适配器（L1）：把旧状态里存放可计量物品的字段映射为账本账户，
// 并给旧写入点一个同时写新账本的入口（绞杀式双写：旧字段照写，读取暂不改）。
// 资源键 = 物品模板 id（world/meta/items.json，按 world 现有命名空间；core 省略）；登记为铸币的物品
// （rules.economy.credit.coinages 的 item）记为对应铸币资源（coin_civic、coin_coast，15 §15.3）。
// 账户键 = <所属实体>|<资源>|<用途>：
//   人（玩家、名册人物、生灵）的行囊   <id>|<物品>|inventory    state.inventory / state.npcs.<id>.inventory / state.creatures.<id>.inventory
//   势力/神殿/国家/自建组织库存        <id>|<物品>|store        faction-assets:<id>.items（未开户为世界数据 resources.items）/ organization:<id>.items
//   聚落公仓（粮）                    <聚落>|item_oats|granary  state.settlements.<id>.food（托管农事的聚落按 agriculture:<id>.batches 分批次）
//   聚落种粮                          <聚落>|item_oats|seed     agriculture:<id>.field.seedBank（seedBatches 分批次）
//   聚落木石铁                        <聚落>|<物品>|stock      state.settlements.<id>.wood/stone/iron（rules.economy.shops.stockItems 的对应物品）
//   军粮                              army:<id>|item_oats|ration records.army:<id>.food
//   周贸易在途粮                      settlement-trade:<id>|item_oats|cargo  records.settlement-trade:<id>.batches（分批次）
//   托运在途货物                      transport:<id>|<物品>|freight  records.transport:<id>.cargo
//   质押物                            pledge:<键>|<物品>|pledge  records.pledge:*（质押中）
//   钱庄库存铸币                      <钱庄>|<铸币>|vault       records.<钱庄>.goods（未开户为 rules.economy.credit.banks.reserveCoins）
//   工程备料                          <工程>|<物品>|works       state.projects.<id>.wood/stone（施工中且已备料）
//   矿脉储量                          mineral:<地点>:<物品>|<物品>|reserve  records.mineral:*.reserve（首次开采时按世界数据开户）
//   林木存量                          forest:<地点>|item_wood|reserve  records.forest:*.reserve（首次采伐时按世界数据开户）
//   鱼群/个体/在途鱼                  <地点、个体、迁徙>|item_live_fish|reserve  同一实物的持有人转移
//   落地/封存/袋内/法院保管的单件     <地点、容器或保管者>|<物品>|placed  state.itemInstances.<id>（落地、封存按 location，袋内按 container，保管按 owner）
// 源汇（world/ontology/resources.json 的 sourcesAndSinks）的用途即流量类别（gather、harvest、meal、craft、decay……）。
// 批次（lots）用于粮仓、种粮、货运与田间作物（granary、seed、cargo、crop）；其余物品暂按数量计。
import {isResourceKey,accountKey,parseAccount,transfer,registerLedgerOpening,registerLotPolicy,ledgerActive,reviseLots,declareLedgerWriter,registerUpgradeBooking,tallyDrift} from './ledger.mjs';
import {actorId} from './npc-state.mjs';
import {groupAccountView} from './group-account.mjs';
import {exp} from './det-math.mjs';
import {craftUseWindowDays} from './primitives-body.mjs';

export const LOT_PURPOSES=Object.freeze(new Set(['granary','seed','cargo','crop']));
registerLotPolicy(({purpose})=>LOT_PURPOSES.has(purpose));
export const GRAIN='item_oats';// rules.agriculture.grainItem 与 rules.economy.shops.stockItems.food 的缺省

const coinItems=new WeakMap();
// 物品 → 资源键：铸币物品记为铸币资源（coinage_civic → coin_civic），其余即物品 id。
export function itemResource(engine,item){
    const world=engine?.world;let map=world&&coinItems.get(world);
    if(world&&!map){map=new Map((world.rules?.economy?.credit?.coinages??[]).filter(c=>c.item).map(c=>[c.item,c.id.replace(/^coinage_/,'coin_')]));coinItems.set(world,map);}
    const coin=map?.get(item);if(coin)return coin;
    // 旧存档的物品按中文名记（干粮）：不合资源键格式时按名称解析成物品 id；解析不了就原样交给键校验报错。
    if(!isResourceKey(item)&&typeof engine?.resolve==='function'){try{return engine.resolve(item,'item');}catch{}}
    return item;
}
const res=(engine,item)=>itemResource(engine,item);
export const bag=(engine,id,item)=>accountKey(engine?actorId(engine.world,id):id,res(engine,item),'inventory');
export const store=(engine,id,item)=>accountKey(id,res(engine,item),'store');
export const stockItem=(engine,stock)=>engine?.rules?.economy?.shops?.stockItems?.[stock]??({food:GRAIN,wood:'item_wood',stone:'item_stone',iron:'item_iron'})[stock];
export const granary=(engine,sid)=>accountKey(sid,res(engine,stockItem(engine,'food')),'granary');
export const seedBank=(engine,sid)=>accountKey(sid,res(engine,stockItem(engine,'food')),'seed');
export const settlementStock=(engine,sid,stock)=>stock==='food'?granary(engine,sid):accountKey(sid,res(engine,stockItem(engine,stock)),'stock');
export const armyRations=(engine,id)=>accountKey(String(id).startsWith('army:')?id:`army:${id}`,res(engine,stockItem(engine,'food')),'ration');
export const cargo=(engine,key,item)=>accountKey(key,res(engine,item),'cargo');
export const freight=(engine,key,item)=>accountKey(key,res(engine,item),'freight');
export const pledged=(engine,key,item)=>accountKey(key,res(engine,item),'pledge');
export const vaultGoods=(engine,bank,item)=>accountKey(bank,res(engine,item),'vault');
export const works=(engine,project,item)=>accountKey(project,res(engine,item),'works');
export const reserve=(engine,node,item)=>accountKey(node,res(engine,item),'reserve');
export const crop=(engine,node,item)=>accountKey(node,res(engine,item),'crop');
// 没有登记地点的单件（旧记录缺 location）记在 unplaced 名下，旧账与新账同口径。
export const placed=(engine,holder,item)=>accountKey(String(holder||'unplaced').replace(/[|\s]/g,'_'),res(engine,item),'placed');
export const transit=(engine,key,item)=>accountKey(key,res(engine,item),'transit');
export const stockSource=(engine,kind,item,purpose)=>accountKey(`src:${kind}`,res(engine,item),purpose);
export const stockSink=(engine,kind,item,purpose)=>accountKey(`sink:${kind}`,res(engine,item),purpose);

// D05 5.5: retain the continuous anchor, rounding only the visible stock.
// A harvest changes the integer stock; subtract that exact change from the
// continuous quantity before starting the next segment. Zero cannot regrow.
export function logisticStock(row,channel,{reserve,capacity,rate,from,to}){
    if(![reserve,capacity,rate,from,to].every(Number.isFinite)||reserve<0||capacity<0||rate<0||to<from)throw Error('无效的再生参数');
    // When the exponential is exactly 1 the curve value is the anchor's reserve. That is the case at the anchor's own minute (exponent 0),
    // for a rate of 0, and for any positive rate small enough that det-math's exp rounds to 1.0 (|exponent| below about 5.5e-17: checked by
    // replaying det-math's algorithm, exp(0) = exp(-0) = exp(-1e-18) = 1 and exp(-6e-17) = 0.9999999999999999). The closed form does not
    // return it in IEEE doubles: with e = 1, capacity / (1 + (capacity / reserve - 1) * e) is reserve - 1 ulp for some inputs (101 and 1001 give
    // 100.99999999999999, 1000 and 1100 give 999.9999999999999, 250 and 1100 give 249.99999999999997). The floor then reads one unit less than
    // the integer reserve, and the rebase below mistakes that for a harvest and starts the anchor one unit too high: at a fresh anchor, on every
    // later day of a zero-rate stretch (a winter with density 0), and for a vanishing rate. The closed form is not rewritten
    // (reserve * capacity / (reserve + (capacity - reserve) * e) is also not exact at e = 1, 1% of inputs against 8%, and it changes the bits of
    // about half of all results for e < 1), so the one exact case, e === 1, is returned directly.
    const at=(a,t)=>{
        if(a.reserve<=0||a.capacity<=0)return 0;
        const e=exp(-a.rate*(t-a.minute)/1440);
        return e===1?a.reserve:a.capacity/(1+(a.capacity/a.reserve-1)*e);
    };
    let a=row.growthAnchors?.[channel]??{minute:from,reserve,capacity,rate};
    const current=at(a,from),visible=Math.floor(current);
    if(visible!==reserve||a.capacity!==capacity||a.rate!==rate){
        a={minute:from,reserve:reserve===0?0:Math.max(0,current+reserve-visible),capacity,rate};
    }
    row.growthAnchors??={};row.growthAnchors[channel]=a;
    return Math.max(reserve,Math.floor(at(a,to)));
}
// Accumulate decimal production rationally; quantize only the total increment.
export function accrueStock(row,channel,quantity,periods=1,divisor=1){
    if(!Number.isFinite(quantity)||quantity<0||!Number.isSafeInteger(periods)||periods<0||!Number.isSafeInteger(divisor)||divisor<1)throw Error('资源累计量或期间无效');
    const [mantissa,exponent='0']=String(quantity).toLowerCase().split('e'),[whole,fraction='']=mantissa.split('.');
    let units=BigInt(whole+fraction),places=fraction.length-Number(exponent);
    if(places<0){units*=10n**BigInt(-places);places=0;}
    // Keep workday conversion rational: fifteen 32-minute shifts at 20/480
    // must yield 20, not floor(15 * rounded(4/3)) = 19.
    const old=row.accruals?.[channel]??{numerator:'0',denominator:'1'};
    const before=BigInt(old.numerator),beforeDen=BigInt(old.denominator),inputDen=10n**BigInt(places)*BigInt(divisor);
    let after=before*inputDen+units*BigInt(periods)*beforeDen,denominator=beforeDen*inputDen;
    const produced=Number(after/denominator-before/beforeDen);
    if(!Number.isSafeInteger(produced))throw Error('资源累计产量溢出');
    let left=after,right=denominator;while(right){const rest=left%right;left=right;right=rest;}
    after/=left;denominator/=left;
    row.accruals??={};row.accruals[channel]={numerator:String(after),denominator:String(denominator)};return produced;
}

// 唯一的双写入口：旧写入点在改旧字段的同一处调用它。lot/pick 见 ledger.transfer。
export function moveStock(d,{from,to,amount,writer,eventId=null,lot=null,pick=null}){
    if(!amount||from===to)return 0;
    return transfer(d,{from,to,amount,writer,eventId,lot,pick});
}
export {reviseLots};
export const BOOKED=Object.freeze({booked:true});
// 已由来源写入者记过账、但要让公共入口（engine.itemDelta）看得出是谁、为何写入：带 writer/purpose 的已记账标记（只标注，不再记账）。
export const bookedBy=(writer,purpose,eventId=null)=>Object.freeze({booked:true,writer,purpose,eventId});
// 单边旧写入（某个账户加减）的双写：books 给出对方——
//   {account}                  对方账户键（资源须相同）
//   {party, purpose='inventory'} 对方实体（行囊缺省）：账户 = <party>|<本资源>|<purpose>
//   {flow:'src:x'|'sink:x', purpose}  源汇：账户 = <flow>|<本资源>|<purpose>
// 以及 writer、eventId、lot、pick。成对旧写入中已由另一处记过账的一边传 BOOKED。
// 缺对方账户的调用（漏改的写入点、测试直接调用的辅助函数）不拦旧结算，记一条未入账漂移，对账测试见到即失败。
export function counterAccount(engine,account,books){
    if(books.account)return books.account;
    const resource=account.split('|')[1];
    if(books.flow)return accountKey(books.flow,resource,books.purpose??'other');
    if(books.party)return accountKey(engine?actorId(engine.world,books.party):books.party,resource,books.purpose??'inventory');
    return null;
}
export function bookStock(d,engine,account,delta,books){
    if(books?.booked===true||!delta)return 0;
    const other=books?.writer?counterAccount(engine,account,books):null;
    if(!other){
        if(ledgerActive(d)){d.set(['ledger','drift'],[...(d.get('ledger','drift')??[]),{account,unbooked:delta,minute:d.get('state','minute')??null}].slice(-50));tallyDrift(d,'unbooked');}
        return 0;
    }
    const common={writer:books.writer,eventId:books.eventId??null,lot:books.lot??null,pick:books.pick??null};
    return delta>0?moveStock(d,{from:other,to:account,amount:delta,...common}):moveStock(d,{from:account,to:other,amount:-delta,...common});
}
export const booksOpen=ledgerActive;

// ---- 旧字段里的全部库存（开账与对账的唯一取数处） --------------------------------
const qty=v=>typeof v==='number'?v:v?.quantity??0;
const num=n=>Number.isSafeInteger(n)&&n>0?n:0;
const batchLots=(batches,kind=null)=>batches.filter(b=>b.amount>0).map(b=>({id:String(b.id??`${b.harvestDay}:${b.expiresDay}`),qty:b.amount,day:b.harvestDay??null,expiresDay:b.expiresDay??null,kind:b.kind??kind}));
// 钱庄没收（status 没收）的单件已计入钱庄库存 goods，不另计。
// 玩法包登记自己的旧库存字段（依赖倒置：本体层不 import 玩法包）。fn(engine, state, add(key, n, lots?))。
const enumerators=new Map();
export function registerLegacyStock(name,fn){enumerators.set(name,fn);}
export const UNIT_PLACED=Object.freeze({'落地':'location','封存':'location','保管':'owner','袋内':'container'});
export function legacyStock(engine,state){
    const out=new Map(),lots=new Map();
    const add=(key,n,l)=>{n=num(n);if(!n)return;out.set(key,(out.get(key)??0)+n);if(l?.length)lots.set(key,[...(lots.get(key)??[]),...l]);};
    const bagOf=(id,inventory)=>{for(const [item,v] of Object.entries(inventory??{}))add(bag(engine,id,item),qty(v));};
    bagOf('player',state.inventory);
    for(const [id,n] of Object.entries(state.npcs??{}))bagOf(id,n?.inventory);
    // 非居民的生灵首领把谈判库存记在 negotiation.inventory（boss-negotiation 的行囊路径），同一行囊账户。
    for(const [id,c] of Object.entries(state.creatures??{})){bagOf(id,c?.inventory);bagOf(id,c?.negotiation?.inventory);}
    // 势力、神殿、国家库存（与 money.legacyMoney 的公库同一取数）；没有势力公库的自建组织用组织记录。
    const records=state.records??{},groups=new Set((engine.world.factions??[]).map(f=>f.id));
    for(const key of Object.keys(records))if(key.startsWith('faction-assets:'))groups.add(key.slice('faction-assets:'.length));
    for(const id of [...groups].sort())if(!state.settlements?.[id])for(const [item,n] of Object.entries(groupAccountView(engine,state,id)?.items??{}))add(store(engine,id,item),n);
    for(const [key,row] of Object.entries(records)){
        if(!row||typeof row!=='object')continue;
        const c=row.category;
        if(c==='protocol_assets')bagOf(row.owner,row.inventory);
        else if(c==='organization'){const id=key.slice('organization:'.length);if(!groupAccountView(engine,state,id)&&!state.settlements?.[id])for(const [item,n] of Object.entries(row.items??{}))add(store(engine,id,item),n);}
        else if(c==='army')add(armyRations(engine,key),row.food);
        else if(c==='settlement_trade'&&row.status==='in-transit')add(cargo(engine,key,row.item),(row.batches??[]).reduce((n,b)=>n+b.amount,0),batchLots(row.batches??[]));
        else if(c==='transport')for(const g of row.cargo??[])add(freight(engine,key,g.item),g.quantity);
        else if(c==='pledge'&&row.status==='质押中')add(pledged(engine,key,row.item),row.quantity);
        else if(c==='bank')for(const [item,n] of Object.entries(row.goods??{}))add(vaultGoods(engine,key,item),n);
        else if(c==='mineral')add(reserve(engine,key,row.item),row.reserve);
        else if(c==='forest')add(reserve(engine,key,'item_wood'),row.reserve);
    }
    for(const b of engine.rules.economy?.credit?.banks??[])if(!records[b.id])for(const [item,n] of Object.entries(b.reserveCoins??{}))add(vaultGoods(engine,b.id,item),n);
    // 聚落公仓：托管农事的聚落按粮仓批次（grain / fresh）与种粮批次计，其余聚落是一个不分批的数。
    for(const [sid,s] of Object.entries(state.settlements??{})){
        const farm=records[`agriculture:${sid}`];
        if(farm?.mode==='managed'){add(granary(engine,sid),s.food,batchLots(farm.batches??[]));add(seedBank(engine,sid),farm.field?.seedBank,batchLots(farm.field?.seedBatches??[],'seed'));}
        else add(granary(engine,sid),s.food,num(s.food)?[{id:'stock',qty:s.food,day:null,expiresDay:null,kind:null}]:null);
        for(const stock of ['wood','stone','iron'])add(settlementStock(engine,sid,stock),s[stock]);
    }
    for(const [id,p] of Object.entries(state.projects??{}))if(p?.status==='施工中')for(const stock of ['wood','stone'])add(works(engine,id,stockItem(engine,stock)),p[stock]);
    for(const u of Object.values(state.itemInstances??{})){const field=UNIT_PLACED[u?.status];if(field)add(placed(engine,u[field],u.item),1);}
    for(const fn of enumerators.values())fn(engine,state,add);
    return {balances:out,lots};
}
// 世界版本更新的折算（ledger.bookUpgrade）：更新前后旧库存的差额经 src:pack_converted / sink:pack_removed 入账。
declareLedgerWriter('world-upgrade',{sources:{'src:pack_converted':{'*':Infinity}},sinks:['sink:pack_removed']});
export function bookBalanceChanges(d,beforeBalances,afterBalances,purpose='upgrade'){
    for(const key of new Set([...beforeBalances.keys(),...afterBalances.keys()])){
        const delta=(afterBalances.get(key)??0)-(beforeBalances.get(key)??0);if(!delta)continue;
        const resource=key.split('|')[1];
        if(delta>0)transfer(d,{from:`src:pack_converted|${resource}|${purpose}`,to:key,amount:delta,writer:'world-upgrade'});
        else transfer(d,{from:key,to:`sink:pack_removed|${resource}|${purpose}`,amount:-delta,writer:'world-upgrade'});
    }
}
registerUpgradeBooking('stock',(d,engine,before,after)=>bookBalanceChanges(d,legacyStock(engine,before.state).balances,legacyStock(engine,after.state).balances));
registerLedgerOpening((engine,state)=>{
    const {balances,lots}=legacyStock(engine,state);
    return [...balances].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,n])=>[key,n,lots.get(key)??null]);
},'stock');

// ---- 生成即开户（远方生成的人物与聚落，src:genesis） --------------------------------
export function genesisBag(d,engine,id,inventory,{writer,eventId=null}){
    for(const [item,v] of Object.entries(inventory??{}))moveStock(d,{from:stockSource(engine,'genesis',item,'remote'),to:bag(engine,id,item),amount:qty(v),writer,eventId});
}
export function genesisSettlement(d,engine,sid,s,{writer,eventId=null}){
    moveStock(d,{from:stockSource(engine,'genesis',stockItem(engine,'food'),'remote'),to:granary(engine,sid),amount:num(s.food),writer,eventId,lot:{id:'stock',day:null,expiresDay:null,kind:null}});
    for(const stock of ['wood','stone','iron'])moveStock(d,{from:stockSource(engine,'genesis',stockItem(engine,stock),'remote'),to:settlementStock(engine,sid,stock),amount:num(s[stock]),writer,eventId});
}

// ---- 工程备料 ----------------------------------------------------------------
// 开工时木石从出料方（自备者行囊或聚落库存）转入工程账户 <工程>|<物品>|works；完工即消耗（sink:consume|build），
// 中止时按已做工的比例消耗，余下退回出料方。
const MATERIALS=[['wood','item_wood'],['stone','item_stone']];
export function holdWorks(d,engine,project,amounts,{from,writer,eventId=null}){
    for(const [k,item] of MATERIALS){const n=amounts[k]??0;if(!n)continue;
        const src=from.settlement?settlementStock(engine,from.settlement,k):bag(engine,from.party,item);
        moveStock(d,{from:src,to:works(engine,project,item),amount:n,writer,eventId});}
}
export function settleWorks(d,engine,p,{returned={},to,writer,eventId=null}){
    for(const [k,item] of MATERIALS){const held=p[k]??0,back=returned[k]??0;if(!held)continue;
        const acct=works(engine,p.id,item);
        if(back){const dst=to.settlement?settlementStock(engine,to.settlement,k):bag(engine,to.party,item);moveStock(d,{from:acct,to:dst,amount:back,writer,eventId});}
        moveStock(d,{from:acct,to:stockSink(engine,'consume',item,'build'),amount:held-back,writer,eventId});}
}

// ---- 制造守恒对（src:craft，01 §1.6） ------------------------------------------
// 配方投入经 sink:consume|<物品>|craft 消耗，产出（含失败时按配方回收的残料）经 src:craft|<物品>|craft 流入；
// 同一事务内记一条制造凭据（ledger.crafts：配方、批数、投入与产出；失败时另记 failure 类别 intact/wear/ruin/partial（检定未落类别的按配方回收记 ruin），成功不带），审计按配方核对产出不超过投入的函数。
export const CRAFT_PURPOSE='craft';
export const craftInput=(writer,eventId)=>({flow:'sink:consume',purpose:CRAFT_PURPOSE,writer,eventId});
export const craftOutput=(writer,eventId)=>({flow:'src:craft',purpose:CRAFT_PURPOSE,writer,eventId});
// 行为人 actor（可空：野生社会的群体没有单个行为人时按所属群体/空）与发生地聚落 place 由各调用方传入；place 非空时耗料同时记入按（聚落，物品）的滚动日桶（accrueCraftUse）。place 只给"投入被实际消耗、转化成产物"的工序；转移、捐赠、存取这类不改变物料总量的记录不传 place（只留守恒对凭据）。
export function recordCraft(d,{engine,actor=null,place=null,recipe,batches=1,inputs={},outputs={},failure=null,writer,eventId=null}){
    if(recipe&&place)accrueCraftUse(d,engine,place,inputs,outputs,failure);
    if(!ledgerActive(d))return;
    if(!recipe)throw Error('制造产出必须指明配方（src:craft 守恒对）');
    d.set(['ledger','crafts'],[...(d.get('ledger','crafts')??[]),{recipe,batches,actor,place,inputs,outputs,...(failure?{failure}:{}),writer,eventId,minute:d.get('state','minute')??null}].slice(-50));
}
// 滚动耗料累计：state.records['craft-use:<聚落>'] = {days:{<日>:{<物品>:耗用量}}}，按日分桶；窗口 = 最长补给间隔天数（craftUseWindowDays，由 resupplyDays 的上限推出，不新增常数），
// 写入时丢掉窗口外的日桶，所以每个聚落至多 窗口天数 个桶。耗用量按投入计；失败时回收的同一种料（outputs 里的同名物品）不算耗用。
// 所有制造写入方（works、manufacturing、wildlife-society、finance-assets、npc-autonomy、agriculture）都经 recordCraft 写入，不各自累计。
function accrueCraftUse(d,engine,place,inputs,outputs,failure){
    const day=Math.floor((d.get('state','minute')??0)/1440),key=`craft-use:${place}`,old=d.get('state','records',key),keep=craftUseWindowDays(engine,d.get('randomSeed'),Object.keys(d.get('state','settlements')??{}));
    const days={};for(const [k,v] of Object.entries(old?.days??{}))if(Number(k)>day-keep)days[k]=v;
    const row={...(days[day]??{})};
    for(const [item,amount] of Object.entries(inputs)){const net=amount-(failure?Math.min(amount,outputs[item]??0):0);if(net>0)row[item]=(row[item]??0)+net;}
    days[day]=row;
    d.set(['state','records',key],{category:'craft_use',place,days});
}

// ---- S1c 价格输入读账户（15 §15.2：价格是账户的投影） --------------------------------
// 价格公式一字不改，只把公式读取的存量、库存、货币量从旧字段换成账户余额（批次账户读 lots）。
// 过渡期保留旧字段的读法作对照：priceRead 在装了探针（probePriceReads）时同时取两份并报给探针，
// 测试断言两者逐点相等；setPriceReadMode('legacy') 让整条价格链只读旧字段，用来把同一事件算两遍。
// 账本没开账（旧存档的预报、裸单元测试草稿）或对应范围未开账时只能读旧字段。
// 每个读取点必须先登记在这里；tests/ledger-price.test.mjs 逐点核对被演练过，并扫描源码里的价格相关处。
export const PRICE_POINTS=Object.freeze({
    'region.material':'区域材料市场：聚落库存与已开采的本地供货人账户，不读地下储量',
    'region.grain':'settlement-trade.regionalTradePrice：托管聚落粮仓里未过期的 grain 批次（区域报价的需求系数）',
    'forest.reserve':'forest-water.forestWaterPriceFactor：林木存量账户（木料价的稀缺系数）',
    'medicine.herb':'medicine-state.medicinePriceFactor：诊所医者行囊里的草药（药价的供给量）',
    'tax.payer':'finance-tax.assessTradeTax：纳税人现款（商税能否缴清）',
    'tax.tariff':'finance-tax.collectRouteTariffs：玩家行囊里的应税货物（关税税基）',
    'assets.cash':'finance-assets.netAssets：当事人现款（股份与净资产估值）',
    'assets.goods':'finance-assets.netAssets：当事人库存货物（股份与净资产估值）',
    'assets.basis':'finance-assets.recordFinanceSale：买方成交前的库存（成本基准的起点）',
    'army.cash':'military.supplyWeek：所属方现钱（按报价能买多少军粮）',
    'labor.stock':'labor-market：供货人的库存（补货工按价能收多少）',
    'labor.cash':'labor-market：雇主现款（补货工按价能付多少）',
    'shop.shelf':'shop.restockRow：店主货架上的存货（补货上限）',
    'shop.cash':'shop.restockRow：店主现钱（按进货价能买多少）',
    'shop.supply':'shop.restockRow：来源聚落的库存（可调拨量）',
    'npc.stock':'npc-autonomy：卖方库存（自治交易的报价是否成交）',
    'npc.cash':'npc-autonomy：买方现钱（自治交易的报价是否付得起）',
    'smuggling.cash':'smuggling：买方现钱（按报价能否付清货款）',
    'smuggling.stock':'smuggling：玩家行囊里的货（交付数量）',
    'salary.treasury':'office-salary：聚落公库（官职月俸按公库余额付多少）',
    'public.treasury':'governance.spendPublic：聚落公库（公款支出的留底）',
    'projects.stock':'public-projects：玩家自备工程材料（按工钱参照立项）',
    'projects.supply':'public-projects：聚落公共工程材料',
    'projects.cash':'public-projects：玩家现款（私人工程工钱账单）',
});
let readMode='ledger',probe=null;
export function setPriceReadMode(mode){if(mode!=='ledger'&&mode!=='legacy')throw Error(`价格读取模式无效：${mode}`);readMode=mode;}
export function probePriceReads(fn){probe=fn;}
const getter=d=>typeof d.peek==='function'?(...p)=>d.peek(...p):(...p)=>d.get(...p);
// 草稿（get / peek）或整份存档文档，二者都能读到 ledger 分区。
const bookView=src=>src?(typeof src.get==='function'?src:{get:(...p)=>p.reduce((v,k)=>v?.[k],src)}):null;
function ledgerValue(read,account,lots){
    if(!lots)return read('ledger','accounts',account)??0;
    return (read('ledger','lots',account)??[]).filter(l=>(lots.id==null||l.id===lots.id)&&(lots.kind==null||l.kind===lots.kind)&&(lots.after==null||l.expiresDay>lots.after)).reduce((n,l)=>n+l.qty,0);
}
// legacy: 取旧字段的函数；account: 账户键；lots: {kind?, after?} 时读批次（kind 相等且 expiresDay > after）。
export function priceRead(src,{point,scope='stock',account,legacy,lots=null,item=null}){
    if(!Object.hasOwn(PRICE_POINTS,point))throw Error(`未登记的价格输入点：${point}`);
    const d=bookView(src),read=d&&getter(d),open=Boolean(d)&&ledgerActive(d)&&(read('ledger','scopes')??['coin']).includes(scope);
    // A folded purse/bag is an individually owned share of the aggregate,
    // rather than zero supply or a second physical balance. Read-only quotes
    // and valuations must not materialize the region merely to inspect it.
    if(read&&!lots){
        const {owner,resource,purpose}=parseAccount(account),mark=read('state','npcs',owner,'materialized');
        if(mark?.folded){
            const share=read('state','records',`remote-stock:${mark.settlement}`,'members',owner);
            if(!share)throw Error('远方人物的聚合份额缺失');
            const value=purpose==='purse'&&resource==='coin_river'?share.coins:purpose==='inventory'?qty(share.inventory[item??resource]):null;
            if(value!==null){if(probe)probe({point,legacy:value,ledger:value,open});return value;}
        }
    }
    if(!open||readMode==='legacy'){const old=legacy();if(probe&&readMode==='ledger')probe({point,legacy:old,ledger:null,open});return old;}
    const now=ledgerValue(read,account,lots);
    if(probe)probe({point,legacy:legacy(),ledger:now,open});
    return now;
}
// 行囊里某物品的数量（缺省草稿不开账时回旧字段）。
export const bagStock=(src,engine,{point,id,item,legacy})=>priceRead(src,{point,account:bag(engine,id,item),legacy,item});

// A population, a travelling group and an encountered fish hold the same resource.
export function fishPopulationAccount(engine,holder,species){
 return creatureTraits(engine.byId.get(species)).tags.includes('fish')?reserve(engine,holder,'item_live_fish'):null;
}
export function moveFishPopulation(d,engine,species,from,to,amount,eventId=null){
 const source=fishPopulationAccount(engine,from,species);if(!source||!amount)return 0;
 return moveStock(d,{from:source,to:fishPopulationAccount(engine,to,species),amount,writer:'extraction',eventId});
}

// Stored goods remain the tenant's property; their physical place is the premises.
export const premisesStockKey=(owner,location)=>`premises_stock:${owner}:${location}`;
export const premisesStock=(engine,owner,location,item)=>accountKey(owner,res(engine,item),`stored:${location}`);
export function premisesInventory(state,owner,location){return state.records?.[premisesStockKey(owner,location)]?.inventory??{};}
registerLegacyStock('premises',(engine,state,add)=>{
 for(const row of Object.values(state.records??{}))if(row.category==='premises_stock'){
  for(const [item,value] of Object.entries(row.inventory??{}))add(premisesStock(engine,row.owner,row.location,item),qty(value));
 }
});
