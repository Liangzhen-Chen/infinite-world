import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {assertActionRejected} from './helpers/action-refusal.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function act(f,action,slots,id){
 const input={tool:'world_act',eventId:id,args:{action,slots}},out=await f.engine.reduce(f.document,input);
 assert.notEqual(out.result?.receipt?.status,'rejected',JSON.stringify(out.result));
 f.document=applyPatches(f.document,out.patches);return out;
}
test('11.3 T1 普通对话真实推进5–20分钟；F8 场外读取不推进、不记账',async t=>{
 const ui=await uiSession(t,{mutate:s=>{s.location='bld_hw_qingdeng';s.minute=600;}}),before=await ui.read();
 assert.equal((await ui.choose('dialogue.greet',{}, {target:'npc_hw_linsui'})).ok,true);
 // 指南7.3：对话工具不重复计时，真实主持回合尾注经 HTTP 结算额外的交谈时间。
 const view=await ui.server.api('read',{campaignId:ui.campaignId});
 await ui.server.api('execute',{campaignId:ui.campaignId,tool:'world_turn',args:{startMinute:before.state.minute,extraMinutes:10,location:before.state.location},eventId:'guide-tail',expectedSequence:view.reference.sequence,anchor:null});
 const after=await ui.read(),elapsed=after.state.minute-before.state.minute;assert.equal(elapsed,10);assert.ok(elapsed>=5&&elapsed<=20);
 assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.state.inventory,before.state.inventory);
 const stable=await ui.read(),now=await ui.server.api('read',{campaignId:ui.campaignId});
 await ui.server.api('execute',{campaignId:ui.campaignId,tool:'world_turn',args:{outOfCharacter:true,extraMinutes:0},eventId:'guide-ooc',expectedSequence:now.reference.sequence,anchor:null});
 assert.deepEqual(await ui.read(),stable);
});

test('11.3 F4/F7 不接委托离开30天：世界真实结算，返场呈现实际变化，钱粮账可对',async()=>{
 const engine=new WorldEngine(world),loaded=applyIntentSetup(engine,engine.initialFromLegacy(seed,'guide-30days'),{location:'bld_hw_mill',minute:540,coins:1000});assert.deepEqual(loaded.setupUnmet,[]);
 const f={engine,document:loaded.document};
 await act(f,'core:look',{},'guide-initial-look');
 await act(f,'core:move',{destination:'loc_bs'},'guide-leave');const before=structuredClone(f.document);
 const waited=await act(f,'core:time',{minutes:30*1440},'guide-no-quests');
 assert.equal(f.document.state.minute-before.state.minute,30*1440);
 assert.ok(Object.values(f.document.state.npcAutonomy?.actions??{}).some(a=>a.minute>before.state.minute),'NPC 真实自主行动');
 assert.ok(Object.values(f.document.state.quests).every(q=>q.taker!=='player'||q.status==='未领取'),'没有替玩家接受委托');
 assert.ok(Object.keys(f.document.state.settlements).some(id=>f.document.state.settlements[id].food!==before.state.settlements[id].food),'聚落照常消耗生产');
 const back=await act(f,'core:move',{destination:'bld_hw_mill'},'guide-return');
 const notice=back.result.notices.find(n=>n.type==='return');assert.ok(notice?.text,'返场必须有本次真实推进产生的变化');
 assert.ok(f.document.state.visits.lastReturn.lines.length>0);const scene=f.engine.scene(f.document,'');
 assert.ok(f.document.state.visits.lastReturn.lines.every(line=>scene.includes(line)),'场景呈现同一组事实');
 assert.ok(!waited.result.notices.some(n=>n.type==='return'),'离屏期间不提前显示返场见闻');
 assert.deepEqual(auditLedger(f.document.ledger),[]);assert.deepEqual(reconcile(engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
});

test('11.3 F3 教村民识字：真实课时、学生增长、教师知识保留和当日重复拒绝',async()=>{
 const student='npc_hw_ayan',skill='skill_literacy',w=structuredClone(world),npc=w.npcs.find(n=>n.id===student);
 npc.schedule={default:[{start:0,end:1440,location:'bld_hw_mill',activity:'闲坐',services:[]}]};npc.goals={short:[],medium:[],long:[]};
 const engine=new WorldEngine(w),initial=engine.initialFromLegacy(seed,'guide-literacy');
 initial.state.npcs[student].skills={[skill]:0};
 const loaded=applyIntentSetup(engine,initial,{location:'bld_hw_mill',minute:600,present:[student],abilities:{skills:{[skill]:900}}});assert.deepEqual(loaded.setupUnmet,[]);
 const f={engine,document:loaded.document},before=structuredClone(f.document),rule=engine.rules.npcGrowth.teach;
 await act(f,'core:learn',{entity:skill,source:'player',student},'guide-literacy-lesson');
 assert.equal(f.document.state.minute-before.state.minute,rule.minutes);
 assert.equal(f.document.state.npcs[student].skills[skill],rule.gain);assert.equal(f.document.state.skills[skill].proficiency,900);
 assert.equal(f.document.state.player.coins,before.state.player.coins);assert.ok(f.document.state.npcs[student].memoryStream.some(m=>m.sourceEvent==='guide-literacy-lesson'));
 const stable=structuredClone(f.document);
 await assertActionRejected(engine.reduce(f.document,{tool:'world_act',eventId:'guide-literacy-repeat',args:{action:'core:learn',slots:{entity:skill,source:'player',student}}}),/隔日/);
 assert.deepEqual(f.document,stable);assert.deepEqual(auditLedger(f.document.ledger),[]);assert.deepEqual(reconcile(engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
});
