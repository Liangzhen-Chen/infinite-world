import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {withLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {schemaValidator} from '../server-plugin/primitive-schema.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world));
 const document=withLedger(engine,engine.initialFromLegacy(seed,'intent-proposal')).document;
 return {engine,document};
}
const input=(args,eventId='intent-test')=>({tool:'world_propose',eventId,args});
async function act(engine,document,tool,args,eventId){
 const result=await engine.reduce(document,{tool,args,eventId});
 assert.notEqual(result.result?.ok,false,JSON.stringify(result.result?.receipt));
 return applyPatches(document,result.patches);
}
function refusal(receipt){
 assert.ok(['not_submitted','rejected'].includes(receipt.status));assert.deepEqual(receipt.applied,[]);
 assert.ok(receipt.reason);assert.ok(receipt.missing.length);assert.ok(receipt.alternatives.length);assert.ok(receipt.repair.length);
}

test('动态目录和生产 schema 允许不填 effects，显式 effects 仍有原结构约束',()=>{
 const {engine,document}=fixture(),valid=schemaValidator('proposal');
 assert.equal(valid({intent:'等待'}),true);assert.equal(valid({intent:'等待',effects:'自己决定'}),false);
 const offer=worldActions(engine.scoped(document),document,{query:'open:proposal'}).actions[0];
 assert.match(offer.hint,/可只填 intent/);assert.notEqual(offer.slots.find(s=>s.name==='effects').required,true);
});

test('真实练习：意图构造与等价显式效果的预览、提交、耗时和账本相同',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 const args={intent:'持续练习技能',means:{skill:'skill_light',minutes:30}};
 const explicit={...args,effects:[{op:'learn',entity:'player',subject:'skill_light',learningSource:'practice'}]};
 const a=await engine.previewAction(document,input(args)),b=await engine.previewAction(document,input(explicit));
 assert.equal(a.receipt.status,'preview');assert.equal(a.receipt.routing.routed,'core:practice.session');
 for(const field of ['applied','cost','check','consent'])assert.deepEqual(a.receipt[field],b.receipt[field],field);
 assert.deepEqual(document,before);
 const x=await engine.reduce(document,input(args)),y=await engine.reduce(document,input(explicit));
 assert.equal(x.result.receipt.status,'committed');
 for(const field of ['applied','cost','check','consent'])assert.deepEqual(x.result.receipt[field],y.result.receipt[field],field);
 const after=applyPatches(document,x.patches),other=applyPatches(document,y.patches);
 assert.equal(after.state.minute,other.state.minute);assert.deepEqual(after.state.skills,other.state.skills);assert.deepEqual(after.ledger,other.ledger);
 assert.deepEqual(auditLedger(after.ledger),[]);
 const replay=await engine.reduce(after,input(args));assert.equal(replay.result.receipt.duplicate,true);assert.deepEqual(replay.patches,[]);
});

test('无来源的灵药意图有统一拒绝、替代和 fallback，预览和提交都零写入',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 for(const intent of ['让池水立刻变成能治百病的灵药','等待然后立刻变成能治百病的灵药']){
  const args={intent,means:{minutes:1}};
  const preview=await engine.previewAction(document,input(args));refusal(preview.receipt);assert.ok(preview.receipt.fallback);
  const result=await engine.reduce(document,input(args));refusal(result.result.receipt);assert.deepEqual(result.patches,[]);
 }
 assert.deepEqual(document,before);
});

test('含糊进食意图澄清多个真实动作，不能擅自挑选或写入',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 // 当前初始角色只有一项技能，练习可唯一选定；进食确有多个
 // 真实目录选项，保留“不能擅自挑选”的断言意图。
 const preview=await engine.previewAction(document,input({intent:'进食'}));
 refusal(preview.receipt);assert.equal(preview.receipt.routing.status,'needs_slots');
 assert.ok(preview.receipt.routing.candidates.length>1);
 assert.ok(preview.receipt.routing.candidates.every(c=>engine.world.actionDefinitions.actions.some(a=>a.id===c.id)));
 const result=await engine.reduce(document,input({intent:'进食'}));assert.deepEqual(result.patches,[]);assert.deepEqual(document,before);
});

test('意图不能伪造同意、远处目标或超过注册练习上限',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 const proposals=[
  {intent:'等待',means:{minutes:1},consent:{granted:true}},
  {intent:'持续练习技能',means:{skill:'skill_light',minutes:481}},
  {intent:'尝试开锁',target:'feature_s1_anchor_dock'}
 ];
 for(const args of proposals){
  const preview=await engine.previewAction(document,input(args));refusal(preview.receipt);
  const result=await engine.reduce(document,input(args));assert.deepEqual(result.patches,[]);refusal(result.result.receipt);
 }
 assert.deepEqual(document,before);
});

test('world_act 的旧归档网关也接受仅意图，并仍由真实等待动作结算',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 const result=await engine.reduce(document,{tool:'world_act',eventId:'intent-gateway',args:{action:'open:proposal',slots:{intent:'等待',means:{minutes:1}}}});
 assert.equal(result.result.receipt.status,'committed');assert.equal(applyPatches(document,result.patches).state.minute,before.state.minute+1);
});

test('显式 effects 优先，不用意图重新推导或覆盖原效果',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 const args={intent:'让池水立刻变成能治百病的灵药',effects:[{op:'emit',verb:'tell',target:'player',visibility:'private',payload:{text:'只是说出这个设想'}}]};
 const preview=await engine.previewAction(document,input(args));
 assert.equal(preview.receipt.status,'preview');assert.equal(preview.receipt.routing.status,'open');
 assert.ok(preview.receipt.applied.some(e=>e.op==='emit'));assert.deepEqual(document,before);
});

test('关闭开放动作后，仅意图也不能绕过设置',async()=>{
 const {engine,document}=fixture();
 // Campaign configuration is not a gameplay prerequisite or invented item.
 document.state.records.action_config={category:'action_config',openActions:'off'};
 const before=structuredClone(document),args={intent:'等待',means:{minutes:1}};
 const preview=await engine.previewAction(document,input(args));refusal(preview.receipt);assert.equal(preview.receipt.code,'E-OPEN-DISABLED');
 const result=await engine.reduce(document,input(args));assert.deepEqual(result.patches,[]);assert.deepEqual(document,before);
});

test('真实买罐、步行到渡口后，只写装水意图应构造水量转移并可预览',async()=>{
 const {engine,document:initial}=fixture();let document=initial;
 document=await act(engine,document,'world_move',{destination:'河湾村',mode:'walk'},'intent-village');
 document=await act(engine,document,'world_move',{destination:'白石镇',mode:'walk'},'intent-town');
 for(let i=0;i<48;i++){
  const seller=document.state.npcs.npc_hw_yanzhe;
  if(seller.location===document.state.location&&seller.services?.includes('trade'))break;
  document=await act(engine,document,'world_time',{minutes:30},`intent-market-${i}`);
 }
 document=await act(engine,document,'world_trade',{seller:'严辙',item:'素面陶罐',quantity:1},'intent-pot');
 assert.ok((document.state.inventory.item_clay_pot?.quantity??0)>0);
 document=await act(engine,document,'world_move',{destination:'河湾村',mode:'walk'},'intent-return');
 document=await act(engine,document,'world_move',{destination:'旧渡口',mode:'walk'},'intent-dock');
 // The return journey arrives at night. S4 requires actual daylight perception
 // and an approach; wait through the real clock before handling water.
 document=await act(engine,document,'world_time',{minutes:(600-document.state.minute%1440+1440)%1440},'intent-daylight');
 document=await act(engine,document,'world_act',{action:'core:environment.approach',slots:{target:'feature_hw_pool'}},'intent-pool-approach');
 const before=structuredClone(document),preview=await engine.previewAction(document,input({intent:'把渡口池水装进陶罐'}));
 assert.equal(preview.receipt.status,'preview');
 assert.ok(preview.receipt.applied.some(e=>e.op==='transfer'||e.result?.kind==='water_transfer'));
 assert.deepEqual(document,before);
});
