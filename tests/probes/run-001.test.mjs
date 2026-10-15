// run-001 事件推演脚本化（S0）：每条预期一个断言（判定为“合理”）。基线为合理的预期是“必须保持”组；
// 其余以 todo 标为“目标分”（target），失败不影响退出码，通过数只升不降由 tools/probe-score.mjs 对照基线。
// 运行：node --test --test-isolation=none tests/probes/run-001.test.mjs   出分：node tools/probe-score.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadExpectations,evaluate,readBaseline} from '../../tools/probe-score.mjs';

const list=await loadExpectations('run-001'),baseline=readBaseline('run-001').verdicts;
const results=new Map();
const result=async x=>{if(!results.has(x.id))results.set(x.id,await evaluate(x));return results.get(x.id);};

test('run-001：105 条预期全部登记，脚本可运行并返回有效判定',async()=>{
 assert.equal(list.length,105);
 assert.equal(new Set(list.map(x=>x.id)).size,105);
 for(const x of list){const r=await result(x);assert.ok(!r.scriptError,`${x.id} ${r.evidence}`);}
});

for(const x of list){
 const keep=baseline[x.id]==='合理';
 test(`${keep?'':'target: '}${x.id} ${x.text}`,keep?{}:{todo:`目标分（基线：${baseline[x.id]??'未登记'}）`},async()=>{
  const r=await result(x);
  assert.equal(r.verdict,'合理',r.evidence);
 });
}
