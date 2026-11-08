// 关系证据按世界日结算：债务逾期等状态转移产生的关系证据，不能因为"一次推进跨过逾期点"还是"逐日推进"而出现得早晚不同。
// 世界里现成的路径：正式世界里欠薪在第 13-14 天逾期（debt:*:overdue 证据），由它建立的关系让 tied() 成立，进而影响之后的同工（npc-life coworkDay）。
// 期望值不手算：整段一次 reduce 与逐日推进互相比较。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const N=26,OVERDUE=/^debt:.+:overdue$/;
test('欠薪逾期的关系证据整段推进与逐日推进一致：同一条证据、同一个 minute、只登记一次，且之后的关系（含同工记录）逐字相同',{timeout:1800000},async()=>{
 const engine=new WorldEngine(world),document=engine.createCharacter(legacy,{},'schedule-month');
 const long=applyPatches(document,(await engine.reduce(document,{tool:'world_time',args:{minutes:N*1440},eventId:'month'})).patches);
 let daily=document;
 for(let day=0;day<N;day++){const out=await engine.reduce(daily,{tool:'world_time',args:{minutes:1440},eventId:`day_${day}`});daily=applyPatches(daily,out.patches);}
 const keys=side=>Object.keys(side.state.relationEvidence??{}).filter(key=>OVERDUE.test(key)).sort();
 const longKeys=keys(long),dailyKeys=keys(daily);
 assert.ok(dailyKeys.length>0,'世界里应有逾期欠款产生关系证据（否则本测试没有对象）');
 assert.deepEqual(longKeys,dailyKeys,'两种推进登记的逾期证据集合相同');
 for(const key of dailyKeys){
  const a=long.state.relationEvidence[key],b=daily.state.relationEvidence[key];
  assert.deepEqual(a,b,`${key} 的证据（含 minute）相同`);
  // 午夜登记之后，期末那次调用不会再登记一次：关系里该证据键只出现一次。
  for(const side of [long,daily]){
   const view=side.state.npcs[a.from].relationships?.[a.to];
   assert.equal(view.evidenceKeys.filter(k=>k===key).length,1,`${key} 只登记一次`);
  }
 }
 // 之后的关系（包括同工的 routine 记录）两种推进逐字相同。
 for(const id of Object.keys(daily.state.npcs))assert.deepEqual(long.state.npcs[id].relationships,daily.state.npcs[id].relationships,`${id} 的关系`);
});
