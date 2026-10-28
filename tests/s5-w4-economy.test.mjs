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
import {customerPurseShare} from '../server-plugin/market.mjs';
import {valuation,holdingValuation} from '../server-plugin/valuation.mjs';
import {creatureTraits} from '../server-plugin/traits.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const mill='bld_hw_mill';
const move=(f,destination,id)=>f.act({destination},id,'world_move');

// ---------------------------------------------------------------- F048
test('F048 分红：收付双方不在场时不凭空转账，形成到期应付；当面追收后结清且保留“分红”子类型',async()=>{
    const f=fixture(),total=cash(f.doc);
    // W8C 负重：共用夹具给玩家 100 份木料（200 公斤）与燕麦（50 公斤），买回面包会超出安全负重 40 公斤；
    // 本用例只用面包，故把行囊收窄为面包（100×0.15 = 15 公斤，卖出 16 再买回 10 后仍在上限内）。
    f.doc=applyIntentSetup(f.e,f.doc,{facts:[{path:['state','npcs',host,'inventory'],value:{}},{path:['state','inventory'],value:{item_bread:{quantity:100}}}]}).document;
    const acquired=await f.act({buyer:host,seller:'player',item:'item_bread',quantity:16,unitPrice:1},'stock');assert.equal(acquired.cost,16);
    const own=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'invest');
    const sale=await f.act({seller:host,item:'item_bread',quantity:10,unitPrice:2},'sale');assert.equal(sale.cost,20);
    const tax=f.doc.state.records['trade_tax:sale:commercial']?.amount??0;
    // 手算：收入 20，先进先出销货成本 10（十份取自以 1 铜买入的十六份），再减商税；分红 = ⌊利润 × 20% ⌋。
    const due=Math.floor((20-10-tax)*20/100);assert.ok(due>=1);
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
test('F007 典当按估值角色：十份面包按当地估值（稀缺下限 0.5）而非目录基价，预支率 50%',async()=>{
    const f=fixture();await f.act({operation:'deposit',seller:clerk,coins:10},'dep');
    const p=await f.act({operation:'pawn',seller:clerk,item:'item_bread',quantity:10,days:1},'pawn');
    // 手算：面包基价 2 铜 × 河湾粮食类稀缺系数下限 0.5 × 品质 1 = 1 铜/份；十份 10 铜；典当预支率 0.5 → 5 铜。
    // （目录基价口径会得到 2 × 10 × 0.5 = 10 铜。）
    assert.equal(f.e.rules.economy.credit.pawn.advanceRatio,0.5);
    assert.equal(p.principal,5);
    assert.equal(f.doc.state.records[p.contract].pledgeRecord&&f.doc.state.records[f.doc.state.records[p.contract].pledgeRecord].value,10,'押品值 = 估值');
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
        c.state.inventory.item_parchment={quantity:10,quality:'木',durability:100,weight:0.06};c.state.inventory.item_soot_ink={quantity:5,quality:'木',durability:100,weight:0.1};
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
async function openShop({coins={},bread={}}={}){
    const landlord='npc_hw_linsui',place='bld_hw_qingdeng';
    const engine=new WorldEngine(structuredClone(world)),initial=engine.createCharacter(seed,{},'w4-flow');
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
const waitPastMidnight=async(f,id)=>{const m=f.document.state.minute,minutes=DAY-(m%DAY)+30;const out=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes},eventId:id});f.document=applyPatches(f.document,out.patches);};

test('F026 客流：玩家开店营业一天，只有有需求、有钱、够得着的居民上门；人数与成交按钱袋和缺口手算',async()=>{
    const A='npc_hw_xuling',B='npc_hw_wushuo',C='npc_hw_anhuai',D='npc_hw_yanzhe',E='npc_hw_taozhi';
    // A 钱袋 40、一口之家、手边没粮：会来。B 钱袋 40 但已备下两个面包（一口之家一天的饱食 60 = 2 × 30）：无需求。
    // C 身无分文。D 钱袋 200 但住在白石镇，不在本聚落。E 只有 3 铜：每日上限 ⌊3 × 0.25⌋ = 0，一份也买不起。
    const f=await openShop({coins:{[A]:40,[B]:40,[D]:200,[E]:3},bread:{[B]:2}});
    const before=structuredClone(f.document),account=()=>Object.values(f.document.state.records).find(r=>r.category==='money_account'&&r.purpose==='counter');
    assert.equal(account().coins,100);
    await waitPastMidnight(f,'w4-day');
    const flow=Object.values(f.document.state.records).filter(r=>r.category==='customer_flow'&&r.shop===f.business);
    assert.equal(flow.length,1);
    // 手算：A 一口之家，每人每小时饱食耗 2.5 → 一天 60，储备天数 1 → 缺口 60；口粮与面包饱食都是 30 → 要 2 份。
    // 货架按行囊顺序先摆口粮：口粮基价 3 × 稀缺下限 0.5 = 1.5 铜一份，两份零售整单只取整一次 trunc(3.0) = 3 铜；
    // A 每日上限 ⌊40 × 0.25⌋ = 10 ≥ 3。买到口粮后缺口补齐，不再买面包。
    assert.deepEqual(flow[0].visits.map(v=>[v.npc,v.item,v.quantity,v.paid,v.outcome]),[[A,'item_ration',2,3,'bought']]);
    assert.equal(flow[0].visits[0].tax,0,'3 铜的成交，商税按不到三分之一的税率向下取整为 0');
    assert.equal(f.document.state.npcs[A].coins,37);assert.equal(account().coins,103);
    assert.equal(f.document.state.inventory.item_ration.quantity,1);assert.equal(f.document.state.inventory.item_bread.quantity,5);
    const bought=f.document.state.npcs[A].inventory.item_ration;assert.equal(typeof bought==='number'?bought:bought.quantity,2);
    // 不来的人：钱袋与存粮原样。
    for(const id of [B,C,D,E])assert.equal(f.document.state.npcs[id].coins,before.state.npcs[id].coins,id);
    // 成交走与手动成交相同的账：经营回执、对账无漂移、报表收入 2 铜且现金对得上。
    const receipt=Object.values(f.document.state.records).find(r=>r.category==='business_receipt'&&r.operation==='customer_sale');
    assert.deepEqual([receipt.coins,receipt.goods],[3,{item_ration:-2}]);
    assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
    const report=await f.act('core:settlement.business_report',{business:f.business},'w4-report');
    assert.equal(report.profit.revenue,3);assert.equal(report.cash.reconciled,true,JSON.stringify(report.cash));
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
