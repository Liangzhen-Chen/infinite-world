import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadCorpus,scoreRows} from '../tools/a3-score.mjs';

const {rows}=await loadCorpus();
// Read-only actions are declared by the action catalog (world/actions/*.json
// readOnly: true), not by a hard-coded route list.
const actionsDir=new URL('../world/actions/',import.meta.url);
const readOnlyActions=new Set(fs.readdirSync(actionsDir).filter(f=>f.endsWith('.json')).flatMap(f=>JSON.parse(fs.readFileSync(new URL(f,actionsDir),'utf8').replace(/^﻿/,'')).actions??[]).filter(a=>a.readOnly===true).map(a=>a.id));
test('A3 independent intent corpus is sufficiently large and adversarial',()=>{
 assert.ok(rows.length>=120);assert.ok(rows.filter(x=>x.tricky).length/rows.length>=.30);
 assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);
 for(const row of rows){
  // v2 supplies natural-language cases and route, while v1 supplies proposal
  // and action.
  assert.ok(row.intent&&(row.expected.route??row.expected.action));
  assert.ok(Array.isArray(row.expected.signature));
  assert.equal(typeof row.expected.outOfBounds,'boolean');assert.equal(typeof row.expected.constructor,'boolean');
  assert.equal(typeof row.expected.fallback,'boolean');
 }
 // An empty signature means nothing is committed: a refusal, a clarification
 // or a read-only catalog action. Every other empty-signature row is a corpus
 // defect; all of them are reported together.
 const committing=rows.filter(row=>!row.expected.signature.length&&[].concat(row.expected.route??row.expected.action).some(route=>!['reject','clarify','拒绝','澄清'].includes(route)&&!readOnlyActions.has(route)));
 assert.deepEqual(committing.map(row=>row.id),[],`empty signature on a committing route: ${committing.map(row=>`${row.id}(${row.expected.route??row.expected.action})`).join(', ')}`);
});
test('A3 real proposal engine meets the explicit stage thresholds',async()=>{
 const score=await scoreRows(rows);
 assert.equal(score.inputMissing.length,0,`missing executable inputs: ${score.inputMissing.join(', ')}`);
 assert.ok(score.route>=.90,`route ${(score.route*100).toFixed(1)}%`);
 assert.ok(score.signature>=.85,`signature ${(score.signature*100).toFixed(1)}%`);
 assert.equal(score.setupUnmetCount,0,`setup unmet: ${score.setupUnmet.map(x=>x.id).join(", ")}`);
 assert.equal(score.outOfBoundsUnverified.length,0,`out-of-bounds unverified: ${score.outOfBoundsUnverified.join(", ")}`);
 assert.equal(score.outOfBoundsLeaks.length,0,`out-of-bounds leaks: ${score.outOfBoundsLeaks.join(', ')}`);
 assert.equal(score.unsupported.length,0,`unsupported: ${score.unsupported.join(', ')}`);
 assert.equal(score.fallbackReactionRate,1);
 assert.ok(score.constructor>=.70,`constructor ${(score.constructor*100).toFixed(1)}%`);
});
