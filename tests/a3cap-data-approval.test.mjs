import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {entriesFor,draftFor,validateDraft,capacities,rationale,extractReview,verifyPublished} from '../world/design/a3cap-data-approval.mjs';
import {verifyPublished as verifyHistoricalProps,sources as historicalSources} from '../world/design/a3w-props-approval.mjs';

test('A3CAP L1 capacity proposals are frozen, supported, and limited to four vessels',async()=>{
 const items=JSON.parse(await fs.readFile('world/meta/items.json','utf8'));
 const entries=await entriesFor(items);assert.equal(entries.length,4);
 for(const e of entries){const prior=items.find(x=>x.id===e.id);assert.equal(e.row.capacityMl,capacities[e.id]);assert.ok(e.row.tags.includes('liquid_container'));assert.ok(rationale[e.id]);assert.deepEqual(await validateDraft(draftFor(e),e,items),[]);const changed=draftFor(e);changed.row.capacityMl++;assert.notDeepEqual(await validateDraft(changed,e,items),[]);if(e.id==='item_clay_pot')assert.ok(e.row.tags.includes('liquid_container'));}
});

test('A3CAP rejects malformed or contradictory L2 response formats',()=>{
 const response=content=>({choices:[{message:{content}}]});assert.deepEqual(extractReview(response('{"contradictions":[]}')),{contradictions:[]});
 for(const content of ['{}','{"contradictions":[{}]}','{"contradictions":[]} trailing'])assert.throws(()=>extractReview(response(content)),e=>e.code==='CONTENT_BUDGET_STOP');
});

test('new capacity receipts are verified before historical a3w tags receipts',async()=>{
 assert.equal((await verifyPublished()).published,Object.keys(capacities).length);
 assert.equal((await verifyHistoricalProps()).published,Object.keys(historicalSources).length);
 const items=JSON.parse(await fs.readFile('world/meta/items.json','utf8'));
 const altered=structuredClone(items);altered.find(x=>x.id==='item_clay_cup').capacityMl++;
 await assert.rejects(()=>verifyPublished(altered));
 const oldAltered=structuredClone(items);oldAltered.find(x=>x.id==='item_clay_cup').tags=oldAltered.find(x=>x.id==='item_clay_cup').tags.filter(t=>t!=='liquid_container');
 await assert.rejects(()=>verifyHistoricalProps(oldAltered));
});
