import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewNpcRequirements,summarizeNpcAcceptance} from '../tools/npc-acceptance.mjs';

test('N类标签、账本正确或空审核都不能单独变成验收通过',()=>{
    const scenarios=[{id:'all',requirements:Array.from({length:17},(_,i)=>'N'+(i+1))}];
    const row={id:'all',attempt:1,ledgerPass:true,consistencyPass:true,review:{complete:true,voiceBlind:{complete:true,pass:true}},npcAcceptance:{complete:true,requirements:scenarios[0].requirements.map(id=>({id,pass:true,evidence:[]}))}};
    assert.equal(summarizeNpcAcceptance([],scenarios).thresholdReached,false);
    assert.equal(summarizeNpcAcceptance([{...row,npcAcceptance:null}],scenarios).measured,0);
    assert.equal(summarizeNpcAcceptance([row],scenarios).thresholdReached,true);
    const warning={...row,consistencyPass:false};assert.equal(summarizeNpcAcceptance([warning],scenarios).passed,0);
    const leak=structuredClone(row);leak.npcAcceptance.requirements.find(r=>r.id==='N6').pass=false;
    const report=summarizeNpcAcceptance([leak],scenarios);assert.ok(report.ratio>.9);assert.equal(report.thresholdReached,false);
    assert.equal(summarizeNpcAcceptance([row,row],scenarios,2).thresholdReached,false,'重复同次报告不计两次实跑');
});

test('匿名盲辨和十天离屏有独立门槛',()=>{
    const scenarios=[{id:'voice',requirements:['N12']},{id:'away',requirements:['N17']}];
    const results=scenarios.map(s=>({id:s.id,attempt:1,ledgerPass:true,consistencyPass:true,review:{complete:true},npcAcceptance:{complete:true,requirements:s.requirements.map(id=>({id,pass:true}))}}));
    const report=summarizeNpcAcceptance(results,scenarios);assert.equal(report.rows[0].pass,false);assert.equal(report.offscreenPass,true);assert.equal(report.thresholdReached,false);
});

test('逐N审查必须引用真实回复或执行证据，玩家请求不算已实现',async()=>{
    const result={id:'private',attempt:1,turns:[{index:0,input:'你应当不知道',visible:'我不知道这件事。',calls:[],assertions:[]}]},scenario={requirements:['N6'],rubric:{continuity:'无关人物不能知道私密行为'}};
    const client=quote=>({generate:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({requirements:[{id:'N6',pass:true,reason:'明确不知道',evidence:[{turn:0,quote}]}]})}}]})});
    assert.equal((await reviewNpcRequirements(client('我不知道这件事。'),result,scenario)).complete,true);
    assert.equal((await reviewNpcRequirements(client('你应当不知道'),result,scenario)).complete,false);
    assert.equal((await reviewNpcRequirements(client('捏造引文'),result,scenario)).complete,false);
});

test('逐N分开输出并保留失败原文，缺项、length、重复编号与伪引文均未通过',async()=>{
    const result={id:'many',attempt:1,turns:[{index:0,input:'请求',visible:'真实话语',calls:[],assertions:[],sceneBeforeReply:'场景旧事'}]};
    const row=id=>({id,pass:true,reason:'有证据',evidence:[{turn:0,quote:'真实话语'}]});
    let count=0;
    const good=await reviewNpcRequirements({async generate(body){
        const input=JSON.parse(body.messages[1].content),ids=Object.keys(input.requirements);
        assert.equal(ids.length,1);assert.equal(input.turns[0].sceneBeforeReply,'场景旧事');count++;
        return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({requirements:[row(ids[0])]})}}]};
    }},result,{requirements:['N1','N6','N16','N17']});
    assert.equal(count,4);assert.equal(good.complete,true);assert.equal(good.requirements.length,4);
    for(const value of [[],[row('N6'),row('N6')],[row('N16')],[{...row('N6'),evidence:[{turn:1,quote:'真实话语'}]}],[{...row('N6'),evidence:[{turn:0,quote:'场景旧事'}]}]]){
        const raw=JSON.stringify({requirements:value});
        const bad=await reviewNpcRequirements({async generate(){return {choices:[{finish_reason:'stop',message:{content:raw}}]};}},result,{requirements:['N6']});
        assert.equal(bad.complete,false);assert.equal(bad.requirements.length,0);assert.equal(bad.parts[0].rawReview,raw);
    }
    let calls=0;
    const partial=await reviewNpcRequirements({async generate(){return calls++?{choices:[{finish_reason:'length',message:{content:'截断原文'}}]}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify({requirements:[row('N6')]})}}]};}},result,{requirements:['N6','N16']});
    assert.equal(partial.complete,false);assert.equal(partial.requirements.length,1);assert.equal(partial.parts[1].rawReview,'截断原文');assert.match(partial.error,/length/);
    const forbidden={async generate(){assert.fail('无效输入不应调用模型');}};
    assert.equal((await reviewNpcRequirements(forbidden,result,{requirements:['N6','N6']})).complete,false);
    assert.equal((await reviewNpcRequirements(forbidden,{...result,turns:[{...result.turns[0],index:1}]},{requirements:['N6']})).complete,false);
});
