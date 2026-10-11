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
