// A3-responsible slices of the original run-005/006/007 questions.
// Full event verdicts (including S4/S5/S6/S8 gaps) live in 事件推演测试.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {applyIntentSetup} from '../../tools/a3-score.mjs';
import {loadActionRegistry} from '../../server-plugin/action-registry.mjs';
import {appendActionPatches} from '../../server-plugin/primitive-policy.mjs';
import {auditLedger} from '../../server-plugin/ledger.mjs';
import {reconcile} from '../helpers/ledger-audit.mjs';
import {assertActionRejected} from '../helpers/action-refusal.mjs';
import {recordLocalContact} from '../../server-plugin/environment.mjs';
import {fixture as faithFixture,A,B,T} from '../helpers/faith.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('../fixtures/legacy/seed.json',import.meta.url),'utf8'));
const NPC='npc_hw_linsui',OTHER='npc_hw_hezhou',INN='bld_hw_qingdeng';
function fixture(setup={},programs=[],changeWorld=()=>{}){
 const w=structuredClone(world);changeWorld(w);
 for(const n of w.npcs)if([NPC,OTHER].includes(n.id)){delete n.schedule;n.tier='full';}
 if(programs.length)w.actionDefinitions={format:1,actions:[...structuredClone(loadActionRegistry().actions),...programs]};
 const engine=new WorldEngine(w),loaded=applyIntentSetup(engine,engine.initialFromLegacy(seed,'a3-p1-p9'),{location:INN,minute:600,present:[NPC,OTHER],...setup});
 assert.deepEqual(loaded.setupUnmet,[]);
 return {engine,document:loaded.document};
}
async function call(f,action,slots,id){
 const input={tool:'world_act',eventId:id,args:{action,slots}},before=structuredClone(f.document),out=await f.engine.reduce(f.document,input);
 assert.deepEqual(f.document,before,'公开动作不就地改原档');
 assert.notEqual(out.result?.receipt?.status,'rejected',JSON.stringify(out.result));
 f.document=applyPatches(f.document,out.patches);return {out,input,before};
}
function clean(f){assert.deepEqual(auditLedger(f.document.ledger),[]);assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});}
function program(id,outcomes,extra={}){return {id,label:id,narration:id,synonyms:[],visibility:{catalog:'here'},slots:[],cost:{owner:'primitives',time:1},outcomes,...extra};}
async function contact(f,id){const d=f.engine.primitiveDraft(f.document);assert.equal(recordLocalContact(d,f.engine,id,'probe-initial-contact'),true);f.document=applyPatches(f.document,d.patches);}

test('P1 run-005 E15：实有钱款转移守恒，未经授权的跨人转款不能伪称追回',async()=>{
 const f=fixture({coins:10}),before=structuredClone(f.document);
 const gift={intent:'把十铜交给林穗',effects:[{op:'transfer',from:'player',to:NPC,resource:'coin_river',qty:10}]};
 const input={tool:'world_propose',args:gift,eventId:'p1-first-holder'},first=await f.engine.reduce(f.document,input);f.document=applyPatches(f.document,first.patches);
 assert.equal(f.document.state.player.coins,0);assert.equal(f.document.state.npcs[NPC].coins,before.state.npcs[NPC].coins+10);clean(f);
 const stable=structuredClone(f.document);
 // 06 §6.5：NPC→NPC 未匹配到获授权的行动；严格断言实际路由拒绝码和零写入。
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_propose',eventId:'p1-fake-recovery',args:{intent:'未经允许从旧持有人取钱',effects:[{op:'transfer',from:NPC,to:OTHER,resource:'coin_river',qty:10}]}}),{code:'E-OPEN-NOT-ROUTED'});
 assert.deepEqual(f.document,stable);assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(f.document)),input)).patches,[]);
});

test('P2 run-006 E19：清醒幼童不自动产生紧急同意，口头自称监护不授权',async()=>{
 const action=program('probe:child_care',[{op:'vital',target:NPC,delta:2,type:'healing'}],{slots:[{name:'target',kind:'entity',required:true}],consent:{from:'target',scope:'healing',onRefusal:'abort'}});
 const f=fixture({},[action],w=>{const child=w.npcs.find(n=>n.id===NPC);child.age=8;child.flags={minor:true};child.redLines=['healing'];});
 await contact(f,NPC);f.document.state.npcs[NPC].hp=1;f.document.state.npcs[NPC].maxHp=10;
 const before=structuredClone(f.document),input={tool:'world_act',eventId:'p2-care',args:{action:action.id,slots:{target:NPC}}};
 await assert.rejects(f.engine.reduce(f.document,input),{code:'E-CONSENT'});assert.deepEqual(f.document,before);
 await assert.rejects(f.engine.reduce(f.document,{...input,args:{...input.args,slots:{target:NPC,guardian:OTHER,emergency:true}}}),{code:'E-ACTION-SLOT'});
 assert.deepEqual(f.document,before);clean(f);
});

test('P3 run-006 E13/N3/E5：在押仍可说话，普通走路和自报替身释放不能消灭拘押',async()=>{
 const f=fixture({holdings:[{id:'prisoner',kind:'guest_of',holder:'player',subject:NPC,terms:{mode:'detained'}}]});
 const before=structuredClone(f.document);
 // 06 §6.10.4：公开旧动作以拒绝回执返回；同时核对原因、零代价、零效果与零补丁。
 await assertActionRejected(f.engine.reduce(f.document,{tool:'world_act',eventId:'p3-leave',args:{action:'core:move',slots:{destination:'loc_hw'}}}),/羁押|拘禁/,null);
 assert.deepEqual(f.document,before);
 const speech=await f.engine.reduce(f.document,{tool:'world_propose',eventId:'p3-speech',args:{intent:'对身边的人说今日天气',target:NPC,effects:[{op:'emit',verb:'tell',target:NPC,visibility:'present',payload:{text:'今日天气'}}]}});
 f.document=applyPatches(f.document,speech.patches);assert.ok(speech.result.receipt.applied.some(e=>e.op==='emit'));
 const stable=structuredClone(f.document),holding=Object.values(f.document.holdings.rows).find(h=>h.kind==='guest_of'&&h.holder==='player'&&h.until===undefined);
 assert.ok(holding);
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_propose',eventId:'p3-substitute',args:{intent:'我自称替身已服刑，放我离开',effects:[{op:'holding.close',holding:holding.id,reason:'substitute_claim'}]}}));
 assert.deepEqual(f.document,stable);assert.equal(f.document.state.location,INN);clean(f);
});

test('P4 run-006 N7/run-007 E17：无同意治疗走实际对抗且保留标签与一次代价',async()=>{
 const action=program('probe:forced_care',[{op:'vital',target:NPC,delta:3,type:'healing'}],{slots:[{name:'target',kind:'entity',required:true}],consent:{from:'target',scope:'healing',onRefusal:'contest'}});
 const f=fixture({},[action],w=>{w.npcs.find(n=>n.id===NPC).redLines=['healing'];});await contact(f,NPC);
 f.document.state.npcs[NPC].hp=1;f.document.state.npcs[NPC].maxHp=10;
 const {out,before,input}=await call(f,action.id,{target:NPC},'p4-forced-care'),receipt=out.result.receipt;
 assert.ok(receipt.check);assert.equal(Object.keys(f.document.state.checks).filter(k=>k.startsWith(input.eventId)).length,1);
 assert.equal(f.document.state.minute-before.state.minute,receipt.cost.time);
 if(receipt.check.success){assert.ok(f.document.state.npcs[NPC].hp>1);assert.ok(receipt.applied[0].tags.some(tag=>tag.startsWith('unconsented')));}
 else assert.equal(f.document.state.npcs[NPC].hp,1);
 assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(f.document)),input)).patches,[]);clean(f);
});

test('P5 run-007 E6：公开授业按真实工时增长学徒技能，教师所学不因传授扣减',async()=>{
 const student='npc_hw_ayan',skill='skill_life_6_core',w=structuredClone(world),base=w.npcs.find(n=>n.id===student);
 base.schedule={default:[{start:0,end:1440,location:'bld_hw_mill',activity:'做木工',services:[]}]};base.goals={short:[],medium:[],long:[]};
 const engine=new WorldEngine(w),initial=engine.initialFromLegacy(seed,'p5-teach');
 initial.state.location='bld_hw_mill';initial.state.minute=600;initial.state.npcs[student].location='bld_hw_mill';initial.state.npcs[student].activity='做木工';initial.state.npcs[student].skills={[skill]:120};
 initial.state.skills[skill]={proficiency:900,breakthroughs:[],daily:{}};initial.state.professions.life=['profession_life_6'];
 const loaded=applyIntentSetup(engine,initial,{}),f={engine,document:loaded.document},before=structuredClone(f.document);
 await call(f,'core:learn',{entity:skill,source:'player',student},'p5-teach');
 assert.equal(f.document.state.minute-before.state.minute,120);assert.equal(f.document.state.npcs[student].skills[skill],160);
 assert.equal(f.document.state.skills[skill].proficiency,900);assert.equal(f.document.state.player.coins,before.state.player.coins);clean(f);
});

test('P6 run-007 E18：有限显兆重复祭仪不能绕过实际冷却，供品与费用来自原账户',async()=>{
 const s=faithFixture();s.doc.state.minute=3*1440+540;
 for(const id of ['player',A,B]){const n=id==='player'?s.doc.state.player:s.doc.state.npcs[id];n.faith={deity:'deity_bank',temple:T,observedSince:0,lastBreach:-1};}
 const grants=applyIntentSetup(s.engine,s.doc,{history:[A,B].map((actor,i)=>({id:`p6-willing-${i}`,verb:'consented',at:s.doc.state.minute-1,actor,to:'player',scope:'rite',subject:T,terms:{purpose:'bank_sign'},expires:s.doc.state.minute+500,revoked:false,source:{kind:'corpus_premise',row:'P6-run007-E18'}}))});assert.deepEqual(grants.setupUnmet,[]);
 const f={engine:s.engine,document:grants.document},before=structuredClone(grants.document);
 // Missing, wrong-purpose, expired and revoked grants must not spend a single
 // offering or substitute an NPC's consent. Keep the public boolean refusal.
 for(const reason of ['missing','purpose','expired','revoked']){
  const denied=structuredClone(before);
  if(reason==='missing')denied.state.consentEvents=[];
  if(reason==='purpose')denied.state.consentEvents[0].terms.purpose='lintel_sign';
  if(reason==='expired')denied.state.consentEvents[0].until=denied.state.minute;
  if(reason==='revoked')denied.state.consentEvents.push({id:'p6-revoked',type:'consent_revoked',from:A,consent:denied.state.consentEvents[0].id,at:denied.state.minute});
  const unchanged=structuredClone(denied);
  await assertActionRejected(f.engine.reduce(denied,{tool:'world_act',eventId:`p6-denied-${reason}`,args:{action:'core:settlement.faith_rite',slots:{org:T,choice:'bank_sign',workers:[A,B]}}}),/参与者同意/);
  assert.deepEqual(denied,unchanged);
 }
 await assertActionRejected(f.engine.reduce(before,{tool:'world_act',eventId:'p6-fake-consent',args:{action:'core:settlement.faith_rite',slots:{org:T,choice:'bank_sign',workers:[A,B],consent:true}}}),/需要对方答应/);
 const first=await call(f,'core:settlement.faith_rite',{org:T,choice:'bank_sign',workers:[A,B]},'p6-first');
 assert.equal(first.out.result.response.applied,true);const afterFirst=structuredClone(f.document);
 const rule=f.engine.rules.faith.rites.find(r=>r.id==='bank_sign'),qty=(d,item)=>f.engine.quantity(f.engine.primitiveDraft(d),'player',item);
 assert.equal(before.state.player.coins-afterFirst.state.player.coins,rule.coins);
 assert.equal(qty(before,'item_resin')-qty(afterFirst,'item_resin'),rule.offerings.item_resin);
 assert.equal(afterFirst.state.minute-before.state.minute,rule.minutes);
 const cooldown=afterFirst.state.records[`faith_cooldown:${T}:deity_bank`];assert.equal(cooldown.sourceEvent,'p6-first');
 const second=await call(f,'core:settlement.faith_rite',{org:T,choice:'bank_sign',workers:[A,B]},'p6-second');
 assert.equal(second.out.result.response.applied,false);
 assert.equal(afterFirst.state.player.coins-f.document.state.player.coins,rule.coins);
 assert.equal(qty(afterFirst,'item_resin')-qty(f.document,'item_resin'),rule.offerings.item_resin);
 assert.deepEqual(f.document.state.records[`faith_cooldown:${T}:deity_bank`],cooldown);
 assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(f.document)),first.input)).patches,[]);clean(f);
});

test('P7 run-007 E16资源切片：多资源公开提案缺第二份货即全笔回滚，不先支付第一份钱',async()=>{
 const item='item_wood',action=program('probe:supply',[{op:'transfer',from:'player|coin_river|purse',to:`${NPC}|coin_river|purse`,qty:3},{op:'transfer',from:`player|${item}|inventory`,to:`${NPC}|${item}|inventory`,qty:2}]);
 const f=fixture({coins:3,inventory:{[item]:1}},[action]),before=structuredClone(f.document);
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_act',eventId:'p7-short-supply',args:{action:action.id,slots:{}}}),{code:'E-TRANSFER-BALANCE'});
 assert.deepEqual(f.document,before);assert.equal(f.document.state.player.coins,3);clean(f);
});

test('P8 兜底：不能造瞬移门，明确确认只留下能被人感知的记号且不宣称原愿望达成',async()=>{
 const f=fixture(),before=structuredClone(f.document),{out,input}=await call(f,'open:leave_mark',{intent:'画一扇直达王都的门',form:'涂画',tags:['mark:warning']},'p8-mark');
 const receipt=out.result.receipt;assert.equal(receipt.fallback.originalIntentFulfilled,false);assert.ok(receipt.mark.triggered);
 assert.ok(f.document.state.created[receipt.mark.entity]);assert.equal(f.document.state.location,INN);
 assert.equal(f.document.state.minute-before.state.minute,f.engine.world.openActionRules.mark.minutes);
 assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(f.document)),input)).patches,[]);clean(f);
});

test('P9 补丁/RX与创建兼容：确认重查追加条件，旧创建入口不印钱物，JSON重试不重复创建',async()=>{
 const action=appendActionPatches(program('probe:bounded',[{op:'transfer',from:'player|coin_river|purse',to:`${NPC}|coin_river|purse`,qty:1}]),[{id:'local:guard',field:'preconditions',op:'append',value:'month() == 1',reason:'本地仅首月办理'}]);
 const f=fixture({},[action]),input={tool:'world_act',eventId:'p9-guard',args:{action:action.id,slots:{}}},before=structuredClone(f.document);
 assert.equal((await f.engine.previewAction(f.document,input)).receipt.status,'preview');assert.deepEqual(f.document,before);
 const later=structuredClone(f.document);later.state.minute=30*1440;await assert.rejects(f.engine.reduce(later,input),{code:'E-PRECONDITION'});assert.equal(later.state.player.coins,before.state.player.coins);
 const {out,input:created}=await call(f,'core:create',{type:'npc',name:'试演赶车学徒',data:{age:16,occupation:'学徒',notes:'等待师傅修理车轮',coins:1000}},'p9-create');
 const npc=out.result.entity;assert.equal(f.document.state.npcs[npc].coins,0);assert.equal(f.document.state.created[npc].flags.romanceable,false);
 assert.equal(f.document.state.player.coins,before.state.player.coins);assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(f.document)),created)).patches,[]);
 // 同上：保留不能凭空造物的原因，并增强为公开拒绝回执的完整回滚保证。
 const stable=structuredClone(f.document);await assertActionRejected(f.engine.reduce(f.document,{tool:'world_act',eventId:'p9-free-item',args:{action:'core:create',slots:{type:'item',name:'凭空的货物',data:{}}}}),/不能凭空/);assert.deepEqual(f.document,stable);clean(f);
});
