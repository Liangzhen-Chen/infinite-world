// 确定性诊断探针（A 类测试按新规则重推预期用）：搭出与测试相同的前置状态，只调用公开函数，打印需求、供给、稀缺度、留存件数、单价等中间量。
// 不调用模型，不改数据。用法：node tools/probe-rules-a.mjs <a3|...>   同一文件可复制到旧分支工作树运行，做前后对照。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {quoteSupply,marketQuote,saleableStock,registerShopShelves,goodsClass,upkeepDemand} from '../server-plugin/market.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
const original=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
const which=process.argv[2]??'all',DAY=1440;
const f3=x=>Number(x).toFixed(3);
function supplyReport(d,e,item,location,label,{holders=null}={}){
    const sup=quoteSupply(d,e,{item,location}),state=d.get('state');
    console.log(`  [${label}] ${item}@${location}: 供给 ${sup.supply}  需求 ${sup.demand}  稀缺度(未夹) ${f3(sup.demand/Math.max(1,sup.supply))}`);
    for(const r of sup.rows)console.log(`      供给行 ${r.owner}:${r.item} stock ${r.stock} retained ${r.retained} committed ${r.committed} available ${r.available}`);
    const who=[];
    for(const id of holders??['player',...Object.keys(state.npcs)]){const r=saleableStock(d,e,id,item);if(r.stock||r.retained||r.committed)who.push(`${id}: stock ${r.stock} retained ${r.retained} upkeep ${r.upkeep} committed ${r.committed}`);}
    console.log(`      各持有人 ${item} 的 stock/retained：${who.join(' | ')||'无'}`);
    // 需求拆解：同类食物每位非店主持有人的 retained-upkeep+committed 之和（stockSupply:200 的 personalDemand）与店主行
    const items=e.world.items.filter(i=>goodsClass(e,i.id)===sup.goods).map(i=>i.id),parts=[];let sum=0,upk=0;for(const id of ['player',...Object.keys(state.npcs)])upk+=upkeepDemand(state,e,id,item);
    for(const id of ['player',...Object.keys(state.npcs)]){let n=0;for(const it of items){const r=saleableStock(d,e,id,it);if(r.stock)n+=r.retained-r.upkeep+r.committed;}if(n){parts.push(`${id}:${n}`);sum+=n;}}
    console.log(`      需求拆解（同类 ${items.length} 种食物，有存量者 retained-upkeep+committed）：合计 ${sum}  ${parts.join(' ')}；upkeepDemand 合计 ${upk}`);
    const shelves=registerShopShelves.fn?.(e,sup.place)??[],inClass=shelves.filter(r=>items.includes(r.item));
    console.log(`      货架上限（stockSupply:218，同类 restock 行 maximum+reserve）：合计 ${inClass.reduce((n,r)=>n+r.maximum+(r.reserve??0),0)}  ${inClass.map(r=>`${r.item}:${r.maximum}+${r.reserve??0}`).join(' ')}`);
    return sup;
}
function quoteReport(d,e,item,location,seller,quantity,label,extra={}){
    const q=marketQuote(d,e,{item,location,seller,quantity,base:regionalTradeBase(d,e,item,location),...extra});
    const x=q.explanation;
    console.log(`  [${label}] 报价 ${item} x${quantity}: base ${f3(x.base)} 稀缺度 ${f3(x.scarcity)} 品质 ${f3(x.quality)} 价差 ${f3(x.spread)} 深度 ${f3(x.depth)} 单价 ${f3(q.listPrice)} 精确总价 ${f3(q.exactTotal)} -> ${q.totalCoins}`);
    return q;
}

async function a3(){
    const SELLER='npc_hw_linsui',INN='bld_hw_qingdeng',BREAD='item_oat_flatbread',TEACHER='npc_hw_luqing',SKILL='skill_a3_receipt_lesson';
    const world=structuredClone(original);
    for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
    for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock'])delete world.rules[key];
    for(const f of world.factions)delete f.clock;
    world.npcs.find(n=>n.id===SELLER).schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
    world.items.find(r=>r.id===BREAD).basePrice=8;
    const tutor=world.npcs.find(n=>n.id===TEACHER);tutor.profileStatus='full';tutor.services.push(SKILL);
    world.skills.push({id:SKILL,name:'回执工艺',attribute:'智力',stage:0,profession:null,prerequisites:[],learnMinutes:120,learnFee:12});
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'a3-legacy-receipt');
    document.state.location=INN;document.state.player.coins=100;
    Object.assign(document.state.npcs[SELLER],{location:INN,status:'正常',activity:'营业',goals:{}});
    document.state.npcs[SELLER].inventory[BREAD]={quantity:5,quality:'良',durability:100,weight:.2};
    Object.assign(document.state.npcs[TEACHER],{location:INN,status:'正常',activity:'休息',trust:80,goals:{},skills:{[SKILL]:500}});
    const now=document.state.minute;
    document.state.player.body={stamina:{value:40,asOf:now,activity:'rest'},fatigue:{value:40,asOf:now,activity:'rest'},satiety:{value:30,asOf:now,activity:'rest'},hydration:{value:70,asOf:now,activity:'rest'}};
    const booked=withLedger(engine,document).document;booked.holdings=openHoldings(engine,booked);
    console.log('[a3-legacy-primitives] 买 2 个 item_oat_flatbread（basePrice 8），测试期望 8（8*0.5 地板*2），实际 9');
    const d=engine.primitiveDraft(booked);
    supplyReport(d,engine,BREAD,INN,'买前');
    quoteReport(d,engine,BREAD,INN,'player',2,'玩家买2',{});
    const e2=engine.byId.get(BREAD);console.log(`  物品 ${BREAD}: basePrice ${e2.basePrice} satiety ${e2.nutrition?.satiety}`);
    console.log(`  priceFactorLimits.region = ${JSON.stringify(engine.rules.economy.priceFactorLimits.region)}`);
}
async function shop(){
    const {resyncBooks}=await import('../tests/helpers/ledger-sync.mjs');
    const inn='bld_hw_qingdeng',forge='bld_hw_forge',town='loc_bs',host='npc_hw_linsui',smith='npc_hw_duanyan',merchant='npc_hw_yanzhe';
    const placeOf={[host]:inn,[smith]:forge,[merchant]:town};
    const w=structuredClone(original),engine=new WorldEngine(w);
    let doc=engine.initialFromLegacy(seed,'shop-restock');
    doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=500;
    for(const [id,loc]of Object.entries(placeOf))doc.state.npcs[id]={...doc.state.npcs[id],coins:200,location:loc,activity:'营业',status:'正常',goals:{},memoryStream:[]};
    for(const [id,npc]of Object.entries(doc.state.npcs))if(!placeOf[id])npc.coins=0;
    for(const npc of w.npcs.filter(n=>placeOf[n.id])){delete npc.tier;npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:['trade']}]};}
    doc.state.settlements[town]={...structuredClone(doc.state.settlements.loc_hw),name:'白石镇',population:1000,treasury:900};
    const drop=process.env.DROP?JSON.parse(process.env.DROP):['item_fruit_porridge','item_milk'];
    for(const item of drop)delete doc.state.npcs[host].inventory[item];resyncBooks(engine,doc);
    console.log('[shop-restock #2] 删除 '+drop.join(',')+'； 店主 linsui 的家户面包：stock、留存、可售（买 2 个应当可行，测试 70 行被拒）');
    const d=engine.primitiveDraft(doc);
    const {householdResources}=await import('../server-plugin/household-budget.mjs');
    const r=householdResources(d,engine,host);
    console.log(`  家户成员 ${JSON.stringify(r.members)} 共享伙食 ${r.sharedMeals}  市场替代: cash ${r.market.cash} spent ${r.market.spent} 购入 ${JSON.stringify(r.market.purchases.map(p=>`${p.item}x${p.quantity}@${p.unitPrice}`))} nextFoodAt ${r.market.nextFoodAt}`);
    console.log(`  需求(满足缺口前) shortfall ${JSON.stringify(r.shortfall)} procurementShortfall ${JSON.stringify(r.procurementShortfall)}`);
    for(const row of r.rows.filter(x=>x.holder===host))console.log(`    行 ${row.item}: stock ${row.stock} retained ${row.retained} upkeep ${row.upkeep??0} committed ${row.committed} available ${row.available} food ${row.food}`);
    console.log('  家户口粮行（food>0）：'+r.rows.filter(x=>x.food>0).map(x=>`${x.holder.replace('npc_hw_','')}:${x.item} 留${x.food} 单件饱腹${engine.byId.get(x.item)?.nutrition?.satiety??0}`).join(' | '));
    console.log('  needs.satiety(预算期总需) '+JSON.stringify(r.needs??null)+' 面包饱腹 '+engine.byId.get('item_bread').nutrition?.satiety);
    const sb=saleableStock(d,engine,host,'item_bread',{business:true});console.log(`  saleableStock(item_bread): ${JSON.stringify(sb)}`);
    quoteReport(d,engine,'item_bread',inn,host,1,'买1个');
    // 复演测试 70-90 行的动作序列，打印被断言的量
    const act=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
    const qty=(who,item)=>{const v=doc.state.npcs[who].inventory[item];return typeof v==='number'?v:v?.quantity??0;};
    const holder='npc_hw_shendu';
    await act('world_trade',{seller:host,item:'item_bread',quantity:2},'buy-bread');console.log(`  买2后店主面包 ${qty(host,'item_bread')}（断言 4）`);
    try{await act('world_trade',{seller:host,item:'item_bread',quantity:4},'too-many');console.log('  too-many 未被拒（断言应拒绝）');}catch(e){console.log(`  too-many 被拒：${e.message}（断言 /库存不足/）`);}
    doc.state.npcs[holder].inventory={...doc.state.npcs[holder].inventory,item_bread:20};resyncBooks(engine,doc);
    doc.state.location=forge;await act('world_trade',{seller:smith,item:'item_kitchen_knife',quantity:2},'buy-knife');
    const hc=doc.state.npcs[holder].coins;
    await act('world_time',{minutes:DAY},'day1');
    const inn1=doc.state.records['shop:shop_hw_qingdeng'].entries.find(e=>e.item==='item_bread');
    console.log(`  day1：店主面包 ${qty(host,'item_bread')}（断言 6）；持货人面包 ${qty(holder,'item_bread')}（断言 20-added=${20-inn1.added}）；source/day ${inn1.source}/${inn1.day}（断言 local/1）；added ${inn1.added}（断言>=2）；paidCopper ${inn1.paidCopper}（断言>0），持货人钱 ${hc}->${doc.state.npcs[holder].coins}`);
    console.log(`  origin ${JSON.stringify(inn1.origin)} from ${JSON.stringify(inn1.from)} cost ${JSON.stringify(inn1.cost)}`);
    await act('world_time',{minutes:DAY},'day2');console.log(`  day2：店主面包 ${qty(host,'item_bread')}（断言 6）`);
}
const jobs={a3,shop};
for(const [n,fn] of Object.entries(jobs))if(which===n||which==='all')await fn();
