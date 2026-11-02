import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {advanceHouseholdMeals} from '../server-plugin/npc-life.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {advanceCustomerFlow} from '../server-plugin/business.mjs';
import {bag,granary} from '../server-plugin/stock.mjs';
import {CampaignStorage} from '../server-plugin/storage.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',seller='npc_hw_linsui',item='item_bread',home='bld_hw_qingdeng',DAY=1440;
function fixture({publicFood=0,granaryEnabled=false,bread=2,shared=true,market=false,drainMultiplier=1,guest=false,population=2}={}){
 const w=structuredClone(world),members=[A,B];
 // This fixture isolates ration/private-bag arithmetic with no external
 // commons or water service. K16 source/finite-stock tests cover those paths.
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 // The fixture contains only the two examined mouths (and optional seller).
 // K16 also feeds registered roster-only homes: retaining unrelated catalog
 // households would silently add their mouths to this two-person hand anchor.
 w.households=[];
 for(const [i,group]of (shared?[members]:members.map(id=>[id])).entries())w.households.push({id:`meal-house-${i}`,members:group,settlement:'loc_hw',homeLocation:home});
 // The seller exists in campaign state only in the market/guest editions.
 // An absent seller must not add a third registered mouth to public ration math.
 if(market&&!guest)w.households.push({id:'meal-seller',members:[seller],settlement:'loc_hw',homeLocation:home});
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 w.items.find(i=>i.id===item).nutrition={satiety:30};
 if(drainMultiplier!==1)w.derived.modifiers.push({id:'meal-drain-premise',pack:'core',target:'body:drain',stage:'mul',value:drainMultiplier});
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 if(market)for(const n of w.npcs.filter(n=>[A,seller].includes(n.id))){n.tier='full';n.schedule={default:[{start:0,end:1440,location:home,activity:'休息',services:n.id===seller?['trade']:[]}]};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'household-meals');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries((market||guest?[A,B,seller]:members).map(id=>[id,{...doc.state.npcs[id],coins:id===A?10000:0,inventory:{},location:home,status:'正常',activity:'休息'}]));
 doc.state.npcs[A].inventory={[item]:bread};
 if(market)doc.state.npcs[seller].inventory={[item]:100};
 if(guest)doc.state.npcs[seller].inventory={[item]:2};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population,granary:granaryEnabled,food:publicFood,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const meals=d=>Object.values(d.get('state','family','meals')??{});
const assertLedger=ledger=>assert.deepEqual(auditLedger(ledger),[]);

test('unchanged fed households keep one receipt while a compact saved watermark prevents duplicate consumption',()=>{
 const f=fixture({granaryEnabled:true,publicFood:100,bread:4});
 // Hand anchor: two public portions/day consume4 over two days; private4
 // breads stay untouched, and an identical second-day receipt needs no write.
 f.e.advance(f.d,DAY,'steady-one');const receipt=JSON.stringify(meals(f.d)),start=f.d.patches.length;
 f.e.advance(f.d,DAY,'steady-two');
 assert.equal(JSON.stringify(meals(f.d)),receipt);
 assert.equal(f.d.get('state','family','mealDays','loc_hw'),1);
 assert.equal(f.d.patches.slice(start).filter(p=>p.path?.slice(0,3).join('.')==='state.family.meals').length,0);
 assert.equal(f.e.quantity(f.d,A,item),4);assert.equal(f.d.get('state','settlements','loc_hw','food'),96);
 const saved=f.e.primitiveDraft(JSON.parse(JSON.stringify(f.d.document))),once=JSON.stringify(saved.document);
 advanceHouseholdMeals(saved,f.e,1);assert.equal(JSON.stringify(saved.document),once);assertLedger(saved.get('ledger'));
});

test('legacy per-household day receipts remain a duplicate guard until the next real meal',()=>{
 const f=fixture({bread:8});advanceHouseholdMeals(f.d,f.e,1);
 const [key,record]=Object.entries(f.d.get('state','family','meals'))[0];
 f.d.set(['state','family','meals',key],{...record,day:1});
 f.d.set(['state','family','mealDays','loc_hw'],0);
 const loaded=f.e.primitiveDraft(JSON.parse(JSON.stringify(f.d.document))),once=JSON.stringify(loaded.document);
 advanceHouseholdMeals(loaded,f.e,1);assert.equal(JSON.stringify(loaded.document),once);
 // Legacy day1 already consumed4 of8; day2 consumes the remaining4 once.
 advanceHouseholdMeals(loaded,f.e,2);assert.equal(f.e.quantity(loaded,A,item),0);
 assert.equal(loaded.get('state','family','mealDays','loc_hw'),2);
 assert.equal(Object.hasOwn(meals(loaded)[0],'day'),false);assertLedger(loaded.get('ledger'));
});

test('two mouths need120; public ration60 plus two breads30 feeds them without charging the granary twice',()=>{
 const f=fixture({granaryEnabled:true,publicFood:1});
 // Hand anchor: one of two daily public portions =60; private2*30=60.
 f.e.advance(f.d,DAY,'one-meal-day');
 const r=meals(f.d).find(r=>r.members.includes(A));
 assert.equal(r.needs.satiety,120);assert.equal(r.publicNutrition.satiety,60);
 assert.deepEqual(r.consumed,[{holder:A,item,quantity:2}]);assert.equal(r.shortfall.satiety,0);
 assert.equal(f.d.get('ledger','flows',`sink:consume|${granary(f.e,'loc_hw').split('|')[1]}|meal`),1);
 assert.equal(f.d.get('ledger','flows',`sink:consume|${item}|meal`),2);
 assert.equal(f.d.get('state','settlements','loc_hw','food'),0);assert.equal(f.d.get('state','settlements','loc_hw','unmetMeals'),0);
 assertLedger(f.d.get('ledger'));
});

test('cities without public grain record real missing meals; food closes only the deficit it can feed',()=>{
 for(const bread of [0,2,4]){
  const f=fixture({bread}),publicBefore=['unmetMeals','starvation'].map(k=>f.d.get('state','settlements','loc_hw',k));
  f.e.advance(f.d,DAY,`city:${bread}`);
  // Hand anchor:120 -30*bread, each missing daily meal=60 satiety.
  const r=meals(f.d)[0];assert.equal(r.shortfall.satiety,120-30*bread);
  assert.equal(r.missingMeals,2-bread/2);
  // D1 / 4c972af1: no public granary means no settlement ration tally.
  // The real 120-30*bread shortfall remains on the household receipt above;
  // it must not create public starvation or count the city's abstract mouths.
  assert.deepEqual(['unmetMeals','starvation'].map(k=>f.d.get('state','settlements','loc_hw',k)),publicBefore);
  assert.equal(f.d.get('state','settlements','loc_hw','food'),0);assertLedger(f.d.get('ledger'));
 }
});

test('higher body drain cannot create extra nutrition from an unchanged public portion',()=>{
 const f=fixture({granaryEnabled:true,publicFood:2,drainMultiplier:1.5});
 // Hand anchor: two bodies need2*90=180; two standard public portions
 // supply2*60=120, so two breads30 must still be physically consumed.
 f.e.advance(f.d,DAY,'higher-drain');const r=meals(f.d)[0];
 assert.equal(r.needs.satiety,180);assert.equal(r.publicNutrition.satiety,120);
 assert.deepEqual(r.consumed,[{holder:A,item,quantity:2}]);assert.equal(r.shortfall.satiety,0);
 assert.equal(f.e.quantity(f.d,A,item),0);assertLedger(f.d.get('ledger'));
});

test('an unregistered visitor uses a private bag instead of duplicating residents’ public portions',()=>{
 const f=fixture({granaryEnabled:true,publicFood:2,bread:4,guest:true});
 // Hand anchor: two resident portions120, plus guest's two breads60=180.
 f.e.advance(f.d,DAY,'guest-meal');const rows=meals(f.d),visitor=rows.find(r=>r.owner===seller);
 assert.equal(rows.reduce((n,r)=>n+r.publicNutrition.satiety,0),120);
 assert.equal(visitor.publicNutrition.satiety,0);assert.deepEqual(visitor.consumed,[{holder:seller,item,quantity:2}]);
 assert.equal(f.e.quantity(f.d,A,item),4);assert.equal(f.e.quantity(f.d,seller,item),0);assertLedger(f.d.get('ledger'));
});

test('a low aggregate population cannot turn one consumed public portion into two',()=>{
 const f=fixture({granaryEnabled:true,publicFood:1,population:1});
 // Hand anchor: registered mouths2 exceed aggregate1. One real portion60
 // still supplies only60; private2*30 fills the remaining60.
 f.e.advance(f.d,DAY,'cohort-cap');const r=meals(f.d)[0];
 assert.equal(r.publicNutrition.satiety,60);assert.deepEqual(r.consumed,[{holder:A,item,quantity:2}]);
 assert.equal(r.shortfall.satiety,0);assert.equal(f.d.get('state','settlements','loc_hw','unmetMeals'),0);assertLedger(f.d.get('ledger'));
});

test('shared bags settle once per household/day, while separate households never take each other’s food',()=>{
 for(const shared of [true,false]){
  const f=fixture({shared,bread:4});advanceHouseholdMeals(f.d,f.e,0);const once=JSON.stringify(f.d.document);
  advanceHouseholdMeals(f.d,f.e,0);assert.equal(JSON.stringify(f.d.document),once);
  // Hand anchor: sharing feeds2 with4 breads; separate A eats2, B misses1.
  assert.equal(f.e.quantity(f.d,A,item),shared?0:2);
  assert.equal(meals(f.d).reduce((n,r)=>n+r.missingMeals,0),shared?0:1);
  assertLedger(f.d.get('ledger'));
 }
});

test('saved/reloaded meal settlement and replay keep the same inventory, records and conserved ledger',()=>{
 const f=fixture({bread:8}),g=fixture({bread:8});
 // Hand anchor: two days120*2 consume8 breads, with each day settled once.
 f.e.advance(f.d,2*DAY,'whole');g.e.advance(g.d,DAY,'split');
 const saved=JSON.parse(JSON.stringify(g.d.document)),reloaded=g.e.primitiveDraft(saved);
 g.e.advance(reloaded,DAY,'split-after-save');
 assert.deepEqual(meals(f.d),meals(reloaded));assert.equal(f.e.quantity(f.d,A,item),0);assert.equal(g.e.quantity(reloaded,A,item),0);
 assert.deepEqual(f.d.get('ledger','accounts',bag(f.e,A,item)),reloaded.get('ledger','accounts',bag(g.e,A,item)));
 assertLedger(reloaded.get('ledger'));
 const replay=fixture({bread:8});replay.e.advance(replay.d,2*DAY,'whole');assert.deepEqual(replay.d.document,f.d.document);
});

test('buy→eat→buy uses the existing noon market, pays real coins and restores procurement demand',()=>{
 const f=fixture({market:true,bread:0});
 f.d.set(['state','minute'],720);advanceCustomerFlow(f.d,f.e,719,720);
 const bought=()=>Object.values(f.d.get('state','records')).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits).filter(r=>r.npc===A&&r.outcome==='bought');
 assert.ok(bought().length);const cash=f.d.get('state','npcs',A,'coins'),stock=f.e.quantity(f.d,A,item);
 assert.ok(stock>=4);advanceHouseholdMeals(f.d,f.e,0);
 // Hand anchor: daily120/30 consumes4; physical demand rises by120.
 assert.equal(f.e.quantity(f.d,A,item),stock-4);
 assert.ok(householdResources(f.d,f.e,A).procurementShortfall.satiety>0);
 f.d.set(['state','minute'],DAY+720);advanceCustomerFlow(f.d,f.e,DAY+719,DAY+720);
 assert.ok(bought().length>=2);assert.ok(f.d.get('state','npcs',A,'coins')<cash);assert.ok(f.e.quantity(f.d,A,item)>stock-4);
 assertLedger(f.d.get('ledger'));
});

test('native storage restart, export/import and rollback retain meals and never consume a saved day twice',async t=>{
 const f=fixture({bread:8}),directory=await fs.mkdtemp(path.join(tmpRoot(),'household-meals-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(doc,input)=>f.e.reduce(doc,input),store=new CampaignStorage(directory,{reducer});
 await store.create({id:'meals',worldVersion:f.e.world.version,document:f.doc});
 await store.transact('meals',{id:'day1',anchor:'day1',input:{tool:'world_time',args:{minutes:DAY},eventId:'day1'}},reducer);
 const saved=(await store.read('meals')).document;
 const restarted=new CampaignStorage(directory,{reducer});assert.deepEqual((await restarted.read('meals')).document,saved);
 assert.deepEqual((await restarted.import(await restarted.export('meals'),'copy')).document,saved);
 const draft=f.e.primitiveDraft(saved),once=JSON.stringify(draft.document);advanceHouseholdMeals(draft,f.e,0);
 assert.equal(JSON.stringify(draft.document),once);
 // Hand anchor:8 opening breads -4 eaten=4; rollback restores the original8.
 assert.equal(f.e.quantity(draft,A,item),4);assertLedger(draft.get('ledger'));
 assert.deepEqual((await restarted.reconcile('meals',[],null)).document,f.doc);
});

test('nutrition properties and existing commitments decide what is edible, regardless of item name',()=>{
 const f=fixture({bread:6}),other='item_staff';
 // Hand anchor:6 bread -3 promised leaves3*30=90; a nutritious staff
 // supplies the remaining30 while three promised breads stay in the bag.
 f.e.byId.get(other).nutrition={satiety:30};
 f.d.set(['state','npcs',A,'inventory',other],1);
 f.d.set(['state','obligations','meal-promise'],{id:'meal-promise',kind:'forward',debtor:A,creditor:seller,resource:item,amount:3,status:'pending',deadline:DAY});
 f.d.set(['ledger'],openLedger(f.e,f.d.document));advanceHouseholdMeals(f.d,f.e,0);
 assert.equal(f.e.quantity(f.d,A,item),3);assert.equal(f.e.quantity(f.d,A,other),0);
 assert.equal(meals(f.d)[0].shortfall.satiety,0);assertLedger(f.d.get('ledger'));
});

test('unsafe instances stay uneaten and do not prevent safe food in the same bag being consumed',()=>{
 const f=fixture({bread:4}),ids=['bad','good1','good2','good3'];
 for(const id of ids)f.d.set(['state','itemInstances',id],{id,item,owner:A,status:'持有',toxic:id==='bad'});
 f.d.set(['state','npcs',A,'inventory',item],{quantity:4,instances:ids});
 // Hand anchor:three safe breads supply90, leaving30 missing and one bad.
 advanceHouseholdMeals(f.d,f.e,0);
 assert.equal(f.e.quantity(f.d,A,item),1);assert.equal(f.d.get('state','itemInstances','bad','status'),'持有');
 assert.equal(meals(f.d)[0].shortfall.satiety,30);assertLedger(f.d.get('ledger'));
});
