import test from'node:test';
import assert from'node:assert/strict';
import {normalizeAssistantContent}from'../tools/deepseek-client.mjs';
import {readStateSection}from'../extension/state-read.mjs';

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
