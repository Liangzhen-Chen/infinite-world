// Preserve run-001's original questions and scoring. Partial is not a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadExpectations,evaluate} from '../tools/probe-score.mjs';

const events=['E02','E03','E06','E11','E14'];
const expectations=await loadExpectations('run-001',events);
for(const event of events)test(`S2c run-001r ${event}: reasonable >= 80%`,async t=>{
 const questions=expectations.filter(x=>x.event===event),results=[];
 for(const question of questions){const result=await evaluate(question);results.push(result);t.diagnostic(`${question.id} ${result.verdict}: ${result.evidence}`);}
 const reasonable=results.filter(r=>r.verdict==='合理').length;
 t.diagnostic(`${event}: ${reasonable}/${questions.length} (${Math.round(reasonable/questions.length*100)}%)`);
 assert.ok(questions.length>0);
 assert.ok(!results.some(r=>r.scriptError),`${event}: original scenario could not execute; see diagnostics`);
 assert.ok(reasonable/questions.length>=0.8,`${event}: ${reasonable}/${questions.length}, requirement >=80%`);
});
