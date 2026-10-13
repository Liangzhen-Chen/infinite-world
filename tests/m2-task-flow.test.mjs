import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaytestServer}from'../tools/playtest-runner.mjs';

const publisher='npc_hw_linsui',settlement='loc_hw',item='item_oats';
const quantity=(bag,id=item)=>typeof bag[id]==='number'?bag[id]:bag[id]?.quantity??0;
const questArgs={operation:'publish',publisher:'林穗',personal:true,grade:'D',reward:20,
    content:'买十份燕麦送给林穗，买粮多出的费用由我承担',objective:{type:'deliver',item:'燕麦',quantity:10}};

function totals(document){
    const s=document.state;
    return{
        coins:s.player.coins+Object.values(s.npcs).reduce((n,row)=>n+row.coins,0)
            +Object.values(s.settlements).reduce((n,row)=>n+row.treasury,0)
            +Object.values(s.quests).reduce((n,row)=>n+row.escrow,0),
        grain:s.settlements[settlement].food+quantity(s.inventory)
            +Object.values(s.npcs).reduce((n,row)=>n+quantity(row.inventory),0),
    };
}

async function setup(t){
    const server=await createPlaytestServer({seed:'t62-task-flow'});t.after(()=>server.close());
    const created=await server.api('create',{character:{name:'送粮旅人'}}),campaignId=created.reference.campaignId;
    let counter=0;
    const read=async()=>(await server.api('read',{campaignId})).document;
    const run=(tool,args,eventId=`task_${counter++}`)=>server.api('execute',{campaignId,tool,args,eventId,anchor:eventId});
    const reject=async(tool,args,pattern)=>{
        const before=await read();
        await assert.rejects(run(tool,args),error=>error.httpStatus===400&&pattern.test(error.message));
        assert.deepEqual(await read(),before,'拒绝不得改动钱粮、托管或存档');
    };
    const move=async destination=>{
        await run('world_move',{destination});
        const state=(await read()).state;
        const location=destination==='青灯酒馆'?'bld_hw_qingdeng':'bld_hw_council';
        assert.equal(state.location,location);
        const npc=destination==='青灯酒馆'?publisher:'npc_hw_chenbai';
        assert.equal(state.npcs[npc].location,location);
        assert.ok(!['睡眠','死亡','濒死'].includes(state.npcs[npc].status));
    };
    await move('青灯酒馆');
    const opening=await read(),baseline=totals(opening);
    const assertBalanced=async()=>assert.deepEqual(totals(await read()),baseline);
    const publish=async()=>{
        const posted=await run('world_quest',questArgs);
        assert.equal(posted.result.ok,true);
        const quest=posted.result.quest,doc=await read(),row=doc.state.quests[quest];
        assert.equal(row.status,'公开');assert.equal(row.taker,null);assert.equal(row.escrow,20);
        assert.deepEqual(row.objective,{type:'deliver',item,quantity:10});
        assert.equal(doc.state.npcs[publisher].coins,opening.state.npcs[publisher].coins-20);
        assert.equal(doc.state.player.coins,opening.state.player.coins);
        await assertBalanced();return quest;
    };
    const accept=async quest=>{
        await run('world_quest',{operation:'accept',quest});
        const row=(await read()).state.quests[quest];
        assert.equal(row.status,'进行中');assert.equal(row.taker,'player');assert.equal(row.escrow,20);
        await assertBalanced();
    };
    const buy=async()=>{
        await move('村务屋');const before=await read();
        await run('world_field',{operation:'farm_buy',settlement:'河湾村',item:'燕麦',quantity:10});
        const after=await read();
        assert.equal(quantity(after.state.inventory),quantity(before.state.inventory)+10);
        assert.equal(after.state.player.coins,before.state.player.coins-30);
        assert.equal(after.state.settlements[settlement].treasury,before.state.settlements[settlement].treasury+30);
        assert.equal(after.state.settlements[settlement].food,before.state.settlements[settlement].food-10);
        const r=after.state.records[`agriculture:${settlement}`];
        assert.equal(r.batches.reduce((n,row)=>n+row.amount,0),after.state.settlements[settlement].food);
        await assertBalanced();
    };
    return{server,campaignId,run,read,reject,move,publish,accept,buy,assertBalanced,opening};
}

test('HTTP燕麦委托：发布、明确承接、柜台买粮、当面交付与托管报酬守恒',async t=>{
    const f=await setup(t),quest=await f.publish();await f.accept(quest);await f.buy();await f.move('青灯酒馆');
    const before=await f.read(),args={operation:'complete',quest};
    const completed=await f.run('world_quest',args,'deliver');
    assert.equal(completed.result.ok,true);assert.equal(completed.result.reward,20);
    const after=await f.read();
    assert.equal(quantity(after.state.inventory),quantity(before.state.inventory)-10);
    assert.equal(quantity(after.state.npcs[publisher].inventory),quantity(before.state.npcs[publisher].inventory)+10);
    assert.equal(after.state.player.coins,before.state.player.coins+20);
    assert.equal(after.state.player.coins,f.opening.state.player.coins-10);
    assert.equal(after.state.quests[quest].status,'已完成');assert.equal(after.state.quests[quest].escrow,0);
    await f.assertBalanced();
    const duplicate=await f.run('world_quest',args,'deliver');assert.equal(duplicate.duplicate,true);
    assert.deepEqual(await f.read(),after);
    await f.reject('world_quest',args,/可结算/);
});

test('HTTP委托尚未接受，即使备齐十份燕麦也不能交货领报酬',async t=>{
    const f=await setup(t),quest=await f.publish();await f.buy();await f.move('青灯酒馆');
    await f.reject('world_quest',{operation:'complete',quest},/可结算/);
    const row=(await f.read()).state.quests[quest];
    assert.equal(row.status,'公开');assert.equal(row.taker,null);assert.equal(row.escrow,20);
    await f.assertBalanced();
});

test('HTTP委托已接受但缺粮不能领取托管报酬',async t=>{
    const f=await setup(t),quest=await f.publish();await f.accept(quest);
    assert.equal(quantity((await f.read()).state.inventory),0);
    await f.reject('world_quest',{operation:'complete',quest},/物品不足/);
    assert.equal((await f.read()).state.quests[quest].escrow,20);await f.assertBalanced();
});

test('HTTP委托粮已备齐但委托人不在场不能交付，实际到场后可继续',async t=>{
    const f=await setup(t),quest=await f.publish();await f.accept(quest);await f.buy();
    const before=await f.read();
    assert.notEqual(before.state.location,before.state.npcs[publisher].location);
    await f.reject('world_quest',{operation:'complete',quest},/委托人不在场/);
    assert.equal(quantity((await f.read()).state.inventory),10);await f.assertBalanced();
    await f.move('青灯酒馆');await f.run('world_quest',{operation:'complete',quest});
    assert.equal((await f.read()).state.quests[quest].escrow,0);await f.assertBalanced();
});
