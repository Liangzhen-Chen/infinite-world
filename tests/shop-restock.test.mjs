import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {validateShopRules,qualityAllowed,originSettlement,tradeQuote} from '../server-plugin/shop.mjs';
import {regionalTradePrice,regionalTradeBase} from '../server-plugin/settlement-trade.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const DAY=1440,inn='bld_hw_qingdeng',forge='bld_hw_forge',town='loc_bs';
const host='npc_hw_linsui',smith='npc_hw_duanyan',merchant='npc_hw_yanzhe';
const placeOf={[host]:inn,[smith]:forge,[merchant]:town};
const rules=world.rules.economy.shops,store=id=>rules.stores.find(s=>s.id===id);
function fixture({at=inn,coins=500,withTown=true,edit=null}={}){
    const w=structuredClone(world);edit?.(w);
    const engine=new WorldEngine(w);
    let doc=engine.initialFromLegacy(seed,'shop-restock');
    doc.state.minute=600;doc.state.location=at;doc.state.player.coins=coins;
    for(const [id,loc]of Object.entries(placeOf))doc.state.npcs[id]={...doc.state.npcs[id],coins:200,location:loc,activity:'营业',status:'正常',goals:{},memoryStream:[]};
    // These tests examine restocking, quoting and sources, not walk-in customers (F026, covered in s5-w4-economy): every other resident is
    // penniless here, so nobody comes in and buys down the shelves between the examined steps.
    for(const [id,npc]of Object.entries(doc.state.npcs))if(!placeOf[id])npc.coins=0;
    for(const npc of w.npcs.filter(n=>placeOf[n.id])){delete npc.tier;npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:['trade']}]};}
    if(withTown)doc.state.settlements[town]={...structuredClone(doc.state.settlements.loc_hw),name:'白石镇',population:1000,treasury:900};
    const act=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
    return {engine,act,get doc(){return doc;}};
}
const qty=(doc,npc,item)=>{const v=doc.state.npcs[npc].inventory[item];return typeof v==='number'?v:v?.quantity??0;};
const ledger=(doc,id)=>doc.state.records[`shop:${id}`];
// S5-02 / 15 §15.2: inspect the current read-only projection, never a saved quote.
const projected=(f,seller,item,quantity=1)=>{const d={document:f.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],f.doc)};return tradeQuote(d,f.engine,{buyer:'player',seller,item,quantity,location:f.doc.state.location,base:()=>regionalTradeBase(d,f.engine,item,f.doc.state.location)});};
// Shop-side cash includes quest escrow funded by these keepers or settlement accounts.
const cash=doc=>doc.state.player.coins+Object.keys(placeOf).reduce((n,id)=>n+doc.state.npcs[id].coins,0)+Object.values(doc.state.settlements).reduce((n,s)=>n+s.treasury,0)
    +Object.values(doc.state.quests).filter(q=>doc.state.settlements[q.fundedBy?.treasury]||q.personal&&q.publisher in placeOf).reduce((n,q)=>n+(q.escrow??0),0);

test('发布规则自洽；面包基准进入市场投影',async()=>{
    assert.deepEqual(validateShopRules(world),[]);
    const f=fixture();
    const expected=projected(f,host,'item_bread');
    const r=await f.act('world_trade',{seller:host,item:'item_bread',quantity:1},'bread');
    // S5-02: the authored 2 copper remains a baseline, not a fixed retail truth.
    // D=14, S>28 after household retention → .5 lower bound;
    // 2 × .5 × remaining factors 1 = 1.
    assert.equal(r.cost,1);
    assert.equal(expected.explanation.baseline,2);assert.equal(r.cost,expected.totalCoins);
});

test('周期补货：按店家周期在午夜补到上限，不会无限出售；来源与付款入账',async()=>{
    const f=fixture(),total=cash(f.doc);
    // S5-02: two household members *2.5 satiety/h *24 /30 =4
    // retained portions. Only two of the original six may leave the shelf.
    await f.act('world_trade',{seller:host,item:'item_bread',quantity:2},'buy-bread');
    assert.equal(qty(f.doc,host,'item_bread'),4);
    await assert.rejects(f.act('world_trade',{seller:host,item:'item_bread',quantity:1},'too-many'),/库存不足/);
    f.doc.state.location=forge;
    await f.act('world_trade',{seller:smith,item:'item_kitchen_knife',quantity:2},'buy-knife');
    assert.equal(qty(f.doc,smith,'item_kitchen_knife'),0);
    await f.act('world_time',{minutes:DAY},'day1');
    // Tavern restocks daily from its own oven (6 per cycle, ceiling 6).
    assert.equal(qty(f.doc,host,'item_bread'),6);
    const inn1=ledger(f.doc,'shop_hw_qingdeng').entries.find(e=>e.item==='item_bread');
    assert.deepEqual([inn1.source,inn1.added,inn1.day],['local',2,1]);
    // F010: the tavern's local production is outside the simulation but no longer free. Hand anchor: bread 2 x scarcity floor .5 = 1 copper
    // a loaf, two loaves = 2 copper paid by the keeper to the settlement treasury; no freight or duty for a local source, and the
    // receipt names where the goods came from.
    assert.deepEqual(inn1.cost,{goods:2,freight:0,duties:0});assert.equal(inn1.paidCopper,2);
    assert.deepEqual(inn1.origin,{kind:'import',from:'loc_hw',reason:'本地产出（模拟范围外）'});
    // Forge is weekly from day 1: one knife per cycle.
    assert.equal(qty(f.doc,smith,'item_kitchen_knife'),1);
    await f.act('world_time',{minutes:DAY},'day2');
    assert.equal(qty(f.doc,smith,'item_kitchen_knife'),1,'未到下个周期不补货');
    assert.equal(qty(f.doc,host,'item_bread'),6,'已满的货架不再增加');
    await f.act('world_time',{minutes:6*DAY},'day8');
    assert.equal(qty(f.doc,smith,'item_kitchen_knife'),2);
    await f.act('world_time',{minutes:7*DAY},'day15');
    assert.equal(qty(f.doc,smith,'item_kitchen_knife'),2,'补货不超过上限');
    assert.equal(cash(f.doc),total,'进货付款只在店主与来源聚落之间转移');
});

test('产地约束：本地产出须在本聚落，到货须来自产地且路通，聚落库存守保留量并付款',async()=>{
    const local=structuredClone(world);local.rules.economy.shops.stores.find(s=>s.id==='shop_bs_yanzhe').restock.push({item:'item_bread',source:'local',amount:1,maximum:2});
    assert.match(validateShopRules(local).join(),/item_bread产地不在本地/);
    const route=structuredClone(world);route.rules.economy.shops.stores.find(s=>s.id==='shop_hw_qingdeng').restock.find(r=>r.item==='item_ration').from='loc_bs_yupo';
    assert.match(validateShopRules(route).join(),/item_ration到货来源与产地不符/);
    assert.equal(originSettlement(world,'item_ration'),'loc_bs');assert.equal(originSettlement(world,'item_iron_nail'),'loc_hw');

    // Route arrival from the town: the keeper pays the producing settlement.
    const f=fixture(),total=cash(f.doc);
    await f.act('world_trade',{seller:host,item:'item_ration',quantity:4},'buy-ration');
    const coins=f.doc.state.npcs[host].coins,treasury=f.doc.state.settlements[town].treasury;
    // Forge buys iron from the village stock down to its reserve.
    f.doc.state.settlements.loc_hw.iron=5;const smithCoins=f.doc.state.npcs[smith].coins;
    f.doc.state.npcs[smith].inventory.item_iron=0;resyncBooks(f.engine,f.doc);
    const ironPrice=Math.ceil(regionalTradePrice({get:(...p)=>p.reduce((v,k)=>v?.[k],f.doc)},f.engine,'item_iron','loc_hw',DAY));
    await f.act('world_time',{minutes:DAY},'day1');
    const row=ledger(f.doc,'shop_hw_qingdeng').entries.find(e=>e.item==='item_ration');
    // S5-02: ration baseline3 * clamped scarcity .5 * all other
    // factors1 *two =3, truncated once. Source/cash guarantees remain.
    // F010: the route arrival is outside the simulation but no longer free. Hand anchor: goods 3 (above), porter freight =
    // route_hw_bs 24 km × billable max(2×0.2kg, 1kg)=1kg × pack rate 0.02 = 0.48 → ceil 1 copper (15 §15.1.1 / SPECS.pack);
    // no toll or guard on the edge, so no duty. Freight leaves the simulated economy through the declared sink:export.
    assert.deepEqual([row.source,row.from,row.added,row.paidCopper],['route',town,2,4]);
    assert.deepEqual(row.cost,{goods:3,freight:1,duties:0});assert.deepEqual(row.origin,{kind:'import',from:town,reason:'外路来货（模拟范围外）'});
    assert.equal(qty(f.doc,host,'item_ration'),2);assert.equal(f.doc.state.npcs[host].coins,coins-4);assert.equal(f.doc.state.settlements[town].treasury,treasury+3);
    const iron=ledger(f.doc,'shop_hw_forge').entries.find(e=>e.item==='item_iron');
    assert.deepEqual([iron.source,iron.added,iron.paidCopper],['settlement',3,3*ironPrice],'聚落只放出保留量以上的铁料，按实际材料行情支付');assert.equal(f.doc.state.settlements.loc_hw.iron,2);
    assert.equal(f.doc.state.npcs[smith].coins,smithCoins-3*ironPrice);assert.equal(qty(f.doc,smith,'item_iron'),3);
    assert.equal(cash(f.doc),total-1,'铜钱守恒：仅挑夫运费 1 铜经 sink:export 离开模拟经济（口径见上），其余每文都有对手方');

    // No producing settlement in this campaign: nothing arrives, the refusal is on the ledger.
    const g=fixture({withTown:false});
    await g.act('world_trade',{seller:host,item:'item_ration',quantity:4},'buy-ration');
    await g.act('world_time',{minutes:DAY},'day1');
    assert.equal(qty(g.doc,host,'item_ration'),0);
    assert.equal(ledger(g.doc,'shop_hw_qingdeng').entries.find(e=>e.item==='item_ration').reason,'来源聚落不在战役账中');
});

test('高品质渠道：银器只在镇以上或铁匠渠道补货，金器须城以上或相应渠道',()=>{
    assert.equal(qualityAllowed(world,store('shop_hw_forge'),'item_steel_arming_sword'),true,'村铁匠铺凭铁匠渠道可出银器');
    assert.equal(qualityAllowed(world,store('shop_hw_qingdeng'),'item_steel_arming_sword'),false,'村酒馆不出银器');
    assert.equal(qualityAllowed(world,store('shop_bs_yanzhe'),'item_drawknife'),true,'镇上杂货行可出银器');
    assert.equal(qualityAllowed(world,store('shop_bs_yanzhe'),'item_jeweler_saw'),false,'镇上杂货行不出金器');
    assert.equal(qualityAllowed(world,{...store('shop_bs_yanzhe'),settlement:'loc_capital'},'item_jeweler_saw'),true,'王都可出金器');
    assert.equal(qualityAllowed(world,{...store('shop_bs_yanzhe'),channels:['guild']},'item_jeweler_saw'),true,'商会渠道可出金器');
    assert.equal(qualityAllowed(world,store('shop_hw_forge'),'item_estoc'),false,'白金只在王都');
    const bad=structuredClone(world);bad.rules.economy.shops.stores.find(s=>s.id==='shop_bs_yanzhe').restock.push({item:'item_jeweler_saw',source:'local',amount:1,maximum:1});
    assert.match(validateShopRules(bad).join(),/item_jeweler_saw品质金不在本聚落规模或渠道出现/);
});

test('关系与声望、店家加成进入实时投影；议价只在规则区间内',async()=>{
    const price=async regard=>{
        const f=fixture();
        for(const holder of [host,'loc_hw'])f.doc.state.records[`standing:${holder}:player`]={category:'standing',holder,target:'player',value:regard,history:[]};
        const quote=projected(f,host,'item_mutton',2);
        // Two portions preserve the strict paid-price relation assertion
        // under the designed truncation rule (one cheap portion can tie).
        const r=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:2},'mutton');
        return {cost:r.cost,quote};
    };
    const friend=await price(100),neutral=await price(0),foe=await price(-100);
    // 12 baseline × .5 scarcity × (1-.15*regard/100) × 2;
    // other factors 1: 10.2 / 12 / 13.8, truncate only each full bill.
    assert.equal(friend.cost,10);assert.equal(neutral.cost,12);assert.equal(foe.cost,13);
    assert.ok(friend.cost<neutral.cost&&neutral.cost<foe.cost,`${friend.cost}<${neutral.cost}<${foe.cost}`);
    const [low,high]=world.rules.economy.priceFactorLimits.relation;
    assert.ok(friend.quote.explanation.relation>=low&&foe.quote.explanation.relation<=high);
    assert.equal(friend.quote.totalCoins,friend.cost);assert.equal(friend.quote.settlement,'loc_hw');assert.ok(friend.quote.keeperRegard>0&&friend.quote.settlementRegard===100);

    const f=fixture({at:town});
    const q=projected(f,merchant,'item_clay_cup');
    const cup=await f.act('world_trade',{seller:merchant,item:'item_clay_cup',quantity:1},'cup');
    // Cup D=S=6; 6 baseline × 1 × markup 1.2 × remaining 1 = 7.2 → 7.
    assert.equal(cup.cost,7);
    assert.equal(q.explanation.spread,1.2);assert.equal(q.shop,'shop_bs_yanzhe');
    assert.equal(cup.cost,Math.trunc(q.explanation.value.value*q.explanation.depth*1.2*q.explanation.relation));

    const g=fixture();
    const row=projected(g,host,'item_mutton'),[lo,hi]=world.rules.economy.priceFactorLimits.bargain;
    // S5-02: retain both range rejection and exact negotiated payment; derive
    // the offered amount from today's market instead of an obsolete anchor.
    await assert.rejects(g.act('world_trade',{seller:host,item:'item_mutton',quantity:1,unitPrice:Math.ceil(row.listPrice*lo)-1},'lowball'),/单价/);
    const offer=Math.ceil(row.listPrice*hi),deal=await g.act('world_trade',{seller:host,item:'item_mutton',quantity:1,unitPrice:offer},'haggle');
    const settled=Object.values(g.doc.state.records).find(x=>x.category==='market_trade');
    // Neutral mutton 12*.5=6, upper bargain bound ceil(6*1.1)=7.
    assert.equal(deal.cost,7);
    assert.equal(deal.cost,offer);assert.equal(settled.totalCoins,offer);assert.equal(settled.quantity,1);
});

test('同日按新立场与成交深度重报，次日重新派生',async()=>{
    // Price is a non-examined author premise here. Use 120 so the
    // strict paid-copper regard assertions survive total truncation;
    // with baseline 12 both neutral 6 and hostile 6.9 truncate to 6.
    const f=fixture({edit:w=>{w.items.find(i=>i.id==='item_mutton').basePrice=120;}});
    const first=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:1},'m1');
    // Neutral opening: 120 baseline × .5 scarcity × remaining factors 1.
    assert.equal(first.cost,60);
    f.doc.state.records[`standing:${host}:player`]={category:'standing',holder:host,target:'player',value:-100,history:[]};
    f.doc.state.records['standing:loc_hw:player']={category:'standing',holder:'loc_hw',target:'player',value:-100,history:[]};
    const second=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:1},'m2');
    // S5-02 removes the daily price cache; neither regard nor depth is frozen.
    assert.ok(second.cost>first.cost);
    assert.equal(Object.values(f.doc.state.records).filter(r=>r.category==='market_trade').length,2);
    await f.act('world_time',{minutes:DAY},'next');
    const expected=projected(f,host,'item_mutton');
    const third=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:1},'m3');
    assert.ok(third.cost>first.cost,'次日报价反映新的敌意');
    assert.equal(expected.totalCoins,third.cost);assert.equal(expected.explanation.depth,1);
});

test('K10：有交易服务并登记店铺类型的人物自动成为店铺；现有三家店不变',async()=>{
    const {shopStores,derivedShops}=await import('../server-plugin/shop.mjs');
    // Published world: no person declares a shop type, so the shop list is exactly the three registered stores.
    assert.deepEqual(derivedShops(world),[]);
    assert.deepEqual(shopStores(world),rules.stores);
    assert.deepEqual(rules.stores.map(s=>s.id),['shop_hw_qingdeng','shop_hw_forge','shop_bs_yanzhe']);
    const miller='npc_hw_ayan',mill='bld_hw_mill';
    const edit=w=>{const n=w.npcs.find(x=>x.id===miller);n.shopType='merchant';n.inventory={...n.inventory,item_iron_nail:6};};
    const w=structuredClone(world);edit(w);
    const shop=derivedShops(w).find(s=>s.keeper===miller);
    assert.equal(shop.id,'shop_hw_ayan');assert.equal(shop.settlement,'loc_hw');
    assert.deepEqual([shop.channels,shop.markup,shop.cycleDays,shop.firstDay],[['merchant'],1.2,7,1]);
    assert.deepEqual(shop.restock.find(r=>r.item==='item_iron_nail'),{item:'item_iron_nail',source:'local',amount:3,maximum:6});
    assert.ok(shop.restock.every(r=>r.source==='local'&&originSettlement(w,r.item)==='loc_hw'));
    assert.deepEqual(validateShopRules(w),[]);
    assert.deepEqual(shopStores(w).slice(0,3),rules.stores);
    // Validation: unknown type, or a shop type without a trade service.
    const unknown=structuredClone(w);unknown.npcs.find(x=>x.id===miller).shopType='bakery';
    assert.match(validateShopRules(unknown).join(),/店铺类型bakery未登记/);
    const mute=structuredClone(w);const m=mute.npcs.find(x=>x.id===miller);m.serviceCatalog=m.serviceCatalog.filter(s=>s.kind!=='trade');
    assert.match(validateShopRules(mute).join(),/没有交易服务/);
    // Runtime: the derived shop quotes with its markup and restocks on its cycle.
    const f=fixture({at:mill,edit:x=>{edit(x);const n=x.npcs.find(y=>y.id===miller);delete n.tier;n.schedule={default:[{start:0,end:1440,location:mill,activity:'营业',services:['trade']}]};}});
    f.doc.state.npcs[miller]={...f.doc.state.npcs[miller],coins:200,location:mill,activity:'营业',status:'正常',goals:{},memoryStream:[],inventory:{...f.doc.state.npcs[miller].inventory,item_iron_nail:6}};
    const expected=projected(f,miller,'item_iron_nail',4);
    const r=await f.act('world_trade',{seller:miller,item:'item_iron_nail',quantity:4},'nails');
    // F026: demand now reads every shop's shelf, derived ones included. Iron-class D = forge shelf 40 + the derived
    // miller shop's own shelf maximum 6 = 46; S=40 nails+6 scrap+2 hinges+6 miller nails=54.
    // 1 × (46/54) × markup 1.2 × depth/grade/regard/correction 1 × 4
    // = 4.0888...; total truncation gives 4 (it was 3 while the derived shop's shelf was ignored as demand).
    assert.equal(r.cost,4);
    assert.ok(r.cost>0);
    // S5-02: the derived shop remains the quote source without persisting it.
    assert.equal(expected.shop,'shop_hw_ayan');assert.equal(r.cost,expected.totalCoins);
    assert.equal(qty(f.doc,miller,'item_iron_nail'),2);
    await f.act('world_time',{minutes:DAY},'day1');
    assert.equal(qty(f.doc,miller,'item_iron_nail'),5);
    assert.equal(ledger(f.doc,'shop_hw_ayan').entries.find(e=>e.item==='item_iron_nail').added,3);
});
