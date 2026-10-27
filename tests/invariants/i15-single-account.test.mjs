// I15 单一账户（02 §I15）：一个实体同一资源同一用途只有一个账户；组织公库 ≠ 首领私囊。
// 性质：随机真实动作序列后，账本里 (1) 账户键全部是规范形式（解析再拼回相同，故同一 (实体,资源,用途) 只有一个键）；
// (2) 没有别名账户（BOSS 与其行动者实体不各开一户）；(3) 做公库的实体（treasury）不同时开私囊（purse）。
// 反例：测试内造出非规范键、别名账户、公库兼私囊的文档，检查必须抓住。
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {accountKey,parseAccount,isSource,isSink} from '../../server-plugin/ledger.mjs';
import {actorId} from '../../server-plugin/npc-state.mjs';
import {openedCampaign,actionArb,stepAction,campaign,world} from '../helpers/invariant-campaign.mjs';

const SEED=1015,RUNS=5,STEPS=8;

// 返回违例列表；空表示成立。
function singleAccountViolations(accounts){
    const out=[],seen=new Map(),owners={treasury:new Set(),purse:new Set()};
    for(const key of Object.keys(accounts??{})){
        let a;try{a=parseAccount(key);}catch{out.push(`账户键无效：${key}`);continue;}
        if(accountKey(a.owner,a.resource,a.purpose)!==key){out.push(`账户键不是规范形式：${key}`);continue;}
        if(isSource(a.owner)||isSink(a.owner))continue;
        const entity=actorId(world,a.owner),slot=`${entity}|${a.resource}|${a.purpose}`;
        if(entity!==a.owner)out.push(`别名账户：${key} → ${entity}`);
        if(seen.has(slot)&&seen.get(slot)!==key)out.push(`同一实体同资源同用途有两个账户：${seen.get(slot)} / ${key}`);
        seen.set(slot,key);
        if(a.resource==='coin_river'&&a.purpose in owners)owners[a.purpose].add(entity);
    }
    for(const id of owners.treasury)if(owners.purse.has(id))out.push(`公库与私囊同一实体：${id}`);
    return out;
}

test('I15 性质：随机合法动作序列后，账户键规范唯一，公库与私囊不混',{timeout:1800000},async()=>{
    await fc.assert(fc.asyncProperty(fc.array(actionArb,{minLength:STEPS,maxLength:STEPS}),async actions=>{
        const c=await openedCampaign('i15');
        for(const [i,action] of actions.entries()){
            const step=await stepAction(c,action,`i15-${i}`);if(!step)continue;
            assert.deepEqual(singleAccountViolations(step.after.ledger?.accounts),[],`步 ${i}`);
        }
        return true;
    }),{seed:SEED,numRuns:RUNS});
});

test('I15 反例：非规范键、别名账户、公库兼私囊都被抓住（测试不是空转）',async()=>{
    const c=campaign('i15-neg');
    const step=await stepAction(c,{tool:'world_trade',args:{seller:'npc_hw_linsui',item:'item_bread',quantity:1}},'i15-neg-0');
    assert.ok(step);const base=step.after.ledger.accounts;
    assert.deepEqual(singleAccountViolations(base),[],'前提：真实账本成立');
    assert.match(singleAccountViolations({...base,'npc_x|core:coin_river|purse':1}).join(';'),/不是规范形式/);
    const boss=world.bosses?.find(b=>b.actor&&b.actor!==b.id);
    if(boss)assert.match(singleAccountViolations({...base,[`${boss.id}|coin_river|purse`]:1}).join(';'),/别名账户/);
    const treasuryOwner=Object.keys(base).map(parseAccount).find(a=>a.resource==='coin_river'&&a.purpose==='treasury');
    assert.ok(treasuryOwner,'前提：真实账本里有公库');
    assert.match(singleAccountViolations({...base,[accountKey(treasuryOwner.owner,'coin_river','purse')]:1}).join(';'),/公库与私囊同一实体/);
});
