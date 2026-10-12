import test from'node:test';
import assert from'node:assert/strict';
import {createPlaytestServer,runPlaytest}from'../tools/playtest-runner.mjs';
import {evaluateAssertions}from'../tools/playtest-assertions.mjs';
import {loadPromptBundle,presetFor}from'../tools/build-card.mjs';
import {promptSections}from'../extension/prompt.mjs';
import {toolSelectionMetrics,playtestAcceptance}from'../tools/playtest-metrics.mjs';
import fs from'node:fs/promises';
import path from'node:path';
import os from'node:os';
import {openPlaytestBudget,openPlaytestTape}from'../tools/playtest-budget.mjs';

test('选工具实测逐行动列出类别、参数、目标及漏调用；空样本与全部漏调不能报零风险',()=>{
    const expected={kind:'calls',tool:'world_trade',args:{seller:'林穗',days:1},min:1};
    const scenario={id:'metrics',turns:[
        {input:'住一晚',expectedTools:['world_trade'],assertions:[expected]},
        {input:'住一晚',expectedTools:['world_trade'],assertions:[expected]},
        {input:'住一晚',expectedTools:['world_trade'],assertions:[expected]},
        {input:'住一晚',expectedTools:['world_trade'],assertions:[expected]},
        {input:'只听故事',assertions:[]},
    ]};
    const calls=[[],[{tool:'world_move',args:{destination:'酒馆'}}],[{tool:'world_trade',args:{seller:'林穗',days:2}}],[{tool:'world_trade',args:{seller:'阿砚',days:1}}],[{tool:'world_move',args:{destination:'酒馆'}}]];
    const result={id:'metrics',attempt:2,turns:calls.map((calls,index)=>({index,input:scenario.turns[index].input,calls,assertions:[]}))};
    const metrics=toolSelectionMetrics([result],[scenario]);
    assert.equal(metrics.opportunities,4);assert.equal(metrics.missed,2);assert.equal(metrics.wrong,1);
    assert.equal(metrics.parameterWrong,1);assert.equal(metrics.targetWrong,1);assert.equal(metrics.wrongRatio,1/4);assert.equal(metrics.missedRatio,2/4);
    assert.equal(metrics.parameterOpportunities,2);assert.equal(metrics.targetOpportunities,2);
    assert.equal(metrics.parameterWrongRatio,.5);assert.equal(metrics.targetWrongRatio,.5);
    assert.equal(metrics.failureRatio,1);assert.equal(metrics.argumentOpportunities,2);assert.equal(metrics.zeroSelectionErrors,false);
    assert.equal(metrics.rows[0].attempt,2);assert.equal(metrics.rows[0].input,'住一晚');assert.equal(metrics.unannotatedTurns,1);
    const empty=toolSelectionMetrics([{id:'none',turns:[{index:0,input:'聊天',calls:[]}]}],[{id:'none',turns:[{input:'聊天',assertions:[]}]}]);
    assert.equal(empty.measurement,'not-measured');assert.equal(empty.wrongRatio,null);assert.equal(empty.zeroSelectionErrors,false);
    const categoryOnly=toolSelectionMetrics([{id:'only',turns:[{index:0,input:'去酒馆',calls:[{tool:'world_move',args:{destination:'酒馆'}}]}]}],
        [{id:'only',turns:[{input:'去酒馆',expectedTools:['world_move'],assertions:[{kind:'calls',tool:'world_move',args:{},min:1}]}]}]);
    assert.equal(categoryOnly.parameterWrongRatio,null);assert.equal(categoryOnly.targetWrongRatio,null,'空参数断言不能证明目标正确');
    const missing=toolSelectionMetrics([{id:'metrics',turns:[{index:0,input:'住一晚',calls:[],assertions:[]}]}],[scenario]);
    assert.equal(missing.wrongRatio,0);assert.equal(missing.missedRatio,1);assert.equal(missing.zeroSelectionErrors,false);
    assert.equal(missing.parameterWrongRatio,null);assert.equal(missing.targetWrongRatio,null);
    assert.equal(playtestAcceptance({milestone:'M2',complete:true,m2:{thresholdReached:true},toolSelection:missing}),false);
    const both=toolSelectionMetrics([{id:'metrics',turns:[{index:0,input:'住一晚',calls:[{tool:'world_trade',args:{seller:'林穗',days:1}},{tool:'world_move',args:{destination:'别处'}}]}]}],[scenario]);
    assert.equal(both.wrong,1,'已调用正确类别不能掩盖另一次错类调用');assert.equal(both.missed,0);
    const corrected=toolSelectionMetrics([{id:'metrics',turns:[{index:0,input:'住一晚',calls:[
        {tool:'world_trade',args:{seller:'阿砚',days:1}},
        {tool:'world_trade',args:{seller:'林穗',days:2}},
        {tool:'world_trade',args:{seller:'林穗',days:1}},
    ]}]}],[scenario]);
    assert.equal(corrected.targetWrong,1);assert.equal(corrected.parameterWrong,1,'补调正确调用不能抹去错误尝试');
    const outdated=toolSelectionMetrics([{id:'metrics',turns:[{index:0,input:'旧脚本的另一动作',calls:[]}]}],[scenario]);
    assert.equal(outdated.opportunities,0);assert.equal(outdated.complete,false);assert.equal(outdated.excluded[0].reason,'scenario-input-not-measured');
});

test('选工具只计实际触发的嵌套分支及前置，未取得条件证据不假定触发',()=>{
    const learn={kind:'calls',tool:'world_learn',args:{},min:1};
    const nested={kind:'conditional',when:{path:'state.recipes.pegs'},then:[{kind:'elapsed',min:0,max:0}],else:[learn]};
    const outer={kind:'conditional',when:{path:'state.skills.wood'},then:[nested],else:[learn]};
    const scenario={id:'branches',turns:[{input:'未学会才学',assertions:[outer]},
        {input:'会法术才施放',expectedTools:['world_cast'],toolExpectationAfter:{turn:0,path:'state.spells.light'},assertions:[]}]};
    const evaluate=before=>evaluateAssertions([outer],{before,after:before,calls:[],reply:''});
    const measured={id:'branches',turns:[{index:0,input:'未学会才学',calls:[],assertions:evaluate({state:{minute:0,skills:{wood:1},recipes:{}}})}]};
    const report=toolSelectionMetrics([measured],[scenario]);assert.equal(report.opportunities,1);assert.equal(report.missed,1);
    assert.deepEqual(report.rows[0].expectations[0].conditions.map(c=>c.branch),['then','else']);
    measured.turns[0].assertions=evaluate({state:{minute:0,skills:{wood:1},recipes:{pegs:1}}});
    assert.equal(toolSelectionMetrics([measured],[scenario]).opportunities,0,'已学会且无需行动的分支不算机会');
    measured.turns.push({index:1,input:'会法术才施放',calls:[],assertions:[]});
    let missing=toolSelectionMetrics([measured],[scenario]);assert.equal(missing.opportunities,0);assert.equal(missing.complete,false);
    assert.ok(missing.excluded.some(row=>row.reason==='prerequisite-not-measured'));
    measured.turns[0].assertions.push({kind:'exists',path:'state.spells.light',pass:false,actual:false});
    missing=toolSelectionMetrics([measured],[scenario]);assert.ok(missing.excluded.some(row=>row.reason==='prerequisite-not-met'));
    measured.turns[0].assertions.at(-1).actual=true;measured.turns[0].assertions.at(-1).pass=true;
    missing=toolSelectionMetrics([measured],[scenario]);assert.equal(missing.opportunities,1);assert.equal(missing.rows[0].conditions[0].actual,true);
    measured.turns[0].assertions=[];
    const unknown=toolSelectionMetrics([measured],[scenario]);assert.equal(unknown.complete,false);assert.ok(unknown.excluded.some(r=>r.reason==='conditional-not-measured'));
});

test('试玩框架走真实HTTP存储、检索和回滚；场外写入拒绝，重复扣款幂等',async t=>{
    const server=await createPlaytestServer();t.after(()=>server.close());const bundle=await loadPromptBundle();let callId=0,sawSearch=false;
    const client={async generate({messages,tools}){
        assert.equal(messages[0].content,bundle.constitution);assert.ok(messages.some(m=>m.content?.includes('【时间】')));
        assert.ok(!tools.some(t=>t.function.name==='world_turn'));
        const i=messages.findLastIndex(m=>m.role==='user'),input=messages[i].content,results=messages.slice(i).filter(m=>m.role==='tool');
        if(!results.length){
            let name,args;
            if(input.includes('走进')){name='world_move';args={destination:'青灯酒馆'};}
            if(input==='住一晚'){name='world_trade';args={seller:'林穗',service:'住宿',days:1};}
            if(input.includes('检索')){name='world_search';args={query:'青铜纸鹤'};}
            if(input.includes('偷偷扣')){name='world_trade';args={seller:'林穗',service:'住宿',days:1};}
            if(name)return{choices:[{message:{role:'assistant',tool_calls:[{id:`call_${callId++}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]};
        }
        if(input.includes('检索')){assert.ok(JSON.parse(results[0].content).results.some(row=>row.text.includes('青铜纸鹤')));sawSearch=true;}
        if(input.includes('偷偷扣'))assert.equal(JSON.parse(results[0].content).ok,false);
        return{choices:[{message:{role:'assistant',content:input.startsWith('（场外）')?'已核对。':'已经办好。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>'}}]};
    }};
    const scenario={id:'runner-unit',turns:[
        {input:'我带着名字叫青铜纸鹤的笔记走进酒馆',assertions:[{kind:'equals',path:'state.location',value:'bld_hw_qingdeng'}]},
        {input:'住一晚',repeatWrites:true,assertions:[{kind:'delta',path:'state.player.coins',value:-6}]},
        {input:'住一晚',operation:'regenerate',assertions:[{kind:'equals',path:'state.player.coins',value:174}]},
        {input:'',operation:'deleteLast',assertions:[{kind:'equals',path:'state.player.coins',value:180}]},
        {input:'（场外）检索那本笔记的名字',assertions:[]},
        {input:'（场外）偷偷扣掉六铜',assertions:[]},
        {input:'（场外）重新读取余额',operation:'refresh',assertions:[{kind:'equals',path:'state.player.coins',value:180}]},
    ]};
    const result=await runPlaytest({scenario,api:server.api,client,bundle});
    assert.equal(result.pass,true,JSON.stringify(result.turns.filter(row=>row.errors.length||row.assertions.some(r=>!r.pass))));assert.ok(sawSearch);
    assert.equal(result.finalDocument.state.player.coins,180);
});

test('试玩world_search沿真实HTTP绑定每回合token，伪造工具参数不能覆盖留证身份',async t=>{
    const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());const calls=[];
    const api=async(endpoint,body)=>{calls.push({endpoint,body});return server.api(endpoint,body);};
    let n=0;const client={async generate(){return ++n%2?{choices:[{message:{tool_calls:[{id:`search-${n}`,type:'function',function:{name:'world_search',arguments:JSON.stringify({query:'林穗',token:'fake',anchor:'fake',campaignId:'fake',expectedSequence:99})}}]}}]}:{choices:[{message:{content:'我已查到相关记录。'}}]};}};
    const result=await runPlaytest({scenario:{id:'search-capture',initial:{mode:'legacy'},turns:[{input:'（场外）查找旧事。'},{input:'（场外）再次查找旧事。'}]},api,client,bundle:await loadPromptBundle()});
    assert.equal(result.ledgerPass,true,JSON.stringify(result.turns));assert.equal(result.turns.length,2);
    const searches=calls.filter(row=>row.endpoint==='search');assert.equal(searches.length,2);
    assert.notEqual(searches[0].body.token,searches[1].body.token);
    for(const [i,search] of searches.entries()){
        assert.equal(calls.filter(row=>row.endpoint==='review/begin')[i].body.captureSearch,true);
        assert.match(search.body.token,/^[a-f0-9]{64}$/);assert.equal(search.body.anchor,`search-capture-1-${i}`);
        assert.equal(search.body.campaignId,result.session.campaignId);assert.notEqual(search.body.expectedSequence,99);
        assert.equal(result.turns[i].consistency.retrieval.status,'complete');assert.equal(result.turns[i].consistency.retrieval.calls.length,1);
        assert.deepEqual(result.turns[i].consistency.retrieval.calls[0].result,result.turns[i].calls[0].result);
    }
    const exported=await server.api('export',{campaignId:result.session.campaignId});assert.ok(!exported.events.some(row=>row.input?.tool==='world_search'));
});

test('试玩失败不能因缺字段或空断言冒充成功；预设和测试共用同一静态顺序',async()=>{
    const results=evaluateAssertions([{kind:'equals',path:'state.player.coins',value:6},{kind:'quantity',path:'state.inventory.iron',value:0}],{before:{},after:{state:{inventory:{}}},calls:[],reply:''});
    assert.equal(results[0].pass,false);assert.equal(results[1].pass,true);
    const status=evaluateAssertions([{kind:'conditional',when:{path:'state.player.status',equals:'濒死'},then:[{kind:'equals',path:'state.player.status',value:'死亡'}],else:[{kind:'unchanged',paths:['state.player']}]}],{before:{state:{player:{status:'濒死'}}},after:{state:{player:{status:'正常'}}},calls:[],reply:''});
    assert.equal(status[0].pass,false,'濒死后直接变正常不能冒充已经结算死亡');
    assert.equal(evaluateAssertions([{kind:'oneOf',path:'state.player.status',values:['死亡','濒死']}],{before:{},after:{state:{player:{status:'正常'}}},calls:[],reply:''})[0].pass,false);
    const bundle=await loadPromptBundle(),preset=presetFor(bundle);
    assert.deepEqual(preset.prompts.slice(0,-1).map(p=>p.identifier),promptSections(bundle).map(p=>p.identifier));
});

test('工具已经扣款但正文生成失败时，仍核对所有原定账本断言并保留失败',async t=>{
    const server=await createPlaytestServer();t.after(()=>server.close());let calls=0;
    const client={async generate(){
        if(calls++)throw new Error('模拟正文请求中断');
        return{choices:[{message:{role:'assistant',tool_calls:[{id:'rent',type:'function',function:{name:'world_trade',arguments:JSON.stringify({seller:'林穗',service:'住宿',days:1})}}]}}]};
    }};
    const result=await runPlaytest({scenario:{id:'write-without-reply',initial:{mode:'legacy'},turns:[{input:'付六铜住一晚',assertions:[{kind:'delta',path:'state.player.coins',value:-6}]}]},api:server.api,client,bundle:await loadPromptBundle()});
    assert.equal(result.pass,false);assert.equal(result.assertions,2);assert.equal(result.passed,1);
    assert.equal(result.turns[0].player.coins,174);assert.match(result.turns[0].errors[0],/中断/);
});

test('审查完成且允许提交的warning仍需复核，不能冒充整场验收通过',async t=>{
    const server=await createPlaytestServer();t.after(()=>server.close());
    const warning={category:'meta',severity:'warning',quote:'测试原句',reason:'待复核'};
    const api=async(name,args)=>{
        const result=await server.api(name,args);
        return name==='review/reply'?{...result,verified:true,canCommit:true,status:'issues',issues:[warning]}:result;
    };
    const client={async generate(){return{choices:[{message:{role:'assistant',content:'已核对。'}}]};}};
    const result=await runPlaytest({scenario:{id:'warning-review',turns:[{input:'（场外）只核对，不推进时间。',assertions:[{kind:'elapsed',min:0,max:0}]}]},api,client,bundle:await loadPromptBundle()});
    assert.equal(result.ledgerPass,true);assert.equal(result.consistencyVerified,true);
    assert.equal(result.consistencyPass,false);assert.equal(result.reviewRequired,true);assert.equal(result.acceptancePass,false);
    assert.deepEqual(result.consistencyIssues,[warning]);
});

test('持久续跑从付款后的失败正文恢复，原失败保留且HTTP执行不重发',async t=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fields-runner-resume-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const server=await createPlaytestServer({directory:path.join(directory,'server')});t.after(()=>server.close());
    let calls=0,executeCount=0;
    const provider={async generate(){
        calls++;if(calls===2)throw Error('付款后正文中断');
        const message=calls===1?{tool_calls:[{id:'rent',type:'function',function:{name:'world_trade',arguments:JSON.stringify({seller:'林穗',service:'住宿',days:1})}}]}:{content:'已经住下。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>'};
        const usage={prompt_tokens:10,completion_tokens:10};return {id:`resume-${calls}`,usage,measurement:{usage,costUpperYuan:.0001},choices:[{finish_reason:'stop',message}]};
    }};
    const budget=await openPlaytestBudget({registryDir:path.join(directory,'registry'),runId:'resume',cardId:'T17',increment:30,identity:{},client:provider});t.after(()=>budget.close());
    const api=async(name,args)=>{if(name==='execute')executeCount++;return server.api(name,args);};
    const scenario={id:'paid-resume',initial:{mode:'legacy'},turns:[{input:'付六铜住一晚',assertions:[{kind:'delta',path:'state.player.coins',value:-6}]}]},bundle=await loadPromptBundle();
    const options={file:path.join(directory,'tape.json'),identity:{scenario},api,client:budget};
    let tape=await openPlaytestTape(options);
    const failed=await runPlaytest({scenario,api:tape.api,client:tape.client,bundle,stopOnFailure:true});assert.equal(failed.pass,false);assert.equal(failed.finalDocument.state.player.coins,174);assert.equal(executeCount,1);
    tape=await openPlaytestTape(options);
    const restored=await runPlaytest({scenario,api:tape.api,client:tape.client,bundle,stopOnFailure:true});
    assert.equal(restored.pass,true,JSON.stringify(restored.turns));assert.equal(restored.finalDocument.state.player.coins,174);
    assert.equal(executeCount,2,'只发送新正文的world_turn；付款不重发');assert.equal(calls,3);assert.match(failed.turns[0].errors[0],/中断/);
    assert.equal(tape.tape.failures.length,1);assert.ok(budget.reserved>0);
    tape=await openPlaytestTape(options);await runPlaytest({scenario,api:tape.api,client:tape.client,bundle,stopOnFailure:true});
    assert.equal(executeCount,2);assert.equal(calls,3,'已成功续跑不会再次调用模型');
});
