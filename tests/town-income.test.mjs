import test from 'node:test';
import assert from 'node:assert/strict';
import {incomeFixture,incomeProfile,SID,DAY} from './helpers/town-income.mjs';
import {townHouseholds,allocateTownAssets,townGrainBalance,townLaborMinutes,townShareAmount,initializeTownIncome} from '../server-plugin/town-income.mjs';
import {statisticalFoodEngine,statisticalFoodGroups} from '../server-plugin/household-budget.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {obligationRows,obligationView,obligationAccrued} from '../server-plugin/obligation-state.mjs';
import {registerEarnedClaim} from '../server-plugin/obligation-claims.mjs';
import {assertTransitionInvariants} from '../server-plugin/transition.mjs';

import {employmentProductionPlan,settleEmploymentProduction} from '../server-plugin/finance-assets.mjs';
import {settleEmploymentPay} from '../server-plugin/labor-market.mjs';
import {rosterLifeState} from '../server-plugin/population.mjs';
import {holdingSet} from '../server-plugin/holdings.mjs';
import {deriveTownOpening} from '../tools/town-income-opening.mjs';

const amount=v=>typeof v==='number'?v:v?.quantity??0;
function privateTotals(f){
 const homes=townHouseholds(f.engine,SID),people=new Set(homes.filter(h=>!h.pending).flatMap(h=>h.members.map(p=>p.id)));
 const actors=[...people].map(id=>f.document.state.npcs[id]).filter(Boolean);
 const accounts=Object.values(f.document.state.records).filter(r=>r.settlement===SID&&(r.statisticalPopulation||r.townOpeningPerson)||r.townOpeningHousehold&&homes.some(h=>h.id===r.townOpeningHousehold));
 return [...actors,...accounts].reduce((out,r)=>({coins:out.coins+(r.coins??0),grain:out.grain+amount(r.inventory?.item_ration)}),{coins:0,grain:0});
}
test('formal new opening preserves all existing 2351 copper and private bags, adding only the sourced regional remainder',async()=>{
 const f=await incomeFixture(),s=f.document.state,opening=s.records['town-income:genesis'].openings.find(r=>r.settlement===SID);
 assert.equal(opening.existingCoins,2351);assert.equal(opening.registeredMoney,390639);// Household-crafts law: every home gets pot 14 + knife 10 + spoon 8 unless a member already holds that tool; the value stays inside the same M.
 const tools={item_cooking_pot:14,item_kitchen_knife:10,item_wood_spoon:8},holders=h=>Object.keys(tools).filter(i=>!h.members.some(p=>amount((p.inventory??{})[i])>0));
 const owed=townHouseholds(f.engine,SID).map(h=>holders(h)),utensilValue=owed.reduce((n,list)=>n+list.reduce((m,i)=>m+tools[i],0),0);
 assert.equal(300,owed.length);assert.equal(utensilValue,9600,'300 homes x 32; no Baishi household already holds any of the three tools');
 assert.equal(opening.utensilValue,utensilValue);assert.equal(opening.distributedCoins,390639-2351-12000-utensilValue);
 assert.equal(privateTotals(f).coins,390639-12000-utensilValue);
 // TI1b: retain the exact original-property assertions, adding only each
 // owner's independently allocated money and registered purchased rations.
 const homes=townHouseholds(f.engine,SID),facts=f.engine.world.townIncome.settlements.find(r=>r.settlement===SID);
 const allocated=allocateTownAssets(opening.distributedCoins,homes.map(h=>({id:h.id,weight:h.weight})),f.engine.world.settlementProfiles.find(p=>p.id===SID).populationSeed);
 for(const p of f.engine.world.npcs){
  const home=homes.find(h=>h.owner===p.id),inventory=structuredClone(p.inventory??{});
  assert.equal(s.npcs[p.id].coins,(p.coins??0)+(home?allocated[home.id]:0));
  for(const lot of facts.households.find(h=>h.household===home?.id)?.inventory??[])if(lot.quantity.value){const old=inventory[lot.item];inventory[lot.item]={...(typeof old==='object'?old:{}),quantity:amount(old)+lot.quantity.value};}
  const registered=s.records['town-income:genesis'].openings.flatMap(r=>townHouseholds(f.engine,r.settlement)).find(h=>!h.pending&&h.owner===p.id);
  if(registered)for(const item of holders(registered)){const old=inventory[item];inventory[item]={...(typeof old==='object'?old:{}),quantity:amount(old)+1};}
  assert.deepEqual(s.npcs[p.id].inventory,inventory);
 }
 assert.equal(initializeTownIncome(f.engine,f.document),f.document,'the opening cannot run twice');
 const groups=statisticalFoodGroups(f.engine,s,SID);assert.ok(groups.length>1);assert.equal(groups.reduce((n,r)=>n+r.beneficiaryUnits,0),694);
 assert.equal(groups.reduce((n,r)=>n+Object.values(r.shares).reduce((n,v)=>n+v.weight,0),0),694);
 await f.act({tool:'world_time',args:{minutes:1},eventId:'open-ledger'});assert.deepEqual(auditLedger(f.document.ledger),[]);
});
test('capital weights distribute every integer remainder; historical grain includes existing stock and never overwrites private property',async()=>{
 const f=await incomeFixture(),world=f.engine.world,facts=world.townIncome.settlements.find(r=>r.settlement===SID);
 const utensils=f.document.state.records['town-income:genesis'].openings.find(r=>r.settlement===SID).utensilValue;
 assert.deepEqual(privateTotals(f),{coins:facts.money.value-f.document.state.settlements[SID].treasury-utensils,grain:facts.households.reduce((n,h)=>n+h.inventory.filter(r=>r.item==='item_ration').reduce((m,r)=>m+r.quantity.value,0),0)});
 for(const p of world.npcs){assert.ok(f.document.state.npcs[p.id].coins>=(p.coins??0));for(const [item,v]of Object.entries(p.inventory??{}))assert.ok(amount(f.document.state.npcs[p.id].inventory[item])>=amount(v));}
 const groups=statisticalFoodGroups(f.engine,f.document.state,SID);
 // TI1b: even labor households receive the minimum positive weight; wealth is not wages.
 assert.ok(groups.some(r=>r.assetClass==='labor'&&r.coins>0));assert.ok(groups.some(r=>r.assetClass==='large'&&r.coins>0));
 const homes=townHouseholds(f.engine,SID),expected=allocateTownAssets(facts.money.value-2351-12000-utensils,homes.map(h=>({id:h.id,weight:h.weight})),f.engine.world.settlementProfiles.find(p=>p.id===SID).populationSeed);
 for(const group of groups)for(const house of Object.keys(group.shares))assert.equal(townShareAmount(group,house,group.coins,group.owner,'coins'),expected[house],'each pending household retains its exact opening weight and remainder');
 for(const group of groups)for(const house of Object.keys(group.shares))assert.equal(townShareAmount(group,house,amount(group.inventory.item_ration),group.owner,'item_ration'),facts.households.find(h=>h.household===house).inventory[0].quantity.value,'food belongs to its original buyer, not the capital-weighted town pool');
 const first=allocateTownAssets(7,[{id:'a',weight:1},{id:'b',weight:1},{id:'c',weight:1}],'remainders');
 assert.equal(Object.values(first).reduce((a,b)=>a+b),7);assert.ok(Object.values(first).every(n=>n===2||n===3));
 assert.deepEqual(first,allocateTownAssets(7,[{id:'c',weight:1},{id:'b',weight:1},{id:'a',weight:1}],'remainders'));
});
test('real discovery, profile admission and save/load transfer only the household group share once, including earned claims and capacity',async()=>{
 const f=await incomeFixture();
 const district=townHouseholds(f.engine,SID).find(h=>h.pending&&h.assetClass==='large').district;
 await f.act({tool:'world_move',args:{destination:district},eventId:'find-households'});
 let groups=statisticalFoodGroups(f.engine,f.document.state,SID);
 const p=Object.values(f.document.state.created).find(p=>p.generated==='population'&&p.age>=18&&groups.some(g=>g.assetClass==='large'&&g.shares[p.householdId]));assert.ok(p);
 let group=groups.find(g=>g.shares[p.householdId]);const draft=f.engine.primitiveDraft(f.document);
 // Official earned-claim entry point, including its canonical obligation and
 // compatibility projection; no test writes to a debt or account field.
 registerEarnedClaim(draft,f.engine,{id:'income-earned',kind:'wage',debtor:'npc_hw_yanzhe',creditor:group.owner,amount:127,paid:13,createdAt:f.document.state.minute,deadline:f.document.state.minute+DAY,source:'income-claim'});
 registerEarnedClaim(draft,f.engine,{id:'income-debt',kind:'compensation',debtor:group.owner,creditor:'player',amount:83,paid:7,createdAt:f.document.state.minute,deadline:f.document.state.minute+DAY,terms:{accrual:{value:11,per:'day'}},source:'income-debt'});
 f.replace(draft.document);group=f.document.state.records[group.owner];
 const coins=group.coins,grain=amount(group.inventory.item_ration),expected=townShareAmount(group,p.householdId,coins,group.owner,'coins'),expectedGrain=townShareAmount(group,p.householdId,grain,group.owner,'item_ration'),other=groups.find(g=>g.owner!==group.owner);
 const beforeClaims=obligationRows(f.document.state).reduce((n,r)=>n+obligationView(f.document.state,r).owed,0),otherCoins=other.coins;
 const futureMinutes=[f.document.state.minute+DAY/2,f.document.state.minute+DAY,f.document.state.minute+2*DAY];
 const futureClaims=futureMinutes.map(at=>obligationRows(f.document.state).reduce((n,r)=>n+obligationView(f.document.state,r,at).owed,0));
 await f.act({type:'population_profile',person:p.id,profile:incomeProfile(p)});
 const s=f.document.state,remaining=s.records[group.owner],house=s.family.households[p.householdId];
 assert.equal(s.npcs[p.id].coins,expected);assert.equal(amount(s.npcs[p.id].inventory.item_ration),expectedGrain);
 assert.equal(remaining.coins+s.npcs[p.id].coins,coins);assert.equal(amount(remaining.inventory.item_ration)+expectedGrain,grain);
 assert.equal(s.records[other.owner].coins,otherCoins);assert.equal(house.statisticalGroup,group.owner);
 assert.equal(remaining.beneficiaryUnits+house.statisticalFoodShare,group.beneficiaryUnits);assert.equal(remaining.workCapacity+house.equity.labor.capacity,group.workCapacity);
 assert.equal(obligationRows(s).reduce((n,r)=>n+obligationView(s,r).owed,0),beforeClaims);assert.equal(house.equity.claims.length,2);
 assert.deepEqual(futureMinutes.map(at=>obligationRows(s).reduce((n,r)=>n+obligationView(s,r,at).owed,0)),futureClaims,'materialization must not duplicate or extinguish future accrual');
 f.reload();
 await f.act({tool:'world_time',args:{minutes:1},eventId:'reload'});
 assert.equal(f.document.state.npcs[p.id].coins,expected);assert.deepEqual(f.document.state.family.households[p.householdId].equity,house.equity);
 assert.deepEqual(auditLedger(f.document.ledger),[]);assertTransitionInvariants(f.engine.primitiveDraft(f.document),f.engine);
});
test('daily accounting writes groups rather than pending households; each group retains its own opening capital',async()=>{
 const f=await incomeFixture(),before=new Map(statisticalFoodGroups(f.engine,f.document.state,SID).map(g=>[g.owner,{coins:g.coins,food:amount(g.inventory.item_ration)}])),groupIds=statisticalFoodGroups(f.engine,f.document.state,SID).map(r=>r.owner);
 const result=await f.act({tool:'world_time',args:{minutes:DAY},eventId:'group-day'});
 const writes=result.patches.filter(p=>p.path[0]==='state'&&String(p.path[2]).startsWith('food-demand:'));
 assert.ok(writes.length);assert.ok(writes.every(p=>p.path[1]==='records'));assert.ok(writes.every(p=>!p.path.slice(3).includes('shares')));
 assert.ok(writes.every(p=>p.path.length>=4&&!p.value?.shares),'daily patches must not serialize the pending household share table');
 assert.deepEqual(statisticalFoodGroups(f.engine,f.document.state,SID).map(r=>r.owner),groupIds);
 // TI1b: every formal household now has a positive weight and opening cash.
 // Compare every actual group with its own opening; an empty class cannot
 // make isolation pass vacuously, and no occupation creates a wage.
 const after=statisticalFoodGroups(f.engine,f.document.state,SID);assert.ok(after.length>0);
 for(const r of after){assert.equal(r.coins,before.get(r.owner).coins);assert.ok(amount(r.inventory.item_ration)<=before.get(r.owner).food);assert.equal(r.labor.paid,0);}
 assert.deepEqual(auditLedger(f.document.ledger),[]);
});
test('formal roster admission preserves its household private property without duplicating the head purse',async()=>{
 const f=await incomeFixture(),world=f.engine.world,homes=townHouseholds(f.engine,SID);
 const person=world.residents.find(p=>p.settlement===SID&&!world.npcs.some(n=>n.id===p.id)&&p.age>=18),home=homes.find(h=>h.members.some(p=>p.id===person.id));
 // Formal roster people have no authored cash/bag. Their head owns the
 // nonzero opening; admission must neither seize it nor grant it twice.
 assert.ok(person);const opening=f.document.state.npcs[home.owner];assert.ok(opening.coins>0);assert.ok(amount(opening.inventory.item_ration)>0);
 const coins=opening.coins,food=amount(opening.inventory.item_ration),d=f.engine.primitiveDraft(f.document);
 // Formal roster identity and the production family-admission operation:
 // no extra school, teacher schedule, private money or inventory fixture.
 const actor=rosterLifeState(f.engine,f.document.state,person.id,f.document.state.minute,'报名受教');assert.ok(actor);
 holdingSet(d,f.engine,['state','npcs',person.id],actor,'education');f.replace(d.document);
 assert.equal(f.document.state.npcs[person.id].coins,person.coins??0);
 assert.equal(amount(f.document.state.npcs[person.id].inventory.item_ration),0);
 assert.equal(f.document.state.npcs[home.owner].coins,coins);assert.equal(amount(f.document.state.npcs[home.owner].inventory.item_ration),food);
 f.reload();await f.act({tool:'world_time',args:{minutes:1},eventId:'roster-repeat'});
 assert.equal(f.document.state.npcs[person.id].coins,person.coins??0);assert.equal(f.document.state.npcs[home.owner].coins,coins);assert.deepEqual(auditLedger(f.document.ledger),[]);
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
 const f=await incomeFixture();
 let groups=statisticalFoodGroups(f.engine,f.document.state,SID),group=groups.find(g=>g.workCapacity>0),before=new Map(groups.map(g=>[g.owner,g.coins]));
 // TI1b: exercise the real production/pay entry points against existing
 // formal materials, recipe and furnace. No invented bench, stock or payer.
 const draft=f.engine.primitiveDraft(f.document),scoped=statisticalFoodEngine(f.engine,f.document.state),row={id:'income-real-production',recipe:'recipe_s2_pill',owner:'npc_bs_078_1',worker:group.owner,location:'bld_bs_school',wage:30,escrow:0};
 const plan=employmentProductionPlan(draft,scoped,row,{minutes:480,maximum:1});assert.equal(plan.reason,undefined);assert.equal(plan.batches,1);
 const oldMaterial=amount(f.document.state.npcs[row.owner].inventory.item_s2_huangjing),oldPills=amount(f.document.state.npcs[row.owner].inventory.item_s2_pill);
 settleEmploymentProduction(draft,scoped,row,f.document.state.minute,plan);settleEmploymentPay(draft,scoped,row,f.document.state.minute,plan.recipe.minutes);f.replace(draft.document);
 assert.equal(amount(f.document.state.npcs[row.owner].inventory.item_s2_huangjing),oldMaterial-2);assert.equal(amount(f.document.state.npcs[row.owner].inventory.item_s2_pill),oldPills+10);
 groups=statisticalFoodGroups(f.engine,f.document.state,SID);group=groups.find(g=>g.labor.minutes>0);assert.ok(group);assert.ok(group.labor.paid>0);
 assert.ok(groups.filter(g=>g.owner!==group.owner).every(g=>g.labor.earned===0&&g.coins===before.get(g.owner)),'only the actual worker receives the payer transfer');
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

test('formal opening is reproducible from the actual calendar, body, wage, recipes and prices',async()=>{
 const f=await incomeFixture(),facts=f.engine.world.townIncome.settlements.find(r=>r.settlement===SID);
 assert.deepEqual(await deriveTownOpening(f.engine.world,f.engine.rules.townIncome,SID),facts);
 assert.equal(facts.money.value,Math.floor(75002760/480*30/12));
 for(const h of facts.households){assert.equal(h.weight.value,Math.max(1,Math.ceil(h.capital.value)));assert.ok(h.inventory.every(r=>Number.isSafeInteger(r.quantity.value)&&r.quantity.value>=0));}
 assert.equal(townGrainBalance({area:{value:2},historicalYield:{value:100},seasonFactor:{value:1},seed:{value:10},eaten:{value:20},rentTax:{value:30},loss:{value:5}}),135);
});
