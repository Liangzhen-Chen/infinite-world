import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {init} from '../server-plugin/index.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {AI_USES,aiAllows,profileOfRequest} from '../server-plugin/ai-profile.mjs';
import {AI_PROFILES} from '../extension/turn.mjs';

const world=await loadWorld();

test('AI-01：服务端档位表与客户端 intent/narration 映射一致，缺省为 T0',()=>{
 assert.deepEqual(Object.keys(AI_USES),Object.keys(AI_PROFILES));
 for(const [id,modes] of Object.entries(AI_PROFILES)){
  assert.equal(AI_USES[id].includes('understand'),modes.intent!=='off');
  assert.equal(AI_USES[id].includes('narrate'),modes.narration!=='off');
 }
 assert.equal(profileOfRequest({headers:{}}),'T0');assert.equal(profileOfRequest({headers:{'x-ai-profile':'T9'}}),'T0');
 assert.equal(aiAllows({headers:{}},'npcPlanning'),false);
 assert.equal(aiAllows({headers:{'x-ai-profile':'T3'}},'npcPlanning'),true);
});

// Every server-side model entry point (npc planning, profile drafting, consistency review/rewrite) gets an injected counting client.
// The consistency client uses the real method name (generate). T3 is the positive control: the same calls do reach the counters there.
async function run(t,profile){
 const root=await fs.mkdtemp(path.join(tmpRoot(),'ai01-gate-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const calls={planner:0,generator:0,client:0};
 const app=express();app.use(express.json({limit:'100mb'}));const router=express.Router();
 await init(router,{baseRoot:root,world,npcPlanningEnabled:true,npcPlanner:async()=>{calls.planner++;return {status:'skipped',reason:'counted'};},
  populationProfilesEnabled:true,populationGenerator:async()=>{calls.generator++;throw Error('counted');},
  consistencyEnabled:true,consistencyClient:{generate:async()=>{calls.client++;throw Error('counted');}}});
 app.use(router);const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');t.after(()=>listener.close());
 const post=async(endpoint,body)=>{
  const response=await fetch(`http://127.0.0.1:${listener.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',...(profile?{'X-AI-Profile':profile}:{})},body:JSON.stringify(body)});
  return response.json();
 };
 const campaignId=(await post('/create',{name:'测试旅人'})).reference.campaignId;
 await post('/execute',{campaignId,tool:'world_move',args:{destination:'loc_far_duanqi'},eventId:'g1'});
 await post('/execute',{campaignId,tool:'world_time',args:{minutes:1500},eventId:'g2'});
 await post('/scene',{campaignId,query:'兀烈·赭牙部，你好'});
 const view=await post('/read',{campaignId});
 const begin=await post('/review/begin',{campaignId,anchor:'a1',playerText:'你好',expectedSequence:view.reference.sequence,enabled:true});
 await post('/review/reply',{campaignId,token:begin.token,draft:'你环顾四周，什么也没有发生。',expectedSequence:view.reference.sequence,query:''});
 return {calls,begin};
}
for(const profile of [undefined,'T0','T1']){
 test(`AI-01：${profile??'无档位头'} 下服务端所有模型入口调用数为 0`,async t=>{
  const {calls,begin}=await run(t,profile);
  assert.equal(begin.enabled,false);assert.deepEqual(calls,{planner:0,generator:0,client:0});
 });
}
test('AI-01：T2 下一致性审查可用，规划与人物起草仍为 0',async t=>{
 const {calls,begin}=await run(t,'T2');
 assert.equal(begin.enabled,true);assert.ok(calls.client>0);assert.equal(calls.planner,0);assert.equal(calls.generator,0);
});
test('AI-01：T3 正向对照——规划与审查入口确实被调用（证明上面的 0 不是空转）',async t=>{
 const {calls,begin}=await run(t,'T3');
 assert.equal(begin.enabled,true);assert.ok(calls.client>0,'consistency client');assert.ok(calls.planner>0,'npc planner');
});

// T0 has no reviewed reply tail, so world time advances only through local actions with a time cost.
test('AI-01：T0 下本地行动（等待、移动）推进世界时间',async t=>{
 const root=await fs.mkdtemp(path.join(tmpRoot(),'ai01-time-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=express();app.use(express.json({limit:'100mb'}));const router=express.Router();
 await init(router,{baseRoot:root,world,npcPlanningEnabled:false,consistencyEnabled:false,populationProfilesEnabled:false});
 app.use(router);const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');t.after(()=>listener.close());
 const post=async(endpoint,body)=>(await fetch(`http://127.0.0.1:${listener.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','X-AI-Profile':'T0'},body:JSON.stringify(body)})).json();
 const campaignId=(await post('/create',{name:'测试旅人'})).reference.campaignId;
 const read=()=>post('/read',{campaignId}),minute=async()=>(await read()).document.state.minute;
 const start=await minute();
 await post('/execute',{campaignId,tool:'world_act',args:{action:'core:time',slots:{minutes:30}},eventId:'t0-wait',anchor:null,expectedSequence:(await read()).reference.sequence});
 const waited=await minute();assert.ok(waited>=start+30,`wait advanced ${waited-start}`);
 await post('/execute',{campaignId,tool:'world_move',args:{destination:'loc_far_duanqi'},eventId:'t0-move',anchor:null,expectedSequence:(await read()).reference.sequence});
 assert.ok(await minute()>waited);
});
