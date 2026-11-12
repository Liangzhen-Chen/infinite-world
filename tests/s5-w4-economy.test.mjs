// S5 收口 W4：经济守恒接线。每项一条手算锚点；测试前提用真实游戏动作产生（移动、投资、典当、出租、营业、等待）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fixture,cash,clerk,host,worker,post,DAY} from './helpers/finance.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyConsentEvent} from '../server-plugin/action-consent.mjs';
import {borrowerTerms} from '../server-plugin/finance-bank.mjs';
import {settleFinancialClaim} from '../server-plugin/finance-bank.mjs';
import {transfer,declareLedgerWriter,emptyLedger} from '../server-plugin/ledger.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {customerPurseShare,marketQuote,quoteSupply,customerReachMinutes,saleableStock} from '../server-plugin/market.mjs';
import {householdBudget,householdDailyUse} from '../server-plugin/household-budget.mjs';
import {personHousehold} from '../server-plugin/entity-view.mjs';
import {npcDecision} from '../server-plugin/npc-decision.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {currentShops} from '../server-plugin/shop.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {valuation,holdingValuation} from '../server-plugin/valuation.mjs';
import {creatureTraits} from '../server-plugin/traits.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const mill='bld_hw_mill';
const move=(f,destination,id)=>f.act({destination},id,'world_move');

// ---------------------------------------------------------------- F048
test('F048 分红：收付双方不在场时不凭空转账，形成到期应付；当面追收后结清且保留“分红”子类型',async()=>{
    const f=fixture(),total=cash(f.doc);
    // 不增添玩家或商户存货：只把夹具原有100木料收窄到可背的13份（26kg），去掉本例不用的食品。
    // 店主原无木料成本批次，真实收购后再转售，保留FIFO与分红断言。
    f.doc=applyIntentSetup(f.e,f.doc,{facts:[{path:['state','inventory'],value:{item_wood:{quantity:13}}}]}).document;
    // 公共木料S28、D1，稀缺下限.5；报价4×.5×.6=1.2，议价带[.9,1.1]的整数边界均ceil为2，5份实付10铜。
    const acquired=await f.act({buyer:host,seller:'player',item:'item_wood',quantity:5,unitPrice:2},'stock');assert.equal(acquired.cost,10);
    // EC-1a 共灶后规律（market.mjs saleableStock → household-budget.mjs reserveUpkeep）：店主户（林穗+阿燕共灶）的家用燃料按“日用量×交易周期（economy.tradeCycleDays=7）”留在家里，
    // 留存件数 = min(存量, ceil(日用件数×周期))，从可售量里扣除。刚收购的 5 份全落在留存里：存量5、upkeep5、可售0，转售会被拒（这是规律本身，不是缺陷）。
    // 前置核对（全部从引擎读出）：户员、日用量、留存目标 reserve=ceil(日用×周期)；收购 5 份后可售量为 0。
    const stockOf=()=>saleableStock(f.e.primitiveDraft(f.doc),f.e,host,'item_wood',{business:true});
    const members=personHousehold(f.e,f.doc.state,host).value.members.filter(m=>f.doc.state.npcs[m]);
    const reserve=Math.ceil(householdDailyUse(f.e,f.doc.state,members,'item_wood')*f.e.rules.economy.tradeCycleDays);
    assert.ok(members.includes(worker)&&reserve>5,'precondition: the keeper household cooks together and its fuel reserve exceeds the 5 just bought');
    assert.deepEqual([stockOf().stock,stockOf().upkeep,stockOf().available],[5,5,0],'precondition: after buying 5 the saleable quantity is 0 (all of it is the household fuel reserve)');
    // 要转售 5 份，店主得先有 reserve+5 份：再收购 reserve 份（按 5 份一批、余数一批，各 ≤5 即零售口径）。
    // 第 2 批：S33、net=-5、opening28，深度1−.2×5/28；报价4×.5×.9643×.6≈1.157，整数边界 ceil(.9×1.157)=ceil(1.04)=2、ceil(1.1×1.157)=2，5份实付10铜。
    // 第 3 批（余数 reserve−5 份）：net=-10、深度1−.2×10/28，报价≈1.114；.9×1.114≈1.003、1.1×1.114≈1.23，整数边界为 [1或2, 2]，单价2必合法，每份2铜。
    // 三批合计 5+5+(reserve−5)=reserve+5 份，成本批次按先进先出：最早一批 5 份成本 10。
    const second=await f.act({buyer:host,seller:'player',item:'item_wood',quantity:5,unitPrice:2},'stock-2');assert.equal(second.cost,10);
    const third=await f.act({buyer:host,seller:'player',item:'item_wood',quantity:reserve-5,unitPrice:2},'stock-3');assert.equal(third.cost,2*(reserve-5));
    assert.deepEqual([stockOf().stock,stockOf().upkeep,stockOf().available],[reserve+5,reserve,5],'precondition: reserve+5 in stock, reserve kept, exactly 5 saleable');
    const own=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'invest');
    // 收购 reserve+5=11 份后S39、net=-11、opening28，深度1−.2×11/28≈.9214；报价4×.5×.9214×.99895≈1.841，整数上界ceil(报价×1.1)=ceil(2.03)=3。
    // 按合法单价3零售最早的5份，实收15铜；日成交 11+5=16≤开市28。
    const sale=await f.act({seller:host,item:'item_wood',quantity:5,unitPrice:3},'sale');assert.equal(sale.cost,15);
    const tax=f.doc.state.records['trade_tax:sale:commercial']?.amount??0;
    // 收入15、FIFO成本10，减实际商税；分红floor((15−10−税)×20%)。
    const due=Math.floor((15-10-tax)*20/100);assert.ok(due>=1);
    await move(f,mill,'away');
    const playerBefore=f.doc.state.player.coins,hostBefore=f.doc.state.npcs[host].coins;
    f.tick(f.doc.state.records[own.contract].nextDividend);
    // 玩家在磨坊、东家在驿站：钱没有凭空到账，东家仍握着这笔钱，账上是一笔真实应付。
    assert.equal(f.doc.state.player.coins,playerBefore);assert.equal(f.doc.state.npcs[host].coins,hostBefore);
    const pay=f.doc.state.records[own.contract].payments.at(-1);
    assert.deepEqual([pay.paid,pay.owed],[0,due]);assert.equal(f.doc.state.records[own.contract].distributed,due);
    const claim=f.doc.state.records[pay.claim];
    assert.deepEqual([claim.kind,claim.debtor,claim.creditor,claim.amount,claim.paid],['dividend',host,'player',due,0]);
    assert.equal(cash(f.doc),total);
    await move(f,post,'back');
    await f.act({operation:'collect',seller:host,debt:pay.claim,consent:true},'collect-dividend');
    assert.equal(f.doc.state.player.coins,playerBefore+due);assert.equal(f.doc.state.npcs[host].coins,hostBefore-due);
    assert.equal(f.doc.state.records[pay.claim].status,'已还清');
    assert.equal(f.doc.state.records[pay.claim].kind,'dividend','F085：通用清偿写回不覆盖业务子类型');
    assert.equal(cash(f.doc),total);
});

test('F048 租金：房客与业主不在同处时不转账，形成应付且不因业主缺席被立案；回到房客面前追收清偿',async()=>{
    const f=fixture({at:mill}),building=f.e.byId.get(mill);building.purpose='私宅';f.doc.state.buildings[mill]={owner:'player',condition:100};
    const oldHome=f.doc.state.npcs[worker].home?.location??null;void oldHome;
    f.doc.state.buildings[f.e.byId.get(worker).home?.location??mill]={...f.doc.state.buildings[f.e.byId.get(worker).home?.location??mill],condition:0};
    const total=cash(f.doc),r=await f.act({operation:'rent_out',seller:worker,location:mill,days:90,consent:true},'rent');
    // 手算：住房月租 = rentalCopperPerWeek 35 × 4 = 140；第二个月到期时租期还剩 60 天，故整月 140 铜。
    assert.equal(r.rent,140);
    await move(f,post,'away');
    const tenantBefore=f.doc.state.npcs[worker].coins,playerBefore=f.doc.state.player.coins;
    f.tick(f.doc.state.minute+31*DAY);
    const debt=Object.entries(f.doc.state.records).find(([,x])=>x.kind==='rent'&&x.category==='debt');
    assert.ok(debt,'应形成租金应付');
    assert.deepEqual([debt[1].amount,debt[1].paid,debt[1].debtor,debt[1].creditor],[140,0,worker,'player']);
    assert.equal(f.doc.state.npcs[worker].coins,tenantBefore);assert.equal(f.doc.state.player.coins,playerBefore);
    // 业主不在不是房客违约：再过很久也不立案。
    f.tick(f.doc.state.minute+40*DAY);assert.equal(f.doc.state.records[debt[0]].defaulted,undefined);
    await move(f,mill,'return');
    await f.act({operation:'collect',seller:worker,debt:debt[0],consent:true},'collect-rent');
    assert.equal(f.doc.state.records[debt[0]].status,'已还清');assert.equal(f.doc.state.records[debt[0]].kind,'rent');
    assert.equal(f.doc.state.player.coins,playerBefore+140);assert.equal(cash(f.doc),total);
});

// ---------------------------------------------------------------- F007 / F058
test('F007 典当按整批清算估值而非目录基价，预支率 50%',async()=>{
    const f=fixture();await f.act({operation:'deposit',seller:clerk,coins:10},'dep');
    const p=await f.act({operation:'pawn',seller:clerk,item:'item_bread',quantity:10,days:1},'pawn');
    // S=20、D=24，10>零售阈值5：清算值floor(2×24×ln(30/20))=floor(19.46)=19；预支floor(19×.5)=9。
    // （目录基价口径会得到 2 × 10 × 0.5 = 10 铜。旧锚点 D=18 → 14 → 7。）
    // 新 D=24：同聚落非商家持有人的留存之和 玩家3+申杜4+阿衍8+陈柏4+顾岑5；变化来自面包饱腹改推导（30→16，每口留存 ceil(60/16)=4 份，c0a7ea22，PLAN.md:584、591③）。
    // 供给 S=20（supplyApart 去掉持有人自己那批后，林穗店面包）不变。李白 11-11 (a)（PLAN.md:540）。
    // 证据：F:/dnd/docs/审查记录/市场价格-探针输出-mkt-5.txt，复算 市场价格-独立复算-A.md、-B.md（s5-w4-economy-3：principal 9、pledgeValue 19）。断言仍为精确相等。
    assert.equal(f.e.rules.economy.credit.pawn.advanceRatio,0.5);
    assert.equal(p.principal,9);
    assert.equal(f.doc.state.records[p.contract].pledgeRecord&&f.doc.state.records[f.doc.state.records[p.contract].pledgeRecord].value,19,'押品值 = 清算估值');
});

// ---------------------------------------------------------------- F085
test('F085 玩家放贷经通用追收清偿后，业务子类型 player_loan 不丢',async()=>{
    const f=fixture(),total=cash(f.doc);
    const grant=(from,scope,subject,terms,eventId)=>{const d=f.draft();applyConsentEvent(d,{engine:f.e,document:d.document},{actor:from,eventId,verb:'consent_given',to:'player',payload:{scope,subject,purpose:['player',subject],terms,until:d.get('state','minute')+10}});d.done();};
    const d=f.draft(),quote=borrowerTerms(d,f.e,host,100,10);d.done();
    grant(host,'loan','player',{principal:100,days:10,interest:quote.interest},'offer');
    const loan=await f.act({operation:'lend',seller:host,coins:100,days:10,interest:quote.interest,quantity:2},'lend');
    assert.equal(f.doc.state.records[loan.debt].kind,'player_loan');
    // 通用清偿运行时（债务人当面还一部分）写回旧记录时，业务子类型 player_loan 是原始事实，不能被规范种类 loan 覆盖。
    const d2=f.draft();settleFinancialClaim(d2,f.e,{claim:loan.debt,payer:host,actor:host,amount:20},'direct-settle');d2.done();
    assert.equal(f.doc.state.records[loan.debt].paid,20);
    assert.equal(f.doc.state.records[loan.debt].kind,'player_loan','通用清偿运行时写回也不覆盖子类型');
    assert.equal(cash(f.doc),total);
});

// ---------------------------------------------------------------- F071
test('F071 批次转移保留原始入库日与保质期，转入方的批次说明不能刷新它',()=>{
    declareLedgerWriter('w4-test',{sources:{'src:regrowth':{'*':100}},sinks:['sink:consume']});
    const g='loc_x|item_oats|granary',h='loc_y|item_oats|granary',bag='player|item_oats|inventory';
    const d={document:{state:{minute:40*DAY},ledger:emptyLedger()},patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
        set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);}};
    transfer(d,{from:'src:regrowth|item_oats|harvest',to:g,amount:30,writer:'w4-test',lot:{id:'old',day:3,expiresDay:20,kind:'grain'}});
    // 旧粮转进另一座粮仓，对方给的批次说明是“今天入库、一百八十天后到期”：原始入库日与到期日不变，只有编号按说明改。
    transfer(d,{from:g,to:h,amount:10,writer:'w4-test',lot:{id:'renamed',day:40,expiresDay:220,kind:'grain'}});
    assert.deepEqual(d.document.ledger.lots[h],[{id:'renamed',qty:10,day:3,expiresDay:20,kind:'grain'}]);
    // 行囊不分批次：从行囊转入的粮没有原始事实可带，按说明新开批次（这才是“今天入库”）。
    transfer(d,{from:g,to:bag,amount:5,writer:'w4-test'});
    transfer(d,{from:bag,to:g,amount:5,writer:'w4-test',lot:{id:'donation',day:40,expiresDay:220,kind:'grain'}});
    assert.deepEqual(d.document.ledger.lots[g].find(l=>l.id==='donation'),{id:'donation',qty:5,day:40,expiresDay:220,kind:'grain'});
    assert.equal(d.document.ledger.lots[g].reduce((n,l)=>n+l.qty,0),d.document.ledger.accounts[g]);
});

// ---------------------------------------------------------------- F014
test('F014 顾客钱袋比例来自数值参数表：改参数就改变谁买得起书，代码里没有写死的 1/4',async()=>{
    assert.equal(customerPurseShare(new WorldEngine(world)),0.25);
    const skill=p=>({proficiency:p,breakthroughs:[],daily:{}});
    async function publishWith(share){
        const w=structuredClone(world);
        Object.defineProperty(w,'balance',{value:{...world.balance,economy:{...world.balance.economy,params:world.balance.economy.params.map(p=>p.id==='shop.customerPurseShare'?{...p,value:share}:p)}},enumerable:false,writable:true,configurable:true});
        const engine=new WorldEngine(w),c=engine.initialFromLegacy({state:seed.state,memories:seed.memories},'w4-share');
        c.state.location='bld_hw_school';c.state.player.coins=500;c.state.skills.skill_literacy=skill(300);
        // E 卡：出版每册耗 1 纸 1 墨；印费 80÷4=20 册，原 10 纸 5 墨供写稿之外另备 20 纸 20 墨。
        c.state.inventory.item_parchment={quantity:30,quality:'木',durability:100,weight:0.06};c.state.inventory.item_soot_ink={quantity:25,quality:'木',durability:100,weight:0.1};
        const reader='npc_hw_chenbai';
        for(const [id,npc] of Object.entries(c.state.npcs))npc.coins=0;
        Object.assign(c.state.npcs[reader],{location:'bld_hw_school',status:'正常',activity:'闲坐',coins:50,skills:{...c.state.npcs[reader].skills,skill_literacy:skill(300)}});
        const run=async(args,id)=>{const out=await engine.reduce(c,{tool:'world_research',args,eventId:id});return {document:applyPatches(c,out.patches),result:out.result};};
        let wrote=null;for(let i=0;i<120&&!wrote;i++){const r=await run({operation:'write',name:'河湾农事札记',concept:'记河湾村一年的播种与收成',minutes:240},`write_${i}`);if(r.result.success&&r.result.quality==='普通')wrote=r;}
        assert.ok(wrote);
        const out=await engine.reduce(wrote.document,{tool:'world_research',args:{operation:'publish',project:wrote.result.work,coins:80},eventId:'pub'});
        return out.result;
    }
    // 书价 round(8 × 普通做工 1) = 8 铜；读者钱袋 50。
    const quarter=await publishWith(0.25),tenth=await publishWith(0.1);
    // 0.25：⌊50 × 0.25⌋ = 12 ≥ 8，买得起，经 NPC 决策路径愿买；0.1：⌊50 × 0.1⌋ = 5 < 8，买不起。
    assert.deepEqual([quarter.buyers,quarter.sold,quarter.income],[['npc_hw_chenbai'],1,8]);
    assert.deepEqual([tenth.buyers,tenth.sold,tenth.income],[[],0,0]);
});

// ---------------------------------------------------------------- F043
test('F043 捐粮：仓里放不下的部分在交割处损毁；回执分“实收/损毁”，捐赠账与贡献只计实收',async()=>{
    const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'w4-donate');
    const p=world.rules.agriculture.settlements.find(row=>row.settlement==='loc_hw'),r=doc.state.records['agriculture:loc_hw'];
    doc.state.location=p.counter;doc.state.npcs[p.manager].location=p.counter;doc.state.npcs[p.manager].activity='办公';
    doc.state.inventory.item_oats={quantity:100};
    // 非考查前提：粮仓只剩 10 份空位（仓容 = 现存食粮 + 种粮 + 10）。
    r.granary.capacity=doc.state.settlements.loc_hw.food+r.field.seedBank+10;
    const donatedBefore=r.ledger.donated;
    const out=await engine.reduce(doc,{tool:'world_farm',args:{operation:'donate',settlement:'loc_hw',quantity:30},eventId:'big-donation'});
    const after=applyPatches(doc,out.patches),result=out.result;
    // 手算：交 30 份、空位 10 份 → 实收 10、交割损毁 20；每 5 份记 1 点贡献 → ⌊10 ÷ 5⌋ = 2 点（若按 30 份计会是 6 点）。
    assert.deepEqual([result.quantity,result.accepted,result.destroyed],[30,10,20]);
    assert.equal(result.contribution.points,2);
    assert.equal(after.state.records['agriculture:loc_hw'].ledger.donated-donatedBefore,10);
    assert.equal(after.state.inventory.item_oats.quantity,70);
    assert.equal(after.ledger.flows['sink:destroy|item_oats|overflow']-(doc.ledger?.flows?.['sink:destroy|item_oats|overflow']??0),20);
});

// ---------------------------------------------------------------- F072
test('F072 放归的是被选中的那一尾，行囊里别的活鱼原样留着',async()=>{
    const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'w4-fish');
    const fish=world.monsters.filter(s=>s.wildlife&&creatureTraits(s).tags.includes('fish'));
    const habitat=world.rules.wildlife.habitats.find(h=>fish.some(s=>initial.state.records[`ecology:${h.id}`]?.populations[s.id]?.count>0));
    const rule=world.rules.extraction.fishing;
    let doc=applyIntentSetup(engine,initial,{location:habitat.location,inventory:{[rule.tool]:1,[rule.bait.item]:rule.bait.quantity*6,item_water:2},facts:[
        {path:['state','player','attributes'],value:{...initial.state.player.attributes,'敏捷':30,'智慧':30}}]}).document;
    const run=async(tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});doc=applyPatches(doc,out.patches);return out.result;};
    const caught=[];
    for(let i=0;i<12&&caught.length<2;i++){const r=await run('world_field',{operation:'wildlife_fish'},`cast-${i}`);if(r.success)caught.push(r.obtained[0].instances[0]);}
    assert.equal(caught.length,2,'两尾都是真实钓上来的');
    const [first,second]=caught;
    assert.deepEqual(doc.state.inventory.item_live_fish.instances,[first,second]);
    await run('world_field',{operation:'wildlife_release',target:second},'release-second');
    assert.equal(doc.state.itemInstances[second].status,'已放归');
    // 旧写法扣“第一尾”、把标记打在被选中的那尾上：第一尾会凭空消失。
    assert.equal(doc.state.itemInstances[first].status,'持有');assert.equal(doc.state.itemInstances[first].owner,'player');
    assert.deepEqual(doc.state.inventory.item_live_fish.instances,[first]);assert.equal(doc.state.inventory.item_live_fish.quantity,1);
});

// ---------------------------------------------------------------- F075
test('F075 研究法术：阶段不得低于原型（不能低阶价登记高阶强度），强度边界按实际阶段已实现的同族法术派生',async()=>{
    const engine=new WorldEngine(world);
    const skill=p=>({proficiency:p,breakthroughs:[],daily:{}});
    const base=world.spells.find(s=>s.id==='spell_fire_08');// 焰矢：一阶伤害法术，强度 16，原型 mp 15
    assert.deepEqual([base.stage,base.effectSpec.kind,base.effectSpec.power,base.mp],[1,'damage',16,15]);
    const c=engine.initialFromLegacy({state:seed.state,memories:seed.memories},'w4-research');
    const role=engine.byId.get(base.skill).profession;
    if(engine.byId.get(role)?.kind==='life')c.state.professions.life=[role];else c.state.professions.combat=role;
    c.state.location='bld_hw_school';c.state.player.coins=1000;c.state.player.attributes.智力=100;c.state.player.attributes.精神=100;
    for(const m of base.materials)c.state.inventory[m.item]={quantity:10,quality:'?',durability:100,weight:0.1};
    c.state.skills[base.skill]=skill(2400);c.state.skills.skill_literacy=skill(600);
    c.state.projects.research_test={id:'research_test',type:'研究',name:'低阶高伤',concept:'以既有原语研究伤害',skills:[base.skill],stage:'打磨',progress:3,days:[0,1,2],result:null};
    const create=(data,id)=>engine.reduce(c,{tool:'world_create',args:{type:'spell',name:'低阶高伤',project:'research_test',data:{template:base.id,...data}},eventId:id});
    const band=world.rules.magic.stageMpRanges[0];
    // 旧写法：把阶段压到 0、消耗压到 0 阶下限 1，强度仍按原型强度 16 兜底，于是一阶的 16 点伤害能以 1 点法力登记。
    assert.equal(band[0],1);
    await assert.rejects(create({spec:JSON.stringify({stage:0,mp:band[0]})},'low-stage'),/阶段不得低于原型/);
    // 阶段与原型相同、强度不超过该阶已实现的同族最大强度：可以登记；多一点就不行。
    const ceiling=Math.max(...world.spells.filter(s=>s.stage<=base.stage&&s.effectSpec?.kind==='damage').map(s=>s.effectSpec.power));
    assert.equal(ceiling,base.effectSpec.power,'原型本身就是该阶已实现的最大强度');
    await assert.rejects(create({power:ceiling+1},'over'),/强度/);
    const ok=await create({power:ceiling},'ok');assert.ok(ok.result.entity);
});

// ---------------------------------------------------------------- F026 客流
async function openShop({coins={},bread={},campaignSeed='w4-flow'}={}){
    const landlord='npc_hw_linsui',place='bld_hw_qingdeng';
    const engine=new WorldEngine(structuredClone(world)),initial=engine.createCharacter(seed,{},campaignSeed);
    // 非考查前提：居民的钱袋与存粮。其余居民身无分文，只有下面点名的人有钱。
    const facts=Object.keys(initial.state.npcs).filter(id=>id!==landlord).map(id=>({path:['state','npcs',id,'coins'],value:coins[id]??0}));
    for(const [id,quantity] of Object.entries(bread))facts.push({path:['state','npcs',id,'inventory'],value:{item_bread:{quantity,quality:'木'}}});
    const prepared=applyIntentSetup(engine,initial,{minute:600,location:place,coins:300,inventory:{item_bread:5,item_parchment:1},present:[landlord],abilitiesByActor:{player:{skills:{skill_literacy:500}}},facts});
    assert.deepEqual(prepared.setupUnmet,[]);
    const f={engine,document:prepared.document};
    f.act=async(action,slots,id)=>{const out=await engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId:id});f.document=applyPatches(f.document,out.patches);return out.result;};
    const leased=await engine.reduce(f.document,{tool:'world_trade',args:{operation:'lease',seller:landlord,consent:true,days:2},eventId:'w4-lease'});
    f.document=applyPatches(f.document,leased.patches);f.business=leased.result.business;
    await f.act('business:open_counter',{business:f.business,coins:100},'w4-counter');
    await f.act('core:settlement.business_open',{business:f.business},'w4-open');
    return f;
}
const counterCoins=f=>f.document.state.records['player|counter']?.coins??Object.values(f.document.state.records).find(r=>r.category==='money_account'&&r.purpose==='counter')?.coins;
// 正午客流前一分钟（719）：预算读取要用与客流时刻一致的真实状态（店主与居民的位置、状态已随作息推进），不能用开店当时（约 10 点）的状态投影。
const toBeforeNoon=async(f,id='w4-to-noon')=>{const m=f.document.state.minute%DAY;if(m>=719)return;const out=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes:719-m},eventId:id});f.document=applyPatches(f.document,out.patches);};
const waitPastMidnight=async(f,id)=>{const m=f.document.state.minute,minutes=DAY-(m%DAY)+30;const out=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes},eventId:id});f.document=applyPatches(f.document,out.patches);};

// 正午客流的读法（business.mjs serve 同一链）：居民正午位置与分钟的投影文档上读预算购买计划与定价原语。
const SHOP='shop_hw_qingdeng';
const noonRead=(f,doc,id)=>{
    const state=doc.state,slot=scheduleAt(f.engine,id,720,state);
    const projected={...doc,state:{...state,minute:720,npcs:{...state.npcs,[id]:{...state.npcs[id],location:slot.location,activity:slot.activity}}}};
    return {document:projected,get:(...p)=>p.reduce((v,k)=>v?.[k],projected)};
};
const quoteAtShop=(f,doc,buyer,item,quantity)=>{
    const pre=structuredClone(doc);pre.state.minute=720;
    const shop=currentShops(f.engine,pre.state).find(s=>s.id===SHOP),pd=f.engine.primitiveDraft(pre);
    const where=scheduleAt(f.engine,shop.keeper,720,pre.state).location,business={keeper:shop.keeper,markup:shop.markup??1};
    const supply=quoteSupply(pd,f.engine,{item,location:where,business});
    const base=regionalTradeBase(pd,f.engine,item,where,720)*wildlifePriceFactor(f.engine,pd.document,item,where);
    return marketQuote(pd,f.engine,{seller:shop.keeper,buyer,item,quantity,location:where,minute:720,base,business,supply}).totalCoins;
};
// 主观客流下 serve 的成交机制（business.mjs serve/wants）：NPC 顾客读的是主观预算，主观来源只含本人店（shop.mjs:346 view&&shop.keeper!==owner），
// 所以他店（含青灯）不在计划来源里，wants 走储备缺口路径：份数 = ceil(饱腹缺口 ÷ 该货饱腹)；再取 min(份数, 店主可售库存)，从大到小找第一个总价 ≤ cap 的件数
// （cap = min(现金, 各到期余额) − 路费，与 serve 同一读法；同参数：正午投影文档、serve 的 marketQuote 参数链）。同序（预算计划）待 WATER-1C。
const expectedBuy=(f,doc,id,item)=>{
    const read=noonRead(f,doc,id),state=read.document.state,keeper='npc_hw_linsui',pre=structuredClone(doc);pre.state.minute=720;
    const shortfall=householdBudget(read,f.engine,id).resources.procurementShortfall.satiety,gain=f.engine.byId.get(item).nutrition.satiety;
    const budget=householdBudget(read,f.engine,id,{view:subjectiveView(f.engine,read.document,id)});
    const from=scheduleAt(f.engine,id,720,doc.state).location,to=scheduleAt(f.engine,keeper,720,doc.state).location;
    const leg=(a,b)=>{try{return f.engine.route(a,b,'walk',720,doc.randomSeed).cost??0;}catch{return 0;}};
    const cap=Math.max(0,Math.min(budget.cash,...budget.timeline.map(r=>r.balance))-leg(from,to)-leg(to,from));
    const available=saleableStock(f.engine.primitiveDraft(pre),f.engine,keeper,item,{business:true}).available;
    for(let quantity=Math.min(Math.ceil(shortfall/gain),available);quantity>0;quantity--){
        const paid=quoteAtShop(f,doc,id,item,quantity);
        if(paid>=1&&paid<=cap)return {quantity,paid,cap};
    }
    return null;
};

test('F026 客流：陶枝单独在场（徐玲无钱不上门）：件数与应付从预算购买计划与 marketQuote 在前态上推出，整表相等',async()=>{
    const A='npc_hw_xuling',B='npc_hw_wushuo',D='npc_hw_yanzhe',E='npc_hw_taozhi';
    const f=await openShop({coins:{[A]:0,[B]:0,[D]:0,[E]:3}});
    await toBeforeNoon(f);const before=structuredClone(f.document);
    await waitPastMidnight(f,'w4-day-e-alone');
    const flow=Object.values(f.document.state.records).filter(r=>r.category==='customer_flow'&&r.shop===SHOP);
    // 陶枝独自上门：储备缺口路径（见 expectedBuy），货架顺序（restock）面包、烙饼、口粮；买下面包后她的 3 铜花完（cap−应付＜1），后面的货因 cap＜1 不再下单，整表只有面包一行。
    const bread=expectedBuy(f,before,E,'item_bread');assert.ok(bread);assert.ok(bread.cap-bread.paid<1,'前提：面包花光她的钱');
    const expected=[[E,'item_bread',bread.quantity,bread.paid,'bought']];
    assert.deepEqual(flow[0].visits.map(v=>[v.npc,v.item,v.quantity,v.paid,v.outcome]),expected);
});

test('F026 客流：非原生 NPC 自营商户（玩家把店转让给产权人）不在家户计划来源里，居民仍按储备缺口在该店买口粮',async()=>{
    // 真实动作造出非原生自营商户：玩家租下青灯铺面开店后，把经营连同库存转让给铺面产权人（店主林穗），business.mjs 的转让分支产生 owner=林穗、非 native 的 business 记录。
    const A='npc_hw_xuling',landlord='npc_hw_linsui',f=await openShop({coins:{[A]:40}});
    // 前提：买方（产权人）接受转让的决策与 business.mjs 转让分支同参数（subjectiveView、purchase、价款 1、reward=库存估值），种子确定；正午她在店内且提供交易服务。
    const stock=Object.fromEntries(Object.entries(f.document.state.inventory).map(([k,v])=>[k,typeof v==='number'?v:v.quantity]));
    const pd=f.engine.primitiveDraft(structuredClone(f.document));
    const reward=Object.entries(stock).reduce((n,[item,quantity])=>{const q=valuation(pd,f.engine,{role:'goods',holder:'player',location:'bld_hw_qingdeng',item,quantity});return n+(q.value??0);},0);
    assert.equal(npcDecision(subjectiveView(f.engine,f.document,landlord),{kind:'purchase',from:'player',cost:{coins:1},reward,needSatisfaction:0}).outcome,'agree');
    const noon=scheduleAt(f.engine,landlord,720,f.document.state);assert.equal(noon.location,'bld_hw_qingdeng');assert.ok(noon.services?.includes('trade'));
    const moved=await f.act('core:settlement.business_close',{business:f.business,choice:'transfer',member:landlord,coins:1},'w4-transfer');
    const shopId=moved.successor,record=f.document.state.records[shopId];
    assert.ok(record&&record.category==='business'&&record.owner===landlord&&!record.native);
    await toBeforeNoon(f);
    const before=structuredClone(f.document),plan=householdBudget(noonRead(f,before,A),f.engine,A).resources;
    // 该店不是家户计划的来源（来源只收原生店与交易人），所以走储备缺口路径：件数 = ceil(饱腹缺口 ÷ 面包饱腹)，期望从引擎读。
    assert.ok(!plan.market.offered.includes(shopId));
    assert.ok(plan.procurementShortfall.satiety>0);
    await waitPastMidnight(f,'w4-day-transfer');
    const flow=Object.values(f.document.state.records).find(r=>r.category==='customer_flow'&&r.shop===shopId);
    assert.ok(flow,'该店在当日营业店铺里，有客流记录');
    // 不在计划来源里的店按“货架顺序逐件按储备缺口折份数”（WATER-1C 才并入单一次序），所以徐玲先在货架上第一件有营养的货下单，不一定是面包：
    // 该件的份数 = min(ceil(饱腹缺口 ÷ 该件饱腹)，转让后店主手里该件的库存)；缺口、饱腹、库存都从引擎与前态读。
    const visit=flow.visits.find(v=>v.npc===A);assert.ok(visit);
    const held=before.state.npcs[landlord].inventory[visit.item],onShelf=typeof held==='number'?held:held?.quantity??0;
    assert.equal(visit.quantity,Math.min(Math.ceil(plan.procurementShortfall.satiety/f.engine.byId.get(visit.item).nutrition.satiety),onShelf));
    assert.equal(visit.outcome,'bought');
});

test('F026 客流：玩家开店营业一天，只有有需求、有钱、够得着的居民上门；人数与成交按钱袋和缺口手算',async()=>{
    const A='npc_hw_xuling',B='npc_hw_wushuo',C='npc_hw_anhuai',D='npc_hw_yanzhe',E='npc_hw_taozhi';
    // A 钱袋 40、一口之家、手边没粮：会来。B 钱袋 40 但已备下两个面包（一口之家一天的饱食 60 = 2 × 30）：无需求。
    // C身无分文，D住在白石不在本聚落；E只有3铜，按K02缺口预算而非旧钱袋比例消费。
    const f=await openShop({coins:{[A]:40,[B]:40,[D]:200,[E]:3},bread:{[B]:2}});
    await toBeforeNoon(f);
    const before=structuredClone(f.document),account=()=>Object.values(f.document.state.records).find(r=>r.category==='money_account'&&r.purpose==='counter');
    assert.equal(account().coins,100);
    // 守恒只看正午客流本身：推进到客流刚结束的 721，取此刻文档；午夜日结另有入账（租金、工资、补货结算等），不属于客流，不能混进“成交收入”的守恒里。
    {const out=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes:2},eventId:'w4-after-noon'});f.document=applyPatches(f.document,out.patches);}
    const afterNoon=structuredClone(f.document);
    await waitPastMidnight(f,'w4-day');
    const flow=Object.values(f.document.state.records).filter(r=>r.category==='customer_flow'&&r.shop===f.business);
    // K08 正午按种子决定商店先后；本种子原生客店先服务，玩家此日没有重复需求客流。
    assert.equal(flow.length,0);
    // 一人每日需求：2.5×24=60饱食、水分 3×24=72。徐玲住 bld_hw_riverhome，往返 6 分钟 ≤ nearWaterRoundTripMinutes，当日有水可免费取，
    // 水分缺口被免费水扣光，只剩 60 饱食缺口，只买面包：数量 = ceil(60 ÷ 引擎面包饱腹)（期望值从引擎读，不写死；面包饱腹由配方能量推导，不再是手写 30）。
    // 陶枝（house_hw_06：陶枝+樊荣两人，钱 3 铜；bld_hw_herbs 往返 10 分钟 ≤30，同样有水可取）也只为饱腹买：原生店货架只有 6 面包，徐玲先拿走 ceil(60÷面包饱腹)，
    // 陶枝再买余下的面包；买法由预算次序（每铜有效覆盖）决定，不是为水分买。她的件数与实付由现价与现金决定，这里按规律断言结构与守恒，不照搬旧值。
    const native=Object.values(f.document.state.records).filter(r=>r.category==='customer_flow');
    assert.deepEqual(native.map(r=>[r.shop,r.day,r.minute]),[['shop_hw_qingdeng',0,720]]);
    const breadSatiety=f.engine.byId.get('item_bread').nutrition.satiety,shelfBread=6,keeper='npc_hw_linsui';
    const aVisits=native[0].visits.filter(v=>v.npc===A),eVisits=native[0].visits.filter(v=>v.npc===E);
    // 徐玲是当日第一位成交者（客流顺序由种子定），所以前态克隆在正午的投影就是她下单时的状态；陶枝的实付取决于徐玲成交后的店主库存与供需（见下，由守恒与单独在场变体覆盖）。
    assert.equal(native[0].visits[0].npc,A,'前提：徐玲先于陶枝成交');
    // 徐玲：储备缺口路径（见 expectedBuy）：件数 = min(ceil(60÷面包饱腹)，店主可售)，从大到小第一个总价 ≤ cap 者；应付 = marketQuote（serve 同一参数链）；买下后饱腹缺口为 0，不再下别的单。
    const a=expectedBuy(f,before,A,'item_bread');assert.ok(a);const qA=a.quantity;
    assert.equal(qA,Math.ceil(60/breadSatiety));
    assert.deepEqual(aVisits.map(v=>[v.npc,v.item,v.quantity,v.paid,v.outcome]),[[A,'item_bread',qA,a.paid,'bought']]);
    // 不变量 8（成交件 ⊆ 预算计划）在主观客流下不适用（NPC 他店不在主观计划来源里，见 expectedBuy 注释），待 WATER-1C 并入同序后再立。
    // 陶枝：有水源，不为水分买；先买面包（货架 6 − 徐玲所买），买法由预算次序决定。守恒：店主钱袋增量 = 徐玲实付 + 陶枝实付；各自钱袋减少同额。
    assert.ok(eVisits.length>0);assert.equal(eVisits[0].item,'item_bread');assert.equal(eVisits[0].quantity,shelfBread-qA);
    assert.ok(eVisits.every(v=>v.outcome==='bought'));
    const ePaid=eVisits.reduce((n,v)=>n+v.paid,0);
    assert.ok(native[0].visits.every(v=>v.tax===0));
    assert.equal(afterNoon.state.npcs[keeper].coins,before.state.npcs[keeper].coins+aVisits[0].paid+ePaid);
    assert.equal(afterNoon.state.npcs[A].coins,before.state.npcs[A].coins-aVisits[0].paid);assert.equal(afterNoon.state.npcs[E].coins,before.state.npcs[E].coins-ePaid);assert.equal(account().coins,100);
    assert.equal(f.document.state.inventory.item_ration.quantity,3);assert.equal(f.document.state.inventory.item_bread.quantity,5);
    const bought=f.document.state.npcs[A].inventory.item_bread;assert.equal(typeof bought==='number'?bought:bought.quantity,qA);
    // 不来的人：钱袋与存粮原样。
    for(const id of [B,C,D])assert.equal(f.document.state.npcs[id].coins,before.state.npcs[id].coins,id);
    // 玩家无成交：柜台、库存、营业回执和报表必须共同保持零收入，账本仍守恒。
    const receipt=Object.values(f.document.state.records).find(r=>r.category==='business_receipt'&&r.operation==='customer_sale');
    assert.equal(receipt,undefined,'需求已在原生店满足，玩家不能重复记收入或扣库存');
    assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
    const report=await f.act('core:settlement.business_report',{business:f.business},'w4-report');
    assert.equal(report.profit.revenue,0);assert.equal(report.cash.reconciled,true,JSON.stringify(report.cash));
});

test('F026 玩家先服务时，真实自动成交仍进入柜台、营业回执和报表',async()=>{
    // 覆盖原有玩家自动成交保证；不改世界或货架。该固定种子下玩家/原生店排序骰值为
    // 3175393251 < 3453520749，玩家先服务；上一例保留原种子的原生店先服务分支。
    const A='npc_hw_xuling',f=await openShop({coins:{[A]:40},campaignSeed:'w4-player-flow'});
    const startCoins=f.document.state.npcs[A].coins,pre=structuredClone(f.document);
    await waitPastMidnight(f,'w4-player-day');
    const flow=Object.values(f.document.state.records).filter(r=>r.category==='customer_flow'&&r.shop===f.business);
    // 新值：一人60饱食÷口粮每份饱腹26（由配方能量推导，原手写30）=ceil(2.31)=3份；3份≤零售阈值5，单价=基价3×供需比26/47(=0.553191，已离开下限.5)，
    // 总额 3×3×0.553191=4.9787，取整一次(截断)=4铜。注意 4.9787 离 5 很近（差 0.4%），对供需比敏感，但断言仍为精确相等、不放宽。
    // 旧值：60÷30=2份，2×3×0.5=3铜。对应设计变化：口粮饱腹改推导（c0a7ea22，PLAN.md:584、591③）与卖家份额分摊使供需比离开下限（PLAN.md:316③、563②）；
    // 李白 11-11 (a)（PLAN.md:540）。证据：F:/dnd/docs/审查记录/市场价格-探针输出-mkt-5.txt，复算 市场价格-独立复算-A.md、-B.md（s5-w4-economy-11：satietyEach 26、xulingCoins 29）。
    assert.equal(flow.length,1);
    assert.deepEqual(flow[0].visits.map(v=>[v.npc,v.item,v.quantity,v.paid,v.tax,v.outcome]),[[A,'item_ration',3,4,0,'bought']]);
    const account=Object.values(f.document.state.records).find(r=>r.category==='money_account'&&r.purpose==='counter');
    // 柜台侧 4 处（柜台钱、口粮余量、回执、营业额）随上面已批准的到访变化（3 份口粮付 4）直接推出：柜台 100+4=104，口粮 3-3=0（卖光后键不存在按 0 计），回执 [4,{item_ration:-3}]，营业额 4；与探针 mkt-14（65b81c7a）s5-w4-economy-11 实算一致。
    assert.equal(account.coins,104);
    assert.equal(f.document.state.inventory.item_ration?.quantity??0,0);assert.equal(f.document.state.inventory.item_bread.quantity,5);
    const receipt=Object.values(f.document.state.records).find(r=>r.category==='business_receipt'&&r.operation==='customer_sale');
    assert.deepEqual([receipt.coins,receipt.goods],[4,{item_ration:-3}]);
    const report=await f.act('core:settlement.business_report',{business:f.business},'w4-player-report');
    assert.equal(report.profit.revenue,4);assert.equal(report.cash.reconciled,true);
    assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
    // 徐玲钱袋（断言放在最后）：初始钱 − 柜台那笔实付 − 原生店实付（若有），都从客流记录读，不写死。
    // 规律（WATER-1A）：徐玲住处往返 6 分钟，当日有水可免费取，水分缺口由免费水扣除；买完口粮后饱腹缺口为 0，她就没有任何需要用钱补的营养缺口，
    // 徐玲有免费水，水分缺口被扣光，不为水分买任何货（WATER-1B 后烙饼水分为 0，见下行）。旧版此处断言“她因水分另买烙饼”，那正是被修正的行为。
    const nativeVisits=Object.values(f.document.state.records).filter(r=>r.category==='customer_flow'&&r.shop!==f.business).flatMap(r=>r.visits.filter(v=>v.npc===A));
    // 前提（从引擎读）：徐玲正午有水分需求，且被免费水扣光（freeWater.hydration>0，水分缺口 0）；引擎里确有水分>0 的货（牛乳、清水等）。
    // 本店货架（面包、烙饼、口粮）WATER-1B 后都不供水分（烙饼 0.12kg 过不了 12.5 门槛），所以“不为水分买”不能靠烙饼验证；改为对引擎里每件水分>0 的货断言：
    // 以她的预算缺口，任何店卖它们她都不会为水分下单（wants 对该货的数量 = ceil(水分缺口÷水分) = 0）。
    const plan=householdBudget(noonRead(f,pre,A),f.engine,A).resources,hydrating=f.engine.world.items.filter(i=>i.nutrition?.hydration>0);
    assert.ok(plan.market.freeWater.hydration>0&&hydrating.length>0);
    for(const g of hydrating)assert.equal(Math.ceil(plan.procurementShortfall.hydration/g.nutrition.hydration),0,g.id);
    // 前提（从数据读）：徐玲住处到水源地点的往返步行分钟 ≤ nearWaterRoundTripMinutes，走 near 分支，当日有水可免费取。
    const leg=f.engine.world.routes.find(r=>[r.from,r.to].includes('bld_hw_riverhome')&&[r.from,r.to].includes('loc_hw'));
    assert.ok(2*Math.ceil(leg.lengthKm*60/f.engine.rules.travel.walkKmh)<=f.engine.rules.householdSubsistence.nearWaterRoundTripMinutes);
    assert.equal(nativeVisits.length,0,'有可达免费水且饱腹已满：原生店不再有她的成交');
    assert.equal(f.document.state.npcs[A].coins,startCoins-flow[0].visits[0].paid-nativeVisits.reduce((n,v)=>n+v.paid,0));
});

test('F026 客流：居民自己决定买不买——正忙的人（决策返回稍后）这一天不买',async()=>{
    const A='npc_hw_xuling';
    const f=await openShop({coins:{[A]:40}});
    // 非考查前提：A 此刻有更要紧的急务（紧迫目标），决策路径会答“脱不开身”。
    f.document.state.npcs[A].goals={core:[{id:'w4-urgent',content:'先把田边的水闸修好',urgency:100,progress:0,status:'进行中',steps:[]}]};
    await waitPastMidnight(f,'w4-day-busy');
    const flow=Object.values(f.document.state.records).find(r=>r.category==='customer_flow'&&r.shop===f.business);
    assert.equal(flow.visits[0].outcome,'defer');assert.equal(f.document.state.npcs[A].coins,40);assert.equal(f.document.state.inventory.item_ration.quantity,3);assert.equal(f.document.state.inventory.item_bread.quantity,5);
});

// ---------------------------------------------------------------- F058 估值角色：无依据如实标注
test('F058 股份按发行方净资产估值；使用权、不存在的发行方没有估值依据，如实标不可估值而非 0',async()=>{
    const f=fixture();
    f.doc=applyIntentSetup(f.e,f.doc,{facts:[{path:['state','npcs',host,'inventory'],value:{}}]}).document;
    // 东家无存货无债务，净资产就是现金 500；入股 20% 默认作价 ⌈500 × 20 ÷ 80⌉ = 125，钱进东家，净资产 625。
    const own=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'invest');assert.equal(own.cost,125);
    const d=f.draft(),e=f.e;
    // 手算：625 × 20% = 125。
    assert.deepEqual(valuation(d,e,{role:'share',issuer:host,fraction:0.2}),{value:125,basis:'net-assets'});
    // 使用权（经营权）没有价格可派生；不存在的发行方查不到账目。二者都不是 0。
    const lease=holdingValuation(d,e,{kind:'operates',subject:'bld_hw_qingdeng',holder:host,terms:{}});
    assert.deepEqual([lease.value,typeof lease.unvaluable],[null,'string']);
    const ghost=valuation(d,e,{role:'share',issuer:'org_does_not_exist',fraction:0.5});
    assert.deepEqual([ghost.value,typeof ghost.unvaluable],[null,'string']);
    // 地产：租金资本化。住宅月租 35 × 4 = 140，月息带 [0.01,0.08] 中值 0.045，完好度 100%：140 ÷ 0.045 = 3111.11 → 3111。
    f.doc.state.buildings[mill]={owner:'player',condition:100};
    const d2=f.draft();
    assert.deepEqual(valuation(d2,e,{role:'property',subject:mill,fraction:1}),{value:3111,basis:'capitalized-rent'});
    d.done();d2.done();
});
