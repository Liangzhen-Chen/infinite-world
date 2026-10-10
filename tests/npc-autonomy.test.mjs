import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {planNpcAutonomy} from '../tools/npc-autonomy-planner.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {advanceNpcSchedules} from '../server-plugin/npc-schedule.mjs';
import {advanceNpcAutonomy,applyNpcPlan,npcPlanFingerprint,npcPlanningContext,npcAutonomyBusy,npcLocalChanges,nextNpcAutonomyMinute} from '../server-plugin/npc-autonomy.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),actor='npc_hw_ayan';
function draft(document){return {document,get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);}};}
async function setup(){const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'autonomy-test');document.state.minute=540;document.state.location='loc_capital';
 const d=draft(document);return {world,engine,d};}
function advance(d,engine,to,event='advance'){
 const all=[];while(d.get('state','minute')<to){const until=Math.min(to,nextNpcAutonomyMinute(d.get('state'),d.get('state','minute')));all.push(...part(d,engine,until,event));}return all;
}
function part(d,engine,to,event){
 const before=d.get('state','minute'),snapshot=structuredClone(d.get('state'));d.set(['state','minute'],to);
 engine.npcScheduleReservations=new Set(Object.keys(snapshot.npcs).filter(id=>npcAutonomyBusy(snapshot,id,before)||snapshot.npcs[id].cognitionTravel));
 advanceNpcSchedules(d,engine,before,to);engine.npcScheduleReservations=undefined;
 return advanceNpcAutonomy(d,engine,before,to,event,{beforeState:snapshot});
}
const count=(d,id,item)=>{const v=d.get('state','npcs',id,'inventory',item);return typeof v==='number'?v:v?.quantity??0;};
test('离开十天后真实材料、工坊账款、工具磨损和库存目标发生变化，没有重复扣聚落口粮',async()=>{
 const {engine,d}=await setup(),before=structuredClone(d.document),wood=count(d,actor,'item_wood');for(let day=1;day<=10;day++)advance(d,engine,day*1440);
 assert.ok(count(d,actor,'item_wood')<wood);assert.ok(d.get('state','workshopFunds','station_hw_mill_bench')>0);assert.ok(d.get('state','npcs',actor,'inventory','item_whittling_knife','durability')<engine.byId.get('item_whittling_knife').durability);
 assert.equal(d.get('state','npcs','npc_hw_duanyan','goals','short')[0].progress,100);assert.equal(d.get('state','npcs','npc_hw_sulan','goals','short')[0].progress,100);assert.deepEqual(d.get('state','settlements'),before.state.settlements);
 assert.ok(npcLocalChanges(d.document,'bld_hw_mill',540).length);for(const row of Object.values(d.get('state','npcAutonomy','actions')))if(row.kind==='craft')assert.equal(row.spent.materials[0].amount,1);
});
test('规则结算分段和父事件名不影响实际结果，重复同一日不复制成品',async()=>{
 const a=await setup(),b=await setup();for(let day=1;day<=10;day++){advance(a.d,a.engine,day*1440,'long-parent');advance(b.d,b.engine,(day-1)*1440+600,'short-parent');advance(b.d,b.engine,(day-1)*1440+630,'short-parent');advance(b.d,b.engine,day*1440,'short-parent');}
 assert.deepEqual(a.d.document,b.d.document);const before=structuredClone(a.d.document);advanceNpcAutonomy(a.d,a.engine,9*1440,10*1440,'repeat',{beforeState:before.state});assert.deepEqual(a.d.document,before);
});
test('库存不足、路程未到、睡眠和预约均不产生假成功',async()=>{
 const {world,engine,d}=await setup();d.set(['state','npcs',actor,'inventory','item_wood'],0);advance(d,engine,1440);assert.equal(Object.values(d.get('state','npcAutonomy','actions')??{}).filter(r=>r.npc===actor).length,0);
 const n=world.npcs.find(n=>n.id===actor);n.schedule={default:[{start:0,end:1440,location:'bld_hw_mill',activity:'睡眠',services:[]}]};d.set(['state','npcs',actor,'inventory','item_wood'],20);advance(d,engine,2880);assert.equal(Object.values(d.get('state','npcAutonomy','actions')??{}).filter(r=>r.npc===actor).length,0);
});
test('冻结规划先占用真实工作时间，完成前不发成品，失败检定也如实耗材',async()=>{
 const {world,engine,d}=await setup();d.set(['state','minute'],600);d.set(['state','npcs',actor,'location'],'bld_hw_mill');d.set(['state','npcs',actor,'activity'],'修木件');
 const input={kind:'npc-plan',version:1,minute:600,stateFingerprint:npcPlanFingerprint(d.document),proposals:[{npc:actor,actions:[{kind:'craft',recipe:'recipe_wooden_pegs'}]}]},before=count(d,actor,'item_wooden_peg');
 const result=applyNpcPlan(d,engine,input,'frozen');assert.equal(result.results[0].status,'进行中');assert.equal(count(d,actor,'item_wooden_peg'),before);assert.ok(npcAutonomyBusy(d.get('state'),actor));
 advance(d,engine,619);assert.equal(count(d,actor,'item_wooden_peg'),before);advance(d,engine,620);const record=d.get('state','npcAutonomy','actions',result.results[0].id);assert.ok(record);assert.equal(count(d,actor,'item_wood'),19);assert.equal(count(d,actor,'item_wooden_peg')-before,record.outcome.success?4:0);
});
test('过时或伪造改账计划拒绝，复演完全确定，不调用模型',async()=>{
 const {engine,d}=await setup();d.set(['state','minute'],600);d.set(['state','npcs',actor,'activity'],'修木件');const input={kind:'npc-plan',version:1,minute:600,stateFingerprint:npcPlanFingerprint(d.document),proposals:[{npc:actor,actions:[{kind:'craft',recipe:'recipe_wooden_pegs',coins:999}]}]};
 const before=structuredClone(d.document);assert.equal(applyNpcPlan(d,engine,input,'frozen').results[0].status,'拒绝');assert.deepEqual(d.document,before);
 assert.throws(()=>applyNpcPlan(d,engine,{...input,stateFingerprint:'stale'},'bad'),/冻结输入/);
 const c=npcPlanningContext(engine,d.document);assert.equal(c.people.length,12);assert.ok(c.people.every(n=>!('secrets'in n)));assert.throws(()=>npcPlanningContext(engine,d.document,{limit:30}),/8到20/);
});
test('连续五分钟推进与一次跨日推进完全一致',async()=>{
 const a=await setup(),b=await setup();advance(a.d,a.engine,1440);for(let minute=545;minute<=1440;minute+=5)advance(b.d,b.engine,minute);
 assert.deepEqual(a.d.document,b.d.document);assert.ok(Object.keys(a.d.get('state','npcAutonomy','actions')).length);
});
test('工作中离开或失能不能在完成时凭旧在场记录生产',async()=>{
 for(const change of ['location','status']){const {engine,d}=await setup();advance(d,engine,600);const task=Object.values(d.get('state','npcAutonomy','tasks')).find(t=>t.npc===actor);assert.ok(task);
  const wood=count(d,actor,'item_wood');d.set(['state','npcs',actor,change],change==='location'?'loc_hw':'昏迷');advance(d,engine,task.finish);
  assert.equal(d.get('state','npcAutonomy','tasks',task.id,'status'),'失败');assert.equal(count(d,actor,'item_wood'),wood);assert.equal(d.get('state','npcAutonomy','actions',task.id),undefined);
 }
});
test('NPC 交易双方真实同场才成交，钱和物品守恒，买方无需开店',async()=>{
 const {world,engine,d}=await setup(),seller='npc_hw_linsui',item='item_bread';d.set(['state','minute'],600);
 for(const id of [actor,seller]){world.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:'bld_hw_qingdeng',activity:'日常活动',services:id===seller?['trade']:[]}]};d.set(['state','npcs',id,'location'],'bld_hw_qingdeng');d.set(['state','npcs',id,'activity'],'日常活动');}
 const money=d.get('state','npcs',actor,'coins')+d.get('state','npcs',seller,'coins'),items=count(d,actor,item)+count(d,seller,item),stock=count(d,seller,item);
 const plan={kind:'npc-plan',version:1,minute:600,stateFingerprint:npcPlanFingerprint(d.document),proposals:[{npc:actor,actions:[{kind:'trade',seller,item,quantity:1}]}]};
 const result=applyNpcPlan(d,engine,plan,'trade');assert.equal(result.results[0].status,'进行中');advance(d,engine,605);
 assert.equal(count(d,seller,item),stock-1);assert.equal(count(d,actor,item)+count(d,seller,item),items);assert.equal(d.get('state','npcs',actor,'coins')+d.get('state','npcs',seller,'coins'),money);
});
async function plannerTemp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-npc-planner-'));t.after(async()=>{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(resolved,{recursive:true,force:true});});return path.join(dir,'ledger.json');}
test('智能规划复用预算客户端并冻结输入，同日缓存与限额不重复调用模型',async t=>{
 const {engine,d}=await setup(),ledgerFile=await plannerTemp(t);let calls=0;
 const client={generate:async body=>{calls++;const context=JSON.parse(body.messages[1].content);return {usage:{prompt_tokens:100,completion_tokens:80},choices:[{message:{tool_calls:[{function:{name:'propose_npc_actions',arguments:JSON.stringify({proposals:context.people.map(n=>({npc:n.id,actions:[]}))})}}]}}]};}};
 const result=await planNpcAutonomy(engine,d.document,{client,ledgerFile});assert.equal(result.status,'ready');assert.equal(result.input.type,'npc_plan');assert.equal(result.input.plan.proposals.length,12);
 assert.equal((await planNpcAutonomy(engine,d.document,{client,ledgerFile})).cached,true);assert.equal(calls,1);
 d.set(['state','minute'],541);assert.equal((await planNpcAutonomy(engine,d.document,{client,ledgerFile})).status,'limited');assert.equal(calls,1);
});
test('模型故障与无效响应保留失败及费用预留，不伪造成功计划',async t=>{
 const {engine,d}=await setup(),ledgerFile=await plannerTemp(t);let calls=0;const client={generate:async()=>{calls++;throw Error('测试网络故障');}};
 const result=await planNpcAutonomy(engine,d.document,{client,ledgerFile});assert.equal(result.status,'failed');assert.equal(result.input,null);assert.ok(result.spentYuan>0);
 const again=await planNpcAutonomy(engine,d.document,{client,ledgerFile});assert.equal(again.status,'limited');assert.equal(calls,1);
 d.set(['state','minute'],1440);const invalid={generate:async()=>({usage:{prompt_tokens:10,completion_tokens:10},choices:[{message:{tool_calls:[{function:{name:'propose_npc_actions',arguments:JSON.stringify({proposals:[{npc:'invented',actions:[]}]})}}]}}]})};
 assert.equal((await planNpcAutonomy(engine,d.document,{client:invalid,ledgerFile})).status,'failed');
});
