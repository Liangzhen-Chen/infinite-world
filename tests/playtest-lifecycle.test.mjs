import test from'node:test';
import assert from'node:assert/strict';
import {createPlaytestServer}from'../tools/playtest-runner.mjs';

async function campaign(t,mode,seed){
    const server=await createPlaytestServer({seed});t.after(()=>server.close());
    const initial=await server.api('create',mode==='new'?{character:{name:'试玩者'}}:{}),campaignId=initial.reference.campaignId;
    let sequence=0;
    return{initial,api:server.api,campaignId,read:async()=>(await server.api('read',{campaignId})).document,
        act:async(tool,args,anchor='actions')=>(await server.api('execute',{campaignId,tool,args,eventId:`flow_${sequence++}`,anchor})).result};
}

test('魔力边界会话前置可达：十次真实施法、超额拒绝、休息恢复及再次施法',async t=>{
    const c=await campaign(t,'legacy','mana-lifecycle');
    for(let i=0;i<10;i++)await c.act('world_cast',{spell:'照明术',target:'旧木杖'});
    const exhausted=await c.read();assert.equal(exhausted.state.player.mp,0);
    await assert.rejects(c.act('world_cast',{spell:'照明术',target:'旧木杖'}),/魔力不足/);
    assert.deepEqual((await c.read()).state,exhausted.state);
    await c.act('world_time',{minutes:30,activity:'休息'});assert.equal((await c.read()).state.player.mp,1);
    await c.act('world_cast',{spell:'照明术',target:'旧木杖'});assert.equal((await c.read()).state.player.mp,0);
    assert.equal((await c.read()).state.player.coins,180);
});

test('零级实战与死亡会话前置可达：实际追踪、濒死、死亡、出生点复活和撤销',async t=>{
    const c=await campaign(t,'new','lifecycle-r1');
    await c.act('world_move',{destination:'北林边'},'prepare');
    await c.act('world_time',{until:{dayOffset:0,hour:20},activity:'等待'},'prepare');
    let found;
    for(let i=0;i<3&&!found;i++)found=(await c.act('world_field',{operation:'wildlife_track',species:'路鬃野猪'},'prepare')).found;
    assert.ok(found,'三次真实追踪需能准备指定会话');
    const ready=await c.read();assert.equal(ready.state.player.level,0);assert.equal(ready.state.player.xp,50);
    for(let i=0;i<12&&(await c.read()).state.player.status==='正常';i++)await c.act('world_combat',{target:found.id});
    let down=await c.read();assert.equal(down.state.player.hp,0);
    if(down.state.player.status==='濒死')await c.act('world_time',{minutes:10,activity:'等待'});
    down=await c.read();assert.equal(down.state.player.status,'死亡');assert.equal(down.state.player.xp,50);
    await c.act('world_time',{minutes:1,activity:'等待'});
    const awake=await c.read();assert.equal(awake.state.location,'bld_hw_altar');
    assert.equal(awake.state.player.hp,4);assert.equal(awake.state.player.mp,4);assert.equal(awake.state.player.level,0);
    assert.equal(awake.state.player.coins,ready.state.player.coins);assert.deepEqual(awake.state.inventory,ready.state.inventory);
    const feedback=await c.api('feedback',{campaignId:c.campaignId});
    assert.ok(feedback.events.flatMap(row=>row.notices).some(row=>row.type==='status'&&row.text.includes('死亡')));
    const undone=await c.api('reconcile',{campaignId:c.campaignId,validAnchors:['prepare']});
    assert.deepEqual(undone.document.state,ready.state);
});
