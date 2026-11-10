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
async function w2(){
    // 复演 tests/w2-s2.test.mjs routeSession('丹')（拜师→学核心技能→练到150→认证→逐条学法术→进入购买），购买前打印导师各物品的可售量
    const {loadRuntimeWorld}=await import('./load-world.mjs');
    const {applyIntentSetup}=await import('./a3-score.mjs');
    const {readS2Publication,mergeS2Publication,withoutS2}=await import('./publish-w2-s2.mjs');
    const {withoutS3}=await import('./publish-w2-s3.mjs');const {withoutS4}=await import('./publish-w2-s4.mjs');
    const {spells,routes,routeOf}=await import('../world/design/w2-s2.mjs');
    const formal=withoutS3(withoutS4(await loadRuntimeWorld())),publication=await readS2Publication();
    const before=withoutS2(formal,{keepOwnGenerated:true}),world=mergeS2Publication(before,publication);
    const n=world.npcs.find(x=>x.id==='npc_bs_078_1');n.inventory={...n.inventory,item_bread:Number(process.env.BREAD??60),item_wood:60};
    const engine=new WorldEngine(world);
    const home={道:'bld_bs_reed_dao',武:'bld_bs_measured_hall',丹:'bld_bs_school'};
    let serial=0;
    const run=async(doc,tool,args)=>{const out=await engine.reduce(doc,{tool,args,eventId:`s2p-${++serial}`});return {doc:applyPatches(doc,out.patches),result:out.result};};
    const success=async(doc,tool,args,key='success')=>{for(let i=0;i<60;i++){const r=await run(doc,tool,args);if(r.result[key])return r;}throw Error('无成功检定');};
    const wait=async(doc,minutes)=>(await run(doc,'world_time',{minutes,activity:'等待'})).doc;
    const at=async(doc,m)=>{let target=Math.floor(doc.state.minute/1440)*1440+m;if(target<=doc.state.minute)target+=1440;while([10,20,30].includes(engine.calendar(target).day))target+=1440;return wait(doc,target-doc.state.minute);};
    const attend=async(doc,teacher,place,m)=>{for(let i=0;i<40;i++){doc=await at(doc,m);const x=doc.state.npcs[teacher];if(x.location===place&&!x.status)return doc;}throw Error('不在');};
    const route='丹',r=routes[route],teacher=r.teacher,place=home[route],role=world.professions.find(p=>p.id===r.profession);
    let doc=engine.createCharacter(seed,{},`s2-${route}`);doc.state.minute=510;doc.state.location='loc_bs';Object.assign(doc.state.player,{level:10,coins:5000});
    for(const a of Object.keys(doc.state.player.attributes))doc.state.player.attributes[a]=18;
    doc=(await run(doc,'world_move',{destination:place})).doc;
    const entry=world.rules.training.institutions.find(e=>e.teacher===teacher&&e.profession===role.id);
    if(entry)doc=(await run(doc,'world_profession',{operation:'initiate',profession:role.id,teacher,institution:place,rule:entry.rule})).doc;
    const core=role.entry.skill;doc=(await success(doc,'world_learn',{entity:core,source:teacher,kind:'skill'})).doc;
    const staged=applyIntentSetup(engine,doc,{abilities:{skills:{[core]:149}}});doc=staged.document;
    doc=(await run(doc,'world_practice',{skill:core})).doc;
    doc=await attend(doc,teacher,place,510);doc=(await success(doc,'world_profession',{profession:role.id,teacher,operation:'certify'},'certified')).doc;
    for(const s of spells.filter(s=>routeOf[s.id]===route)){doc=await attend(doc,teacher,place,800);doc=(await success(doc,'world_learn',{kind:'spell',entity:s.id,source:teacher})).doc;}
    doc=await attend(doc,teacher,place,800);doc=(await success(doc,'world_learn',{kind:'spell',entity:'spell_s1_tinder',source:teacher})).doc;
    doc=await attend(doc,teacher,place,800);doc=(await success(doc,'world_learn',{kind:'recipe',entity:'recipe_s2_pill',source:teacher})).doc;
    console.log(`[w2-s2 丹路线] 购买前 minute ${doc.state.minute}（第 ${Math.floor(doc.state.minute/DAY)} 天），导师 ${teacher} 家户与存量`);
    const d=engine.primitiveDraft(doc),T=doc.state.npcs[teacher];
    console.log(`  导师库存：${Object.entries(T.inventory).map(([k,v])=>`${k}:${typeof v==='number'?v:v.quantity}`).join(' ')}`);
    for(const [item,q] of [['item_s2_huangjing',2],['item_s2_fuling',2],['item_s2_gancao',1],['item_honey',1],['item_s2_tinder',2],['item_charcoal',6]]){
        const x=saleableStock(d,engine,teacher,item,{business:true}),e=engine.byId.get(item);
        console.log(`    ${item} 要 ${q}  stock ${x.stock} retained ${x.retained} upkeep ${x.upkeep} committed ${x.committed} available ${x.available} ${x.available<q?' <-- 不足':''} (satiety ${e?.nutrition?.satiety??0})`);
    }
    // 逐件真买，看哪件被拒
    for(const [item,q] of [['item_s2_huangjing',2],['item_s2_fuling',2],['item_s2_gancao',1],['item_honey',1],['item_s2_tinder',2],['item_charcoal',6]]){
        try{const t=await run(doc,'world_trade',{seller:teacher,item,quantity:q});doc=t.doc;console.log(`    买 ${item} x${q}：成交 ${t.result.cost}`);}catch(e){console.log(`    买 ${item} x${q}：被拒 ${e.message}`);}
    }
}
async function s3fin(){
    const F=await import('../tests/helpers/finance.mjs');
    const {netAssets}=await import('../server-plugin/finance-assets.mjs');
    const {host}=F;
    const f=F.fixture();
    const people=['player',...Object.keys(f.doc.state.npcs)];
    const demandOf=(label)=>{const d=f.draft();const sup=supplyReport(d,f.e,'item_bread',f.doc.state.location,label);const na=netAssets(d,f.e,host);d.done();console.log(`    netAssets(host)=${na}`);return sup;};
    console.log('[s3-finance-scenarios #2 / finance-assets] 注资前：host 现金 '+f.doc.state.npcs[host].coins);
    demandOf('注资前');
    const before=f.doc.state.npcs[host].coins;
    const eq=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'equity');
    const rec=f.doc.state.records[eq.contract];
    console.log(`  注资后：host 现金 ${before} -> ${f.doc.state.npcs[host].coins}（+${f.doc.state.npcs[host].coins-before}）；合同 ${JSON.stringify({price:rec.price??rec.unitPrice,shares:rec.shares??rec.quantity,paid:rec.paid??rec.amount,value:rec.value})}`);
    console.log(`  合同字段：${Object.entries(rec).filter(([,v])=>typeof v!=='object').map(([k,v])=>k+'='+v).join(' ')}`);
    demandOf('注资后');
    // 测试 36-45 行：记工资债 wages（欠 worker，数额=host 现金），读 netAssets，采纳旧投影后再读
    const {adoptLegacyObligation}=await import('../server-plugin/obligation-runtime.mjs');
    const at=rec.nextDividend,amount=f.doc.state.npcs[host].coins;
    f.doc.state.records.wages={category:'debt',kind:'wage',debtor:host,creditor:F.worker,amount,paid:0,createdAt:600,deadline:at,status:'待偿还'};
    let d=f.draft();const n1=netAssets(d,f.e,host);console.log(`  记工资债后（amount ${amount}）：netAssets=${n1}`);
    adoptLegacyObligation(d,f.e,'wages');console.log(`  采纳旧投影后：netAssets=${netAssets(d,f.e,host)}`);
    supplyReport(d,f.e,'item_bread',f.doc.state.location,'记债后');d.done();
}
async function ew(){
    const {currentShops,advanceShops,tradeQuote}=await import('../server-plugin/shop.mjs');
    const host='npc_hw_linsui',inn='bld_hw_qingdeng';
    const mk=()=>{const w=structuredClone(original);for(const n of w.npcs){delete n.tier;delete n.schedule;}
        const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'entity-world');doc.state.minute=600;
        const d={document:doc,get(...path){return path.reduce((o,k)=>o?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};
        return {engine,d};};
    // 测试1（行 30-68）：loc_bs 迁店后报价 base 999，期望 499（.5 地板），实际 666
    if(process.env.ONLY!=='2'){const {engine,d}=mk(),state=d.get('state');
     state.settlements.loc_bs={population:1000,treasury:900,food:100,iron:100};state.npcs[host].coins=100;state.npcs[host].inventory.item_bread=0;
     d.set(['state','npcs',host,'residence'],{settlement:'loc_bs',home:'loc_bs',since:600,workChanged:false,schedule:{default:[{start:0,end:1440,location:'loc_bs',activity:'营业',services:['trade']}]}});
     console.log('[entity-world #1] loc_bs 报价 item_bread base 999');console.time('q');
     const m=tradeQuote(d,engine,{buyer:'player',seller:host,item:'item_bread',location:'loc_bs',base:()=>999});const x=m.explanation;
     console.log(`  报价 base ${f3(x.base)} 稀缺度 ${f3(x.scarcity)} 单价 ${f3(m.listPrice)} -> ${m.totalCoins}；供给 ${m.supply} 需求 ${m.demand}`);console.timeEnd('q');}
    // 测试2（行 75-102）：successor ayan 的面包货架向持货人 shendu 进货；shendu 手里 N 个面包
    if(process.env.ONLY!=='1')for(const N of (process.env.NS?JSON.parse(process.env.NS):[16])){
     const {engine,d}=mk();
     d.set(['state','npcs',host,'residence'],{since:600,workChanged:true,settlement:'loc_bs',schedule:{default:[{start:0,end:1440,location:'loc_bs',services:[]}]}});d.remove(['state','npcs',host,'residence']);
     d.set(['state','npcs',host,'vocation'],{id:'changed',since:600,services:[],schedule:{default:[{start:0,end:1440,location:inn,services:[]}]}});
     advanceShops(d,engine,600,DAY);d.remove(['state','npcs',host,'vocation']);d.set(['state','npcs',host,'status'],'死亡');
     const successor='npc_hw_ayan',base=engine.byId.get(successor);base.shopType='tavern';base.services=['trade'];base.workplace={location:inn};
     d.set(['state','npcs',successor,'inventory','item_bread'],0);
     const holder='npc_hw_shendu';d.set(['state','npcs',holder,'inventory','item_bread'],N);
     const r=saleableStock(d,engine,holder,'item_bread');
     advanceShops(d,engine,600,DAY);
     const qty=(id)=>{const v=d.get('state','npcs',id,'inventory','item_bread');return typeof v==='number'?v:v?.quantity??0;};
     const e=d.get('state','records','shop:shop_hw_qingdeng')?.entries?.find(e=>e.item==='item_bread'&&e.minute===DAY&&e.added);
     console.log(`  [entity-world #2] shendu 面包 ${N}：stock ${r.stock} retained ${r.retained} available ${r.available}；进货后 货架 ${qty(successor)} 持货人 ${qty(holder)} added ${e?.added} paid ${e?.paidCopper}`);}
}
async function fa(){
    const F=await import('../tests/helpers/finance.mjs');
    const {operatingProfit}=await import('../server-plugin/finance-assets.mjs');
    const {applyIntentSetup}=await import('./a3-score.mjs');
    const {valuation}=await import('../server-plugin/valuation.mjs');
    const {supplyApart}=await import('../server-plugin/market.mjs');
    const {tradeQuote}=await import('../server-plugin/shop.mjs');
    const {host,worker,post}=F;
    // ---- 测试 #1（行 29-47）
    {const f=F.fixture(),d=f.draft();
     const asset={item:'item_bread',location:post,holder:'player'},supply=supplyApart(d,f.e,{...asset,owner:'player'});
     console.log(`[finance-assets #1] supplyApart 供给 ${supply.supply} 需求 ${supply.demand}（测试 [20,18]）`);
     for(const [role,q] of [['collateral',5],['goods',5],['collateral',10],['goods',10]])console.log(`  valuation(${role},q${q}) = ${valuation(d,f.e,{role,...asset,quantity:q}).value}（旧 ${({'collateral5':9,'goods5':9,'collateral10':14,'goods10':18})[role+q]}）`);
     const premium=new WorldEngine({...f.w,derived:{...f.w.derived,modifiers:[...f.w.derived.modifiers,{id:'collateral-add',pack:'business',target:'economy:value',stage:'add',value:1}]}});
     console.log(`  加法修正 collateral q10 = ${valuation(d,premium,{role:'collateral',...asset,quantity:10}).value}（旧 24）`);
     const timber=supplyApart(d,f.e,{item:'item_wood',location:post,owner:'player'});console.log(`  木料 供给 ${timber.supply} 需求 ${timber.demand}（旧 [28,1]）；collateral 100 = ${valuation(d,f.e,{role:'collateral',item:'item_wood',location:post,holder:'player',quantity:100}).value}（旧 200）`);
     d.done();}
    // ---- 测试 #4（行 84-）
    {const f=F.fixture(),total=F.cash(f.doc);
     const setup=applyIntentSetup(f.e,f.doc,{facts:[{path:['state','inventory'],value:{item_bread:{quantity:20}}},{path:['state','npcs',host,'inventory'],value:{item_oat_flatbread:{quantity:Number(process.env.FLAT??60)}}}]});
     f.doc=setup.document;
     const d=f.draft();
     const q=tradeQuote(d,f.e,{buyer:host,seller:'player',item:'item_bread',quantity:16,location:f.doc.state.location,base:()=>regionalTradeBase(d,f.e,'item_bread',f.doc.state.location)});
     const [lo,hi]=f.e.rules.economy.priceFactorLimits.bargain,x=q.explanation;
     console.log(`[finance-assets #4] 收购面包x16：base ${f3(x.base)} 稀缺度 ${f3(x.scarcity)} 价差 ${f3(x.spread)} 单价 ${f3(q.listPrice)} 总 ${q.totalCoins}；议价区间 [${Math.ceil(q.listPrice*lo)},${Math.ceil(q.listPrice*hi)}]（bargain ${lo}..${hi}）；供给 ${q.supply} 需求 ${q.demand} retail ${q.retail}`);
     const sf=saleableStock(d,f.e,host,'item_oat_flatbread');console.log(`  host 薄饼 stock ${sf.stock} retained ${sf.retained} available ${sf.available}`);
     d.done();
     const P=Number(process.env.P??Math.ceil(q.listPrice*lo));
     const acq=await f.act({buyer:host,seller:'player',item:'item_bread',quantity:16,unitPrice:P},'stock-acquired');
     console.log(`  以单价 ${P} 收购：cost ${acq.cost}（旧 16，每份成本1）`);
     const prof=()=>{const dd=f.draft(),n=operatingProfit(dd,f.e,host);dd.done();return n;};
     const own=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'invest');console.log(`  入股后 profit ${prof()}（断言0），cash(f.doc)==total ${F.cash(f.doc)===total}`);
     const d2=f.draft();const sq=tradeQuote(d2,f.e,{buyer:'player',seller:host,item:'item_bread',quantity:10,location:f.doc.state.location,base:()=>regionalTradeBase(d2,f.e,'item_bread',f.doc.state.location)});d2.done();
     console.log(`  卖10面包报价：单价 ${f3(sq.listPrice)} 总 ${sq.totalCoins}；议价区间 [${Math.ceil(sq.listPrice*lo)},${Math.ceil(sq.listPrice*hi)}]；稀缺度 ${f3(sq.explanation.scarcity)}；供给 ${sq.supply} 需求 ${sq.demand}`);
     const SP=2;
     try{const sale=await f.act({seller:host,item:'item_bread',quantity:10,unitPrice:SP},'sale');console.log(`  卖10 @${SP}：cost ${sale.cost}（旧 20）税 ${sale.tax?.amount??0}，利润 ${prof()}（net=${sale.cost-10*P-(sale.tax?.amount??0)}，断言 profit==net 且>0）`);}
    catch(e){console.log(`  卖10 @${SP} 被拒：${e.message}`);}
     // 复演行 107-118 余下断言
     const sale=f.doc.state.records&&null;
     f.e.byId.get(host).creditPolicy={limitCopper:1000,maximumMinutes:30*F.DAY,minimumTrust:-100};
     const netNow=prof();
     const credit=await f.act({seller:host,item:'item_bread',quantity:2,payment:'credit',creditMinutes:7*F.DAY},'credit-sale');console.log(`  赊卖2：profit ${prof()}（断言 == 卖10后利润 ${netNow}）`);
     await f.act({seller:host,payment:'repay',debt:credit.debt},'settle-credit');
     const tax=f.doc.state.records['trade_tax:settle-credit:commercial']?.amount??0,totalNet=netNow+credit.cost-2*P-tax;console.log(`  还款后 profit ${prof()}（断言 totalNet=${totalNet}；注意旧式 -2 现为 -2*成本${P}）`);
     const before=f.doc.state.player.coins;f.tick(f.doc.state.records[own.contract].nextDividend);
     const paid=f.doc.state.records[own.contract].distributed;console.log(`  分红 paid ${paid}（断言 floor(totalNet*.2)=${Math.floor(totalNet*.2)}），玩家钱 +${f.doc.state.player.coins-before}，cash守恒 ${F.cash(f.doc)===total}`);
     const tr=await f.act({operation:'share_transfer',seller:host,buyer:worker,contract:own.contract,quantity:5,consent:true},'transfer');console.log(`  转让股份：holder ${f.doc.state.records[tr.contract].holder}，原份额 ${f.doc.state.records[own.contract].share}，cash守恒 ${F.cash(f.doc)===total}`);
    d.done?.();}
}
async function credit(){
    const inn='bld_hw_qingdeng',post='bld_hw_post',home='bld_hw_riverhome',court='bld_hw_council';
    const host='npc_hw_linsui',clerk='npc_hw_shendu',mage='npc_hw_xuling',worker='npc_hw_ayan',judge='npc_hw_chenbai',officer='npc_hw_gucen';
    const placeOf={[host]:inn,[clerk]:post,[mage]:home,[worker]:inn,[judge]:court,[officer]:court};
    const w=structuredClone(original),engine=new WorldEngine(w);
    let doc=engine.initialFromLegacy(seed,'credit');
    doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=300;doc.state.inventory={item_bread:{quantity:4}};
    doc.state.npcs=Object.fromEntries(Object.entries(placeOf).map(([id,loc])=>[id,{...doc.state.npcs[id],coins:200,location:loc,activity:'营业',status:'正常',goals:{},memoryStream:[]}]));
    for(const npc of w.npcs.filter(n=>placeOf[n.id])){
        if([judge,officer].includes(npc.id)){delete npc.schedule;delete npc.tier;continue;}
        npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:npc.id===host?['trade']:[]}]};
    }
    const act=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
    const qty=(id,item)=>{const v=doc.state.npcs[id].inventory[item];return typeof v==='number'?v:v?.quantity??0;};
    const report=(label)=>{const d=engine.primitiveDraft(doc);const r=saleableStock(d,engine,host,'item_bread',{business:true});console.log(`  [${label}] host 面包 stock ${r.stock} retained ${r.retained} committed ${r.committed} available ${r.available}`);};
    console.log('[credit #6] 复演到 procure 之前');
    report('开场');
    const lease=await act('world_trade',{operation:'lease',seller:host,consent:true,days:5},'lease');
    await act('world_trade',{operation:'partner',business:lease.business,seller:worker,consent:true,coins:30,quantity:50,days:1},'partner');
    await act('world_time',{minutes:DAY},'wait');report('过一天后（procure 前）');
    const row=Object.values(doc.state.records).find(r=>r.category==='contract'&&r.kind==='partnership');
    const stock0=qty(host,'item_bread');
    for(const extra of (process.env.EXTRA?JSON.parse(process.env.EXTRA):[0])){
        const copy=structuredClone(doc);copy.state.npcs[host].inventory.item_bread={quality:'良',durability:100,weight:.15,quantity:stock0+extra};
        const {resyncBooks}=await import('../tests/helpers/ledger-sync.mjs');resyncBooks(engine,copy);
        const d=engine.primitiveDraft(copy);const r=saleableStock(d,engine,host,'item_bread',{business:true});
        console.log(`  多给 ${extra} 个面包：stock ${r.stock} retained ${r.retained} available ${r.available}`);
    }
    // 复演余下断言（测试 156-171）：给店主 N 个面包后做赊购进货
    const N=Number(process.env.N??6);
    const {resyncBooks}=await import('../tests/helpers/ledger-sync.mjs');
    const paid=await act('world_trade',{seller:worker,payment:'repay',debt:row.debt},'payout');
    doc.state.npcs[host].status='正常';
    doc.state.npcs[host].inventory.item_bread={quality:'良',durability:100,weight:.15,quantity:N};resyncBooks(engine,doc);
    await act('world_act',{action:'business:open_counter',slots:{business:lease.business,coins:0}},'credit-counter');
    const cashAll=()=>doc.state.player.coins+Object.values(doc.state.npcs).reduce((n,r)=>n+(r.coins??0),0)+Object.values(doc.state.settlements).reduce((n,r)=>n+(r.treasury??0),0);
    const before=doc.state.npcs[host].coins;
    try{const cost=await act('world_trade',{operation:'procure',business:lease.business,seller:host,consent:true,item:'item_bread',quantity:2,payment:'credit',creditMinutes:3*DAY},'procure');
     console.log(`  赊购进货成功：cost ${cost.cost}，debt ${!!cost.debt}，principal==cost ${doc.state.records[cost.debt].principal===cost.cost}，host 钱 ${before}->${doc.state.npcs[host].coins}（断言 before-cost=${before-cost.cost}），loan ${doc.state.records[cost.contract].loan===cost.debt}，escrow==cost ${doc.state.records[cost.contract].escrow===cost.cost}`);
    }catch(e){console.log(`  赊购进货被拒：${e.message}`);}
}
// 通用：用 daily-b2 夹具（variant/scene）搭一个会话外的文档，只读报价
async function daily(world,mutate){
    // 与测试同一入口：uiSession 创建游戏服务器、导出初始档、写夹具、导入；再读回文档，用同一世界建引擎只读报价
    const {uiSession}=await import('../tests/helpers/ui-script.mjs');
    const t={after(){}};
    const ui=await uiSession(t,{world,mutate});
    const doc=await ui.read();
    return {engine:new WorldEngine(world),doc,ui};
}
async function a2(){
    const {variant,scene}=await import('../tests/helpers/daily-b2.mjs');
    const {tradeQuote}=await import('../server-plugin/shop.mjs');
    const NPC='npc_hw_linsui',INN='bld_hw_qingdeng';
    const world=variant(w=>{w.npcs.find(n=>n.id===NPC).schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};w.items.find(i=>i.id==='item_bread').basePrice=100;});
    const {engine,doc}=await daily(world,scene(INN,540,s=>{Object.assign(s.npcs[NPC],{goals:{},trust:20,activity:'营业',location:INN});s.player.coins=5000;}));
    console.log('[a2-dialogue #7] 买 1 个 item_bread（basePrice 100）：测试期望 48，实际 58');
    const d=engine.primitiveDraft(doc);
    supplyReport(d,engine,'item_bread',INN,'店内',{holders:[NPC]});
    const q=tradeQuote(d,engine,{buyer:'player',seller:NPC,item:'item_bread',quantity:1,location:INN,base:()=>regionalTradeBase(d,engine,'item_bread',INN)});
    const x=q.explanation;console.log(`  报价：base ${f3(x.base)} 稀缺度 ${f3(x.scarcity)} 立场 relation ${f3(x.relation)} 品质 ${f3(x.quality)} 价差 ${f3(x.spread)} 深度 ${f3(x.depth)} 单价 ${f3(q.listPrice)} 精确 ${f3(q.exactTotal)} -> ${q.totalCoins}；供给 ${q.supply} 需求 ${q.demand} opening ${q.opening}`);
}
const jobs={a3,shop,w2,a2,s3fin,ew,fa,credit};
for(const [n,fn] of Object.entries(jobs))if(which===n||which==='all')await fn();
process.exit(0);
