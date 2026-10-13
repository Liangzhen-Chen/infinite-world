import test from'node:test';
import assert from'node:assert/strict';
import {toolDefinitions,resolveToolCall}from'../extension/tools.mjs';
import {createPlaytestServer}from'../tools/playtest-runner.mjs';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {toolSelectionMetrics}from'../tools/playtest-metrics.mjs';
import {evaluateAssertions}from'../tools/playtest-assertions.mjs';

test('委托三步操作与公共粮仓购买参数可直接用于公开工具',async()=>{
    const definitions=toolDefinitions().map(row=>row.function);
    const quest=definitions.find(row=>row.name==='world_quest'),field=definitions.find(row=>row.name==='world_field');
    assert.deepEqual(quest.parameters.properties.operation.enum,['publish','accept','complete']);
    assert.match(quest.parameters.properties.operation.description,/publish仅发布托管.*另调accept.*complete/);
    assert.match(quest.parameters.properties.quest.description,/回执.*world_read/);
    assert.match(field.description,/粮仓.*farm_buy/);
    assert.match(field.parameters.properties.operation.description,/farm_buy.*world_trade.*world_quest/);
    assert.equal(field.parameters.properties.item.type,'string');
    const args={operation:'farm_buy',settlement:'河湾村',item:'燕麦',quantity:10};
    assert.deepEqual(resolveToolCall('world_field',args),{tool:'world_farm',args:{...args,operation:'buy'}});
    const engine=new WorldEngine(await loadWorld());
    for(const name of ['燕麦','带壳燕麦','item_oats'])assert.equal(engine.resolve(name,'item'),'item_oats');
    assert.equal(engine.resolve('干粮','item'),'item_ration');
});

test('25个工具入口；合并操作保留真实执行、幂等与回滚，原工具仍可回放',async t=>{
    const tools=toolDefinitions();assert.equal(tools.length,25);assert.ok(tools.every(row=>row.function.description.length<=60));
    assert.ok(!tools.some(row=>['world_turn','world_pet','world_farm','world_crime'].includes(row.function.name)));
    assert.throws(()=>resolveToolCall('world_field',{operation:'make_gold'}),/未知操作/);
    const server=await createPlaytestServer();t.after(()=>server.close());
    const created=await server.api('create',{character:{name:'测试者'}}),campaignId=created.reference.campaignId;
    const engine=new WorldEngine(await loadWorld());
    for(const[tool,args,oldTool,oldArgs]of[
        ['world_field',{operation:'weather_inspect'},'world_weather',{operation:'inspect'}],
        ['world_field',{operation:'farm_inspect'},'world_farm',{operation:'inspect'}],
        ['world_field',{operation:'environment_inspect'},'world_environment',{operation:'inspect'}],
        ['world_field',{operation:'wildlife_observe'},'world_wildlife',{operation:'observe'}],
        ['world_field',{operation:'lair_observe'},'world_lair',{operation:'observe'}],
        ['world_companion',{operation:'pet_inspect'},'world_pet',{operation:'inspect'}],
        ['world_companion',{operation:'summon_inspect'},'world_summon',{operation:'inspect'}],
    ]){
        const fixture=structuredClone(created.document);
        if(['world_wildlife','world_lair'].includes(oldTool))fixture.state.location='loc_hw_northwood';
        if(oldTool==='world_lair'){
            const boss=engine.world.bosses[0];assert.ok(boss?.residence);
            fixture.state.location=boss.residence.location;args.lair=boss.residence.id;oldArgs.lair=boss.residence.id;
        }
        assert.deepEqual(await engine.reduce(fixture,{tool,args,eventId:'observe'}),await engine.reduce(fixture,{tool:oldTool,args:oldArgs,eventId:'observe'}));
    }
    await server.api('execute',{campaignId,tool:'world_move',args:{destination:'村口'},eventId:'move',anchor:'walk'});
    const before=await server.api('read',{campaignId});
    const request={campaignId,tool:'world_law',args:{operation:'steal',target:'顾岑',coins:1},eventId:'steal',anchor:'attempt'};
    const stolen=await server.api('execute',request),duplicate=await server.api('execute',request);
    assert.equal(stolen.result.ok,true);assert.equal(duplicate.duplicate,true);
    const undone=await server.api('reconcile',{campaignId,validAnchors:['walk']});
    assert.deepEqual(undone.document.state,before.document.state);
});

test('旧目录未启用首领时，新旧观察入口均拒绝且不改变存档',async t=>{
    const world=await loadWorld();world.bosses=[];delete world.rules.bossEcology;
    const engine=new WorldEngine(world),server=await createPlaytestServer();t.after(()=>server.close());
    const {document}=await server.api('create',{character:{name:'旧目录测试者'}});document.state.location='loc_hw_northwood';
    const before=structuredClone(document);
    await assert.rejects(engine.reduce(document,{tool:'world_field',args:{operation:'lair_observe'},eventId:'observe'}),/没有启用首领巢穴/);
    await assert.rejects(engine.reduce(document,{tool:'world_lair',args:{operation:'observe'},eventId:'observe'}),/没有启用首领巢穴/);
    assert.deepEqual(document,before);
});

test('调用统计区分错误职责、查询后漏执行、失败重试和未满足前置条件',()=>{
    const scenarios=[{id:'sample',turns:[{expectedTools:['world_crime']},{expectedTools:['world_learn']},{expectedTools:['world_move']},{expectedTools:['world_cast'],toolExpectationAfter:{turn:4,path:'state.spells.spell_light'}}]}];
    const metrics=toolSelectionMetrics([{id:'sample',turns:[
        {index:0,calls:[{tool:'world_law',args:{operation:'steal'}}],assertions:[]},
        {index:1,calls:[{tool:'world_practice',args:{}}],assertions:[]},
        {index:2,calls:[{tool:'world_catalog',args:{}}],assertions:[]},
        {index:3,calls:[],assertions:[]},
        {index:4,calls:[],assertions:[{kind:'exists',path:'state.spells.spell_light',value:true,actual:false,pass:false}]},
    ]}],scenarios);
    // 错用练习也漏掉本轮学习；只查询目录的移动回合是另一次漏执行。
    assert.equal(metrics.opportunities,3);assert.equal(metrics.wrong,1);assert.equal(metrics.missed,2);
    assert.equal(metrics.measurement,'measured');
    const unmeasured=toolSelectionMetrics([{id:'plain',turns:[{index:0,calls:[],assertions:[]}]}],[{id:'plain',turns:[{input:'只聊天'}]}]);
    assert.equal(unmeasured.measurement,'not-measured');assert.equal(unmeasured.wrongRatio,null);assert.equal(unmeasured.missedRatio,null);
    const grouped=toolSelectionMetrics([{id:'grouped',turns:[{index:0,calls:[{tool:'world_field',args:{operation:'wildlife_track'}}],assertions:[]}]}],[{id:'grouped',turns:[{expectedTools:['world_field']}]}]);
    assert.equal(grouped.wrong,0);assert.equal(grouped.missed,0);assert.equal(grouped.opportunities,1);
    const calls=[{tool:'world_craft',args:{operation:'manufacture'},result:{ok:false}},{tool:'world_craft',args:{operation:'manufacture'},result:{ok:true}}];
    const rule={kind:'calls',tool:'world_craft',args:{operation:'manufacture'},success:true,min:1,max:1};
    assert.equal(evaluateAssertions([rule],{before:{},after:{},calls,reply:''})[0].pass,true);
    calls.push(calls[1]);assert.equal(evaluateAssertions([rule],{before:{},after:{},calls,reply:''})[0].pass,false);
    const evidence={kind:'records',path:'records',where:{reported:true},includes:{path:'evidence',where:{kind:'confession'}}};
    assert.equal(evaluateAssertions([evidence],{before:{},after:{records:{case:{reported:true,evidence:[]}}},calls:[],reply:''})[0].pass,false);
});
