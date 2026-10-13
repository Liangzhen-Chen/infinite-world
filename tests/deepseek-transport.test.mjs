import test from'node:test';
import assert from'node:assert/strict';
import {normalizeAssistantContent}from'../tools/deepseek-client.mjs';
import {readStateSection}from'../extension/state-read.mjs';
import {toolDefinitions}from'../extension/tools.mjs';

test('失败请求中的中文行囊与玩家查询产生完整工具正文，未知栏目和私有字段返回错误',()=>{
    const state={player:{name:'旅人',coins:180},inventory:{item_staff:{quantity:1}},privateState:{luck:99}};
    const queries=['行囊','玩家','不存在','privateState','法术书'];
    const wire=JSON.parse(JSON.stringify(queries.map((section,i)=>({role:'tool',tool_call_id:`call_${i}`,content:JSON.stringify(readStateSection(state,section))}))));
    for(const message of wire)assert.equal(typeof message.content,'string');
    assert.deepEqual(JSON.parse(wire[0].content),state.inventory);assert.deepEqual(JSON.parse(wire[1].content),{...state.player,id:'player'});
    assert.equal(JSON.parse(wire[2].content).ok,false);assert.equal(JSON.parse(wire[3].content).ok,false);
    assert.deepEqual(JSON.parse(wire[4].content),{});assert.ok(!JSON.stringify(wire).includes('99'));
});

test('大栏目返回完整JSON错误，不截断JSON；读取结果不改变状态',()=>{
    const state={npcs:{npc_example:{note:'字'.repeat(8100)}}},before=structuredClone(state);
    const result=readStateSection(state,'人物');assert.equal(result.ok,false);assert.match(result.error,/检索/);assert.deepEqual(state,before);
});
test('单人物库存查询绕过整栏体积，过滤私密认知且不改原状态',()=>{
    const privateFields={legalKnowledge:{secret:'legal'},memoryStream:[{content:'private'}],cognition:{known:['debt']},autonomy:{},goals:['private goal'],relationships:{},developments:[]};
    const row={name:'林穗',inventory:{item_bread:{quantity:6}},...privateFields};
    const state={npcs:{npc_hw_linsui:row,...Object.fromEntries(Array.from({length:151},(_,i)=>[`npc_${i}`,{note:'字'.repeat(100)}]))}};
    const before=structuredClone(state);
    assert.equal(readStateSection(state,'人物').ok,false);
    const result=readStateSection(state,'人物','npc_hw_linsui');
    assert.deepEqual(Object.keys(result),['npc_hw_linsui']);assert.equal(result.npc_hw_linsui.inventory.item_bread.quantity,6);
    for(const key of Object.keys(privateFields))assert.equal(Object.hasOwn(result.npc_hw_linsui,key),false);
    assert.deepEqual(state,before);
    const definition=toolDefinitions().find(t=>t.function.name==='world_read');
    assert.equal(definition.function.parameters.properties.npc.type,'string');
});
test('人物定位错误不会退回全栏，定位后仍执行8000字符上限',()=>{
    const state={npcs:{large:{note:'字'.repeat(8100)}}};
    for(const [section,npc]of [['人物','missing'],['人物','__proto__'],['人物',3],['人物',''],['玩家','large'],[undefined,'large']]){
        assert.equal(readStateSection(state,section,npc).ok,false);
    }
    const oversized=readStateSection(state,'npcs','large');assert.equal(oversized.ok,false);assert.match(oversized.error,/上限/);
    const wire=JSON.parse(JSON.stringify({role:'tool',tool_call_id:'large',content:JSON.stringify(oversized)}));assert.equal(JSON.parse(wire.content).ok,false);
});
test('DeepSeek工具轮次的缺失正文补显式null，工具编号和已有正文保留，输入不变',()=>{
    const messages=[{role:'user',content:'住一晚'},
        {role:'assistant',tool_calls:[{id:'call-rent',type:'function',function:{name:'world_trade',arguments:'{"service":"住宿"}'}}]},
        {role:'tool',tool_call_id:'call-rent',content:'{"cost":6}'},
        {role:'assistant',content:null,tool_calls:[]},{role:'assistant',content:'林穗收下铜钱。'}];
    const before=structuredClone(messages),normalized=normalizeAssistantContent(messages);
    const wire=JSON.parse(JSON.stringify(normalized));
    assert.equal(Object.hasOwn(wire[1],'content'),true);assert.equal(wire[1].content,null);
    assert.deepEqual(wire[1].tool_calls,messages[1].tool_calls);assert.equal(wire[2].tool_call_id,'call-rent');
    assert.equal(wire[3].content,null);assert.equal(wire[4].content,'林穗收下铜钱。');assert.deepEqual(messages,before);
});
