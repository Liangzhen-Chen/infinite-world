import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {searchActions,loadActionRegistry} from '../server-plugin/action-registry.mjs';
import {modelActionCatalog,estimateModelActionTokens} from '../extension/tools.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';

// Original arguments from a3-playtest/reverify/真实试玩.json (2026-10-23).
// Keep these offline: the regression must not depend on a local playtest log.
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(location,minute=558){
 const engine=new WorldEngine(structuredClone(world)),document=engine.initialFromLegacy(seed,'a3-discover');
 document.state.location=location;document.state.minute=minute;
 return {engine,document,run:(tool,args,eventId='replay')=>engine.reduce(document,{tool,args,eventId})};
}
function catalog(f,args){
 const raw=worldActions(f.engine.scoped(f.document),f.document,args),before=structuredClone(raw),model=modelActionCatalog(raw);
 assert.ok(estimateModelActionTokens(model)<=1200);assert.deepEqual(raw,before);
 return {raw,model};
}
async function refusal(f,tool,args){
 let output;
 try{output=await f.run(tool,args);}catch(error){return error;}
 assert.equal(output.result.receipt?.status,'rejected','必须实际拒绝，不能把未抛异常当作成功');
 assert.deepEqual(output.result.receipt.applied,[]);
 return {message:output.result.receipt.reason};
}

test('craft 第3回合原查询保留全部学习槽位、木匠编号及名称',()=>{
 const f=fixture('bld_hw_mill'),{raw,model}=catalog(f,{target:'npc_hw_ayan',query:'教木匠手艺 授课 学费'});
 const learn=model.target.relatedActions.find(row=>row.id==='core:learn');assert.ok(learn);
 assert.deepEqual(learn.slots.map(row=>[row.name,row.kind]),raw.actions.find(row=>row.id===learn.id).slots.map(row=>[row.name,row.kind]));
 assert.ok(learn.slots.find(row=>row.name==='entity').options.some(row=>row.value==='skill_life_6_core'&&row.label==='木匠基础手艺'));
 assert.match(learn.slots.find(row=>row.name==='source').description,/导师npc/);
 assert.match(learn.slots.find(row=>row.name==='student').description,/自己学习可省略或填player/);
});

test('craft/literacy 原 operation 猜测均给合法操作和普通师授纠正路径且不改档',async()=>{
 const f=fixture('bld_hw_mill'),before=structuredClone(f.document);
 for(const operation of ['师授','teach','acquire','study','learn']){
  await assert.rejects(f.run('world_learn',{operation,kind:'skill',entity:'木匠',source:'npc_hw_ayan',student:'player'}),error=>{
   assert.match(error.message,/未知授业操作/);
   for(const name of ['school_inspect','book_give','school_fund','school_close','school_open','book_study'])assert.ok(error.message.includes(name));
   assert.match(error.message,/普通师授.*不填 operation/);return true;
  });
 }
 assert.deepEqual(f.document,before);
});

test('craft 原错误槽位列出含义；未登记简称返回真实候选而不猜成其他实体',async()=>{
 const f=fixture('bld_hw_mill');
 const error=await refusal(f,'world_act',{action:'core:learn',slots:{entity:'npc_hw_ayan',source:'旧磨坊工作台',kind:'skill',student:'player',mode:'acquire',skill:'木匠'}});
  assert.match(error.message,/没有这些槽位：skill/);
  for(const slot of ['entity','source','kind','student','mode'])assert.ok(error.message.includes(`${slot}：`));
 assert.match(error.message,/学习内容的编号或登记名称/);assert.match(error.message,/world_actions query=core:learn/);
 assert.match((await refusal(f,'world_act',{action:'core:learn',slots:{entity:'木匠',source:'npc_hw_ayan',kind:'skill',student:'player',mode:'acquire'}})).message,/木匠基础手艺.*skill_life_6_core/);
});

test('literacy 原参数显式player与省略student走相同结算；登记名称、别名、id归一',async()=>{
 const f=fixture('bld_hw_school');
 const {model}=catalog(f,{query:'识字 授课 学费 借阅'}),learn=model.actions.find(row=>row.id==='core:learn');
 assert.ok(learn.slots.find(row=>row.name==='entity').options.some(row=>row.value==='skill_literacy'&&row.label==='识字'));
 const args={entity:'识字',source:'npc_hw_luqing',kind:'skill',student:'player',mode:'acquire'};
 const explicit=await f.run('world_act',{action:'core:learn',slots:args});
 const {student,...implicit}=args;
 // Replay fingerprints intentionally retain the original submitted spelling;
 // compare actual learning, time, money and people rather than input hashes.
 const outcome=output=>{
  const state=applyPatches(f.document,output.patches).state;
  return {player:state.player,npcs:state.npcs,skills:state.skills,learning:state.learning,minute:state.minute,cost:output.result.cost,success:output.result.success};
 };
 assert.deepEqual(outcome(explicit),outcome(await f.run('world_act',{action:'core:learn',slots:implicit})));
 for(const entity of ['skill_literacy','基础识字'])assert.deepEqual(outcome(explicit),outcome(await f.run('world_act',{action:'core:learn',slots:{...args,entity}})));
 const after=applyPatches(f.document,explicit.patches).state,subject=world.skills.find(row=>row.id==='skill_literacy');
 assert.equal(after.minute-f.document.state.minute,subject.learnMinutes);
 assert.equal(f.document.state.player.coins-after.player.coins,subject.learnFee);
 assert.equal(after.npcs.npc_hw_luqing.coins-f.document.state.npcs.npc_hw_luqing.coins,subject.learnFee);
 assert.ok(explicit.patches.length>0);
});

test('学习归一后仍拒绝无学费与不在场导师；不允许伪填他人同意',async()=>{
 const f=fixture('bld_hw_school'),args={entity:'识字',source:'npc_hw_luqing',kind:'skill',student:'player',mode:'acquire'};
 f.document.state.player.coins=0;
 assert.match((await refusal(f,'world_act',{action:'core:learn',slots:args})).message,/教学费不足/);
 f.document.state.player.coins=200;f.document.state.npcs.npc_hw_luqing.location='loc_bs';
 assert.match((await refusal(f,'world_act',{action:'core:learn',slots:args})).message,/导师不在场/);
 assert.match((await refusal(f,'world_act',{action:'core:learn',slots:{...args,consent:true}})).message,/不能代填同意/);
});

test('交谈第6回合原粮仓查询在搜索、原目录和压缩目录都能找到买粮动作',()=>{
 const f=fixture('bld_hw_council',653),args={target:'bld_hw_council',query:'粮仓 燕麦 购买'};
 assert.ok(searchActions(loadActionRegistry(),args.query).some(row=>row.id==='core:farm.buy'));
 const {raw,model}=catalog(f,args);
 assert.ok(raw.actions.some(row=>row.id==='core:farm.buy'));
 assert.ok(model.actions.some(row=>row.id==='core:farm.buy'));
 const buy=model.target.relatedActions.find(row=>row.id==='core:farm.buy');assert.ok(buy);
 assert.ok(buy.slots.some(row=>row.name==='quantity'&&row.kind==='quantity'));
 // Exact-id discovery continues to rank the requested registered action first.
 assert.equal(searchActions(loadActionRegistry(),'core:farm.buy')[0].id,'core:farm.buy');
});

test('奇思妙想第8回合：原参数是模型虚构分区，保留拒绝并投影可纠正用法',async()=>{
 const f=fixture('bld_hw_qingdeng',1865),{model}=catalog(f,{target:'npc_hw_linsui'});
 assert.match((await refusal(f,'world_time',{activity:'等待',until:{dayOffset:0,hour:7,minute:5}})).message,/目标钟点必须晚于现在/);
 const zone=model.actions.find(row=>row.id==='open:leave_mark').slots.find(row=>row.name==='zone');
 assert.ok(zone);assert.deepEqual(zone.options,[]);assert.match(zone.description,/省略表示当前位置/);
 const original={intent:'在酒馆外院一截待烧废木桩上刻一道普通记号，不施法术、不损伤在用物件',form:'刻痕',zone:'青灯酒馆外院',tags:['mark:custom','wood'],materials:[{item:'item_staff',qty:1}]};
 for(const zone of [original.zone,'bld_hw_qingdeng']){
  const before=structuredClone(f.document),result=await f.run('world_act',{action:'open:leave_mark',slots:{...original,zone}});
  assert.equal(result.result.receipt.status,'rejected');assert.equal(result.result.receipt.code,'E-MARK-ZONE');
  assert.match(result.result.receipt.reason,/没有这个已知分区/);assert.deepEqual(result.result.receipt.applied,[]);assert.deepEqual(f.document,before);
 }
 // The corrected submission uses exactly the existing engine's default zone.
 const {zone:unused,...corrected}=original,result=await f.run('world_act',{action:'open:leave_mark',slots:corrected});
 assert.equal(result.result.receipt.status,'committed');assert.ok(result.result.receipt.applied.some(row=>row.op==='create'));
});

test('更正工具措辞不增加静态提示总长',async()=>{
 const {budget}=await loadPromptBundle();assert.ok(budget.estimatedTokens<=10587,`static prompt: ${budget.estimatedTokens}`);
});
