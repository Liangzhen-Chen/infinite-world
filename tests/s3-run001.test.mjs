// Original run-001 questions and verdicts; partial never counts as reasonable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadExpectations,evaluate} from '../tools/probe-score.mjs';
const events=['E04','E05','E12','E18'];
const expectations=await loadExpectations('run-001',events);
for(const event of events)test(`S3 run-001 ${event}: reasonable >= 80%`,async t=>{
    const questions=expectations.filter(q=>q.event===event),results=[];
    for(const q of questions){const r=await evaluate(q);results.push(r);t.diagnostic(`${q.id} ${r.verdict}: ${r.evidence}`);}
    const reasonable=results.filter(r=>r.verdict==='合理').length;
    t.diagnostic(`${event}: ${reasonable}/${questions.length}`);
    assert.ok(questions.length>0);
    assert.ok(!results.some(r=>r.scriptError),`${event}: original scenario failed to execute`);
    assert.ok(reasonable/questions.length>=0.8,`${event}: ${reasonable}/${questions.length}, requirement >=80%`);
});
