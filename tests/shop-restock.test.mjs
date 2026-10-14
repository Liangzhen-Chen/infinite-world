import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {validateShopRules,qualityAllowed,originSettlement} from '../server-plugin/shop.mjs';

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
    for(const npc of w.npcs.filter(n=>placeOf[n.id])){delete npc.tier;npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:['trade']}]};}
    if(withTown)doc.state.settlements[town]={...structuredClone(doc.state.settlements.loc_hw),name:'白石镇',population:1000,treasury:900};
    const act=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
    return {engine,act,get doc(){return doc;}};
}
const qty=(doc,npc,item)=>{const v=doc.state.npcs[npc].inventory[item];return typeof v==='number'?v:v?.quantity??0;};
const ledger=(doc,id)=>doc.state.records[`shop:${id}`];
// Shop-side cash only: villagers' own autonomous spending is not part of these ledgers.
const cash=doc=>doc.state.player.coins+Object.keys(placeOf).reduce((n,id)=>n+doc.state.npcs[id].coins,0)+Object.values(doc.state.settlements).reduce((n,s)=>n+s.treasury,0);

test('发布规则自洽；面包等价格锚点不变',async()=>{
    assert.deepEqual(validateShopRules(world),[]);
    const f=fixture();
    const r=await f.act('world_trade',{seller:host,item:'item_bread',quantity:1},'bread');
    assert.equal(r.cost,2);
});

test('周期补货：按店家周期在午夜补到上限，不会无限出售；来源与付款入账',async()=>{
    const f=fixture(),total=cash(f.doc);
    await f.act('world_trade',{seller:host,item:'item_bread',quantity:5},'buy-bread');
    assert.equal(qty(f.doc,host,'item_bread'),1);
    await assert.rejects(f.act('world_trade',{seller:host,item:'item_bread',quantity:2},'too-many'),/库存不足/);
    f.doc.state.location=forge;
    await f.act('world_trade',{seller:smith,item:'item_kitchen_knife',quantity:2},'buy-knife');
    assert.equal(qty(f.doc,smith,'item_kitchen_knife'),0);
    await f.act('world_time',{minutes:DAY},'day1');
    // Tavern restocks daily from its own oven (6 per cycle, ceiling 6).
    assert.equal(qty(f.doc,host,'item_bread'),6);
    const inn1=ledger(f.doc,'shop_hw_qingdeng').entries.find(e=>e.item==='item_bread');
    assert.deepEqual([inn1.source,inn1.added,inn1.day],['local',5,1]);
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
    f.doc.state.npcs[smith].inventory.item_iron=0;
    await f.act('world_time',{minutes:DAY},'day1');
    const row=ledger(f.doc,'shop_hw_qingdeng').entries.find(e=>e.item==='item_ration');
    assert.deepEqual([row.source,row.from,row.added,row.paidCopper],['route',town,2,6]);
    assert.equal(qty(f.doc,host,'item_ration'),2);assert.equal(f.doc.state.npcs[host].coins,coins-6);assert.equal(f.doc.state.settlements[town].treasury,treasury+6);
    const iron=ledger(f.doc,'shop_hw_forge').entries.find(e=>e.item==='item_iron');
    assert.deepEqual([iron.source,iron.added,iron.paidCopper],['settlement',3,36],'聚落只放出保留量以上的铁料');assert.equal(f.doc.state.settlements.loc_hw.iron,2);
    assert.equal(f.doc.state.npcs[smith].coins,smithCoins-36);assert.equal(qty(f.doc,smith,'item_iron'),3);
    assert.equal(cash(f.doc),total,'铜钱守恒');

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

test('关系与声望、店家加成进入报价，因子写入当日报价账；议价只在规则区间内',async()=>{
    const price=async regard=>{
        const f=fixture();
        for(const holder of [host,'loc_hw'])f.doc.state.records[`standing:${holder}:player`]={category:'standing',holder,target:'player',value:regard,history:[]};
        const r=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:1},'mutton');
        return {cost:r.cost,quote:Object.values(f.doc.state.records).find(x=>x.category==='trade_quote')};
    };
    const friend=await price(100),neutral=await price(0),foe=await price(-100);
    assert.ok(friend.cost<neutral.cost&&neutral.cost<foe.cost,`${friend.cost}<${neutral.cost}<${foe.cost}`);
    const [low,high]=world.rules.economy.priceFactorLimits.relation;
    assert.ok(friend.quote.relationFactor>=low&&foe.quote.relationFactor<=high);
    assert.equal(friend.quote.dealPrice,friend.cost);assert.equal(friend.quote.settlement,'loc_hw');assert.ok(friend.quote.keeperRegard>0&&friend.quote.settlementRegard===100);

    const f=fixture({at:town});
    const cup=await f.act('world_trade',{seller:merchant,item:'item_clay_cup',quantity:1},'cup');
    const q=Object.values(f.doc.state.records).find(x=>x.category==='trade_quote');
    assert.equal(q.shopFactor,1.2);assert.equal(q.shop,'shop_bs_yanzhe');
    assert.equal(cup.cost,Math.max(1,Math.round(q.regionalPrice*1.2*q.relationFactor)));

    const g=fixture();
    await assert.rejects(g.act('world_trade',{seller:host,item:'item_mutton',quantity:1,unitPrice:6},'lowball'),/单价/);
    const deal=await g.act('world_trade',{seller:host,item:'item_mutton',quantity:1,unitPrice:11},'haggle');
    const row=Object.values(g.doc.state.records).find(x=>x.category==='trade_quote');
    assert.equal(deal.cost,11);assert.equal(row.dealPrice,11);assert.equal(row.bargainFactor,11/row.listPrice);
});

test('当日报价一致：同日立场变化不改价，次日按新立场重报',async()=>{
    const f=fixture();
    const first=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:1},'m1');
    f.doc.state.records[`standing:${host}:player`]={category:'standing',holder:host,target:'player',value:-100,history:[]};
    f.doc.state.records['standing:loc_hw:player']={category:'standing',holder:'loc_hw',target:'player',value:-100,history:[]};
    const second=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:1},'m2');
    assert.equal(second.cost,first.cost);
    const key=`trade-quote:0:${host}:player:item_mutton`;
    assert.equal(f.doc.state.records[key].deals.length,2);
    await f.act('world_time',{minutes:DAY},'next');
    const third=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:1},'m3');
    assert.ok(third.cost>first.cost,'次日报价反映新的敌意');
    assert.equal(f.doc.state.records[`trade-quote:1:${host}:player:item_mutton`].listPrice,third.cost);
});
