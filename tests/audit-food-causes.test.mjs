// The closing food audit: each of the four causes is reachable from a small fixture and classified by the
// card's definitions; undeterminable cases say so instead of getting a default; books reconcile with
// difference 0 (and a perturbed ledger is caught); a short real-engine window is deterministic and partitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runAudit,verdict,buildFacts,reconcileBooks} from '../tools/audit-food-causes.mjs';

// One open own-settlement shop holding 100 satiety of food; a person-day costs 5 coins; the household has 50 coins.
const shelf=(over={})=>({shopId:'shop_a',sameSettlement:true,engineServes:true,toll:0,items:[{item:'item_bread',avail:20,cost:5,bought:0,...over}]});
const snap=(over={})=>({supply:100,demand:10,refCost:4,cash:50,declined:null,townShops:{total:1,open:1},reach:[shelf()],...over});
const cause=over=>verdict(buildFacts(snap(over))).cause;

test('harvest: saleable food within a day is less than the town demand',()=>{
 assert.equal(cause({supply:5}),'harvest');
 assert.equal(cause({supply:5,cash:0,reach:[]}),'harvest');// shortage outranks poverty and chain
});
test('poverty: household cash cannot buy the cheapest person-day within reach',()=>{
 assert.equal(cause({cash:4}),'poverty');// total cash 4 < one meal at 5
 assert.equal(cause({cash:6}),'chain');// 6 >= 5 is not poverty however many mouths
 assert.equal(cause({cash:0,reach:[],townShops:{total:1,open:0}}),'poverty');// nothing on sale: priced at the catalogue's cheapest
});
test('allocation: food and cash exist but the shelf was bought out, or the customer refused',()=>{
 assert.equal(cause({reach:[shelf({bought:20})]}),'allocation');
 assert.equal(cause({declined:'price above willingness'}),'allocation');
});
test('chain: food on sale, shop open, household can pay, still no meal',()=>{
 assert.equal(cause({reach:[],townShops:{total:0,open:0}}),'chain');
 assert.match(verdict(buildFacts(snap({reach:[],townShops:{total:1,open:0}}))).reason,/not trading in it at noon/);
 assert.equal(cause({reach:[{...shelf(),engineServes:false}]}),'chain');// shop beyond customer reach
 assert.equal(cause({}),'chain');// everything present, no purchase
});
test('undetermined: a roster-only household (no purse in state) is not given a default cause, but harvest still applies',()=>{
 const v=verdict(buildFacts(snap({cash:null})));
 assert.equal(v.cause,'undetermined');assert.match(v.reason,/no purse or stock/);
 assert.equal(verdict(buildFacts(snap({cash:null,supply:1}))).cause,'harvest');
});

const COIN='coin_river',OATS='item_oats';
const books=(ledgerOver={},endOver={})=>({
 start:{money:new Map([[`player|${COIN}|purse`,100]]),stock:new Map([[`player|${OATS}|bag`,50]])},
 end:{money:new Map([[`player|${COIN}|purse`,90]]),stock:new Map([[`player|${OATS}|bag`,40]]),...endOver},
 edible:new Set([OATS]),
 ledger:{accounts:{[`player|${COIN}|purse`]:90,[`player|${OATS}|bag`]:40},
  flows:{[`src:genesis|${COIN}|opening`]:100,[`sink:export|${COIN}|tax`]:10,[`src:genesis|${OATS}|opening`]:50,[`sink:consume|${OATS}|meal`]:10,...ledgerOver}}});
test('reconcile: coin and food differences are 0 when flows explain the change, and a missing flow is caught',()=>{
 const ok=reconcileBooks(books());
 assert.equal(ok.money[COIN].difference,0);assert.equal(ok.food.total.difference,0);assert.equal(ok.mismatches.count,0);
 const bad=reconcileBooks(books({[`sink:consume|${OATS}|meal`]:5}));
 assert.equal(bad.food.total.difference,-5);
});

test('food-cause audit (real engine, 3 days): deterministic, causes partition the missed meals, books reconcile',{timeout:900000},async()=>{
 const a=await runAudit({days:3}),b=await runAudit({days:3});
 assert.equal(JSON.stringify(a),JSON.stringify(b));
 const incidents=Object.values(a.attribution).reduce((n,c)=>n+c.incidents,0);
 assert.equal(incidents,a.totals.named.incidents+a.totals.statistical.incidents);
 assert.deepEqual(Object.keys(a.attribution),['harvest','poverty','allocation','chain','undetermined']);
 for(const row of Object.values(a.conservation.food.rows))assert.equal(row.difference,0);
 for(const row of Object.values(a.conservation.money))assert.equal(row.difference,0);
 assert.deepEqual(a.conservation.ledger.audit,[]);
 assert.equal(a.conservation.mismatches.count,0);
});
