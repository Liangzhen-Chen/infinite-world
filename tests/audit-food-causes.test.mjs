// The closing food audit: each of the four causes is reachable from a small fixture and classified by the
// card's definitions (there is no undetermined class: roster-only and no-location households are chain, flagged apart);
// the producer-side chain-break rule is tested at its 7-day boundary; books reconcile with
// difference 0 (and a perturbed ledger is caught); a short real-engine window is deterministic and partitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runAudit,verdict,buildFacts,reconcileBooks,supplySatiety,demandSharing,producerStep,PRODUCER_IDLE_DAYS} from '../tools/audit-food-causes.mjs';

// One open own-settlement shop; one meal of its bread costs PRICE; the household has plenty of cash unless a case says otherwise.
const PRICE=5,UNITS=2;
const item=(over={})=>({item:'item_bread',avail:20,units:UNITS,cost:PRICE,bought:0,...over});
const demandOf=(list,key)=>demandSharing(list,key,list.find(o=>o.key===key).demand);
const shelf=(over={},items=[item()])=>({shopId:'shop_a',sameSettlement:true,engineServes:true,toll:0,items,...over});
const snap=(over={})=>({supply:100,demand:10,refCost:PRICE-1,cash:PRICE*10,declined:null,townShops:{total:1,open:1},reach:[shelf()],...over});
const cause=over=>verdict(buildFacts(snap(over))).cause;

test('harvest: saleable food within a day is less than the town demand',()=>{
 assert.equal(cause({supply:5}),'harvest');
 assert.equal(cause({supply:5,cash:0,reach:[]}),'harvest');// shortage outranks poverty and chain
});
test('harvest is judged on each household own reach: two households at different places',()=>{
 const gain=()=>1,near=[[{item:'a',avail:100}]],far=[[{item:'a',avail:5}]];
 const a=verdict(buildFacts(snap({supply:supplySatiety(near,gain)}))),b=verdict(buildFacts(snap({supply:supplySatiety(far,gain)})));
 assert.equal(a.cause,'chain');assert.equal(b.cause,'harvest');
 const lost=verdict(buildFacts(snap({supply:null})));// no location: chain, flagged apart, never undetermined
 assert.equal(lost.cause,'chain');assert.equal(lost.flag,'noLocation');assert.match(lost.reason,/no location/);
});
test('harvest demand: own reach covers the demand of households sharing its sellers, not the whole town',()=>{
 const list=[{key:'a',demand:10,sellers:new Set(['s1'])},{key:'b',demand:10,sellers:new Set(['s1','s2'])},{key:'c',demand:500,sellers:new Set(['s9'])}];
 const local=demandOf(list,'a'),town=list.reduce((n,o)=>n+o.demand,0);
 assert.equal(local,20);assert.ok(town>local);
 const supply=local;// enough for the neighbours, far below the whole town
 assert.notEqual(verdict(buildFacts(snap({supply,demand:local}))).cause,'harvest');
 assert.equal(verdict(buildFacts(snap({supply,demand:town}))).cause,'harvest');// the old whole-town reading would have said harvest
 assert.equal(demandOf([{key:'z',demand:7,sellers:new Set()}],'z'),7);// no seller at all: only itself
});
test('poverty: threshold is the fixture price (price-1 poor; price and price+1 not)',()=>{
 assert.equal(cause({cash:PRICE-1}),'poverty');
 assert.notEqual(cause({cash:PRICE}),'poverty');
 assert.notEqual(cause({cash:PRICE+1}),'poverty');
 assert.equal(cause({cash:0,reach:[],townShops:{total:1,open:0}}),'poverty');// nothing on sale: priced at the catalogue's cheapest
});
test('allocation: everything edible reachable is bought out, or the customer refused on price (prepay >= 2)',()=>{
 assert.equal(cause({reach:[shelf({},[item({bought:20})])]}),'allocation');
 assert.equal(cause({reach:[shelf({},[item({avail:21,bought:20})])]}),'allocation');// left 1 unit < one meal
});
test('unpriced goods (quote failed) still count as stock in the bought-out test and show in the chain reason',()=>{
 const sold=item({bought:20}),unpriced=item({item:'item_rice',cost:null});
 const v=verdict(buildFacts(snap({reach:[shelf({},[sold,unpriced])]})));
 assert.equal(v.cause,'chain');assert.match(v.reason,/could not be quoted/);// the unpriced rice is still on the shelf: not bought out
 assert.equal(verdict(buildFacts(snap({reach:[shelf({},[item({cost:null})])]}))).cause,'chain');
 assert.match(verdict(buildFacts(snap({reach:[shelf({},[item({cost:null})])]}))).reason,/could not be quoted/);
});
test('not allocation: cheapest tier bought out but other goods or sellers remain',()=>{
 const cheap=item({bought:20}),dear=item({item:'item_rice',cost:PRICE+3});
 assert.equal(cause({reach:[shelf({},[cheap,dear])]}),'chain');
 assert.equal(cause({reach:[shelf({},[cheap]),shelf({shopId:'shop_b'},[dear])]}),'chain');
});
test('not allocation: a defer (time/obligation) or other non-price refusal is chain, with the type in the reason',()=>{
 const v=verdict(buildFacts(snap({declined:{outcome:'defer',reason:'busy'}})));
 assert.equal(v.cause,'chain');assert.match(v.reason,/outcome defer/);
 assert.equal(cause({declined:{outcome:'refuse',reason:'conflict'}}),'chain');
});
test('conditional: prepay >=2 is a price refusal (allocation); prepay 1 is ambiguous with a breach-history prepay (chain, flagged for review)',()=>{
 assert.equal(cause({declined:{outcome:'conditional',reason:'需先付3文，再谈这件事。'}}),'allocation');
 const v=verdict(buildFacts(snap({declined:{outcome:'conditional',reason:'需先付1文，再谈这件事。'}})));
 assert.equal(v.cause,'chain');assert.equal(v.flag,'conditional');
});
test('chain: no adult with coins, or no visit record (budget cap), are flagged apart',()=>{
 assert.equal(verdict(buildFacts(snap({walkIn:false}))).flag,'noWalkIn');
 const v=verdict(buildFacts(snap({noVisit:true})));
 assert.equal(v.cause,'chain');assert.equal(v.flag,'noVisit');assert.match(v.reason,/budget cap/);
});
test('chain: food on sale, shop open, household can pay, still no meal',()=>{
 assert.equal(cause({reach:[],townShops:{total:0,open:0}}),'chain');
 assert.match(verdict(buildFacts(snap({reach:[],townShops:{total:1,open:0}}))).reason,/not trading in it at noon/);
 assert.equal(cause({reach:[shelf({engineServes:false})]}),'chain');// shop beyond customer reach
 assert.equal(cause({}),'chain');// everything present, no purchase
});
test('roster-only household (no purse in state): harvest still applies, otherwise chain flagged "customer flow does not serve roster households"',()=>{
 const v=verdict(buildFacts(snap({cash:null})));
 assert.equal(v.cause,'chain');assert.equal(v.flag,'roster');assert.match(v.reason,/does not serve roster households/);
 assert.equal(verdict(buildFacts(snap({cash:null,supply:1}))).cause,'harvest');
});
test('quote failed for every good and cash below the catalogue price: poverty, flagged apart',()=>{
 const v=verdict(buildFacts(snap({cash:3,reach:[shelf({},[item({cost:null})])]})));// refCost is 4
 assert.equal(v.cause,'poverty');assert.equal(v.flag,'quoteFailedPoverty');
 assert.equal(verdict(buildFacts(snap({cash:3}))).flag,undefined);// priced goods: ordinary poverty
});
test('conditional prepay boundary: 2 is the smallest price refusal, 1 is not',()=>{
 assert.equal(cause({declined:{outcome:'conditional',reason:'需先付2文，再谈这件事。'}}),'allocation');
 assert.equal(cause({declined:{outcome:'conditional',reason:'需先付1文，再谈这件事。'}}),'chain');
});

// Producer side: feed a day-by-day record through producerStep; returns the day (1-based) of the first stall, or 0.
const ON={surplus:30,roadOpen:true,buyerCash:100,moved:false};
const run=days=>{let idle=0;for(let i=0;i<days.length;i++){const r=producerStep(idle,{...ON,...days[i]});idle=r.idle;if(r.stalled)return i+1;}return 0;};
const none=n=>Array.from({length:n},()=>({}));
test('producer chain break: 6 idle days are not a break, the 7th day is',()=>{
 assert.equal(PRODUCER_IDLE_DAYS,7);
 assert.equal(run(none(6)),0);
 assert.equal(run(none(7)),7);
});
test('producer chain break: a transport record resets the count, which restarts from zero',()=>{
 assert.equal(run([...none(6),{moved:true},...none(6)]),0);// 6 idle, record, 6 idle: never 7 in a row
 assert.equal(run([...none(6),{moved:true},...none(7)]),14);// the 7th idle day after the record
});
test('producer chain break: no coin in town, zero surplus or a closed road each reset it',()=>{
 assert.equal(run([...none(6),{buyerCash:0},...none(6)]),0);
 assert.equal(run(Array.from({length:10},()=>({buyerCash:0}))),0);
 assert.equal(run(Array.from({length:10},()=>({surplus:0}))),0);
 assert.equal(run(Array.from({length:10},()=>({roadOpen:false}))),0);
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
 assert.deepEqual(Object.keys(a.attribution),['harvest','poverty','allocation','chain']);
 assert.ok(a.producerChainBreak.rule);
 for(const row of Object.values(a.conservation.food.rows))assert.equal(row.difference,0);
 for(const row of Object.values(a.conservation.money))assert.equal(row.difference,0);
 assert.deepEqual(a.conservation.ledger.audit,[]);
 assert.equal(a.conservation.mismatches.count,0);
});
