import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup,executeIntent} from '../tools/a3-score.mjs';
import {runPrelude} from '../tools/a3-setup/prelude.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';
import {obligationView,pawnDeadline} from '../server-plugin/obligation-state.mjs';
import {aliveHoldings} from '../server-plugin/holdings.mjs';

const engine=new WorldEngine(await loadWorld());
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-prelude');
const scene=()=>{
 const setup=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_post',present:['npc_hw_shendu'],coins:101});
 assert.deepEqual(setup.setupUnmet,[]);
 return setup.document;
};
const act=(action,slots,eventId)=>({tool:'world_act',args:{action,slots},eventId});
const deposit=act('core:trade.deposit',{seller:'npc_hw_shendu',coins:101},'prelude-deposit');
const withdraw=act('core:trade.withdraw',{seller:'npc_hw_shendu',coins:25},'prelude-withdraw');
const clean=(before,after)=>{
 assert.deepEqual(reconcile(engine,after),{mismatches:[],lots:[],drift:[],audit:[]});
 assert.deepEqual(conservation(engine,before,after),[]);
};
const pawnScene=(carriedBy='player')=>applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_post',present:['npc_hw_shendu'],coins:1,inventory:{item_staff:0},
 itemInstances:[{id:'prelude-pawn-staff',template:'thing',kind:'item',item:'item_staff',owner:'player',location:'bld_hw_post',carriedBy,condition:100}],
 holdings:[{id:'prelude-pawn-title',kind:'owns',holder:'player',subject:'prelude-pawn-staff',terms:{share:1}}]});
const pawn=act('core:trade.pawn',{seller:'npc_hw_shendu',item:'item_staff',quantity:1,coins:2,days:1},'prelude-pawn');

// 产品原则三.2：存款和部分支取必须真实扣钱、收取手续费并推进时间，
// 不用历史存款快照或另造债权。与玩家逐次 preview/reduce 的结果逐字段一致。
test('prelude: real deposit and withdrawal produce the same saved state as player actions',async()=>{
 const before=scene(),saved=structuredClone(before),steps=[deposit,withdraw];
 const loaded=await runPrelude(engine,before,steps);
 assert.deepEqual(loaded.unmet,[]);
 assert.deepEqual(before,saved);
 let document=before;
 for(const call of steps){
  assert.equal((await engine.previewAction(document,call)).receipt.status,'preview');
  const out=await engine.reduce(document,call);
  assert.equal(out.result.receipt.status,'committed');
  document=applyPatches(document,out.patches);
 }
 assert.deepEqual(loaded.document,document);
 assert.equal(document.state.player.coins,25);
 assert.equal(document.state.records.bank_hw_post.accounts.player,75);
 assert.equal(document.state.records.bank_hw_post.coins,(before.state.records.bank_hw_post?.coins??engine.rules.economy.credit.banks.find(b=>b.id==='bank_hw_post').reserveCopper)+76);
 assert.ok(document.state.minute>before.state.minute);
 const reopened=JSON.parse(JSON.stringify(document));
 assert.deepEqual(reopened,document);
 clean(before,document);
});

// 保留资金不足时无副作用、成功前序不丢失的保证；失败后不得继续后面的动作。
test('prelude: rejected withdrawal preserves the last successful action and stops the sequence',async()=>{
 const before=scene(),first=await runPrelude(engine,before,[deposit]);
 const failed=await runPrelude(engine,before,[deposit,act('core:trade.withdraw',{seller:'npc_hw_shendu',coins:101},'prelude-overdraw'),withdraw]);
 assert.equal(failed.unmet.length,1);
 assert.equal(failed.unmet[0].item,'prelude[1]');
 assert.match(failed.unmet[0].reason,/prelude step failed/);
 assert.deepEqual(failed.document,first.document);
 assert.equal(failed.document.state.player.coins,0);
 assert.equal(failed.document.state.records.bank_hw_post.accounts.player,100);
 clean(before,failed.document);
});

// 判分器必须在前置动作完成后才执行待判动作，不得仅识别 prelude 字段。
test('prelude: scorer executes a real-action premise before the scored action',async()=>{
 const run=await executeIntent(engine,initial,{id:'prelude-score-withdraw',setup:{minute:600,location:'bld_hw_post',present:['npc_hw_shendu'],coins:101,prelude:[deposit]},
  builder:{action:withdraw.args.action,slots:withdraw.args.slots}});
 assert.deepEqual(run.setupUnmet,[]);
 assert.equal(run.before.state.player.coins,0);
 assert.equal(run.before.state.records.bank_hw_post.accounts.player,100);
 assert.equal(run.actual.committed,true);
 assert.equal(run.document.state.player.coins,25);
 assert.equal(run.document.state.records.bank_hw_post.accounts.player,75);
 clean(run.before,run.document);
});

test('prelude: malformed or legacy tools cannot bypass the public action boundary',async()=>{
 for(const steps of [null,{},[{tool:'world_trade',args:{operation:'deposit',seller:'npc_hw_shendu',coins:101}}],[{...deposit,args:null}],[{...deposit,balance:100}],[{...deposit,eventId:''}]]){
  const before=scene(),out=await runPrelude(engine,before,steps);
  assert.equal(out.unmet.length,1);
  assert.deepEqual(out.document,before);
 }
});

// minute 是真实等待的简写；必须与玩家等待后查账一致，不能直接改钟漏结算。
test('prelude: minute advances through the real clock and refuses time travel',async()=>{
 const before=scene(),inspect=act('core:trade.bank_inspect',{seller:'npc_hw_shendu'},'timed-inspect');
 const timed=await runPrelude(engine,before,[{...inspect,minute:610}]);
 const ordinary=await runPrelude(engine,before,[act('core:time',{minutes:10},'timed-inspect:wait'),inspect]);
 assert.deepEqual(timed.unmet,[]);
 assert.deepEqual(ordinary.unmet,[]);
 assert.deepEqual(timed.document,ordinary.document);
 assert.equal(timed.document.state.minute,610);
 const past=await runPrelude(engine,before,[{...inspect,minute:599}]);
 assert.equal(past.unmet.length,1);
 assert.match(past.unmet[0].reason,/before the scene clock/);
 assert.deepEqual(past.document,before);
 clean(before,timed.document);
});

// 从 a3-owner-ding 的原物赎回用例迁移（产品原则三.2）。不导入旧质押、
// 债权或柜内木杖；先真实典当同一物件。原来的固定 2 铜是免息快照，
// 现按真实签约的本金和利息备款，仍严格检查全额清偿、原物和解押。
test('O: real pawn redemption returns the exact original, clears canonical and compatibility debt and closes its pledge',async()=>{
 const setup=pawnScene();
 assert.deepEqual(setup.setupUnmet,[]);
 const before=setup.document,unit=before.state.inventory.item_staff.instances[0];
 assert.ok(unit);
 const loaded=await runPrelude(engine,before,[pawn]);assert.deepEqual(loaded.unmet,[]);
 const document=JSON.parse(JSON.stringify(loaded.document)),debt='debt_loan_prelude-pawn',row=document.state.records[debt],pledge=row.pledgeRecord;
 assert.equal(document.state.inventory.item_staff?.quantity??0,0);
 assert.equal(row.principal,2);assert.equal(row.amount,row.principal+row.interest);assert.equal(row.amount,3);
 assert.equal(document.state.player.coins,row.amount);
 assert.equal(obligationView(document.state,debt).owed,row.amount);
 assert.deepEqual(document.state.records[pledge].instances,[unit]);
 assert.equal(document.state.records[pledge].status,'质押中');
 const input=act('core:trade.redeem',{seller:'npc_hw_shendu',contract:debt},'prelude-redeem');
 assert.equal((await engine.previewAction(document,input)).receipt.status,'preview');
 const redeemed=await engine.reduce(document,input);
 assert.equal(redeemed.result.receipt.status,'committed');
 assert.equal(redeemed.result.receipt.legacy.pledgeReturned,'item_staff');
 const after=applyPatches(document,redeemed.patches);
 assert.equal(after.state.minute,document.state.minute+5);
 assert.equal(after.state.player.coins,0);assert.equal(after.state.inventory.item_staff.quantity,1);
 assert.ok(after.state.inventory.item_staff.instances.includes(unit));
 assert.equal(after.state.itemInstances[unit].owner,'player');
 assert.equal(obligationView(after.state,debt).owed,0);
 assert.equal(after.state.records[debt].paid,row.amount);
 assert.equal(after.state.records[pledge].status,'已退还');
 assert.deepEqual(after.state.records[pledge].instances,[unit]);
 assert.equal(aliveHoldings(engine.primitiveDraft(after),{kind:'pledged',holder:debt}).length,0);
 clean(before,after);
});

// 从 a3-owner-ding 迁移，三项保护均保留：超额实付不能结算，不在行囊的
// 抵押物不能签约，真实流当后不能赎回。超付从伪造 paid 快照改为实际 repay。
test('O: mismatched collateral custody, expired redemption and invalid paid amount are rejected',async()=>{
 const setup=pawnScene();assert.deepEqual(setup.setupUnmet,[]);
 const loaded=await runPrelude(engine,setup.document,[pawn]);assert.deepEqual(loaded.unmet,[]);
 const document=loaded.document,debt='debt_loan_prelude-pawn',row=document.state.records[debt];
 const invalid=await runPrelude(engine,document,[act('core:trade.repay',{seller:'npc_hw_shendu',debt,coins:row.amount+1},'prelude-overpay')]);
 assert.equal(invalid.unmet.length,1);assert.match(invalid.unmet[0].reason,/还款金额必须在1到3之间/);
 assert.deepEqual(invalid.document,document);
 const wrong=pawnScene('npc_hw_shendu');assert.deepEqual(wrong.setupUnmet,[]);
 const rejected=await runPrelude(engine,wrong.document,[pawn]);
 assert.equal(rejected.unmet.length,1);assert.match(rejected.unmet[0].reason,/抵押物不在当事人的行囊中/);
 assert.deepEqual(rejected.document,wrong.document);
 const deadline=pawnDeadline(row,engine,document.state.minute,document.state);
 const expired=await runPrelude(engine,document,[{...act('core:trade.redeem',{seller:'npc_hw_shendu',contract:debt},'prelude-late-redeem'),minute:deadline}]);
 assert.equal(expired.unmet.length,1);assert.match(expired.unmet[0].reason,/流当/);
 assert.equal(expired.document.state.minute,deadline);
 assert.equal(expired.document.state.records[debt].status,'流当');
 assert.equal(expired.document.state.inventory.item_staff?.quantity??0,0);
 assert.equal(expired.document.state.player.coins,document.state.player.coins);
 clean(setup.document,expired.document);
});

// 从 a3-owner2-G 迁移：保持 600/2040/7800 的时间、10 铜欠额和非贷款断言，
// 用立约与真实等待产生逾期，不能把 history 或 obligation 快照当成已履约状态。
test('G4: overdue payment promise remains promise, retains dates, creates no loan or consent',async()=>{
 const setup=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_qingdeng',present:['npc_hw_linsui'],coins:0,inventory:{}});
 assert.deepEqual(setup.setupUnmet,[]);
 const loaded=await runPrelude(engine,setup.document,[act('core:promise.create',{promisor:'player',promisee:'npc_hw_linsui',type:'付款',content:'十铜付款承诺',coins:10,deadline:2040},'prelude-promise'),
  act('core:time',{minutes:7200},'prelude-promise-overdue')]);
 assert.deepEqual(loaded.unmet,[]);
 const document=JSON.parse(JSON.stringify(loaded.document)),view=obligationView(document.state,'obl_prelude-promise');
 assert.equal(document.state.minute,7800);
 assert.equal(view.row.kind,'promise');assert.equal(view.owed,10);assert.equal(view.amountDue,10);
 assert.equal(view.row.createdAt,600);assert.equal(view.row.deadline,2040);
 assert.equal(document.state.player.coins,0);
 assert.ok(!document.state.consentEvents?.some(e=>e.scope==='loan'));
 clean(setup.document,document);
 const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r12.json',import.meta.url),'utf8'));
 const bad=structuredClone(corpus.find(r=>r.id==='A3V2-144').setup);bad.obligations[0].amount=11;
 // 旧的矛盾来源/超付仍必须拒绝；新契约更强：任何这种快照都不得写入债权。
 for(const paid of [0,11]){
  bad.obligations[0].amount=paid?10:11;bad.obligations[0].paid=paid;
  const rejected=applyIntentSetup(engine,initial,bad);
  assert.ok(rejected.setupUnmet.some(e=>e.item==='obligations[0]'&&e.reason.includes('setup.prelude')));
  assert.equal(rejected.document.state.obligations.a3v2_144_old_promise,undefined);
 }
});

// 从 a3-owner2-T 迁移：同样检查已支付任务的查询、禁止二次领奖与零现钱。
// 真实任务用 rewardPaid 记实付金额；不再使用仅快照才有的 rewardSettled。
// 交付后把实得报酬真实存入钱庄，不能直接把现钱改回零。
test('T3: settled quest is inspectable, cannot pay again, and retains declared current cash',async()=>{
 const setup=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_post',present:['npc_hw_shendu'],coins:0,inventory:{item_bread:1}});
 assert.deepEqual(setup.setupUnmet,[]);
 const quest='quest_prelude-settled-quest',complete=act('core:quest.complete',{quest},'prelude-complete-quest');
 const loaded=await runPrelude(engine,setup.document,[act('core:quest.publish',{publisher:'npc_hw_shendu',personal:true,grade:'D',reward:20,deadline:2040,content:'交付一块面包',objective:{type:'deliver',item:'item_bread',quantity:1,location:'bld_hw_post'}},'prelude-settled-quest'),
  act('core:quest.accept',{quest},'prelude-accept-quest'),complete,act('core:trade.deposit',{seller:'npc_hw_shendu',coins:20},'prelude-bank-reward')]);
 assert.deepEqual(loaded.unmet,[]);
 const q=loaded.document.state.quests[quest];
 assert.equal(q.status,'已完成');assert.equal(q.rewardPaid,20);assert.equal(q.escrow,0);
 assert.equal(loaded.document.state.player.coins,0);
 const before=structuredClone(loaded.document),inspect=act('core:quest.inspect',{quest},'prelude-inspect-settled');
 assert.equal((await engine.previewAction(before,inspect)).receipt.status,'preview');
 const inspected=await engine.reduce(before,inspect);
 assert.equal(inspected.result.receipt.legacy.status,'已完成');
 const duplicate=await runPrelude(engine,before,[{...complete,eventId:'prelude-pay-again'}]);
 assert.equal(duplicate.unmet.length,1);assert.match(duplicate.unmet[0].reason,/任务不在可结算状态/);
 assert.deepEqual(duplicate.document,before);
 assert.deepEqual(loaded.document,before);
 clean(before,applyPatches(before,inspected.patches));
 clean(setup.document,loaded.document);
});
