import test from'node:test';
import assert from'node:assert/strict';
import {createPlaytestServer,runPlaytest}from'../tools/playtest-runner.mjs';
import {evaluateAssertions}from'../tools/playtest-assertions.mjs';
import {loadPromptBundle,presetFor}from'../tools/build-card.mjs';
import {promptSections}from'../extension/prompt.mjs';
import {toolSelectionMetrics,playtestAcceptance}from'../tools/playtest-metrics.mjs';
import fs from'node:fs/promises';
import path from'node:path';
import{tmpRoot}from'../tools/tmp-root.mjs';
import {openPlaytestBudget,openPlaytestTape}from'../tools/playtest-budget.mjs';

test('调用断言按动作目录识别 world_act，保留原始入口、参数和执行成功要求',()=>{
    const empty={state:{minute:0}};
    const cases=[
        ['core:craft.manufacture',{recipe:'recipe_wooden_pegs'},'world_craft',{operation:'manufacture',recipe:'recipe_wooden_pegs'}],
        ['core:craft.repair',{item:'item_staff',repairPlan:'repair_staff_trim'},'world_craft',{operation:'repair',item:'item_staff'}],
        ['core:learn',{entity:'skill_literacy',kind:'skill',source:'npc_hw_luqing'},'world_learn',{entity:'skill_literacy'}],
        ['core:practice',{skill:'识字'},'world_practice',{skill:'识字'}],
        ['core:quest.publish',{publisher:'npc_hw_linsui',personal:true,reward:20,objective:{type:'deliver',item:'item_oats',quantity:10}},'world_quest',{operation:'publish',reward:20,'objective.quantity':10}],
        ['core:quest.accept',{quest:'quest_example'},'world_quest',{operation:'accept',quest:'quest_example'}],
    ];
    for(const [action,slots,tool,args]of cases){
        const call={tool:'world_act',args:{action,slots},result:{ok:true}};
        const rule={kind:'calls',tool,args,success:true,min:1,max:1};
        const check=(rule,calls=[call])=>evaluateAssertions([rule],{before:empty,after:empty,calls,reply:''})[0];
        assert.equal(check(rule).pass,true,action);
        assert.equal(check({...rule,tool:'world_act',args:{action,slots}}).pass,true,'原始入口仍可断言');
        assert.equal(check({...rule,args:{...args,entity:'wrong_entity'}}).pass,false,'译后参数仍严格核对');
        assert.equal(check(rule,[{...call,result:{ok:false}}]).pass,false,'拒绝不能计为成功调用');
        assert.equal(check(rule,[{...call,args:{action:'core:missing',slots}}]).pass,false,'未登记动作不能冒充调用');
        assert.equal(check({...rule,min:0,max:0}).pass,false,'禁止调用的上限仍生效');
    }
    const read={kind:'calls',tool:'world_actions',args:{query:'修理'},success:true};
    assert.equal(evaluateAssertions([read],{before:empty,after:empty,calls:[{tool:'world_actions',args:{query:'修理'},result:{ok:true}}],reply:''})[0].pass,true);
});

test('选工具指标与调用断言共用 world_act 翻译且继续识别错参数和失败',()=>{
    const rule={kind:'calls',tool:'world_craft',args:{operation:'manufacture',recipe:'recipe_wooden_pegs'},success:true};
    const scenario={id:'act-metrics',turns:[{input:'制作木楔',expectedTools:['world_craft'],assertions:[rule]}]};
    const call={tool:'world_act',args:{action:'core:craft.manufacture',slots:{recipe:'recipe_wooden_pegs'}},result:{ok:true}};
    const measure=call=>toolSelectionMetrics([{id:scenario.id,turns:[{index:0,input:scenario.turns[0].input,calls:[call]}]}],[scenario]);
    assert.equal(measure(call).zeroSelectionErrors,true);
    assert.equal(measure({...call,args:{...call.args,slots:{recipe:'recipe_wrong'}}}).parameterWrong,1);
    assert.equal(measure({...call,result:{ok:false}}).rows[0].rejected,1);
    assert.equal(measure({...call,args:{action:'core:missing',slots:{}}}).zeroSelectionErrors,false);
});

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

test('送货立约与私宅等待只执行当前步骤，提前移动和额外world_trade仍报错',async()=>{
    for(const [id,index,calls,expected]of [
        ['npc_courier',2,[{tool:'world_promise',args:{type:'送货',item:'item_bread',quantity:1,deadline:660}},{tool:'world_promise',args:{type:'付款',coins:2,deadline:660}}],['world_promise']],
        ['npc_home_visit',0,[{tool:'world_move',args:{destination:'loc_hw_fields'}},{tool:'world_time',args:{minutes:30,activity:'等待'}}],['world_move','world_time']],
    ]){
        const scenario=JSON.parse(await fs.readFile(new URL(`./playtests/${id}.json`,import.meta.url),'utf8'));
        const turn={index,input:scenario.turns[index].input,calls,assertions:[]};
        const report=toolSelectionMetrics([{id,turns:[turn]}],[scenario]);
        assert.equal(report.opportunities,1);assert.deepEqual(report.rows[0].expected,expected);
        assert.equal(report.missed,0);assert.equal(report.wrong,0);
        assert.ok(report.parameterOpportunities>0);assert.equal(report.parameterWrong,0);assert.equal(report.targetOpportunities,0);
        assert.equal(report.rows[0].targetMeasurement,'not-measured');
        if(id==='npc_courier'){
            const early={...turn,calls:[...turn.calls,{tool:'world_move',args:{destination:'bld_hw_council'}}]};
            assert.equal(toolSelectionMetrics([{id,turns:[early]}],[scenario]).wrong,1);
        }
        turn.calls.push({tool:'world_trade',args:{seller:'npc_hw_linsui',item:'item_bread',quantity:1}});
        const wrong=toolSelectionMetrics([{id,turns:[turn]}],[scenario]);
        assert.equal(wrong.wrong,1);assert.equal(wrong.rows[0].wrongCalls[0].tool,'world_trade');
        turn.calls=[];
        assert.equal(toolSelectionMetrics([{id,turns:[turn]}],[scenario]).missed,1);
    }
});

test('任务回合6/7只按各自前一回合已存数量判断机会，原采购和终态断言继续失败',async()=>{
    const scenario=JSON.parse(await fs.readFile(new URL('./playtests/npc_quest_social.json',import.meta.url),'utf8'));
    const saved=(index,quantity,calls=[])=>{
        const document={state:{inventory:{item_oats:{quantity}},player:{coins:150},minute:0}};
        return{index,input:scenario.turns[index].input,calls,
            assertions:evaluateAssertions(scenario.turns[index].assertions,{before:document,after:document,calls,reply:''})};
    };
    const metrics=(bought,carried,move=[],deliver=[])=>toolSelectionMetrics([{id:scenario.id,turns:[saved(5,bought),saved(6,carried,move),saved(7,0,deliver)]}],[scenario]);
    for(const quantity of [0,9]){
        const report=metrics(quantity,quantity);
        assert.deepEqual(report.rows.map(r=>r.turn),[5]);assert.equal(report.missed,1,'采购漏选继续报错');
        assert.deepEqual(report.excluded.map(r=>[r.turn,r.reason]),[[6,'prerequisite-not-met'],[7,'prerequisite-not-met']]);
        assert.equal(report.complete,true,'真实零数量属于已测条件');
        assert.ok(saved(5,quantity).assertions.some(r=>r.kind==='quantity'&&!r.pass));
        assert.ok(saved(6,quantity).assertions.some(r=>r.kind==='equals'&&!r.pass));
        assert.ok(saved(7,0).assertions.some(r=>r.kind==='records'&&!r.pass),'终态未完成仍失败');
    }
    const missed=metrics(10,10);
    assert.deepEqual(missed.rows.map(r=>r.turn),[5,6,7]);assert.equal(missed.missed,3);
    assert.deepEqual(missed.rows[1].conditions,[{kind:'quantity',turn:5,path:'state.inventory.item_oats',value:10,actual:10}]);
    assert.deepEqual(missed.rows[2].conditions,[{kind:'quantity',turn:6,path:'state.inventory.item_oats',value:10,actual:10}]);
    const correct=metrics(10,10,[{tool:'world_move',args:{destination:'青灯酒馆'}}],[{tool:'world_quest',args:{operation:'complete'}}]);
    assert.equal(correct.rows[1].missing,false);assert.equal(correct.rows[2].missing,false);
    assert.equal(correct.parameterOpportunities,1);assert.equal(correct.parameterWrong,0);assert.equal(correct.targetOpportunities,0);
    assert.deepEqual(metrics(10,0).rows.map(r=>r.turn),[5,6],'第7回合读取已带到的数量，不能只看第5回合');
    assert.deepEqual(metrics(0,10).rows.map(r=>r.turn),[5,7],'第6回合失败不能抹去后续实际持有的粮食');
    const boughtWrong=saved(5,0,[{tool:'world_trade',args:{seller:'陈柏',item:'item_oats',quantity:10}}]);
    const wrong=toolSelectionMetrics([{id:scenario.id,turns:[boughtWrong,saved(6,0),saved(7,0)]}],[scenario]);
    assert.equal(wrong.wrong,1);assert.equal(wrong.rows[0].wrongCalls[0].tool,'world_trade');
    assert.equal(wrong.rows[0].missing,true);assert.equal(wrong.parameterWrongRatio,null);assert.equal(wrong.targetWrongRatio,null);
});

test('quantity前置缺测或非数值不推断，机会读取actual而非采购断言的pass',()=>{
    const gate={kind:'quantity',turn:0,path:'state.inventory.item_oats',value:10};
    const scenario={id:'quantity-gate',turns:[{input:'采购',assertions:[]},{input:'备齐再走',expectedTools:['world_move'],toolExpectationAfter:gate,assertions:[]}]};
    const prerequisite={kind:'quantity',path:gate.path,value:10,actual:10,pass:false};
    const result={id:scenario.id,turns:[{index:0,input:'采购',assertions:[prerequisite]},{index:1,input:'备齐再走',calls:[]}]};
    const measured=toolSelectionMetrics([result],[scenario]);assert.equal(measured.opportunities,1);assert.equal(measured.missed,1);
    for(const actual of [undefined,'10',NaN]){
        prerequisite.actual=actual;prerequisite.pass=true;
        const unknown=toolSelectionMetrics([result],[scenario]);assert.equal(unknown.opportunities,0);assert.equal(unknown.complete,false);
        assert.equal(unknown.excluded[0].reason,'prerequisite-not-measured');
    }
    result.turns[0].assertions=[];
    assert.equal(toolSelectionMetrics([result],[scenario]).excluded[0].reason,'prerequisite-not-measured');
    prerequisite.actual=9;result.turns[0].assertions=[prerequisite];
    assert.equal(toolSelectionMetrics([result],[scenario]).excluded[0].reason,'prerequisite-not-met');
});

test('试玩world_read单人物定位读取真实库存，场外查询不转物扣钱或泄露认知',async t=>{
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,consistencyClient:null});t.after(()=>server.close());
    const bundle=await loadPromptBundle();let requests=0;
    const client={async generate({messages}){
        const index=messages.findLastIndex(m=>m.role==='user'),receipts=messages.slice(index).filter(m=>m.role==='tool');
        if(!receipts.length)return{choices:[{message:{tool_calls:[{id:`read-${requests++}`,type:'function',function:{name:'world_read',arguments:JSON.stringify({section:'人物',npc:messages[index].content.includes('未知')?'npc_missing':'npc_hw_linsui'})}}]}}]};
        const result=JSON.parse(receipts[0].content);
        if(messages[index].content.includes('未知'))assert.equal(result.ok,false);
        else{
            assert.deepEqual(Object.keys(result),['npc_hw_linsui']);
            const row=result.npc_hw_linsui;assert.equal(row.inventory.item_bread,6);
            for(const key of ['cognition','memoryStream','legalKnowledge','goals','relationships','autonomy','developments'])assert.equal(Object.hasOwn(row,key),false);
        }
        return{choices:[{message:{content:'已核对查询回执。'}}]};
    }};
    const assertions=[{kind:'elapsed',min:0,max:0},{kind:'unchanged',paths:['state.inventory','state.player.coins','state.npcs']}];
    const scenario={id:'read-npc-http',turns:[{input:'（场外）只查询林穗库存',assertions},{input:'（场外）查询未知人物',assertions}]};
    const result=await runPlaytest({scenario,api:server.api,client,bundle});
    assert.equal(result.pass,true,JSON.stringify(result.turns.filter(t=>t.errors.length)));assert.equal(requests,2);
    assert.equal(result.turns[0].calls[0].args.npc,'npc_hw_linsui');
});

test('试玩框架走真实HTTP存储、检索和回滚；场外写入拒绝，重复扣款幂等',async t=>{
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/});t.after(()=>server.close());const bundle=await loadPromptBundle();let callId=0,sawSearch=false;
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
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,consistencyClient:null});t.after(()=>server.close());const calls=[];
    const api=async(endpoint,body)=>{calls.push({endpoint,body});return server.api(endpoint,body);};api.seedMode=server.api.seedMode;
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
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/});t.after(()=>server.close());let calls=0;
    const client={async generate(){
        if(calls++)throw new Error('模拟正文请求中断');
        return{choices:[{message:{role:'assistant',tool_calls:[{id:'rent',type:'function',function:{name:'world_trade',arguments:JSON.stringify({seller:'林穗',service:'住宿',days:1})}}]}}]};
    }};
    const result=await runPlaytest({scenario:{id:'write-without-reply',initial:{mode:'legacy'},turns:[{input:'付六铜住一晚',assertions:[{kind:'delta',path:'state.player.coins',value:-6}]}]},api:server.api,client,bundle:await loadPromptBundle()});
    assert.equal(result.pass,false);assert.equal(result.assertions,2);assert.equal(result.passed,1);
    assert.equal(result.turns[0].player.coins,174);assert.match(result.turns[0].errors[0],/中断/);
});

test('审查完成且允许提交的warning仍需复核，不能冒充整场验收通过',async t=>{
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/});t.after(()=>server.close());
    const warning={category:'meta',severity:'warning',quote:'测试原句',reason:'待复核'};
    const api=async(name,args)=>{
        const result=await server.api(name,args);
        return name==='review/reply'?{...result,verified:true,canCommit:true,status:'issues',issues:[warning]}:result;
    };
    const client={async generate(){return{choices:[{message:{role:'assistant',content:'已核对。'}}]};}};
    api.seedMode=server.api.seedMode;
    const result=await runPlaytest({scenario:{id:'warning-review',turns:[{input:'（场外）只核对，不推进时间。',assertions:[{kind:'elapsed',min:0,max:0}]}]},api,client,bundle:await loadPromptBundle()});
    assert.equal(result.ledgerPass,true);assert.equal(result.consistencyVerified,true);
    assert.equal(result.consistencyPass,false);assert.equal(result.reviewRequired,true);assert.equal(result.acceptancePass,false);
    assert.deepEqual(result.consistencyIssues,[warning]);
});

test('持久续跑从付款后的失败正文恢复，原失败保留且HTTP执行不重发',async t=>{
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'fields-runner-resume-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,directory:path.join(directory,'server')});t.after(()=>server.close());
    let calls=0,executeCount=0;
    const provider={async generate(){
        calls++;if(calls===2)throw Error('付款后正文中断');
        const message=calls===1?{tool_calls:[{id:'rent',type:'function',function:{name:'world_trade',arguments:JSON.stringify({seller:'林穗',service:'住宿',days:1})}}]}:{content:'已经住下。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>'};
        const usage={prompt_tokens:10,completion_tokens:10};return {id:`resume-${calls}`,usage,measurement:{usage,costUpperYuan:.0001},choices:[{finish_reason:'stop',message}]};
    }};
    const budget=await openPlaytestBudget({registryDir:path.join(directory,'registry'),runId:'resume',cardId:'T17',increment:30,identity:{},client:provider});t.after(()=>budget.close());
    const api=async(name,args)=>{if(name==='execute')executeCount++;return server.api(name,args);};api.seedMode=server.api.seedMode;
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

test('试玩守门只看实际存档种子：随机种子服务器手写 seedMode=fixed 也被拒绝',async t=>{
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,seed:'random'});t.after(()=>server.close());
    const api=async(name,body)=>server.api(name,body);api.seedMode='fixed';
    await assert.rejects(runPlaytest({scenario:{id:'forged-seed',turns:[]},api,client:{},bundle:await loadPromptBundle()}),/实际种子不是确定种子/);
    const custom=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,seed:'custom-fixed'});t.after(()=>custom.close());
    await assert.rejects(runPlaytest({scenario:{id:'wrong-seed',turns:[]},api:custom.api,client:{},bundle:await loadPromptBundle()}),/实际种子不是确定种子/);
});
test('holdingsUnchanged 只比物品数量：数量变了判失败，只有耐久变了判通过',()=>{
    const state=inventory=>({state:{inventory}}),rule=[{kind:'holdingsUnchanged',path:'state.inventory'}];
    const before=state({item_clothes:{quantity:1,durability:100},item_bread:2,item_staff:{quantity:1}});
    const worn=evaluateAssertions(rule,{before,after:state({item_clothes:{quantity:1,durability:99},item_bread:2,item_staff:{quantity:1}}),calls:[],reply:''});
    assert.equal(worn[0].pass,true);
    const lost=evaluateAssertions(rule,{before,after:state({item_clothes:{quantity:1,durability:99},item_bread:1,item_staff:{quantity:1}}),calls:[],reply:''});
    assert.equal(lost[0].pass,false);assert.deepEqual(lost[0].actual,['item_bread']);
    const gained=evaluateAssertions(rule,{before,after:state({item_clothes:{quantity:1,durability:100},item_bread:2,item_staff:{quantity:1},item_wooden_peg:1}),calls:[],reply:''});
    assert.equal(gained[0].pass,false);assert.deepEqual(gained[0].actual,['item_wooden_peg']);
});
