import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {validateShopRules,qualityAllowed,originSettlement,tradeQuote} from '../server-plugin/shop.mjs';
import {regionalTradePrice,regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {porterCharges} from '../server-plugin/transport.mjs';
import {handOatsScarcity,handTarget,handFoodDepth} from './helpers/hand-targets.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const DAY=1440,inn='bld_hw_qingdeng',forge='bld_hw_forge',town='loc_bs';
const host='npc_hw_linsui',smith='npc_hw_duanyan',merchant='npc_hw_yanzhe';
const placeOf={[host]:inn,[smith]:forge,[merchant]:town};
const rules=world.rules.economy.shops,store=id=>rules.stores.find(s=>s.id===id);
function fixture({at=inn,coins=500,withTown=true,edit=null}={}){
    const w=structuredClone(world);edit?.(w);
    const engine=new WorldEngine(w);
    // 现行开局（createCharacter：新战役的农事开局，公仓存粮 = 开局日的目标持有）；旧存档形状（initialFromLegacy，存粮 420、种粮 0）不再是夹具——不做旧存档兼容。
    let doc=engine.createCharacter(seed,{},'shop-restock');
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
// 食物池稀缺度手推（hand-targets.mjs 的 handOatsScarcity：需求 = 货架目标 + 公仓目标持有，供给 = 公仓存粮 + 店主行囊里的食物，都折成燕麦件数）。
// 夹具是现行开局：公仓存粮 = 开局日的目标持有（前置断言），所以供给 = 目标 + 店里食物 > 需求 = 目标 + 货架，稀缺度略小于 1（不夹取）。
// 面包、羊肉等所有食物同属一池，同一个稀缺度；价 = 目录基价 × 稀缺度 × 其余因子（立场、深度、加成）。
const foodScarcity=f=>{
    const st=f.doc.state,profile=f.engine.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw');
    assert.equal(st.settlements.loc_hw.food,handTarget(f.engine,st,profile,st.minute),'前置：开局公仓存粮 = 开局日目标持有');
    const {ratio}=handOatsScarcity(f.engine,st,st.settlements.loc_hw.food),[lo,hi]=world.rules.economy.priceFactorLimits.region;
    assert.ok(ratio>=lo&&ratio<=hi,`前置：稀缺度 ${ratio} 在夹取区间内`);
    return ratio;
};
// Shop-side cash includes quest escrow funded by these keepers or settlement accounts.
const cash=doc=>doc.state.player.coins+Object.keys(placeOf).reduce((n,id)=>n+doc.state.npcs[id].coins,0)+Object.values(doc.state.settlements).reduce((n,s)=>n+s.treasury,0)
    +Object.values(doc.state.quests).filter(q=>doc.state.settlements[q.fundedBy?.treasury]||q.personal&&q.publisher in placeOf).reduce((n,q)=>n+(q.escrow??0),0);

// All purses, treasuries and quest escrow; and the net coin that left the simulation (sinks minus sources) so far.
const everyone=doc=>doc.state.player.coins+Object.values(doc.state.npcs).reduce((n,x)=>n+(x.coins??0),0)+Object.values(doc.state.settlements).reduce((n,s)=>n+s.treasury,0)
    +Object.values(doc.state.quests).reduce((n,q)=>n+(q.escrow??0),0)+Object.entries(doc.ledger?.accounts??{}).filter(([k])=>/\|coin_river\|counter/.test(k)).reduce((n,[,v])=>n+v,0);
const boundary=doc=>Object.entries(doc.ledger?.flows??{}).filter(([k])=>k.includes('|coin_river|')).reduce((n,[k,v])=>n+(k.startsWith('sink:')?v:k.startsWith('src:')?-v:0),0);
test('发布规则自洽；面包基准进入市场投影',async()=>{
    assert.deepEqual(validateShopRules(world),[]);
    // Later rows use the same stock checks: no unknown store or duplicate item.
    const unknown=structuredClone(world);unknown.rules.economy.shops.additionalRestock.missing=[];
    assert.match(validateShopRules(unknown).join(),/商店增补货架无效：missing/);
    const duplicate=structuredClone(world);duplicate.rules.economy.shops.additionalRestock.shop_hw_forge.push({...duplicate.rules.economy.shops.additionalRestock.shop_hw_forge[0]});
    assert.match(validateShopRules(duplicate).join(),/补货条目无效：item_sickle/);
    const misplaced=structuredClone(world);misplaced.rules.economy.shops.additionalRestock.shop_hw_forge[0].after='missing';
    assert.match(validateShopRules(misplaced).join(),/商店增补货架无效：shop_hw_forge/);
    const f=fixture();
    const expected=projected(f,host,'item_bread'),scarcity=foodScarcity(f);// 成交前的状态
    const r=await f.act('world_trade',{seller:host,item:'item_bread',quantity:1},'bread');
    // S5-02: the authored 2 copper remains a baseline, not a fixed retail truth.
    // 现行规律：需求 = 货架目标 + 公仓目标，供给 = 公仓存粮 + 店里食物（见 foodScarcity），稀缺度略小于 1；
    // 2 × 稀缺度 × 其余因子 1，整张账单取整（截断）；稀缺度小于 1，所以 1。
    assert.ok(scarcity<1,'前置：稀缺度小于 1');
    assert.equal(r.cost,Math.trunc(2*scarcity));
    assert.equal(expected.explanation.baseline,2);assert.equal(r.cost,expected.totalCoins);
});

test('周期补货：按店家周期在午夜向本聚落持货人补到上限，不会无限出售；来源与付款入账',async()=>{
    // K2（卡 E）依据：本地货架不再从模拟范围外补进（旧断言 origin import、付给公账的 2 铜已随水龙头取消），
    // 改为向本聚落真实持有这件货的人进货；没有持货人就补不上，回执写明原因。
    const holder='npc_hw_shendu';
    const f=fixture();
    // 合入 F 后的依据：F 让果粥也成为口粮，店主家户先拿果粥、牛奶顶到下次进货，面包就不必自留，“不会无限出售”的前提消失。
    // 夹具让果粥不在店主家里，自留才落在面包上；断言语义不变：家户要留的那几个面包不卖。
    // R1（t-sat，饱腹改由推导，item-class.mjs satietyFactor）后面包单件饱腹 30→16、牛奶 0→22：探针 tools/probe-rules-a.mjs shop 显示，
    // 若沿用“面包是唯一口粮”（也拿走牛奶），家户要留 6 个，正好是全部 6 个面包，可售 0，买 2 个就被拒（旧：留 4，可售 2）；
    // 牛奶现在自己提供饱腹，不能再拿走，否则“拿走牛奶以突出面包”不再是原来的情形。保留牛奶、只拿走果粥：
    // 面包留 3、可售 3；买 2 个后剩 4 > 留 3，可售 1，多买 4 个仍被拒，之后各断言（补到 6、added=2、持货人 18…）探针逐项复演一致。
    delete f.doc.state.npcs[host].inventory.item_fruit_porridge;resyncBooks(f.engine,f.doc);
    await f.act('world_trade',{seller:host,item:'item_bread',quantity:2},'buy-bread');
    assert.equal(qty(f.doc,host,'item_bread'),4);
    // Four remain; some bridge delivery, so all four exceed the saleable loaves.
    // K2（卡 E）依据：店主家户只把“本聚落持货人眼下能出让的余量”算作下一次本地补货（shop.mjs 口粮来源）；
    // 村里还没人有多余面包时，自家面包要留着顶到下次真实进货，所以多买被拒。持货人在这之后才出现。
    await assert.rejects(f.act('world_trade',{seller:host,item:'item_bread',quantity:4},'too-many'),/库存不足/);
    f.doc.state.npcs[holder].inventory={...f.doc.state.npcs[holder].inventory,item_bread:20};resyncBooks(f.engine,f.doc);
    const total=everyone(f.doc)+boundary(f.doc);
    f.doc.state.location=forge;
    await f.act('world_trade',{seller:smith,item:'item_kitchen_knife',quantity:2},'buy-knife');
    assert.equal(qty(f.doc,smith,'item_kitchen_knife'),0);
    const holderCoins=f.doc.state.npcs[holder].coins;
    await f.act('world_time',{minutes:DAY},'day1');
    // Tavern restocks daily (6 per cycle, ceiling 6) by buying the missing loaves from the villager who holds bread
    // (at least the two the player took; walk-in customers paid by D's labour sales may have taken more).
    const inn1=ledger(f.doc,'shop_hw_qingdeng').entries.find(e=>e.item==='item_bread');
    assert.equal(qty(f.doc,host,'item_bread'),6);assert.equal(qty(f.doc,holder,'item_bread'),20-inn1.added);
    assert.deepEqual([inn1.source,inn1.day],['local',1]);assert.ok(inn1.added>=2);
    assert.deepEqual(inn1.origin,{kind:'holders',from:'loc_hw'});assert.deepEqual(inn1.from,[holder]);
    // The keeper's bill goes to the holder's purse: no freight or duty for a local source.
    assert.ok(inn1.paidCopper>0);assert.equal(f.doc.state.npcs[holder].coins,holderCoins+inn1.paidCopper);
    assert.deepEqual(inn1.cost,{goods:inn1.paidCopper,freight:0,duties:0});
    // Nobody else in the village holds kitchen knives: the forge's weekly row stays empty, and says why.
    assert.equal(qty(f.doc,smith,'item_kitchen_knife'),0);
    assert.match(ledger(f.doc,'shop_hw_forge').entries.find(e=>e.item==='item_kitchen_knife').reason,/没有人持有/);
    await f.act('world_time',{minutes:DAY},'day2');
    assert.equal(qty(f.doc,host,'item_bread'),6,'已满的货架不再增加');
    // 进货款只在店主与持货人之间转移；其余流动是 D 卡劳动的真实成交（另有测试），这里只核对店主付出的正是持货人收到的。
    assert.ok(ledger(f.doc,'shop_hw_qingdeng').entries.filter(e=>e.item==='item_bread').every(e=>e.paidCopper===(e.deals??[]).reduce((n,x)=>n+x.cost,0)));
    assert.equal(everyone(f.doc)+boundary(f.doc),total,'钱只在当事人之间转移，出入模拟范围的只有记账的路费等');
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
    const everyoneAtStart=everyone(f.doc)+boundary(f.doc);
    const coins=f.doc.state.npcs[host].coins,treasury=f.doc.state.settlements[town].treasury;
    // Forge buys iron from the village stock down to its reserve.
    f.doc.state.settlements.loc_hw.iron=5;const smithCoins=f.doc.state.npcs[smith].coins;
    f.doc.state.npcs[smith].inventory.item_iron=0;resyncBooks(f.engine,f.doc);
    const ironPrice=Math.ceil(regionalTradePrice({get:(...p)=>p.reduce((v,k)=>v?.[k],f.doc)},f.engine,'item_iron','loc_hw',DAY));
    await f.act('world_time',{minutes:DAY},'day1');
    const row=ledger(f.doc,'shop_hw_qingdeng').entries.find(e=>e.item==='item_ration');
    // K08 / 05 section5.1.4 replaces instant offscreen route imports:
    // without a real holder or shipment, added0 and paid0. Retain the
    // source/cash/freight assertions: the porter quote still costs1, but a
    // quote cannot deliver2 portions or charge that coin.
    assert.deepEqual([row.source,row.added,row.paidCopper],['route',0,0]);
    const read={document:f.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],f.doc)};
    const freight=porterCharges(read,f.engine,{from:town,to:'loc_hw',cargo:[{item:'item_ration',quantity:2}],owner:host,minute:DAY});
    assert.deepEqual([freight.freight,freight.duties],[1,0]);
    // K2（卡 E）依据：基线 df95b93a 上这条已红——D 卡的出售劳动让船夫、织工把货卖给酒馆店主（真实成交），店主钱袋不再不变。
    // 断言改为：店主钱袋只按他本人的真实成交（D 的出售劳动卖给他、K2 经营者向他进货）变动，运单未到不付一文。
    const deals=Object.values(f.doc.state.records).filter(r=>r.category==='market_trade'&&r.eventId!=='buy-ration');
    const net=deals.filter(r=>r.seller===host).reduce((n,r)=>n+r.totalCoins,0)-deals.filter(r=>r.buyer===host).reduce((n,r)=>n+r.totalCoins,0);
    assert.equal(qty(f.doc,host,'item_ration'),0);assert.equal(f.doc.state.npcs[host].coins,coins+net);assert.equal(f.doc.state.settlements[town].treasury,treasury);
    const iron=ledger(f.doc,'shop_hw_forge').entries.find(e=>e.item==='item_iron');
    assert.deepEqual([iron.source,iron.added,iron.paidCopper],['settlement',3,3*ironPrice],'聚落只放出保留量以上的铁料，按实际材料行情支付');assert.equal(f.doc.state.settlements.loc_hw.iron,2);
    // W8-E8's rural-tool shelf: K2（卡 E）依据——镰刀不再从模拟范围外进货（旧断言 added1、付 20 铜随水龙头取消）；
    // 村里没有人持有镰刀，这一行补不上、不付钱。铁料与钱袋断言照旧。
    const sickle=ledger(f.doc,'shop_hw_forge').entries.find(e=>e.item==='item_sickle');
    assert.deepEqual([sickle.source,sickle.added,sickle.paidCopper],['local',0,0]);
    assert.equal(qty(f.doc,smith,'item_sickle'),0);
    assert.equal(f.doc.state.npcs[smith].coins,smithCoins-3*ironPrice);assert.equal(qty(f.doc,smith,'item_iron'),3);
    // K2（卡 E）依据：D 的出售劳动与 K2 经营者进货让钱在店主与店外村民之间真实流动，三位店主之外的钱袋也要算进来；
    // 改为全体钱袋与公账的守恒：变化只等于流出模拟范围的路费等（sink）减去流入（src）。
    assert.equal(everyone(f.doc)+boundary(f.doc),everyoneAtStart,'K08: no actual shipment, no freight payment; all local purchases still conserve cash');

    // No producing settlement in this campaign: nothing arrives, the refusal is on the ledger.
    const g=fixture({withTown:false});
    await g.act('world_trade',{seller:host,item:'item_ration',quantity:4},'buy-ration');
    await g.act('world_time',{minutes:DAY},'day1');
    assert.equal(qty(g.doc,host,'item_ration'),0);
    assert.match(ledger(g.doc,'shop_hw_qingdeng').entries.find(e=>e.item==='item_ration').reason,/\u6ca1\u6709\u5df2\u5230\u573a/); // K08: no real goods even if a source treasury exists.
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
        const quote=projected(f,host,'item_mutton',2),scarcity=foodScarcity(f);// 成交前的状态
        // Two portions preserve the strict paid-price relation assertion
        // under the designed truncation rule (one cheap portion can tie).
        const r=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:2},'mutton');
        return {cost:r.cost,quote,scarcity,regard};
    };
    const friend=await price(100),neutral=await price(0),foe=await price(-100);
    // 12 基价 × 稀缺度（食物池同一个，见 foodScarcity）× (1 − .15 × 立场 ÷ 100) × 2 份；其余因子 1；整张账单取整（截断）。手推，不调用报价函数。
    const bill=x=>Math.trunc(12*x.scarcity*(1-0.15*x.regard/100)*2);
    assert.equal(friend.cost,bill(friend));assert.equal(neutral.cost,bill(neutral));assert.equal(foe.cost,bill(foe));
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
    const row=projected(g,host,'item_mutton'),[lo,hi]=world.rules.economy.priceFactorLimits.bargain,scarcity=foodScarcity(g);
    // S5-02: retain both range rejection and exact negotiated payment; derive
    // the offered amount from today's market instead of an obsolete anchor.
    await assert.rejects(g.act('world_trade',{seller:host,item:'item_mutton',quantity:1,unitPrice:Math.ceil(row.listPrice*lo)-1},'lowball'),/单价/);
    const offer=Math.ceil(row.listPrice*hi),deal=await g.act('world_trade',{seller:host,item:'item_mutton',quantity:1,unitPrice:offer},'haggle');
    const settled=Object.values(g.doc.state.records).find(x=>x.category==='market_trade');
    // 中立立场的羊肉：12 基价 × 稀缺度（见 foodScarcity）= 挂牌价；议价上限 = 挂牌价 × 议价区间上界，向上取整（手推，不调用报价函数）。
    assert.equal(deal.cost,Math.ceil(12*scarcity*hi));
    assert.equal(deal.cost,offer);assert.equal(settled.totalCoins,offer);assert.equal(settled.quantity,1);
});

test('同日按新立场与成交深度重报，次日重新派生',async()=>{
    // Price is a non-examined author premise here. Use 120 so the
    // strict paid-copper regard assertions survive total truncation;
    // with baseline 12 both neutral 6 and hostile 6.9 truncate to 6.
    const f=fixture({edit:w=>{w.items.find(i=>i.id==='item_mutton').basePrice=120;}});
    const scarcity=foodScarcity(f),first=await f.act('world_trade',{seller:host,item:'item_mutton',quantity:1},'m1');
    // 中立开价：120 基价 × 稀缺度（见 foodScarcity，成交前的状态）× 其余因子 1，整张账单截断；稀缺度略小于 1，所以比 120 少一点。
    assert.equal(first.cost,Math.trunc(120*scarcity));
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
    // 次日只清掉昨日的成交压力；新一天自己的成交（居民自主采买等）仍计入深度，按今日成交记录手推（handFoodDepth）。
    assert.equal(expected.totalCoins,third.cost);
    const handDepth=handFoodDepth(f.engine,f.doc.state,'item_mutton');
    assert.ok(Math.abs(expected.explanation.depth-handDepth.depth)<=1e-9,`次日深度 ${expected.explanation.depth} = 手推 ${handDepth.depth}（今日净成交 ${handDepth.net}）`);
});

test('K10：有交易服务并登记店铺类型的人物自动成为店铺；现有三家店不变',async()=>{
    const {shopStores,derivedShops}=await import('../server-plugin/shop.mjs');
    // Published world: no person declares a shop type, so the shop list is exactly the three registered stores.
    assert.deepEqual(derivedShops(world),[]);
    // W8-E8 adds one independent shelf, leaving all reviewed store fields and
    // rows unchanged. The runtime catalogue must contain exactly that addition.
    const registered=structuredClone(rules.stores);
    registered.find(s=>s.id==='shop_hw_forge').restock.splice(3,0,{item:'item_sickle',source:'local',amount:1,maximum:2,basis:'W8-E8：乡村铁匠铺常备农具；铁镰已在目录（审批管线）'});
    assert.deepEqual(shopStores(world),registered);
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
    assert.deepEqual(shopStores(w).slice(0,3),registered);
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
    // K2（卡 E）依据：派生店的本地货架向本聚落持货人进货（旧断言的 3 枚来自模拟范围外）。铁匠的钉子是他自己平常的存货，
    // 不出让；另有一位村民手上有 5 枚多余的钉子，磨坊照货架补 3 枚，都从他那里来。
    const holder='npc_hw_shendu';f.doc.state.npcs[holder].inventory={...f.doc.state.npcs[holder].inventory,item_iron_nail:5};resyncBooks(f.engine,f.doc);
    await f.act('world_time',{minutes:DAY},'day1');
    assert.equal(qty(f.doc,miller,'item_iron_nail'),5);assert.equal(qty(f.doc,holder,'item_iron_nail'),2);
    const nails=ledger(f.doc,'shop_hw_ayan').entries.find(e=>e.item==='item_iron_nail');
    assert.equal(nails.added,3);assert.deepEqual(nails.from,[holder]);
});

test('只有 state 的读取器（无 document）报价与完整文档读取器一致，不因取种子崩溃',()=>{
    const f=fixture(),item='item_bread',location=f.doc.state.location;
    const full={document:f.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],f.doc)};
    const stateOnly={get:(...p)=>p.reduce((v,k)=>v?.[k],{state:f.doc.state,randomSeed:f.doc.randomSeed})};
    const quote=d=>tradeQuote(d,f.engine,{buyer:'player',seller:host,item,quantity:1,location,base:()=>regionalTradeBase(d,f.engine,item,location)});
    assert.deepEqual(quote(stateOnly),quote(full));
});
