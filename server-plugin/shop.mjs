import {isReputationSettlement,reputationSettlements}from'./reputation-registry.mjs';
import {standing} from './standing.mjs';

// Shops (guide 3.7, 3.13): each registered shop restocks on its own cycle from
// local production, the settlement's own stock, or trade-route arrivals, never
// beyond its stock ceiling; high qualities restock only where the settlement
// scale or the shop's channel allows them. Player quotes add the shop markup and
// the keeper's and settlement's regard for the player, fixed for the day.
const DAY=1440,SOURCES=['local','settlement','route'],LEDGER_ROWS=40;
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const clamp=(v,[a,b])=>Math.max(a,Math.min(b,v));
export const shopRules=engine=>engine.rules.economy?.shops??null;

function settlementIds(world,rules){return new Set([...(world.settlementProfiles??[]).map(p=>p.id),...(rules?.quality?.capitals??[])]);}
const held=(npc,item)=>{const v=npc?.inventory?.[item];return typeof v==='number'?v:v?.quantity??0;};
const trades=npc=>(npc.services??[]).includes('trade')||(npc.serviceCatalog??[]).some(s=>s?.kind==='trade');
// Derived shops: a person who offers trade (services or serviceCatalog) and whose
// `shopType` names a type in rules.economy.shops.types becomes a shop with that
// type's channels, markup and cycle. Its settlement is found by walking up from
// the person's settlement, workplace, home or location; its restock is the
// person's `shopRestock` rows, or else each held item produced locally and
// admitted by quality, restocked locally by half the shelf (at least 1) up to
// what the person holds now. Hand-registered stores always win for their keeper.
export function derivedShops(world,rules=world.rules.economy?.shops){
    const types=rules?.types??{},keepers=new Set((rules?.stores??[]).map(s=>s.keeper));
    if(!rules||!Object.keys(types).length)return[];
    const places=settlementIds(world,rules),byId=new Map(world.locations.map(l=>[l.id,l])),rows=[];
    const settle=npc=>{for(let at of [npc.settlement,npc.workplace?.location,npc.home?.location??npc.home,npc.location]){const seen=new Set();
        while(typeof at==='string'&&!seen.has(at)){if(places.has(at))return at;seen.add(at);at=byId.get(at)?.parent;}}return null;};
    for(const npc of world.npcs){
        if(typeof npc.shopType!=='string'||keepers.has(npc.id))continue;
        const type=Object.hasOwn(types,npc.shopType)?types[npc.shopType]:null,settlement=settle(npc);
        const shop={id:`shop_${npc.id.replace(/^npc_/,'')}`,name:byId.get(npc.workplace?.location)?.name??npc.occupation??npc.name,keeper:npc.id,settlement,
            channels:[...type?.channels??[]],markup:type?.markup,cycleDays:type?.cycleDays,firstDay:type?.firstDay,shopType:npc.shopType,derived:true,trades:trades(npc),restock:[]};
        shop.restock=Array.isArray(npc.shopRestock)?structuredClone(npc.shopRestock):type&&settlement?Object.keys(npc.inventory??{}).filter(item=>held(npc,item)>0&&world.items.some(i=>i.id===item)
            &&originSettlement(world,item,rules)===settlement&&qualityAllowed(world,shop,item,rules)).sort().map(item=>({item,source:'local',amount:Math.max(1,Math.ceil(held(npc,item)/2)),maximum:held(npc,item)})):[];
        rows.push(shop);
    }
    return rows;
}
const storeCache=new WeakMap();
// Every shop that restocks and quotes: hand-registered stores, then derived ones.
export function shopStores(world){
    const rules=world.rules.economy?.shops;if(!rules)return[];
    const key=[rules,rules.stores,rules.types,world.npcs,world.items,world.locations],hit=storeCache.get(world);
    if(hit&&hit.key.every((v,i)=>v===key[i]))return hit.value;
    const value=[...rules.stores??[],...derivedShops(world,rules).filter(s=>s.trades&&s.restock.length)];
    storeCache.set(world,{key,value});return value;
}
const shopsOf=engine=>shopStores(engine.world);
export const shopOfKeeper=(engine,keeper)=>shopsOf(engine).find(s=>s.keeper===keeper)??null;
// The settlement an item is produced in: walk its origin up the location tree.
export function originSettlement(world,item,rules=world.rules.economy?.shops){
    const ids=settlementIds(world,rules),byId=new Map(world.locations.map(l=>[l.id,l])),seen=new Set();
    let at=world.items.find(i=>i.id===item)?.origin??null;
    while(at&&!seen.has(at)){if(ids.has(at))return at;seen.add(at);at=byId.get(at)?.parent??null;}
    return null;
}
export function settlementScale(world,settlement,rules=world.rules.economy?.shops,population=null){
    if(rules.quality.capitals.includes(settlement))return 'capital';
    const people=population??world.settlementProfiles?.find(p=>p.id===settlement)?.population??0;
    return [...rules.quality.scales].sort((a,b)=>b.minPopulation-a.minPopulation).find(s=>people>=s.minPopulation)?.scale??null;
}
// Up to `open` any shop may stock it; above that a tier must admit the shop by
// settlement scale or by one of its channel tags.
export function qualityAllowed(world,shop,item,rules=world.rules.economy?.shops,population=null){
    const order=world.rules.equipment.qualities,quality=world.items.find(i=>i.id===item)?.quality,grade=order.indexOf(quality);
    if(grade<0)return false;if(grade<=order.indexOf(rules.quality.open))return true;
    const tier=rules.quality.tiers.find(t=>t.quality===quality);if(!tier)return false;
    return tier.scales.includes(settlementScale(world,shop.settlement,rules,population))||shop.channels.some(c=>tier.channels.includes(c));
}

// stock=true (world build) also checks each ceiling covers the keeper's published stock.
export function validateShopRules(world,{stock=true}={}){
    const r=world.rules.economy?.shops;if(!r)return[];
    const errors=[],ids=new Set(),keepers=new Set(),order=world.rules.equipment?.qualities??[],places=settlementIds(world,r);
    const npc=id=>world.npcs.find(n=>n.id===id),item=id=>world.items.find(i=>i.id===id);
    const [shopLow,shopHigh]=world.rules.economy.priceFactorLimits.shop;
    if(r.version!==1||!r.source||!(r.relation?.keeper>=0)||!(r.relation?.settlement>=0)||r.relation.keeper+r.relation.settlement!==1||!(r.relation.span>0)||!Array.isArray(r.stores))errors.push('商店规则版本、来源或关系权重无效');
    const q=r.quality;
    if(!q||!order.includes(q.open)||!Array.isArray(q.scales)||!q.scales.some(s=>s.minPopulation===0)||!Array.isArray(q.capitals)||!Array.isArray(q.tiers)||q.tiers.some(t=>order.indexOf(t.quality)<=order.indexOf(q.open)||!Array.isArray(t.scales)||!Array.isArray(t.channels)))errors.push('商店品质渠道规则无效');
    for(const [stock,id]of Object.entries(r.stockItems??{}))if(!['wood','stone','iron','food'].includes(stock)||!item(id))errors.push(`聚落库存货品无效：${stock}`);
    for(const [name,t]of Object.entries(r.types??{}))
        if(!Array.isArray(t?.channels)||!t.channels.length||!(t.markup>=shopLow&&t.markup<=shopHigh)||!integer(t.cycleDays,1)||!integer(t.firstDay))errors.push(`店铺类型${name}无效`);
    if(errors.length)return errors;
    const derived=derivedShops(world,r);
    for(const s of derived){
        if(!Object.hasOwn(r.types??{},s.shopType))errors.push(`人物${s.keeper}的店铺类型${s.shopType}未登记`);
        else if(!s.trades)errors.push(`人物${s.keeper}登记了店铺类型却没有交易服务`);
    }
    if(errors.length)return errors;
    for(const s of [...r.stores,...derived]){
        const keeper=npc(s.keeper),bad=m=>errors.push(`商店${s.id??'?'}：${m}`);
        if(!s.id||ids.has(s.id))bad('编号缺失或重复');ids.add(s.id);
        if(!keeper||keepers.has(s.keeper))bad('店主缺失或重复登记');keepers.add(s.keeper);
        if(!places.has(s.settlement))bad('所在聚落未登记');
        if(!Array.isArray(s.channels)||!s.channels.length)bad('缺渠道标签');
        if(!(s.markup>=shopLow&&s.markup<=shopHigh))bad('店家加成超出价格系数上下限');
        if(!integer(s.cycleDays,1)||!integer(s.firstDay))bad('补货周期无效');
        if(!Array.isArray(s.restock)||!s.restock.length){bad('缺补货规则');continue;}
        const seen=new Set();
        for(const row of s.restock){
            const it=item(row.item),shelf=keeper?.inventory?.[row.item],held=typeof shelf==='number'?shelf:shelf?.quantity??0;
            if(!it||seen.has(row.item)||!SOURCES.includes(row.source)||!integer(row.amount,1)||!integer(row.maximum,1)||stock&&row.maximum<held){bad(`补货条目无效：${row.item}`);continue;}
            seen.add(row.item);
            if(!qualityAllowed(world,s,row.item,r))bad(`${row.item}品质${it.quality}不在本聚落规模或渠道出现`);
            const origin=originSettlement(world,row.item,r);
            if(row.source==='local'&&origin!==s.settlement)bad(`${row.item}产地不在本地`);
            if(row.source==='route'&&(!places.has(row.from)||row.from===s.settlement||origin!==row.from))bad(`${row.item}到货来源与产地不符`);
            if(row.source==='settlement'&&(r.stockItems?.[row.stock]!==row.item||!integer(row.reserve)))bad(`${row.item}未对应聚落库存或缺保留量`);
        }
    }
    return errors;
}
const checked=new WeakSet();
function assertRules(engine){
    if(checked.has(engine.world))return;
    const errors=validateShopRules(engine.world,{stock:false});if(errors.length)throw Error(errors.join('；'));checked.add(engine.world);
}

const shelf=(engine,d,id,item)=>engine.quantity(d,id,item);
function managed(d,sid){return d.get('state','records',`agriculture:${sid}`)?.mode==='managed';}
// One restock row at one boundary. Returns the ledger entry, or null when the
// shelf was already full (nothing to record).
function restockRow(d,engine,shop,row,minute){
    const want=Math.min(row.amount,row.maximum-shelf(engine,d,shop.keeper,row.item));
    if(want<=0)return null;
    const base=engine.byId.get(row.item).basePrice,entry={day:Math.floor(minute/DAY),minute,item:row.item,source:row.source,wanted:want,added:0,paidCopper:0};
    const keeper=d.get('state','npcs',shop.keeper),afford=n=>Math.min(n,Math.floor(keeper.coins/base));
    if(row.source==='local'){entry.added=want;}
    else{
        const from=row.source==='route'?row.from:shop.settlement,s=structuredClone(d.get('state','settlements',from));
        if(!s||!integer(s.treasury))return{...entry,reason:'来源聚落不在战役账中'};
        if(row.source==='route'){
            try{engine.route(from,shop.settlement,'walk',minute,d.document.randomSeed);}catch(error){if(!error.message.startsWith('没有当前季节'))throw error;return{...entry,reason:'封路或天气不通，货未到'};}
        }else if(row.stock==='food'&&managed(d,from))return{...entry,reason:'托管聚落粮仓只走周贸易账'};
        const spare=row.source==='settlement'?Math.max(0,(s[row.stock]??0)-row.reserve):want,quantity=afford(Math.min(want,spare));
        if(!quantity)return{...entry,reason:spare?'店主现钱不足':'聚落库存已到保留量'};
        if(row.source==='settlement')s[row.stock]-=quantity;
        const cost=quantity*base;s.treasury+=cost;d.set(['state','settlements',from],s);
        d.set(['state','npcs',shop.keeper,'coins'],keeper.coins-cost);
        entry.added=quantity;entry.paidCopper=cost;entry.from=from;
    }
    engine.itemDelta(d,shop.keeper,row.item,entry.added);
    return entry;
}
function restockShop(d,engine,shop,minute){
    const keeper=d.get('state','npcs',shop.keeper);
    if(!keeper||['死亡','濒死'].includes(keeper.status))return;
    const entries=shop.restock.map(row=>restockRow(d,engine,shop,row,minute)).filter(Boolean);
    if(!entries.length)return;
    const key=`shop:${shop.id}`,old=d.get('state','records',key);
    if(old&&old.category!=='shop_ledger')throw Error('商店账编号冲突，拒绝覆盖');
    d.set(['state','records',key],{category:'shop_ledger',shop:shop.id,keeper:shop.keeper,settlement:shop.settlement,lastRestockAt:minute,entries:[...old?.entries??[],...entries].slice(-LEDGER_ROWS)});
}
// Registered with the advance registry. Restock happens at the midnight that opens
// a cycle day; each boundary inside (before,after] is settled once, in order.
export function advanceShops(d,engine,before,after){
    const stores=shopsOf(engine);if(!stores.length)return;
    assertRules(engine);
    for(let day=Math.floor(before/DAY)+1;day<=Math.floor(after/DAY);day++)
        for(const shop of stores)if(day>=shop.firstDay&&(day-shop.firstDay)%shop.cycleDays===0)restockShop(d,engine,shop,day*DAY);
}

function settlementAt(engine,location){
    const list=reputationSettlements(engine),seen=new Set();
    while(location&&!seen.has(location)){if(list.includes(location))return location;seen.add(location);location=engine.byId.get(location)?.parent;}
    return null;
}
// The day's list price between a player and an NPC. Written once per day and
// counterpart into the ledger; later calls that day read it back unchanged.
export function tradeQuote(d,engine,{buyer,seller,item,location,base}){
    const minute=d.get('state','minute'),day=Math.floor(minute/DAY),key=`trade-quote:${day}:${seller}:${buyer}:${item}`,old=d.get('state','records',key);
    if(old){if(old.category!=='trade_quote'||!integer(old.listPrice,1))throw Error('当日报价账无效');return old;}
    const rules=shopRules(engine),limits=engine.rules.economy.priceFactorLimits,price=base();
    const npc=buyer==='player'?seller:seller==='player'?buyer:null,shop=buyer==='player'?shopOfKeeper(engine,seller):null;
    let relation=1,keeperRegard=null,settlementRegard=null;
    const place=shop?.settlement??settlementAt(engine,location);
    if(npc&&rules){
        const state=d.get('state');keeperRegard=standing(engine,state,npc,'player');
        settlementRegard=place&&isReputationSettlement(engine,place)?standing(engine,state,place,'player'):0;
        const regard=rules.relation.keeper*keeperRegard+rules.relation.settlement*settlementRegard;
        relation=clamp(1+(npc===seller?-1:1)*rules.relation.span*regard/100,limits.relation);
    }
    const markup=shop?clamp(shop.markup,limits.shop):1,listPrice=Math.max(1,Math.round(price*markup*relation));
    const row={category:'trade_quote',day,buyer,seller,item,shop:shop?.id??null,settlement:place,basePrice:engine.byId.get(item).basePrice,regionalPrice:price,
        shopFactor:markup,relationFactor:relation,keeperRegard,settlementRegard,listPrice,quotedAt:minute};
    d.set(['state','records',key],row);
    return row;
}
export function recordDeal(d,quote,price,quantity,eventId){
    const key=`trade-quote:${quote.day}:${quote.seller}:${quote.buyer}:${quote.item}`,row=d.get('state','records',key);
    d.set(['state','records',key],{...row,dealPrice:price,bargainFactor:price/row.listPrice,deals:[...row.deals??[],{eventId,quantity,unitPrice:price,minute:d.get('state','minute')}]});
}
