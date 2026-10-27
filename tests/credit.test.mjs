import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {loanTerms} from '../server-plugin/credit.mjs';
import {applyConsentEvent} from '../server-plugin/action-consent.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const inn='bld_hw_qingdeng',post='bld_hw_post',home='bld_hw_riverhome',court='bld_hw_council';
const host='npc_hw_linsui',clerk='npc_hw_shendu',mage='npc_hw_xuling',worker='npc_hw_ayan',judge='npc_hw_chenbai',officer='npc_hw_gucen';
const placeOf={[host]:inn,[clerk]:post,[mage]:home,[worker]:inn,[judge]:court,[officer]:court};
const DAY=1440;
function fixture({at=inn,coins=300}={}){
    const w=structuredClone(world),engine=new WorldEngine(w);
    let doc=engine.initialFromLegacy(seed,'credit');
    doc.state.minute=600;doc.state.location=at;doc.state.player.coins=coins;doc.state.inventory={item_bread:{quantity:4}};
    doc.state.npcs=Object.fromEntries(Object.entries(placeOf).map(([id,loc])=>[id,{...doc.state.npcs[id],coins:200,location:loc,activity:'营业',status:'正常',goals:{},memoryStream:[]}]));
    for(const npc of w.npcs.filter(n=>placeOf[n.id])){
        if([judge,officer].includes(npc.id)){delete npc.schedule;delete npc.tier;continue;}
        npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:npc.id===host?['trade']:[]}]};
    }
    const act=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
    return {engine,act,get doc(){return doc;},set doc(v){doc=v;}};
}
const cash=c=>c.state.player.coins+Object.values(c.state.npcs).reduce((n,r)=>n+r.coins,0)+Object.values(c.state.records).filter(r=>r.category==='bank').reduce((n,r)=>n+r.coins,0)
    +Object.values(c.state.records).filter(r=>r.category==='contract').reduce((n,r)=>n+(r.escrow??0),0)
    +Object.values(c.state.settlements).reduce((n,s)=>n+s.treasury,0)+Object.values(c.state.quests).reduce((n,q)=>n+(q.escrow??0),0);
function lenderConsent(f,principal,days,eventId,quantity=0){
    // 产品原则二.4：本人通过原生事件同意实际报价，不以请求布尔值代答。
    const d=f.engine.primitiveDraft(f.doc),interest=loanTerms(d,f.engine,{lender:host,principal,days,collateralValue:quantity*(f.engine.byId.get('item_bread').basePrice??0)}).interest;
    applyConsentEvent(d,{engine:f.engine,document:d.document},{actor:host,eventId,verb:'consent_given',to:'player',payload:{scope:'loan',subject:'player',purpose:['player'],terms:{principal,days,interest},until:d.get('state','minute')+10}});
    f.doc=applyPatches(f.doc,d.patches);
}

test('向熟人借贷按立场定月息、到期本息与抵押，还清后取回抵押且钱数守恒',async()=>{
    const f=fixture(),total=cash(f.doc);
    await assert.rejects(f.act('world_trade',{operation:'borrow',seller:host,coins:40,days:10},'no'),/明确同意/);
    // 原“填 true 才成功”改为“填 true 无权代答且零写入”，保留同意门槛。
    const unchanged=structuredClone(f.doc);
    await assert.rejects(f.act('world_trade',{operation:'borrow',seller:host,consent:true,coins:40,days:10,item:'item_bread',quantity:2},'forged'),/明确同意/);
    assert.deepEqual(f.doc,unchanged);
    lenderConsent(f,40,10,'lender-loan',2);
    const loan=await f.act('world_trade',{operation:'borrow',seller:host,coins:40,days:10,item:'item_bread',quantity:2},'loan');
    const [low,high]=world.rules.economy.loanMonthlyInterest;
    assert.ok(loan.monthlyInterest>=low&&loan.monthlyInterest<=high);
    assert.equal(loan.interest,Math.ceil(40*loan.monthlyInterest*10/30));assert.equal(loan.amount,40+loan.interest);
    const debt=f.doc.state.records[loan.debt];
    assert.equal(debt.kind,'loan');assert.equal(debt.deadline,600+10*DAY);assert.equal(f.doc.state.player.coins,340);
    assert.equal(f.doc.state.inventory.item_bread.quantity,2);assert.equal(f.doc.state.records[loan.pledge].status,'质押中');
    assert.equal(cash(f.doc),total);
    await assert.rejects(f.act('world_trade',{operation:'borrow',seller:host,coins:1000,days:10},'big'),/至多能借出/);
    const paid=await f.act('world_trade',{seller:host,payment:'repay',debt:loan.debt},'repay');
    assert.equal(paid.repaid,loan.amount);assert.equal(f.doc.state.records[loan.debt].status,'已还清');
    assert.equal(f.doc.state.inventory.item_bread.quantity,4);assert.equal(f.doc.state.records[loan.pledge].status,'已退还');
    assert.equal(f.doc.state.npcs[host].coins,200+loan.interest);assert.equal(cash(f.doc),total);
});

test('借款到期过宽限不还：抵押归债主、按签约地法典立案、生成违约世界事件并降低集体立场，审理后缴付即结清欠款',async()=>{
    const f=fixture(),regardBefore=standing(f.engine,f.doc.state,'loc_hw','player');
    lenderConsent(f,60,2,'lender-default',1);
    const loan=await f.act('world_trade',{operation:'borrow',seller:host,coins:60,days:2,item:'item_bread',quantity:1},'loan');
    await f.act('world_time',{minutes:2*DAY},'wait1');
    assert.equal(f.doc.state.records[loan.debt].status,'逾期');assert.equal(f.doc.state.records[loan.debt].defaulted,undefined);
    await f.act('world_time',{minutes:DAY},'wait2');
    const debt=f.doc.state.records[loan.debt],key=`legal_case:default:${loan.debt}`,row=f.doc.state.records[key];
    assert.equal(debt.defaulted.case,key);assert.equal(debt.defaulted.pledge.item,'item_bread');
    // F007: the forfeited pledge is credited at its valuation (bread 2 x scarcity floor .5 = 1 copper), not the catalogue price 2.
    assert.equal(debt.paid,1);assert.equal(debt.defaulted.remaining,debt.amount-debt.paid);
    assert.equal(f.doc.state.records[loan.pledge].status,'已没收');
    assert.equal(row.law,'law_hw_property');assert.equal(row.offense,'debt_default');assert.equal(row.status,'已报案');assert.equal(row.victim,host);assert.equal(row.value,debt.defaulted.remaining);
    const breach=Object.values(f.doc.state.records).find(r=>r.category==='world_event'&&r.verb==='breach');
    assert.equal(breach.target,host);assert.equal(breach.actor,'player');assert.deepEqual(breach.source,{debt:loan.debt});
    assert.ok(standing(f.engine,f.doc.state,'loc_hw','player')<regardBefore,'债主所在聚落的立场下降');
    f.doc.state.location=court;
    const heard=await f.act('world_law',{operation:'hear',case:key,authority:judge},'hear');
    assert.equal(heard.convicted,true);assert.equal(heard.judgment.compensation,row.value);
    assert.equal(heard.judgment.fine,world.rules.economy.credit.loan.defaultPenalty.baseFine+Math.ceil(row.value*world.rules.economy.credit.loan.defaultPenalty.valueMultiplier));
    await f.act('world_law',{operation:'pay',case:key,authority:officer},'pay');
    assert.equal(f.doc.state.records[key].status,'已结案');assert.equal(f.doc.state.records[loan.debt].status,'已还清');
    f.doc.state.location=inn;
    await assert.rejects(f.act('world_trade',{seller:host,payment:'repay',debt:loan.debt},'twice'),/还清/);
});

test('钱庄存取收手续费，按成色与汇费兑换他国铸币，柜面与玩家钱数守恒',async()=>{
    const f=fixture({at:post,coins:400}),bank=world.rules.economy.credit.banks[0];
    f.doc.state.inventory.item_coin_civic={quantity:10,quality:'铁',durability:100,weight:0.005};
    const dep=await f.act('world_trade',{operation:'deposit',seller:clerk,coins:50},'dep');
    assert.equal(dep.balance,49);assert.equal(f.doc.state.player.coins,350);
    const total=cash(f.doc);
    await assert.rejects(f.act('world_trade',{operation:'withdraw',seller:clerk,coins:60},'over'),/支取铜钱/);
    await f.act('world_trade',{operation:'withdraw',seller:clerk,coins:20},'wd');assert.equal(f.doc.state.player.coins,370);
    const sold=await f.act('world_trade',{operation:'exchange',seller:clerk,item:'item_coin_civic',quantity:10},'sell');
    // 15 §15.3: both copper coins weigh5g; .9 fineness => rate .9,
    // independent of the old stamped face10. floor(10*.9*.97)=8.
    assert.equal(sold.received,8);assert.equal(f.doc.state.inventory.item_coin_civic,undefined);
    const bought=await f.act('world_trade',{operation:'exchange',seller:clerk,buyer:'player',item:'item_coin_coast',quantity:3},'buy');
    // Copper14/.2kg * .005kg * scarcity.5=.175; silver38/.05kg
    // * .005kg * fineness.85 * scarcity1=3.23. Three coins at that
    // current value cover the 50-copper pledge; ceil(3*3.23/.175*1.03)=58.
    assert.equal(bought.paid,58);assert.equal(f.doc.state.inventory.item_coin_coast.quantity,3);
    assert.equal(f.doc.state.records[bank.id].goods.item_coin_civic,bank.reserveCoins.item_coin_civic+10);
    assert.equal(cash(f.doc),total);
    // 15 §15.3: two current silver coins value floor(2*3.23/.175)=36,
    // below the required50; the old nominal face must not secure this loan.
    const beforePledge=structuredClone(f.doc);
    await assert.rejects(f.act('world_trade',{operation:'borrow',seller:clerk,coins:100,days:30,item:'item_coin_coast',quantity:2},'undervalued-coin-pledge'),/抵押/);
    assert.deepEqual(f.doc,beforePledge);
    const loan=await f.act('world_trade',{operation:'borrow',seller:clerk,coins:100,days:30,item:'item_coin_coast',quantity:3},'bankloan');
    // 15 §15.5: cash1500+50-20-8+58=1580; deposits29 reserve5.8
    // protects6 copper, loanable1574; .015*(1+100/1574).
    assert.equal(loan.monthlyInterest,0.015952986022871662);assert.equal(f.doc.state.records[loan.debt].creditor,bank.id);
    await assert.rejects(f.act('world_trade',{operation:'borrow',seller:clerk,coins:300,days:30},'nopledge'),/抵押/);
    await f.act('world_trade',{seller:clerk,payment:'repay',debt:loan.debt},'bankrepay');
    assert.equal(f.doc.state.inventory.item_coin_coast.quantity,3);assert.equal(cash(f.doc),total);
});

test('登记客房或空屋的旅店民房都能租，房钱沿用原锚点，原酒馆合同不变',async()=>{
    const f=fixture();
    const old=await f.act('world_trade',{seller:host,service:'住宿',days:7},'inn');
    assert.equal(old.cost,world.rules.economy.rentalCopperPerWeek);assert.equal(f.doc.state.records[old.contract].name,'青灯酒馆住宿');assert.equal(f.doc.state.records[old.contract].room,inn);
    f.doc.state.location=home;
    await assert.rejects(f.act('world_trade',{seller:mage,service:'住宿',days:1},'noconsent'),/同意出租/);
    const room=await f.act('world_trade',{seller:mage,service:'住宿',days:2,consent:true},'home');
    assert.equal(room.cost,2*world.rules.economy.rentalCopperPerNight);assert.equal(f.doc.state.records[room.contract].room,home);
    f.doc.state.location=inn;
    await assert.rejects(f.act('world_trade',{seller:worker,service:'住宿'},'none'),/没有登记住宿服务/);
});

test('受雇打工：雇主托管工钱，做满工时后结算并涨雇主营生技能',async()=>{
    const f=fixture(),skill='skill_life_6_core';
    f.doc.state.skills[skill]={proficiency:10,grade:'初级1等',breakthroughs:[],daily:{}};
    await assert.rejects(f.act('world_trade',{operation:'work',seller:worker,consent:true,minutes:240,coins:999},'greedy'),/工钱/);
    const job=await f.act('world_trade',{operation:'work',seller:worker,consent:true,minutes:240},'job');
    assert.equal(job.wage,world.rules.economy.wageCopperPerHalfDay[0]);assert.equal(f.doc.state.player.coins,300+job.wage);
    assert.equal(f.doc.state.npcs[worker].coins,200-job.wage);assert.equal(f.doc.state.records[job.contract].status,'已完成');
    assert.equal(job.skill,skill);assert.ok(job.skillGain>0);assert.equal(f.doc.state.skills[skill].proficiency,10+job.skillGain);
    assert.equal(f.doc.state.minute,600+240);
});

test('合伙：伙伴出资入店，期满按盈亏分成生成应付款，还清后结束；赊购货款改为向供货人借款',async()=>{
    const f=fixture(),total=cash(f.doc);
    const lease=await f.act('world_trade',{operation:'lease',seller:host,consent:true,days:5},'lease');
    const part=await f.act('world_trade',{operation:'partner',business:lease.business,seller:worker,consent:true,coins:30,quantity:50,days:1},'partner');
    assert.equal(f.doc.state.npcs[worker].coins,170);
    await f.act('world_time',{minutes:DAY},'wait');
    const row=f.doc.state.records[part.contract];
    assert.equal(row.status,'已结算');assert.equal(row.profit,0);assert.equal(row.payout,30);
    const owed=f.doc.state.records[row.debt];assert.equal(owed.kind,'partnership');assert.equal(owed.amount,30);
    const partnerCoins=f.doc.state.npcs[worker].coins;
    const paid=await f.act('world_trade',{seller:worker,payment:'repay',debt:row.debt},'payout');
    assert.equal(paid.repaid,owed.amount);assert.equal(f.doc.state.records[row.debt].status,'已还清');
    assert.equal(f.doc.state.npcs[worker].coins,partnerCoins+owed.amount);
    // U17 may escrow the partner's private plea for an ill housemate during the day.
    const personalEscrow=Object.values(f.doc.state.quests).filter(q=>q.personal&&q.publisher===worker).reduce((n,q)=>n+(q.escrow??0),0);
    assert.equal(f.doc.state.npcs[worker].coins+personalEscrow,200);assert.equal(cash(f.doc),total);
    f.doc.state.npcs[host].status='正常';// a day of npc life may have made her ill; the procurement below needs her awake
    // D05 §5.1: even loan-funded procurement has a separate counter destination
    // for cancellation; zero opening capital preserves this loan's cash premise.
    await f.act('world_act',{action:'business:open_counter',slots:{business:lease.business,coins:0}},'credit-counter');
    const before=f.doc.state.npcs[host].coins,cost=await f.act('world_trade',{operation:'procure',business:lease.business,seller:host,consent:true,item:'item_bread',quantity:2,payment:'credit',creditMinutes:3*DAY},'procure');
    assert.ok(cost.debt);assert.equal(f.doc.state.records[cost.debt].principal,cost.cost);assert.equal(f.doc.state.npcs[host].coins,before-cost.cost);
    assert.equal(f.doc.state.records[cost.contract].loan,cost.debt);assert.equal(f.doc.state.records[cost.contract].escrow,cost.cost);
    assert.equal(cash(f.doc),total);
});
