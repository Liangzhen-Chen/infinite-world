import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {advanceNpcAutonomy,scheduleNpcAutonomy} from '../server-plugin/npc-autonomy.mjs';
import {autonomyCandidates} from '../server-plugin/autonomy-candidates.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
const base=await loadWorld(),seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8')),npc='npc_hw_ayan';
function setup(){const world=structuredClone(base),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'a2-autonomy');document.state.location='loc_capital';document.state.minute=600;document.state.npcs[npc].location='bld_hw_mill';document.state.npcs[npc].goals={};document.state.npcs[npc].activity='修木件';return {world,engine,d:{document,get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);}}};}
test('R3-N1① 包动作参与全部候选排序，自治采用包动作而非硬编码名字',()=>{
 const {world,engine,d}=setup();engine.actionRegistry={byId:new Map([['test:make_pegs',{autonomy:{kind:'craft',recipe:'$recipe'}}]])};
 world.autonomy={candidates:[{id:'test:need-work',npc,need:'need:money',action:'test:make_pegs',slots:{recipe:'recipe_wooden_pegs'},utility:100,risk:0}]};
 const before=structuredClone(d.get('state'));advanceNpcAutonomy(d,engine,599,600,'pack',{beforeState:before});
 const task=Object.values(d.get('state','npcAutonomy','tasks')??{}).find(t=>t.npc===npc);assert.ok(task);assert.equal(task.candidate,'test:need-work');assert.equal(task.action.recipe,'recipe_wooden_pegs');assert.equal(task.decision.trace.length,5);
});
test('via: npc-autonomy 只入候选、不直接执行；horizon>1 写计划，步骤仍过裁决',()=>{
 const {engine,d}=setup();engine.actionRegistry={byId:new Map([['test:make_pegs',{autonomy:{kind:'craft',recipe:'$recipe'}}]])};
 assert.throws(()=>scheduleNpcAutonomy(d,{npc,action:'test:make_pegs'},'bad'),/via/);
 const before=structuredClone(d.get('state','npcs',npc).inventory);
 scheduleNpcAutonomy(d,{npc,action:'test:make_pegs',slots:{recipe:'recipe_wooden_pegs'},via:'npc-autonomy',utility:200,horizon:2,steps:[{action:'test:make_pegs',slots:{recipe:'recipe_wooden_pegs'},done:false}]},'scheduled');
 assert.deepEqual(d.get('state','npcs',npc).inventory,before);assert.equal(d.get('state','npcs',npc,'plan'),undefined);
 advanceNpcAutonomy(d,engine,599,600,'plan',{beforeState:structuredClone(d.get('state'))});
 assert.equal(d.get('state','npcs',npc,'plan','candidate'),'scheduled');assert.ok(d.get('state','autonomyCandidates','scheduled'));
 const task=Object.values(d.get('state','npcAutonomy','tasks')).find(t=>t.npc===npc);assert.ok(task);
 // The actual recipe check can fail; a failed attempt must not finish a plan.
 d.set(['state','minute'],task.finish);advanceNpcAutonomy(d,engine,600,task.finish,'finish');
 const action=d.get('state','npcAutonomy','actions',task.id),plan=d.get('state','npcs',npc,'plan');
 assert.equal(plan.steps[0].done,Boolean(action?.outcome.success));
 if(action?.outcome.success)assert.equal(d.get('state','autonomyCandidates','scheduled'),undefined);
});
test('包函数只能收到主观视图；最高需求、效用减风险、稳定排序和禁区生效',()=>{
 const {engine,world,d}=setup(),v=subjectiveView(engine,d.document,npc);v.self.traits.riskAversion=2;v.self.redLines=[{action:'forbidden'}];
 world.autonomy={candidates:[{id:'b',action:'x',utility:view=>{assert.equal(view.state,undefined);return 10;},risk:4},{id:'a',action:'x',utility:5,risk:0},{id:'c',action:'forbidden',utility:999}]};
 assert.deepEqual(autonomyCandidates(engine,v).map(c=>c.id),['a','b']);
});
