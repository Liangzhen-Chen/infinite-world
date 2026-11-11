import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {modelToolCall} from '../extension/tools.mjs';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';

const world=await loadWorld();
const legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const quantity=value=>typeof value==='number'?value:value?.quantity??0;

async function session(t,id){
    const scenario=JSON.parse(await fs.readFile(new URL(`./playtests/${id}.json`,import.meta.url),'utf8'));
    const engine=new WorldEngine(world);
    let document=engine.createCharacter(legacy,{},`playtest-s5-${id}`),sequence=0;
    const trace=[];
    async function call(tool,args){
        const routed=modelToolCall(tool,args);
        const output=await engine.reduce(document,{...routed,eventId:`${id}_offline_${sequence++}`});
        document=applyPatches(document,output.patches);
        return{...routed,result:output.result};
    }
    async function turn(index,act=async()=>[],extraMinutes=0){
        const before=document,calls=await act();
        if(scenario.turns[index].expectedTools)
            assert.deepEqual(calls.map(row=>row.tool),scenario.turns[index].expectedTools,`${id} 第${index}回合工具`);
        await call('world_turn',{startMinute:before.state.minute,extraMinutes,
            outOfCharacter:scenario.turns[index].input.startsWith('（场外）')});
        const checked=evaluateAssertions(scenario.turns[index].assertions,{before,after:document,calls,reply:''});
        trace.push({turn:index,minute:document.state.minute,location:document.state.location,
            coins:document.state.player.coins,hinges:quantity(document.state.inventory.item_iron_hinge),
            bread:quantity(document.state.inventory.item_bread)});
        assert.ok(checked.every(row=>row.pass),JSON.stringify({id,index,failed:checked.filter(row=>!row.pass),trace:trace.at(-1)}));
        return{before,after:document,calls,checked};
    }
    t.after(()=>t.diagnostic(JSON.stringify({scope:'离线场景复放；无模型叙述',id,trace})));
    return{scenario,call,turn,get document(){return document;}};
}

test('trade.json：按真实进店、购买、拒绝缺货与漫天要价、卖回结算全回合复放',async t=>{
    const s=await session(t,'trade');
    await s.turn(0,async()=>[await s.call('world_move',{destination:'铁匠铺'})]);
    // 两次询价仅属对话，当前工具没有独立报价动作；不假造交易，也不扣账。
    await s.turn(1);
    await s.turn(2);
    const bought=await s.turn(3,async()=>[await s.call('world_trade',{seller:'段岩',item:'铁铰链',quantity:2})]);
    // 手算锚点：本地市场两件报价合计43铜，180-43=137；卖回一件实收13铜，137+13=150，库存从2回到1。
    assert.equal(bought.calls[0].result.cost,43);
    await s.turn(4,async()=>{
        const before=structuredClone(s.document);
        await assert.rejects(s.call('world_trade',{seller:'段岩',item:'铁铰链',quantity:1}),/库存|现货/);
        assert.deepEqual(s.document,before);
        return[];
    });
    const sold=await s.turn(5,async()=>[await s.call('world_trade',{seller:'玩家',buyer:'段岩',item:'铁铰链',quantity:1})]);
    assert.equal(sold.calls[0].result.cost,13);
    await s.turn(6,async()=>{
        const before=structuredClone(s.document);
        await assert.rejects(s.call('world_trade',{seller:'玩家',buyer:'段岩',item:'铁铰链',quantity:1,unitPrice:10000}),/单价|余额|报价|限价/);
        assert.deepEqual(s.document,before);
        return[];
    });
    await s.turn(7);
    assert.equal(quantity(s.document.state.inventory.item_iron_hinge),1);
});

test('credit.json：赊宿、到期、还债及次日续住逐回合复放',async t=>{
    const s=await session(t,'credit');
    await s.turn(0,async()=>[await s.call('world_move',{destination:'青灯酒馆'})]);
    const rent=await s.turn(1,async()=>[await s.call('world_trade',{seller:'林穗',service:'住宿',days:1,
        payment:'credit',creditMinutes:60})]);
    const debt=rent.calls[0].result.debt;
    const debtAmount=rent.after.state.records[debt].amount;
    await s.turn(2,async()=>{
        const before=structuredClone(s.document);
        await assert.rejects(s.call('world_trade',{seller:'林穗',item:'面包',quantity:1,payment:'credit',creditMinutes:60}),/欠款.*不得超过|逾期|信任|赊账/);
        assert.deepEqual(s.document,before);
        return[];
    });
    await s.turn(3,async()=>[await s.call('world_time',{minutes:60,activity:'等待'})]);
    await s.turn(4);
    await s.turn(5,async()=>[await s.call('world_trade',{payment:'repay',seller:'林穗',debt})]);
    await s.turn(6,async()=>[await s.call('world_time',{until:{dayOffset:1,hour:10},activity:'睡眠'})]);
    const renewed=await s.turn(7,async()=>[await s.call('world_trade',{seller:'林穗',service:'住宿',days:1})]);
    await s.turn(8);
    // 手算锚点：开局180铜；赊宿不扣款；还清6铜，再按当日派生价续住扣6铜，余额180-6-6=168。
    assert.equal(s.document.state.player.coins,180-debtAmount-renewed.calls[0].result.cost);
    assert.equal(debtAmount,6);
    assert.equal(renewed.calls[0].result.cost,6);
});
