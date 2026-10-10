import test from'node:test';
import assert from'node:assert/strict';
import {generationSettings,generationRequest,generationPreset}from'../extension/generation.mjs';
import {createPlaytestServer,runPlaytest}from'../tools/playtest-runner.mjs';
import {loadPromptBundle,presetFor}from'../tools/build-card.mjs';

test('预设与试玩共用生成设置，思考对照不抬高输出上限，也不伪造推理上下文',async t=>{
    const server=await createPlaytestServer();t.after(()=>server.close());
    const bundle=await loadPromptBundle({settings:{thinking:true,temperature:0.6}}),preset=presetFor(bundle);
    assert.equal(preset.show_thoughts,true);assert.equal(preset.temp_openai,.6);assert.equal(preset.openai_max_tokens,1800);
    const result=await runPlaytest({scenario:{id:'truncated',turns:[{input:'（场外）看余额',assertions:[{kind:'equals',path:'state.player.coins',value:180}]}]},api:server.api,bundle,
        client:{async generate(body){assert.equal(body.thinking.type,'enabled');assert.equal(body.reasoning_effort,'low');assert.equal(body.max_tokens,1800);assert.equal(body.temperature,.6);
            return{choices:[{finish_reason:'length',message:{content:'还没说完',reasoning_content:'不应放入正文的推理'}}]};}}});
    assert.equal(result.pass,false);assert.match(result.turns[0].errors[0],/1800/);assert.equal(result.turns[0].reply,'');
    assert.equal(result.finalDocument.state.player.coins,180);
    assert.throws(()=>generationSettings({maxOutputTokens:9000}),/范围/);
    assert.equal(generationRequest().thinking.type,'enabled');assert.equal(generationRequest({thinking:false}).thinking.type,'disabled');assert.equal(generationPreset().tool_reasoning_mode,'disabled');
});

test('对照种子由隔离服务器固定，请求正文不能改变生产随机源',async t=>{
    const fixed=await createPlaytestServer({seed:'paired-sessions'});t.after(()=>fixed.close());
    const a=await fixed.api('create',{character:{name:'甲'},randomSeed:'forged'}),b=await fixed.api('create',{character:{name:'乙'}});
    assert.equal(a.document.randomSeed,'paired-sessions');assert.equal(b.document.randomSeed,'paired-sessions');
    assert.notEqual(a.reference.campaignId,b.reference.campaignId);
    const normal=await createPlaytestServer();t.after(()=>normal.close());
    const c=await normal.api('create',{randomSeed:'forged'}),d=await normal.api('create',{randomSeed:'forged'});
    assert.notEqual(c.document.randomSeed,'forged');assert.notEqual(c.document.randomSeed,d.document.randomSeed);
});
