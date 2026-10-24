import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {finishContractTurn} from '../extension/turn-contract.mjs';
import {consistencyReviewRequest,validateConsistencyResponse} from '../server-plugin/consistency-review.mjs';
import {claimFor,reviewPayload,reviewResponse} from './helpers/consistency-response.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const response=tool_calls=>({choices:[{finish_reason:'tool_calls',message:{tool_calls}}]});
const call=(name,args)=>({id:'offline-call',type:'function',function:{name,arguments:JSON.stringify(args)}});

test('contract2 两条行动原文补跑：候选优先、空候选仍可提交原意，未调用前不产生结算',async()=>{
 const samples=[
  {text:'我捧起一捧池水，许个愿，要它不借助任何药材和手艺，立刻变成能治百病的灵药，然后拿去高价卖掉。',candidates:[],action:'open:proposal'},
  {text:'我接受刚才这份送十份燕麦的委托，然后问林穗我还需要做什么。',candidates:[{action:'core:quest.accept',slots:{quest:'quest_recorded'}}],action:'core:quest.accept'},
 ];
 for(const sample of samples){
  let writes=0,requests=0;
  const result=await finishContractTurn({playerText:sample.text,draft:'原稿声称完成',messages:[{role:'user',content:sample.text}],narrate:false,
   tools:[{type:'function',function:{name:'world_act'}}],
   gate:async()=>({status:writes?'ready':'pending',safeText:writes?'实际拒绝回执':'尚未裁决',candidates:sample.candidates}),
   generate:async(body,label)=>{
    requests++;assert.equal(label,'turn-tool-retry');assert.equal(writes,0);assert.equal(body.tool_choice,'required');
    assert.equal(body.messages[0].content,sample.text);
    const instruction=body.messages.at(-1).content;
    assert.match(instruction,/优先选择与原意相符的行动候选/);
    assert.match(instruction,/world_no_action 只用于纯闲聊\/纯观察/);
    assert.match(instruction,/不能以无行动代替拒绝/);assert.match(instruction,/open:proposal/);
    assert.doesNotMatch(instruction,/不要自动执行预览候选/);
    return response([call('world_act',{action:sample.action,slots:sample.candidates[0]?.slots??{intent:sample.text}})]);
   },
   execute:async(name,args)=>{writes++;assert.equal(name,'world_act');assert.equal(args.action,sample.action);return {ok:true,receipt:{status:'rejected',applied:[],reason:'当前前提不足'}};},
   review:async()=>({canCommit:false,safeText:'实际拒绝回执'})});
  assert.equal(requests,1);assert.equal(writes,1);assert.equal(result.text,'实际拒绝回执');
 }
});

test('contract2 发布原参数先返回可纠正私人单写法；修正后只托管，未承接，不虚增钱款',async()=>{
 const engine=new WorldEngine(structuredClone(world)),before=engine.initialFromLegacy(seed,'contract2-private');
 before.state.minute=541;before.state.location='bld_hw_qingdeng';
 const args={operation:'publish',publisher:'npc_hw_linsui',taker:'player',consent:true,reward:20,grade:'D',
  content:'替青灯酒馆买十份燕麦送到酒馆；粮钱中超出二十铜报酬的部分由承接人自理。',objective:{type:'deliver',item:'燕麦',quantity:10,location:'bld_hw_qingdeng'}};
 const saved=structuredClone(before);
 await assert.rejects(engine.reduce(before,{tool:'world_quest',args,eventId:'original'}),/personal:true/);
 assert.deepEqual(before,saved);
 const output=await engine.reduce(before,{tool:'world_quest',args:{...args,personal:true},eventId:'corrected'}),after=applyPatches(before,output.patches);
 const quest=after.state.quests.quest_corrected;
 assert.equal(quest.status,'公开');assert.equal(quest.taker,null);assert.equal(quest.personal,true);assert.equal(quest.escrow,20);
 assert.equal(after.state.npcs.npc_hw_linsui.coins,before.state.npcs.npc_hw_linsui.coins-20);
 assert.equal(after.state.player.coins,before.state.player.coins);
 assert.equal(after.state.npcs.npc_hw_linsui.coins+quest.escrow,before.state.npcs.npc_hw_linsui.coins);
 await assert.rejects(engine.reduce(before,{tool:'world_quest',args:{...args,personal:true,grade:'C'},eventId:'bad-grade'}),/私人任务只能发布D级/);
 assert.deepEqual(before,saved);
});

test('contract2 维修原参数纠正工序后仍真实拒绝缺技能，错误给出技能编号且协助不替代前提',async()=>{
 const engine=new WorldEngine(structuredClone(world)),before=engine.initialFromLegacy(seed,'contract2-repair');
 before.state.location='bld_hw_mill';before.state.inventory.item_staff.durability=98;
 delete before.state.skills.skill_life_6_core;
 const saved=structuredClone(before),args={operation:'repair',item:'item_staff',repairPlan:'用削木小刀修整杖身磨损处、削平毛刺并试压握痕，一次为限'};
 await assert.rejects(engine.reduce(before,{tool:'world_craft',args,eventId:'wrong-plan'}),/repair_staff_trim.*省略repairPlan/);
 for(const extra of [{repairPlan:'repair_staff_trim'},{},{repairPlan:'repair_staff_trim',helpers:['npc_hw_ayan']}]){
  await assert.rejects(engine.reduce(before,{tool:'world_craft',args:{operation:'repair',item:'item_staff',...extra},eventId:'missing-skill'}),/尚未掌握维修所需技能.*skill_life_6_core.*先通过学习/);
  assert.deepEqual(before,saved);
 }
});

test('contract2 审查呈现口径：感官可保留；错资源、错数量及伪 NPC 决定继续拦截',()=>{
 const state={minute:674,location:'bld_hw_mill',player:{coins:20},inventory:{},npcs:{npc_hw_ayan:{location:'bld_hw_mill'}}};
 const input={draft:'阿砚收起六枚铜钱。',playerText:'我付六铜学手艺。',before:state,after:state,allowedEntities:[{id:'npc_hw_ayan',name:'阿砚'}],
  receipts:[{tool:'world_learn',args:{source:'npc_hw_ayan'},result:{ok:true},participants:['player','npc_hw_ayan'],applied:[{op:'transfer',resource:'coin',holder:'npc_hw_ayan',delta:6}]}]};
 const request=consistencyReviewRequest(input),payload=reviewPayload(request),segment=payload.segments[0];
 assert.match(request.messages[0].content,/金额文字、收款人或施害者不是被计量的资源/);assert.match(request.messages[0].content,/普通同地挪步/);
 const source=payload.sources.find(row=>row.sourceId==='settlement-effect:0'),ref={sourceId:source.sourceId,quote:source.text};
 const check=extra=>validateConsistencyResponse(reviewResponse(input,[],[claimFor(segment,{subject:'npc_hw_ayan',kind:'change',object:'coin',quantity:6,verdict:'supported',references:[ref],...extra})]),input);
 assert.deepEqual(check({}),[]);
 assert.deepEqual(check({kind:'observation',object:null,quantity:null,references:[]}),[]);
 for(const extra of [{object:'item_wood'},{quantity:60},{subject:'player'},{kind:'decision',decision:{outcome:'agree',request:{},scope:{}}}])assert.ok(check(extra).some(issue=>issue.severity==='error'));
});

test('contract2 生命与休息来源投影：hp 的实际增减可引用，感官恢复不增加伤病状态',()=>{
 const before={minute:1262,location:'loc_hw_northwood',player:{hp:10,maxHp:12},inventory:{},npcs:{}},after={...before,minute:1442,player:{hp:12,maxHp:12}};
 const input={draft:'生命恢复两点。',playerText:'恢复正常后休息三小时，不做别的事。',before,after,allowedEntities:[],
  receipts:[{tool:'world_time',args:{activity:'休息',minutes:180},result:{ok:true},applied:[{op:'need',holder:'player',need:'hp',delta:2},{op:'time',minutes:180,minute:1442}]}]};
 for(const sourceId of ['receipt:0:effect:1','settlement-effect:0','receipt:0']){
  const payload=reviewPayload(input),segment=payload.segments[0],source=payload.sources.find(row=>row.sourceId===sourceId);
  if(sourceId!=='receipt:0')assert.equal(source.object,'hp');
  const quote=source.text??payload.evidence.find(row=>row.id===source.evidenceId).text;
  const check=extra=>validateConsistencyResponse(reviewResponse(input,[],[claimFor(segment,{kind:'change',subject:'player',object:'hp',quantity:2,verdict:'supported',references:[{sourceId,quote}],...extra})]),input);
  assert.deepEqual(check({}),[]);
  for(const extra of [{quantity:20},{object:'mp'},{subject:'npc_other'}])assert.ok(check(extra).some(issue=>issue.severity==='error'));
 }
 const rest={...input,draft:'三小时的休息里，肩臂不再发紧，呼吸也匀了。'},payload=reviewPayload(rest);
 const claims=payload.segments.map((segment,index)=>claimFor(segment,index===0?{kind:'history',subject:'player',object:null,quantity:180,time:{mode:'past',at:1262,until:1442},verdict:'supported',references:[{sourceId:'receipt:0:effect:2',quote:'"minutes":180'}]}:{kind:'observation',verdict:'supported',references:[]}));
 assert.deepEqual(validateConsistencyResponse(reviewResponse(rest,[],claims),rest),[]);
});
