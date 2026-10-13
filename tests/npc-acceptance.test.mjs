import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewNpcRequirements,summarizeNpcAcceptance} from '../tools/npc-acceptance.mjs';
import {playtestAcceptance,playtestExitCode,toolSelectionMetrics} from '../tools/playtest-metrics.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

function fixture(ids=Array.from({length:17},(_,i)=>'N'+(i+1))){
    const speakers=['npc_a','npc_b','npc_c'];
    const scenario={id:'all',requirements:ids,turns:[{input:'移动',expectedTools:['world_move']},{input:'交谈'}],
        rubric:{blindVoice:{speakers,turns:[0,1],minimumPerSpeaker:2}}};
    const samples=[0,1].flatMap(turn=>speakers.map((speaker,i)=>({id:`sample_${turn}_${i}`,speaker,turn,text:'真实话语',
        expected:`candidate_${i+1}`,predicted:`candidate_${i+1}`,pass:true,reason:'风格吻合'})));
    const row={id:'all',attempt:1,assertions:10,passed:10,ledgerPass:true,consistencyPass:true,review:{complete:true,voiceBlind:{
        complete:true,pass:true,shuffleSeed:'mock-fixed',candidates:speakers.map((name,i)=>({id:`candidate_${i+1}`,name})),
        samples,total:6,correct:6,accuracy:1}},npcAcceptance:{complete:true,requirements:ids.map(id=>({id,pass:true,reason:'真实证据',evidence:[{turn:0,quote:'真实话语'}]}))},
        turns:[0,1].map(index=>({index,input:scenario.turns[index].input,reply:speakers.map(id=>`<q who="${id}">真实话语</q>`).join(''),
            calls:index===0?[{tool:'world_move',args:{destination:'酒馆'},result:{ok:true}}]:[],assertions:[]}))};
    return {scenario,row};
}

test('N类标签、账本正确或空审核都不能单独变成验收通过',()=>{
    const {scenario,row}=fixture(),scenarios=[scenario];
    assert.equal(summarizeNpcAcceptance([],scenarios).thresholdReached,false);
    assert.equal(summarizeNpcAcceptance([{...row,npcAcceptance:null}],scenarios).measured,0);
    assert.equal(summarizeNpcAcceptance([row],scenarios).thresholdReached,true);
    const empty=structuredClone(row);empty.npcAcceptance.requirements.forEach(n=>n.evidence=[]);
    assert.equal(summarizeNpcAcceptance([empty],scenarios).measured,0,'complete标签不代替实际引文');
    const warning={...row,consistencyPass:false};assert.equal(summarizeNpcAcceptance([warning],scenarios).passed,17);
    assert.equal(summarizeNpcAcceptance([warning],scenarios).thresholdReached,false,'全场一致性状态独立保留');
    const leak=structuredClone(row);leak.npcAcceptance.requirements.find(r=>r.id==='N6').pass=false;
    const report=summarizeNpcAcceptance([leak],scenarios);assert.ok(report.ratio>.9);assert.equal(report.thresholdReached,false);assert.equal(report.privacy.zeroLeakage,false);
    assert.equal(summarizeNpcAcceptance([row,row],scenarios,2).thresholdReached,false,'重复同次报告不计两次实跑');
});

test('匿名盲辨和十天离屏有独立门槛',()=>{
    const scenarios=[{id:'voice',requirements:['N12']},{id:'away',requirements:['N17']}];
    const results=scenarios.map(s=>({...fixture(s.requirements).row,id:s.id,review:{complete:true}}));
    const report=summarizeNpcAcceptance(results,scenarios);assert.equal(report.rows[0].pass,false);assert.equal(report.offscreenPass,true);assert.equal(report.thresholdReached,false);
});

test('M2联合门槛保留12个有效N、90%N通过率、100%账本和强制项，报告与进程退出一致',()=>{
    const ids=['N1','N2','N3','N4','N5','N6','N7','N8','N9','N12','N16','N17'];
    const {scenario,row}=fixture(ids);
    const build=(result=row,extra=[])=>({milestone:'M2',complete:true,m2:summarizeNpcAcceptance([result,...extra],[scenario]),toolSelection:toolSelectionMetrics([result],[scenario])});
    const good=build();assert.equal(good.m2.measured,12);assert.equal(good.m2.ratioDenominator,12);assert.equal(playtestAcceptance(good),true);
    const oneFail=structuredClone(row);oneFail.npcAcceptance.requirements[0].pass=false;
    assert.equal(build(oneFail).m2.ratio,11/12);assert.equal(playtestAcceptance(build(oneFail)),true);
    oneFail.npcAcceptance.requirements[1].pass=false;assert.equal(playtestAcceptance(build(oneFail)),false);
    const extraLedger={id:'ledger',attempt:1,assertions:90,passed:80,turns:[]};
    assert.equal(build(row,[extraLedger]).m2.ledger.ratio,.9);assert.equal(playtestAcceptance(build(row,[extraLedger])),false);
    extraLedger.passed=89;assert.equal(playtestAcceptance(build(row,[extraLedger])),false,'N证据全过也不能掩盖任何一条账本失败');
    extraLedger.passed=90;extraLedger.consistencyPass=true;extraLedger.review={complete:true};assert.equal(playtestAcceptance(build(row,[extraLedger])),true);
    const failures=[];
    for(const mutate of [
        r=>r.npcAcceptance.requirements.find(n=>n.id==='N6').pass=false,
        r=>r.npcAcceptance.requirements.find(n=>n.id==='N16').pass=false,
        r=>r.npcAcceptance.requirements.find(n=>n.id==='N17').pass=false,
        r=>r.npcAcceptance.requirements.find(n=>n.id==='N12').pass=false,
        r=>r.npcAcceptance.requirements.find(n=>n.id==='N3').evidence=[],
        r=>r.npcAcceptance.requirements.find(n=>n.id==='N3').evidence[0].quote='未发生的事',
        r=>r.review.voiceBlind={complete:true,pass:true},
        r=>r.review.voiceBlind.samples.pop(),
        r=>r.turns.pop(),
        r=>r.consistencyIssues=[{category:'knowledge',severity:'warning',quote:'泄漏原文'}],
        r=>r.turns[0].calls=[],
    ]){const bad=structuredClone(row);mutate(bad);const report=build(bad);assert.equal(playtestAcceptance(report),false);failures.push(report);}
    for(const report of [good,...failures]){
        const expected=playtestAcceptance(report)?0:1;assert.equal(playtestExitCode(report),expected);
        const process=spawnSync(globalThis.process.execPath,['--input-type=module','-e',
            'import {playtestExitCode} from "./tools/playtest-metrics.mjs";process.exitCode=playtestExitCode(JSON.parse(process.argv[1]));',JSON.stringify(report)],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
        assert.equal(process.status,expected,process.error?.message??process.stderr);
    }
    const short=fixture(ids.filter(id=>id!=='N1'));assert.equal(summarizeNpcAcceptance([short.row],[short.scenario]).thresholdReached,false);
    const noPrivacy=fixture(ids.filter(id=>id!=='N6'));const untested=summarizeNpcAcceptance([noPrivacy.row],[noPrivacy.scenario]);
    assert.equal(untested.privacy.measurement,'not-measured');assert.equal(untested.privacy.zeroLeakage,false);
});

test('未测与未通过分开，匿名盲辨误辨为有效失败而非缺证',()=>{
    const {scenario,row}=fixture();
    const sample=row.review.voiceBlind.samples[0];sample.predicted='unknown';sample.pass=false;
    Object.assign(row.review.voiceBlind,{pass:false,correct:5,accuracy:5/6});
    const report=summarizeNpcAcceptance([row],[scenario]);assert.equal(report.measured,17);assert.equal(report.passed,16);assert.equal(report.unmeasured,0);
    row.review.voiceBlind.samples.pop();const missing=summarizeNpcAcceptance([row],[scenario]);
    assert.equal(missing.measured,16);assert.equal(missing.unmeasured,1);assert.equal(missing.ratio,1);assert.equal(missing.thresholdReached,false);
    assert.equal(summarizeNpcAcceptance([],[]).ratio,null);
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
        assert.equal(body.max_tokens,8192);assert.equal(body.thinking.type,'enabled');assert.equal(body.reasoning_effort,'low');
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
    assert.equal(calls,2,'截断分项不自动重试');
    const forbidden={async generate(){assert.fail('无效输入不应调用模型');}};
    assert.equal((await reviewNpcRequirements(forbidden,result,{requirements:['N6','N6']})).complete,false);
    assert.equal((await reviewNpcRequirements(forbidden,{...result,turns:[{...result.turns[0],index:1}]},{requirements:['N6']})).complete,false);
});

test('N12/N16/N17使用8192读取全部回合并返回完整长审核，合法JSON若length仍失败',async()=>{
    const turns=Array.from({length:7},(_,index)=>({index,input:`请求${index}`,visible:`真实回复${index}`,calls:[],assertions:[],
        sceneBefore:{index},sceneBeforeReply:{index},consistency:{status:'verified'},turnResult:{index}}));
    const result={id:'long-review',attempt:1,turns},ids=['N12','N16','N17'],labels=[];
    const reason='依据全部真实回复和执行记录判断。'.repeat(600);
    const client={async generate(body,label){
        assert.equal(body.max_tokens,8192);assert.equal(body.thinking.type,'enabled');assert.equal(body.reasoning_effort,'low');
        assert.deepEqual(body.response_format,{type:'json_object'});
        const input=JSON.parse(body.messages[1].content),[id]=Object.keys(input.requirements);labels.push(label);
        assert.equal(Object.keys(input.requirements).length,1);assert.equal(input.turns.length,turns.length);
        for(const [index,turn]of input.turns.entries()){
            assert.equal(turn.reply,turns[index].visible);assert.deepEqual(turn.calls,turns[index].calls);
            assert.deepEqual(turn.assertions,turns[index].assertions);assert.deepEqual(turn.sceneBeforeReply,turns[index].sceneBeforeReply);
            assert.deepEqual(turn.consistency,turns[index].consistency);assert.deepEqual(turn.turnResult,turns[index].turnResult);
        }
        return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({requirements:[{id,pass:true,reason,
            evidence:[{turn:0,quote:'真实回复0'},{turn:6,quote:'真实回复6'}]}]})}}]};
    }};
    const review=await reviewNpcRequirements(client,result,{requirements:ids});
    assert.equal(review.complete,true);assert.deepEqual(review.requirements.map(r=>r.id),ids);
    assert.ok(review.requirements.every(r=>r.reason===reason&&r.evidence.length===2));assert.equal(labels.length,3);
    let calls=0;
    const truncated=await reviewNpcRequirements({async generate(body,label){calls++;const response=await client.generate(body,label);
        response.choices[0].finish_reason='length';return response;}},result,{requirements:ids});
    assert.equal(calls,3);assert.equal(truncated.complete,false);assert.deepEqual(truncated.requirements,[]);
    assert.ok(truncated.parts.every(p=>p.finishReason==='length'&&p.rawReview.includes(reason)));
});

const t64=()=>JSON.parse(readFileSync(new URL('../docs/测试报告/M2-recheck/真实试玩.json',import.meta.url),'utf8'));
// Exact scenario inputs from the T64 report's recorded commit 4570edb3.
const t64Scenarios=report=>{const frozen=JSON.parse(readFileSync(new URL('fixtures/t64-scenarios.json',import.meta.url),'utf8'));return report.results.map(r=>frozen.find(s=>s.id===r.id));};

test('T64原对象离线去连坐，149/170账本及7/9盲辨仍独立拒绝整体',()=>{
    const raw=t64(),report=summarizeNpcAcceptance(raw.results,t64Scenarios(raw));
    const row=id=>report.rows.find(r=>r.id===id);
    assert.equal(report.measured,12);assert.ok(report.passed>0&&report.passed<=9);
    for(const id of ['N3','N4','N10','N11','N13','N15','N16'])assert.equal(row(id).pass,true,id);
    assert.equal(row('N6').measured,false,'4/8回合仍未完成');
    const courier=raw.results.find(r=>r.id==='npc_courier');
    assert.equal(courier.finalDocument.state.npcs.npc_hw_linsui.inventory.item_bread,6);
    assert.equal(row('N5').pass,false);assert.ok(row('N5').failures.some(f=>f.condition==='related-assertion'));
    assert.equal(row('N12').pass,false);assert.ok(row('N12').failures.some(f=>f.condition==='blind-failed'&&f.correct===7&&f.total===9));
    assert.equal(row('N17').pass,false);assert.ok(row('N17').failures.some(f=>f.condition==='requirement-failed'));
    assert.deepEqual(report.ledger,{measurement:'measured',assertions:170,passed:149,ratio:149/170,thresholdReached:false});
    assert.equal(playtestAcceptance({...raw,m2:report}),false);
    const quest=raw.results.find(r=>r.id==='npc_quest_social');
    assert.equal(quest.turns[1].assertions.some(a=>!a.pass),true);
    assert.equal(row('N16').pass,true,'首轮发布断言失败不否决后来的消息认知');
});

test('本项关联矛盾和前置行动失败保留，同回合无关句子及其他N审核缺失不连坐',()=>{
    const {scenario,row}=fixture(['N3','N13']);
    row.npcAcceptance.complete=false;row.npcAcceptance.requirements.pop();
    row.npcAcceptance.parts=[{id:'N3',complete:true},{id:'N13',complete:false,error:'length'}];
    row.review={complete:false};row.consistencyPass=false;
    row.turns[0].consistency={issues:[{category:'fact',severity:'warning',quote:'另一句风景描写',reason:'无来源'}]};
    let report=summarizeNpcAcceptance([row],[scenario]);
    assert.equal(report.rows[0].measured,true);assert.equal(report.rows[0].pass,true);assert.equal(report.rows[1].measured,false);
    row.turns[0].consistency.issues.push({category:'fact',severity:'warning',quote:'真实话语',reason:'与工具回执矛盾'});
    report=summarizeNpcAcceptance([row],[scenario]);assert.equal(report.rows[0].pass,false);assert.equal(report.rows[0].failures[0].condition,'related-consistency');
    row.turns[0].consistency.issues=[];row.turns[1].assertions=[{kind:'equals',pass:false,actual:0,value:1}];
    assert.equal(summarizeNpcAcceptance([row],[scenario]).rows[0].pass,true,'无关联的其他回合断言不否决N3');
    row.npcAcceptance.requirements[0].prerequisiteTurns=[1];
    report=summarizeNpcAcceptance([row],[scenario]);assert.equal(report.rows[0].pass,false);assert.ok(report.rows[0].sessions[0].relatedTurns.includes(1));
    row.npcAcceptance.requirements[0].prerequisiteTurns=[99];assert.equal(summarizeNpcAcceptance([row],[scenario]).rows[0].measured,false);
});

test('N12交流请求不索要盲辨，续跑不重抽已完成的逐N负评',async()=>{
    const raw=t64(),result=raw.results.find(r=>r.id==='npc_voices'),scenario=t64Scenarios(raw).find(s=>s.id===result.id);
    let calls=0;
    const reviewed=await reviewNpcRequirements({async generate(body){
        calls++;const input=JSON.parse(body.messages[1].content);
        assert.equal(input.rubric.blindVoice,undefined);assert.doesNotMatch(input.requirements.N12,/去姓名/);
        assert.match(input.rubric.continuity,/不在此请求索要/);
        return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({requirements:[{...result.npcAcceptance.requirements[0],pass:true,reason:'三人实际在场交流'}]})}}]};
    }},result,scenario,{previousReview:null});
    assert.equal(calls,1);assert.equal(reviewed.requirements[0].pass,true);
    const copy=structuredClone(result);copy.npcAcceptance=reviewed;
    const summary=summarizeNpcAcceptance([copy],[scenario]);assert.equal(summary.rows[0].pass,false,'交流通过仍不能豁免7/9盲辨');
    const preserved=await reviewNpcRequirements({async generate(){assert.fail('完成的负评不能重抽');}},result,scenario);
    assert.deepEqual(preserved.requirements,result.npcAcceptance.requirements);
});
