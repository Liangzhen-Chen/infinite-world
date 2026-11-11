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

// Every server-side model entry point (npc planning, profile drafting, consistency rewrite) gets an injected counting client.
test('AI-01：T0/T1/T2 下服务端所有模型入口调用数为 0（规划、人物起草仅 T3，一致性审查需 T2）',async t=>{
 const root=await fs.mkdtemp(path.join(tmpRoot(),'ai01-gate-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const calls={planner:0,generator:0,client:0};
 const app=express();app.use(express.json({limit:'100mb'}));const router=express.Router();
 await init(router,{baseRoot:root,world,npcPlanningEnabled:true,npcPlanner:async()=>{calls.planner++;throw Error('counted');},
  populationProfilesEnabled:true,populationGenerator:async()=>{calls.generator++;throw Error('counted');},
  consistencyEnabled:true,consistencyClient:{chat:async()=>{calls.client++;throw Error('counted');}}});
 app.use(router);const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');t.after(()=>listener.close());
 const post=async(endpoint,body,profile)=>{
  const response=await fetch(`http://127.0.0.1:${listener.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',...(profile?{'X-AI-Profile':profile}:{})},body:JSON.stringify(body)});
  return response.json();
 };
 const campaignId=(await post('/create',{name:'测试旅人'})).reference.campaignId;
 let n=0;
 for(const profile of [undefined,'T0','T1','T2']){
  await post('/execute',{campaignId,tool:'world_move',args:{destination:'loc_far_duanqi'},eventId:`g${n++}`},profile);
  await post('/execute',{campaignId,tool:'world_time',args:{minutes:1500},eventId:`g${n++}`},profile);
  await post('/scene',{campaignId,query:'兀烈·赭牙部，你好'},profile);
  const view=await post('/read',{campaignId});
  const begin=await post('/review/begin',{campaignId,anchor:`a${n}`,playerText:'你好',expectedSequence:view.reference.sequence,enabled:true},profile);
  assert.equal(begin.enabled,profile==='T2',`review enabled under ${profile}`);
 }
 assert.equal(calls.planner,0);assert.equal(calls.generator,0);
 assert.equal(calls.client,0);
});
