import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {reviewM4R} from '../tools/m4r-review.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'m4r-review-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const write=(name,value)=>fs.writeFile(path.join(root,name),JSON.stringify(value));
 await write('hidden-passives.json',[{id:'profession_hidden_01',ability:'观察检定加1',cost:'杀生停用',passive:{domain:'wildlife_observe',checkBonus:1}}]);
 await write('budget.json',{limitYuan:1,spentYuan:0.02618912,unknownReservedYuan:0.02,unknownReason:'旧中断请求'});
 await write('l2.json',{rows:[{id:'profession_hidden_01',attempts:[{error:'模型没有返回 JSON 正文'},{error:'模型没有返回 JSON 正文'}]},{id:'research_spell_registration',passed:true,revision:2,attempts:[]}]});
 return {root,read:async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'))};
}
test('解析完整模型响应；补审保留旧尝试、费用与未知预留，续跑不重复调用',async t=>{
 const f=await fixture(t);let calls=0;
 const client={generate:async()=>{calls++;client.spent+=0.001;return {choices:[{message:{content:'{"contradictions":[]}'}}],measurement:{costUpperYuan:0.001}};}};
 await reviewM4R({...f,client});
 const reviews=await f.read('l2.json'),budget=await f.read('budget.json');
 assert.equal(reviews.rows[0].passed,true);assert.equal(reviews.rows[0].attempts.length,3);
 assert.deepEqual(reviews.rows[0].attempts.slice(0,2),[{error:'模型没有返回 JSON 正文'},{error:'模型没有返回 JSON 正文'}]);
 assert.equal(reviews.rows[0].attempts[2].supplemental,true);
 assert.equal(budget.limitYuan,1.5);assert.equal(budget.spentYuan,0.02718912);
 assert.equal(budget.reservedYuan,0.02);assert.equal(budget.unknownReservedYuan,0.02);assert.equal(budget.unknownReason,'旧中断请求');
 await reviewM4R({...f,client});assert.equal(calls,1);assert.equal((await f.read('budget.json')).limitYuan,1.5);
});
test('补审解析失败或模型否决不会被标为通过，也不会自动取得第二次补审',async t=>{
 for(const content of [null,'{"contradictions":[{"quote":"观察检定加1","field":"passive","severity":"硬事实","reason":"冲突"}]}']){
  const f=await fixture(t);let calls=0;
  const client={generate:async()=>{calls++;return {choices:[{message:{content}}]};}};
  if(content===null)await assert.rejects(reviewM4R({...f,client}),/模型没有返回 JSON 正文/);
  else await reviewM4R({...f,client});
  assert.notEqual((await f.read('l2.json')).rows[0].passed,true);
  await reviewM4R({...f,client});assert.equal(calls,1);
 }
});
