// I1 守恒（02 §I1）：每笔价值变化是账户到账户的转移；含源汇的全局总量在任意两时刻相等。
// 性质：真实游戏动作（交易、做工、存取、移动、推进时间）的随机序列后，逐资源 Σ账户 = Σ源 − Σ汇，
// 每一步 Δ旧字段总量 = 源净流入 − 汇流出；对偶流（供奉对）两端相等。事件数与种子写死，可复现。
// 反例：在测试内改坏一份文档（凭空加钱、改流量），审计必须抓住。
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {auditLedger,ledgerTotals,parseAccount,isSource,isSink} from '../../server-plugin/ledger.mjs';
import {reconcile,conservation} from '../helpers/ledger-audit.mjs';
import {openedCampaign,actionArb,stepAction,campaign} from '../helpers/invariant-campaign.mjs';

const SEED=1001,RUNS=5,STEPS=8;

// 逐资源汇总某一端流量（src:a 与 sink:b 的对偶：同一资源两端累计相等）。
const flowOf=(ledger,owner)=>{const out={};for(const [k,n] of Object.entries(ledger?.flows??{})){const a=parseAccount(k);if(a.owner===owner)out[a.resource]=(out[a.resource]??0)+n;}return out;};

test('I1 性质：随机合法动作序列后，逐资源账户总和 = 源 − 汇，且每一步旧字段总量变化 = 源净流入 − 汇流出',{timeout:1800000},async()=>{
    await fc.assert(fc.asyncProperty(fc.array(actionArb,{minLength:STEPS,maxLength:STEPS}),async actions=>{
        const c=await openedCampaign('i01');let accepted=0;
        for(const [i,action] of actions.entries()){
            const step=await stepAction(c,action,`i01-${i}`);if(!step)continue;accepted++;
            assert.deepEqual(auditLedger(step.after.ledger),[],`步 ${i}：账本不守恒`);
            assert.deepEqual(conservation(c.engine,step.before,step.after),[],`步 ${i}：Δ总量 ≠ 源 − 汇`);
        }
        const r=reconcile(c.engine,c.doc);
        assert.deepEqual(r.mismatches,[]);assert.deepEqual(r.audit,[]);
        for(const [resource,t] of Object.entries(ledgerTotals(c.doc.ledger)))assert.equal(t.accounts,t.sources-t.sinks,resource);
        assert.deepEqual(flowOf(c.doc.ledger,'sink:offering'),flowOf(c.doc.ledger,'src:offering_realm'),'供奉对两端逐资源相等');
        return accepted>=0;
    }),{seed:SEED,numRuns:RUNS});
});

test('I1 反例：凭空加钱、改动流量、改坏对偶流都被审计抓住（测试不是空转）',async()=>{
    const c=campaign('i01-neg');
    const step=await stepAction(c,{tool:'world_trade',args:{seller:'npc_hw_linsui',item:'item_bread',quantity:1}},'i01-neg-0');
    assert.ok(step,'前提：一笔真实买面包被接受');
    assert.deepEqual(auditLedger(step.after.ledger),[]);
    const account=Object.keys(step.after.ledger.accounts).find(k=>parseAccount(k).resource==='coin_river'&&step.after.ledger.accounts[k]>0);
    // 1. 一个账户凭空多 1 铜：账户总和 ≠ 源 − 汇。
    const minted=structuredClone(step.after);minted.ledger.accounts[account]+=1;
    assert.match(auditLedger(minted.ledger).join(';'),/不守恒/);
    // 1b. 旧字段多出 1 铜而账本没有对应的源流入：逐步守恒检查抓住。
    const printed=structuredClone(step.after);printed.state.player.coins+=1;
    assert.deepEqual(conservation(c.engine,step.before,step.after),[],'前提：真实一步守恒');
    assert.equal(conservation(c.engine,step.before,printed).length>0,true,'逐步守恒检查抓住凭空多出的铜');
    // 2. 汇流量被多记一笔而账户未减：不守恒。
    const sinkKey=Object.keys(step.after.ledger.flows).find(k=>isSink(parseAccount(k).owner));
    if(sinkKey){const leaked=structuredClone(step.after);leaked.ledger.flows[sinkKey]+=5;assert.match(auditLedger(leaked.ledger).join(';'),/不守恒/);}
    // 3. 供奉对只记一端：对偶比较抓住。
    const broken=structuredClone(step.after);broken.ledger.flows['sink:offering|coin_river|probe']=3;
    assert.notDeepEqual(flowOf(broken.ledger,'sink:offering'),flowOf(broken.ledger,'src:offering_realm'));
    assert.ok(Object.keys(step.after.ledger.flows).some(k=>isSource(parseAccount(k).owner)),'前提：真实账本里有源');
});
