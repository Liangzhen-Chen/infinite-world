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
const jobs={a3};
for(const [n,fn] of Object.entries(jobs))if(which===n||which==='all')await fn();
