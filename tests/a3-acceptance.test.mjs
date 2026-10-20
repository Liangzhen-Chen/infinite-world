import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCorpus,scoreRows} from '../tools/a3-score.mjs';

const {rows}=await loadCorpus();
test('A3 independent intent corpus is sufficiently large and adversarial',()=>{
 assert.ok(rows.length>=120);assert.ok(rows.filter(x=>x.tricky).length/rows.length>=.30);
 assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);
 for(const row of rows){
  // v2 supplies natural-language cases and route, while v1 supplies proposal
  // and action. Empty signatures are intentional for read-only/rejected cases.
  assert.ok(row.intent&&(row.expected.route??row.expected.action));
  assert.ok(Array.isArray(row.expected.signature));
  if(!row.expected.signature.length)assert.match(row.expected.route??row.expected.action,/^(reject|clarify|core:look|拒绝|澄清)$/);
  assert.equal(typeof row.expected.outOfBounds,'boolean');assert.equal(typeof row.expected.constructor,'boolean');
  assert.equal(typeof row.expected.fallback,'boolean');
 }
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
