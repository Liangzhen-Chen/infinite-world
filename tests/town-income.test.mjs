import test from 'node:test';
import assert from 'node:assert/strict';
import {incomeFixture,fundedIncomeWorld,incomeProfile,SID,DAY} from './helpers/town-income.mjs';
import {townHouseholds,allocateTownAssets,townGrainBalance,townLaborMinutes,townShareAmount,initializeTownIncome} from '../server-plugin/town-income.mjs';
import {statisticalFoodGroups} from '../server-plugin/household-budget.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {obligationRows,obligationView,obligationAccrued} from '../server-plugin/obligation-state.mjs';
import {registerEarnedClaim} from '../server-plugin/obligation-claims.mjs';
import {assertTransitionInvariants} from '../server-plugin/transition.mjs';

const amount=v=>typeof v==='number'?v:v?.quantity??0;
function privateTotals(f){
 const homes=townHouseholds(f.engine,SID),people=new Set(homes.filter(h=>!h.pending).flatMap(h=>h.members.map(p=>p.id)));
 const actors=[...people].map(id=>f.document.state.npcs[id]).filter(Boolean);
 const accounts=Object.values(f.document.state.records).filter(r=>r.settlement===SID&&r.statisticalPopulation||r.townOpeningHousehold&&homes.some(h=>h.id===r.townOpeningHousehold));
 return [...actors,...accounts].reduce((out,r)=>({coins:out.coins+(r.coins??0),grain:out.grain+amount(r.inventory?.item_oats)}),{coins:0,grain:0});
}
test('formal new opening preserves all existing 2351 copper and private bags, leaving unsupported wealth unknown',async()=>{
 const f=await incomeFixture(),s=f.document.state,opening=s.records['town-income:genesis'].openings.find(r=>r.settlement===SID);
 assert.equal(opening.existingCoins,2351);assert.equal(opening.registeredMoney,null);assert.equal(opening.distributedCoins,0);
 assert.equal(privateTotals(f).coins,2351);
 for(const p of f.engine.world.npcs){assert.equal(s.npcs[p.id].coins,p.coins??0);assert.deepEqual(s.npcs[p.id].inventory,p.inventory??{});}
 assert.equal(initializeTownIncome(f.engine,f.document),f.document,'the opening cannot run twice');
 const groups=statisticalFoodGroups(f.engine,s,SID);assert.ok(groups.length>1);assert.equal(groups.reduce((n,r)=>n+r.beneficiaryUnits,0),694);
 assert.equal(groups.reduce((n,r)=>n+Object.values(r.shares).reduce((n,v)=>n+v.weight,0),0),694);
 await f.act({tool:'world_time',args:{minutes:1},eventId:'open-ledger'});assert.deepEqual(auditLedger(f.document.ledger),[]);
});
test('capital weights distribute every integer remainder; historical grain includes existing stock and never overwrites private property',async()=>{
 const world=await fundedIncomeWorld(),f=await incomeFixture(world),facts=world.townIncome.settlements.find(r=>r.settlement===SID);
 assert.deepEqual(privateTotals(f),{coins:facts.money.value-f.document.state.settlements[SID].treasury,grain:townGrainBalance(facts.grain[0])});
 for(const p of world.npcs){assert.ok(f.document.state.npcs[p.id].coins>=(p.coins??0));for(const [item,v]of Object.entries(p.inventory??{}))assert.ok(amount(f.document.state.npcs[p.id].inventory[item])>=amount(v));}
 const groups=statisticalFoodGroups(f.engine,f.document.state,SID);
 assert.ok(groups.some(r=>r.assetClass==='none'&&r.coins===0));assert.ok(groups.some(r=>r.assetClass==='capital'&&r.coins>0));
 const homes=townHouseholds(f.engine,SID),expected=allocateTownAssets(1009,homes.map(h=>({id:h.id,weight:h.weight})),f.engine.world.settlementProfiles.find(p=>p.id===SID).populationSeed);
 for(const group of groups)for(const house of Object.keys(group.shares))assert.equal(townShareAmount(group,house,group.coins,group.owner,'coins'),expected[house],'each pending household retains its exact opening weight and remainder');
 const first=allocateTownAssets(7,[{id:'a',weight:1},{id:'b',weight:1},{id:'c',weight:1}],'remainders');
 assert.equal(Object.values(first).reduce((a,b)=>a+b),7);assert.ok(Object.values(first).every(n=>n===2||n===3));
 assert.deepEqual(first,allocateTownAssets(7,[{id:'c',weight:1},{id:'b',weight:1},{id:'a',weight:1}],'remainders'));
});
test('real discovery, profile admission and save/load transfer only the household group share once, including earned claims and capacity',async()=>{
 const f=await incomeFixture(await fundedIncomeWorld());
 await f.act({tool:'world_move',args:{destination:'loc_bs_hebu'},eventId:'find-households'});
 let groups=statisticalFoodGroups(f.engine,f.document.state,SID);
 const p=Object.values(f.document.state.created).find(p=>p.generated==='population'&&p.age>=18&&groups.some(g=>g.assetClass==='capital'&&g.shares[p.householdId]));assert.ok(p);
 let group=groups.find(g=>g.shares[p.householdId]);const draft=f.engine.primitiveDraft(f.document);
 // Official earned-claim entry point, including its canonical obligation and
 // compatibility projection; no test writes to a debt or account field.
 registerEarnedClaim(draft,f.engine,{id:'income-earned',kind:'wage',debtor:'npc_hw_yanzhe',creditor:group.owner,amount:127,paid:13,createdAt:f.document.state.minute,deadline:f.document.state.minute+DAY,source:'income-claim'});
 registerEarnedClaim(draft,f.engine,{id:'income-debt',kind:'compensation',debtor:group.owner,creditor:'player',amount:83,paid:7,createdAt:f.document.state.minute,deadline:f.document.state.minute+DAY,terms:{accrual:{value:11,per:'day'}},source:'income-debt'});
 f.replace(draft.document);group=f.document.state.records[group.owner];
 const coins=group.coins,grain=amount(group.inventory.item_oats),expected=townShareAmount(group,p.householdId,coins,group.owner,'coins'),expectedGrain=townShareAmount(group,p.householdId,grain,group.owner,'item_oats'),other=groups.find(g=>g.owner!==group.owner);
 const beforeClaims=obligationRows(f.document.state).reduce((n,r)=>n+obligationView(f.document.state,r).owed,0),otherCoins=other.coins;
 const futureMinutes=[f.document.state.minute+DAY/2,f.document.state.minute+DAY,f.document.state.minute+2*DAY];
 const futureClaims=futureMinutes.map(at=>obligationRows(f.document.state).reduce((n,r)=>n+obligationView(f.document.state,r,at).owed,0));
 await f.act({type:'population_profile',person:p.id,profile:incomeProfile(p)});
 const s=f.document.state,remaining=s.records[group.owner],house=s.family.households[p.householdId];
 assert.equal(s.npcs[p.id].coins,expected);assert.equal(amount(s.npcs[p.id].inventory.item_oats),expectedGrain);
 assert.equal(remaining.coins+s.npcs[p.id].coins,coins);assert.equal(amount(remaining.inventory.item_oats)+expectedGrain,grain);
 assert.equal(s.records[other.owner].coins,otherCoins);assert.equal(house.statisticalGroup,group.owner);
 assert.equal(remaining.beneficiaryUnits+house.statisticalFoodShare,group.beneficiaryUnits);assert.equal(remaining.workCapacity+house.equity.labor.capacity,group.workCapacity);
 assert.equal(obligationRows(s).reduce((n,r)=>n+obligationView(s,r).owed,0),beforeClaims);assert.equal(house.equity.claims.length,2);
 assert.deepEqual(futureMinutes.map(at=>obligationRows(s).reduce((n,r)=>n+obligationView(s,r,at).owed,0)),futureClaims,'materialization must not duplicate or extinguish future accrual');
 f.reload();
 await f.act({tool:'world_time',args:{minutes:1},eventId:'reload'});
 assert.equal(f.document.state.npcs[p.id].coins,expected);assert.deepEqual(f.document.state.family.households[p.householdId].equity,house.equity);
 assert.deepEqual(auditLedger(f.document.ledger),[]);assertTransitionInvariants(f.engine.primitiveDraft(f.document),f.engine);
});
test('daily accounting writes groups rather than pending households; an unfunded group cannot spend another group capital',async()=>{
 const f=await incomeFixture(await fundedIncomeWorld()),groupIds=statisticalFoodGroups(f.engine,f.document.state,SID).map(r=>r.owner);
 const result=await f.act({tool:'world_time',args:{minutes:DAY},eventId:'group-day'});
 const writes=result.patches.filter(p=>p.path[0]==='state'&&String(p.path[2]).startsWith('food-demand:'));
 assert.ok(writes.length);assert.ok(writes.every(p=>p.path[1]==='records'));assert.ok(writes.every(p=>!p.path.slice(3).includes('shares')));
 assert.ok(writes.every(p=>p.path.length>=4&&!p.value?.shares),'daily patches must not serialize the pending household share table');
 assert.deepEqual(statisticalFoodGroups(f.engine,f.document.state,SID).map(r=>r.owner),groupIds);
 const noCapital=statisticalFoodGroups(f.engine,f.document.state,SID).filter(r=>r.assetClass==='none');
 assert.ok(noCapital.every(r=>r.coins===0&&Object.keys(r.inventory).length===0));assert.ok(noCapital.every(r=>r.missingSatiety>0));
 assert.deepEqual(auditLedger(f.document.ledger),[]);
});
test('authored roster property opens in its own purse and bag, then real school admission moves the projection once',async()=>{
 const world=await fundedIncomeWorld(),district='loc_bs_hebu',person=world.residents.find(p=>p.settlement===SID&&!world.npcs.some(n=>n.id===p.id)&&p.age>=18&&world.locations.find(l=>l.id===p.home?.location)?.parent===district),teacher='npc_hw_luqing';
 assert.ok(person);person.coins=17;person.inventory={item_bread:3,item_wood:5};
 // Authored school residence, like the district homes of generated roster
 // households: admission still requires the real teacher to arrive there.
 world.households.find(h=>h.id===person.householdId).homeLocation=district;
 person.home.location=district;
 Object.assign(world.locations.find(l=>l.id===district),{type:'bld',facilityType:'school',capacity:1000,owner:'player'});
 world.npcs.find(p=>p.id===teacher).schedule={default:[{start:0,end:1440,location:district,activity:'trade',services:['trade']}]};
 // Raise finite M by the newly authored 17; it must not be redistributed.
 world.townIncome.settlements.find(r=>r.settlement===SID).money.value+=17;
 const f=await incomeFixture(world);
 assert.equal(f.document.state.records[`town-opening:${person.id}`].coins,17);assert.equal(f.document.state.npcs[person.id],undefined);
 await f.act({tool:'world_time',args:{minutes:DAY},eventId:'roster-teacher-arrives'});
 await f.act({tool:'world_move',args:{destination:district},eventId:'roster-school'});
 await f.act({tool:'world_settlement',args:{operation:'school_open',plot:'skill_literacy',authority:teacher,beneficiaries:[person.id],due:900,minutes:30,days:1,consent:true},eventId:'roster-admit'});
 assert.ok(f.document.state.npcs[person.id].coins>=17);assert.ok(amount(f.document.state.npcs[person.id].inventory.item_wood)>=5);
 assert.equal(f.document.state.records[`town-opening:${person.id}`].coins,0);assert.deepEqual(f.document.state.records[`town-opening:${person.id}`].inventory,{});
 const coins=f.document.state.npcs[person.id].coins;
 f.reload();
 await f.act({tool:'world_time',args:{minutes:1},eventId:'roster-repeat'});assert.equal(f.document.state.npcs[person.id].coins,coins);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
});
test('age and physical ability determine a finite work budget; complementary future interest remains conserved',async()=>{
 const f=await incomeFixture();assert.equal(townLaborMinutes(f.engine,{age:17}),0);assert.equal(townLaborMinutes(f.engine,{age:25}),480);
 assert.ok(townLaborMinutes(f.engine,{age:70})<480);assert.equal(townLaborMinutes(f.engine,{age:25},{status:'昏迷'}),0);
 assert.equal(townLaborMinutes(f.engine,{age:25,attributes:{'体质':0}}),0);
 const base={createdAt:0,terms:{accrual:{value:11,per:'day'}},amount:0};
 assert.equal(obligationAccrued(base,DAY),11);
 // Every supported accrual curve uses the same complementary integer split,
 // so both halves together must always equal the original, before payment.
 for(const minute of [1,1439,1440,5000]){
  const original=obligationAccrued(base,minute),left=obligationAccrued({...base,accrualAllocation:{units:3,total:7,taken:true}},minute),right=obligationAccrued({...base,accrualAllocation:{units:3,total:7,taken:false}},minute);
  assert.equal(left+right,original);
 }
});
test('actual production pays only the working group and materialization transfers nonzero spent work and cumulative earnings once',async()=>{
 const f0=await incomeFixture(),world=structuredClone(f0.engine.world),seller=world.npcs.find(p=>p.id==='npc_hw_yanzhe');
 seller.inventory.item_wood=10;seller.inventory.item_whittling_knife={quantity:1,durability:100};seller.coins=200;
 seller.schedule={default:[{start:0,end:1440,location:SID,activity:'trade',services:['trade']}]};
 world.locations.find(l=>l.id===SID).workstations=[{id:'income-work-bench',kind:'woodworking',owner:seller.id,fee:0,access:'public'}];
 world.rules.economy.shops.stores.find(s=>s.keeper===seller.id).restock.push({item:'item_wooden_peg',source:'route',from:'loc_hw',amount:1,maximum:4});
 const f=await incomeFixture(world);await f.act({tool:'world_time',args:{minutes:DAY},eventId:'income-real-production'});
 let groups=statisticalFoodGroups(f.engine,f.document.state,SID),group=groups.find(g=>g.labor.minutes>0);assert.ok(group);assert.ok(group.labor.paid>0);
 assert.ok(groups.filter(g=>g.owner!==group.owner).every(g=>g.labor.earned===0&&g.coins===0),'a second group cannot claim a shelf already filled by the working group');
 const spent=allocateTownAssets(group.labor.minutes,Object.entries(group.shares).map(([id,s])=>({id,weight:s.workCapacity})),`${group.owner}:labor`);
 const houseId=Object.keys(spent).find(id=>spent[id]>0),home=townHouseholds(f.engine,SID).find(h=>h.id===houseId);assert.ok(home);
 await f.act({tool:'world_move',args:{destination:home.district},eventId:'income-work-discovery'});
 const p=Object.values(f.document.state.created).find(p=>p.householdId===houseId&&p.age>=18);assert.ok(p);
 group=f.document.state.records[group.owner];const minutes=group.labor.minutes,earned=group.labor.earned,paid=group.labor.paid;
 await f.act({type:'population_profile',person:p.id,profile:incomeProfile(p)});
 const h=f.document.state.family.households[houseId],left=f.document.state.records[group.owner];
 assert.ok(h.equity.labor.minutes>0);assert.equal(left.labor.minutes+h.equity.labor.minutes,minutes);
 assert.equal(left.labor.earned+h.equity.earned,earned);assert.equal(left.labor.paid+h.equity.paid,paid);
 assert.ok(BigInt(h.equity.incomeIndex.earned.numerator)>0n);assert.deepEqual(left.incomeIndex,h.equity.incomeIndex);
 f.reload();await f.act({tool:'world_time',args:{minutes:1},eventId:'income-work-reload'});
 assert.deepEqual(f.document.state.family.households[houseId].equity,h.equity);assert.deepEqual(auditLedger(f.document.ledger),[]);
});
