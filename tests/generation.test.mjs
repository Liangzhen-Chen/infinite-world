import test from'node:test';
import assert from'node:assert/strict';
import {generationSettings,generationRequest,generationPreset}from'../extension/generation.mjs';
import {createPlaytestServer,runPlaytest}from'../tools/playtest-runner.mjs';
import {loadPromptBundle,presetFor}from'../tools/build-card.mjs';
import {reviewResponse} from './helpers/consistency-response.mjs';

test('预设与试玩默认4096且兼容1800，截断按实际配额失败且不重试',async t=>{
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/});t.after(()=>server.close());
    assert.equal(generationSettings().maxOutputTokens,4096);
    assert.equal(generationRequest().max_tokens,4096);assert.equal(generationPreset().openai_max_tokens,4096);
    for(const maxOutputTokens of [4096,1800]){
    const bundle=await loadPromptBundle({settings:{thinking:true,temperature:0.6,maxOutputTokens}}),preset=presetFor(bundle);let calls=0;
    assert.equal(preset.show_thoughts,true);assert.equal(preset.temp_openai,.6);assert.equal(preset.openai_max_tokens,maxOutputTokens);
    const result=await runPlaytest({scenario:{id:'truncated',turns:[{input:'（场外）看余额',assertions:[{kind:'equals',path:'state.player.coins',value:180}]}]},api:server.api,bundle,
        client:{async generate(body){calls++;assert.equal(body.thinking.type,'enabled');assert.equal(body.reasoning_effort,'low');assert.equal(body.max_tokens,maxOutputTokens);assert.equal(body.temperature,.6);
            return{choices:[{finish_reason:'length',message:{content:'还没说完',reasoning_content:'不应放入正文的推理'}}]};}}});
    assert.equal(calls,1);assert.equal(result.pass,false);assert.ok(result.turns[0].errors[0].includes(`${maxOutputTokens} token`));assert.equal(result.turns[0].reply,'');
    assert.equal(result.finalDocument.state.player.coins,180);
    }
    assert.throws(()=>generationSettings({maxOutputTokens:9000}),/范围/);
    assert.equal(generationRequest().thinking.type,'enabled');assert.equal(generationRequest({thinking:false}).thinking.type,'disabled');assert.equal(generationPreset().tool_reasoning_mode,'disabled');
});

test('多动作回合在默认配额返回完整长正文和回合尾，不混入思考',async t=>{
    // 修订记录 2026-10-23 第3条：原文须经逐句审查才可发布。
    // 用离线审查夹具验证完整长正文，仍逐字断言正文、尾注与思考隔离。
    const server=await createPlaytestServer({aiProfile:'T3'/*this scenario supplies a model client*/,consistencyClient:{async generate(body){return reviewResponse(body);}}});t.after(()=>server.close());
    // 同样700次、超过4000字；每10次一句，覆盖逐句审查240句上限内的长正文。
    const bundle=await loadPromptBundle(),text=('我在这里等着'.repeat(10)+'。').repeat(70);
    const reply=`${text}<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>`;
    let requests=0;
    const client={async generate(body){
        assert.equal(body.max_tokens,4096);assert.equal(body.thinking.type,'enabled');requests++;
        if(requests===1)return{choices:[{finish_reason:'tool_calls',message:{tool_calls:[
            {id:'move',type:'function',function:{name:'world_move',arguments:JSON.stringify({destination:'青灯酒馆'})}},
            {id:'wait',type:'function',function:{name:'world_time',arguments:JSON.stringify({minutes:30,activity:'等待'})}},
        ]}}]};
        const current=body.messages.slice(body.messages.findLastIndex(m=>m.role==='user'));
        assert.equal(current.filter(m=>m.role==='tool').length,2);
        return{choices:[{finish_reason:'stop',message:{content:reply,reasoning_content:'仅为模型思考'}}]};
    }};
    const result=await runPlaytest({scenario:{id:'long-multiple-actions',turns:[{input:'我走进青灯酒馆，在这里等半小时。',assertions:[
        {kind:'equals',path:'state.location',value:'bld_hw_qingdeng'},
        {kind:'calls',tool:'world_move',args:{},min:1},
        {kind:'calls',tool:'world_time',args:{minutes:30},min:1},
    ]}]},api:server.api,client,bundle});
    assert.equal(result.pass,true,JSON.stringify(result.turns[0].errors));assert.equal(requests,2);
    assert.equal(result.turns[0].reply,reply);assert.equal(result.turns[0].visible,text);
    assert.equal(result.turns[0].tail.valid,true);assert.equal(result.turns[0].finish,'stop');
});

test('对照种子由隔离服务器固定，请求正文不能改变生产随机源',async t=>{
    const fixed=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,seed:'paired-sessions'});t.after(()=>fixed.close());
    const a=await fixed.api('create',{character:{name:'甲'},randomSeed:'forged'}),b=await fixed.api('create',{character:{name:'乙'}});
    assert.equal(a.document.randomSeed,'paired-sessions');assert.equal(b.document.randomSeed,'paired-sessions');
    assert.notEqual(a.reference.campaignId,b.reference.campaignId);
    const normal=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,seed:'random'});t.after(()=>normal.close());
    const c=await normal.api('create',{randomSeed:'forged'}),d=await normal.api('create',{randomSeed:'forged'});
    assert.notEqual(c.document.randomSeed,'forged');assert.notEqual(c.document.randomSeed,d.document.randomSeed);
});
