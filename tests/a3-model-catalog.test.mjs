import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {modelActionCatalog,estimateModelActionTokens,MODEL_ACTION_CATALOG_TOKEN_LIMIT} from '../extension/tools.mjs';
import {createPlaytestServer,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {modelToolResult} from '../extension/turn.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(location,target,query){
 const engine=new WorldEngine(structuredClone(world)),document=engine.initialFromLegacy(seed,'catalog-compact-real');
 document.state.location=location;
 return {engine,document,raw:worldActions(engine.scoped(document),document,{target,query,limit:12})};
}
function bounded(raw){
 const before=structuredClone(raw),model=modelActionCatalog(raw);
 assert.ok(estimateModelActionTokens(model)<=MODEL_ACTION_CATALOG_TOKEN_LIMIT);
 assert.deepEqual(raw,before,'只压缩模型副本，不改变玩家完整卡');
 assert.ok(model.omitted>0);assert.match(model.notice,/已省略 \d+ 项，可用 query\/target 细化/);
 for(const id of ['open:proposal','open:leave_mark'])assert.ok(model.actions.some(row=>row.id===id));
 assert.equal(model.actions.find(row=>row.id==='open:leave_mark').available,raw.actions.find(row=>row.id==='open:leave_mark').available);
 assert.equal(model.target.id,raw.target.id);assert.deepEqual(model.target.state,raw.target.state);
 assert.ok(model.target.blocked.length>0);
 assert.ok((JSON.stringify(model).match(/"fallback":/g)??[]).length<=1);
 // a3r1: the first relevant rows now retain executable slot kinds/choices;
 // later summaries still carry their original id, label and required names.
 for(const row of model.target.relatedActions){
  assert.equal(typeof row.id,'string');assert.equal(typeof row.label,'string');assert.ok(Array.isArray(row.required));
  const source=raw.target.relatedActions.find(action=>action.id===row.id);
  assert.deepEqual(row.required,source.slots.filter(slot=>slot.required).map(slot=>slot.name));
  if(row.slots)assert.deepEqual(row.slots.map(slot=>[slot.name,slot.kind]),source.slots.map(slot=>[slot.name,slot.kind]));
 }
 return model;
}

test('白石镇严辙：完整来源和拒绝细节压缩后不超过1200，状态、原因、开放路径仍可见',()=>{
 const {raw}=fixture('loc_bs','npc_hw_yanzhe'),model=bounded(raw);
 assert.equal(model.target.state.present,true);
 const source=raw.target.primitives.find(row=>row.blocked);
 assert.ok(source);assert.ok(model.target.blocked.some(row=>row.reason===source.blocked.reason));
 const keys=model.target.primitives.map(row=>JSON.stringify([row.op,row.verb,row.kind]));
 assert.equal(new Set(keys).size,keys.length,'每个 op/verb/类只出现一行');
 // This player's three sources may already be unique; require the exact
 // op/verb/class set, rather than assume that every real fixture has duplicates.
 const expectedKeys=[...new Set(raw.target.primitives.map(row=>JSON.stringify([row.effect.op,row.effect.verb,row.effect.type??row.effect.kind??row.effect.field??row.effect.status])))];
 assert.deepEqual(keys.sort(),expectedKeys.sort());
 for(const row of model.target.primitives){
  assert.ok(!Object.hasOwn(row,'source'));assert.ok(!Object.hasOwn(row,'requirements'));
  assert.ok(!Object.hasOwn(row,'blocked'));assert.equal(typeof row.available,'boolean');
  if(!row.available)assert.equal(typeof row.missing,'string');
 }
});

test('河湾渡口：无原语来源时保留拒绝原因与可用留痕，提案仍有结构化输入',()=>{
 const {raw}=fixture('loc_hw_dock','loc_hw_dock'),model=bounded(raw);
 assert.deepEqual(model.target.primitives,[]);
 assert.equal(model.target.blocked[0].reason,raw.target.blocked[0].reason);
 assert.equal(model.fallback.available,true);
 const proposal=model.actions.find(row=>row.id==='open:proposal'),effects=proposal.slots.find(row=>row.name==='effects').inputSchema;
 assert.equal(effects.type,'array');assert.deepEqual(effects.operations.create,['kind','facts']);
 assert.ok(proposal.submission.slots.includes('effects'));
 const form=model.actions.find(row=>row.id==='open:leave_mark').slots.find(row=>row.name==='form');
 assert.ok(form.options.length>0,'可执行的留痕形态不会被裁空');
});

test('细化到购买动作时保留当前商品选择；留痕受限仍给出真实缺项',()=>{
 const {engine,document,raw}=fixture('loc_bs','npc_hw_yanzhe','core:trade.buy');
 const model=bounded(raw),buy=model.actions.find(row=>row.id==='core:trade.buy');
 assert.ok(buy);assert.ok(buy.slots.find(row=>row.name==='item').options.includes('item_clay_pot'));
 const at=engine.byId.get(document.state.location);at.primitiveLimits={...at.primitiveLimits,create:false};
 const unavailable=modelActionCatalog(worldActions(engine.scoped(document),document,{target:'npc_hw_yanzhe'}));
 assert.ok(estimateModelActionTokens(unavailable)<=MODEL_ACTION_CATALOG_TOKEN_LIMIT);
 const mark=unavailable.actions.find(row=>row.id==='open:leave_mark');
 assert.equal(mark.available,false);assert.ok(mark.missing);assert.ok(mark.blocked);
 assert.equal(unavailable.fallback.available,false);
});

test('更多来源和选择不会撑破固定上限，也不会修改来源卡或伪造可用性',()=>{
 const {raw}=fixture('loc_bs','npc_hw_yanzhe');
 raw.target.primitives=Array.from({length:50},()=>raw.target.primitives).flat();
 raw.target.relatedActions=Array.from({length:30},()=>raw.target.relatedActions).flat();
 const model=bounded(raw);
 assert.equal(model.target.primitives.length,3,'重复来源必须合并，不能逐来源铺开');
 assert.ok(model.omitted>raw.target.primitives.length-model.target.primitives.length);
 assert.ok(model.target.primitives.some(row=>!row.available));
});

test('试玩器真实 actions 返回与前端共用有界模型投影，不把完整玩家卡写进工具历史',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 // strict 确认协议下不能再让叙述模型自由连续调用 move/actions。
 // 用真实引擎先建立相同的在场前提；本例的投影与历史断言全部保留。
 const created=await server.api('create',{character:{name:'试玩者'}}),campaignId=created.reference.campaignId;
 await server.api('execute',{campaignId,tool:'world_move',args:{destination:'loc_bs'},eventId:'catalog-preparation',expectedSequence:created.reference.sequence});
 let turn=0,seen;
 const client={async generate(body){
  // 查更多也只选引用，目标由引擎依据原话与真实在场者填入。
  if(turn++===0)return {choices:[{message:{tool_calls:[{id:'look-at-seller',type:'function',function:{name:'world_confirm',arguments:JSON.stringify({ref:'more'})}}]}}]};
  seen=JSON.parse(body.messages.findLast(row=>row.role==='tool').content);
  assert.ok(estimateModelActionTokens(seen)<=MODEL_ACTION_CATALOG_TOKEN_LIMIT);
  assert.equal(seen.target.id,'npc_hw_yanzhe');assert.ok(seen.actions.some(row=>row.id==='open:proposal'));
  return {choices:[{message:{content:'你查看了眼前的做法。<回合 额外="0分" 地点="loc_bs" 在场="npc_hw_yanzhe"/>'}}]};
 }};
 const result=await runPlaytest({scenario:{id:'a3cp-runner',turns:[{input:'查看严辙，不购买。',assertions:[]}]},session:{campaignId},api:server.api,client,bundle:await loadPromptBundle(),countTokens:estimateModelActionTokens,historyWindow:{contextTokens:32000}});
 assert.ok(seen);assert.deepEqual(result.turns[0].errors,[]);
 // 原录制保留完整回执，模型按 llm1-confirm 去噪并折叠重复 JSON。
 // 精确比较正式投影后的值，仍断言模型历史确实收到同一份有界目录。
 assert.deepEqual(modelToolResult(result.turns[0].calls.find(row=>row.tool==='world_actions').result),seen);
});
