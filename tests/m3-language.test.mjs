import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPlaytestServer,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {reviewPlaytest} from '../tools/playtest-review.mjs';
import {languageChecks,summarizeLanguageAcceptance} from '../tools/playtest-language.mjs';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';
import {consistencyReviewRequest} from '../server-plugin/consistency-review.mjs';

const scenario=JSON.parse(await fs.readFile(new URL('./playtests/m3_language.json',import.meta.url),'utf8'));
const ids=Array.from({length:7},(_,i)=>`V${i+1}`);
const scores={truth:100,agency:100,language:100,continuity:100,V2:100,V3:100,V4:100,V5:100,V7:100};
const response=value=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});

// This client supplies no provider measurement or real narrative score. It
// tests the official HTTP paths and assertions, including actual learning.
async function offlineRun(t){
    const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());
    const client={async generate({messages},label){
        const index=Number(label.split('-')[2]),step=scenario.turns[index];
        const last=messages.findLastIndex(m=>m.role==='user'),receipts=messages.slice(last+1).filter(m=>m.role==='tool');
        let call;
        if(!receipts.length){
            if(index===0||index===14)call={tool:'world_move',args:{destination:index===0?'青灯酒馆':'旧磨坊'}};
            // 修订记录 2026-10-23 第3条：关闭审查时只发布来源模板，
            // 交谈的5分钟须有实际工具回执，不能靠未审原文的尾注加时。
            else if([2,4].includes(index))call={tool:'world_time',args:{minutes:5,activity:'等待'}};
            else call=step.assertions.find(a=>a.kind==='calls');
        }
        if(call)return {choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:label,type:'function',function:{name:call.tool,arguments:JSON.stringify(call.args)}}]}}]};
        let content='你停在原处。';
        if(index===4)content='<q who="npc_hw_linsui">先把吃住照顾好。</q>';
        if(index===1)content='<q who="npc_hw_linsui">面包两铜一个。</q>';
        if(index===6)content='你休息了六小时，合计360分钟。';
        if(index===8)content='现在21:00。';
        if(index===9)content='你休息了两小时，合计120分钟。';
        if(index===10)content='刚才两小时，现在23:00。';
        if(index===11||index===12)content='整整三十天，合计43200分钟。';
        if(index===15)content='这次学习的结果已记录，费用四铜，没有制作成品。';
        if(index===16)content='本轮没有制作，行囊里没有木楔成品。';
        if(index===17)content='那些是示例，本局没有住宿、买面包或找回账簿的经历。';
        if(!step.input.startsWith('（场外）')){
            // Timed interaction has already been settled by the tool above.
            const view=await server.api('read',{campaignId}),extra=0;
            content+=`<回合 额外="${extra}分" 地点="${view.document.state.location}" 在场=""/>`;
        }
        return {choices:[{finish_reason:'stop',message:{content}}]};
    }};
    const initial=await server.api('create',{character:{name:'试玩者'}}),campaignId=initial.reference.campaignId;
    const result=await runPlaytest({scenario,api:server.api,client,bundle:await loadPromptBundle(),session:{campaignId},countTokens:()=>100});
    return {server,result,campaignId};
}

test('18轮完整提示与真实HTTP：时间换算、整月等待、问价不买、配方学习不造物及场外零计时',async t=>{
    assert.equal(scenario.turns.length,18);assert.deepEqual(scenario.requirements,ids);
    const {server,result,campaignId}=await offlineRun(t);
    // 同一修订：纯查询/观察没有正式裁决，必须停在模板；保留全部原账本断言。
    assert.equal(result.ledgerPass,true,JSON.stringify(result.turns.filter(turn=>turn.errors.length||turn.assertions.some(a=>!a.pass))));
    assert.equal(result.pass,false);assert.equal(result.consistency.rejected,2);
    assert.deepEqual(result.turns.filter(turn=>!turn.consistency.canCommit).map(turn=>turn.index),[1,3]);
    for(const turn of result.turns){
        assert.deepEqual(turn.errors,[]);
        if([1,3].includes(turn.index)){
            assert.equal(turn.consistency.status,'pending');assert.equal(turn.reply,turn.consistency.safeText);
            assert.notEqual(turn.reply,turn.originalReply);
        }
    }
    assert.equal(result.turns[7].minute,1260);assert.equal(result.turns[9].minute,1380);
    assert.equal(result.turns[11].minute-result.turns[10].minute,43200);
    assert.equal(result.turns[15].minute-result.turns[14].minute,30);
    assert.equal(result.turns[15].player.coins,176);
    assert.equal(result.finalDocument.state.inventory.item_wooden_peg,undefined);
    const exported=await server.api('export',{campaignId});
    assert.equal(exported.events.filter(e=>e.input?.tool==='world_learn').length,1);
    assert.equal(exported.events.filter(e=>['world_craft','world_trade'].includes(e.input?.tool)).length,0);
    for(const turn of result.turns.filter(t=>t.input.startsWith('（场外）')))assert.ok(turn.assertions.some(a=>a.kind==='outOfCharacter'&&a.pass));
    const report=summarizeLanguageAcceptance([result],[scenario]);
    assert.equal(report.ledgerPass,true);assert.equal(report.realModelMeasured,false);assert.equal(report.thresholdReached,false);
    assert.equal(report.rows.find(r=>r.id==='V2').measured,false);
    const clockInput={draft:'现在23点。',playerText:'（场外）现在几点？',before:result.finalDocument,after:result.finalDocument,allowedEntities:[],clock:{minute:1260,startMinute:1260}};
    const request=consistencyReviewRequest(clockInput),evidence=JSON.parse(request.messages[1].content).evidence;
    assert.equal(JSON.parse(evidence.find(e=>e.id==='clock').text).currentTime,'21:00');
});

test('实际时刻与库存断言拒绝23点冒充21点、十天冒充三十天和学习虚构成品',()=>{
    const rule=scenario.turns[8].assertions.find(a=>a.kind==='replyMatches');
    for(const reply of ['现在21:00。','现在二十一点。','现在晚上九点。'])assert.equal(evaluateAssertions([rule],{reply})[0].pass,true);
    assert.equal(evaluateAssertions([rule],{reply:'现在23点。'})[0].pass,false);
    const before={state:{minute:1380,inventory:{},player:{coins:180}}},after=structuredClone(before);after.state.minute+=14400;
    assert.equal(evaluateAssertions([{kind:'elapsed',min:43200,max:43200}],{before,after,calls:[],reply:''})[0].pass,false);
    after.state.inventory.item_wooden_peg={quantity:4};
    assert.equal(evaluateAssertions([{kind:'quantity',path:'state.inventory.item_wooden_peg',value:0}],{before,after,calls:[],reply:''})[0].pass,false);
});

test('逐项V评分沿用原引文校验与一次格式修正，通用语言高分不能补缺V或改低分',async()=>{
    const turns=[{index:0,input:'我还没决定。',visible:'你付清了。',feedback:[{kind:'engine',text:'真实引擎反馈'}],calls:[],assertions:[]}];
    const result={id:'m3_language',attempt:1,turns};
    const good=await reviewPlaytest({async generate(body){
        const input=JSON.parse(body.messages[1].content);
        assert.ok(input.rubric.languageRequirements.V5);assert.deepEqual(input.turns[0].feedback,turns[0].feedback);
        return response({scores:{...scores,V3:20},findings:[{turn:0,criterion:'V3',quote:'你付清了',reason:'只听介绍却代替购买'}]});
    }},result,scenario.rubric);
    assert.equal(good.complete,true);assert.equal(good.scores.V3,20);
    const missing=await reviewPlaytest({async generate(){return response({scores:{truth:100,agency:100,language:100,continuity:100},findings:[]});}},result,scenario.rubric);
    assert.equal(missing.complete,false);assert.equal(missing.scores,undefined);
    const forged=await reviewPlaytest({async generate(){return response({scores,findings:[{turn:0,criterion:'V3',quote:'不存在的原句',reason:'代替购买'}]});}},result,scenario.rubric);
    assert.equal(forged.complete,false);assert.match(forged.parts[0].error,/真实原句/);
    let calls=0;
    const changed=await reviewPlaytest({async generate(body,label){calls++;return response({scores:{...scores,V3:label.endsWith(':format')?100:20},findings:[{turn:0,criterion:'V3',quote:label.endsWith(':format')?'你付清了':'错误引文',reason:'代替购买'}]});}},result,scenario.rubric);
    assert.equal(calls,2);assert.equal(changed.complete,false);assert.match(changed.parts[0].error,/原分数/);
    const reused=await reviewPlaytest({generate(){assert.fail('完成的负评不重抽');}},result,scenario.rubric,{previousReview:good});
    assert.equal(reused.scores.V3,20);
});

test('V1/V6检测与逐项≥95门槛：陈词计重复命中，空样本、未审和缺真实测量不通过',()=>{
    assert.equal(languageChecks([{visible:'這裡還沒開始。'}]).simplified,false);
    const repeated=languageChecks([{visible:'微微一笑，微微一笑。'}]);assert.equal(repeated.clicheHits.length,2);
    assert.equal(languageChecks([{visible:'仿佛木头一般，仿佛石头一般。'}]).simileOverflow.length,1);
    assert.equal(languageChecks([{visible:''}]).clichesPerThousand,null);
    const sample={id:scenario.id,attempt:1,consistencyPass:true,review:{complete:true,scores,parts:scenario.turns.map((_,start)=>({start,count:1,scores,findings:[]}))},turns:scenario.turns.map((step,index)=>({index,input:step.input,visible:'你停在原处。',errors:[],assertions:step.assertions.map(a=>({...a,pass:true})),requests:[{model:'test-fixture',timestamp:'offline-fixture',latencyMs:1,usage:{prompt_tokens:1,completion_tokens:1}}]}))};
    // Synthetic measurements exercise the gate only, never establish real play.
    assert.equal(summarizeLanguageAcceptance([sample],[scenario]).thresholdReached,true);
    for(const mutate of [s=>delete s.review,s=>s.turns[0].requests=[],s=>s.review.scores={...scores,V7:94},s=>s.turns[0].assertions[0].pass=false,s=>s.turns.pop(),s=>s.turns[0].visible='微微一笑']){
        const bad=structuredClone(sample);mutate(bad);assert.equal(summarizeLanguageAcceptance([bad],[scenario]).thresholdReached,false);
    }
    assert.equal(summarizeLanguageAcceptance([sample,sample],[scenario]).thresholdReached,false);
    assert.equal(summarizeLanguageAcceptance([],[scenario]).thresholdReached,false);
});
