import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/a3-intents.json',import.meta.url),'utf8'));
test('A3 independent intent corpus is sufficiently large and adversarial',()=>{
 assert.ok(rows.length>=120);assert.ok(rows.filter(x=>x.tricky).length/rows.length>=.30);
 assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);
 for(const row of rows){assert.ok(row.intent&&row.proposal&&row.expected.action&&row.expected.signature.length);assert.equal(typeof row.expected.outOfBounds,'boolean');assert.equal(typeof row.expected.constructor,'boolean');}
});
test('A3 real proposal engine meets the explicit stage thresholds',async()=>{
 const {default:score}=await import('../tools/a3-score.mjs');
 assert.ok(score.route>=.90,`route ${(score.route*100).toFixed(1)}%`);
 assert.ok(score.signature>=.85,`signature ${(score.signature*100).toFixed(1)}%`);
 assert.equal(score.outOfBoundsLeaks.length,0,`out-of-bounds leaks: ${score.outOfBoundsLeaks.join(', ')}`);
 assert.equal(score.unsupported.length,0,`unsupported: ${score.unsupported.join(', ')}`);
 assert.equal(score.fallbackReactionRate,1);
 assert.ok(score.constructor>=.70,`constructor ${(score.constructor*100).toFixed(1)}%`);
});
