// S1c 价格改读账户：价格公式不改，公式读取的存量、库存、货币量改从账本账户读取（15 §15.2，10 §10.4 S1 行）。
// 过渡期的双读对照：每个价格输入点（stock.PRICE_POINTS）同时取旧字段与新账户，探针记下两份读数；
// 同一个事件在“读账户”与“只读旧字段”两种模式下各归约一遍，补丁与结果必须逐项相等（结算不变）；
// 交易、离屏推进、农业季与采集之后，再把整张价格面（区域报价、木料与粮价系数、药价、军需报价）两种模式各算一遍，断言完全相等。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync,readdirSync} from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {regionalTradePrice,armySupplyQuote} from '../server-plugin/settlement-trade.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {forestWaterPriceFactor} from '../server-plugin/forest-water.mjs';
import {PRICE_POINTS,probePriceReads,setPriceReadMode,priceRead} from '../server-plugin/stock.mjs';
import {createPriceProbe} from './helpers/price-probe.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {medicinePriceFactor,MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {collectRouteTariffs} from '../server-plugin/finance-tax.mjs';
import {advanceLaborMarket} from '../server-plugin/labor-market.mjs';
import {advanceNpcSchedules} from '../server-plugin/npc-schedule.mjs';
import {advanceNpcAutonomy,applyNpcPlan,npcPlanFingerprint,npcAutonomyBusy,nextNpcAutonomyMinute} from '../server-plugin/npc-autonomy.mjs';
import {fixture as financeFixture,grantLoanConsent} from './helpers/finance.mjs';
import {damageFacility} from '../server-plugin/facilities.mjs';
import {startPublicProject} from '../server-plugin/public-projects.mjs';
import {ensureGroupAccount} from '../server-plugin/group-account.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const DAY=1440,inn='bld_hw_qingdeng',post='bld_hw_post';
const host='npc_hw_linsui',clerk='npc_hw_shendu',worker='npc_hw_ayan';
const probe=createPriceProbe();probePriceReads(r=>probe.record(r));

function draft(document){return {document,patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
    set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
    remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});},say(){}};}
const inMode=(mode,fn)=>{setPriceReadMode(mode);try{return fn();}finally{setPriceReadMode('ledger');}};
const inModeAsync=async(mode,fn)=>{setPriceReadMode(mode);try{return await fn();}finally{setPriceReadMode('ledger');}};

// ---- 登记与静态扫描 ---------------------------------------------------------------
const SRC=new URL('../server-plugin/',import.meta.url);
const sources=Object.fromEntries(readdirSync(SRC).filter(f=>f.endsWith('.mjs')).map(f=>[f,readFileSync(new URL(f,SRC),'utf8')]));
// 含价格、报价、估值字样的模块的归类。read = 价格输入已读账户；其余是“不读存量或货币量”的原因。
const SURVEY={
    // S5-02: unified projection reads actual holder and settlement accounts.
    'market.mjs':'read',
    // S5-03 / 15 §15.3: currency supply is read directly from ledger.accounts;
    // metal goods use the registered market projection, never legacy inventory.
    'currency.mjs':'货币存量直接读取 ledger.accounts；金属商品报价转调已登记的 marketQuote，不另读旧库存定价',
    // S5-01 / 15 §15.2: this is the primitive baseline/correction slot,
    // not another inventory-priced consumer. Market callers read the books.
    'derived.mjs':'economy:value 缺省基准取主体 basePrice 事实；只计算上下文基准与修正项，不自行读取库存或现款，供需由市场调用方经已登记账户读取',
    // A3 daily22: these are valuations of declared gifts/prizes, not price
    // formulas driven by stock. Keep the exhaustive module/reader checks below.
    'dialogue.mjs':'赠礼事件标值取目录基价，物品仍经真实转移核验，不以估值读取库存或现款',
    'festival.mjs':'NPC授权成本取登记物资和奖品数量乘目录基价；数量来自节庆条款，不读库存或现款计算价格',
    'primitives-runtime.mjs':'NPC同意的成本和报酬估值取拟转移数量乘目录基价；支付能力另由真实转移事务核验，不以库存或现款定价',
    'manufacturing.mjs':'配方投入重置成本经 regionalTradePrice 统一估值，不自行读取库存',
    // S5-02: obsolete regionalMaterialSupply has no callers and is removed;
    // the regional wrapper delegates inventory pricing to registered market.
    'settlement-trade.mjs':'区域价只转调 market 已登记账户读取；保留路线/环境输入，不另读存量定价','shop.mjs':'read','forest-water.mjs':'read','medicine-state.mjs':'read','finance-tax.mjs':'read','finance-assets.mjs':'read','military.mjs':'read',
    'labor-market.mjs':'read','smuggling.mjs':'read','business.mjs':'read','npc-autonomy.mjs':'read',
    // S5 W4 F007/F058：押品、典当物、遗产与责任上限不再自己拿目录基价乘数量，统一经估值角色（valuation.mjs）取市场估值投影；
    // credit / transition / finance-bank 因此不再含价格字样，按本测试的规则从归类表删除。
    'bounty.mjs':'贿赂价码 = 涉案金额 × 廉洁度 × 立场，不读存量',
    'law.mjs':'偷窃涉案值取物品基价或参数金额，不读存量',
    'npc-crime.mjs':'涉案值取物品基价','extraction.mjs':'采得物价值取物品基价','boss-negotiation.mjs':'谈判礼物估值取参数数量 × 基价',
    'world-events.mjs':'事件价值取承诺数量 × 基价','elections.mjs':'赠礼拉票取礼物基价','transport.mjs':'关税与运费按托运单上的货物数量，不读库存（单据在 transport:* 账户）',
    'hazard-calendar.mjs':'灾害价格系数读时钟记录','magic-economy.mjs':'法术减价系数读月度记录','settlement-profile.mjs':'价格系数说明文字','war-diplomacy.mjs':'战时价格系数取规则常量',
    'medicine.mjs':'诊费 = 工钱参照 + 草药基价 × 预约占用率，不读存量',
    'water-cycle.mjs':'水价读水体水量，水不是账户资源（S5 生态）','wildlife.mjs':'野味价格读生灵种群数，种群账户化属 S5（R24 在改 wildlife）',
    'agriculture.mjs':'粮仓售粮 buy 属农业实现（R27 在改 agriculture），未动',
    'engine.mjs':'成交闸门 engine.quantity 与余额检查在 L0 引擎，L0 不能引用 L1 账户（会新增向上违例）；报价由 settlement-trade 与 shop 提供',
    'effects.mjs':'时钟效果转调 regionalTradePrice','stock.mjs':'价格输入读取接口本身（PRICE_POINTS）',
    // S5-01 / 15 §15.2: this is the primitive baseline/correction slot,
    // not another inventory-priced consumer. Market callers read the books.
    'derived.mjs':'economy:value 缺省基准取主体 basePrice 事实；只计算上下文基准与修正项，不自行读取库存或现款，供需由市场调用方经已登记账户读取',
};
const PRICE_WORDS=/basePrice|priceFactor|PriceFactor|regionalTradePrice|armySupplyQuote|tradeQuote|bribePrice/;
test('价格输入点登记：每个读取点有调用处，每处调用都已登记；含价格字样的模块都已归类',()=>{
    const used=new Map();
    for(const [file,text] of Object.entries(sources))for(const m of text.matchAll(/point:'([a-z]+\.[a-z]+)'/g))used.set(m[1],[...(used.get(m[1])??[]),file]);
    for(const point of Object.keys(PRICE_POINTS))assert.ok(used.has(point),`${point} 登记了但没有调用处`);
    for(const point of used.keys())assert.ok(Object.hasOwn(PRICE_POINTS,point),`${point} 有调用处但没有登记`);
    const touched=Object.entries(sources).filter(([file,text])=>PRICE_WORDS.test(text)&&!file.startsWith('consistency-')).map(([f])=>f);
    for(const file of touched)assert.ok(SURVEY[file],`${file} 含价格字样但没有归类：新增价格计算点必须改读账户并登记，或写明不读存量的理由`);
    for(const [file,status] of Object.entries(SURVEY)){assert.ok(sources[file],`${file} 不存在`);assert.ok(PRICE_WORDS.test(sources[file]),`${file} 已不含价格字样，从归类表里删掉`);}
    for(const [file,status] of Object.entries(SURVEY))if(status==='read')assert.match(sources[file],/priceRead|coinRead|bagStock/,`${file} 归为读账户却没有读取调用`);
    assert.throws(()=>priceRead(null,{point:'nope',account:'a|b|c',legacy:()=>0}),/未登记的价格输入点/);
});

test('读取规则：账本未开账或范围未开时读旧字段；开账后读账户余额与批次；探针记下两份读数',()=>{
    const probeLocal=createPriceProbe();probePriceReads(r=>probeLocal.record(r));
    try{
        const account='loc_x|item_oats|granary';
        const doc={state:{minute:0},ledger:{version:1,scopes:['coin'],accounts:{[account]:7},lots:{[account]:[{id:'a',qty:5,expiresDay:9,kind:'grain'},{id:'b',qty:2,expiresDay:3,kind:'grain'},{id:'c',qty:1,expiresDay:20,kind:'fresh'}]}}};
        assert.equal(priceRead(doc,{point:'region.grain',account,legacy:()=>99}),99,'库存范围未开账：读旧字段');
        doc.ledger.scopes=['coin','stock'];
        assert.equal(priceRead(doc,{point:'region.grain',account,legacy:()=>99}),7,'开账后读账户余额');
        assert.equal(priceRead(doc,{point:'region.grain',account,lots:{kind:'grain',after:5},legacy:()=>99}),5,'批次：类别相同且未过期');
        assert.equal(priceRead(draft(doc),{point:'region.grain',account,legacy:()=>99}),7,'草稿同样可读');
        assert.equal(priceRead({state:{}},{point:'region.grain',account,legacy:()=>99}),99,'没有账本分区：读旧字段');
        assert.equal(inMode('legacy',()=>priceRead(doc,{point:'region.grain',account,legacy:()=>99})),99,'旧字段模式');
        assert.deepEqual(probeLocal.mismatches.map(m=>[m.legacy,m.ledger]),[[99,7],[99,5],[99,7]],'探针只在开账时比较，新旧不等的读数被记下');
        assert.equal(probeLocal.hits['region.grain'],5,'旧字段模式不进探针；其余五次读取都登记');assert.equal(probeLocal.open['region.grain'],3,'只有账本已开账的三次读取参与新旧比较');
    }finally{probePriceReads(r=>probe.record(r));}
});

// ---- 推演夹具 ---------------------------------------------------------------------
test('区域材料报价覆盖新旧读取对照，已开户时不信过期库存字段',()=>{
    const {engine,doc}=campaignStock();doc.ledger=openLedger(engine,doc);
    const d=draft(doc),location='bld_hw_forge',item='item_iron';
    const price=regionalTradePrice(d,engine,item,location);
    assert.equal(inMode('legacy',()=>regionalTradePrice(d,engine,item,location)),price);
    const next=structuredClone(d.document);next.state.settlements.loc_hw.iron+=100000;
    probePriceReads(null);
    try{assert.equal(regionalTradePrice(draft(next),engine,item,location),price,'旧字段失真不能改变已开账的报价');}
    finally{probePriceReads(r=>probe.record(r));}
});
function campaignStock(){
    const w=structuredClone(world),h=host;
    for(const npc of w.npcs.filter(n=>n.id===h))npc.schedule={default:[{start:0,end:1440,location:inn,activity:'营业',services:['trade']}]};
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'ledger-price');
    doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=2000;
    Object.assign(doc.state.npcs[h],{location:inn,activity:'营业',status:'正常'});
    return {engine,doc};
}
function campaignMoney(){
    const w=structuredClone(world),placeOf={[host]:inn,[worker]:inn,[clerk]:post};
    for(const npc of w.npcs.filter(n=>placeOf[n.id]))npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:npc.id===host?['trade']:[]}]};
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'ledger-price-money');
    doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=600;
    for(const [id,location] of [[host,inn],[worker,inn],[clerk,post]])Object.assign(doc.state.npcs[id],{location,activity:'营业',status:'正常'});
    doc.state.npcs[host].inventory.item_ration=40;
    return {engine,doc};
}
// 归约一个事件：读账户模式（探针记数）；dual 时再用只读旧字段的模式归约一遍，补丁与结果必须逐项相等。
async function step(c,tool,args,eventId,{dual=true,allowFailure=false}={}){
    const before=c.doc;let out;
    try{out=await c.engine.reduce(before,{tool,args,eventId});}catch(e){if(allowFailure)return null;throw e;}
    if(dual){
        const old=await inModeAsync('legacy',()=>c.engine.reduce(before,{tool,args,eventId}));
        assert.deepEqual(out.patches,old.patches,`${eventId}：读账户与读旧字段的结算补丁不同`);
        assert.deepEqual(out.result,old.result,`${eventId}：读账户与读旧字段的结果不同`);
    }
    c.doc=applyPatches(before,out.patches);return out.result;
}
// 价格面：区域报价（含托管聚落粮价、非托管聚落粮价系数、木料林存量系数、水价、药价）、军需报价；
// 每次在文档的新克隆上算，两种模式各一遍，返回值与草稿补丁（报价缓存）都要相等。
function surface(c,mode){
    return inMode(mode,()=>{
        const d=draft(structuredClone(c.doc)),state=c.doc.state,settlements=Object.keys(state.settlements??{}),out={};
        // 非托管聚落的粮价系数只在聚落有日耗粮时才用到公仓粮（forest.food）；日耗只在克隆上补，粮仓存量不动。
        for(const row of Object.values(d.document.state.settlements??{})){if(!(row.foodPerDay>0))row.foodPerDay=5;if(row.granary===false)delete row.granary;}
        const items=['item_oats','item_wood','item_stone','item_iron','item_water','item_herb','item_bread','item_fish','item_rawhide'];
        for(const sid of settlements)for(const item of items)if(c.engine.byId.get(item))out[`${sid}/${item}`]=regionalTradePrice(d,c.engine,item,sid);
        for(const sid of settlements)for(const item of ['item_oats','item_wood'])out[`factor/${sid}/${item}`]=forestWaterPriceFactor(c.engine,d.document.state,item,sid,d);
        for(const sid of Object.keys(state.settlements??{}).slice(0,6))out[`army/${sid}`]=armySupplyQuote(d,c.engine,sid,sid,state.minute);
        return {out,patches:d.patches};
    });
}
function assertSurface(c,label){
    const ledgerSide=surface(c,'ledger'),legacySide=surface(c,'legacy');
    assert.deepEqual(ledgerSide,legacySide,`${label}：价格面读账户 ≠ 读旧字段`);
    assert.ok(Object.keys(ledgerSide.out).length>20,`${label}：价格面覆盖多个聚落与货品`);
    return ledgerSide;
}

test('价格双读对照：交易、借贷商税、受雇、钱庄、离屏推进（周贸易、俸禄、军队、补货、自治），读账户与读旧字段结算完全相同',{timeout:1800000},async()=>{
    const c=campaignMoney();
    // S5-02: four portions feed Lin Sui's two-person household (120/30),
    // and three must still be available for the original buy/resale chain.
    // This opening shelf is not under examination; both read modes share it.
    const prepared=applyIntentSetup(c.engine,c.doc,{facts:[{path:['state','npcs',host,'inventory','item_bread'],value:8}]});assert.deepEqual(prepared.setupUnmet,[]);c.doc=prepared.document;
    assertSurface(c,'开局（尚未开账，读旧字段）');
    // S5-02 / 15 §15.2: retain one day's food before reselling. Buying three
    // through the native action leaves the two reserved portions plus one sale;
    // the ledger-vs-mirror equality and all following conservation checks stay.
    await step(c,'world_trade',{seller:host,item:'item_bread',quantity:3},'buy');
    assert.ok(c.doc.ledger,'第一次归约开账');
    assertSurface(c,'交易之后');
    await step(c,'world_trade',{seller:'player',buyer:host,item:'item_bread',quantity:1},'sell-bread');// 玩家卖给店主：成交前库存进成本基准
    await step(c,'world_trade',{seller:host,item:'item_ration',quantity:40},'buy-ration');
    assert.ok(Object.values(c.doc.state.records).some(r=>r.category==='trade_tax'&&r.amount>0),'商税照常收取');
    // A3CR (3def293f), 产品原则二.4：借款须有出借人对实际报价条款
    // 的真实同意，调用者 consent:true 不再能代答。复用原生同意夹具，
    // 不注入借据、不改钱物；下方全部价格双读与账本守恒断言保持原样。
    c.doc=grantLoanConsent(c.engine,c.doc,{lender:host,principal:40,days:10,eventId:'loan-consent'});
    const loan=await step(c,'world_trade',{operation:'borrow',seller:host,coins:40,days:10},'loan');
    await step(c,'world_trade',{operation:'work',seller:worker,consent:true,minutes:240},'work');
    await step(c,'world_move',{destination:post},'to-post');
    await step(c,'world_trade',{operation:'deposit',seller:clerk,coins:50},'deposit');
    for(let i=0;i<6;i++)await step(c,'world_time',{minutes:DAY},`day-${i}`);
    await step(c,'world_move',{destination:inn},'to-inn');
    Object.assign(c.doc.state.npcs[host],{location:inn,activity:'营业',status:'正常'});
    await step(c,'world_trade',{seller:host,payment:'repay',debt:loan.debt},'repay');
    assertSurface(c,'借贷交易之后');
    await step(c,'world_time',{minutes:24*DAY},'offscreen');
    const r=reconcile(c.engine,c.doc);assert.deepEqual([r.mismatches,r.lots,r.drift,r.audit],[[],[],[],[]],'离屏推进后旧字段与账户仍一致');
    assertSurface(c,'离屏推进之后');
});

test('价格双读对照：制作、采集（钓鱼）之后的报价；农业季逐日推进（播种、生长、收获、腐坏、吃粮）与离屏推进',{timeout:3600000},async()=>{
    const c=campaignStock();
    // D05 §5.5 / S5-05：正式钓具、蚯蚓及非考查的制作条件经 setup 声明，不直接改库存/技能事实。
    const prepared=applyIntentSetup(c.engine,c.doc,{
        inventory:{item_wood:6,item_whittling_knife:1,item_bamboo_fishing_rod:1,item_earthworm_bait:10,item_kitchen_knife:1,item_water:10,item_oats:5},
        abilities:{skills:{skill_life_6_core:120},recipes:['recipe_wooden_pegs']},
        facts:[{path:['state','inventory','item_whittling_knife','durability'],value:80}],
    });
    assert.deepEqual(prepared.setupUnmet,[]);c.doc=prepared.document;
    await step(c,'world_trade',{seller:host,item:'item_bread',quantity:2},'buy');
    assertSurface(c,'交易之后');
    // D05 身体慢事实保留真实工时：移动、等待都走生产归约，不能瞬移或倒拨身体事实的 asOf。
    await step(c,'world_move',{destination:'bld_hw_mill'},'walk-craft');
    for(let i=0;i<3;i++)await step(c,'world_craft',{recipe:'recipe_wooden_pegs'},`craft-${i}`);
    const fishingAt=Math.floor(c.doc.state.minute/DAY)*DAY+600;
    await step(c,'world_time',{minutes:(fishingAt>c.doc.state.minute?fishingAt:fishingAt+DAY)-c.doc.state.minute},'wait-fishing');
    await step(c,'world_move',{destination:'loc_hw_dock'},'walk-fishing');
    for(let i=0;i<4;i++)await step(c,'world_field',{operation:'wildlife_fish'},`fish-${i}`);
    // 4竿各耗1份正式蚯蚓，10−4=6；不吞掉钓具/饵料等前提错误，保证采集对照确实执行。
    assert.equal(c.doc.state.inventory.item_earthworm_bait.quantity,6);
    const afterGather=assertSurface(c,'采集之后');
    // 农业季：逐日推进；每 10 天并在收获窗口附近把同一天用两种模式各归约一遍，并核对整张价格面。
    const harvested=()=>c.doc.state.records['agriculture:loc_hw']?.ledger?.harvested??0;
    let sawHarvest=false,priceChanged=false;
    for(let day=0;day<215;day++){
        const dual=day<3||day%10===0||harvested()>0&&!sawHarvest;
        await step(c,'world_time',{minutes:DAY},`day-${day}`,{dual});
        if(harvested()>0&&!sawHarvest){sawHarvest=true;assertSurface(c,`收获当日（第 ${day} 天）`);}
        if(dual&&day%10===0){const s=assertSurface(c,`第 ${day} 天`);if(JSON.stringify(s.out)!==JSON.stringify(afterGather.out))priceChanged=true;}
    }
    assert.ok(sawHarvest,'农业季内实际收获');assert.ok(priceChanged,'季内区域报价随粮仓存量变化（价格面有变化，对照不是空转）');
    await step(c,'world_time',{minutes:24*DAY},'offscreen');
    assertSurface(c,'农业季与离屏推进之后');
    const r=reconcile(c.engine,c.doc);assert.deepEqual([r.mismatches,r.lots,r.drift,r.audit],[[],[],[],[]],'旧字段与账户仍一致');
});

// ---- 定点用例：推演里碰不到的价格输入点 ----------------------------------------------------
// 每个用例在“读账户”与“只读旧字段”两种模式下各跑一遍，最终状态与账本逐项相等；探针同时核对新旧读数。
const bothModes=run=>{
    const a=inMode('ledger',run),b=inMode('legacy',run);
    assert.deepEqual(a,b,'读账户与读旧字段的最终状态不同');
    return a;
};

test('定点：药价读诊所医者行囊里的草药；排期积压抬高药价，读账户与读旧字段相同',async()=>{
    const CLINIC='bld_hw_herbs',DOCTOR='npc_hw_taozhi',HELPER='npc_hw_fanrong',PATIENT='npc_hw_linsui';
    const w=structuredClone(world);
    for(const id of [DOCTOR,HELPER,PATIENT]){const b=w.npcs.find(n=>n.id===id);b.schedule={default:[{start:0,end:1440,location:CLINIC,activity:'坐诊配药'}]};}
    w.npcs.find(n=>n.id===DOCTOR).proficiencies={...w.npcs.find(n=>n.id===DOCTOR).proficiencies,[MEDICAL_SKILL]:1500};
    const engine=new WorldEngine(w),doc=engine.initialFromLegacy({state:seed.state,memories:seed.memories},'ledger-price-medicine');
    Object.assign(doc.state,{minute:480,location:CLINIC});doc.state.player.coins=500;
    for(const id of [DOCTOR,HELPER,PATIENT])doc.state.npcs[id]={...doc.state.npcs[id],location:CLINIC,status:'正常',activity:'坐诊配药'};
    doc.state.npcs[DOCTOR].inventory={...doc.state.npcs[DOCTOR].inventory,item_herb:5};
    const ill={id:`illness_test_${PATIENT}`,patient:PATIENT,severity:'重',since:doc.state.minute-2*DAY,endsAt:doc.state.minute+10*DAY,status:'患病中',previousStatus:null,household:null,caregivers:[],fatality:{cared:.2,alone:.4}};
    doc.state.family={...doc.state.family,illnesses:{...doc.state.family?.illnesses,[ill.id]:ill}};Object.assign(doc.state.npcs[PATIENT],{status:'患病',coins:0});
    const c={engine,doc};
    await step(c,'world_time',{minutes:1},'book');
    c.doc={...c.doc,ledger:openLedger(engine,c.doc)};// 一分钟的归约没有转移，账本不开；这里按当前旧字段开账
    assert.ok(Object.values(c.doc.state.records).some(r=>r.category==='medicine_visit'&&r.status==='预约'),'已有预约');
    const priced=bothModes(()=>medicinePriceFactor(engine,c.doc.state,'item_herb',CLINIC,c.doc));
    assert.ok(priced>1,'排期积压抬高药价');assert.equal(medicinePriceFactor(engine,c.doc.state,'item_iron',CLINIC,c.doc),1);
    // 医者行囊的草药经归约变化后，药价随账户变化，仍与旧字段一致。
    await step(c,'world_time',{minutes:DAY},'visit');
    assert.equal(bothModes(()=>medicinePriceFactor(engine,c.doc.state,'item_herb',CLINIC,c.doc)),medicinePriceFactor(engine,c.doc.state,'item_herb',CLINIC));
});

test('定点：走私货款与货物读账户；过关关税税基读玩家行囊里的应税货物',async()=>{
    const A='npc_hw_linsui',G='npc_hw_gucen',w=structuredClone(world);
    for(const n of w.npcs){delete n.schedule;delete n.tier;}
    w.routes.push({id:'route_u15_checkpoint',from:'loc_hw_gate',to:'loc_hw_dock',lengthKm:.1,speedKmh:5,modes:['walk'],closedSeasons:[],toll:1,risk:0});
    w.rules.smuggling.checkpoints.push({route:'route_u15_checkpoint',location:'loc_hw_gate',guards:[G],taxBps:1500});
    w.routes.push({id:'route_ledger_toll',from:'loc_hw',to:'loc_bs',lengthKm:5,speedKmh:5,modes:['walk'],closedSeasons:[],toll:5,risk:0});
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'ledger-price-smuggle');doc.state.minute=600;doc.state.player.coins=5000;
    for(const n of Object.values(doc.state.npcs))Object.assign(n,{location:'loc_capital',activity:'闲谈',status:'正常'});
    doc.state.location='loc_hw_gate';Object.assign(doc.state.npcs[G],{location:'loc_hw_gate',activity:'当值',status:'正常'});Object.assign(doc.state.npcs[A],{location:'loc_hw_dock',activity:'当值',status:'正常',coins:1000});
    doc.state.inventory.item_ember_core={quantity:3,quality:w.items.find(i=>i.id==='item_ember_core').quality,durability:100};doc.state.player.attributes.敏捷=1000;
    const c={engine,doc};
    const s=await step(c,'world_trade',{operation:'smuggle',seller:A,item:'item_ember_core',quantity:2,location:'loc_hw_dock'},'load');
    await step(c,'world_move',{destination:'loc_hw_dock'},'cross');
    const out=await step(c,'world_trade',{operation:'deliver_smuggled',seller:A,contract:s.shipment},'deliver');
    assert.equal(out.success,true);assert.ok(out.paid>0);
    // 关税：带应税货物走过有岗哨的路段，税基 = 超出个人免税额的货物基价。
    const r=reconcile(engine,c.doc);assert.deepEqual([r.mismatches,r.drift],[[],[]]);
    c.doc.state.inventory.item_oats={quantity:30,quality:w.items.find(i=>i.id==='item_oats').quality,durability:100};resyncBooks(engine,c.doc);
    const runTariff=()=>{const d=draft(structuredClone(c.doc));collectRouteTariffs(d,engine,{edges:['route_ledger_toll']},'tariff-test');return {patches:d.patches,doc:d.document};};
    const tariff=bothModes(runTariff);
    assert.ok(Object.values(tariff.doc.state.records).some(row=>row.category==='tariff_passage'&&row.value>0),'关税税基大于零');
});

test('定点：补货工读供货人库存与雇主现款；自治交易读卖方库存与买方现钱',()=>{
    const mill='bld_hw_mill',host='npc_hw_linsui',worker='npc_hw_ayan',clerk='npc_hw_shendu';
    const labor=()=>{
        const f=financeFixture({at:mill});f.doc.state.npcs[worker].coins=0;f.doc.state.npcs[worker].proficiencies={skill_life_6_core:600};f.doc.state.npcs[host].coins=5000;
        f.doc.state.npcs[host].inventory={item_bread:{quantity:20},item_wood:{quantity:100},item_whittling_knife:{quantity:1,durability:100}};
        f.e.byId.get(mill).workstations.find(x=>x.kind==='woodworking').fee=0;
        f.w.households.find(h=>h.members.includes(worker)).homeLocation=mill;
        f.doc.state.npcs[host].workplace={location:mill};f.doc.state.npcs[worker].inventory={item_whittling_knife:{quantity:1,durability:100}};
        f.doc.state.npcs[clerk].inventory.item_bread={quantity:40};f.e.byId.get(clerk).services=['trade'];
        const store=f.e.rules.economy.shops.stores.find(x=>x.keeper===host);
        for(const r of store.restock)f.doc.state.npcs[host].inventory[r.item]={quantity:r.item==='item_bread'?0:r.maximum};
        f.doc.ledger=openLedger(f.e,f.doc);
        const advance=after=>{const before=f.doc.state.minute,beforeState=structuredClone(f.doc.state),d=f.draft();d.set(['state','minute'],after);
            advanceNpcSchedules(d,f.e,before,after);advanceLaborMarket(d,f.e,{before,after,id:`labor:${after}`,beforeState});d.done();};
        advance(DAY);
        const job=Object.values(f.doc.state.records).find(r=>r.laborMarket===1&&r.kind==='workshop'&&r.worker===worker);
        advance(job.nextWork);
        return {job:job.id,supplier:job.supplier,after:f.doc.state.records[job.id],state:f.doc.state,ledger:f.doc.ledger};
    };
    const done=bothModes(labor);assert.ok(done.supplier,'补货工找到了供货人');assert.ok(done.after.produced>0,'补货工实际补了货');
    // 自治交易（npc-autonomy）：卖方库存与买方现钱的闸门。
    const actor='npc_hw_ayan',seller='npc_hw_linsui',item='item_bread';
    const autonomy=()=>{
        const w=structuredClone(world),engine=new WorldEngine(w),document=engine.initialFromLegacy(seed,'ledger-price-autonomy');document.state.minute=540;document.state.location='loc_capital';
        const d=draft(document);d.set(['state','minute'],600);
        for(const id of [actor,seller]){w.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:'bld_hw_qingdeng',activity:'日常活动',services:id===seller?['trade']:[]}]};
            d.set(['state','npcs',id,'location'],'bld_hw_qingdeng');d.set(['state','npcs',id,'activity'],'日常活动');d.set(['state','npcs',id,'status'],'正常');}
        d.document.ledger=openLedger(engine,d.document);
        const plan={kind:'npc-plan',version:1,minute:600,stateFingerprint:npcPlanFingerprint(d.document),proposals:[{npc:actor,actions:[{kind:'trade',seller,item,quantity:1}]}]};
        const result=applyNpcPlan(d,engine,plan,'trade');
        while(d.get('state','minute')<605){const until=Math.min(605,nextNpcAutonomyMinute(d.get('state'),d.get('state','minute'))),before=d.get('state','minute'),snapshot=structuredClone(d.get('state'));
            d.set(['state','minute'],until);engine.npcScheduleReservations=new Set(Object.keys(snapshot.npcs).filter(id=>npcAutonomyBusy(snapshot,id,before)||snapshot.npcs[id].cognitionTravel));
            advanceNpcSchedules(d,engine,before,until);engine.npcScheduleReservations=undefined;advanceNpcAutonomy(d,engine,before,until,'advance',{beforeState:snapshot});}
        return {result:result.results[0].status,state:d.document.state,ledger:d.document.ledger};
    };
    assert.equal(bothModes(autonomy).result,'进行中');
});

test('定点：公共工程读村公库与公仓材料（公款）、玩家现款与自备材料（私资）',()=>{
    const sid='loc_bs_yupo',site='loc_yp_path';
    const run=()=>{
        const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}delete w.rules.weather;
        const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'ledger-price-projects'),d=draft(doc);
        engine.airDraft=d;d.set(['state','location'],site);d.set(['state','minute'],600);
        // F083: one person can be on only one works crew, so the private project gets the third villager as its own crew.
        const coordinators=w.settlementProfiles.find(p=>p.id===sid).details.governance.coordinators,workers=coordinators.slice(0,2),privateCrew=coordinators.slice(2,3);
        for(const id of coordinators)d.set(['state','npcs',id],{...d.get('state','npcs',id),location:site,status:'正常',activity:'议事'});
        d.set(['state','records','governance_office:fixture'],{category:'governance_office',holder:'player',office:'office_village_head',settlement:sid,status:'在任',appointedAt:0,until:100*DAY,appointedBy:'fixture'});
        d.set(['state','settlements',sid,'treasury'],100000);d.set(['state','settlements',sid,'wood'],1000);d.set(['state','settlements',sid,'stone'],1000);
        const add=(id,extra={})=>{const base={id,name:id,type:'bld',parent:site,scope:sid,owner:sid,facilityType:'house',material:'wood',position:[0,0],access:{mode:'public'},...extra};d.set(['state','created',id],base);return id;};
        const start=(extra={},id='work')=>startPublicProject(d,engine.scoped(d.document),{name:'设施工程',days:3,wood:12,stone:8,workers,consent:true,plot:site,...extra},id,sid);
        const pub=add('bld_test_clinic',{facilityType:'clinic'}),own=add('bld_test_private',{owner:'player'});
        damageFacility(d,engine,pub,80,{sourceEvent:'ruin'});d.set(['state','buildings',own],{owner:'player',condition:10});d.set(['state','player','coins'],500);
        d.set(['state','inventory','item_wood'],{quantity:50});d.set(['state','inventory','item_stone'],{quantity:50});
        d.document.ledger=openLedger(engine,d.document);// 夹具设好之后开账
        const a=start({building:pub,action:'repair'},'public'),b=start({funding:'private',building:own,action:'repair',workers:privateCrew,days:12},'private');
        return {a:a.project,b:b.project,state:d.document.state,ledger:d.document.ledger};
    };
    const done=bothModes(run);assert.ok(done.a&&done.b,'公款与私资两个工程都立项');
});

test('定点：组织股份估值读发行方现款与库存；成本基准读买方成交前的库存',async()=>{
    const run=async()=>{
        const f=financeFixture(),issuer=f.w.factions[0],buyer=f.w.factions[1],rep=issuer.leader;
        delete f.e.byId.get(rep).schedule;f.doc.state.npcs[rep]={coins:50,status:'正常',location:'bld_hw_post',activity:'营业',memoryStream:[]};
        issuer.resources.items??={};issuer.resources.items.item_wood=20;
        const setup=f.draft();ensureGroupAccount(setup,f.e,buyer.id);setup.done();
        f.doc.ledger=openLedger(f.e,f.doc);
        const own=await f.act({operation:'invest',business:issuer.id,seller:rep,quantity:1,consent:true},'group');
        const sale=await f.act({seller:'npc_hw_linsui',item:'item_bread',quantity:3},'bread');
        return {own,sale,state:f.doc.state,ledger:f.doc.ledger};
    };
    setPriceReadMode('ledger');const a=await run();setPriceReadMode('legacy');let b;try{b=await run();}finally{setPriceReadMode('ledger');}
    assert.deepEqual(a,b,'读账户与读旧字段的最终状态不同');assert.ok(a.own.contract,'股份契约成立');
});

test('定点：商店补货读货架、店主现钱与来源聚落库存（本地、路货、聚落调拨）',async()=>{
    const town='loc_bs',smith='npc_hw_duanyan',host='npc_hw_linsui',merchant='npc_hw_yanzhe';
    const placeOf={[host]:inn,[smith]:'bld_hw_forge',[merchant]:town};
    const run=async()=>{
        const w=structuredClone(world),engine=new WorldEngine(w),doc=engine.initialFromLegacy(seed,'ledger-price-restock');
        doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=500;
        for(const [id,loc] of Object.entries(placeOf))doc.state.npcs[id]={...doc.state.npcs[id],coins:200,location:loc,activity:'营业',status:'正常',goals:{},memoryStream:[]};
        for(const npc of w.npcs.filter(n=>placeOf[n.id])){delete npc.tier;npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:['trade']}]};}
        doc.state.settlements[town]={...structuredClone(doc.state.settlements.loc_hw),name:'白石镇',population:1000,treasury:900};
        doc.state.settlements.loc_hw.iron=5;doc.state.npcs[smith].inventory.item_iron=0;
        const c={engine,doc};
        await step(c,'world_trade',{seller:host,item:'item_ration',quantity:4},'buy-ration',{dual:false});// 第一次归约开账，之后三天的补货（本地、路货、聚落调拨）读账户
        for(let i=1;i<=3;i++)await step(c,'world_time',{minutes:DAY},`day${i}`,{dual:false});
        return {state:c.doc.state,ledger:c.doc.ledger};
    };
    setPriceReadMode('ledger');const a=await run();setPriceReadMode('legacy');let b;try{b=await run();}finally{setPriceReadMode('ledger');}
    assert.deepEqual(a,b,'读账户与读旧字段的最终状态不同');
});

test('探针汇总：开账之后每个价格输入点的新旧读数逐点相等，并且被推演到',()=>{
    assert.deepEqual(probe.mismatches,[],'新旧读数分叉');
    const covered=Object.keys(PRICE_POINTS).filter(p=>(probe.open[p]??0)>0),missing=Object.keys(PRICE_POINTS).filter(p=>!covered.includes(p));
    if(process.env.PRICE_DEBUG)console.log(JSON.stringify({hits:probe.hits,open:probe.open,missing}));
    // 铺面经营的顾客预算要先租铺面开张，夹具太重，由 tests/business-contracts.test.mjs 在探针预加载下逐点核对（4 次读取，0 分叉）。
    const ELSEWHERE=new Set(['business.cash']);
    for(const p of ELSEWHERE)assert.ok(Object.hasOwn(PRICE_POINTS,p));
    assert.deepEqual(missing.filter(p=>!ELSEWHERE.has(p)),[],`这些价格输入点在推演中没有被开账读到：${missing}`);
});
