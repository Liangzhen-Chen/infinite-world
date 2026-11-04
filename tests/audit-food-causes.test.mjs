// AUDIT1: the closing audit tool is deterministic, gives every missed meal exactly one of the four
// causes, and its ledger reconciliation is internally consistent. The tool itself runs 30 days;
// this test uses a short window so the suite stays fast.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runAudit,verdict} from '../tools/audit-food-causes.mjs';

const base={refCost:4,supply:100,demand:10,best:{cost:5,sameSettlement:true},perCapitaCash:50,cash:200,soldOut:false,declined:null,servedShops:1,group:false,simulated:true,buyer:true,nearOpen:1,closedNear:0,registered:1};

test('verdict: each cause is reachable from facts, in the card order; chain breaks are told apart',()=>{
 assert.equal(verdict({...base,supply:5}).cause,'harvest');
 // food is saleable within a day (supply >= demand) yet no shop is open: the chain broke; the tag in the reason says where
 assert.equal(verdict({...base,best:null,nearOpen:0,registered:0}).cause,'chain');
 assert.match(verdict({...base,best:null,nearOpen:0,registered:0}).reason,/noseller/);
 assert.match(verdict({...base,best:null,nearOpen:0,registered:0}).reason,/no-shop/);
 assert.match(verdict({...base,best:null,nearOpen:0,closedNear:1}).reason,/keeper-away/);
 assert.match(verdict({...base,best:null,nearOpen:0,registered:2}).reason,/too-far/);
 // a shop is open within reach but its shelf has nothing the household can use: left to the cooking chain
 assert.equal(verdict({...base,best:null,nearOpen:1}).cause,'chain');
 assert.match(verdict({...base,best:null,nearOpen:1}).reason,/nogoods/);
 // a roster household nobody buys for is a chain break; one that is a buyer is not
 assert.match(verdict({...base,simulated:false,buyer:false}).reason,/nobuyer/);
 assert.doesNotMatch(verdict({...base,simulated:false,buyer:true}).reason,/nobuyer/);
 assert.match(verdict({...base,servedShops:0}).reason,/unreachable/);
 assert.equal(verdict({...base,perCapitaCash:1}).cause,'poverty');
 // no cash is poverty even when nothing is on sale (it could not buy if the chain worked)
 assert.equal(verdict({...base,best:null,perCapitaCash:0,cash:0}).cause,'poverty');
 assert.equal(verdict({...base,soldOut:true}).cause,'allocation');
 assert.equal(verdict({...base,declined:'price above willingness'}).cause,'allocation');
 assert.equal(verdict({...base,servedShops:0}).cause,'chain');
 assert.match(verdict(base).reason,/no-purchase/);
 // a shortage of food outranks everything else
 assert.equal(verdict({...base,supply:5,perCapitaCash:0,cash:0,best:null}).cause,'harvest');
});

test('food-cause audit: same seed twice is byte-identical; causes partition the missed meals; books reconcile',{timeout:900000},async()=>{
 const a=await runAudit({days:3}),b=await runAudit({days:3});
 assert.equal(JSON.stringify(a),JSON.stringify(b));
 const incidents=Object.values(a.attribution).reduce((n,c)=>n+c.incidents,0);
 assert.equal(incidents,a.totals.named.incidents+a.totals.statistical.incidents);
 assert.ok(incidents>0,'the window must contain missed meals to attribute');
 assert.deepEqual(Object.keys(a.attribution),['harvest','poverty','allocation','chain']);
 for(const row of Object.values(a.conservation.food.rows))assert.equal(row.difference,0);
 for(const row of Object.values(a.conservation.money))assert.equal(row.difference,0);
 assert.deepEqual(a.conservation.ledger.audit,[]);
 assert.equal(a.conservation.mismatches.count,0);
});
