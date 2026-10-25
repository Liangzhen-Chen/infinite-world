import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {entriesFor, draftFor, validateDraft, sources, revision, draftRoot, extractUseReview, verifyPublished} from '../world/design/a3w-props-approval.mjs';

test('a3w-props proposals derive only listed use tags from extant item rows', async()=>{
 const items=JSON.parse(await fs.readFile('world/meta/items.json','utf8'));
 const entries=await entriesFor(items);
 assert.equal(entries.length,Object.keys(sources).length);
 for(const entry of entries){
  const before=items.find(x=>x.id===entry.id), expected=[...new Set([...(before.tags??[]),...sources[entry.id]])].sort();
  assert.deepEqual(entry.row.tags,expected,entry.id);
  const {tags,...candidate}=entry.row,{tags:priorTags,...prior}=before;
  assert.deepEqual(candidate,prior,`${entry.id} proposal changed unrelated fields`);
  assert.deepEqual(await validateDraft(draftFor(entry),entry,items),[]);
  assert.match(entry.boundary,/仅添加由该物品现有用途/);
 }
 assert.equal(revision,'a3w-props-1');
 assert.equal(draftRoot,'world/drafts/a3w-props');
});

test('a3w-props refuses malformed L2 responses without granting approval',()=>{
 const response=content=>({choices:[{message:{content}}]});
 assert.deepEqual(extractUseReview(response('{"contradictions":[]}')),{contradictions:[]});
 for(const content of ['{}','{"type":"json_object","skeleton":{}}','{"contradictions":[{}]}','{"contradictions":[]} trailing']){
  assert.throws(()=>extractUseReview(response(content)),error=>error.code==='CONTENT_BUDGET_STOP');
 }
});

test('a3w-props published item tags have matching L1/L2 and L4 receipts',async()=>{
 const result=await verifyPublished();
 assert.equal(result.published,Object.keys(sources).length);
});

test('all listed item identifiers exist and use vocabulary is explicit', async()=>{
 const items=JSON.parse(await fs.readFile('world/meta/items.json','utf8'));
 const vocab=JSON.parse(await fs.readFile('world/meta/item-use-tags.json','utf8'));
 for(const [id,tags] of Object.entries(sources)){
  assert.ok(items.some(x=>x.id===id),id);
  for(const tag of tags)assert.ok(Object.hasOwn(vocab.tags,tag),`${id}: ${tag}`);
 }
});
