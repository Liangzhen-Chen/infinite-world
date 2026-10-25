import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cash,host,worker,clerk,DAY} from './helpers/finance.mjs';
import {laborOffers,laborApplication,advanceLaborMarket,laborNotices,nextLaborMinute} from '../server-plugin/labor-market.mjs';
import {personEmployment,personOccupation,personView,personBusiness} from '../server-plugin/entity-view.mjs';
import {npcSchedule} from '../server-plugin/npc-state.mjs';
import {assertNpcObligationAction} from '../server-plugin/npc-obligations.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {groupAccountView,ensureGroupAccount} from '../server-plugin/group-account.mjs';
import {temples} from '../server-plugin/faith-catalog.mjs';
import {financeTransfer} from '../server-plugin/finance-bank.mjs';
import {advanceLayerPlan} from '../server-plugin/advance-layers.mjs';
import {agriculturalEmployment} from '../server-plugin/employment-state.mjs';
import {advanceNpcSchedules} from '../server-plugin/npc-schedule.mjs';

const mill='bld_hw_mill',recipe='recipe_wooden_pegs',item='item_wooden_peg';
function setup({owner=host,quantity=500}={}){
    const f=fixture({at:mill});f.doc.state.npcs[worker].coins=0;
    f.doc.state.npcs[worker].proficiencies={skill_life_6_core:600};
    f.doc.state.npcs[host].coins=5000;
    f.doc.state.npcs[host].inventory={item_bread:{quantity:20},item_wood:{quantity:100},item_whittling_knife:{quantity:1,durability:100}};
    f.e.byId.get(mill).workstations.find(s=>s.kind==='woodworking').fee=0;
    f.doc.state.npcs[worker].inventory.item_whittling_knife={quantity:1,durability:100};
    const house=f.w.households.find(h=>h.members.includes(worker));house.homeLocation=mill;
    order(f,owner,quantity);
    return f;
}
function order(f,owner,quantity,id='order:test'){
    f.doc.state.records[id]={id,category:'contract',kind:'procurement',parties:['player',owner],subject:item,quantity,fulfilled:0,deadline:30*DAY,location:mill,status:'待履行'};
}
function advance(f,after,{id=`labor:${after}`}={}){
    const before=f.doc.state.minute,beforeState=structuredClone(f.doc.state),d=f.draft();d.set(['state','minute'],after);
    if(f.e.advanceLayerContext?.layers.values().next().value!=='statistics')advanceNpcSchedules(d,f.e,before,after);
    advanceLaborMarket(d,f.e,{before,after,id,beforeState});d.done();
}
function contracts(f){return Object.values(f.doc.state.records).filter(r=>r.laborMarket===1&&r.kind==='workshop');}
function hire(f){advance(f,DAY);return contracts(f).find(r=>r.worker===worker);}
function shift(f,row){advance(f,row.nextWork);return f.doc.state.records[row.id];}

test('真实订单、店铺缺货派生招工；应聘看钱粮、技能、立场及实际距离，读取不写人物',()=>{
    const f=setup(),before=structuredClone(f.doc),offers=laborOffers(f.e,f.doc.state),offer=offers.find(o=>o.source==='order:test');
    assert.ok(offer);assert.ok(laborNotices(f.e,f.doc.state).some(o=>/日薪/.test(o.content)));
    assert.ok(laborApplication(f.e,f.doc.state,worker,offer));assert.deepEqual(f.doc,before);
    f.doc.state.npcs[worker].coins=10000;assert.equal(laborApplication(f.e,f.doc.state,worker,offer),null);
    f.doc.state.npcs[worker].goals={short:[{id:'need',source:'need',kind:'money',content:'还清欠款',progress:0}]};assert.ok(laborApplication(f.e,f.doc.state,worker,offer));
    const relationship=f.e.byId.get(worker).relationships.find(r=>r.with===host),trust=relationship?.trust;
    if(relationship)relationship.trust=-100;
    f.doc.state.records[`standing:${worker}:${host}`]={category:'standing',holder:worker,target:host,value:-100};assert.equal(laborApplication(f.e,f.doc.state,worker,offer),null);delete f.doc.state.records[`standing:${worker}:${host}`];if(relationship)relationship.trust=trust;
    const original=f.e.route;f.e.route=()=>({minutes:90});f.doc.state.npcs[worker].location='bld_hw_post';assert.equal(laborApplication(f.e,f.doc.state,worker,offer),null);f.e.route=original;
    f.doc.state.npcs[worker].location=mill;f.doc.state.npcs[worker].proficiencies.skill_life_6_core=0;f.e.byId.get(recipe).minimumProficiency=1000;assert.equal(laborApplication(f.e,f.doc.state,worker,offer),null);
    const g=setup();delete g.doc.state.records['order:test'];
    g.e.rules.economy.shops.stores.find(s=>s.keeper===host).restock.push({item,source:'local',amount:4,maximum:8});
    assert.ok(laborOffers(g.e,g.doc.state).some(o=>o.reason==='店铺补货'));
});

test('自主签F1合同；实体视图派生职业作息，工时排他，实际工资材料及成品入NPC库存',()=>{
    const f=setup(),money=cash(f.doc),wood=f.doc.state.npcs[host].inventory.item_wood.quantity,row=hire(f);assert.ok(row);
    assert.equal(row.kind,'workshop');assert.equal(personView(f.e,f.doc.state,worker).employment.value.id,row.id);
    f.doc.state.minute=row.starts;assert.match(personOccupation(f.e,f.doc.state,worker).value,/受雇/);
    assert.ok(npcSchedule(f.e,f.doc.state,worker).default.some(s=>s.location===mill&&/受雇/.test(s.activity)));
    assert.equal(personBusiness(f.e,f.doc.state,worker).open.value,false);
    assert.throws(()=>assertNpcObligationAction(f.draft(),f.e,[worker],{start:row.starts,minutes:20}),/雇佣/);
    assert.throws(()=>assertNpcObligationAction(f.draft(),f.e,[worker],{start:row.starts,minutes:20,kind:'meeting'}),/雇佣/);
    assert.doesNotThrow(()=>assertNpcObligationAction(f.draft(),f.e,[worker],{start:row.starts+600,minutes:20}));
    assert.doesNotThrow(()=>assertNpcObligationAction(f.draft(),f.e,[worker],{start:row.starts+240,minutes:60}));
    const next=shift(f,row),produced=next.shifts[0].production;assert.ok(next.workedMinutes>0);assert.ok(next.paid>0);
    assert.equal(f.doc.state.npcs[host].inventory.item_wood.quantity,wood-produced.batches);
    assert.equal(f.doc.state.npcs[host].inventory[item].quantity,next.produced);assert.equal(f.doc.state.inventory[item],undefined);assert.equal(cash(f.doc),money);
    assert.ok(produced.instances.every(id=>f.doc.state.itemInstances[id].owner===host&&f.doc.state.itemInstances[id].maker===worker));
    const before=structuredClone(f.doc);advance(f,f.doc.state.minute);assert.deepEqual(f.doc,before);
});

test('半班缺勤只计实际工时，拘押及照护期间不产出、不付薪；自主工作不能抢占排班',()=>{
    const f=setup(),row=hire(f);f.doc.state.npcs[worker].caring={location:mill};advance(f,row.starts+240);delete f.doc.state.npcs[worker].caring;
    const next=shift(f,row);assert.ok(next.workedMinutes<=240&&next.workedMinutes>0);assert.ok(next.shifts[0].earned<=Math.ceil(row.wage/2));
    const g=setup(),j=hire(g);g.doc.state.records.hold={category:'legal_custody',subject:worker,status:'生效',location:mill,expires:j.nextWork+DAY};
    const before=g.doc.state.npcs[host].inventory.item_wood.quantity,stopped=shift(g,j);assert.equal(stopped.paid,0);assert.equal(stopped.produced,0);assert.equal(g.doc.state.npcs[host].inventory.item_wood.quantity,before);
    const h=setup(),job=hire(h);h.doc.state.npcAutonomy={tasks:{busy:{npc:worker,status:'进行中',start:job.starts,finish:job.nextWork,action:{kind:'craft'}}}};assert.equal(shift(h,job).paid,0);
});

test('实际赶路的迟到分钟不计工资；上午已做工、下午照护仍保留上午应得工钱',()=>{
    const f=setup(),row=hire(f);f.doc.state.minute=row.starts;f.doc.state.npcs[worker].location=null;
    f.doc.state.npcs[worker].scheduleTravel={from:'bld_hw_post',to:mill,depart:row.starts,arrive:row.starts+60,edges:[]};
    const next=shift(f,row);assert.equal(next.attendance[1],420);assert.ok(next.workedMinutes<=420&&next.workedMinutes>400);assert.ok(next.paid<row.wage);
    const g=setup(),j=hire(g);advance(g,j.starts+240);g.doc.state.npcs[worker].caring={location:mill};
    const partial=shift(g,j);assert.equal(partial.attendance[1],240);assert.ok(partial.paid>0&&partial.paid<=Math.ceil(j.wage/2));
});

test('完工后欠薪生成真实债务、停工、投诉立案、离职；债权与库存均不丢失',()=>{
    const f=setup(),row=hire(f),money=cash(f.doc),coins=f.doc.state.npcs[host].coins;f.doc.state.npcs[host].coins=0;f.doc.state.player.coins+=coins;
    let next=shift(f,row);assert.equal(next.status,'罢工');assert.ok(next.produced>0);assert.equal(next.paid,0);
    const debt=Object.values(f.doc.state.records).find(r=>r.kind==='wage');assert.ok(debt);assert.equal(debt.amount,next.shifts[0].earned);assert.equal(cash(f.doc),money);
    advance(f,row.nextWork+3*DAY);next=f.doc.state.records[row.id];assert.equal(next.status,'已辞工');assert.equal(personEmployment(f.e,f.doc.state,worker),null);
    assert.ok(f.doc.state.records[debt.id].defaulted.case);const legal=f.doc.state.records[f.doc.state.records[debt.id].defaulted.case];assert.equal(legal.victim,worker);assert.equal(legal.offender,host);assert.ok(legal.evidence.some(e=>e.kind==='contract'));
    assert.ok(f.doc.state.npcs[host].inventory[item].quantity>0);assert.equal(cash(f.doc),money);
});

test('玩家可查看招工、出资担保与当面调解；担保用完不印钱，欠薪清偿关闭原诉讼',async()=>{
    const f=setup(),row=hire(f),money=cash(f.doc),coins=f.doc.state.npcs[host].coins;f.doc.state.player.coins+=coins;f.doc.state.npcs[host].coins=0;
    const seen=await f.act({operation:'labor_inspect',seller:host},'see');assert.ok(seen.contracts.some(r=>r.id===row.id));
    await f.act({operation:'labor_guarantee',seller:host,contract:row.id,coins:row.wage},'guarantee');assert.equal(cash(f.doc),money);
    let next=shift(f,f.doc.state.records[row.id]);assert.equal(next.paid,row.wage);assert.equal(next.escrow,0);assert.equal(cash(f.doc),money);
    next=shift(f,next);assert.equal(next.status,'罢工');advance(f,next.nextWork+DAY);
    const debt=Object.values(f.doc.state.records).find(r=>r.kind==='wage'),due=debt.amount-debt.paid;
    const funding=f.draft();financeTransfer(funding,f.e,'player',host,due,'mediate-funding');funding.done();
    await assert.rejects(f.act({operation:'labor_mediate',seller:host,contract:row.id},'no-consent'),/同意/);
    await f.act({operation:'labor_mediate',seller:host,contract:row.id,consent:true,coins:row.wage},'mediate');assert.equal(f.doc.state.records[debt.id].status,'已还清');assert.equal(cash(f.doc),money);
    const q=await f.act({operation:'inspect'},'notices','world_quest');assert.ok(Array.isArray(q.notices));
});

test('工匠接受更好的真实订单雇主，旧合同离职，欠薪仍可追偿；无需求不能挖人',async()=>{
    const f=setup(),row=hire(f);f.doc.state.npcs[clerk].inventory=structuredClone(f.doc.state.npcs[host].inventory);f.doc.state.npcs[clerk].coins=5000;order(f,clerk,500,'order:new');
    await assert.rejects(f.act({operation:'labor_poach',seller:worker,contract:row.id,business:clerk,consent:true},'low-wage'),/不接受/);
    const fresh=await f.act({operation:'labor_poach',seller:worker,contract:row.id,business:clerk,coins:row.wage*2,consent:true},'poach');
    assert.equal(f.doc.state.records[row.id].status,'已辞工');assert.equal(f.doc.state.records[fresh.contract].owner,clerk);assert.equal(personEmployment(f.e,f.doc.state,worker).value.owner,clerk);
    assert.equal(contracts(f).filter(c=>['有效','要求加薪','罢工'].includes(c.status)&&c.worker===worker).length,1);
    delete f.doc.state.records['order:test'];for(const stock of f.e.rules.economy.shops.stores.find(s=>s.keeper===host).restock)f.doc.state.npcs[host].inventory[stock.item]={quantity:stock.maximum};
    await assert.rejects(f.act({operation:'labor_poach',seller:worker,contract:fresh.contract,business:host,coins:row.wage*3,consent:true},'no-demand'),/缺口/);
});

test('欠薪后换雇主仍按原合同投诉，调解可还旧薪且不恢复旧排班',async()=>{
    const f=setup(),old=hire(f),coins=f.doc.state.npcs[host].coins;f.doc.state.npcs[host].coins=0;f.doc.state.player.coins+=coins;
    shift(f,old);const debt=Object.values(f.doc.state.records).find(r=>r.kind==='wage');assert.ok(debt);
    f.doc.state.npcs[clerk].inventory={item_bread:{quantity:20},item_wood:{quantity:100},item_whittling_knife:{quantity:1,durability:100}};f.doc.state.npcs[clerk].coins=5000;order(f,clerk,500,'order:new');
    const fresh=await f.act({operation:'labor_poach',seller:worker,contract:old.id,business:clerk,coins:old.wage*2,consent:true},'switch-unpaid');
    advance(f,old.nextWork+3*DAY);assert.ok(f.doc.state.records[debt.id].defaulted.case);assert.equal(f.doc.state.records[old.id].status,'已辞工');
    const due=debt.amount-debt.paid,funding=f.draft();financeTransfer(funding,f.e,'player',host,due,'old-wage-funding');funding.done();
    await f.act({operation:'labor_mediate',seller:host,contract:old.id,consent:true},'pay-old');
    assert.equal(f.doc.state.records[debt.id].status,'已还清');assert.equal(f.doc.state.records[old.id].status,'已辞工');assert.equal(personEmployment(f.e,f.doc.state,worker).value.id,fresh.contract);
});

test('组织与寺观由真实订单或工程招工，工资走公库，成品回真实公库；工程按工时完成',()=>{
    const f=setup(),org=f.w.factions[0];delete f.doc.state.records['order:test'];
    f.doc.state.npcs[org.leader]={location:mill,status:'正常',coins:0,inventory:{},memoryStream:[]};
    f.e.byId.get(org.leader).schedule={default:[{start:0,end:1440,location:mill,activity:'营业',services:[]}]};
    org.resources.items={item_wood:100};order(f,org.id,100);
    const row=hire(f);assert.ok(row);assert.equal(row.owner,org.id);const before=groupAccountView(f.e,f.doc.state,org.id).coins;
    const next=shift(f,row),account=groupAccountView(f.e,f.doc.state,org.id);assert.equal(account.coins,before-next.paid);assert.equal(account.items[item],next.produced);assert.ok(account.items.item_wood<100);
    const g=setup();delete g.doc.state.records['order:test'];g.doc.state.projects.p={id:'p',type:'工程',creator:host,location:mill,settlement:'loc_hw',remainingDays:2,remainingWork:2,status:'施工中'};
    const job=hire(g);assert.ok(job.project);shift(g,job);assert.equal(g.doc.state.projects.p.remainingWork,1);assert.equal(g.doc.state.projects.p.laborMinutes,480);
});

test('店铺缺货雇人从同聚落真实商人补货，路程占工时，货款和工资分别转账',()=>{
    const f=setup();delete f.doc.state.records['order:test'];
    f.doc.state.npcs[host].workplace={location:mill};
    f.doc.state.npcs[worker].inventory={item_whittling_knife:{quantity:1,durability:100}};
    f.doc.state.npcs[clerk].inventory.item_bread={quantity:40};f.e.byId.get(clerk).services=['trade'];
    const store=f.e.rules.economy.shops.stores.find(s=>s.keeper===host);
    for(const r of store.restock)f.doc.state.npcs[host].inventory[r.item]={quantity:r.item==='item_bread'?0:r.maximum};
    const money=cash(f.doc),job=hire(f);assert.ok(job.supplier);assert.equal(job.task,'店铺补货');
    const before=f.doc.state.npcs[job.supplier].inventory.item_bread.quantity,next=shift(f,job);
    assert.equal(next.produced,6,JSON.stringify(next));assert.equal(f.doc.state.npcs[host].inventory.item_bread.quantity,6);assert.equal(f.doc.state.npcs[job.supplier].inventory.item_bread.quantity,before-6);
    assert.equal(next.workedMinutes,30);assert.equal(next.paid,Math.ceil(next.wage*30/480));assert.equal(cash(f.doc),money);
});

test('寺观公库与自建组织均能签NPC合同；当前代表失能后不再招工',()=>{
    const f=setup(),temple=temples(f.e).find(t=>t.source==='temple');assert.ok(temple);delete f.doc.state.records['order:test'];
    f.doc.state.npcs[temple.teacher]={location:mill,status:'正常',coins:0,inventory:{},memoryStream:[]};
    f.e.byId.get(temple.teacher).schedule={default:[{start:0,end:1440,location:mill,activity:'主持工程',services:[]}]};
    let d=f.draft();ensureGroupAccount(d,f.e,temple.id);financeTransfer(d,f.e,'player',temple.id,1000,'temple-fund');d.done();
    f.doc.state.projects.temple={id:'temple',type:'工程',creator:temple.id,location:mill,settlement:'loc_hw',remainingDays:2,remainingWork:2,status:'施工中'};
    const money=cash(f.doc),job=hire(f);assert.ok(job,JSON.stringify({contracts:contracts(f),offers:laborOffers(f.e,f.doc.state)}));assert.equal(job.owner,temple.id);const next=shift(f,job);assert.equal(groupAccountView(f.e,f.doc.state,temple.id).coins,1000-next.paid);assert.equal(cash(f.doc),money);
    const g=setup();delete g.doc.state.records['order:test'];
    g.doc.state.records['organization:org_test']={category:'organization',id:'org_test',source:'created',name:'试工行',kind:'行会',seat:mill,leader:host,members:{[host]:{position:'会长'}},charter:{},treasury:1000,items:{item_wood:100},ledger:[]};
    order(g,'org_test',100);const j=hire(g);assert.ok(j);assert.equal(j.owner,'org_test');shift(g,j);assert.ok(g.doc.state.records['organization:org_test'].items[item]>0);
    g.doc.state.records[j.id].status='已辞工';g.doc.state.npcs[host].status='昏迷';assert.ok(!laborOffers(g.e,g.doc.state).some(o=>o.owner==='org_test'));
});

test('季节与作物事实派生农忙招工，已履行工时进入农事日结口径，过季告示消失',()=>{
    const f=setup();delete f.doc.state.records['order:test'];f.doc.state.npcs[host].occupation='农夫';
    const farm=f.doc.state.records['agriculture:loc_hw'];assert.ok(farm);farm.mode='managed';farm.field.cohorts=[{areaUnits:1400,harvestedUnits:0,ready:true}];f.doc.state.records['levy:loc_hw']={count:1};
    const offers=laborOffers(f.e,f.doc.state);assert.ok(offers.some(o=>o.reason==='作物已熟'));
    f.doc.state.records.labor={id:'labor',kind:'workshop',laborMarket:1,farm:'loc_hw',worker,settlement:'loc_hw',attendance:{1:240},shifts:[{start:DAY+480,minutes:240}]};
    assert.equal(agriculturalEmployment(f.doc.state,'loc_hw',1).hired,.5);
    farm.field.cohorts=[];farm.field.seedBank=0;assert.ok(!laborOffers(f.e,f.doc.state).some(o=>o.farm==='loc_hw'));
});

test('远方统计层按聚合工时履约；不插入逐人结算边界，结算结果与逐日层一致',()=>{
    const near=setup(),remote=setup();
    // The same supported employer and worker are observed from a disconnected county.
    const county=remote.w.regions.find(r=>r.category==='county'&&r.id!==remote.e.byId.get('loc_hw')?.region);assert.ok(county);
    const plan=advanceLayerPlan(remote.e,remote.doc.state),actual=plan.countyOf(mill);assert.ok(actual);
    remote.e.advanceLayerContext={...plan,layers:new Map([...plan.layers].map(([k])=>[k,'statistics']))};
    // Recruit on the weekly boundary, then accrue identical daily hours.
    advance(near,7*DAY);advance(remote,7*DAY);let a=contracts(near).find(r=>r.worker===worker),b=contracts(remote).find(r=>r.worker===worker);assert.ok(a&&b);
    const d=remote.draft();assert.equal(nextLaborMinute(remote.e,d,7*DAY),14*DAY);
    for(let day=7;day<14;day++){advance(near,day*DAY+1020);advance(remote,day*DAY+1020);advance(near,(day+1)*DAY);advance(remote,(day+1)*DAY);}
    a=near.doc.state.records[a.id];b=remote.doc.state.records[b.id];assert.equal(b.workedMinutes,a.workedMinutes);assert.equal(b.paid,a.paid);assert.equal(b.produced,a.produced);assert.ok(b.shifts.some(s=>s.aggregate));assert.equal(b.aggregateMinutes,b.workedMinutes);
});

test('world_time推进真实撮合与履约',async()=>{
    const f=setup();await f.act({minutes:DAY-f.doc.state.minute},'day','world_time');const row=contracts(f).find(r=>r.worker===worker);assert.ok(row);
    await f.act({minutes:row.nextWork-f.doc.state.minute},'work','world_time');assert.ok(f.doc.state.records[row.id].paid>0);
});

test('一个长推进内同岗位再次招人保留旧合同、签约事实与工资记录',()=>{
    const f=setup({quantity:4});advance(f,DAY,{id:'long'});const first=contracts(f).find(r=>r.worker===worker);assert.ok(first);
    advance(f,first.nextWork,{id:'long'});const completed=structuredClone(f.doc.state.records[first.id]);assert.equal(completed.status,'已完成');
    delete f.doc.state.npcs[host].inventory[item];f.doc.state.npcs[worker].coins=0;advance(f,2*DAY,{id:'long'});
    const jobs=contracts(f).filter(r=>r.worker===worker);assert.equal(jobs.length,2);assert.notEqual(jobs[0].id,jobs[1].id);assert.deepEqual(f.doc.state.records[first.id],completed);
});

test('其他来源已经补齐订单或货架时，不再凭旧招聘重复消耗材料与造货',()=>{
    const f=setup(),row=hire(f);f.doc.state.npcs[host].inventory[item]={quantity:500};const wood=f.doc.state.npcs[host].inventory.item_wood.quantity;
    const next=shift(f,row);assert.equal(next.status,'已完成');assert.equal(next.produced,0);assert.equal(next.paid,0);assert.equal(f.doc.state.npcs[host].inventory.item_wood.quantity,wood);assert.equal(f.doc.state.npcs[host].inventory[item].quantity,500);
});
