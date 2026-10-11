import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {modelToolCall} from '../extension/tools.mjs';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';

const world=await loadWorld();
const legacy=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const scenario=async id=>JSON.parse(await fs.readFile(new URL(`playtests/${id}.json`,import.meta.url),'utf8'));
const qty=value=>typeof value==='number'?value:value?.quantity??0;
const present=(...npcs)=>({kind:'present',npcs});

// No model or hand-edited state: each action uses the public tool routing and
// applies only real engine patches to a new campaign with formal schedules.
async function session(t,id){
    const engine=new WorldEngine(world),script=await scenario(id);
    let document=engine.createCharacter(legacy,{},'m2-preconditions'),sequence=0;
    const trace=[],tracked={npc_home_visit:['miaozhen'],npc_shove:['linsui','gucen','chenbai'],
        npc_quest_social:['linsui','chenbai','wushuo'],npc_voices:['linsui','hezhou','shijin'],npc_offscreen:['ayan']}[id];
    const snapshot=()=>({minute:document.state.minute,location:document.state.location,
        player:{coins:document.state.player.coins,hp:document.state.player.hp,status:document.state.player.status,
            oats:qty(document.state.inventory.item_oats),rations:qty(document.state.inventory.item_ration)},
        npcs:Object.fromEntries(tracked.map(name=>{
            const npc=document.state.npcs[`npc_hw_${name}`];
            return[name,{location:npc.location,activity:npc.activity,coins:npc.coins,wood:qty(npc.inventory.item_wood)}];
        }))});
    async function call(tool,args){
        const routed=modelToolCall(tool,args),eventId=`${id}_offline_${sequence++}`;
        const output=await engine.reduce(document,{...routed,eventId});
        document=applyPatches(document,output.patches);
        return{...routed,result:output.result};
    }
    async function turn(index,act=async()=>[],extraMinutes=0){
        const before=document,calls=await act();
        await call('world_turn',{startMinute:before.state.minute,extraMinutes,outOfCharacter:script.turns[index].input.startsWith('（场外）')});
        const checked=evaluateAssertions(script.turns[index].assertions,{before,after:document,calls,reply:''});
        trace.push({turn:index,...snapshot()});
        assert.ok(checked.every(row=>row.pass),JSON.stringify({id,index,failed:checked.filter(row=>!row.pass),snapshot:snapshot()}));
        return{before,after:document,calls,checked};
    }
    t.after(()=>t.diagnostic(JSON.stringify({scope:'离线前置，未运行模型或N项叙述审核',id,trace})));
    return{engine,script,call,turn,get document(){return document;}};
}

test('私宅许可路线可达；从观察结束起完整等60分钟，旧许可过期拒绝且不扣钱物',async t=>{
    const s=await session(t,'npc_home_visit');
    await s.turn(0,async()=>[await s.call('world_move',{destination:'南田'}),await s.call('world_time',{minutes:30,activity:'等待'})]);
    await s.turn(1,undefined,5);
    let authorization;
    await s.turn(2,async()=>{const c=await s.call('world_promise',{operation:'grant_access',promisor:'苗贞',location:'筛种院',minutes:60,content:'本人独自只看旧筛架，不取物'});authorization=c.result.authorization;return[c];},5);
    await s.turn(3,async()=>[await s.call('world_move',{destination:'筛种院',authorization})],5);
    await s.turn(4,undefined,5);
    const waited=await s.turn(5,async()=>[await s.call('world_time',{minutes:60,activity:'等待'})]);
    assert.equal(waited.after.state.minute-waited.before.state.minute,60);
    // Reproduce the original model error without accepting its smaller elapsed time.
    for(const elapsed of [13,36]){
        const wrongAfter={state:{minute:waited.before.state.minute+elapsed}};
        assert.equal(evaluateAssertions(s.script.turns[5].assertions.filter(r=>r.kind==='elapsed'),{before:waited.before,after:wrongAfter,calls:[],reply:''})[0].pass,false);
    }
    await s.turn(6,async()=>[await s.call('world_move',{destination:'河湾村'})]);
    await s.turn(7,async()=>{
        const before=structuredClone(s.document);
        await assert.rejects(s.call('world_move',{destination:'筛种院',authorization}),/有效许可/);
        assert.deepEqual(s.document,before);return[];
    });
    await s.turn(8);
});

test('推搡按真实骰点留伤情；先等实际恢复行动能力，再沿在场乡巡及审判链处理',async t=>{
    const s=await session(t,'npc_shove');
    await s.turn(0,async()=>[await s.call('world_move',{destination:'青灯酒馆'})],5);
    let caseId;
    const hit=await s.turn(1,async()=>{const c=await s.call('world_combat',{target:'林穗',intent:'shove'});caseId=c.result.case;return[c];});
    assert.equal(hit.after.state.player.hp,Math.max(0,hit.before.state.player.hp-hit.calls[0].result.received));
    assert.ok(hit.after.state.records[caseId].evidence.some(e=>e.kind==='eyewitness'));
    await s.turn(2,undefined,5);
    if(s.document.state.player.status==='濒死'){
        const before=structuredClone(s.document);
        await assert.rejects(s.call('world_move',{destination:'村口'}),/濒死/);
        assert.deepEqual(s.document,before);
    }
    await s.turn(3,async()=>{
        const calls=[await s.call('world_time',{minutes:10,activity:'休息'})];
        if(s.document.state.player.status==='死亡')calls.push(await s.call('world_time',{minutes:1,activity:'等待'}));
        return calls;
    });
    await s.turn(4,async()=>[await s.call('world_move',{destination:'村口'})]);
    const wrongPlace=structuredClone(s.document);
    await assert.rejects(s.call('world_law',{operation:'hear',case:caseId,authority:'陈柏'}),/在场/);
    assert.deepEqual(s.document,wrongPlace);
    await s.turn(5,async()=>[await s.call('world_law',{operation:'confess',case:caseId,authority:'顾岑'})]);
    await s.turn(6,async()=>[await s.call('world_law',{operation:'arrest',case:caseId,authority:'顾岑'})]);
    await s.turn(7,async()=>[await s.call('world_law',{operation:'hear',case:caseId,authority:'陈柏'})]);
    await s.turn(8);
    assert.equal(s.document.state.records[caseId].finePaid??0,0);
});

test('燕麦从在场粮仓柜台购买，准确入袋及两端钱粮对账后才能交委托',async t=>{
    const s=await session(t,'npc_quest_social');
    await s.turn(0,async()=>[await s.call('world_move',{destination:'青灯酒馆'})],5);
    let quest;
    await s.turn(1,async()=>{const c=await s.call('world_quest',{operation:'publish',publisher:'林穗',personal:true,grade:'D',reward:20,content:'送十份带壳燕麦，买粮额外费用由我承担',objective:{type:'deliver',item:'带壳燕麦',quantity:10}});quest=c.result.quest;return[c];},5);
    await s.turn(2,async()=>[await s.call('world_quest',{operation:'accept',quest})],5);
    const missingGoods=structuredClone(s.document);
    await assert.rejects(s.call('world_quest',{operation:'complete',quest}),/物品不足/);
    assert.deepEqual(s.document,missingGoods);
    await s.turn(3,async()=>[await s.call('world_move',{destination:'北林边'})],5);
    await s.turn(4,async()=>[await s.call('world_move',{destination:'村务屋'})]);
    const exactBefore=structuredClone(s.document);
    await assert.rejects(s.call('world_farm',{operation:'buy',settlement:'河湾村',quantity:10,item:'面包'}),/不能替换指定物品/);
    assert.deepEqual(s.document,exactBefore);
    const bought=await s.turn(5,async()=>[await s.call('world_farm',{operation:'buy',settlement:'河湾村',quantity:10,item:'带壳燕麦'})]);
    assert.equal(bought.after.state.player.coins,150);
    await s.turn(6,async()=>[await s.call('world_move',{destination:'青灯酒馆'})],5);
    const beforeDelivery=s.document;
    await s.turn(7,async()=>[await s.call('world_quest',{operation:'complete',quest})],5);
    assert.equal(qty(s.document.state.npcs.npc_hw_linsui.inventory.item_oats)-qty(beforeDelivery.state.npcs.npc_hw_linsui.inventory.item_oats),10);
    await s.turn(8,undefined,5);
    await s.turn(9,undefined,5);
    await s.turn(10);
    assert.equal(s.document.state.player.coins,170);
});

test('N12依正式日程等到18:30；原三位在实际交谈窗口均在场清醒',async t=>{
    const s=await session(t,'npc_voices');
    await s.turn(0,async()=>[await s.call('world_move',{destination:'青灯酒馆'})]);
    await s.turn(1,async()=>[await s.call('world_time',{until:{dayOffset:0,hour:18,minute:30},activity:'等待'})]);
    for(const [index,minutes] of [[2,10],[3,10],[4,10],[5,10],[6,15],[7,10]])await s.turn(index,undefined,minutes);
    await s.turn(8);
    const before=s.document;
    await s.call('world_time',{until:{dayOffset:0,hour:20},activity:'等待'});
    assert.equal(evaluateAssertions([present('npc_hw_hezhou')],{before,after:s.document,calls:[],reply:''})[0].pass,false,'同地睡眠不能当作可交谈');
    for(const change of [{location:'loc_hw_fields'},{scheduleTravel:{to:'bld_hw_qingdeng'}},{cognitionTravel:{to:'bld_hw_qingdeng'}},{status:'濒死'}]){
        const after=structuredClone(before);Object.assign(after.state.npcs.npc_hw_shijin,change);
        assert.equal(evaluateAssertions([present('npc_hw_shijin')],{before,after,calls:[],reply:''})[0].pass,false);
    }
});

test('N17只取白石镇十天等待窗口内新增已结算行动，真实料费及回访在场可查',async t=>{
    const s=await session(t,'npc_offscreen');
    await s.turn(0,async()=>[await s.call('world_move',{destination:'旧磨坊'})],5);
    await s.turn(1,undefined,5);
    await s.turn(2,async()=>[await s.call('world_move',{destination:'白石镇'})]);
    const absent=await s.turn(3,async()=>[await s.call('world_time',{minutes:14400,activity:'等待'})]);
    const evidence=absent.checked.find(row=>row.kind==='newRecordsDuringTurn').actual;
    assert.equal(evidence.to-evidence.from,14400);
    assert.ok(evidence.records.every(row=>row.minute>evidence.from&&row.minute<=evidence.to&&row.start>=evidence.from&&typeof row.outcome.success==='boolean'));
    assert.ok(evidence.records.some(row=>!row.outcome.success),'失败制作同样保留，未强制成功骰点');
    const fees=evidence.records.reduce((n,row)=>n+row.spent.fee,0),wood=evidence.records.reduce((n,row)=>n+row.spent.materials.filter(m=>m.item==='item_wood').reduce((sum,m)=>sum+m.amount,0),0);
    assert.equal(absent.before.state.npcs.npc_hw_ayan.coins-absent.after.state.npcs.npc_hw_ayan.coins,fees);
    assert.equal(qty(absent.before.state.npcs.npc_hw_ayan.inventory.item_wood)-qty(absent.after.state.npcs.npc_hw_ayan.inventory.item_wood),wood);
    t.diagnostic(JSON.stringify({window:evidence,settled:{fees,wood}}));
    await s.turn(4,async()=>[await s.call('world_move',{destination:'河湾村'})]);
    await s.turn(5,async()=>[await s.call('world_move',{destination:'旧磨坊'})]);
    await s.turn(6,async()=>[await s.call('world_time',{until:{dayOffset:1,hour:8},activity:'等待'})],15);
    await s.turn(7,undefined,5);
    // An old action cannot be counted again by a later return conversation.
    const settledRule=s.script.turns[3].assertions.find(r=>r.kind==='newRecordsDuringTurn');
    assert.equal(evaluateAssertions([settledRule],{before:absent.after,after:absent.after,calls:[],reply:''})[0].pass,false);
    for(const invalid of [{spent:undefined},{outcome:undefined},{start:-1},{spent:{minutes:1,fee:2,materials:[]}}]){
        const action={...evidence.records[0],...invalid};
        const after={state:{minute:evidence.to,npcAutonomy:{actions:{invalid:action}}}};
        assert.equal(evaluateAssertions([settledRule],{before:absent.before,after,calls:[],reply:''})[0].pass,false,'未结算或时间无效的行动不能代替窗口经历');
    }
});
